import { derivePlanet } from '../../planet-textures/js/physics.js';
import { createRandom } from '../../planet-textures/js/random.js';
import { AU_KM, EARTH_KM } from './systems.js';

const HOME_STAR = 'Sun';
const ASSUMED_ALBEDO = 0.3;
const GIANT_FROM_MASS_EARTH = 10;
const GIANT_FROM_RADIUS_EARTH = 2;
const GREENHOUSE_AT_THICKEST_AIR = 470;
const GRAVITY_HOLDING_THICKEST_AIR = 0.3;
const DRY_WORLD_CHANCE = 0.3;

export function hostStar(system, body) {
  let current = body;
  while (current.parent) {
    current = system.bodies.find((other) => other.name === current.parent);
    if (current.kind === 'star') return current;
  }
  return null;
}

export function hasGuessedSurface(system, body) {
  const star = hostStar(system, body);
  return body.kind === 'planet' && Boolean(star) && star.name !== HOME_STAR;
}

function equilibriumTemperature(star, body) {
  const distanceKm = body.orbit.a * AU_KM;
  return star.temperatureK * Math.sqrt(star.radiusKm / (2 * distanceKm)) * (1 - ASSUMED_ALBEDO) ** 0.25;
}

const isGiant = (body) => body.massEarth >= GIANT_FROM_MASS_EARTH || body.radiusKm / EARTH_KM >= GIANT_FROM_RADIUS_EARTH;

const greenhouse = (atmosphere) => GREENHOUSE_AT_THICKEST_AIR * (atmosphere / 100) ** 3;

function seedFor(system, body, roll) {
  const text = `${system.id}/${body.name}/${roll}`;
  let hash = 7;
  for (const letter of text) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return 1 + (hash % 999999);
}

function rollAir(body, random) {
  const gravity = body.massEarth / (body.radiusKm / EARTH_KM) ** 2;
  const holdable = Math.min(1, gravity / GRAVITY_HOLDING_THICKEST_AIR);
  const atmosphere = Math.round(random.next() ** 1.6 * 100 * holdable);
  return Math.min(atmosphere, body.guess?.airAtMost ?? 100);
}

function rollWater(body, random) {
  if (body.guess?.dry || random.next() < DRY_WORLD_CHANCE) return 0;
  return random.integer(0, 100);
}

export function guessSurface(system, body, roll) {
  const seed = seedFor(system, body, roll);
  const heat = equilibriumTemperature(hostStar(system, body), body);
  if (isGiant(body)) {
    const temperature = Math.round(heat);
    return { look: derivePlanet({ seed, kind: 'giant', temperature, water: 0, atmosphere: 100 }), giant: true, temperature };
  }
  const random = createRandom(seed);
  const atmosphere = rollAir(body, random);
  const water = rollWater(body, random);
  const temperature = Math.round(heat + greenhouse(atmosphere));
  return { look: derivePlanet({ seed, kind: 'rocky', temperature, water, atmosphere }), giant: false, temperature, water, atmosphere };
}
