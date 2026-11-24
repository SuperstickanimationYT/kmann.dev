import { DEGREES } from './milky-way.js';

export const MAX_BANDS = 32;
export const MAX_JETS = 14;
export const MAX_SPOTS = 24;

const WHITE_OVAL = [0.94, 0.91, 0.86];
const BROWN_BARGE = [0.46, 0.3, 0.22];

const spread = (count, { apart, ...spot }) => Array.from({ length: count }, (_, k) => ({ ...spot, east: spot.east + k * apart + 7 * Math.sin(k * 2.4) }));

const GIANTS = {
  Jupiter: {
    bands: [
      [-90, 0.5, 0.5, 0.5, 1], [-66, 0.55, 0.54, 0.52, 1.1], [-54, 0.62, 0.58, 0.53, 0.9], [-47, 0.72, 0.67, 0.6, 0.6],
      [-43, 0.63, 0.56, 0.49, 0.8], [-39, 0.74, 0.68, 0.6, 0.6], [-34, 0.66, 0.57, 0.48, 0.7], [-31, 0.77, 0.71, 0.63, 0.4],
      [-28, 0.69, 0.6, 0.5, 0.6], [-25, 0.85, 0.8, 0.72, 0.4], [-21.5, 0.85, 0.79, 0.7, 0.5], [-19.5, 0.63, 0.46, 0.35, 1.1],
      [-15, 0.72, 0.58, 0.47, 1.6], [-11, 0.58, 0.4, 0.3, 0.9], [-8.5, 0.6, 0.42, 0.31, 0.6], [-6.5, 0.87, 0.82, 0.74, 0.6],
      [-1, 0.88, 0.85, 0.77, 0.7], [0.5, 0.82, 0.77, 0.66, 0.5], [4, 0.86, 0.83, 0.76, 1], [6.5, 0.74, 0.73, 0.7, 1.2],
      [8.5, 0.6, 0.41, 0.29, 1.2], [13, 0.64, 0.43, 0.3, 1.5], [16, 0.68, 0.5, 0.38, 0.9], [18, 0.9, 0.87, 0.82, 0.3],
      [23, 0.88, 0.84, 0.78, 0.3], [25, 0.71, 0.56, 0.42, 0.4], [28, 0.78, 0.7, 0.6, 0.6], [33, 0.73, 0.66, 0.58, 0.7],
      [38, 0.66, 0.59, 0.51, 0.9], [45, 0.69, 0.64, 0.57, 0.9], [58, 0.58, 0.56, 0.53, 1.1], [90, 0.48, 0.48, 0.48, 1],
    ],
    jets: [[-52, 0.1, 3], [-36, 0.1, 2], [-29, -0.08, 2], [-20, -0.22, 2], [-7, 0.4, 3], [0, 0.15, 5], [7, 0.4, 3], [17, -0.15, 2], [23.5, 0.5, 1.8], [31, -0.1, 2], [39, 0.1, 2], [48, 0.08, 3]],
    spots: [
      { north: -22, east: 40, wide: 6.6, tall: 4.6, colour: [0.75, 0.43, 0.27], spin: 1, hollow: 0.75 },
      { north: -33, east: 95, wide: 3.2, tall: 2.4, colour: [0.83, 0.68, 0.53], spin: 0.8, hollow: 0.4 },
      ...spread(8, { north: -40.5, east: -150, apart: 34, wide: 1.5, tall: 1.1, colour: WHITE_OVAL, spin: 0, hollow: 0 }),
      ...spread(4, { north: 15.5, east: -120, apart: 80, wide: 2.6, tall: 0.6, colour: BROWN_BARGE, spin: 0, hollow: 0 }),
      ...spread(4, { north: 36, east: -100, apart: 75, wide: 1.3, tall: 0.9, colour: WHITE_OVAL, spin: 0, hollow: 0 }),
    ],
    wake: { spot: 0, degreesWest: 34, strength: 1.4 },
    eddyScale: 9,
    eddySpeed: 0.1,
    streaks: 0.26,
    wisps: 0.6,
    hexagon: 0,
  },
  Saturn: {
    bands: [
      [-90, 0.52, 0.49, 0.42, 0.6], [-75, 0.6, 0.56, 0.45, 0.6], [-60, 0.7, 0.64, 0.5, 0.5], [-50, 0.76, 0.69, 0.53, 0.5], [-42, 0.74, 0.65, 0.48, 0.5],
      [-35, 0.8, 0.71, 0.53, 0.4], [-27, 0.77, 0.67, 0.48, 0.4], [-20, 0.82, 0.73, 0.54, 0.4], [-13, 0.79, 0.68, 0.48, 0.4], [-8, 0.88, 0.79, 0.59, 0.3],
      [0, 0.91, 0.83, 0.64, 0.3], [8, 0.88, 0.79, 0.59, 0.3], [14, 0.8, 0.69, 0.49, 0.4], [20, 0.83, 0.73, 0.54, 0.4], [27, 0.77, 0.68, 0.5, 0.4],
      [34, 0.8, 0.72, 0.54, 0.5], [40, 0.74, 0.66, 0.5, 0.6], [47, 0.77, 0.69, 0.53, 0.6], [56, 0.7, 0.64, 0.5, 0.6], [66, 0.67, 0.62, 0.49, 0.6],
      [74, 0.69, 0.64, 0.5, 0.4], [76.5, 0.6, 0.56, 0.45, 0.4], [78, 0.71, 0.66, 0.52, 0.3], [84, 0.62, 0.59, 0.49, 0.6], [88, 0.5, 0.47, 0.4, 0.4], [90, 0.36, 0.33, 0.28, 0.2],
    ],
    jets: [[-60, 0.12, 4], [-47, 0.12, 3], [0, 0.5, 16], [30, 0.06, 4], [47, 0.14, 3], [60, 0.12, 3], [77, 0.2, 2]],
    spots: [
      { north: -42, east: 60, wide: 1.8, tall: 1.2, colour: [0.86, 0.8, 0.66], spin: 0.5, hollow: 0 },
      ...spread(5, { north: 41, east: -140, apart: 64, wide: 0.9, tall: 0.6, colour: [0.86, 0.8, 0.66], spin: 0, hollow: 0 }),
    ],
    eddyScale: 12,
    eddySpeed: 0.03,
    streaks: 0.07,
    wisps: 0.25,
    hexagon: 1,
  },
  Uranus: {
    bands: [
      [-90, 0.6, 0.76, 0.78, 0.2], [-50, 0.6, 0.77, 0.8, 0.3], [-20, 0.61, 0.78, 0.81, 0.3], [0, 0.63, 0.79, 0.82, 0.2], [25, 0.63, 0.8, 0.82, 0.3],
      [42, 0.66, 0.82, 0.83, 0.3], [47, 0.74, 0.87, 0.87, 0.2], [70, 0.78, 0.89, 0.88, 0.2], [90, 0.77, 0.88, 0.87, 0.2],
    ],
    jets: [[0, -0.15, 20], [60, 0.2, 12], [-60, 0.2, 12]],
    spots: [],
    eddyScale: 8,
    eddySpeed: 0.02,
    streaks: 0.02,
    wisps: 0.12,
    hexagon: 0,
  },
  Neptune: {
    bands: [
      [-90, 0.53, 0.7, 0.79, 0.4], [-70, 0.47, 0.66, 0.77, 0.5], [-55, 0.52, 0.69, 0.79, 0.5], [-35, 0.49, 0.68, 0.79, 0.5], [-15, 0.53, 0.71, 0.8, 0.4],
      [10, 0.52, 0.7, 0.8, 0.4], [30, 0.49, 0.68, 0.79, 0.5], [60, 0.48, 0.67, 0.78, 0.5], [90, 0.49, 0.67, 0.78, 0.4],
    ],
    jets: [[0, -0.4, 22], [-70, 0.3, 10], [70, 0.3, 10]],
    spots: [
      { north: 23, east: 20, wide: 6, tall: 3, colour: [0.4, 0.58, 0.72], spin: 0.6, hollow: 0 },
      { north: 27.5, east: 22, wide: 5, tall: 0.5, colour: [0.78, 0.86, 0.9], spin: 0, hollow: 0 },
      ...spread(5, { north: -32, east: -130, apart: 62, wide: 5, tall: 0.5, colour: [0.72, 0.83, 0.89], spin: 0, hollow: 0 }),
      ...spread(4, { north: -41, east: -100, apart: 80, wide: 3.5, tall: 0.4, colour: [0.7, 0.82, 0.88], spin: 0, hollow: 0 }),
    ],
    eddyScale: 8,
    eddySpeed: 0.035,
    streaks: 0.05,
    wisps: 0.35,
    hexagon: 0,
  },
};

