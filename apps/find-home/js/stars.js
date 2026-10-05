import {
  fromGalactic, fromHeliocentric, GALAXY_HALF_HEIGHT, GALAXY_RADIUS, LY_PER_PC, oldShape, positionSeenAt,
  sampleArmMap, SUN_PECULIAR, SUN_POSITION, velocityFromHeliocentric, youngShape,
} from './milky-way.js';
import { ALL_BINS, colourIndex, luminosityOf, YOUNG_BINS } from './population.js';
import { createRandom } from './random.js';

export const STAR_FLOATS = 6;
export const KIND = { field: 0, cluster: 1, catalogue: 2, sun: 3 };

const NEARBY_BYTES = 24;
const NEARBY_REACH = 1000;
const NEARBY_LIMIT = 6.5;
const CLUSTER_LIGHT_PER_IONIZING = 2e5 / 1e50;
const MAX_POISSON_EXACT = 30;
const CROWDING_SAMPLES = 160;

export const SUN_ABSOLUTE = 4.83;
export const SUN_VELOCITY = velocityFromHeliocentric(SUN_PECULIAR);

const YOUNG_LOCAL_LIGHT = YOUNG_BINS.reduce((sum, bin) => sum + bin.density * luminosityOf(bin.absolute), 0);

export function nebulaRadius(nebula) {
  return nebula.radius ?? 5 * Math.cbrt(nebula.ionizing / 1e49);
}

export async function loadNearbyStars(url, namesUrl) {
  const [buffer, names] = await Promise.all([fetch(url).then((r) => r.arrayBuffer()), fetch(namesUrl).then((r) => r.json())]);
  const packed = new DataView(buffer);
  const stars = [];
  for (let at = 0; at < buffer.byteLength; at += NEARBY_BYTES) {
    const float = (offset) => packed.getFloat32(at + offset, true);
    const short = (offset) => packed.getInt16(at + offset, true);
    stars.push({
      position: fromHeliocentric([float(0), float(4), float(8)]),
      velocity: velocityFromHeliocentric([short(12) / 10, short(14) / 10, short(16) / 10]),
      absolute: short(18) / 1000,
      colour: short(20) / 1000,
      name: names[at / NEARBY_BYTES] ?? null,
    });
  }
  return stars;
}

function hashCell(x, y, z, salt) {
  let h = Math.imul(salt ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (x | 0) ^ (h >>> 13), 0xc2b2ae35);
  h = Math.imul(h ^ (y | 0) ^ (h >>> 16), 0x27d4eb2f);
  h = Math.imul(h ^ (z | 0) ^ (h >>> 15), 0x165667b1);
  return (h ^ (h >>> 16)) >>> 0;
}

function poisson(random, mean) {
  if (mean > MAX_POISSON_EXACT) return Math.max(0, Math.round(mean + Math.sqrt(mean) * random.normal()));
  const threshold = Math.exp(-mean);
  let count = 0;
  let product = random.next();
  while (product > threshold) {
    count++;
    product *= random.next();
  }
  return count;
}

function boxRange(origin, reach) {
  const low = [-GALAXY_RADIUS, -GALAXY_RADIUS, -GALAXY_HALF_HEIGHT];
  const high = [GALAXY_RADIUS, GALAXY_RADIUS, GALAXY_HALF_HEIGHT];
  return origin.map((value, axis) => [Math.max(low[axis], value - reach), Math.min(high[axis], value + reach)]);
}

function forEachCellInSphere(centre, radius, size, visit) {
  const range = boxRange(centre, radius);
  if (range.some(([low, high]) => low > high)) return;
  const [[x0, x1], [y0, y1], [z0, z1]] = range.map(([low, high]) => [Math.floor(low / size), Math.floor(high / size)]);
  const reach = radius + 0.87 * size;
  for (let ix = x0; ix <= x1; ix++) {
    const dx = (ix + 0.5) * size - centre[0];
    for (let iy = y0; iy <= y1; iy++) {
      const dy = (iy + 0.5) * size - centre[1];
      for (let iz = z0; iz <= z1; iz++) {
        const dz = (iz + 0.5) * size - centre[2];
        if (dx * dx + dy * dy + dz * dz <= reach * reach) visit(ix, iy, iz);
      }
    }
  }
}

function axisSpanInGalaxy(apex, axis, reach, margin) {
  let near = 0;
  let far = reach;
  const half = [GALAXY_RADIUS + margin, GALAXY_RADIUS + margin, GALAXY_HALF_HEIGHT + margin];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(axis[i]) < 1e-12) {
      if (Math.abs(apex[i]) > half[i]) return null;
      continue;
    }
    let t0 = (-half[i] - apex[i]) / axis[i];
    let t1 = (half[i] - apex[i]) / axis[i];
    if (t0 > t1) [t0, t1] = [t1, t0];
    near = Math.max(near, t0);
    far = Math.min(far, t1);
  }
  return near < far ? [near, far] : null;
}

