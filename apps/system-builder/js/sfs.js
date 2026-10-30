import { bodyById, hasAtmosphere, hasSurface, surfaceGravity, treeOrder } from './system.js';
import { ATM, EARTH_SCALE_HEIGHT } from './units.js';
import { flattenedOrbit } from './orbits.js';

export const STOCK_SCALE = 20;
const GAME_VERSION = '1.6.00.16';
const FORMAT_VERSION = '1.5';
const FORBIDDEN_IN_FILENAMES = /[\\/:*?"<>|]/;

const LAUNCH_PAD_ANGLE_DEG = 90;
const LAUNCH_PAD_FLAT_ZONE = { height: 48.0, angle: 1.5707, width: 900.0, transition: 700.0 };
const LAUNCH_PAD = { horizontalPosition: 365.0, height: 56.2 };

const STOCK_SURFACES = [
  ['Moon', '#8a8a8a'], ['Mercury', '#695f59'], ['Mars', '#b36b4d'], ['Ceres', '#9e9995'],
  ['Europa', '#d9c7a7'], ['Io', '#e8d36a'], ['Callisto', '#7f7468'], ['Triton', '#d6d2cc'],
  ['Venus', '#e6c98f'], ['Earth_WithOceans', '#73adff'],
];
const STOCK_ATMOSPHERES = [
  ['Atmo_Earth', '#73adff'], ['Atmo_Mars', '#d3734f'], ['Atmo_Venus', '#e6c98f'], ['Atmo_Titan', '#e0a95a'],
];
const STOCK_GAS_GIANTS = [
  ['Atmo_Jupiter', '#e0b58c'], ['Atmo_Saturn', '#ead6a4'], ['Atmo_Uranus', '#a6e1e8'], ['Atmo_Neptune', '#5d84e8'],
];

const AIRLESS_LOOK = [
  { height: 0.0, shadowIntensity: 1.75, starIntensity: 1.0, hueShift: 0.0, saturation: 0.95, contrast: 1.2, red: 1.0, green: 1.0, blue: 1.0 },
];
const GAS_GIANT_LOOK = [
  { height: 30000.0, shadowIntensity: 1.35, starIntensity: 0.0, hueShift: 0.0, saturation: 0.95, contrast: 1.1, red: 1.0, green: 1.0, blue: 1.0 },
  { height: 100000.0, shadowIntensity: 1.75, starIntensity: 1.0, hueShift: 0.0, saturation: 0.95, contrast: 1.2, red: 1.0, green: 1.0, blue: 1.0 },
];

const STOCK_EARTH_AIR = { density: 0.005, height: 30000.0, curve: 10.0 };
const PRESSURE_TO_DENSITY_EXPONENT = 0.357;
const AIR_TOP_PRESSURE_PA = 1;

const airDepth = ({ surfacePressurePa, scaleHeightM }) => scaleHeightM * Math.log(surfacePressurePa / AIR_TOP_PRESSURE_PA);
const EARTH_AIR_DEPTH = airDepth({ surfacePressurePa: ATM, scaleHeightM: EARTH_SCALE_HEIGHT });
const exportsAir = (body) => hasAtmosphere(body) && body.atmosphere.surfacePressurePa > AIR_TOP_PRESSURE_PA;

const SOI_MULTIPLIER = { star: 1.0, planet: 2.0, moon: 1.35 };

function rgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
}

function nearestStock(stock, hex) {
  const target = rgb(hex);
  const gap = ([, candidate]) => {
    const colour = rgb(candidate);
    return (colour.r - target.r) ** 2 + (colour.g - target.g) ** 2 + (colour.b - target.b) ** 2;
  };
  return stock.reduce((best, entry) => (gap(entry) < gap(best) ? entry : best))[0];
}

const round = (value, digits = 6) => Number(value.toPrecision(digits));

function baseData(body, radius) {
  const surfaced = hasSurface(body);
  const timewarpFraction = body.kind === 'star' ? 0.015 : surfaced ? 0.03 : 0.023;
  return {
    radius: round(radius),
    radiusDifficultyScale: {},
    gravity: round(surfaceGravity(body), 4),
    gravityDifficultyScale: {},
    timewarpHeight: round(radius * timewarpFraction, 3),
    velocityArrowsHeight: surfaced ? round(radius * 0.016, 3) : 'NaN',
    mapColor: { ...rgb(body.color), a: 1.0 },
    significant: true,
    rotateCamera: true,
  };
}

