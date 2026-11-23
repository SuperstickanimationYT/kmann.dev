import { LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { arrivalNear, BODIES, KM_PER_PC, placeBodies } from './solar-system.js';
import { nebulaRadius } from './stars.js';
import { add, normalize, scale, subtract } from './vectors.js';

const STAR_STANDOFF = 0.5 / LY_PER_PC;
const NEBULA_STANDOFF_RADII = 6;
const GALAXY_STANDOFF_SCALE_LENGTHS = 8;
const MILKY_WAY_ABOVE = [0, 0, 45000];
const BODY_CROSSING_SECONDS = 4;

const placedNow = (name) => placeBodies(Date.now()).find((body) => body.name === name);
const backOff = (from, target, standoff) => add(target, scale(normalize(subtract(from, target)), standoff));
const approach = (name, group, target, standoff, subject) => ({ name, group, target, subject, arrival: (from) => backOff(from, target, standoff) });

export const starDestination = (star) => approach(star.name, 'Stars', star.position, STAR_STANDOFF, { kind: 'star', star });

export const SUN_DESTINATION = starDestination({ name: 'Sun', position: SUN_POSITION, sun: true });

export function bodyDestination(body) {
  if (body.kind === 'star') return SUN_DESTINATION;
  return {
    name: body.name,
    group: body.parent ? `Moon of ${body.parent}` : 'Planets',
    subject: { kind: 'body', body },
    get target() {
      return placedNow(body.name).centre;
    },
    get up() {
      return placedNow(body.name).north;
    },
    arrival: (from) => arrivalNear(placedNow(body.name), from),
    speed: (body.radiusKm / BODY_CROSSING_SECONDS / KM_PER_PC) * LY_PER_PC,
  };
}

export const nebulaDestination = (nebula) =>
  approach(nebula.name, 'Nebulae', nebula.present, NEBULA_STANDOFF_RADII * nebulaRadius(nebula), { kind: 'nebula', nebula });

export const galaxyDestination = (galaxy) =>
  approach(galaxy.name, 'Galaxies', galaxy.centre, GALAXY_STANDOFF_SCALE_LENGTHS * galaxy.scaleLength, { kind: 'galaxy', galaxy });

const MILKY_WAY = { name: 'Milky Way', centre: [0, 0, 0] };
const MILKY_WAY_DESTINATION = {
  name: 'Milky Way, seen from above',
  group: 'Galaxies',
  target: MILKY_WAY.centre,
  subject: { kind: 'galaxy', galaxy: MILKY_WAY },
  arrival: () => MILKY_WAY_ABOVE,
};

export function listDestinations({ nearby, nebulae, galaxies }) {
  return [
    SUN_DESTINATION,
    ...BODIES.filter((body) => body.kind !== 'star').map(bodyDestination),
    MILKY_WAY_DESTINATION,
    ...nearby
      .filter((star) => star.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(starDestination),
    ...nebulae.filter((nebula) => !/^G\d/.test(nebula.name)).map(nebulaDestination),
    ...galaxies.map(galaxyDestination),
  ];
}