function forEachCellInCone(apex, axis, tanHalf, reach, size, visit) {
  const span = axisSpanInGalaxy(apex, axis, reach, reach * tanHalf + size);
  if (!span) return;
  const [near, far] = span;
  const main = [0, 1, 2].reduce((best, i) => (Math.abs(axis[i]) > Math.abs(axis[best]) ? i : best), 0);
  const [side, other] = [0, 1, 2].filter((i) => i !== main);
  const slope = Math.abs(axis[main]);
  const ends = [apex[main] + axis[main] * near, apex[main] + axis[main] * far];
  const firstLayer = Math.floor((Math.min(...ends) - size) / size);
  const lastLayer = Math.floor((Math.max(...ends) + size) / size);
  const cell = [0, 0, 0];
  for (let layer = firstLayer; layer <= lastLayer; layer++) {
    const along = ((layer + 0.5) * size - apex[main]) / axis[main];
    const spread = (Math.max(0, along) * tanHalf + 0.87 * size) / slope + size;
    const centreSide = apex[side] + axis[side] * along;
    const centreOther = apex[other] + axis[other] * along;
    const side0 = Math.floor((centreSide - spread) / size);
    const side1 = Math.floor((centreSide + spread) / size);
    const other0 = Math.floor((centreOther - spread) / size);
    const other1 = Math.floor((centreOther + spread) / size);
    cell[main] = layer;
    for (let a = side0; a <= side1; a++) {
      cell[side] = a;
      for (let b = other0; b <= other1; b++) {
        cell[other] = b;
        const dx = (cell[0] + 0.5) * size - apex[0];
        const dy = (cell[1] + 0.5) * size - apex[1];
        const dz = (cell[2] + 0.5) * size - apex[2];
        const t = dx * axis[0] + dy * axis[1] + dz * axis[2];
        if (t < near - size || t > far + size) continue;
        const across2 = dx * dx + dy * dy + dz * dz - t * t;
        const allowed = Math.max(0, t) * tanHalf + 0.87 * size;
        if (across2 <= allowed * allowed) visit(cell[0], cell[1], cell[2]);
      }
    }
  }
}

function createCollector({ camera, axis, tanHalf, limit, nearbyActive }) {
  const values = [];
  const kinds = [];
  const names = [];
  const cosHalf = axis ? 1 / Math.sqrt(1 + tanHalf * tanHalf) : -2;

  const add = (present, velocity, absolute, colour, kind, name = null) => {
    const delay = Math.hypot(present[0] - camera[0], present[1] - camera[1], present[2] - camera[2]) * LY_PER_PC;
    const seen = positionSeenAt(present, velocity, delay);
    const rx = seen[0] - camera[0];
    const ry = seen[1] - camera[1];
    const rz = seen[2] - camera[2];
    const distance = Math.hypot(rx, ry, rz);
    if (distance < 1e-6) return;
    if (absolute + 5 * Math.log10(distance / 10) > limit) return;
    if (axis && (rx * axis[0] + ry * axis[1] + rz * axis[2]) / distance < cosHalf) return;
    values.push(rx, ry, rz, absolute, colour, distance);
    kinds.push(kind);
    names.push(name);
  };

  const shadowedByCatalogue = (present, absolute) => {
    if (!nearbyActive) return false;
    const fromSun = Math.hypot(present[0] - SUN_POSITION[0], present[1] - SUN_POSITION[1], present[2] - SUN_POSITION[2]);
    return fromSun < NEARBY_REACH && absolute + 5 * Math.log10(Math.max(fromSun, 0.1) / 10) < NEARBY_LIMIT;
  };

  return { add, shadowedByCatalogue, count: () => kinds.length, values, kinds, names };
}

function addFieldStars(collector, bin, binIndex, cell, density, ix, iy, iz) {
  const random = createRandom(hashCell(ix, iy, iz, binIndex * 7919 + 13));
  const count = poisson(random, density * bin.density * cell ** 3);
  for (let i = 0; i < count; i++) {
    const present = [(ix + random.next()) * cell, (iy + random.next()) * cell, (iz + random.next()) * cell];
    const absolute = bin.absolute + random.next() - 0.5;
    const colour = colourIndex(absolute, random.next());
    const velocity = [random.normal() * bin.speedSpread, random.normal() * bin.speedSpread, random.normal() * bin.speedSpread * 0.6];
    if (collector.shadowedByCatalogue(present, absolute)) continue;
    collector.add(present, velocity, absolute, colour, KIND.field);
  }
}

