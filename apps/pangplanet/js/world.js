export const TICKS_PER_SECOND = 30;
export const GRAVITATIONAL_CONSTANT = 0.1;
export const ROCKET_HEIGHT = 90;
export const FLAME_OFFSET = 50;
export const DRONE_SCALE = 0.6;
export const CRASH_SPEED = 10;
export const WORMHOLE_EXIT_GAP = 100;

export const SOI_MARGIN = 2000;
export const BLACK_HOLE = { radius: 2500, soi: 60000, mass: 1e10, rings: { inner: 1.6, outer: 3.2, colour: 'rgba(255, 150, 60, 0.7)' } };
export const massFor = (radius, surfaceGravity) => (surfaceGravity * radius * radius) / GRAVITATIONAL_CONSTANT;

function linkWormholes(mouth, exit) {
  mouth.exit = exit;
  exit.exit = mouth;
  return [mouth, exit];
}

const EARTH_SURFACE = { seed: 3303, baseColor: '#1f6fd1', variation: 15, darkness: 35, polarCap: 30, bands: 0, craters: 0, land: true, landColor: '#3fbf2a', landCover: 45, clouds: 35 };

export const HOME_BODY = { name: 'Earth', x: 0, y: -10000, radius: 10000, soi: 12000, mass: 1e8, kind: 'planemo', look: 'earth', planet: EARTH_SURFACE };

const SUN = { name: 'Sun', x: 1000000, y: -1000000, radius: 50000, soi: 52000, mass: 1e11, kind: 'star', look: 'sun' };

const EARTH_ORBIT = Math.hypot(HOME_BODY.x - SUN.x, HOME_BODY.y - SUN.y);
const EARTH_ORBIT_NUMBER = 3;
const EARTH_SURFACE_GRAVITY = 0.1;

const SURFACE_DEFAULTS = { variation: 15, darkness: 35, polarCap: 0, bands: 0, craters: 0, land: false, landColor: '#7eff00', landCover: 47, clouds: 0 };

function orbiting(center, distance, bearingDegrees) {
  const bearing = (bearingDegrees * Math.PI) / 180;
  return { x: center.x + Math.sin(bearing) * distance, y: center.y + Math.cos(bearing) * distance };
}

function surfaceBody({ name, x, y, radius, gravityInEarths, seed, surface, rings, bounty, resource = null }) {
  const planet = { ...SURFACE_DEFAULTS, seed, ...surface };
  return {
    name,
    x,
    y,
    radius,
    soi: radius + SOI_MARGIN,
    mass: massFor(radius, gravityInEarths * EARTH_SURFACE_GRAVITY),
    kind: 'planemo',
    palette: { fill: planet.baseColor },
    planet,
    rings,
    bounty,
    resource,
  };
}

const solarPlanet = ({ orbitNumber, bearingDegrees, ...body }) =>
  surfaceBody({ ...body, ...orbiting(SUN, (EARTH_ORBIT / EARTH_ORBIT_NUMBER) * orbitNumber, bearingDegrees) });

function solarMoon({ parent, distance, bearingDegrees, ...body }) {
  const center = SOLAR_PLANETS.find((planet) => planet.name === parent);
  return { ...surfaceBody({ ...body, ...orbiting(center, distance, bearingDegrees) }), moon: true };
}

export const blackHole = (name, { x, y }) => ({ name, x, y, ...BLACK_HOLE, kind: 'blackhole', look: 'blackhole' });

