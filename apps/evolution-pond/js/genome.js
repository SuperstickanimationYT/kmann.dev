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
  { key: 'divisionSize', label: 'Size at division', min: 0, max: 1, upkeep: 0 },
  { key: 'lifespan', label: 'Lifespan', min: 0, max: 1, upkeep: 0.003 },
];

const MUTATION_RATE_RANGE = [0.002, 0.25];
const LARGE_JUMP_CHANCE = 0.02;
const HUE_DRIFT_DEGREES = 90;

export function ancestorGenome() {
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
    divisionSize: 0.2,
    lifespan: 0.4,
    mutationRate: 0.03,
    hue: 130,
  };
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

export function mutate(genome, random) {
  const rate = genome.mutationRate;
  const child = { ...genome };
  for (const trait of TRAITS) {
    const span = trait.max - trait.min;
    const jump = random() < LARGE_JUMP_CHANCE ? 0.3 : rate;
    child[trait.key] = clamp(genome[trait.key] + random.gaussian() * jump * span, trait.min, trait.max);
  }
  child.mutationRate = clamp(rate * Math.exp(random.gaussian() * 0.2), ...MUTATION_RATE_RANGE);
  child.hue = (genome.hue + random.gaussian() * rate * HUE_DRIFT_DEGREES + 360) % 360;
  return child;
}

export function upkeepPerMass(genome) {
  let total = 0;
  for (const trait of TRAITS) total += trait.upkeep * Math.abs(genome[trait.key]);
  return total;
}

export function hueDistance(a, b) {
  const apart = Math.abs(a.hue - b.hue) % 360;
  return Math.min(apart, 360 - apart);
}
