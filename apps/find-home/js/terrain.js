export const ANCHOR_METRES = 32768;
export const GROUND_OCTAVES = 15;
export const CRATER_FIRST_OCTAVE = 2;
export const CRATER_LAST_OCTAVE = 10;
export const CRATER_CHANCE = 0.35;
export const COAST_DROP_METRES = 300;
export const COAST_ROUGHNESS = 1.2;
export const COAST_OCTAVES = 8;
export const EYE_HEIGHT_METRES = 2;
const SHARPEST_COAST = 0.002;

const UINT_SCALE = 4294967295;

function hashUint(value) {
  let x = value >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function lattice(x, y, z, seed) {
  const mixed = Math.imul(x >>> 0, 73856093) ^ Math.imul(y >>> 0, 19349663) ^ Math.imul(z >>> 0, 83492791) ^ Math.imul(seed, 2654435761 | 0);
  return hashUint(mixed) / UINT_SCALE;
}

const smooth = (f) => f * f * (3 - 2 * f);
const quintic = (f) => f * f * f * (f * (f * 6 - 15) + 10);
const LATTICE_SHIFT_STEPS = [0.618034, 0.414214, 0.732051];
const latticeShift = (seed) => LATTICE_SHIFT_STEPS.map((step) => ((seed + 1) * step) % 1);
const inShiftedCells = (offset, cell, seed) => {
  const shift = latticeShift(seed);
  return offset.map((value, axis) => value / cell + shift[axis]);
};
const mix = (a, b, t) => a + (b - a) * t;

function octaveCells(anchor, octave) {
  const perAnchor = 2 << octave;
  return anchor.map((cell) => cell * perAnchor);
}

function octaveNoise(cells, offset, cell, seed) {
  const scaled = inShiftedCells(offset, cell, seed);
  const whole = scaled.map(Math.floor);
  const [fx, fy, fz] = scaled.map((value, axis) => quintic(value - whole[axis]));
  const [x, y, z] = whole.map((value, axis) => cells[axis] + value);
  const corner = (dx, dy, dz) => lattice(x + dx, y + dy, z + dz, seed);
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), fx), mix(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), fx), mix(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
    fz,
  );
}

function craterDepth(cells, offset, cell, octave) {
  const scaled = inShiftedCells(offset, cell, octave);
  const whole = scaled.map(Math.floor);
  const [x, y, z] = whole.map((value, axis) => cells[axis] + value);
  if (lattice(x, y, z, 100 + octave) > CRATER_CHANCE) return 0;
  const centre = [200, 300, 400].map((seed, axis) => whole[axis] + 0.3 + 0.4 * lattice(x, y, z, seed + octave));
  const radius = 0.06 + 0.14 * lattice(x, y, z, 500 + octave);
  const distance = Math.hypot(...scaled.map((value, axis) => value - centre[axis])) / radius;
  const bowl = distance < 1 ? distance * distance - 1 : 0;
  const rim = 0.35 * Math.exp(-(((distance - 1) / 0.22) ** 2));
  return 0.2 * radius * cell * (bowl + rim);
}

const octaveFade = (cell, footprint) => Math.min(1, Math.max(0, Math.log2(cell / footprint)));

export function groundDetailMetres(anchor, offset, footprint, roughness, craters) {
  let height = 0;
  for (let octave = 0; octave < GROUND_OCTAVES; octave++) {
    const cell = ANCHOR_METRES / (2 << octave);
    const fade = octaveFade(cell, footprint);
    if (fade <= 0) break;
    const cells = octaveCells(anchor, octave);
    height += fade * roughness * cell * (octaveNoise(cells, offset, cell, octave) - 0.5);
    if (craters > 0 && octave >= CRATER_FIRST_OCTAVE && octave <= CRATER_LAST_OCTAVE) height += fade * craters * craterDepth(cells, offset, cell, octave);
  }
  return height;
}

export function coastNoise(anchor, offset, footprint) {
  let total = 0;
  let amplitude = 0.5;
  for (let octave = 0; octave < COAST_OCTAVES; octave++) {
    const cell = ANCHOR_METRES / (2 << octave);
    const fade = octaveFade(cell, footprint);
    if (fade <= 0) break;
    total += fade * amplitude * (octaveNoise(octaveCells(anchor, octave), offset, cell, 700 + octave) - 0.5);
    amplitude *= 0.5;
  }
  return total;
}