function starSections(radius) {
  return {
    ATMOSPHERE_PHYSICS_DATA: {
      height: round(radius * 0.0086, 3), density: 0.005, curve: 13.0, curveScale: {}, parachuteMultiplier: 1.0,
      upperAtmosphere: 0.5, heightDifficultyScale: {}, shockwaveIntensity: 0.5, minHeatingVelocityMultiplier: 1.0,
    },
    ATMOSPHERE_VISUALS_DATA: {
      GRADIENT: { positionZ: 40000, height: round(radius * 5.74, 3), heightDifficultyScale: {}, texture: 'Atmo_Sun' },
      CLOUDS: { texture: 'None', startHeight: 0.0, width: 0.0, height: 0.0, alpha: 0.0, velocity: 0.0 },
      FOG: { keys: [] },
    },
    POST_PROCESSING: { keys: AIRLESS_LOOK },
  };
}

function gasGiantSections(body) {
  return {
    ATMOSPHERE_PHYSICS_DATA: {
      height: 100000.0, density: 0.025, curve: 15.0, curveScale: {}, parachuteMultiplier: 3.0,
      upperAtmosphere: 0.3, heightDifficultyScale: {}, shockwaveIntensity: 0.5, minHeatingVelocityMultiplier: 1.0,
    },
    ATMOSPHERE_VISUALS_DATA: {
      GRADIENT: { positionZ: 40000, height: 240000.0, heightDifficultyScale: {}, texture: nearestStock(STOCK_GAS_GIANTS, body.color) },
      CLOUDS: { texture: 'None', startHeight: 0.0, width: 0.0, height: 0.0, alpha: 0.0, velocity: 0.0 },
      FOG: { keys: [] },
    },
    POST_PROCESSING: { keys: GAS_GIANT_LOOK },
  };
}

function airSections(body, scale) {
  const density = STOCK_EARTH_AIR.density * (body.atmosphere.surfacePressurePa / ATM) ** PRESSURE_TO_DENSITY_EXPONENT;
  const height = STOCK_EARTH_AIR.height * (airDepth(body.atmosphere) / EARTH_AIR_DEPTH) * (STOCK_SCALE / scale);
  const look = (keyHeight, shadowIntensity, starIntensity) => ({ ...AIRLESS_LOOK[0], height: round(keyHeight, 3), shadowIntensity, starIntensity });
  return {
    ATMOSPHERE_PHYSICS_DATA: {
      height: round(height, 3), density: round(density, 4), curve: STOCK_EARTH_AIR.curve, curveScale: {}, parachuteMultiplier: 1.0,
      upperAtmosphere: 0.333, heightDifficultyScale: {}, shockwaveIntensity: round(Math.min(1, density / STOCK_EARTH_AIR.density), 3), minHeatingVelocityMultiplier: 1.0,
    },
    ATMOSPHERE_VISUALS_DATA: {
      GRADIENT: { positionZ: 4000, height: round(height * 1.5, 3), heightDifficultyScale: {}, texture: nearestStock(STOCK_ATMOSPHERES, body.color) },
      CLOUDS: { texture: 'None', startHeight: 0.0, width: 0.0, height: 0.0, alpha: 0.0, velocity: 0.0 },
      FOG: { keys: [] },
    },
    POST_PROCESSING: { keys: [look(0, 1.35, 0.0), look(height, 1.75, 0.0), look(height * 1.5, 1.75, 1.0)] },
  };
}

function craterFormula(radius) {
  const circumference = 2 * Math.PI * radius;
  const relief = Math.min(1, radius / 120000);
  return [
    `OUTPUT = AddHeightMap(Craters, ${round(circumference / 10)}, ${round(350 * relief, 3)})`,
    `OUTPUT = AddHeightMap(Craters, ${round(circumference / 50)}, ${round(100 * relief, 3)})`,
    'OUTPUT = AddHeightMap(Craters, 2356.19449, 12)',
    'OUTPUT = AddHeightMap(Perlin, 2513.27412, 3)',
  ];
}

