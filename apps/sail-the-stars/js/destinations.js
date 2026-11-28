import { LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { civilizedPlanet, otherSystems, SOLAR_SYSTEM, systemAround, systemNamed, systemOf } from './planetary-systems.js';
import { arrivalNear, BODIES, KM_PER_PC } from './solar-system.js';
import { isOut, placeSpacecraft } from './spacecraft.js';
import { LANDED, SPACECRAFT } from './spacecraft-catalogue.js';
import { simNow } from './sim-clock.js';
import { speculationShown } from './speculation.js';
import { nebulaRadius } from './stars.js';
import { halfSizeKm } from './spacecraft-models.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';
import { mouthsOpen, placeMouth, spokenHost } from './wormholes.js';

const STAR_STANDOFF = 0.5 / LY_PER_PC;
const NEBULA_STANDOFF_RADII = 6;
const GALAXY_STANDOFF_SCALE_LENGTHS = 8;
const MILKY_WAY_ABOVE = [0, 0, 45000];
const BODY_CROSSING_SECONDS = 4;
const SYSTEM_VIEW_ORBITS = 2.2;
const SYSTEM_VIEW_RISE = 0.5;
const HOLE_VIEW_RADII = 30;
const HOLE_VIEW_RISE = 0.25;
const HOLE_CROSSING_SECONDS = 3;
const MOUTH_VIEW_RADII = 5;

export const placedNow = (body) => systemOf(body).place(simNow()).find(({ name }) => name === body.name) ?? body;
export function craftNow(craft) {
  const now = simNow();
  return isOut(craft, now) ? placeSpacecraft(now, SOLAR_SYSTEM.place(now), [craft])[0] ?? null : null;
}

const backOff = (from, target, standoff) => add(target, scale(normalize(subtract(from, target)), standoff));
const approach = (name, group, target, standoff, subject) => ({ name, group, target, subject, arrival: (from) => backOff(from, target, standoff) });

export const plainStarDestination = (star) => approach(star.name, 'Stars', star.position, STAR_STANDOFF, { kind: 'star', star });

function hostDestination(star) {
  const { position, star: { north, hole, pulsar, radiusKm }, planets, outermostKm } = systemNamed(star.host);
  const compact = hole || (pulsar && !planets.length);
  const standoff = (compact ? HOLE_VIEW_RADII * radiusKm : SYSTEM_VIEW_ORBITS * outermostKm) / KM_PER_PC;
  const rise = compact ? HOLE_VIEW_RISE : SYSTEM_VIEW_RISE;
  return {
    ...plainStarDestination(star),
    ...(pulsar && { group: 'Pulsars' }),
    ...(compact && { group: hole ? 'Black holes' : 'Pulsars', up: north, speed: (radiusKm / HOLE_CROSSING_SECONDS / KM_PER_PC) * LY_PER_PC }),
    arrival: (from) => {
      const toward = normalize(subtract(from, position));
      const side = Math.sign(dot(toward, north)) || 1;
      const across = subtract(toward, scale(north, dot(toward, north)));
      return add(position, scale(normalize(add(normalize(across), scale(north, rise * side))), standoff));
    },
  };
}

export const nearestBlackHoleDestinations = (nearest) => [
  { name: 'Nearest black hole', group: 'Black holes', now: () => starDestination(nearest(() => true)) },
  { name: 'Nearest black hole with planets', group: 'Black holes', now: () => starDestination(nearest((star) => systemAround(star).planets.length > 0)) },
];

const nearestCivilizationDestination = (nearest) => ({ name: 'Nearest civilization', group: 'Made-up civilizations', now: () => bodyDestination(civilizedPlanet(nearest())) });

export const starDestination = (star) => hostDestination(systemAround(star).catalogueStar);

export const SUN_DESTINATION = plainStarDestination({ name: 'Sun', position: SUN_POSITION, sun: true });

const DWARF_GROUPS = { agreed: 'Dwarf planets', likely: 'Likely dwarf planets' };

function groupOf(body) {
  if (body.kind === 'wormhole') return `Made-up wormhole at ${spokenHost(body.host)}`;
  if (body.kind === 'mirror') return `Made-up mirrors of ${body.parent}`;
  if (body.pulsar) return 'Pulsars';
  if (body.host) return `${body.madeUp ? 'Procedurally generated planet' : 'Planet'} of ${body.host}`;
  if (body.dwarf) return DWARF_GROUPS[body.dwarf];
  return body.parent ? `Moon of ${body.parent}` : 'Planets';
}

function mouthDestination(body) {
  const beside = (from) => scale(normalize(subtract(from, placedNow(body).centre)), (MOUTH_VIEW_RADII * body.radiusKm) / KM_PER_PC);
  return Object.assign(placeDestination(body), { beside, arrival: (from) => add(placedNow(body).centre, beside(from)) });
}

export function bodyDestination(body) {
  if (body.kind === 'star' && !body.orbit) return body.host ? starDestination(systemNamed(body.host).catalogueStar) : SUN_DESTINATION;
  if (body.kind === 'wormhole') return mouthDestination(body);
  return placeDestination(body);
}

function placeDestination(body) {
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

const CRAFT_STANDOFF = 3.2;
const MIDDLE_HEIGHT = 0.5;
const FROM_SUNWARD = { aside: 0.6, up: 0.45 };
const BESIDE_CRAFT = { east: 0.85, meridian: 0.5, sunward: 0.55, sunwardOfShield: -0.3 };
const CRAFT_CROSSING_SECONDS = 4;

const outwardFrom = (craft, parent) => normalize(subtract(craft.fromSunKm, parent.fromSunKm));

const EYE_LEVEL_KM = 0.0022;

function besideLander({ sunward, meridian, radiusKm }, up) {
  const across = subtract(sunward, scale(up, dot(sunward, up)));
  const lit = normalize(Math.hypot(...across) > 1e-3 ? across : meridian);
  const direction = normalize(add(add(lit, scale(cross(up, lit), FROM_SUNWARD.aside)), scale(up, FROM_SUNWARD.up)));
  const offsetKm = scale(direction, CRAFT_STANDOFF * radiusKm);
  return add(offsetKm, scale(up, Math.max(0, EYE_LEVEL_KM - dot(offsetKm, up))));
}

function craftGroup({ on, rover }) {
  if (!on) return 'Spacecraft';
  return `${rover ? 'Rover' : 'Lander'} on ${on === 'Moon' ? 'the Moon' : on}`;
}

function besideCraft({ faces, north, meridian, sunward }) {
  const east = cross(north, meridian);
  const shielded = faces === 'awayFromSun';
  const side = !shielded && dot(east, sunward) < 0 ? -1 : 1;
  return normalize(add(add(scale(east, BESIDE_CRAFT.east * side), scale(meridian, BESIDE_CRAFT.meridian)), scale(sunward, shielded ? BESIDE_CRAFT.sunwardOfShield : BESIDE_CRAFT.sunward)));
}

export function craftDestination(listed) {
  return {
    name: listed.name,
    group: craftGroup(listed),
    subject: { kind: 'body', body: { ...listed, kind: 'craft' } },
    craft: listed,
    get target() {
      return craftNow(listed)?.centre ?? SOLAR_SYSTEM.position;
    },
    standoff({ craft, parent }) {
      const offsetKm = craft.landed ? besideLander(craft, outwardFrom(craft, parent)) : scale(besideCraft(craft), CRAFT_STANDOFF * craft.radiusKm);
      return scale(offsetKm, 1 / KM_PER_PC);
    },
    middle: (craft, parent) => (craft.landed ? scale(outwardFrom(craft, parent), (MIDDLE_HEIGHT * craft.radiusKm) / KM_PER_PC) : [0, 0, 0]),
    upNear: (craft, parent) => (parent.kind === 'star' ? null : outwardFrom(craft, parent)),
    speed: (halfSizeKm(listed.model) / CRAFT_CROSSING_SECONDS / KM_PER_PC) * LY_PER_PC,
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

export function speculativeBodiesNow() {
  const now = simNow();
  return [...SOLAR_SYSTEM.place(now).filter(({ kind }) => kind === 'mirror'), ...mouthsOpen(now).map((mouth) => placeMouth(mouth, systemOf(mouth), now))];
}

export const isSpeculative = ({ kind, speculative }) => Boolean(speculative) || kind === 'mirror' || kind === 'wormhole';

export function listDestinations({ nearby, nebulae, galaxies, speculative, nearestHole, nearestCivilization }) {
  const starsByName = nearby.filter((star) => star.name && !star.host).map(starDestination);
  const hosts = otherSystems().map(({ catalogueStar }) => hostDestination(catalogueStar));
  const stars = new Map([...starsByName, ...hosts].map((place) => [place.name, place]));
  return [
    SUN_DESTINATION,
    ...BODIES.filter((body) => body.kind !== 'star').map(bodyDestination),
    ...speculative.map(bodyDestination),
    ...[...SPACECRAFT, ...LANDED].map(craftDestination),
    MILKY_WAY_DESTINATION,
    ...nearestBlackHoleDestinations(nearestHole),
    ...(speculationShown() ? [nearestCivilizationDestination(nearestCivilization)] : []),
    ...[...stars.values()].sort((a, b) => a.name.localeCompare(b.name)),
    ...otherSystems().flatMap(({ planets }) => planets.map(bodyDestination)),
    ...nebulae.filter((nebula) => !/^G\d/.test(nebula.name)).map(nebulaDestination),
    ...galaxies.map(galaxyDestination),
  ];
}
