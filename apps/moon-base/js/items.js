export const RESOURCES = ['Ice Chunk', 'Water', 'Regolith', 'Metal', 'Propellant'];
export const CARRY_LIMIT = 20;

export const BUILDINGS = {
  'Air Generator': { art: 'air-generator', battery: true },
  'Water Generator': { art: 'water-generator', process: { input: 'Ice Chunk', inputPer: 1, output: 'Water', seconds: 6, drain: 0 } },
  'Solar Panel': { art: 'solar-panel', battery: true },
  Barrel: { art: 'barrel', store: true },
  Smelter: { art: 'smelter', process: { input: 'Regolith', inputPer: 2, output: 'Metal', seconds: 6, drain: 0 } },
  Electrolyzer: { art: 'electrolyzer', battery: true, process: { input: 'Water', inputPer: 1, output: 'Propellant', seconds: 10, drain: 2 } },
  'Launch Pad': { art: 'launch-pad', pad: true },
};

export const BUILDING_ORDER = Object.keys(BUILDINGS);

export const BLURBS = {
  'Air Generator': 'Splits water with battery power: scrubs CO₂ and makes O₂.',
  'Water Generator': 'Melts ice chunks into water. Runs on sunlight.',
  'Solar Panel': 'Charges a battery.',
  Barrel: 'Stores up to 40 units.',
  Smelter: 'Solar furnace: 2 regolith become 1 metal.',
  Electrolyzer: 'Splits water into liquid oxygen and hydrogen: rocket propellant.',
  'Launch Pad': 'Assemble and fuel a rocket here.',
  Battery: 'Starts empty. Charge it on a solar panel.',
  Capsule: '3.0 t. Keeps you alive on the way home and survives reentry.',
  Engine: '1.5 t. 60 kN of thrust at an Isp of 450 s, like a hydrolox upper stage.',
  Tank: '0.45 t empty, holds 4 t of propellant.',
};

export const RECIPES = [
  { item: 'Smelter', cost: { Regolith: 6 } },
  { item: 'Battery', cost: { Metal: 2 } },
  { item: 'Solar Panel', cost: { Metal: 3 } },
  { item: 'Barrel', cost: { Metal: 1 } },
  { item: 'Water Generator', cost: { Metal: 3 } },
  { item: 'Air Generator', cost: { Metal: 4 } },
  { item: 'Electrolyzer', cost: { Metal: 5 } },
  { item: 'Launch Pad', cost: { Regolith: 8, Metal: 4 } },
  { item: 'Capsule', cost: { Metal: 8 } },
  { item: 'Engine', cost: { Metal: 6 } },
  { item: 'Tank', cost: { Metal: 3 } },
];

export const BARREL_CAPACITY = 40;
export const HOPPER_CAPACITY = 20;
export const AIR_WATER_CAPACITY = 5;
export const MAX_TANKS = 3;
