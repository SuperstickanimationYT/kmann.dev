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

function solarBody(body) {
  return {
    name: body.name,
    group: body.parent ? `Moon of ${body.parent}` : 'Planets',
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

const backOff = (from, target, standoff) => add(target, scale(normalize(subtract(from, target)), standoff));

export function listDestinations({ nearby, nebulae, galaxies }) {
  const fixed = (name, group, target, arrival) => ({ name, group, target, arrival: () => arrival });
  const approach = (name, group, target, standoff) => ({ name, group, target, arrival: (from) => backOff(from, target, standoff) });
  return [
    approach('Sun', 'Stars', SUN_POSITION, STAR_STANDOFF),
    ...BODIES.filter((body) => body.kind !== 'star').map(solarBody),
    fixed('Milky Way, seen from above', 'Galaxies', [0, 0, 0], MILKY_WAY_ABOVE),
    ...nearby
      .filter((star) => star.name)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((star) => approach(star.name, 'Stars', star.position, STAR_STANDOFF)),
    ...nebulae
      .filter((nebula) => !/^G\d/.test(nebula.name))
      .map((nebula) => approach(nebula.name, 'Nebulae', nebula.present, NEBULA_STANDOFF_RADII * nebulaRadius(nebula))),
    ...galaxies.map((galaxy) => approach(galaxy.name, 'Galaxies', galaxy.centre, GALAXY_STANDOFF_SCALE_LENGTHS * galaxy.scaleLength)),
  ];
}
