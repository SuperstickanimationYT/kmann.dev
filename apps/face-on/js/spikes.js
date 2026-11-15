import { median, nearest } from './filters.js';

const BINS = 360;
const HALF = BINS / 2;
const LEARN_PEAK = 4;
const MAX_SPIKE_LINES = 4;
const PEAK_SPREAD = 4;
const MIN_SPIKE_GAP = 10;
const MIN_SPIKE_LINES = 2;
const TEACHER_PEAK = 4;
const MATCH_WINDOW = 2;
const SPIKE_HIT = 2.5;
const SPIKE_MEAN = 3.5;
const MISSES_TO_END = 8;

function ringStart(core) {
  return 2.5 * core + 2;
}

function ringEnd(core) {
  return ringStart(core) + Math.max(15, 8 * core);
}

function angularProfile(light, width, height, x, y, inner, outer) {
  const profile = new Float32Array(BINS);
  for (let bin = 0; bin < BINS; bin += 1) {
    const angle = (bin * Math.PI) / HALF;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let sum = 0;
    let n = 0;
    for (let r = inner; r <= outer; r += 1) {
      const sx = Math.round(x + dx * r);
      const sy = Math.round(y + dy * r);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
      sum += light[sy * width + sx];
      n += 1;
    }
    profile[bin] = n ? sum / n : NaN;
  }
  return profile;
}

function standardised(profile) {
  const finite = Array.from(profile).filter(Number.isFinite);
  const middle = median(finite);
  const spread = Math.max(1e-6, 1.4826 * median(finite.map((v) => Math.abs(v - middle))));
  return Array.from(profile, (v) => (Number.isFinite(v) ? (v - middle) / spread : 0));
}

function fits(width, height, x, y, reach) {
  return x - reach >= 0 && y - reach >= 0 && x + reach < width && y + reach < height;
}

function isAngularPeak(values, bin) {
  const n = values.length;
  for (let d = 1; d <= PEAK_SPREAD; d += 1) {
    if (values[(bin + d) % n] > values[bin] || values[(bin - d + n) % n] > values[bin]) return false;
  }
  return true;
}

export function learnSpikeAngles(light, width, height, stars) {
  const folded = new Float32Array(HALF);
  let used = 0;
  for (const { x, y, core } of stars) {
    if (!fits(width, height, x, y, ringEnd(core))) continue;
    const z = standardised(angularProfile(light, width, height, x, y, ringStart(core), ringEnd(core)));
    const paired = Array.from({ length: HALF }, (_, bin) => Math.min(z[bin], z[bin + HALF]));
    if (Math.max(...paired) < TEACHER_PEAK) continue;
    for (let bin = 0; bin < HALF; bin += 1) folded[bin] += paired[bin];
    used += 1;
  }
  if (!used) return [];
  const z = standardised(circularSmooth(folded));
  const strongest = z
    .map((value, bin) => ({ value, bin }))
    .filter(({ value, bin }) => value > LEARN_PEAK && isAngularPeak(z, bin))
    .sort((a, b) => b.value - a.value);
  const kept = [];
  for (const { bin } of strongest) {
    if (kept.length < MAX_SPIKE_LINES && kept.every((other) => circularGap(other, bin, HALF) >= MIN_SPIKE_GAP)) kept.push(bin);
  }
  return kept.length >= MIN_SPIKE_LINES ? kept : [];
}

function circularSmooth(values) {
  const n = values.length;
  return Array.from(values, (_, bin) => (values[(bin - 1 + n) % n] + values[bin] + values[(bin + 1) % n]) / 3);
}

function circularGap(a, b, period) {
  const gap = Math.abs(a - b) % period;
  return Math.min(gap, period - gap);
}

function strongestNear(z, bin) {
  let best = -Infinity;
  for (let d = -MATCH_WINDOW; d <= MATCH_WINDOW; d += 1) best = Math.max(best, z[(bin + d + BINS) % BINS]);
  return best;
}

export function hasSpikes(light, width, height, x, y, core, angles) {
  const z = standardised(angularProfile(light, width, height, x, y, ringStart(core), ringEnd(core)));
  const strengths = angles.flatMap((angle) => [strongestNear(z, angle), strongestNear(z, angle + HALF)]);
  const hits = strengths.filter((v) => v > SPIKE_HIT).length;
  const mean = strengths.reduce((sum, v) => sum + v, 0) / strengths.length;
  return hits >= strengths.length * 0.75 && mean >= SPIKE_MEAN;
}

function paintAcross(layer, px, py, nx, ny, halfWidth, side) {
  const { width, height } = layer;
  for (const key of ['r', 'g', 'b']) {
    const channel = layer[key];
    const left = nearest(channel, width, height, px - nx * side, py - ny * side);
    const right = nearest(channel, width, height, px + nx * side, py + ny * side);
    for (let s = -halfWidth; s <= halfWidth; s += 0.5) {
      const qx = Math.round(px + nx * s);
      const qy = Math.round(py + ny * s);
      if (qx < 0 || qy < 0 || qx >= width || qy >= height) continue;
      const fill = left + ((right - left) * (s + side)) / (2 * side);
      const i = qy * width + qx;
      if (fill < channel[i]) channel[i] = fill;
    }
  }
}

export function paintSpikes(layer, light, x, y, reach, core, angles, noise) {
  const { width, height } = layer;
  const halfWidth = Math.max(1.5, core * 0.4);
  const side = halfWidth + 2;
  const longest = Math.min(Math.max(width, height), reach * 15);
  for (const bin of angles) {
    const angle = (bin * Math.PI) / HALF;
    for (const direction of [1, -1]) {
      const ux = Math.cos(angle) * direction;
      const uy = Math.sin(angle) * direction;
      const nx = -uy;
      const ny = ux;
      let misses = 0;
      for (let t = reach * 0.5; t <= longest; t += 0.5) {
        const px = x + ux * t;
        const py = y + uy * t;
        if (px < 0 || py < 0 || px >= width || py >= height) break;
        const on = nearest(light, width, height, px, py);
        const beside = (nearest(light, width, height, px - nx * side, py - ny * side) + nearest(light, width, height, px + nx * side, py + ny * side)) / 2;
        if (on - beside < noise * 2) {
          misses += 1;
          if (misses > MISSES_TO_END) break;
          continue;
        }
        misses = 0;
        paintAcross(layer, px, py, nx, ny, halfWidth, side);
      }
    }
  }
}
