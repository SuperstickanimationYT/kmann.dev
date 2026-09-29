import { luminosityOf } from './climate.js';
import { EARTH_ORBIT, SOI_MARGIN, SUN_RADIUS, massFor, orbiting, surfaceBody } from './world.js';

const STAR_SURFACE_GRAVITY = 4;
const SUNLIGHT_AT_EARTH = SUN_RADIUS / EARTH_ORBIT;
const RADIUS_IN_EARTHS_TO_GAME = [
  [0, 0],
  [1, 10000],
  [3.88, 17500],
  [11.2, 32000],
];

function gameRadius(earthRadii) {
  const last = RADIUS_IN_EARTHS_TO_GAME.length - 1;
  const above = RADIUS_IN_EARTHS_TO_GAME.findIndex(([earths]) => earths >= earthRadii);
  const upper = above === -1 ? last : Math.max(1, above);
  const [[fromEarths, fromGame], [toEarths, toGame]] = RADIUS_IN_EARTHS_TO_GAME.slice(upper - 1, upper + 1);
  return Math.round(fromGame + ((earthRadii - fromEarths) / (toEarths - fromEarths)) * (toGame - fromGame));
}

const distanceForSunlight = (starRadius, insolationInEarths) => starRadius / (SUNLIGHT_AT_EARTH * Math.sqrt(insolationInEarths));

export function buildRealSystem({ name, radius, surfaceTemperature, luminosityInSuns, palette, anchor, squeeze = 1, planets }, center) {
  const star = {
    name,
    ...center,
    radius,
    soi: radius + SOI_MARGIN,
    mass: massFor(radius, STAR_SURFACE_GRAVITY),
    luminosity: luminosityOf(radius, surfaceTemperature),
    kind: 'star',
    palette,
  };
  const anchorPlanet = planets.find((planet) => planet.letter === anchor);
  const anchorDistance = distanceForSunlight(radius, luminosityInSuns / anchorPlanet.au ** 2);
  const bodies = planets.flatMap(({ letter, au, radiusInEarths, gravityInEarths, bearingDegrees, life, moons = [], ...look }) => {
    const planet = {
      ...surfaceBody({ name: `${name} ${letter}`, ...orbiting(star, anchorDistance * (au / anchorPlanet.au) ** squeeze, bearingDegrees), radius: gameRadius(radiusInEarths), gravityInEarths, ...look }),
      orbitCenter: { x: star.x, y: star.y },
      life,
    };
    const planetMoons = moons.map(({ numeral, distance, bearingDegrees: moonBearing, life: moonLife, ...moonLook }) => ({
      ...surfaceBody({ name: `${planet.name} ${numeral}`, ...orbiting(planet, distance, moonBearing), ...moonLook }),
      moon: true,
      orbitCenter: { x: planet.x, y: planet.y },
      life: moonLife,
    }));
    return [planet, ...planetMoons];
  });
  star.biosignature = bodies.some((body) => body.life);
  return [star, ...bodies];
}

const RED_DWARF_GLOW = 'rgba(255, 110, 80, 0.45)';

const BARNARDS_STAR = {
  name: "Barnard's Star",
  radius: 32000,
  surfaceTemperature: 3195,
  luminosityInSuns: 0.0035,
  palette: { fill: '#ff9a70', glow: RED_DWARF_GLOW },
  anchor: 'b',
  planets: [
    { letter: 'd', au: 0.0187, radiusInEarths: 0.7, gravityInEarths: 0.54, bearingDegrees: 40, bounty: 150, seed: 20101, surface: { baseColor: '#6e5d52', darkness: 45, craters: 14 } },
    { letter: 'b', au: 0.0229, radiusInEarths: 0.72, gravityInEarths: 0.58, bearingDegrees: 170, bounty: 160, seed: 20202, surface: { baseColor: '#7d6a5c', darkness: 40, craters: 12 } },
    { letter: 'c', au: 0.0274, radiusInEarths: 0.74, gravityInEarths: 0.61, bearingDegrees: -70, bounty: 170, seed: 20303, surface: { baseColor: '#8e7b6b', darkness: 35, craters: 8 } },
    { letter: 'e', au: 0.0379, radiusInEarths: 0.64, gravityInEarths: 0.47, bearingDegrees: 100, bounty: 150, seed: 20404, surface: { baseColor: '#9a8878', darkness: 30, craters: 6 } },
  ],
};

