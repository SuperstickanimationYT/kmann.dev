import { DEGREES, equatorialToFrame, SUN_POSITION } from './milky-way.js';
import { settlementOf } from './settlements.js';
import { add, cross, dot, normalize, rotateAbout, scale, subtract } from './vectors.js';

export const KM_PER_PC = 3.0857e13;
export const KM_PER_AU = 1.495978707e8;
const HOLD_RADII = 200;
const LOWEST_ALTITUDE_KM = 30;
const LOWEST_ALTITUDE_RADII = 0.5;
export const lowestAltitudeKm = (body) => Math.min(LOWEST_ALTITUDE_KM, LOWEST_ALTITUDE_RADII * body.radiusKm);
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;
const DAYS_PER_CENTURY = 36525;
const OBLIQUITY = 23.43928 * DEGREES;
const EARTH_SHARE_OF_MOON_OFFSET = 1 / 82.3;
const DAYS_PER_YEAR = 365.25;
export const ORBIT_PATH_POINTS = 256;
export const SYNCHRONOUS_LOOKAHEAD_DAYS = 0.01;

const MOON_ARGUMENTS = [
  [297.8501921, 445267.1114034],
  [357.5291092, 35999.0502909],
  [134.9633964, 477198.8675055],
  [93.272095, 483202.0175233],
  [218.3164477, 481267.88123421],
  [119.75, 131.849],
  [53.09, 479264.29],
  [313.45, 481266.484],
];
const SIDEREAL_MONTH_DAYS = 27.321661;
export const SUN_RADIUS_KM = 695700;
const ECLIPSERS_PER_BODY = 2;
const TT_TABLE_START_YEAR = 1800;
const TT_TABLE_STEP_YEARS = 5;
const MOON_LONGITUDE_TERMS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 218.316721],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 481266.484834],
  [0, 0, 0, 0, 0, 0, 0, 0, 2, 0, -0.001572],
  [0, 0, 0, 0, 0, 1, 0, 0, 0, 0.003987, 0.000092],
  [0, 0, 0, -1, 1, 0, 0, 0, 0, 0.002396, -0.00003],
  [0, 0, 0, 0, 0, 0, 1, 0, 0, 0.000293, -0.000034],
  [0, 0, 0, 2, 0, 0, 0, 0, 0, -0.114336, 0.000022],
  [0, 0, 1, -2, 0, 0, 0, 0, 0, 0.010976, 0.000001],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 6.288771, 0.001102],
  [0, 0, 1, 2, 0, 0, 0, 0, 0, -0.012528, 0],
  [0, 0, 2, -2, 0, 0, 0, 0, 0, -0.000382, 0.000002],
  [0, 0, 2, 0, 0, 0, 0, 0, 0, 0.21362, 0.000073],
  [0, 0, 2, 2, 0, 0, 0, 0, 0, -0.001111, 0],
  [0, 0, 3, 0, 0, 0, 0, 0, 0, 0.010035, 0.000005],
  [0, 0, 4, 0, 0, 0, 0, 0, 0, 0.000537, 0],
  [0, 1, -2, 0, 0, 0, 0, 0, 0, -0.002694, 0.000001],
  [0, 1, -1, 0, 0, 0, 0, 0, 0, -0.040999, 0.000009],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, -0.185466, 0.000006],
  [0, 1, 1, 0, 0, 0, 0, 0, 0, -0.030439, -0.000004],
  [0, 1, 2, 0, 0, 0, 0, 0, 0, -0.002124, 0],
  [0, 2, -1, 0, 0, 0, 0, 0, 0, -0.000712, -0.000001],
  [0, 2, 0, 0, 0, 0, 0, 0, 0, -0.002077, -0.000001],
  [0, 2, 1, 0, 0, 0, 0, 0, 0, -0.000323, 0],
  [1, 0, -2, 0, 0, 0, 0, 0, 0, -0.000489, 0.000001],
  [1, 0, -1, 0, 0, 0, 0, 0, 0, -0.005161, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, -0.034722, -0.000001],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, -0.002348, 0],
  [1, 1, -1, 0, 0, 0, 0, 0, 0, 0.000297, 0.00001],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0.00499, 0.000021],
  [1, 1, 1, 0, 0, 0, 0, 0, 0, 0.000355, 0.000002],
  [2, -2, -1, 0, 0, 0, 0, 0, 0, 0.002058, -0.000001],
  [2, -2, 0, 0, 0, 0, 0, 0, 0, 0.002243, 0.000001],
  [2, -2, 1, 0, 0, 0, 0, 0, 0, 0.00021, 0],
  [2, -1, -2, 0, 0, 0, 0, 0, 0, 0.002395, -0.000001],
  [2, -1, -1, 0, 0, 0, 0, 0, 0, 0.057173, -0.000008],
  [2, -1, 0, -2, 0, 0, 0, 0, 0, 0.000597, 0],
  [2, -1, 0, 0, 0, 0, 0, 0, 0, 0.045843, 0.000002],
  [2, -1, 1, 0, 0, 0, 0, 0, 0, 0.004044, 0.000001],
  [2, -1, 2, 0, 0, 0, 0, 0, 0, 0.000327, 0],
  [2, 0, -4, 0, 0, 0, 0, 0, 0, 0.000264, 0],
  [2, 0, -3, 0, 0, 0, 0, 0, 0, 0.003665, -0.000003],
  [2, 0, -2, 0, 0, 0, 0, 0, 0, 0.058795, -0.000022],
  [2, 0, -1, 0, 0, 0, 0, 0, 0, 1.274023, -0.000231],
  [2, 0, -1, 2, 0, 0, 0, 0, 0, -0.002602, 0.000001],
  [2, 0, 0, -2, 0, 0, 0, 0, 0, 0.015326, 0.000002],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0.658312, -0.000003],
  [2, 0, 0, 2, 0, 0, 0, 0, 0, -0.001595, 0],
  [2, 0, 1, -2, 0, 0, 0, 0, 0, -0.001771, -0.000001],
  [2, 0, 1, 0, 0, 0, 0, 0, 0, 0.053322, 0.000009],
  [2, 0, 1, 2, 0, 0, 0, 0, 0, -0.000275, 0],
  [2, 0, 2, 0, 0, 0, 0, 0, 0, 0.003994, 0.000001],
  [2, 0, 3, 0, 0, 0, 0, 0, 0, 0.000294, 0],
  [2, 1, -2, 0, 0, 0, 0, 0, 0, 0.000692, -0.000001],
  [2, 1, -1, 0, 0, 0, 0, 0, 0, -0.007903, 0.000001],
  [2, 1, 0, -2, 0, 0, 0, 0, 0, -0.000406, -0.000001],
  [2, 1, 0, 0, 0, 0, 0, 0, 0, -0.006779, 0.000001],
  [2, 1, 1, 0, 0, 0, 0, 0, 0, -0.000811, 0.000001],
  [2, 2, -1, 0, 0, 0, 0, 0, 0, -0.000706, 0.000002],
  [3, 0, -2, 0, 0, 0, 0, 0, 0, -0.000339, 0.000001],
  [3, 0, -1, 0, 0, 0, 0, 0, 0, -0.000893, 0],
  [4, -1, -1, 0, 0, 0, 0, 0, 0, 0.001217, 0],
  [4, -1, 0, 0, 0, 0, 0, 0, 0, 0.000521, 0],
  [4, 0, -2, 0, 0, 0, 0, 0, 0, 0.008548, -0.000003],
  [4, 0, -1, 0, 0, 0, 0, 0, 0, 0.010675, -0.000002],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0.003861, 0],
  [4, 0, 1, 0, 0, 0, 0, 0, 0, 0.000549, 0],
];
const MOON_LATITUDE_TERMS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.000002],
  [0, 0, 0, 0, 1, 0, 0, 0, 1, -0.583361, 0.72652],
  [0, 0, 0, 0, 1, 0, 0, 0, 2, 0.008731, 0.007361],
  [0, 0, 0, 0, 1, 0, 0, 0, 0, -29.839941, -23.387897],
  [0, 0, 0, 0, 0, 0, 0, 1, 0, 20.624695, -31.810698],
  [0, 0, 0, -1, 0, 1, 0, 0, 0, 0.000403, 0.000029],
  [0, 0, 0, 1, 0, 1, 0, 0, 0, 0.000407, 0.000027],
  [0, 0, -1, 0, 1, 0, 0, 0, 0, -0.000405, -0.000086],
  [0, 0, 1, 0, 1, 0, 0, 0, 0, 0.000413, 0.000086],
  [0, 0, 0, 1, 0, 0, 0, 0, 0, 5.12812, -0.00038],
  [0, 0, 0, 3, 0, 0, 0, 0, 0, -0.001749, 0],
  [0, 0, 1, -3, 0, 0, 0, 0, 0, 0.000775, -0.000002],
  [0, 0, 1, -1, 0, 0, 0, 0, 0, 0.277695, 0.000067],
  [0, 0, 1, 1, 0, 0, 0, 0, 0, 0.280601, 0.000027],
  [0, 0, 2, -1, 0, 0, 0, 0, 0, 0.008822, 0.000004],
  [0, 0, 2, 1, 0, 0, 0, 0, 0, 0.017199, 0.000004],
  [0, 0, 3, -1, 0, 0, 0, 0, 0, 0.000437, 0.000003],
  [0, 0, 3, 1, 0, 0, 0, 0, 0, 0.001107, -0.000001],
  [0, 1, -1, -1, 0, 0, 0, 0, 0, -0.001873, -0.000001],
  [0, 1, -1, 1, 0, 0, 0, 0, 0, -0.001567, 0],
  [0, 1, 0, -1, 0, 0, 0, 0, 0, -0.001348, 0],
  [0, 1, 0, 1, 0, 0, 0, 0, 0, -0.001798, 0.000001],
  [0, 1, 1, -1, 0, 0, 0, 0, 0, -0.001413, 0],
  [0, 1, 1, 1, 0, 0, 0, 0, 0, -0.001478, 0],
  [1, 0, 0, -1, 0, 0, 0, 0, 0, -0.001337, 0],
  [1, 0, 0, 1, 0, 0, 0, 0, 0, -0.001492, 0],
  [2, -2, 0, -1, 0, 0, 0, 0, 0, 0.000303, 0],
  [2, -1, -1, -1, 0, 0, 0, 0, 0, 0.002069, 0],
  [2, -1, -1, 1, 0, 0, 0, 0, 0, 0.002468, -0.000001],
  [2, -1, 0, -1, 0, 0, 0, 0, 0, 0.00823, 0.000001],
  [2, -1, 0, 1, 0, 0, 0, 0, 0, 0.002213, 0],
  [2, -1, 1, -1, 0, 0, 0, 0, 0, 0.00049, 0],
  [2, -1, 1, 1, 0, 0, 0, 0, 0, 0.000316, 0],
  [2, 0, -3, -1, 0, 0, 0, 0, 0, 0.000422, -0.000001],
  [2, 0, -2, -1, 0, 0, 0, 0, 0, 0.004324, -0.000001],
  [2, 0, -2, 1, 0, 0, 0, 0, 0, -0.000452, 0],
  [2, 0, -1, -1, 0, 0, 0, 0, 0, 0.046272, -0.000003],
  [2, 0, -1, 1, 0, 0, 0, 0, 0, 0.055414, -0.000016],
  [2, 0, 0, -3, 0, 0, 0, 0, 0, 0.000607, 0],
  [2, 0, 0, -1, 0, 0, 0, 0, 0, 0.173236, 0.00001],
  [2, 0, 0, 1, 0, 0, 0, 0, 0, 0.032573, -0.000003],
  [2, 0, 1, -1, 0, 0, 0, 0, 0, 0.009265, 0.000002],
  [2, 0, 1, 1, 0, 0, 0, 0, 0, 0.0042, 0],
  [2, 0, 2, -1, 0, 0, 0, 0, 0, 0.000596, 0],
  [2, 0, 2, 1, 0, 0, 0, 0, 0, 0.000422, 0],
  [2, 1, -1, 1, 0, 0, 0, 0, 0, -0.000367, 0],
  [2, 1, 0, -1, 0, 0, 0, 0, 0, -0.003367, 0],
  [2, 1, 0, 1, 0, 0, 0, 0, 0, -0.000352, 0],
  [4, 0, -1, -1, 0, 0, 0, 0, 0, 0.001828, -0.000001],
  [4, 0, -1, 1, 0, 0, 0, 0, 0, 0.000833, -0.000001],
  [4, 0, 0, -1, 0, 0, 0, 0, 0, 0.001021, 0.000002],
  [4, 0, 0, 1, 0, 0, 0, 0, 0, 0.000331, 0],
];
const MOON_ARGUMENT_CURVES = [
  [-0.0018819, 1 / 545868],
  [-0.0001536, 1 / 24490000],
  [0.0087414, 1 / 69699],
  [-0.0036539, -1 / 3526000],
  [-0.0015786, 1 / 538841],
];
const MOON_PRECESSION_FIT_ROWS = { longitude: 3, latitude: 9 };
const FAR_MOON_LONGITUDE_TERMS = MOON_LONGITUDE_TERMS.slice(MOON_PRECESSION_FIT_ROWS.longitude);
const FAR_MOON_LATITUDE_TERMS = MOON_LATITUDE_TERMS.slice(MOON_PRECESSION_FIT_ROWS.latitude);
const MOON_DISTANCE_TERMS = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 385000.5],
  [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, -3.1],
  [0, 0, 1, -2, 0, 0, 0, 0, 0, 0, 79.6],
  [0, 0, 1, 0, 0, 0, 0, 0, 0, 3.7, -20905.3],
  [0, 0, 2, -2, 0, 0, 0, 0, 0, 0, -4.4],
  [0, 0, 2, 0, 0, 0, 0, 0, 0, 0.2, -569.9],
  [0, 0, 3, 0, 0, 0, 0, 0, 0, 0, -23.2],
  [0, 1, -2, 0, 0, 0, 0, 0, 0, 0, -7],
  [0, 1, -1, 0, 0, 0, 0, 0, 0, 0, -129.9],
  [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 49],
  [0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 104.9],
  [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 5.8],
  [0, 2, -1, 0, 0, 0, 0, 0, 0, 0, -2.1],
  [1, 0, -2, 0, 0, 0, 0, 0, 0, 0, -1.7],
  [1, 0, -1, 0, 0, 0, 0, 0, 0, 0, -8.4],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108.8],
  [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 6.3],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0.1, -16.7],
  [2, -2, -1, 0, 0, 0, 0, 0, 0, 0, -5],
  [2, -2, 0, 0, 0, 0, 0, 0, 0, 0, -9.9],
  [2, -1, -2, 0, 0, 0, 0, 0, 0, 0, 10.1],
  [2, -1, -1, 0, 0, 0, 0, 0, 0, 0, -152.4],
  [2, -1, 0, 0, 0, 0, 0, 0, 0, 0, -205],
  [2, -1, 1, 0, 0, 0, 0, 0, 0, 0, -12.9],
  [2, 0, -3, 0, 0, 0, 0, 0, 0, 0, 14.4],
  [2, 0, -2, 0, 0, 0, 0, 0, 0, 0.1, 246.2],
  [2, 0, -1, -2, 0, 0, 0, 0, 0, 0, 8.8],
  [2, 0, -1, 0, 0, 0, 0, 0, 0, -0.7, -3699.1],
  [2, 0, 0, -2, 0, 0, 0, 0, 0, 0, 10.3],
  [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, -2956],
  [2, 0, 1, -2, 0, 0, 0, 0, 0, 0, 4.1],
  [2, 0, 1, 0, 0, 0, 0, 0, 0, 0, -170.7],
  [2, 0, 2, 0, 0, 0, 0, 0, 0, 0, -10.4],
  [2, 1, -1, 0, 0, 0, 0, 0, 0, 0, 24.3],
  [2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 30.9],
  [2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 2.6],
  [2, 2, -1, 0, 0, 0, 0, 0, 0, 0, 2.4],
  [3, 0, -1, 0, 0, 0, 0, 0, 0, 0, 3.3],
  [4, -1, -1, 0, 0, 0, 0, 0, 0, 0, -4],
  [4, -1, 0, 0, 0, 0, 0, 0, 0, 0, -1.6],
  [4, 0, -2, 0, 0, 0, 0, 0, 0, 0, -21.6],
  [4, 0, -1, 0, 0, 0, 0, 0, 0, 0, -34.8],
  [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, -11.7],
];
const TT_MINUS_UTC_SECONDS = [18.6, 16.8, 15.9, 16.6, 16.7, 14.3, 11, 8.7, 7.8, 8.2, 9.5, 10.5, 9.1, 8.3, 2.4, -1.1, -3.1, -4.3, -3.8, -5, -1.9, 4.9, 11.2, 17.5, 21.6, 23.8, 24.4, 24.2, 24.4, 27.1, 28.9, 30.4, 33.1, 35.7, 40.2, 46.2, 51.2, 54.2, 57.2, 61.2, 64.2, 64.2, 66.2, 67.2, 69.2, 69.2, 69.2, 69.2, 69.2, 69.2, 69.2];

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