export function mapCoordinates([x, y, z]) {
  return [Math.atan2(y, x) / (2 * Math.PI) + 0.5, 0.5 - Math.asin(Math.max(-1, Math.min(1, z))) / Math.PI];
}

export function sampleMap(map, [u, v]) {
  const fx = u * map.width - 0.5;
  const fy = Math.min(map.height - 1, Math.max(0, v * map.height - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const column = (x) => ((x % map.width) + map.width) % map.width;
  const row = (y) => Math.min(map.height - 1, y);
  const at = (x, y) => map.values[row(y) * map.width + column(x)] / 255;
  return mix(mix(at(x0, y0), at(x0 + 1, y0), tx), mix(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
}

export function landShare(land, uv, anchor, offset, footprint, edgeWidth = SHARPEST_COAST) {
  const alpha = sampleMap(land, uv);
  const nearCoast = 4 * alpha * (1 - alpha);
  const coastline = alpha + COAST_ROUGHNESS * nearCoast * coastNoise(anchor, offset, footprint);
  const t = Math.min(1, Math.max(0, (coastline - (0.5 - edgeWidth)) / (2 * edgeWidth)));
  return smooth(t);
}

export function groundHeightMetres(ground, up, anchor, offset, footprint) {
  const uv = mapCoordinates(up);
  const mapped = (ground.lowKm + sampleMap(ground.heights, uv) * ground.rangeKm) * 1000;
  const land = ground.land ? landShare(ground.land, uv, anchor, offset, footprint) : 1;
  const detail = groundDetailMetres(anchor, offset, footprint, ground.roughness, ground.craters);
  const coast = ground.land ? (land - 0.5) * COAST_DROP_METRES : 0;
  return { height: mapped + detail * land + coast, seaLevel: ground.land ? 0 : -Infinity };
}

export const detailReachKm = (ground) => (ground.roughness * ANCHOR_METRES) / 1000 + (ground.land ? COAST_DROP_METRES / 2000 : 0);

const farthestVisibleKm = (radiusKm, topKm) => 2 * Math.sqrt(2 * radiusKm * Math.max(topKm, 0.001) + topKm * topKm);

export function highestGroundNearKm(ground, up, radiusKm, cameraAltitudeKm) {
  const { heights } = ground;
  const globalTop = ground.lowKm + ground.rangeKm + detailReachKm(ground);
  const reachKm = farthestVisibleKm(radiusKm, globalTop - ground.lowKm + Math.max(cameraAltitudeKm, 0));
  const reach = Math.min(Math.PI, reachKm / radiusKm);
  const [u, v] = mapCoordinates(up);
  const latitude = (0.5 - v) * Math.PI;
  const rowsReach = Math.ceil((reach / Math.PI) * heights.height) + 1;
  const centreRow = Math.floor(v * heights.height);
  const nearPole = Math.abs(latitude) + reach >= Math.PI / 2;
  const columnsReach = nearPole ? heights.width : Math.ceil((reach / Math.cos(Math.abs(latitude) + reach) / (2 * Math.PI)) * heights.width) + 1;
  const centreColumn = Math.floor(u * heights.width);
  let highest = 0;
  for (let row = Math.max(0, centreRow - rowsReach); row <= Math.min(heights.height - 1, centreRow + rowsReach); row++) {
    for (let step = -Math.min(columnsReach, heights.width / 2); step <= Math.min(columnsReach, heights.width / 2); step++) {
      const column = (((centreColumn + step) % heights.width) + heights.width) % heights.width;
      highest = Math.max(highest, heights.values[row * heights.width + column]);
    }
  }
  const mappedTop = ground.lowKm + (highest / 255) * ground.rangeKm;
  return Math.max(mappedTop, ground.land ? 0 : -Infinity) + detailReachKm(ground);
}

export function groundFrame(localKm, radiusKm) {
  const localMetres = localKm.map((value) => value * 1000);
  const anchor = localMetres.map((value) => Math.floor(value / ANCHOR_METRES));
  const fromAnchor = localMetres.map((value, axis) => value - anchor[axis] * ANCHOR_METRES);
  const distance = Math.hypot(...localKm);
  const excess = localKm.reduce((sum, value) => sum + value * value, 0) - radiusKm * radiusKm;
  const altitudeKm = excess / (distance + radiusKm);
  const up = localKm.map((value) => value / distance);
  const surfaceOffset = fromAnchor.map((value, axis) => value - up[axis] * altitudeKm * 1000);
  return { anchor, fromAnchor, excess, altitudeKm, up, surfaceOffset };
}
