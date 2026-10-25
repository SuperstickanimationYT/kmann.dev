import { AU, KM, EARTH_MASS, EARTH_RADIUS, SUN_MASS, SUN_RADIUS } from './units.js';
import { createSystem } from './system.js';

const planetFromMeanElements = (name, massKg, radiusM, color, [a, e, i, meanLongitude, periapsisLongitude, node]) => ({
  id: name,
  name,
  kind: 'planet',
  parent: 'Sun',
  massKg,
  radiusM,
  color,
  orbit: { a: a * AU, e, i, node, peri: periapsisLongitude - node, meanAnomaly: meanLongitude - periapsisLongitude },
});

const moon = (name, parent, massKg, radiusKm, color, { aKm, e, i, node, peri = 0, meanAnomaly }) => ({
  id: name,
  name,
  kind: 'moon',
  parent,
  massKg,
  radiusM: radiusKm * KM,
  color,
  orbit: { a: aKm * KM, e, i, node, peri, meanAnomaly },
});

const JUPITER_EQUATOR = { i: 2.2, node: 337.8 };
const SATURN_EQUATOR = { i: 28.05, node: 169.5 };

function solarSystem() {
  return {
    name: 'Solar System',
    author: '',
    description: 'Planets at their J2000 mean orbits (JPL, Standish). Moon orbit angles are approximate.',
    home: 'Earth',
    bodies: [
      { id: 'Sun', name: 'Sun', kind: 'star', parent: null, massKg: SUN_MASS, radiusM: SUN_RADIUS, color: '#ffe3a1', orbit: null },
      planetFromMeanElements('Mercury', 3.3011e23, 2.4397e6, '#a39a91', [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593]),
      planetFromMeanElements('Venus', 4.8675e24, 6.0518e6, '#e6c98f', [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255]),
      planetFromMeanElements('Earth', EARTH_MASS, EARTH_RADIUS, '#73adff', [1.00000261, 0.01671123, 0, 100.46457166, 102.93768193, 0]),
      planetFromMeanElements('Mars', 6.4171e23, 3.3895e6, '#d3734f', [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891]),
      planetFromMeanElements('Jupiter', 1.89813e27, 6.9911e7, '#e0b58c', [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909]),
      planetFromMeanElements('Saturn', 5.6834e26, 5.8232e7, '#ead6a4', [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448]),
      planetFromMeanElements('Uranus', 8.681e25, 2.5362e7, '#a6e1e8', [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503]),
      planetFromMeanElements('Neptune', 1.02413e26, 2.4622e7, '#5d84e8', [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574]),
      planetFromMeanElements('Pluto', 1.303e22, 1.1883e6, '#d8c1a8', [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684]),
      moon('Moon', 'Earth', 7.342e22, 1737.4, '#bdbdbd', { aKm: 384400, e: 0.0549, i: 5.145, node: 125.08, peri: 318.15, meanAnomaly: 135.27 }),
      moon('Io', 'Jupiter', 8.9319e22, 1821.6, '#e8d36a', { aKm: 421700, e: 0.0041, ...JUPITER_EQUATOR, meanAnomaly: 40 }),
      moon('Europa', 'Jupiter', 4.7998e22, 1560.8, '#d9c7a7', { aKm: 670900, e: 0.009, ...JUPITER_EQUATOR, meanAnomaly: 160 }),
      moon('Ganymede', 'Jupiter', 1.4819e23, 2634.1, '#a8998a', { aKm: 1070400, e: 0.0013, ...JUPITER_EQUATOR, meanAnomaly: 260 }),
      moon('Callisto', 'Jupiter', 1.0759e23, 2410.3, '#7f7468', { aKm: 1882700, e: 0.0074, ...JUPITER_EQUATOR, meanAnomaly: 330 }),
      moon('Titan', 'Saturn', 1.3452e23, 2574.7, '#e0a95a', { aKm: 1221870, e: 0.0288, ...SATURN_EQUATOR, meanAnomaly: 120 }),
      moon('Triton', 'Neptune', 2.139e22, 1353.4, '#d6d2cc', { aKm: 354759, e: 0.000016, i: 129.8, node: 49.2, meanAnomaly: 200 }),
    ],
  };
}

const trappistPlanet = (letter, aAu, massEarths, radiusEarths, e, meanAnomaly, color) => ({
  id: `TRAPPIST-1 ${letter}`,
  name: `TRAPPIST-1 ${letter}`,
  kind: 'planet',
  parent: 'TRAPPIST-1',
  massKg: massEarths * EARTH_MASS,
  radiusM: radiusEarths * EARTH_RADIUS,
  color,
  orbit: { a: aAu * AU, e, i: 0, node: 0, peri: 0, meanAnomaly },
});

function trappist1() {
  return {
    name: 'TRAPPIST-1',
    author: '',
    description: 'Seven Earth-sized planets in a chain of resonances (Agol et al. 2021). Tightly packed, yet stable.',
    home: 'TRAPPIST-1 e',
    bodies: [
      { id: 'TRAPPIST-1', name: 'TRAPPIST-1', kind: 'star', parent: null, massKg: 0.0898 * SUN_MASS, radiusM: 0.1192 * SUN_RADIUS, color: '#ff8a5c', orbit: null },
      trappistPlanet('b', 0.01154, 1.374, 1.116, 0.004, 10, '#c98f6f'),
      trappistPlanet('c', 0.0158, 1.308, 1.097, 0.002, 95, '#b98c74'),
      trappistPlanet('d', 0.02227, 0.388, 0.788, 0.006, 170, '#a6b3c2'),
      trappistPlanet('e', 0.02925, 0.692, 0.92, 0.005, 240, '#7fb0e6'),
      trappistPlanet('f', 0.03849, 1.039, 1.045, 0.01, 300, '#9fc7d6'),
      trappistPlanet('g', 0.04683, 1.321, 1.129, 0.002, 20, '#b8c9d9'),
      trappistPlanet('h', 0.06189, 0.326, 0.755, 0.006, 130, '#d0d6de'),
    ],
  };
}

export const PRESETS = {
  solar: { label: 'Solar System', build: solarSystem },
  trappist: { label: 'TRAPPIST-1', build: trappist1 },
  empty: { label: 'One Sun-like star', build: createSystem },
};
