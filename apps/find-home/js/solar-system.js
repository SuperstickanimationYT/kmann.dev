import { DEGREES, equatorialToFrame, SUN_POSITION } from './milky-way.js';
import { add, cross, dot, normalize, rotateAbout, scale, subtract } from './vectors.js';

export const KM_PER_PC = 3.0857e13;
const KM_PER_AU = 1.495978707e8;
const HOLD_RADII = 200;
const LOWEST_ALTITUDE_KM = 30;
const LOWEST_ALTITUDE_RADII = 0.5;
export const lowestAltitudeKm = (body) => Math.min(LOWEST_ALTITUDE_KM, LOWEST_ALTITUDE_RADII * body.radiusKm);
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;
const DAYS_PER_CENTURY = 36525;
const OBLIQUITY = 23.43928 * DEGREES;
const MOON_DISTANCE_KM = 384400;
const MOON_ELEMENTS_EPOCH_DAYS = -1.5;
const EARTH_SHARE_OF_MOON_OFFSET = 1 / 82.3;
const DAYS_PER_YEAR = 365.25;
const ORBIT_PATH_POINTS = 256;
const SYNCHRONOUS_LOOKAHEAD_DAYS = 0.01;

const SATELLITE_ORBITS = {
  Phobos: { laplacePole: [317.7, 52.9], a: 9375, e: 0.015, inclination: 1.075, node: 100.3506, nodeDegreesPerYear: -156.5217, periapsisLongitude: 172.3259, apsisDegreesPerYear: 327.2727, meanLongitude: 215.0929, degreesPerDay: 1128.84476212, degreesPerCenturySquared: 12.737, parentShare: 1.655e-8 },
  Deimos: { laplacePole: [316.6, 53.5], a: 23458, e: 0.0003, inclination: 1.783, node: 48.3983, nodeDegreesPerYear: -6.4057, periapsisLongitude: 78.7949, meanLongitude: 259.4053, degreesPerDay: 285.161883537, parentShare: 2.246e-9 },
  Io: { laplacePole: [268.1, 64.5], a: 421766, e: 0.0041, inclination: 0.026, node: 352.1477, periapsisLongitude: 260.325, apsisDegreesPerYear: 270.0675, meanLongitude: 19.9129, degreesPerDay: 203.488957799, parentShare: 0.00004704 },
  Europa: { laplacePole: [268.1, 64.5], a: 671220, e: 0.0089, inclination: 0.467, node: 187.1252, nodeDegreesPerYear: -11.9197, periapsisLongitude: 38.0982, apsisDegreesPerYear: 258.2496, meanLongitude: 214.456, degreesPerDay: 101.374724031, parentShare: 0.00002528 },
  Ganymede: { laplacePole: [268.2, 64.6], a: 1070496, e: 0.0026, inclination: 0.248, node: 56.4294, nodeDegreesPerYear: -2.6123, periapsisLongitude: 196.0142, apsisDegreesPerYear: 5.2708, meanLongitude: 221.6465, degreesPerDay: 50.317606766, parentShare: 0.00007804 },
  Callisto: { laplacePole: [268.7, 64.8], a: 1881938, e: 0.0072, inclination: 0.22, node: 298.1646, nodeDegreesPerYear: -0.6236, periapsisLongitude: 336.7365, apsisDegreesPerYear: 1.2953, meanLongitude: 80.3703, degreesPerDay: 21.571074288, degreesPerCenturySquared: 0.059, parentShare: 0.00005667 },
  Mimas: { laplacePole: [40.6, 83.5], a: 185555, e: 0.0193, inclination: 1.565, node: 175.2434, nodeDegreesPerYear: -365.1116, periapsisLongitude: 44.0493, apsisDegreesPerYear: 730.2231, meanLongitude: 160.3617, degreesPerDay: 381.994499352, degreesPerCenturySquared: 0.122, libration: { degrees: 43.583, years: 70.75, phase: 140.02 }, parentShare: 6.599e-8 },
  Enceladus: { laplacePole: [40.6, 83.5], a: 238034, e: 0.0047, inclination: 0.046, node: 184.1125, periapsisLongitude: 170.3453, apsisDegreesPerYear: 123.4568, meanLongitude: 182.1064, degreesPerDay: 262.731893947, parentShare: 1.901e-7 },
  Tethys: { laplacePole: [40.6, 83.5], a: 294673, e: 0, inclination: 1.106, node: 261.3302, nodeDegreesPerYear: -72.2601, meanLongitude: 188.3822, degreesPerDay: 190.697910483, libration: { degrees: 2.094, years: 70.75, phase: 320.42 }, parentShare: 0.000001086 },
  Dione: { laplacePole: [40.6, 83.5], a: 377413, e: 0.0022, inclination: 0.065, node: 187.707, periapsisLongitude: 210.8165, apsisDegreesPerYear: 30.7745, meanLongitude: 176.916, degreesPerDay: 131.534930881, parentShare: 0.000001928 },
  Rhea: { laplacePole: [40.6, 83.5], a: 527060, e: 0.001, inclination: 0.3, node: 359.5387, nodeDegreesPerYear: -10.0629, periapsisLongitude: 284.5247, apsisDegreesPerYear: 10.6073, meanLongitude: 52.1632, degreesPerDay: 79.690045779, parentShare: 0.000004058 },
  Titan: { laplacePole: [36.4, 84], a: 1220487, e: 0.0288, inclination: 0.35, node: 27.2714, nodeDegreesPerYear: -0.5237, periapsisLongitude: 194.3573, apsisDegreesPerYear: 1.0384, meanLongitude: 11.7639, degreesPerDay: 22.576971172, degreesPerCenturySquared: -0.126, parentShare: 0.0002366 },
  Iapetus: { laplacePole: [288.7, 78.9], a: 3563363, e: 0.0285, inclination: 7.534, node: 74.9409, nodeDegreesPerYear: -0.115, periapsisLongitude: 350.1722, apsisDegreesPerYear: 0.2165, meanLongitude: 200.1105, degreesPerDay: 4.537983394, degreesPerCenturySquared: 0.429, parentShare: 0.000003177 },
  Miranda: { laplacePole: [77.311, 15.175], a: 129846, e: 0.0014, inclination: 4.426, node: 100.8531, nodeDegreesPerYear: -20.2395, periapsisLongitude: 69.7183, apsisDegreesPerYear: 40.273, meanLongitude: 327.881, degreesPerDay: 254.690658021, parentShare: 7.594e-7 },
  Ariel: { laplacePole: [77.311, 15.175], a: 190931, e: 0.0005, inclination: 0.019, node: 104.8668, periapsisLongitude: 279.2461, apsisDegreesPerYear: 12.4563, meanLongitude: 203.1749, degreesPerDay: 142.835652547, degreesPerCenturySquared: -0.309, parentShare: 0.00001441 },
  Umbriel: { laplacePole: [77.311, 15.175], a: 265963, e: 0.0041, inclination: 0.078, node: 174.6108, nodeDegreesPerYear: -2.7704, periapsisLongitude: 273.1461, apsisDegreesPerYear: 5.6139, meanLongitude: 251.22, degreesPerDay: 86.868874247, parentShare: 0.00001469 },
  Titania: { laplacePole: [77.311, 15.175], a: 436343, e: 0.0018, inclination: 0.04, node: 7.1265, nodeDegreesPerYear: -0.2189, periapsisLongitude: 222.4739, apsisDegreesPerYear: 0.6208, meanLongitude: 281.5639, degreesPerDay: 41.351414845, parentShare: 0.00003916 },
  Oberon: { laplacePole: [77.311, 15.175], a: 583419, e: 0.0009, inclination: 0.194, node: 73.5365, nodeDegreesPerYear: -1.8672, periapsisLongitude: 148.0477, apsisDegreesPerYear: 2.2698, meanLongitude: 352.5627, degreesPerDay: 26.739481987, parentShare: 0.00003543 },
  Triton: { laplacePole: [299.36, 43.46], a: 354758, e: 0, inclination: 156.823, node: 177.6213, nodeDegreesPerYear: 0.5332, meanLongitude: 235.9719, degreesPerDay: 61.260181416, degreesPerCenturySquared: -0.094, parentShare: 0.0002090 },
};

