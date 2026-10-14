export const TRAITS = [
  { key: 'photosynthesis', label: 'Photosynthesis', min: 0, max: 1, upkeep: 0.004 },
  { key: 'absorption', label: 'Nutrient uptake', min: 0, max: 1, upkeep: 0.003 },
  { key: 'predation', label: 'Predation', min: 0, max: 1, upkeep: 0.005 },
  { key: 'armor', label: 'Armor', min: 0, max: 1, upkeep: 0.004 },
  { key: 'motility', label: 'Swimming', min: 0, max: 1, upkeep: 0.003 },
  { key: 'lightSense', label: 'Senses light', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'foodSense', label: 'Senses nutrients', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'cellSense', label: 'Senses other cells', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'threatSense', label: 'Senses threats', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'preySense', label: 'Senses prey', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'dodging', label: 'Turns away from threats', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'chasing', label: 'Turns toward prey', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'foraging', label: 'Turns toward nutrients', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'changeSense', label: 'Reacts to change', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'neighbourSense', label: 'Listens to neighbours', min: -1, max: 1, upkeep: 0.0005 },
  { key: 'signalBias', label: 'Resting signal', min: -1, max: 1, upkeep: 0 },
  { key: 'rhythm', label: 'Rhythm strength', min: 0, max: 1, upkeep: 0.001 },
  { key: 'rhythmSpeed', label: 'Rhythm speed', min: 0, max: 1, upkeep: 0 },
  { key: 'steering', label: 'Turns with signal', min: -1, max: 1, upkeep: 0 },
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
    lightSense: 0,
    foodSense: 0,
    cellSense: 0,
    threatSense: 0,
    preySense: 0,
    dodging: 0,
    chasing: 0,
    foraging: 0,
    changeSense: 0,
    neighbourSense: 0,
    signalBias: 0,
    rhythm: 0,
    rhythmSpeed: 0.3,
    steering: 0,
    kinSparing: 0,
    adhesion: 0.2,
    sharing: 0.2,
    divisionSize: 0.2,
    lifespan: 0.4,
    splitAngle: 0,
    thrustAngle: 0,
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
  child.thrustAngle = wrapAngle(type.thrustAngle + random.gaussian() * rate * SPLIT_ANGLE_DRIFT);
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