export const GIANT_NAMES = Object.keys(GIANTS);

export const giantLookOf = (body) => body.giantLook ?? GIANTS[body.name];

const padded = (rows, length, width) => {
  const values = new Float32Array(length * width);
  rows.forEach((row, k) => values.set(row, k * width));
  return values;
};

function wakeUniform({ wake, spots }) {
  if (!wake) return [0, 0, 1, 0];
  const { north, east } = spots[wake.spot];
  return [north * DEGREES, (east - wake.degreesWest) * DEGREES, wake.degreesWest * DEGREES, wake.strength];
}

export function giantUniforms(giant) {
  const { bands, jets, spots } = giant;
  return {
    values: {
      uBandCount: { int: bands.length },
      uJetCount: { int: jets.length },
      uSpotCount: { int: spots.length },
      uSpinningCount: { int: spots.filter(({ spin }) => spin > 0).length },
      uWake: wakeUniform(giant),
      uEddyScale: giant.eddyScale,
      uEddySpeed: giant.eddySpeed,
      uStreaks: giant.streaks,
      uWisps: giant.wisps,
      uHexagon: giant.hexagon,
    },
    arrays: {
      uBandLatitude: [padded(bands.map(([latitude]) => [latitude * DEGREES]), MAX_BANDS, 1), 1],
      uBandColour: [padded(bands.map(([, ...look]) => look), MAX_BANDS, 4), 4],
      uJet: [padded(jets.map(([latitude, speed, width]) => [latitude * DEGREES, speed, width * DEGREES]), MAX_JETS, 3), 3],
      uSpotPlace: [padded(spots.map(({ north, east, wide, tall }) => [north, east, wide, tall].map((degrees) => degrees * DEGREES)), MAX_SPOTS, 4), 4],
      uSpotColour: [padded(spots.map(({ colour, hollow }) => [...colour, hollow]), MAX_SPOTS, 4), 4],
      uSpotSpin: [padded(spots.map(({ north, spin }) => [-Math.sign(north) * spin]), MAX_SPOTS, 1), 1],
    },
  };
}