const SOLAR_PLANETS = [
  { name: 'Mercury', orbitNumber: 1, bearingDegrees: 150, radius: 4000, gravityInEarths: 0.38, bounty: 150, seed: 1101, surface: { baseColor: '#9c9489', variation: 30, darkness: 30, craters: 18 } },
  { name: 'Venus', orbitNumber: 2, bearingDegrees: 60, radius: 9500, gravityInEarths: 0.9, bounty: 150, seed: 2202, surface: { baseColor: '#e8c07a', variation: 12, darkness: 15, clouds: 70 } },
  { name: 'Mars', orbitNumber: 4, bearingDegrees: -140, radius: 5300, gravityInEarths: 0.38, bounty: 200, seed: 4404, surface: { baseColor: '#ff6e00', variation: 25, polarCap: 35, craters: 4 } },
  { name: 'Jupiter', orbitNumber: 5, bearingDegrees: 100, radius: 32000, gravityInEarths: 2.5, bounty: 300, resource: 'gas', seed: 5505, surface: { baseColor: '#d9a066', variation: 20, darkness: 25, bands: 6 } },
  {
    name: 'Saturn',
    orbitNumber: 6,
    bearingDegrees: -20,
    radius: 27000,
    gravityInEarths: 1.07,
    bounty: 300,
    resource: 'gas',
    seed: 6606,
    surface: { baseColor: '#e3c98a', variation: 10, darkness: 20, bands: 3 },
    rings: { inner: 1.35, outer: 2.3, colour: 'rgba(226, 206, 160, 0.6)' },
  },
  { name: 'Uranus', orbitNumber: 7, bearingDegrees: 200, radius: 18000, gravityInEarths: 0.9, bounty: 350, resource: 'gas', seed: 7707, surface: { baseColor: '#9fe3e8', variation: 5, darkness: 10, bands: 1 } },
  { name: 'Neptune', orbitNumber: 8, bearingDegrees: 30, radius: 17500, gravityInEarths: 1.14, bounty: 400, resource: 'gas', seed: 8808, surface: { baseColor: '#3f6fff', variation: 12, darkness: 20, bands: 2 } },
].map(solarPlanet);

const SOLAR_MOONS = [
  { parent: 'Mars', name: 'Phobos', distance: 25000, bearingDegrees: 60, radius: 600, gravityInEarths: 0.02, bounty: 200, seed: 4411, surface: { baseColor: '#7a6e64', darkness: 40, craters: 20 } },
  { parent: 'Mars', name: 'Deimos', distance: 50000, bearingDegrees: -110, radius: 400, gravityInEarths: 0.015, bounty: 200, seed: 4422, surface: { baseColor: '#9a8c7c', darkness: 30, craters: 12 } },
  { parent: 'Jupiter', name: 'Europa', distance: 110000, bearingDegrees: -30, radius: 2700, gravityInEarths: 0.134, bounty: 250, seed: 5511, surface: { baseColor: '#d8cfc0', variation: 10, darkness: 15, craters: 2 } },
  { parent: 'Saturn', name: 'Titan', distance: 150000, bearingDegrees: 120, radius: 4450, gravityInEarths: 0.138, bounty: 300, resource: 'gas', seed: 6611, surface: { baseColor: '#d99a3a', variation: 8, darkness: 15, clouds: 80 } },
  { parent: 'Neptune', name: 'Triton', distance: 90000, bearingDegrees: 200, radius: 2340, gravityInEarths: 0.08, bounty: 400, seed: 8811, surface: { baseColor: '#d9b8b0', variation: 15, polarCap: 40, craters: 3 } },
].map(solarMoon);