const PLANET_ORBITS = {
  Mercury: [[0.38709927, 0.00000037], [0.20563593, 0.00001906], [7.00497902, -0.00594749], [252.2503235, 149472.67411175], [77.45779628, 0.16047689], [48.33076593, -0.12534081]],
  Venus: [[0.72333566, 0.0000039], [0.00677672, -0.00004107], [3.39467605, -0.0007889], [181.9790995, 58517.81538729], [131.60246718, 0.00268329], [76.67984255, -0.27769418]],
  Earth: [[1.00000261, 0.00000562], [0.01671123, -0.00004392], [-0.00001531, -0.01294668], [100.46457166, 35999.37244981], [102.93768193, 0.32327364], [0, 0]],
  Mars: [[1.52371034, 0.00001847], [0.0933941, 0.00007882], [1.84969142, -0.00813131], [-4.55343205, 19140.30268499], [-23.94362959, 0.44441088], [49.55953891, -0.29257343]],
  Jupiter: [[5.202887, -0.00011607], [0.04838624, -0.00013253], [1.30439695, -0.00183714], [34.39644051, 3034.74612775], [14.72847983, 0.21252668], [100.47390909, 0.20469106]],
  Saturn: [[9.53667594, -0.0012506], [0.05386179, -0.00050991], [2.48599187, 0.00193609], [49.95424423, 1222.49362201], [92.59887831, -0.41897216], [113.66242448, -0.28867794]],
  Uranus: [[19.18916464, -0.00196176], [0.04725744, -0.00004397], [0.77263783, -0.00242939], [313.23810451, 428.48202785], [170.9542763, 0.40805281], [74.01692503, 0.04240589]],
  Neptune: [[30.06992276, 0.00026291], [0.00859048, 0.00005105], [1.77004347, 0.00035372], [-55.12002969, 218.45945325], [44.96476227, -0.32241464], [131.78422574, -0.00508664]],
};

