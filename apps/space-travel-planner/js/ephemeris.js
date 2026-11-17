import { eccentricAnomaly, elementsToState, trueFromEccentric } from './kepler.js';

export const AU_KM = 149597870.7;
export const SUN_MU = 1.32712440018e11;
export const DAY_SECONDS = 86400;
export const J2000 = 2451545.0;

const DEGREES = Math.PI / 180;
const DAYS_PER_CENTURY = 36525;
const PRECISE_RANGE = [2378496.5, 2469807.5];

const ELEMENT_KEYS = ['a', 'e', 'i', 'meanLongitude', 'periapsisLongitude', 'raan'];

const PRECISE = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
  earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
  mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
};

const LONG_RANGE = {
  mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], [0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
  venus: [[0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496], [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174]],
  earth: [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856]],
  mars: [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
  jupiter: [[5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654], [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619]],
  saturn: [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002]],
  uranus: [[19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215], [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699]],
  neptune: [[30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853], [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302]],
};

const LONG_RANGE_MEAN_ANOMALY_TERMS = {
  jupiter: { b: -0.00012452, c: 0.0606406, s: -0.35635438, f: 38.35125 },
  saturn: { b: 0.00025899, c: -0.13434469, s: 0.87320147, f: 38.35125 },
  uranus: { b: 0.00058331, c: -0.97731848, s: 0.17689245, f: 7.67025 },
  neptune: { b: -0.00041348, c: 0.68346318, s: -0.10162547, f: 7.67025 },
};

export const PLANETS = Object.keys(PRECISE);

export function usesPreciseTable(julianDate) {
  return julianDate >= PRECISE_RANGE[0] && julianDate <= PRECISE_RANGE[1];
}

export function planetElements(planet, julianDate) {
  if (!PRECISE[planet]) throw new Error(`Unknown planet: ${planet}`);
  const precise = usesPreciseTable(julianDate);
  const [base, rate] = (precise ? PRECISE : LONG_RANGE)[planet];
  const centuries = (julianDate - J2000) / DAYS_PER_CENTURY;
  const value = Object.fromEntries(ELEMENT_KEYS.map((key, index) => [key, base[index] + rate[index] * centuries]));

  const extra = precise ? null : LONG_RANGE_MEAN_ANOMALY_TERMS[planet];
  const meanAnomalyCorrection = extra
    ? extra.b * centuries ** 2 + extra.c * Math.cos(extra.f * centuries * DEGREES) + extra.s * Math.sin(extra.f * centuries * DEGREES)
    : 0;

  return {
    a: value.a * AU_KM,
    e: value.e,
    i: value.i * DEGREES,
    raan: value.raan * DEGREES,
    argPeriapsis: (value.periapsisLongitude - value.raan) * DEGREES,
    meanAnomaly: (value.meanLongitude - value.periapsisLongitude + meanAnomalyCorrection) * DEGREES,
  };
}

export function planetState(planet, julianDate) {
  const elements = planetElements(planet, julianDate);
  const eccentric = eccentricAnomaly(elements.meanAnomaly, elements.e);
  return elementsToState({ ...elements, trueAnomaly: trueFromEccentric(eccentric, elements.e) }, SUN_MU);
}