export const HOME_SYSTEM = [
  HOME_BODY,
  { name: 'Moon', x: 100000, y: 0, radius: 3000, soi: 5000, mass: 3e7, kind: 'planemo', look: 'moon', bounty: 75, moon: true },
  ...linkWormholes(
    { name: 'Sun Wormhole', x: 100000, y: 10000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole' },
    { name: 'Sun Wormhole', x: 1000000, y: -1080000, radius: 3000, soi: 5000, mass: 3e7, kind: 'wormhole', look: 'wormhole' },
  ),
  SUN,
  blackHole('Sun X-1', orbiting(SUN, (EARTH_ORBIT / EARTH_ORBIT_NUMBER) * 5.5, 40)),
  ...SOLAR_PLANETS,
  ...SOLAR_MOONS,
];

export const MARKET = { x: 1000, y: -50000, scale: 3, dockingRange: 1000 };

export const STARTING_GALACTOKENS = 200;
export const MAX_FUEL = 100;
export const FUEL_PACK = { cost: 5, amount: 5 };
export const SOLAR_PANELS = { cost: 100 };
export const BATTERY = { cost: 10, sellPrice: 40, slots: 3 };
export const CHARGE_PER_SECOND_AT_STAR_SURFACE = 0.05;
export const WARP_DRIVE = { cost: 10000, minimumJump: 5e6, chargePerUnit: 1 / 1e7, arrivalInStarRadii: 3 };
export const SATELLITE = { cost: 450, batteries: 3, dockingRange: 1500 };
export const MINING_RIG = { cost: 1000, batterySlots: 6, secondsPerBattery: 1800, goldPerMinute: 1, reach: 1500 };
export const GOLD = { sellPrice: 10 };
export const CRYSTALS = { sellPrice: 80, chancePerPump: 0.25 };
export const STARDUST = { sellPrice: 500, chancePerPump: 0.05 };
export const SCIENCE = { sellPrice: 5, visit: 60, landing: 30, blackHole: 50, flyby: { base: 40, perPlanet: 10 }, sample: { other: 20, gas: 30, crystals: 60, stardust: 150 }, contact: 100 };
export const SOLAR_SAIL = { cost: 250, pushAtSurface: 0.13, flybyRadius: 1.5e6, sensorRange: 5e6, lifeSeconds: 12 * 3600, scanEverySeconds: 60, minLight: 1e-3 };
export const FUEL_PER_PUMP = { gas: 2, other: 1 };
export const UPGRADES = {
  batterySlots: { base: BATTERY.slots, levels: [{ cost: 150, value: 4 }, { cost: 400, value: 5 }, { cost: 900, value: 6 }, { cost: 2000, crystals: 4, value: 8 }, { cost: 5000, stardust: 3, value: 10 }] },
  panels: { base: 1, levels: [{ cost: 250, value: 1.5 }, { cost: 700, value: 2 }, { cost: 1500, crystals: 4, value: 3 }, { cost: 4000, stardust: 3, value: 4 }] },
  tank: { base: MAX_FUEL, levels: [{ cost: 120, value: 150 }, { cost: 450, value: 200 }, { cost: 1200, crystals: 3, value: 300 }, { cost: 3000, stardust: 2, value: 400 }] },
  engine: { base: 1, levels: [{ cost: 200, value: 1.25 }, { cost: 600, value: 1.5 }, { cost: 1500, crystals: 4, value: 2 }, { cost: 4000, stardust: 3, value: 2.5 }] },
  telescope: { base: 4.5e7, levels: [{ cost: 800, value: 9e7 }, { cost: 2000, value: 1.5e8 }, { cost: 4000, crystals: 5, value: 3e8 }, { cost: 8000, stardust: 4, value: 4.5e8 }] },
  warpRange: { base: 2e7, levels: [{ cost: 3000, crystals: 3, value: 3.5e7 }, { cost: 6000, crystals: 8, value: 5e7 }, { cost: 12000, stardust: 5, value: 8e7 }] },
  timewarp: { base: 5, levels: [{ cost: 500, value: 10 }, { cost: 1500, value: 20 }, { cost: 4000, value: 30 }, { cost: 8000, stardust: 3, value: 50 }] },
};
export const TELESCOPE = { cost: 600 };
export const PRICE_GROWTH = 1.5;
export const ANTENNA = { cost: 800, range: 6e5, reach: 1500 };
export const DRONE = { cost: 1500, batteries: 3, padReach: 1500, fuelMargin: 0.05 };
export const RESCUE = { cost: 2500, fee: 50, speed: 300, reach: 300 };
export const OFFLINE_CATCH_UP_SECONDS = 86400;
export const HAULER = { cost: 8000, batteries: 6, speed: 2000, tokensPerUnit: 1 / 20000, stopSeconds: 10, warpSeconds: 60, retrySeconds: 60, idleSeconds: 300 };
export const BUILDER = { cost: 15000, siteInStarRadii: 1.5, siteSpacing: 800, siteTries: 200, starChoices: 40 };
export const BATTERY_BANK = { cost: 600, batteries: 10, dockingRange: 1500 };
export const MAX_BATTERY_SLOTS = UPGRADES.batterySlots.levels.at(-1).value;
export const ALIENS = { homeworldChance: 1 / 8, friendlyAt: 30, hostileAt: -30, limit: 100, friendlyPremium: 1.5, tokensPerRelation: 50, miningAnger: { crystals: 5, stardust: 15 }, tip: { science: 200, maxDiscount: 0.5, rangeInSectors: 5 } };
export const GENERATED_BOUNTY = { min: 100, max: 250, step: 10 };
