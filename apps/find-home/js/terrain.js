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
const SHIFTS = Array.from({ length: 1024 }, (_, seed) => LATTICE_SHIFT_STEPS.map((step) => ((seed + 1) * step) % 1));
const mix = (a, b, t) => a + (b - a) * t;

function octaveCells(anchor, octave) {
  const perAnchor = 2 << octave;
  return [anchor[0] * perAnchor, anchor[1] * perAnchor, anchor[2] * perAnchor];
}

function octaveNoise(cells, offset, cell, seed) {
  const shift = SHIFTS[seed];
  const sx = offset[0] / cell + shift[0];
  const sy = offset[1] / cell + shift[1];
  const sz = offset[2] / cell + shift[2];
  const wx = Math.floor(sx);
  const wy = Math.floor(sy);
  const wz = Math.floor(sz);
  const fx = quintic(sx - wx);
  const fy = quintic(sy - wy);
  const fz = quintic(sz - wz);
  const x = cells[0] + wx;
  const y = cells[1] + wy;
  const z = cells[2] + wz;
  return mix(
    mix(mix(lattice(x, y, z, seed), lattice(x + 1, y, z, seed), fx), mix(lattice(x, y + 1, z, seed), lattice(x + 1, y + 1, z, seed), fx), fy),
    mix(mix(lattice(x, y, z + 1, seed), lattice(x + 1, y, z + 1, seed), fx), mix(lattice(x, y + 1, z + 1, seed), lattice(x + 1, y + 1, z + 1, seed), fx), fy),
    fz,
  );
}

function craterDepth(cells, offset, cell, octave) {
  const shift = SHIFTS[octave];
  const sx = offset[0] / cell + shift[0];
  const sy = offset[1] / cell + shift[1];
  const sz = offset[2] / cell + shift[2];
  const wx = Math.floor(sx);
  const wy = Math.floor(sy);
  const wz = Math.floor(sz);
  const x = cells[0] + wx;
  const y = cells[1] + wy;
  const z = cells[2] + wz;
  if (lattice(x, y, z, 100 + octave) > CRATER_CHANCE) return 0;
  const cx = wx + 0.3 + 0.4 * lattice(x, y, z, 200 + octave);
  const cy = wy + 0.3 + 0.4 * lattice(x, y, z, 300 + octave);
  const cz = wz + 0.3 + 0.4 * lattice(x, y, z, 400 + octave);
  const radius = 0.06 + 0.14 * lattice(x, y, z, 500 + octave);
  const distance = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2 + (sz - cz) ** 2) / radius;
  const bowl = distance < 1 ? distance * distance - 1 : 0;
  const rim = 0.35 * Math.exp(-(((distance - 1) / 0.22) ** 2));
  return 0.2 * radius * cell * (bowl + rim);
}

const octaveFade = (cell, footprint) => Math.min(1, Math.max(0, Math.log2(cell / footprint) - 1));

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

export const PATCH_CELLS = 32;
export const PATCH_SIDE = PATCH_CELLS + 1;
export const PATCH_FLOATS = 7;
const PATCH_RING = PATCH_SIDE + 2;
const SKIRT_SHARE_OF_EDGE = 0.02;
const SHALLOWEST_SKIRT_METRES = 2;

export const CUBE_FACES = [
  { normal: [1, 0, 0], across: [0, 1, 0], along: [0, 0, 1] },
  { normal: [-1, 0, 0], across: [0, -1, 0], along: [0, 0, 1] },
  { normal: [0, 1, 0], across: [-1, 0, 0], along: [0, 0, 1] },
  { normal: [0, -1, 0], across: [1, 0, 0], along: [0, 0, 1] },
  { normal: [0, 0, 1], across: [0, 1, 0], along: [-1, 0, 0] },
  { normal: [0, 0, -1], across: [0, 1, 0], along: [1, 0, 0] },
];

export const patchEdgeMetres = (radiusKm, level) => ((Math.PI / 2) * radiusKm * 1000) / 2 ** level;

export function faceDirection(face, s, t) {
  const { normal, across, along } = CUBE_FACES[face];
  const a = Math.tan((s * Math.PI) / 4);
  const b = Math.tan((t * Math.PI) / 4);
  const point = normal.map((value, axis) => value + a * across[axis] + b * along[axis]);
  const length = Math.hypot(...point);
  return point.map((value) => value / length);
}

export function patchCorners({ level, ix, iy }) {
  const span = 2 / 2 ** level;
  return { s: -1 + ix * span, t: -1 + iy * span, span };
}