const FAR_PLANET_ORBITS = {
  Mercury: [[0.38709843, 0], [0.20563661, 0.00002123], [7.00559432, -0.00590158], [252.25166724, 149472.67486623], [77.45771895, 0.15940013], [48.33961819, -0.12214182]],
  Venus: [[0.72332102, -0.00000026], [0.00676399, -0.00005107], [3.39777545, 0.00043494], [181.9797085, 58517.8156026], [131.76755713, 0.05679648], [76.67261496, -0.27274174]],
  Earth: [[1.00000018, -0.00000003], [0.01673163, -0.00003661], [-0.00054346, -0.01337178], [100.46691572, 35999.37306329], [102.93005885, 0.3179526], [-5.11260389, -0.24123856]],
  Mars: [[1.52371243, 0.00000097], [0.09336511, 0.00009149], [1.85181869, -0.00724757], [-4.56813164, 19140.29934243], [-23.91744784, 0.45223625], [49.71320984, -0.26852431]],
  Jupiter: [[5.20248019, -0.00002864], [0.0485359, 0.00018026], [1.29861416, -0.00322699], [34.33479152, 3034.90371757], [14.27495244, 0.18199196], [100.29282654, 0.13024619]],
  Saturn: [[9.54149883, -0.00003065], [0.05550825, -0.00032044], [2.49424102, 0.00451969], [50.07571329, 1222.11494724], [92.86136063, 0.54179478], [113.63998702, -0.25015002]],
  Uranus: [[19.18797948, -0.00020455], [0.0468574, -0.0000155], [0.77298127, -0.00180155], [314.20276625, 428.49512595], [172.43404441, 0.09266985], [73.96250215, 0.05739699]],
  Neptune: [[30.06952752, 0.00006447], [0.00895439, 0.00000818], [1.7700552, 0.000224], [-55.77710713, 218.46515314], [46.68158724, 0.01009938], [131.78635853, -0.00606302]],
};
const FAR_MEAN_ANOMALY_TERMS = {
  Jupiter: [-0.00012452, 0.0606406, -0.35635438, 38.35125],
  Saturn: [0.00025899, -0.13434469, 0.87320147, 38.35125],
  Uranus: [0.00058331, -0.97731848, 0.17689245, 7.67025],
  Neptune: [-0.00041348, 0.68346318, -0.10162547, 7.67025],
};
const FAR_FUTURE_STARTS = 0.4;
const FAR_FUTURE_FULL = 0.5;

