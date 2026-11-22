import { DEGREES, equatorialToFrame, SUN_POSITION } from './milky-way.js';
import { add, cross, dot, normalize, rotateAbout, scale, subtract } from './vectors.js';

export const KM_PER_PC = 3.0857e13;
const KM_PER_AU = 1.495978707e8;
const HOLD_RADII = 200;
export const LOWEST_ALTITUDE_KM = 30;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;
const DAYS_PER_CENTURY = 36525;
const OBLIQUITY = 23.43928 * DEGREES;
const MOON_DISTANCE_KM = 384400;
const MOON_ELEMENTS_EPOCH_DAYS = -1.5;
const EARTH_SHARE_OF_MOON_OFFSET = 1 / 82.3;
const DAYS_PER_YEAR = 365.25;

const SATELLITE_ORBITS = {
  Titan: { laplacePole: [36.4, 84.0], a: 1221900, e: 0.029, meanLongitude: 11.7, periapsisLongitude: 208, periodDays: 15.945448, apsisDegreesPerYear: 0.502, parentShare: 8978.1371 / (37931206.23 + 8978.1371) },
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
  { name: 'Earth', kind: 'ocean', radiusKm: 6371, pole: [0, 90], spin: [190.147, 360.9856235], tint: [0.3, 0.42, 0.6], magnitude: -3.86, map: 'earth', mapKmPerPixel: 39.1, roughness: 0.3, ground: { roughness: 0.03, craters: 0, sea: true, air: { tint: [0.28, 0.5, 1], scaleKm: 8, glow: [1, 0.95, 0.85], hazeKm: 80, sunset: [1, 0.45, 0.15] } } },
  { name: 'Moon', kind: 'rocky', parent: 'Earth', radiusKm: 1737.4, pole: [269.9949, 66.5392], spin: [38.3213, 13.17635815], tint: [0.6, 0.58, 0.55], magnitude: 0.21, map: 'moon', mapKmPerPixel: 10.7, roughness: 0.5, ground: { roughness: 0.06, craters: 1 } },
  { name: 'Mars', kind: 'rocky', radiusKm: 3389.5, pole: [317.269202, 54.432516], spin: [176.049863, 350.891982443297], tint: [0.7, 0.42, 0.25], magnitude: -1.52, map: 'mars', mapKmPerPixel: 20.8, roughness: 0.35, ground: { roughness: 0.05, craters: 0.4, air: { tint: [0.78, 0.56, 0.38], scaleKm: 11, glow: [0.45, 0.6, 0.85], hazeKm: 30, sunset: [0.45, 0.6, 0.85] } } },
  { name: 'Jupiter', kind: 'giant', radiusKm: 69911, pole: [268.056595, 64.495303], spin: [284.95, 870.536], tint: [0.82, 0.74, 0.62], magnitude: -9.4 },
  { name: 'Saturn', kind: 'giant', radiusKm: 58232, pole: [40.589, 83.537], spin: [38.9, 810.7939024], tint: [0.88, 0.8, 0.62], magnitude: -8.88 },
  { name: 'Uranus', kind: 'giant', radiusKm: 25362, pole: [257.311, -15.175], spin: [203.81, -501.1600928], tint: [0.66, 0.85, 0.88], magnitude: -7.19 },
  { name: 'Titan', kind: 'hazy', parent: 'Saturn', radiusKm: 2574.76, pole: [39.4827, 83.4279], spin: [186.5855, 22.5769768], tint: [0.8, 0.56, 0.3], magnitude: -1.28, map: 'titan', mapKmPerPixel: 15.8, roughness: 0, ground: { roughness: 0.03, craters: 0.1, viewFromKm: 120, air: { tint: [0.5, 0.33, 0.15], scaleKm: 21, glow: [0.6, 0.42, 0.2], hazeKm: 8, sunset: [0.4, 0.22, 0.08], overcast: 0.9 } } },
  { name: 'Neptune', kind: 'giant', radiusKm: 24622, pole: [299.36, 43.46], spin: [249.978, 541.1397757], tint: [0.36, 0.5, 0.85], magnitude: -6.87 },
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

function planetOffsetAu(name, centuries) {
  const [a, e, i, L, perihelion, node] = PLANET_ORBITS[name].map(([value, rate]) => value + rate * centuries);
  return orbitPoint({ a, e, inclination: i * DEGREES, node: node * DEGREES, periapsisArgument: (perihelion - node) * DEGREES, meanAnomaly: (L - perihelion) * DEGREES });
}

function moonOffsetKm(daysSinceJ2000) {
  const days = daysSinceJ2000 - MOON_ELEMENTS_EPOCH_DAYS;
  return scale(orbitPoint({
    a: 1,
    e: 0.0549,
    inclination: 5.1454 * DEGREES,
    node: (125.1228 - 0.0529538083 * days) * DEGREES,
    periapsisArgument: (318.0634 + 0.1643573223 * days) * DEGREES,
    meanAnomaly: (115.3654 + 13.0649929509 * days) * DEGREES,
  }), MOON_DISTANCE_KM);
}

function satelliteOffsetEquatorialKm(orbit, days) {
  const pole = equatorialDirection(...orbit.laplacePole);
  const reference = normalize(cross([0, 0, 1], pole));
  const across = cross(pole, reference);
  const periapsisLongitude = orbit.periapsisLongitude + orbit.apsisDegreesPerYear * (days / DAYS_PER_YEAR);
  const meanLongitude = orbit.meanLongitude + (360 / orbit.periodDays) * days;
  const [x, y] = orbitPoint({ a: orbit.a, e: orbit.e, inclination: 0, node: 0, periapsisArgument: periapsisLongitude * DEGREES, meanAnomaly: (meanLongitude - periapsisLongitude) * DEGREES });
  return add(scale(reference, x), scale(across, y));
}

function equatorialDirection(ra, dec) {
  return [Math.cos(dec * DEGREES) * Math.cos(ra * DEGREES), Math.cos(dec * DEGREES) * Math.sin(ra * DEGREES), Math.sin(dec * DEGREES)];
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
  const moonOffset = eclipticToFrame(moonOffsetKm(days));
  const earth = subtract(fromSun.get('Earth'), scale(moonOffset, EARTH_SHARE_OF_MOON_OFFSET));
  fromSun.set('Earth', earth);
  fromSun.set('Moon', add(earth, moonOffset));
  for (const [name, orbit] of Object.entries(SATELLITE_ORBITS)) {
    const parent = BODIES.find((body) => body.name === name).parent;
    const offset = equatorialToFrame(satelliteOffsetEquatorialKm(orbit, days));
    const parentCentre = subtract(fromSun.get(parent), scale(offset, orbit.parentShare));
    fromSun.set(parent, parentCentre);
    fromSun.set(name, add(parentCentre, offset));
  }
  return BODIES.map((body) => {
    const fromSunKm = fromSun.get(body.name);
    const sunDistanceKm = Math.hypot(...fromSunKm);
    return {
      ...body,
      ...orientation(body, days),
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
