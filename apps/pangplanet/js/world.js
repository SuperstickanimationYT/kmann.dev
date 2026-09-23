export const TICKS_PER_SECOND = 30;
export const GRAVITATIONAL_CONSTANT = 0.1;
export const ROCKET_HEIGHT = 90;
export const CRASH_SPEED = 10;
export const WORMHOLE_EXIT_GAP = 100;

export const SOI_MARGIN = 2000;
export const massFor = (radius, surfaceGravity) => (surfaceGravity * radius * radius) / GRAVITATIONAL_CONSTANT;

function linkWormholes(mouth, exit) {
  mouth.exit = exit;
  exit.exit = mouth;
  return [mouth, exit];
}

export const HOME_BODY = { name: 'Earth', x: 0, y: -10000, radius: 10000, soi: 12000, mass: 1e8, kind: 'planemo', look: 'earth' };

const SUN = { name: 'Sun', x: 1000000, y: -1000000, radius: 50000, soi: 52000, mass: 1e11, kind: 'star', look: 'sun' };

const EARTH_ORBIT = Math.hypot(HOME_BODY.x - SUN.x, HOME_BODY.y - SUN.y);
const EARTH_ORBIT_NUMBER = 3;
const EARTH_SURFACE_GRAVITY = 0.1;

const SURFACE_DEFAULTS = { variation: 15, darkness: 35, polarCap: 0, bands: 0, craters: 0, land: false, landColor: '#7eff00', landCover: 47, clouds: 0 };

function solarPlanet({ name, orbitNumber, bearingDegrees, radius, gravityInEarths, seed, surface, rings, bounty }) {
  const orbit = (EARTH_ORBIT / EARTH_ORBIT_NUMBER) * orbitNumber;
  const bearing = (bearingDegrees * Math.PI) / 180;
  const planet = { ...SURFACE_DEFAULTS, seed, ...surface };
  return {
    name,
    x: SUN.x + Math.sin(bearing) * orbit,
    y: SUN.y + Math.cos(bearing) * orbit,
    radius,
    soi: radius + SOI_MARGIN,
    mass: massFor(radius, gravityInEarths * EARTH_SURFACE_GRAVITY),
    kind: 'planemo',
    palette: { fill: planet.baseColor },
    planet,
    rings,
    bounty,
  };
}

const SOLAR_PLANETS = [
  { name: 'Mercury', orbitNumber: 1, bearingDegrees: 150, radius: 4000, gravityInEarths: 0.38, bounty: 150, seed: 1101, surface: { baseColor: '#9c9489', variation: 30, darkness: 30, craters: 18 } },
  { name: 'Venus', orbitNumber: 2, bearingDegrees: 60, radius: 9500, gravityInEarths: 0.9, bounty: 150, seed: 2202, surface: { baseColor: '#e8c07a', variation: 12, darkness: 15, clouds: 70 } },
  { name: 'Mars', orbitNumber: 4, bearingDegrees: -140, radius: 5300, gravityInEarths: 0.38, bounty: 200, seed: 4404, surface: { baseColor: '#ff6e00', variation: 25, polarCap: 35, craters: 4 } },
  { name: 'Jupiter', orbitNumber: 5, bearingDegrees: 100, radius: 32000, gravityInEarths: 2.5, bounty: 300, seed: 5505, surface: { baseColor: '#d9a066', variation: 20, darkness: 25, bands: 6 } },
  {
    name: 'Saturn',
    orbitNumber: 6,
    bearingDegrees: -20,
    radius: 27000,
    gravityInEarths: 1.07,
    bounty: 300,
    seed: 6606,
    surface: { baseColor: '#e3c98a', variation: 10, darkness: 20, bands: 3 },
    rings: { inner: 1.35, outer: 2.3, colour: 'rgba(226, 206, 160, 0.6)' },
  },
  { name: 'Uranus', orbitNumber: 7, bearingDegrees: 200, radius: 18000, gravityInEarths: 0.9, bounty: 350, seed: 7707, surface: { baseColor: '#9fe3e8', variation: 5, darkness: 10, bands: 1 } },
  { name: 'Neptune', orbitNumber: 8, bearingDegrees: 30, radius: 17500, gravityInEarths: 1.14, bounty: 400, seed: 8808, surface: { baseColor: '#3f6fff', variation: 12, darkness: 20, bands: 2 } },
].map(solarPlanet);

export const HOME_SYSTEM = [
  HOME_BODY,
  { name: 'Moon', x: 100000, y: 0, radius: 3000, soi: 5000, mass: 3e7, kind: 'planemo', look: 'moon', bounty: 75 },
  ...linkWormholes(
    { name: 'Sun Wormhole', x: 100000, y: 10000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole' },
    { name: 'Sun Wormhole', x: 1000000, y: -1080000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole' },
  ),
  SUN,
  ...SOLAR_PLANETS,
];

export const MARKET = { x: 1000, y: -50000, scale: 3, dockingRange: 1000 };

export const STARTING_GALACTOKENS = 200;
export const MAX_FUEL = 100;
export const FUEL_PACK = { cost: 5, amount: 5 };
export const SOLAR_PANELS = { cost: 100 };
export const BATTERY = { cost: 10, sellPrice: 40, slots: 3 };
export const CHARGE_PER_SECOND_AT_STAR_SURFACE = 0.05;
export const WARP_DRIVE = { cost: 10000, range: 2e7, minimumJump: 5e6, chargePerUnit: 1 / 1e7, arrivalInStarRadii: 3 };
export const SATELLITE = { cost: 450, batteries: 3, dockingRange: 1500 };
export const MINING_RIG = { cost: 1000, batterySlots: 6, secondsPerBattery: 600, goldPerMinute: 1, reach: 1500 };
export const GOLD = { sellPrice: 10 };
export const UPGRADES = {
  batterySlots: { base: BATTERY.slots, levels: [{ cost: 150, value: 4 }, { cost: 400, value: 5 }, { cost: 900, value: 6 }] },
  panels: { base: 1, levels: [{ cost: 250, value: 1.5 }, { cost: 700, value: 2 }] },
  tank: { base: MAX_FUEL, levels: [{ cost: 120, value: 150 }, { cost: 450, value: 200 }] },
  engine: { base: 1, levels: [{ cost: 200, value: 1.25 }, { cost: 600, value: 1.5 }] },
  telescope: { base: 4.5e7, levels: [{ cost: 800, value: 9e7 }, { cost: 2000, value: 1.5e8 }] },
  timewarp: { base: 5, levels: [{ cost: 500, value: 10 }, { cost: 1500, value: 20 }, { cost: 4000, value: 30 }] },
};
export const TELESCOPE = { cost: 600 };
export const MAX_BATTERY_SLOTS = UPGRADES.batterySlots.levels.at(-1).value;
export const GENERATED_BOUNTY = { min: 100, max: 250, step: 10 };
