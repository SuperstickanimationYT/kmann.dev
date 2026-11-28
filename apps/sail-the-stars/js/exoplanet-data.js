const PLANET_COLUMNS = ['letter', 'earthRadii', 'earthMasses', 'periodDays', 'a', 'e', 'inclination', 'periapsis', 'kelvin', 'transitJd', 'periastronJd', 'radiusMeasured', 'massKnown'];
export const planets = (...rows) => rows.map((row) => Object.fromEntries(PLANET_COLUMNS.map((column, k) => [column, row[k]])));

const JUPITER_RADIUS_KM = 71492;

const PROXIMA_C = {
  ...planets(['c', 2.5, 7, 1928, 1.489, 0.04, null, null, 39, null, null, false, 'least'])[0],
  speculative:
    'Proposed in 2020 from a 5.3-year wobble of the star. A 2022 study traced that signal to how the data were processed, and a 2025 study finds the planet as proposed most likely does not exist. The ring is a 2020 guess to explain a spot in a SPHERE image too bright for a planet this light, if the spot was the planet at all; its shape is borrowed from Saturn\'s rings. The radius is a guess from the least mass.',
  ringOuterKm: 5 * JUPITER_RADIUS_KM,
};

export const EXOPLANET_SYSTEMS = [
  {
    name: 'Proxima Centauri', ra: 217.3934657, dec: -62.6761821, parsecs: 1.30119, motion: [-3781.31, 769.766], radialKmS: 0, kelvin: 2900, radius: 0.141, visual: 11.01,
    planets: planets(
      ['d', 0.692, 0.26, 5.12338, 0.02881, 0, null, 4, 282, null, 2460557.55, false, 'least'],
      ['b', 1.02, 1.055, 11.18465, 0.04848, 0, null, 3.3, 218, 2457897.9, null, false, 'least'],
    ).concat(PROXIMA_C),
  },
  {
    name: "Barnard's Star", ra: 269.4486144, dec: 4.7379808, parsecs: 1.82655, motion: [-802.803, 10362.5], radialKmS: -110.5, kelvin: 3195, radius: 0.185, visual: 9.54,
    planets: planets(
      ['d', 0.694, 0.263, 2.3402, 0.0188, 0.04, null, -51.8, 483, null, 2460243.7, false, 'least'],
      ['b', 0.72, 0.299, 3.1542, 0.0229, 0.03, null, 3.8, 438, 2460139.204, null, false, 'least'],
      ['c', 0.743, 0.335, 4.1244, 0.0274, 0.08, null, 90.8, 400, null, 2460242.92, false, 'least'],
      ['e', 0.637, 0.193, 6.7392, 0.0381, 0.04, null, -27.5, 340, null, 2460245.3, false, 'least'],
    ),
  },
  {
    name: 'Epsilon Eridani', ra: 53.2284306, dec: -9.4581715, parsecs: 3.2026, motion: [-975.376, 20.2655], radialKmS: 16, kelvin: 5020, radius: 0.759, visual: 3.7155,
    planets: planets(['b', 13.8, 317.8, 2680, 3.53, 0.06, 40, 268, 112, null, 2458017.5, false, 'measured']),
  },
  {
    name: 'TRAPPIST-1', ra: 346.6263919, dec: -5.0434618, parsecs: 12.42988881, motion: [901, -492], radialKmS: 0, kelvin: 2566, radius: 0.1192, visual: 17.02,
    planets: planets(
      ['b', 1.116, 1.374, 1.510826, 0.01154, 0.00622, 89.728, 336.86, 397.6, 2457322.514193, null, true, 'measured'],
      ['c', 1.097, 1.308, 2.421937, 0.0158, 0.00654, 89.778, 282.45, 339.7, 2457282.8113871, null, true, 'measured'],
      ['d', 0.788, 0.388, 4.049219, 0.02227, 0.00837, 89.896, -8.73, 286.2, 2457670.1463014, null, true, 'measured'],
      ['e', 0.92, 0.692, 6.101013, 0.02925, 0.0051, 89.793, 108.37, 249.7, 2457660.3676621, null, true, 'measured'],
      ['f', 1.045, 1.039, 9.20754, 0.03849, 0.01007, 89.74, 8.81, 217.7, 2457671.3737299, null, true, 'measured'],
      ['g', 1.129, 1.321, 12.352446, 0.04683, 0.00208, 89.742, 191.34, 197.3, 2457665.3628439, null, true, 'measured'],
      ['h', 0.755, 0.326, 18.772866, 0.06189, 0.00567, 89.805, 338.92, 171.7, 2457662.5741486, null, true, 'measured'],
    ),
  },
  {
    name: '55 Cancri', ra: 133.1468373, dec: 28.3298154, parsecs: 12.5855, motion: [-485.872, -233.651], radialKmS: 27.409, kelvin: 5172, radius: 0.943, visual: 5.95084,
    planets: planets(
      ['e', 1.875, 7.99, 0.7365474, 0.01544, 0.05, 83.59, 86, 1958, 2457063.2096, null, true, 'measured'],
      ['b', 13.9, 263.98, 14.651552, 0.118, 0.0029, 89.73, 23, 700, 2455495.595, null, false, 'measured'],
      ['c', 8.51, 54.47, 44.3936, 0.247, 0.088, 89.73, 31, 499, 2455491.23, null, false, 'measured'],
      ['f', 7.59, 44.81, 260.58, 0.802, 0.063, 89.73, 100, 277, 2455236.4, null, false, 'measured'],
      ['d', 13, 1232.5, 4799, 5.6, 0.0913, 89.73, -90, 105, 2451517.8, null, false, 'measured'],
    ),
  },
  {
    name: 'LHS 1140', ra: 11.248632, dec: -15.2741085, parsecs: 14.9861, motion: [317.585, -596.617], radialKmS: -13.23, kelvin: 3096, radius: 0.2159, visual: 14.15,
    planets: planets(
      ['c', 1.272, 1.91, 3.77794, 0.027, 0.05, 89.8, null, 422, 2458389.2939, null, true, 'measured'],
      ['b', 1.73, 5.6, 24.73723, 0.0946, 0.043, 89.86, null, 226, 2458399.93, null, true, 'measured'],
    ),
  },
  {
    name: '51 Pegasi', ra: 344.3675399, dec: 20.7690958, parsecs: 15.4614, motion: [207.363, 62.094], radialKmS: -33.139, kelvin: 5761, radius: 1.19, visual: 5.45309,
    planets: planets(['b', 14.1, 193.88, 4.2307966, 0.052, 0.0063, 49.8, 0, 1329, 2456326.9323, null, false, 'measured']),
  },
  {
    name: 'Beta Pictoris', ra: 86.8212337, dec: -51.066148, parsecs: 19.7442, motion: [2.49266, 82.577], radialKmS: 0, kelvin: 8039, radius: 1.544, visual: 3.85,
    planets: planets(
      ['c', 12.5, 2765, 1202, 2.7, 0.307, 88.93, -114.9, 1250, null, 2458663.4, false, 'measured'],
      ['b', 18.49, 2765, 8682, 10.07, 0.105, 88.993, 23.7, 1612, null, 2447991, false, 'measured'],
      ['d', 14.12, 762.8, 33200, 26, 0.44, 89, 191, 600, null, 2452600, false, 'measured'],
    ),
  },
  {
    name: 'HD 189733', ra: 300.1821223, dec: 22.7097759, parsecs: 19.7638, motion: [-3.29445, -250.225], radialKmS: -2.204, kelvin: 5052, radius: 0.75, visual: 7.67,
    planets: planets(['b', 12.666, 359.15, 2.21857567, 0.03126, 0, 85.71, 20, 1209, 2453955.5255511, null, true, 'measured']),
  },
  {
    name: 'TOI-700', ra: 97.0957165, dec: -65.5786149, parsecs: 31.1265, motion: [-102.75, 161.805], radialKmS: -4.4, kelvin: 3459, radius: 0.4104, visual: 13.151,
    planets: planets(
      ['b', 0.963, 0.849, 9.97722, 0.0678, 0.032, 89.63, -75, 417, 2458880.0994, null, true, 'guessed'],
      ['c', 2.535, 6.96, 16.0511039, 0.0931, 0.033, 88.942, 81, 356, 2458821.6219, null, true, 'guessed'],
      ['e', 0.919, 0.718, 27.810124, 0.1336, 0.059, 89.89, 70, 272.9, 2460772.46343, null, true, 'guessed'],
      ['d', 1.145, 1.58, 37.423457, 0.1642, 0.042, 89.83, 10, 268.8, 2460763.01612, null, true, 'guessed'],
    ),
  },
  {
    name: 'K2-18', ra: 172.560141, dec: 7.5878315, parsecs: 38.0266, motion: [-80.3765, -133.142], radialKmS: 0.6537, kelvin: 3457, radius: 0.411, visual: 13.477,
    planets: planets(
      ['c', 2.65, 7.51, 8.962, 0.06, 0.47, null, null, 363, null, null, false, 'least'],
      ['b', 2.37, 8.92, 32.939623, 0.1429, 0.2, 89.5785, -5.7, 284, 2457264.39144, null, true, 'measured'],
    ),
  },
  {
    name: 'HR 8799', ra: 346.8701486, dec: 21.1340376, parsecs: 41.2441, motion: [108.301, -49.4804], radialKmS: 0, kelvin: 7400, radius: 1.49338, visual: 5.98,
    planets: planets(
      ['e', 13.11, 3178, 20815.6, 16.4, 0.15, 25, null, 1150, null, 2449940, false, 'measured'],
      ['d', 13, 3000, 37000, 24, 0.6, 38.63, null, 1300, null, 2438859, false, 'measured'],
      ['c', 13, 3000, 69000, 38, 0.5, 29.43, null, 1200, null, 2396093, false, 'measured'],
      ['b', 13, 2000, 170000, 68, 0, 30.27, null, 1200, null, 2453936, false, 'measured'],
    ),
  },
  {
    name: 'HD 209458', ra: 330.7950219, dec: 18.8842419, parsecs: 48.3016, motion: [29.5787, -17.8904], radialKmS: -14.741, kelvin: 6091, radius: 1.19, visual: 7.65,
    planets: planets(['b', 15.58, 232.02, 3.52474859, 0.04707, 0, 86.71, 0, 1459, 2451659.93742, null, true, 'measured']),
  },
  {
    name: 'Kepler-186', ra: 298.652736, dec: 43.9549884, parsecs: 177.594, motion: [2.09856, -4.36055], radialKmS: 0, kelvin: 3755, radius: 0.523, visual: 15.138,
    planets: planets(
      ['b', 1.07, 1.24, 3.8867907, 0.0343, 0, 89.6, null, 571, 2454966.3304, null, true, 'guessed'],
      ['c', 1.25, 2.1, 7.267302, 0.0451, 0, 89.9, null, 464, 2455007.3142, null, true, 'guessed'],
      ['d', 1.4, 2.54, 13.342996, 0.0781, 0, 89.1, null, 379, 2455009.9045, null, true, 'guessed'],
      ['e', 1.27, 2.15, 22.407704, 0.11, 0, 89.84, null, 319, 2454986.8006, null, true, 'guessed'],
      ['f', 1.17, 1.71, 129.9441, 0.432, 0.04, 89.96, null, 177, 2455789.494, null, true, 'guessed'],
    ),
  },
  {
    name: 'Kepler-90', ra: 284.4334642, dec: 49.3051239, parsecs: 848.254, motion: [-4.37917, -3.21398], radialKmS: 0, kelvin: 6080, radius: 1.2, visual: 13.883,
    planets: planets(
      ['b', 1.31, 2.27, 7.008151, 0.074, 0, 89.4, null, 1062, 2454970.6906, null, true, 'guessed'],
      ['c', 1.19, 1.81, 8.719375, 0.089, 0, 89.68, null, 987, 2454972.5687, null, true, 'guessed'],
      ['i', 1.32, 2.3, 14.44912, 0.1201, 0, 89.2, null, 709, 2455644.3488, null, true, 'guessed'],
      ['d', 2.87, 8.6, 59.73667, 0.32, 0, 89.71, null, 520, 2454991.9656, null, true, 'guessed'],
      ['e', 2.66, 7.56, 91.93913, 0.42, 0, 89.79, null, 450, 2454967.3127, null, true, 'guessed'],
      ['f', 2.88, 8.65, 124.9144, 0.48, 0, 89.77, null, 407, 2455087.704, null, true, 'guessed'],
      ['g', 7.718, 15, 210.73514, 0.71704, 0.0292, 89.92, 114.6, 342, 2454979.97608, null, true, 'guessed'],
      ['h', 11.252, 203, 331.60296, 0.97062, 0.0276, 89.927, 119, 294, 2454973.50056, null, true, 'measured'],
    ),
  },
];
