import { createRandom } from './random.js';
import { bump, smoothstep, surfacePoint, wrapAngle } from './sphere.js';

const STREAM = 0xc4a7;
const CRATERS_PER_COUNT = 5;
const SMALLEST = 0.012;
const LARGEST = 0.22;
const SIZE_FALLOFF = 1.4;
const RAYED_ABOVE = 0.07;
const RAY_REACH = 5;
const EJECTA_REACH = 2.2;
const LIGHT = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };

function createCraters(planet) {
  const random = createRandom(planet.seed ^ STREAM);
  return Array.from({ length: planet.craters * CRATERS_PER_COUNT }, () => {
    const radius = Math.min(LARGEST, SMALLEST * (1 - random.next()) ** (-1 / SIZE_FALLOFF));
    const center = surfacePoint(random.between(-0.05, 1), random.between(-Math.PI, Math.PI));
    const rays = radius > RAYED_ABOVE && random.next() < 0.5
      ? Array.from({ length: random.integer(8, 14) }, () => ({ angle: random.between(-Math.PI, Math.PI), width: random.between(0.03, 0.08) }))
      : [];
    return { radius, center, rays, freshness: random.next() };
  });
}

function slopeAt(t) {
  return t < 1 ? 2 * t : -3 * Math.exp(-(t - 1) * 4);
}

function rayGlow(rays, angle) {
  let glow = 0;
  for (const ray of rays) glow = Math.max(glow, bump(wrapAngle(angle - ray.angle), 0, ray.width));
  return glow;
}

function stampCrater(rgb, size, crater) {
  const { radius, center, rays, freshness } = crater;
  const reach = Math.min(Math.PI / 2, radius * (rays.length ? RAY_REACH : EJECTA_REACH));
  const centerColumn = ((center.x + 1) / 2) * size;
  const centerRow = ((1 - center.y) / 2) * size;
  const span = Math.sin(reach) * (size / 2) + 2;
  const firstRow = Math.max(0, Math.floor(centerRow - span));
  const lastRow = Math.min(size - 1, Math.ceil(centerRow + span));
  const firstColumn = Math.max(0, Math.floor(centerColumn - span));
  const lastColumn = Math.min(size - 1, Math.ceil(centerColumn + span));
  const texel = 2 / size;

  for (let row = firstRow; row <= lastRow; row++) {
    const y = 1 - (row + 0.5) * texel;
    for (let column = firstColumn; column <= lastColumn; column++) {
      const x = (column + 0.5) * texel - 1;
      const flat = x * x + y * y;
      if (flat > 1) continue;
      const z = Math.sqrt(1 - flat);
      const distance = Math.acos(Math.min(1, x * center.x + y * center.y + z * center.z));
      if (distance > reach) continue;

      const t = distance / radius;
      const outX = column + 0.5 - centerColumn;
      const outY = row + 0.5 - centerRow;
      const outLength = Math.hypot(outX, outY) || 1;
      const facing = -(outX * LIGHT.x + outY * LIGHT.y) / outLength;
      let factor = 1 + 0.35 * slopeAt(t) * facing;
      if (t < 0.9) factor *= 0.92;
      factor *= 1 + freshness * 0.12 * (1 - smoothstep(1, EJECTA_REACH, t)) * (t > 1 ? 1 : 0);
      if (rays.length && t > 1) {
        factor *= 1 + 0.35 * rayGlow(rays, Math.atan2(outY, outX)) * (1 - smoothstep(1.2, reach / radius, t));
      }

      const offset = (row * size + column) * 3;
      rgb[offset] *= factor;
      rgb[offset + 1] *= factor;
      rgb[offset + 2] *= factor;
    }
  }
}

export function paintCraters(rgb, size, planet) {
  for (const crater of createCraters(planet)) stampCrater(rgb, size, crater);
}