export const BODIES = [
  { name: 'Sun', kind: 'star', radiusKm: 695700, pole: [286.13, 63.87], spin: [84.176, 14.1844], tint: [1, 0.96, 0.88] },
  { name: 'Mercury', kind: 'rocky', radiusKm: 2439.7, pole: [281.0103, 61.4155], spin: [329.5988, 6.1385108], tint: [0.55, 0.52, 0.5], magnitude: -0.6 },
  { name: 'Venus', kind: 'clouded', radiusKm: 6051.8, pole: [272.76, 67.16], spin: [160.2, -1.4813688], cloudSpin: [0, -90], tint: [0.93, 0.86, 0.68], magnitude: -4.47, map: 'venus', mapKmPerPixel: 37.1, roughness: 0, ground: { roughness: 0.04, craters: 0.15, viewFromKm: 60, air: { tint: [0.8, 0.55, 0.26], scaleKm: 15.9, glow: [0.95, 0.7, 0.35], hazeKm: 20, sunset: [0.7, 0.4, 0.15], overcast: 1 } } },
  { name: 'Earth', kind: 'ocean', radiusKm: 6371, pole: [0, 90], spin: [190.147, 360.9856235], tint: [0.3, 0.42, 0.6], magnitude: -3.86, map: 'earth', mapKmPerPixel: 39.1, roughness: 0.3, ground: { roughness: 0.03, craters: 0, sea: true, clouds: { baseKm: 1.5, topKm: 5, extinctionPerKm: 3, coverShift: 0 }, air: { tint: [0.28, 0.5, 1], scaleKm: 8, glow: [1, 0.95, 0.85], hazeKm: 80, sunset: [1, 0.45, 0.15] } } },
  { name: 'Moon', kind: 'rocky', parent: 'Earth', radiusKm: 1737.4, pole: [269.9949, 66.5392], spin: [38.3213, 13.17635815], tint: [0.6, 0.58, 0.55], magnitude: 0.21, map: 'moon', mapKmPerPixel: 10.7, roughness: 0.5, ground: { roughness: 0.06, craters: 1 } },
  { name: 'Mars', kind: 'rocky', radiusKm: 3389.5, pole: [317.269202, 54.432516], spin: [176.049863, 350.891982443297], tint: [0.7, 0.42, 0.25], magnitude: -1.52, map: 'mars', mapKmPerPixel: 20.8, roughness: 0.35, ground: { roughness: 0.05, craters: 0.4, clouds: { baseKm: 14, topKm: 20, extinctionPerKm: 0.08, coverShift: -0.06 }, air: { tint: [0.78, 0.56, 0.38], scaleKm: 11, glow: [0.45, 0.6, 0.85], hazeKm: 30, sunset: [0.45, 0.6, 0.85] } } },
  { name: 'Jupiter', kind: 'giant', radiusKm: 69911, pole: [268.056595, 64.495303], spin: [284.95, 870.536], tint: [0.82, 0.74, 0.62], magnitude: -9.4 },
  { name: 'Saturn', kind: 'giant', rings: true, radiusKm: 58232, pole: [40.589, 83.537], spin: [38.9, 810.7939024], tint: [0.88, 0.8, 0.62], magnitude: -8.88 },
  { name: 'Uranus', kind: 'giant', radiusKm: 25362, pole: [257.311, -15.175], spin: [203.81, -501.1600928], tint: [0.66, 0.85, 0.88], magnitude: -7.19 },
  { name: 'Titan', kind: 'hazy', parent: 'Saturn', radiusKm: 2574.76, pole: [39.4827, 83.4279], spin: [186.5855, 22.5769768], tint: [0.8, 0.56, 0.3], magnitude: -1.28, map: 'titan', mapKmPerPixel: 15.8, roughness: 0, ground: { roughness: 0.03, craters: 0.1, viewFromKm: 120, air: { tint: [0.5, 0.33, 0.15], scaleKm: 21, glow: [0.6, 0.42, 0.2], hazeKm: 8, sunset: [0.4, 0.22, 0.08], overcast: 0.9 } } },
  { name: 'Neptune', kind: 'giant', radiusKm: 24622, pole: [299.36, 43.46], spin: [249.978, 541.1397757], tint: [0.36, 0.5, 0.85], magnitude: -6.87 },
  { name: 'Phobos', kind: 'rocky', parent: 'Mars', synchronous: true, radiusKm: 11.08, tint: [0.42, 0.4, 0.38], magnitude: 11.8 },
  { name: 'Deimos', kind: 'rocky', parent: 'Mars', synchronous: true, radiusKm: 6.2, tint: [0.48, 0.45, 0.42], magnitude: 12.89 },
  { name: 'Io', kind: 'rocky', parent: 'Jupiter', synchronous: true, radiusKm: 1821.49, tint: [0.9, 0.82, 0.45], magnitude: -1.68 },
  { name: 'Europa', kind: 'rocky', parent: 'Jupiter', synchronous: true, radiusKm: 1560.8, tint: [0.85, 0.8, 0.72], magnitude: -1.41 },
  { name: 'Ganymede', kind: 'rocky', parent: 'Jupiter', synchronous: true, radiusKm: 2631.2, tint: [0.62, 0.58, 0.53], magnitude: -2.09 },
  { name: 'Callisto', kind: 'rocky', parent: 'Jupiter', synchronous: true, radiusKm: 2410.3, tint: [0.45, 0.42, 0.38], magnitude: -1.05 },
  { name: 'Mimas', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 198.2, tint: [0.75, 0.75, 0.74], magnitude: 3.3 },
  { name: 'Enceladus', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 252.1, tint: [0.95, 0.96, 0.97], magnitude: 2.1 },
  { name: 'Tethys', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 531.1, tint: [0.88, 0.88, 0.87], magnitude: 0.6 },
  { name: 'Dione', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 561.4, tint: [0.82, 0.82, 0.8], magnitude: 0.8 },
  { name: 'Rhea', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 763.5, tint: [0.8, 0.79, 0.77], magnitude: 0.1 },
  { name: 'Iapetus', kind: 'rocky', parent: 'Saturn', synchronous: true, radiusKm: 734.3, tint: [0.6, 0.52, 0.42], magnitude: 1.5 },
  { name: 'Miranda', kind: 'rocky', parent: 'Uranus', synchronous: true, radiusKm: 235.8, tint: [0.65, 0.65, 0.66], magnitude: 3.6 },
  { name: 'Ariel', kind: 'rocky', parent: 'Uranus', synchronous: true, radiusKm: 578.9, tint: [0.68, 0.67, 0.66], magnitude: 1.45 },
  { name: 'Umbriel', kind: 'rocky', parent: 'Uranus', synchronous: true, radiusKm: 584.7, tint: [0.4, 0.4, 0.41], magnitude: 2.1 },
  { name: 'Titania', kind: 'rocky', parent: 'Uranus', synchronous: true, radiusKm: 788.9, tint: [0.6, 0.57, 0.55], magnitude: 1.02 },
  { name: 'Oberon', kind: 'rocky', parent: 'Uranus', synchronous: true, radiusKm: 761.4, tint: [0.55, 0.52, 0.5], magnitude: 1.23 },
  { name: 'Triton', kind: 'rocky', parent: 'Neptune', synchronous: true, radiusKm: 1352.6, tint: [0.8, 0.75, 0.72], magnitude: -1.24 },
];