export const BODIES = [
  { name: 'Sun', kind: 'star', radiusKm: SUN_RADIUS_KM, pole: [286.13, 63.87], spin: [84.176, 14.1844], tint: [1, 0.96, 0.88] },
  { name: 'Mercury', kind: 'rocky', radiusKm: 2439.7, pole: [281.0103, 61.4155], spin: [329.5988, 6.1385108], tint: [0.55, 0.52, 0.5], magnitude: -0.6 },
  { name: 'Venus', kind: 'clouded', radiusKm: 6051.8, pole: [272.76, 67.16], spin: [160.2, -1.4813688], cloudSpin: [0, -90], tint: [0.93, 0.86, 0.68], magnitude: -4.47, map: 'venus', mapKmPerPixel: 37.1, roughness: 0, haze: { gas: { depth: [0, 0, 0], scaleKm: 5 }, dust: { depth: [0.3, 0.3, 0.33], light: [0.2, 0.19, 0.15], scaleKm: 5, forwardness: 0.3, sunDimming: 0.4 } }, ground: { roughness: 0.04, craters: 0.15, viewFromKm: 60, air: { tint: [0.8, 0.55, 0.26], scaleKm: 15.9, glow: [0.95, 0.7, 0.35], hazeKm: 20, sunset: [0.7, 0.4, 0.15], overcast: 1 } } },
  { name: 'Earth', reddensEclipses: true, kind: 'ocean', radiusKm: 6371, pole: [0, 90], spin: [190.147, 360.9856235], tint: [0.3, 0.42, 0.6], magnitude: -3.86, map: 'earth', mapKmPerPixel: 39.1, roughness: 0.3, haze: { gas: { depth: [0.046, 0.108, 0.265], scaleKm: 8 }, dust: { depth: [0.05, 0.05, 0.05], light: [0.05, 0.05, 0.05], scaleKm: 2, forwardness: 0.76, sunDimming: 1 } }, ground: { roughness: 0.03, craters: 0, sea: true, clouds: { mapped: true, baseKm: 1.5, topKm: 6.5, extinctionPerKm: 3, coverShift: 0 }, air: { tint: [0.28, 0.5, 1], scaleKm: 8, glow: [1, 0.95, 0.85], hazeKm: 80, sunset: [1, 0.45, 0.15] } } },
  { name: 'Moon', kind: 'rocky', parent: 'Earth', radiusKm: 1737.4, pole: [269.9949, 66.5392], spin: [38.3213, 13.17635815], tint: [0.6, 0.58, 0.55], magnitude: 0.21, map: 'moon', mapKmPerPixel: 10.7, roughness: 0.5, ground: { roughness: 0.06, craters: 1 } },
  { name: 'Mars', kind: 'rocky', radiusKm: 3389.5, pole: [317.269202, 54.432516], spin: [176.049863, 350.891982443297], tint: [0.7, 0.42, 0.25], magnitude: -1.52, map: 'mars', mapKmPerPixel: 20.8, roughness: 0.35, haze: { gas: { depth: [0, 0, 0], scaleKm: 11 }, dust: { depth: [0.2, 0.22, 0.25], light: [0.34, 0.26, 0.19], scaleKm: 11, forwardness: 0.4, sunDimming: 0.6 } }, ground: { roughness: 0.05, craters: 0.4, clouds: { baseKm: 14, topKm: 20, extinctionPerKm: 0.08, coverShift: -0.06 }, air: { tint: [0.78, 0.56, 0.38], scaleKm: 11, glow: [0.45, 0.6, 0.85], hazeKm: 30, sunset: [0.45, 0.6, 0.85] } } },
  { name: 'Jupiter', kind: 'giant', radiusKm: 69911, pole: [268.056595, 64.495303], spin: [284.95, 870.536], tint: [0.82, 0.74, 0.62], magnitude: -9.4 },
  { name: 'Saturn', kind: 'giant', rings: true, radiusKm: 58232, pole: [40.589, 83.537], spin: [38.9, 810.7939024], tint: [0.88, 0.8, 0.62], magnitude: -8.88 },
  { name: 'Uranus', kind: 'giant', radiusKm: 25362, pole: [257.311, -15.175], spin: [203.81, -501.1600928], tint: [0.66, 0.85, 0.88], magnitude: -7.19 },
  { name: 'Titan', kind: 'hazy', parent: 'Saturn', radiusKm: 2574.76, pole: [39.4827, 83.4279], spin: [186.5855, 22.5769768], tint: [0.8, 0.56, 0.3], magnitude: -1.28, map: 'titan', mapKmPerPixel: 15.8, roughness: 0, haze: { gas: { depth: [0, 0, 0], scaleKm: 45 }, dust: { depth: [2, 2.4, 3.2], light: [2.9, 1.8, 0.85], scaleKm: 45, forwardness: 0.3, sunDimming: 0.1 }, layer: { light: [0.0022, 0.0027, 0.0042], heightKm: 450, thicknessKm: 30 } }, ground: { roughness: 0.03, craters: 0.1, viewFromKm: 120, air: { tint: [0.5, 0.33, 0.15], scaleKm: 21, glow: [0.6, 0.42, 0.2], hazeKm: 8, sunset: [0.4, 0.22, 0.08], overcast: 0.9 } } },
  { name: 'Neptune', kind: 'giant', radiusKm: 24622, pole: [299.36, 43.46], spin: [249.978, 541.1397757], tint: [0.51, 0.69, 0.79], magnitude: -6.87 },
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

export function orbitPoint({ a, e, inclination, node, periapsisArgument, meanAnomaly }) {
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

const farFutureShare = (centuries) => Math.max(0, Math.min(1, (centuries - FAR_FUTURE_STARTS) / (FAR_FUTURE_FULL - FAR_FUTURE_STARTS)));
const mixed = (near, far, share) => near * (1 - share) + far * share;

function elementsFrom(orbits, name, centuries) {
  const [a, e, i, L, perihelion, node] = orbits[name].map(([value, rate]) => value + rate * centuries);
  return { a, e, inclination: i * DEGREES, node: node * DEGREES, periapsisArgument: (perihelion - node) * DEGREES, meanAnomaly: (L - perihelion) * DEGREES };
}

function farMeanAnomalyShift(name, centuries) {
  const [quadratic, cosine, sine, degreesPerCentury] = FAR_MEAN_ANOMALY_TERMS[name] ?? [0, 0, 0, 0];
  const angle = degreesPerCentury * centuries * DEGREES;
  return (quadratic * centuries ** 2 + cosine * Math.cos(angle) + sine * Math.sin(angle)) * DEGREES;
}

function farElements(name, centuries) {
  const elements = elementsFrom(FAR_PLANET_ORBITS, name, centuries);
  return { ...elements, meanAnomaly: elements.meanAnomaly + farMeanAnomalyShift(name, centuries) };
}

function planetElements(name, centuries) {
  const share = farFutureShare(centuries);
  const near = elementsFrom(PLANET_ORBITS, name, centuries);
  if (share === 0) return near;
  const far = farElements(name, centuries);
  return Object.fromEntries(Object.entries(near).map(([key, value]) => [key, mixed(value, far[key], share)]));
}

const planetOffsetAu = (name, centuries) => orbitPoint(planetElements(name, centuries));

function ttMinusUtcSeconds(days) {
  const index = (2000 + days / DAYS_PER_YEAR - TT_TABLE_START_YEAR) / TT_TABLE_STEP_YEARS;
  const below = Math.max(0, Math.min(TT_MINUS_UTC_SECONDS.length - 2, Math.floor(index)));
  const share = Math.max(0, Math.min(1, index - below));
  return TT_MINUS_UTC_SECONDS[below] * (1 - share) + TT_MINUS_UTC_SECONDS[below + 1] * share;
}

function sumSeries(terms, arguments_, centuries, sunTermShare = 1) {
  let total = 0;
  for (const term of terms) {
    let angle = 0;
    for (let k = 0; k < arguments_.length; k++) angle += term[k] * arguments_[k];
    total += sunTermShare ** Math.abs(term[1]) * centuries ** term[8] * (term[9] * Math.sin(angle) + term[10] * Math.cos(angle));
  }
  return total;
}

const polynomial = (coefficients, centuries) => coefficients.reduceRight((total, coefficient) => total * centuries + coefficient, 0);

function precessionAngles(centuries) {
  return {
    zeta: polynomial([0, 0.6406161, 0.0000839, 0.000005], centuries) * DEGREES,
    z: polynomial([0, 0.6406161, 0.0003041, 0.0000051], centuries) * DEGREES,
    theta: polynomial([0, 0.556753, -0.0001185, -0.0000116], centuries) * DEGREES,
  };
}

const turnAboutZ = ([x, y, z], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
const turnAboutY = ([x, y, z], angle) => [x * Math.cos(angle) + z * Math.sin(angle), y, z * Math.cos(angle) - x * Math.sin(angle)];

function equatorOfDateToJ2000(vector, centuries) {
  const { zeta, z, theta } = precessionAngles(centuries);
  return turnAboutZ(turnAboutY(turnAboutZ(vector, -z), theta), -zeta);
}

const pointAlong = (longitude, latitude, distance) =>
  [distance * Math.cos(latitude) * Math.cos(longitude), distance * Math.cos(latitude) * Math.sin(longitude), distance * Math.sin(latitude)];

function moonNowOffsetKm(centuries) {
  const arguments_ = MOON_ARGUMENTS.map(([start, rate]) => (start + rate * centuries) * DEGREES);
  const longitude = sumSeries(MOON_LONGITUDE_TERMS, arguments_, centuries) * DEGREES;
  const latitude = sumSeries(MOON_LATITUDE_TERMS, arguments_, centuries) * DEGREES;
  return eclipticToFrame(pointAlong(longitude, latitude, sumSeries(MOON_DISTANCE_TERMS, arguments_, centuries)));
}

function moonFarOffsetKm(centuries) {
  const arguments_ = MOON_ARGUMENTS.map((linear, k) => polynomial([...linear, ...(MOON_ARGUMENT_CURVES[k] ?? [])], centuries) * DEGREES);
  const sunTermShare = polynomial([1, -0.002516, -0.0000074], centuries);
  const series = (terms) => sumSeries(terms, arguments_, centuries, sunTermShare);
  const longitude = arguments_[4] + series(FAR_MOON_LONGITUDE_TERMS) * DEGREES;
  const latitude = series(FAR_MOON_LATITUDE_TERMS) * DEGREES;
  const [x, y, z] = pointAlong(longitude, latitude, series(MOON_DISTANCE_TERMS));
  const obliquity = OBLIQUITY + polynomial([0, -0.0130042, -0.00000016, 0.0000005], centuries) * DEGREES;
  const c = Math.cos(obliquity);
  const s = Math.sin(obliquity);
  return equatorialToFrame(equatorOfDateToJ2000([x, y * c - z * s, y * s + z * c], centuries));
}

function moonOffsetKm(days) {
  const centuries = (days + ttMinusUtcSeconds(days) / 86400) / DAYS_PER_CENTURY;
  const share = farFutureShare(centuries);
  if (share === 0) return moonNowOffsetKm(centuries);
  if (share === 1) return moonFarOffsetKm(centuries);
  return add(scale(moonNowOffsetKm(centuries), 1 - share), scale(moonFarOffsetKm(centuries), share));
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
    { name: 'Moon', parent: 'Earth', pointsKm: Array.from({ length: ORBIT_PATH_POINTS }, (_, step) => moonOffsetKm(days - (SIDEREAL_MONTH_DAYS * step) / ORBIT_PATH_POINTS)) },
    ...Object.entries(SATELLITE_ORBITS).map(([name, orbit]) => ({ name, parent: parentOf(name), pointsKm: tracedBackFromNow(satelliteElements(orbit, days), satelliteToFrame(satellitePlane(orbit))) })),
  ];
}

function equatorialDirection(ra, dec) {
  return [Math.cos(dec * DEGREES) * Math.cos(ra * DEGREES), Math.cos(dec * DEGREES) * Math.sin(ra * DEGREES), Math.sin(dec * DEGREES)];
}

export function facingParent(offsetKm, nextOffsetKm) {
  const north = normalize(cross(offsetKm, nextOffsetKm));
  const towardParent = scale(offsetKm, -1);
  return { north, meridian: normalize(subtract(towardParent, scale(north, dot(towardParent, north)))) };
}

function earthOrientation(days) {
  const centuries = days / DAYS_PER_CENTURY;
  const greenwich = (280.46061837 + 360.98564736629 * days + 0.000387933 * centuries ** 2) * DEGREES;
  const toFrame = (vector) => equatorialToFrame(equatorOfDateToJ2000(vector, centuries));
  return { north: toFrame([0, 0, 1]), meridian: toFrame([Math.cos(greenwich), Math.sin(greenwich), 0]) };
}

function orientation(body, days) {
  if (body.name === 'Earth') return earthOrientation(days);
  const northEquatorial = equatorialDirection(...body.pole);
  const node = normalize(cross([0, 0, 1], northEquatorial));
  const meridianEquatorial = rotateAbout(node, northEquatorial, (body.spin[0] + body.spin[1] * days) * DEGREES);
  return { north: equatorialToFrame(northEquatorial), meridian: equatorialToFrame(meridianEquatorial) };
}

const angleBetween = (a, b) => Math.atan2(Math.hypot(...cross(a, b)), dot(a, b));

function discOverlapShare(sunRadius, coverRadius, apart) {
  if (apart >= sunRadius + coverRadius) return 0;
  if (apart <= Math.abs(sunRadius - coverRadius)) return Math.min(sunRadius, coverRadius) ** 2 / sunRadius ** 2;
  const sunPart = sunRadius ** 2 * Math.acos((apart ** 2 + sunRadius ** 2 - coverRadius ** 2) / (2 * apart * sunRadius));
  const coverPart = coverRadius ** 2 * Math.acos((apart ** 2 + coverRadius ** 2 - sunRadius ** 2) / (2 * apart * coverRadius));
  const kite = 0.5 * Math.sqrt(Math.max(0, (-apart + sunRadius + coverRadius) * (apart + sunRadius - coverRadius) * (apart - sunRadius + coverRadius) * (apart + sunRadius + coverRadius)));
  return (sunPart + coverPart - kite) / (Math.PI * sunRadius ** 2);
}

export function sunShareVisible(seen, ignoredName) {
  const sun = seen.find(({ body }) => body.kind === 'star');
  if (!sun) return 1;
  const sunDistance = Math.hypot(...sun.offsetKm);
  const sunRadius = Math.asin(Math.min(1, sun.body.radiusKm / sunDistance));
  let hidden = 0;
  for (const { body, offsetKm } of seen) {
    const distance = Math.hypot(...offsetKm);
    if (body.kind === 'star' || body.name === ignoredName || distance >= sunDistance) continue;
    hidden += discOverlapShare(sunRadius, Math.asin(Math.min(1, body.radiusKm / distance)), angleBetween(offsetKm, sun.offsetKm));
  }
  return Math.max(0, 1 - hidden);
}

const DAYLIT_SPOTS = [[0, 1], [0.5, 6], [0.87, 6]].flatMap(([out, count]) =>
  Array.from({ length: count }, (_, k) => [out * Math.cos((2 * Math.PI * k) / count), out * Math.sin((2 * Math.PI * k) / count)]));
const BENT_THROUGH_AIR_SHARE = 0.09;
const DARKEST_SHARE = 1e-12;

function sunlightOnSpot(spotKm, body, eclipsers) {
  const hidden = eclipsers.map(({ offsetKm, radiusKm, reddens }) => {
    const towardKm = subtract(offsetKm, spotKm);
    const coverRadius = Math.asin(Math.min(1, radiusKm / Math.hypot(...towardKm)));
    return { share: discOverlapShare(body.sunAngularRadius, coverRadius, angleBetween(towardKm, body.sunward)), reddens };
  });
  const bent = hidden.reduce((sum, { share, reddens }) => sum + (reddens ? BENT_THROUGH_AIR_SHARE * share : 0), 0);
  return Math.max(0, 1 - hidden.reduce((sum, { share }) => sum + share, 0)) + bent;
}

function sunlitShare(body, eclipsers) {
  if (!eclipsers.length) return 1;
  const right = normalize(cross(body.sunward, Math.abs(body.sunward[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const up = cross(body.sunward, right);
  const spots = DAYLIT_SPOTS.map(([x, y]) => {
    const across = add(scale(right, x), scale(up, y));
    return scale(add(across, scale(body.sunward, Math.sqrt(1 - x * x - y * y))), body.radiusKm);
  });
  return spots.reduce((sum, spot) => sum + sunlightOnSpot(spot, body, eclipsers), 0) / spots.length;
}

function eclipsersOf(body, bodies) {
  if (body.kind === 'star') return [];
  const sunDistance = Math.hypot(...body.fromSunKm);
  const sunRadius = Math.sin(body.sunAngularRadius);
  return bodies
    .filter((other) => other !== body && other.kind !== 'star')
    .map((other) => {
      const offsetKm = subtract(other.fromSunKm, body.fromSunKm);
      const along = dot(offsetKm, body.sunward);
      const across = Math.hypot(...subtract(offsetKm, scale(body.sunward, along)));
      return { offsetKm, radiusKm: other.radiusKm, reddens: Boolean(other.reddensEclipses), along, across };
    })
    .filter(({ along, across, radiusKm }) => along > 0 && along < sunDistance && across < body.radiusKm + radiusKm + along * sunRadius)
    .sort((a, b) => b.radiusKm / b.along - a.radiusKm / a.along)
    .slice(0, ECLIPSERS_PER_BODY)
    .map(({ offsetKm, radiusKm, reddens }) => ({ offsetKm, radiusKm, reddens }));
}

export function placeBodies(ms) {
  const days = (ms - J2000_MS) / MS_PER_DAY;
  const centuries = days / DAYS_PER_CENTURY;
  const fromSun = new Map([['Sun', [0, 0, 0]]]);
  for (const name of Object.keys(PLANET_ORBITS)) fromSun.set(name, scale(eclipticToFrame(planetOffsetAu(name, centuries)), KM_PER_AU));
  const moonOffset = moonOffsetKm(days);
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
  const facing = BODIES.map((body) => ({
    ...body,
    ...(body.name === 'Earth' && { cityLights: cityLightsOn(ms) }),
    ...settlementOf(body.name, ms),
    ...(body.synchronous ? synchronousFacing.get(body.name) : orientation(body, days)),
    cloudMeridian: body.cloudSpin && orientation({ ...body, spin: body.cloudSpin }, days).meridian,
    fromSunKm: fromSun.get(body.name),
    mapLayer: MAPPED_BODIES.indexOf(body),
  }));
  return inStarlight(facing, SUN_POSITION, SUN_RADIUS_KM);
}

export function inStarlight(bodies, starPosition, starRadiusKm) {
  const placed = bodies.map((body) => {
    const sunDistanceKm = Math.hypot(...body.fromSunKm);
    return {
      mapLayer: -1,
      ...body,
      centre: add(starPosition, scale(body.fromSunKm, 1 / KM_PER_PC)),
      radius: body.radiusKm / KM_PER_PC,
      sunward: sunDistanceKm > 0 ? scale(body.fromSunKm, -1 / sunDistanceKm) : [0, 0, 1],
      sunDistanceAu: sunDistanceKm / KM_PER_AU,
      sunAngularRadius: sunDistanceKm > 0 ? Math.asin(Math.min(1, starRadiusKm / sunDistanceKm)) : 0,
    };
  });
  return placed.map((body) => {
    const eclipsers = eclipsersOf(body, placed);
    return { ...body, eclipsers, sunlitShare: sunlitShare(body, eclipsers) };
  });
}

export function apparentMagnitude(body, offsetKm) {
  const distanceKm = Math.hypot(...offsetKm);
  const phase = Math.acos(Math.max(-1, Math.min(1, -dot(offsetKm, body.sunward) / distanceKm)));
  const lambert = (1 - phase / Math.PI) * Math.cos(phase) + Math.sin(phase) / Math.PI;
  return body.magnitude + 5 * Math.log10(body.sunDistanceAu * (distanceKm / KM_PER_AU)) - 2.5 * Math.log10(Math.max(lambert * Math.max(body.sunlitShare, DARKEST_SHARE), 1e-18) + (body.glowOverReflected ?? 0));
}

export function holdingBody(bodies, cameraFromSunKm) {
  let holder = bodies[0];
  let nearest = Infinity;
  for (const body of bodies) {
    const distance = Math.hypot(...subtract(cameraFromSunKm, body.fromSunKm));
    if (body.kind !== 'star' && distance < (body.holdKm ?? HOLD_RADII * body.radiusKm) && distance < nearest) {
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

const CITY_LIGHTS_SIZE = [8192, 3072];

export function loadCloudMap(folder, [width, height]) {
  return Promise.all(['earth-clouds.webp', 'earth-cloud-tops.webp'].map((name) =>
    mapImage(new URL(name, folder), { colorSpaceConversion: 'none', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' })));
}

export async function loadCityLights(folder, widestTexture) {
  const [width, height] = CITY_LIGHTS_SIZE.map((size) => Math.round(size * Math.min(1, widestTexture / CITY_LIGHTS_SIZE[0])));
  return mapImage(new URL('earth-lights.webp', folder), { colorSpaceConversion: 'none', resizeWidth: width, resizeHeight: height });
}

const FIRST_LIGHTS_MS = Date.UTC(1882, 8, 4);
const MAPPED_LIGHTS_MS = Date.UTC(2016, 0, 1);

function cityLightsOn(ms) {
  const share = Math.min(1, Math.max(0, (ms - FIRST_LIGHTS_MS) / (MAPPED_LIGHTS_MS - FIRST_LIGHTS_MS)));
  return share * share;
}

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
