export const TICKS_PER_SECOND = 30;
export const GRAVITATIONAL_CONSTANT = 0.1;
export const ROCKET_HEIGHT = 90;
export const CRASH_SPEED = 10;
export const WORMHOLE_EXIT_GAP = 100;

export const BODIES = [
  { name: 'Earth', x: 0, y: -10000, radius: 10000, soi: 12000, mass: 1e8, kind: 'planemo', look: 'earth' },
  { name: 'Moon', x: 100000, y: 0, radius: 3000, soi: 5000, mass: 3e7, kind: 'planemo', look: 'moon' },
  { name: 'Sun Wormhole', x: 100000, y: 10000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole', exit: 3 },
  { name: 'Sun Wormhole', x: 1000000, y: -1080000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole', exit: 2 },
  { name: 'Sun', x: 1000000, y: -1000000, radius: 50000, soi: 52000, mass: 1e11, kind: 'star', look: 'sun' },
];

export const HOME_BODY = 0;

export const MARKET = { x: 1000, y: -50000, scale: 3, dockingRange: 1000 };

export const STARTING_GALACTOKENS = 200;
export const MAX_FUEL = 100;
export const FUEL_PACK = { cost: 5, amount: 5 };
export const SOLAR_PANELS = { cost: 100 };
export const BATTERY = { cost: 10, sellPrice: 40, slots: 3 };
export const CHARGE_PER_SECOND_AT_STAR_SURFACE = 0.05;