export const MAPPED_BODIES = BODIES.filter((body) => body.map);

function solveKepler(meanAnomaly, e) {
  let E = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let step = 0; step < 12; step++) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

function orbitPoint({ a, e, inclination, node, periapsisArgument, meanAnomaly }) {
  const E = solveKepler(meanAnomaly, e);
  const along = a * (Math.cos(E) - e);
  const across = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const [cw, sw, cn, sn, ci, si] = [Math.cos(periapsisArgument), Math.sin(periapsisArgument), Math.cos(node), Math.sin(node), Math.cos(inclination), Math.sin(inclination)];
  return [
    (cw * cn - sw * sn * ci) * along + (-sw * cn - cw * sn * ci) * across,
    (cw * sn + sw * cn * ci) * along + (-sw * sn + cw * cn * ci) * across,
    sw * si * along + cw * si * across,
  ];
}

function eclipticToFrame([x, y, z]) {
  const c = Math.cos(OBLIQUITY);
  const s = Math.sin(OBLIQUITY);
  return equatorialToFrame([x, y * c - z * s, y * s + z * c]);
}

function planetElements(name, centuries) {
  const [a, e, i, L, perihelion, node] = PLANET_ORBITS[name].map(([value, rate]) => value + rate * centuries);
  return { a, e, inclination: i * DEGREES, node: node * DEGREES, periapsisArgument: (perihelion - node) * DEGREES, meanAnomaly: (L - perihelion) * DEGREES };
}

