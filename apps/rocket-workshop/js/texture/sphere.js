import { createRandom } from './random.js';

const LEVEL_SAMPLES = 1500;

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const bump = (x, center, width) => Math.exp(-(((x - center) / width) ** 2));
export const toDegrees = (radians) => (radians * 180) / Math.PI;

export function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function wrapAngle(radians) {
  return radians - Math.PI * 2 * Math.round(radians / (Math.PI * 2));
}

export function createPoint() {
  return { x: 0, y: 0, z: 0, flat: 0, lat: 0, lon: 0 };
}

export function placePoint(point, x, y) {
  const flat = Math.hypot(x, y);
  point.x = x;
  point.y = y;
  point.z = Math.sqrt(Math.max(0, 1 - flat * flat));
  point.flat = flat;
  point.lat = Math.acos(Math.min(1, flat));
  point.lon = Math.atan2(y, x);
  return point;
}

export function surfacePoint(z, lon) {
  const ring = Math.sqrt(1 - z * z);
  return { x: ring * Math.cos(lon), y: ring * Math.sin(lon), z };
}

export const angleBetween = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z)));

export function rotateAbout(point, axis, angle, out) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = (axis.x * point.x + axis.y * point.y + axis.z * point.z) * (1 - cos);
  const x = point.x * cos + (axis.y * point.z - axis.z * point.y) * sin + axis.x * along;
  const y = point.y * cos + (axis.z * point.x - axis.x * point.z) * sin + axis.y * along;
  const z = point.z * cos + (axis.x * point.y - axis.y * point.x) * sin + axis.z * along;
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

export function forEachDiskPixel(size, visit) {
  const texel = 2 / size;
  const reach = (1 + texel) ** 2;
  const point = createPoint();
  for (let row = 0; row < size; row++) {
    const y = 1 - (row + 0.5) * texel;
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) * texel - 1;
      if (x * x + y * y > reach) continue;
      visit(placePoint(point, x, y), row * size + column);
    }
  }
}

export function sampleLevels(seed, sample) {
  const random = createRandom(seed);
  const point = createPoint();
  const levels = new Float32Array(LEVEL_SAMPLES);
  for (let i = 0; i < LEVEL_SAMPLES; i++) {
    let x;
    let y;
    do {
      x = random.between(-1, 1);
      y = random.between(-1, 1);
    } while (x * x + y * y > 1);
    levels[i] = sample(placePoint(point, x, y));
  }
  return levels.sort();
}

export function levelAt(levels, fraction) {
  if (fraction <= 0) return -Infinity;
  if (fraction >= 1) return Infinity;
  return levels[Math.floor(fraction * (levels.length - 1))];
}