const TRAPPIST_1 = {
  name: 'TRAPPIST-1',
  radius: 20000,
  surfaceTemperature: 2566,
  luminosityInSuns: 0.000553,
  palette: { fill: '#ff7a5c', glow: RED_DWARF_GLOW },
  anchor: 'e',
  planets: [
    { letter: 'b', au: 0.0115, radiusInEarths: 1.116, gravityInEarths: 1.1, bearingDegrees: 20, bounty: 220, seed: 30101, surface: { baseColor: '#6b5a52', darkness: 40, craters: 10 } },
    { letter: 'c', au: 0.0158, radiusInEarths: 1.097, gravityInEarths: 1.09, bearingDegrees: 140, bounty: 220, seed: 30202, surface: { baseColor: '#8a7768', darkness: 35, craters: 6 } },
    { letter: 'd', au: 0.0223, radiusInEarths: 0.788, gravityInEarths: 0.62, bearingDegrees: -110, bounty: 200, seed: 30303, surface: { baseColor: '#a58b72', craters: 3, haze: 10, hazeColor: '#e0b090' } },
    {
      letter: 'e',
      au: 0.0293,
      radiusInEarths: 0.92,
      gravityInEarths: 0.82,
      bearingDegrees: 60,
      bounty: 300,
      seed: 30404,
      life: true,
      surface: { baseColor: '#1f5fa8', land: true, landColor: '#5f8f3a', landCover: 35, polarCap: 20, clouds: 40, haze: 18, hazeColor: '#ffb59a' },
    },
    { letter: 'f', au: 0.0385, radiusInEarths: 1.045, gravityInEarths: 0.95, bearingDegrees: -160, bounty: 240, seed: 30505, surface: { baseColor: '#c9dde8', variation: 10, polarCap: 50, clouds: 20 } },
    { letter: 'g', au: 0.0469, radiusInEarths: 1.129, gravityInEarths: 1.04, bearingDegrees: -30, bounty: 250, seed: 30606, surface: { baseColor: '#b7cfe0', variation: 10, polarCap: 70, craters: 2 } },
    { letter: 'h', au: 0.0619, radiusInEarths: 0.755, gravityInEarths: 0.57, bearingDegrees: 210, bounty: 220, seed: 30707, surface: { baseColor: '#dfe8ef', variation: 8, polarCap: 90, craters: 4 } },
  ],
};

const KEPLER_90 = {
  name: 'Kepler-90',
  radius: 60000,
  surfaceTemperature: 6080,
  luminosityInSuns: 1.77,
  palette: { fill: '#fffbea', glow: 'rgba(255, 244, 200, 0.45)' },
  anchor: 'h',
  squeeze: 0.73,
  planets: [
    { letter: 'b', au: 0.074, radiusInEarths: 1.31, gravityInEarths: 1.2, bearingDegrees: 10, bounty: 400, seed: 40101, surface: { baseColor: '#5a4038', darkness: 45, lava: 30 } },
    { letter: 'c', au: 0.089, radiusInEarths: 1.18, gravityInEarths: 1.15, bearingDegrees: 130, bounty: 400, seed: 40202, surface: { baseColor: '#62473c', darkness: 40, lava: 25 } },
    { letter: 'i', au: 0.107, radiusInEarths: 1.32, gravityInEarths: 1.2, bearingDegrees: -100, bounty: 420, seed: 40303, surface: { baseColor: '#6e5244', darkness: 35, lava: 15, craters: 4 } },
    { letter: 'd', au: 0.32, radiusInEarths: 2.88, gravityInEarths: 1, bearingDegrees: 70, bounty: 450, resource: 'gas', seed: 40404, surface: { baseColor: '#7fb3c9', bands: 3, haze: 30, hazeColor: '#bfe3f0' } },
    { letter: 'e', au: 0.42, radiusInEarths: 2.67, gravityInEarths: 1, bearingDegrees: -40, bounty: 450, resource: 'gas', seed: 40505, surface: { baseColor: '#8cc0b8', bands: 2, haze: 30, hazeColor: '#c8ece6' } },
    { letter: 'f', au: 0.48, radiusInEarths: 2.89, gravityInEarths: 1, bearingDegrees: 190, bounty: 450, resource: 'gas', seed: 40606, surface: { baseColor: '#9fb8d9', bands: 3, haze: 30, hazeColor: '#d0def0' } },
    { letter: 'g', au: 0.71, radiusInEarths: 8.13, gravityInEarths: 0.23, bearingDegrees: 110, bounty: 500, resource: 'gas', seed: 40707, surface: { baseColor: '#d9c49a', variation: 10, bands: 5, haze: 25, hazeColor: '#eadcb8' } },
    {
      letter: 'h',
      au: 1.01,
      radiusInEarths: 11.32,
      gravityInEarths: 1.5,
      bearingDegrees: -150,
      bounty: 550,
      resource: 'gas',
      seed: 40808,
      surface: { baseColor: '#d8a36a', variation: 20, darkness: 25, bands: 6, haze: 10, hazeColor: '#e8d0a0' },
      moons: [
        {
          numeral: 'I',
          distance: 50000,
          bearingDegrees: 30,
          radius: 4000,
          gravityInEarths: 0.3,
          bounty: 600,
          seed: 40818,
          life: true,
          surface: { baseColor: '#2a6db0', land: true, landColor: '#4f8f3f', landCover: 40, polarCap: 15, clouds: 35, haze: 20, hazeColor: '#a8c8ff' },
        },
      ],
    },
  ],
};

export const REAL_SYSTEMS = [
  { sector: [1, 1], system: BARNARDS_STAR },
  { sector: [1, 4], system: TRAPPIST_1 },
  { sector: [4, 25], system: KEPLER_90 },
];
