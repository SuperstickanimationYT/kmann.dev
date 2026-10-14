export const TRAITS = [
  { key: 'photosynthesis', label: 'Photosynthesis', min: 0, max: 1, upkeep: 0.004 },
  { key: 'absorption', label: 'Nutrient uptake', min: 0, max: 1, upkeep: 0.003 },
  { key: 'predation', label: 'Predation', min: 0, max: 1, upkeep: 0.005 },
  { key: 'armor', label: 'Armor', min: 0, max: 1, upkeep: 0.004 },
  { key: 'motility', label: 'Swimming', min: 0, max: 1, upkeep: 0.003 },
  { key: 'lightSeeking', label: 'Likes light', min: -1, max: 1, upkeep: 0 },
  { key: 'foodSeeking', label: 'Likes nutrients', min: -1, max: 1, upkeep: 0 },
  { key: 'cellSeeking', label: 'Likes other cells', min: -1, max: 1, upkeep: 0 },
  { key: 'kinSparing', label: 'Spares look-alikes', min: 0, max: 1, upkeep: 0.001 },
  { key: 'adhesion', label: 'Child stays attached', min: 0, max: 1, upkeep: 0 },
  { key: 'sharing', label: 'Shares energy', min: 0, max: 1, upkeep: 0.001 },
  { key: 'divisionSize', label: 'Size at division', min: 0, max: 1, upkeep: 0 },
  { key: 'lifespan', label: 'Lifespan', min: 0, max: 1, upkeep: 0.003 },
];

export const MAX_CELL_TYPES = 12;
const MUTATION_RATE_RANGE = [0.002, 0.25];
const LARGE_JUMP_CHANCE = 0.02;
const HUE_DRIFT_DEGREES = 90;
const DUPLICATION_CHANCE = 0.03;
const REWIRE_CHANCE = 0.02;
const SPLIT_ANGLE_DRIFT = Math.PI;

export const sticksToChild = (type) => type.adhesion > 0.5;

function ancestorType() {
  return {
    photosynthesis: 0.6,
    absorption: 0.6,
    predation: 0,
    armor: 0,
    motility: 0,
    lightSeeking: 0,
    foodSeeking: 0,
    cellSeeking: 0,
    kinSparing: 0,
    adhesion: 0.2,
    sharing: 0.2,
    divisionSize: 0.2,
    lifespan: 0.4,
    splitAngle: 0,
    childType: 0,
    parentBecomes: 0,
  };
}

export function ancestorGenome() {
  return { mutationRate: 0.03, hue: 130, types: [ancestorType()] };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function mutateType(type, rate, typeCount, random) {
  const child = { ...type };
  for (const trait of TRAITS) {
    const span = trait.max - trait.min;
    const jump = random() < LARGE_JUMP_CHANCE ? 0.3 : rate;
    child[trait.key] = clamp(type[trait.key] + random.gaussian() * jump * span, trait.min, trait.max);
  }
  child.splitAngle = wrapAngle(type.splitAngle + random.gaussian() * rate * SPLIT_ANGLE_DRIFT);
  if (random() < REWIRE_CHANCE) child.childType = Math.floor(random() * typeCount);
  if (random() < REWIRE_CHANCE) child.parentBecomes = Math.floor(random() * typeCount);
  return child;
}

export function mutate(genome, random) {
  const rate = genome.mutationRate;
  const types = [...genome.types];
  if (types.length < MAX_CELL_TYPES && random() < DUPLICATION_CHANCE) {
    types.push(types[Math.floor(random() * types.length)]);
  }
  return {
    mutationRate: clamp(rate * Math.exp(random.gaussian() * 0.2), ...MUTATION_RATE_RANGE),
    hue: (genome.hue + random.gaussian() * rate * HUE_DRIFT_DEGREES + 360) % 360,
    types: types.map((type) => mutateType(type, rate, types.length, random)),
  };
}

export function upkeepPerMass(type) {
  let total = 0;
  for (const trait of TRAITS) total += trait.upkeep * Math.abs(type[trait.key]);
  return total;
}

export function hueDistance(a, b) {
  const apart = Math.abs(a.hue - b.hue) % 360;
  return Math.min(apart, 360 - apart);
}
