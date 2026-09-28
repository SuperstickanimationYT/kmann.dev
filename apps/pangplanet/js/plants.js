import { createRandom } from '../../planet-textures/js/random.js';

const FLORA_SALT = 0xf107a;
const PLANT_SHAPES = ['tuft', 'fern', 'bulb', 'spire'];
const SPECIES_PER_WORLD = [1, 3];
const PLANTS_PER_1000_UNITS = 6;
const SPECIES_RANGES = {
  height: [18, 70],
  spread: [0.5, 1.2],
  parts: [3, 7],
  sway: [0.03, 0.12],
  swayPerTick: [0.02, 0.06],
  saturation: [40, 75],
  lightness: [35, 55],
};

const floras = new WeakMap();

export const hasFlora = (body) => Boolean(body.planet && (body.life || body.species));

function createSpecies(random) {
  const pick = (range) => random.between(...range);
  return {
    shape: PLANT_SHAPES[random.integer(0, PLANT_SHAPES.length - 1)],
    hue: random.between(0, 360),
    saturation: pick(SPECIES_RANGES.saturation),
    lightness: pick(SPECIES_RANGES.lightness),
    height: pick(SPECIES_RANGES.height),
    spread: pick(SPECIES_RANGES.spread),
    parts: random.integer(...SPECIES_RANGES.parts),
    sway: pick(SPECIES_RANGES.sway),
    swayPerTick: pick(SPECIES_RANGES.swayPerTick),
  };
}

export function floraOf(body) {
  const known = floras.get(body);
  if (known) return known;
  const random = createRandom(body.planet.seed ^ FLORA_SALT);
  const species = Array.from({ length: random.integer(...SPECIES_PER_WORLD) }, () => createSpecies(random));
  const count = Math.round(((2 * Math.PI * body.radius) / 1000) * PLANTS_PER_1000_UNITS);
  const plants = Array.from({ length: count }, (_, index) => ({
    bearing: ((index + random.between(0.1, 0.9)) / count) * Math.PI * 2,
    species: species[random.integer(0, species.length - 1)],
    size: random.between(0.6, 1.3),
    phase: random.between(0, Math.PI * 2),
  }));
  const flora = { species, plants };
  floras.set(body, flora);
  return flora;
}