function addClusterStars(collector, nebulae, binIndex, bin) {
  nebulae.forEach((nebula, nebulaIndex) => {
    const sigma = nebulaRadius(nebula);
    const random = createRandom(hashCell(nebulaIndex, binIndex, 0, 104729));
    const clusterLight = CLUSTER_LIGHT_PER_IONIZING * nebula.ionizing;
    const count = poisson(random, (clusterLight / YOUNG_LOCAL_LIGHT) * bin.density);
    for (let i = 0; i < count; i++) {
      const present = nebula.present.map((value) => value + sigma * 0.6 * random.normal());
      const absolute = bin.absolute + random.next() - 0.5;
      const velocity = [random.normal() * 3, random.normal() * 3, random.normal() * 2];
      collector.add(present, velocity, absolute, colourIndex(absolute, random.next()), KIND.cluster, nebula.name);
    }
  });
}

function nearestBinIndex(absolute) {
  let best = 0;
  ALL_BINS.forEach((bin, index) => {
    if (Math.abs(bin.absolute - absolute) < Math.abs(ALL_BINS[best].absolute - absolute)) best = index;
  });
  return best;
}

export function placeNebulae(nebulae) {
  return nebulae.map((nebula) => ({ ...nebula, present: fromGalactic(nebula.l, nebula.b, nebula.kpc * 1000) }));
}

function expectedConeCounts(camera, axis, tanHalf, limit, armMap) {
  const span = axisSpanInGalaxy(camera, axis, 1e7, 0);
  if (!span) return ALL_BINS.map(() => 0);
  const [near, far] = span;
  const counts = ALL_BINS.map(() => 0);
  const start = Math.max(near, 1);
  const ratio = (far / start) ** (1 / CROWDING_SAMPLES);
  for (let i = 0; i < CROWDING_SAMPLES; i++) {
    const t0 = start * ratio ** i;
    const t = t0 * Math.sqrt(ratio);
    const length = t0 * (ratio - 1);
    const point = camera.map((value, axisIndex) => value + axis[axisIndex] * t);
    const arm = sampleArmMap(armMap, point[0], point[1]);
    const volume = Math.PI * (t * tanHalf) ** 2 * length;
    const old = oldShape(point, arm);
    const young = youngShape(point, arm);
    ALL_BINS.forEach((bin, binIndex) => {
      if (bin.absolute + 5 * Math.log10(t / 10) > limit) return;
      counts[binIndex] += bin.density * volume * (bin.population === 'young' ? young : old);
    });
  }
  return counts;
}

function binsWithinBudget(expected, budget) {
  let total = 0;
  return expected.map((count) => {
    total += count;
    return total <= budget;
  });
}

export function gatherStars({ camera, axis = null, tanHalf = 0, limit, budget, armMap, nebulae, nearby }) {
  const nearbyActive = nearby.length > 0;
  const collector = createCollector({ camera, axis, tanHalf, limit, nearbyActive });
  const affordable = axis ? binsWithinBudget(expectedConeCounts(camera, axis, tanHalf, limit, armMap), budget) : ALL_BINS.map(() => true);
  const reaches = [];

  ALL_BINS.forEach((bin, binIndex) => {
    const reach = 10 ** ((limit - bin.absolute) / 5 + 1);
    if (!affordable[binIndex] || collector.count() > budget * 1.5) {
      reaches.push(0);
      return;
    }
    const shape = bin.population === 'young' ? youngShape : oldShape;
    const visit = (ix, iy, iz) => {
      const centre = [(ix + 0.5) * bin.cell, (iy + 0.5) * bin.cell, (iz + 0.5) * bin.cell];
      const density = shape(centre, sampleArmMap(armMap, centre[0], centre[1]));
      if (density < 1e-6) return;
      addFieldStars(collector, bin, binIndex, bin.cell, density, ix, iy, iz);
    };
    if (axis) forEachCellInCone(camera, axis, tanHalf, reach, bin.cell, visit);
    else forEachCellInSphere(camera, reach, bin.cell, visit);
    if (bin.population === 'young') addClusterStars(collector, nebulae, binIndex, bin);
    reaches.push(reach);
  });

  const resolved = (absolute) => reaches[nearestBinIndex(absolute)] > 0;
  nearby.forEach((star) => {
    if (resolved(star.absolute)) collector.add(star.position, star.velocity, star.absolute, star.colour, KIND.catalogue, star.name);
  });
  if (resolved(SUN_ABSOLUTE)) collector.add(SUN_POSITION, SUN_VELOCITY, SUN_ABSOLUTE, 0.65, KIND.sun, 'Sun');

  return {
    count: collector.count(),
    values: Float32Array.from(collector.values),
    precise: collector.values,
    kinds: Uint8Array.from(collector.kinds),
    names: collector.names,
    reaches,
  };
}