const planetOffsetAu = (name, centuries) => orbitPoint(planetElements(name, centuries));

function moonElements(daysSinceJ2000) {
  const days = daysSinceJ2000 - MOON_ELEMENTS_EPOCH_DAYS;
  return {
    a: MOON_DISTANCE_KM,
    e: 0.0549,
    inclination: 5.1454 * DEGREES,
    node: (125.1228 - 0.0529538083 * days) * DEGREES,
    periapsisArgument: (318.0634 + 0.1643573223 * days) * DEGREES,
    meanAnomaly: (115.3654 + 13.0649929509 * days) * DEGREES,
  };
}

function satellitePlane(orbit) {
  const pole = equatorialDirection(...orbit.laplacePole);
  const reference = normalize(cross([0, 0, 1], pole));
  return { reference, across: cross(pole, reference), pole };
}

const librationAt = ({ libration }, years) => (libration ? libration.degrees * Math.sin((2 * Math.PI * years) / libration.years + libration.phase * DEGREES) : 0);

function satelliteElements(orbit, days) {
  const years = days / DAYS_PER_YEAR;
  const node = orbit.node + (orbit.nodeDegreesPerYear ?? 0) * years;
  const periapsisLongitude = (orbit.periapsisLongitude ?? 0) + (orbit.apsisDegreesPerYear ?? 0) * years;
  const meanLongitude = orbit.meanLongitude + orbit.degreesPerDay * days + (orbit.degreesPerCenturySquared ?? 0) * (days / DAYS_PER_CENTURY) ** 2 + librationAt(orbit, years);
  return {
    a: orbit.a,
    e: orbit.e,
    inclination: orbit.inclination * DEGREES,
    node: node * DEGREES,
    periapsisArgument: (periapsisLongitude - node) * DEGREES,
    meanAnomaly: (meanLongitude - periapsisLongitude) * DEGREES,
  };
}