function surfaceSections(body, radius, isHome, scale) {
  return {
    ...(exportsAir(body) ? airSections(body, scale) : { POST_PROCESSING: { keys: AIRLESS_LOOK } }),
    TERRAIN_DATA: {
      TERRAIN_TEXTURE_DATA: {
        planetTexture: nearestStock(STOCK_SURFACES, body.color),
        planetTextureCutout: 0.9,
        planetTextureRotation: 0.0,
        planetTextureDontDistort: false,
        surfaceTexture_A: 'HardRocks02',
        surfaceTextureSize_A: { x: 15.0, y: 10.0 },
        surfaceTexture_B: 'None',
        surfaceTextureSize_B: { x: -1.0, y: -1.0 },
        terrainTexture_C: 'Neutral',
        terrainTextureSize_C: { x: 100.0, y: 60.0 },
        surfaceLayerSize: 10.0,
        minFade: 0.0,
        maxFade: 1.0,
        shadowIntensity: 8.0,
        shadowHeight: 10.0,
      },
      terrainFormulaDifficulties: { Normal: craterFormula(radius) },
      textureFormula: [],
      verticeSize: 2.0,
      collider: true,
      flatZones: isHome ? [LAUNCH_PAD_FLAT_ZONE] : [],
      flatZonesDifficulties: {},
    },
  };
}

function orbitData(system, body, scale) {
  const { argumentOfPeriapsis, direction } = flattenedOrbit(body.orbit);
  return {
    parent: bodyById(system, body.parent).name.trim(),
    semiMajorAxis: round(body.orbit.a / scale),
    smaDifficultyScale: {},
    eccentricity: round(body.orbit.e, 4),
    argumentOfPeriapsis: round(argumentOfPeriapsis, 4),
    direction,
    multiplierSOI: SOI_MULTIPLIER[body.kind],
    soiDifficultyScale: {},
  };
}

function achievements(body) {
  const surfaced = hasSurface(body);
  return {
    Landed: surfaced,
    Takeoff: surfaced,
    Atmosphere: body.kind !== 'star' && (!surfaced || exportsAir(body)),
    Orbit: true,
    Crash: surfaced,
  };
}

function planetFile(system, body, scale) {
  const radius = body.radiusM / scale;
  const looks = body.kind === 'star' ? starSections(radius)
    : hasSurface(body) ? surfaceSections(body, radius, body.id === system.home, scale)
    : gasGiantSections(body);
  const file = { version: FORMAT_VERSION, BASE_DATA: baseData(body, radius), ...looks };
  if (body.parent) file.ORBIT_DATA = orbitData(system, body, scale);
  file.ACHIEVEMENT_DATA = achievements(body);
  file.LANDMARKS = [];
  return file;
}

export function exportProblems(system, scale) {
  const problems = [];
  if (!(scale >= 1)) problems.push('The scale factor must be 1 or more.');
  const home = bodyById(system, system.home);
  if (!home) problems.push('Pick a home world for the space center.');
  else if (!hasSurface(home)) problems.push(`${home.name} has no solid surface to put a launch pad on.`);
  for (const body of system.bodies) {
    if (FORBIDDEN_IN_FILENAMES.test(body.name)) problems.push(`${body.name} has a character that can't go in a file name.`);
  }
  const names = system.bodies.map((body) => body.name.trim());
  if (names.some((name) => !name) || new Set(names).size !== names.length) problems.push('Every body needs its own name.');
  return problems;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function sfsPack(system, scale) {
  const folder = system.name.trim().replace(FORBIDDEN_IN_FILENAMES, '') || 'System';
  const home = bodyById(system, system.home);
  const files = [
    { path: `${folder}/Version.txt`, text: GAME_VERSION },
    {
      path: `${folder}/Import_Settings.txt`,
      text: json({
        includeDefaultPlanets: false,
        includeDefaultHeightmaps: true,
        includeDefaultTextures: true,
        hideStarsInAtmosphere: true,
        authorName: system.author.trim() || 'n/a',
        version: '1',
        description: system.description.trim() || 'n/a',
      }),
    },
    {
      path: `${folder}/Space_Center_Data.txt`,
      text: json({ address: home.name.trim(), angle: LAUNCH_PAD_ANGLE_DEG, position_LaunchPad: LAUNCH_PAD }),
    },
  ];
  for (const { body } of treeOrder(system)) {
    files.push({ path: `${folder}/Planet Data/${body.name.trim()}.txt`, text: json(planetFile(system, body, scale)) });
  }
  return { folder, files };
}
