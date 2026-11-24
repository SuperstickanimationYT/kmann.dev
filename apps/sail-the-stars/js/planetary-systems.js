import { EXOPLANET_HOSTS } from './exoplanets.js';
import { SUN_POSITION } from './milky-way.js';
import { orbitPaths, placeBodies } from './solar-system.js';
import { subtract } from './vectors.js';

const SYSTEM_REACH_PC = 0.05;

export const SOLAR_SYSTEM = { name: 'Sun', position: SUN_POSITION, light: [1, 1, 1], place: placeBodies, paths: orbitPaths };

const SYSTEMS = [SOLAR_SYSTEM, ...EXOPLANET_HOSTS];

export const withinSystem = (system, camera) => Math.hypot(...subtract(camera, system.position)) <= SYSTEM_REACH_PC;

export const systemNear = (camera) => SYSTEMS.find((system) => withinSystem(system, camera)) ?? null;

export const systemNamed = (name) => SYSTEMS.find((system) => system.name === name);

export const systemOf = (body) => (body.host ? systemNamed(body.host) : SOLAR_SYSTEM);