const satelliteToFrame = ({ reference, across, pole }) => ([x, y, z]) => equatorialToFrame(add(add(scale(reference, x), scale(across, y)), scale(pole, z)));
const parentOf = (name) => BODIES.find((body) => body.name === name).parent;

const tracedBackFromNow = (elements, toFrame) =>
  Array.from({ length: ORBIT_PATH_POINTS }, (_, step) => toFrame(orbitPoint({ ...elements, meanAnomaly: elements.meanAnomaly - (2 * Math.PI * step) / ORBIT_PATH_POINTS })));

export function orbitPaths(ms) {
  const days = (ms - J2000_MS) / MS_PER_DAY;
  const centuries = days / DAYS_PER_CENTURY;
  return [
    ...Object.keys(PLANET_ORBITS).map((name) => ({ name, parent: 'Sun', pointsKm: tracedBackFromNow(planetElements(name, centuries), (point) => scale(eclipticToFrame(point), KM_PER_AU)) })),
    { name: 'Moon', parent: 'Earth', pointsKm: tracedBackFromNow(moonElements(days), eclipticToFrame) },
    ...Object.entries(SATELLITE_ORBITS).map(([name, orbit]) => ({ name, parent: parentOf(name), pointsKm: tracedBackFromNow(satelliteElements(orbit, days), satelliteToFrame(satellitePlane(orbit))) })),
  ];
}

function equatorialDirection(ra, dec) {
  return [Math.cos(dec * DEGREES) * Math.cos(ra * DEGREES), Math.cos(dec * DEGREES) * Math.sin(ra * DEGREES), Math.sin(dec * DEGREES)];
}

function facingParent(offsetKm, nextOffsetKm) {
  const north = normalize(cross(offsetKm, nextOffsetKm));
  const towardParent = scale(offsetKm, -1);
  return { north, meridian: normalize(subtract(towardParent, scale(north, dot(towardParent, north)))) };
}

function orientation(body, days) {
  const northEquatorial = equatorialDirection(...body.pole);
  const node = normalize(cross([0, 0, 1], northEquatorial));
  const meridianEquatorial = rotateAbout(node, northEquatorial, (body.spin[0] + body.spin[1] * days) * DEGREES);
  return { north: equatorialToFrame(northEquatorial), meridian: equatorialToFrame(meridianEquatorial) };
}

