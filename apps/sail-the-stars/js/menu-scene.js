import { DEGREES } from './milky-way.js';
import { add, cross, normalize, orthonormal, scale, subtract } from './vectors.js';

const DISTANCE_RADII = 45;
const HIDDEN_PAST_LIMB_SUN_RADII = 1.01;
const LANDSCAPE = { fieldHeight: 1.35 * DEGREES, sunAt: [0.22, 0.12], sunFromEarth: [0.86, 0.51] };
const PORTRAIT = { fieldHeight: 2 * DEGREES, sunAt: [0.25, 0.42], sunFromEarth: [0.42, 0.91] };

export function menuScene(bodies, aspect) {
  const earth = bodies.find((body) => body.name === 'Earth');
  const sun = bodies.find((body) => body.name === 'Sun');
  const layout = aspect < 1 ? PORTRAIT : LANDSCAPE;
  const toSunKm = subtract(sun.fromSunKm, earth.fromSunKm);
  const sunDistanceKm = Math.hypot(...toSunKm);
  const sunward = scale(toSunKm, 1 / sunDistanceKm);
  const right = normalize(cross(sunward, earth.north));
  const up = cross(right, sunward);
  const limbward = normalize(add(scale(right, layout.sunFromEarth[0]), scale(up, layout.sunFromEarth[1])));
  const distanceKm = DISTANCE_RADII * earth.radiusKm;
  const earthRadius = Math.asin(1 / DISTANCE_RADII);
  const sunRadius = Math.asin(sun.radiusKm / (sunDistanceKm + distanceKm));
  const apart = (earthRadius - HIDDEN_PAST_LIMB_SUN_RADII * sunRadius) / (1 - distanceKm / sunDistanceKm);
  const offsetKm = scale(add(scale(sunward, -Math.cos(apart)), scale(limbward, Math.sin(apart))), distanceKm);
  const toSun = normalize(subtract(toSunKm, offsetKm));
  const tanY = Math.tan(layout.fieldHeight / 2);
  const aside = add(scale(right, layout.sunAt[0] * tanY * aspect), scale(up, layout.sunAt[1] * tanY));
  return { earth, offsetKm, ship: orthonormal(subtract(toSun, aside), up), fieldHeight: layout.fieldHeight };
}

export const turnedApart = (a, b) => Math.hypot(...subtract(a.forward, b.forward));
