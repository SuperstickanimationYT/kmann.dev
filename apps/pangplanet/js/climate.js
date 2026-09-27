import { derivePlanet } from '../../planet-textures/js/physics.js';
import { createRandom } from '../../planet-textures/js/random.js';
import { EARTH_ORBIT, SUN_RADIUS } from './world.js';

const SUN_SURFACE_TEMPERATURE = 5800;
const BLACKBODY_AT_EARTH_ORBIT = 278;
const GREENHOUSE_AT_THICKEST_AIR = 470;
const GRAVITY_HOLDING_THICKEST_AIR = 0.3;
const DRY_WORLD_CHANCE = 0.3;
const PHYSICS_SALT = 0x7e4a;

export const luminosityOf = (radius, surfaceTemperature) => (radius / SUN_RADIUS) ** 2 * (surfaceTemperature / SUN_SURFACE_TEMPERATURE) ** 4;

export const warmthAt = (star, distance) => (BLACKBODY_AT_EARTH_ORBIT * star.luminosity ** 0.25) / Math.sqrt(distance / EARTH_ORBIT);

const greenhouse = (atmosphere) => GREENHOUSE_AT_THICKEST_AIR * (atmosphere / 100) ** 3;

export function worldLook(seed, gasGiant, warmth, surfaceGravity) {
  if (gasGiant) return derivePlanet({ seed, kind: 'giant', temperature: Math.round(warmth), water: 0, atmosphere: 100 });
  const random = createRandom(seed ^ PHYSICS_SALT);
  const airHold = Math.min(1, surfaceGravity / GRAVITY_HOLDING_THICKEST_AIR);
  const atmosphere = Math.round(random.next() ** 1.6 * 100 * airHold);
  const water = random.next() < DRY_WORLD_CHANCE ? 0 : random.integer(0, 100);
  return derivePlanet({ seed, kind: 'rocky', temperature: Math.round(warmth + greenhouse(atmosphere)), water, atmosphere });
}

export function seedFromRetiredLookDraws(next, gasGiant) {
  const seed = 1 + Math.floor(next() * 999999);
  for (let draw = 0; draw < 4; draw++) next();
  if (!gasGiant && next() < 0.5) next();
  if (gasGiant) next();
  if (!gasGiant && next() < 0.4) next();
  if (!gasGiant) next();
  for (let draw = 0; draw < 3; draw++) next();
  if (next() < 0.5) next();
  return seed;
}