export function placeBodies(ms) {
  const days = (ms - J2000_MS) / MS_PER_DAY;
  const centuries = days / DAYS_PER_CENTURY;
  const fromSun = new Map([['Sun', [0, 0, 0]]]);
  for (const name of Object.keys(PLANET_ORBITS)) fromSun.set(name, scale(eclipticToFrame(planetOffsetAu(name, centuries)), KM_PER_AU));
  const moonOffset = eclipticToFrame(orbitPoint(moonElements(days)));
  const earth = subtract(fromSun.get('Earth'), scale(moonOffset, EARTH_SHARE_OF_MOON_OFFSET));
  fromSun.set('Earth', earth);
  fromSun.set('Moon', add(earth, moonOffset));
  const satelliteOffsets = new Map();
  const synchronousFacing = new Map();
  for (const [name, orbit] of Object.entries(SATELLITE_ORBITS)) {
    const offsetAt = (when) => satelliteToFrame(satellitePlane(orbit))(orbitPoint(satelliteElements(orbit, when)));
    const offset = offsetAt(days);
    satelliteOffsets.set(name, offset);
    synchronousFacing.set(name, facingParent(offset, offsetAt(days + SYNCHRONOUS_LOOKAHEAD_DAYS)));
    const parent = parentOf(name);
    fromSun.set(parent, subtract(fromSun.get(parent), scale(offset, orbit.parentShare)));
  }
  for (const [name, offset] of satelliteOffsets) fromSun.set(name, add(fromSun.get(parentOf(name)), offset));
  return BODIES.map((body) => {
    const fromSunKm = fromSun.get(body.name);
    const sunDistanceKm = Math.hypot(...fromSunKm);
    return {
      ...body,
      ...(body.synchronous ? synchronousFacing.get(body.name) : orientation(body, days)),
      cloudMeridian: body.cloudSpin && orientation({ ...body, spin: body.cloudSpin }, days).meridian,
      fromSunKm,
      centre: add(SUN_POSITION, scale(fromSunKm, 1 / KM_PER_PC)),
      radius: body.radiusKm / KM_PER_PC,
      sunward: sunDistanceKm > 0 ? scale(fromSunKm, -1 / sunDistanceKm) : [0, 0, 1],
      sunDistanceAu: sunDistanceKm / KM_PER_AU,
      mapLayer: MAPPED_BODIES.indexOf(body),
    };
  });
}

export function apparentMagnitude(body, offsetKm) {
  const distanceKm = Math.hypot(...offsetKm);
  const phase = Math.acos(Math.max(-1, Math.min(1, -dot(offsetKm, body.sunward) / distanceKm)));
  const lambert = (1 - phase / Math.PI) * Math.cos(phase) + Math.sin(phase) / Math.PI;
  return body.magnitude + 5 * Math.log10(body.sunDistanceAu * (distanceKm / KM_PER_AU)) - 2.5 * Math.log10(Math.max(lambert, 1e-6));
}

export function holdingBody(bodies, cameraFromSunKm) {
  let holder = bodies[0];
  let nearest = Infinity;
  for (const body of bodies) {
    const distance = Math.hypot(...subtract(cameraFromSunKm, body.fromSunKm));
    if (body.kind !== 'star' && distance < HOLD_RADII * body.radiusKm && distance < nearest) {
      holder = body;
      nearest = distance;
    }
  }
  return holder;
}

export function arrivalNear(body, from) {
  const away = normalize(subtract(from, body.centre));
  const side = normalize(add(body.sunward, scale(away, 0.6)));
  return add(body.centre, scale(side, 3 * body.radius));
}

function pixelsOf(bitmap, channel) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const values = new Uint8Array(bitmap.width * bitmap.height);
  for (let i = 0; i < values.length; i++) values[i] = rgba[i * 4 + channel];
  return { width: bitmap.width, height: bitmap.height, values };
}

const mapImage = (url, options) => fetch(url).then((response) => response.blob()).then((blob) => createImageBitmap(blob, options));

export async function loadBodyMaps(folder, onLoaded) {
  const ranges = await fetch(new URL('maps.json', folder)).then((response) => response.json());
  await Promise.all(MAPPED_BODIES.map(async (body, layer) => {
    const [colour, height] = await Promise.all([
      mapImage(new URL(`${body.map}-colour.webp`, folder), { premultiplyAlpha: 'none' }),
      mapImage(new URL(`${body.map}-height.webp`, folder), { colorSpaceConversion: 'none' }),
    ]);
    const { lowKm, highKm, datumKm = 0 } = ranges[body.name];
    const heights = pixelsOf(height, 0);
    onLoaded(layer, {
      colour,
      heights,
      relief: (highKm - lowKm) / body.radiusKm,
      ground: body.ground && {
        ...body.ground,
        lowKm: lowKm - datumKm,
        rangeKm: highKm - lowKm,
        heights,
        land: body.ground.sea ? pixelsOf(colour, 3) : null,
      },
    });
  }));
}