function surfacePoints(ground, radiusKm, { face, level, ix, iy }) {
  const radius = radiusKm * 1000;
  const { s, t, span } = patchCorners({ level, ix, iy });
  const step = span / PATCH_CELLS;
  const footprint = patchEdgeMetres(radiusKm, level) / PATCH_CELLS;
  const points = new Float64Array(PATCH_RING * PATCH_RING * 3);
  const wet = new Uint8Array(PATCH_RING * PATCH_RING);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let j = 0; j < PATCH_RING; j++) {
    for (let i = 0; i < PATCH_RING; i++) {
      const up = faceDirection(face, s + (i - 1) * step, t + (j - 1) * step);
      const surface = up.map((value) => value * radius);
      const anchor = surface.map((value) => Math.floor(value / ANCHOR_METRES));
      const offset = surface.map((value, axis) => value - anchor[axis] * ANCHOR_METRES);
      const { height, seaLevel } = groundHeightMetres(ground, up, anchor, offset, footprint);
      const top = Math.max(height, seaLevel);
      const index = j * PATCH_RING + i;
      wet[index] = height < seaLevel ? 1 : 0;
      up.forEach((value, axis) => (points[index * 3 + axis] = value * (radius + top)));
      lowest = Math.min(lowest, top);
      highest = Math.max(highest, top);
    }
  }
  return { points, wet, lowest, highest };
}

function outwardNormal(points, i, j) {
  const at = (x, y, axis) => points[(y * PATCH_RING + x) * 3 + axis];
  const east = [0, 1, 2].map((axis) => at(i + 1, j, axis) - at(i - 1, j, axis));
  const north = [0, 1, 2].map((axis) => at(i, j + 1, axis) - at(i, j - 1, axis));
  const normal = [east[1] * north[2] - east[2] * north[1], east[2] * north[0] - east[0] * north[2], east[0] * north[1] - east[1] * north[0]];
  const outward = normal[0] * at(i, j, 0) + normal[1] * at(i, j, 1) + normal[2] * at(i, j, 2) < 0 ? -1 : 1;
  const length = Math.hypot(...normal) * outward;
  return normal.map((value) => value / length);
}

const PATCH_EDGES = [
  (k) => [k, 0],
  (k) => [k, PATCH_CELLS],
  (k) => [0, k],
  (k) => [PATCH_CELLS, k],
];

export function buildPatch(ground, radiusKm, patch) {
  const { points, wet, lowest, highest } = surfacePoints(ground, radiusKm, patch);
  const { s, t, span } = patchCorners(patch);
  const centre = faceDirection(patch.face, s + span / 2, t + span / 2).map((value) => value * (radiusKm * 1000 + (lowest + highest) / 2));
  const skirt = Math.max(SHALLOWEST_SKIRT_METRES, patchEdgeMetres(radiusKm, patch.level) * SKIRT_SHARE_OF_EDGE);
  const vertices = new Float32Array((PATCH_SIDE * PATCH_SIDE + PATCH_EDGES.length * PATCH_SIDE) * PATCH_FLOATS);
  let farthest = 0;
  const write = (vertex, i, j, drop) => {
    const ring = (j + 1) * PATCH_RING + i + 1;
    const point = [0, 1, 2].map((axis) => points[ring * 3 + axis]);
    const fromCentre = Math.hypot(...point);
    const placed = point.map((value, axis) => value - (value / fromCentre) * drop - centre[axis]);
    farthest = Math.max(farthest, Math.hypot(...placed));
    vertices.set([...placed, ...outwardNormal(points, i + 1, j + 1), wet[ring]], vertex * PATCH_FLOATS);
  };
  for (let j = 0; j < PATCH_SIDE; j++) for (let i = 0; i < PATCH_SIDE; i++) write(j * PATCH_SIDE + i, i, j, 0);
  PATCH_EDGES.forEach((edgeVertex, edge) => {
    for (let k = 0; k < PATCH_SIDE; k++) write(PATCH_SIDE * PATCH_SIDE + edge * PATCH_SIDE + k, ...edgeVertex(k), skirt);
  });
  return { vertices, centreKm: centre.map((value) => value / 1000), boundKm: farthest / 1000, spacingMetres: patchEdgeMetres(radiusKm, patch.level) / PATCH_CELLS };
}

export function patchIndices() {
  const indices = [];
  const at = (i, j) => j * PATCH_SIDE + i;
  for (let j = 0; j < PATCH_CELLS; j++) {
    for (let i = 0; i < PATCH_CELLS; i++) indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j), at(i + 1, j + 1), at(i, j + 1));
  }
  PATCH_EDGES.forEach((edgeVertex, edge) => {
    const skirtAt = (k) => PATCH_SIDE * PATCH_SIDE + edge * PATCH_SIDE + k;
    for (let k = 0; k < PATCH_CELLS; k++) {
      const top = at(...edgeVertex(k));
      const nextTop = at(...edgeVertex(k + 1));
      indices.push(top, nextTop, skirtAt(k + 1), top, skirtAt(k + 1), skirtAt(k));
    }
  });
  return new Uint16Array(indices);
}
