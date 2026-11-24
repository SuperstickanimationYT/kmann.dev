import { LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { EXOPLANET_HOSTS } from './exoplanets.js';
import { systemNamed, systemOf } from './planetary-systems.js';
import { arrivalNear, BODIES, KM_PER_PC } from './solar-system.js';
import { simNow } from './sim-clock.js';
import { nebulaRadius } from './stars.js';
import { add, dot, normalize, scale, subtract } from './vectors.js';

const STAR_STANDOFF = 0.5 / LY_PER_PC;
const NEBULA_STANDOFF_RADII = 6;
const GALAXY_STANDOFF_SCALE_LENGTHS = 8;
const MILKY_WAY_ABOVE = [0, 0, 45000];
const BODY_CROSSING_SECONDS = 4;
const SYSTEM_VIEW_ORBITS = 2.2;
const SYSTEM_VIEW_RISE = 0.5;

export const placedNow = (body) => systemOf(body).place(simNow()).find(({ name }) => name === body.name) ?? body;
const backOff = (from, target, standoff) => add(target, scale(normalize(subtract(from, target)), standoff));
const approach = (name, group, target, standoff, subject) => ({ name, group, target, subject, arrival: (from) => backOff(from, target, standoff) });

const plainStarDestination = (star) => approach(star.name, 'Stars', star.position, STAR_STANDOFF, { kind: 'star', star });

function hostDestination(star) {
  const { position, star: { north }, outermostKm } = systemNamed(star.host);
  const standoff = (SYSTEM_VIEW_ORBITS * outermostKm) / KM_PER_PC;
  return {
    ...plainStarDestination(star),
    arrival: (from) => {
      const toward = normalize(subtract(from, position));
      const side = Math.sign(dot(toward, north)) || 1;
      const across = subtract(toward, scale(north, dot(toward, north)));
      return add(position, scale(normalize(add(normalize(across), scale(north, SYSTEM_VIEW_RISE * side))), standoff));
    },
  };
}

export const starDestination = (star) => (star.host ? hostDestination(star) : plainStarDestination(star));

export const SUN_DESTINATION = starDestination({ name: 'Sun', position: SUN_POSITION, sun: true });

function groupOf(body) {
  if (body.host) return `Planet of ${body.host}`;
  return body.parent ? `Moon of ${body.parent}` : 'Planets';
}

export function bodyDestination(body) {
  if (body.kind === 'star') return body.host ? starDestination(systemNamed(body.host).catalogueStar) : SUN_DESTINATION;
  return {
    name: body.name,
    group: groupOf(body),
    subject: { kind: 'body', body },
    get target() {
      return placedNow(body).centre;
    },
    get up() {
      return placedNow(body).north;
    },
    arrival: (from) => arrivalNear(placedNow(body), from),
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
    ...EXOPLANET_HOSTS.flatMap(({ planets }) => planets.map(bodyDestination)),
    ...nebulae.filter((nebula) => !/^G\d/.test(nebula.name)).map(nebulaDestination),
    ...galaxies.map(galaxyDestination),
  ];
}
