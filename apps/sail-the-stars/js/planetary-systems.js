import { KNOWN_BLACK_HOLES } from './black-holes.js';
import { blackHoleSystem, EXOPLANET_HOSTS, hasMadeUpCivilization, madeUpSystem } from './exoplanets.js';
import { DEGREES, frameToEquatorial, SUN_POSITION } from './milky-way.js';
import { orbitPaths, placeBodies, planetFromSunKm } from './solar-system.js';
import { hashCell, KIND } from './stars.js';
import { subtract } from './vectors.js';
import { withWormholes } from './wormholes.js';

export const SYSTEM_REACH_PC = 0.05;
const AU_PER_PC = 206265;
const FARTHEST_COMPANION_PC = 0.05;
const POSITION_STEPS_PER_PC = 4096;
const NEAREST_SEARCH_PC = 8;
const FARTHEST_SEARCH_PC = 128;

export const SOLAR_SYSTEM = withWormholes({ name: 'Sun', position: SUN_POSITION, light: [1, 1, 1], place: placeBodies, planetFromStarKm: planetFromSunKm, paths: orbitPaths });

const seedOf = ({ position }) => hashCell(...position.map((value) => Math.round(value * POSITION_STEPS_PER_PC)), 60013);
const systemOfHole = (star) => blackHoleSystem(star, seedOf(star));

const others = [...EXOPLANET_HOSTS.map(withWormholes), ...KNOWN_BLACK_HOLES.map(systemOfHole)];
const byName = new Map([SOLAR_SYSTEM, ...others].map((system) => [system.name, system]));

const distanceBetween = (a, b) => Math.hypot(...subtract(a, b));
export const withinSystem = (system, camera) => distanceBetween(camera, system.position) <= SYSTEM_REACH_PC;

export function systemNear(camera) {
  let nearest = null;
  for (const system of byName.values()) {
    if (withinSystem(system, camera) && (!nearest || distanceBetween(camera, system.position) < distanceBetween(camera, nearest.position))) nearest = system;
  }
  return nearest;
}

export const systemNamed = (name) => byName.get(name);
export const systemOf = (body) => (body.host ? systemNamed(body.host) : SOLAR_SYSTEM);
export const otherSystems = () => others;

let starsNearSun = [];
export function knowStarsNearSun(stars) {
  starsNearSun = stars;
}

function companionAu({ position }) {
  const alongside = starsNearSun.filter((star) => Math.abs(star.position[0] - position[0]) < FARTHEST_COMPANION_PC);
  let nearest = Infinity;
  for (const star of alongside) {
    const distance = distanceBetween(star.position, position);
    if (distance > 0 && distance < Math.min(nearest, FARTHEST_COMPANION_PC)) nearest = distance;
  }
  return nearest * AU_PER_PC;
}

const padded = (value) => String(Math.floor(value)).padStart(2, '0');
const sexagesimal = (seconds) => padded(seconds / 3600) + padded((seconds / 60) % 60) + padded(seconds % 60);

function skyName({ position }) {
  const [x, y, z] = frameToEquatorial(subtract(position, SUN_POSITION));
  const ra = (Math.atan2(y, x) / DEGREES + 360) % 360;
  const dec = Math.atan2(z, Math.hypot(x, y)) / DEGREES;
  return `Star J${sexagesimal((ra / 15) * 3600)}${dec < 0 ? '−' : '+'}${sexagesimal(Math.abs(dec) * 3600)}`;
}

function simulatedName(star) {
  const digits = seedOf(star).toString(16).toUpperCase().padStart(8, '0');
  return `SIM ${digits.slice(0, 4)}-${digits.slice(4)}`;
}

const nameOf = (star) => star.host ?? star.name ?? (star.kind === KIND.field ? simulatedName(star) : skyName(star));
const drawnFor = (star) => ({ seed: seedOf(star), companionAu: companionAu(star) });

export const civilizedPlanet = (system) => system.planets.find(({ civilization }) => civilization);
const hasCivilization = (star) => {
  const known = systemNamed(nameOf(star));
  return known ? Boolean(civilizedPlanet(known)) : !star.hole && hasMadeUpCivilization(star, drawnFor(star));
};

export function nearestCivilization(camera, starsWithin) {
  const elsewhere = (system) => !withinSystem(system, camera);
  for (let reach = NEAREST_SEARCH_PC; reach <= FARTHEST_SEARCH_PC; reach *= 2) {
    const found = starsWithin(reach).filter(elsewhere).find(hasCivilization);
    if (found) return systemAround(found);
  }
  const known = others.filter((system) => civilizedPlanet(system) && elsewhere(system));
  return known.reduce((nearest, system) => (distanceBetween(system.position, camera) < distanceBetween(nearest.position, camera) ? system : nearest));
}

export function systemAround(star) {
  const name = nameOf(star);
  const known = systemNamed(name);
  if (known) return known;
  const made = star.hole ? systemOfHole(star) : madeUpSystem({ ...star, name }, drawnFor(star));
  others.push(made);
  byName.set(name, made);
  return made;
}
