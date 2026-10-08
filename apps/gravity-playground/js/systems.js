import { createBody } from './physics.js';
import { EARTH_KM, fromEarthMasses, fromSolarMasses, KM_PER_AU, realScale, SUN_KM } from './units.js';

const JUPITER_KM = 69911;
const DEGREES = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const MS_PER_DAY = 86400000;
const KEPLER_TOLERANCE = 1e-12;
const KEPLER_TRIES = 12;

const solarSystem = {
  name: 'Solar System',
  unitsPerAu: 200,
  bodies: [
    { name: 'Sun', look: 'star', massSun: 1, radiusKm: SUN_KM, colour: [255, 241, 214] },
    { name: 'Mercury', massEarth: 0.0553, radiusKm: 2439.7, colour: [154, 143, 135], orbit: { a: 0.3871, e: 0.2056, periodDays: 87.969, periapsisDeg: 77.46, meanAnomalyDeg: 174.79 } },
    { name: 'Venus', massEarth: 0.815, radiusKm: 6051.8, colour: [227, 197, 143], orbit: { a: 0.7233, e: 0.0068, periodDays: 224.701, periapsisDeg: 131.57, meanAnomalyDeg: 50.41 } },
    { name: 'Earth', massEarth: 1, radiusKm: EARTH_KM, colour: [63, 127, 214], orbit: { a: 1, e: 0.0167, periodDays: 365.256, periapsisDeg: 102.94, meanAnomalyDeg: -2.48 } },
    { name: 'Moon', parent: 'Earth', massEarth: 0.0123, radiusKm: 1737.4, colour: [185, 181, 173], orbit: { a: 384400 / KM_PER_AU, e: 0.0549, periodDays: 27.3217, periapsisDeg: 83.35, meanAnomalyDeg: 134.96 } },
    { name: 'Mars', massEarth: 0.107, radiusKm: 3389.5, colour: [193, 83, 47], orbit: { a: 1.5237, e: 0.0934, periodDays: 686.98, periapsisDeg: 336.04, meanAnomalyDeg: 19.41 } },
    { name: 'Jupiter', massEarth: 317.8, radiusKm: JUPITER_KM, colour: [216, 180, 138], orbit: { a: 5.2026, e: 0.0485, periodDays: 4332.59, periapsisDeg: 14.75, meanAnomalyDeg: 19.65 } },
    { name: 'Saturn', massEarth: 95.2, radiusKm: 58232, colour: [226, 207, 152], orbit: { a: 9.5549, e: 0.0555, periodDays: 10759.22, periapsisDeg: 92.43, meanAnomalyDeg: -42.49 } },
    { name: 'Uranus', massEarth: 14.5, radiusKm: 25362, colour: [159, 216, 224], orbit: { a: 19.218, e: 0.0463, periodDays: 30688.5, periapsisDeg: 170.96, meanAnomalyDeg: 142.27 } },
    { name: 'Neptune', massEarth: 17.1, radiusKm: 24622, colour: [74, 111, 224], orbit: { a: 30.11, e: 0.009, periodDays: 60195, periapsisDeg: 44.97, meanAnomalyDeg: 259.91 } },
    { name: 'Pluto', massEarth: 0.0022, radiusKm: 1188.3, colour: [201, 169, 138], orbit: { a: 39.48, e: 0.2488, periodDays: 90560, periapsisDeg: 224.07, meanAnomalyDeg: 14.86 } },
  ],
};

const trappist1 = {
  name: 'TRAPPIST-1',
  unitsPerAu: 5000,
  bodies: [
    { name: 'TRAPPIST-1', look: 'star', massSun: 0.0898, radiusKm: 0.1192 * SUN_KM, colour: [255, 122, 60] },
    { name: 'b', massEarth: 1.374, radiusKm: 1.116 * EARTH_KM, colour: [160, 114, 106], orbit: { a: 0.01154, e: 0, periodDays: 1.51088, periapsisDeg: 0, meanAnomalyDeg: 10 } },
    { name: 'c', massEarth: 1.308, radiusKm: 1.097 * EARTH_KM, colour: [176, 138, 110], orbit: { a: 0.0158, e: 0, periodDays: 2.42182, periapsisDeg: 0, meanAnomalyDeg: 120 } },
    { name: 'd', massEarth: 0.388, radiusKm: 0.788 * EARTH_KM, colour: [143, 140, 154], orbit: { a: 0.02227, e: 0, periodDays: 4.0498, periapsisDeg: 0, meanAnomalyDeg: 230 } },
    { name: 'e', massEarth: 0.692, radiusKm: 0.92 * EARTH_KM, colour: [95, 143, 176], orbit: { a: 0.02925, e: 0, periodDays: 6.0996, periapsisDeg: 0, meanAnomalyDeg: 300 } },
    { name: 'f', massEarth: 1.039, radiusKm: 1.045 * EARTH_KM, colour: [127, 166, 194], orbit: { a: 0.03849, e: 0, periodDays: 9.20669, periapsisDeg: 0, meanAnomalyDeg: 40 } },
    { name: 'g', massEarth: 1.321, radiusKm: 1.129 * EARTH_KM, colour: [156, 184, 204], orbit: { a: 0.04683, e: 0, periodDays: 12.35294, periapsisDeg: 0, meanAnomalyDeg: 160 } },
    { name: 'h', massEarth: 0.326, radiusKm: 0.755 * EARTH_KM, colour: [194, 204, 214], orbit: { a: 0.06189, e: 0, periodDays: 18.7729, periapsisDeg: 0, meanAnomalyDeg: 270 } },
  ],
};

const ALPHA_CENTAURI = { a: 1.0788, b: 0.9092, separationAu: 23.5, e: 0.52, periodDays: 79.76 * 365.25, meanAnomalyDeg: 200.6 };
const alphaCentauriOrbit = (partnerMass, periapsisDeg) => {
  const { a, b, separationAu, e, periodDays, meanAnomalyDeg } = ALPHA_CENTAURI;
  return { a: (separationAu * partnerMass) / (a + b), e, periodDays, periapsisDeg, meanAnomalyDeg };
};

const alphaCentauri = {
  name: 'Alpha Centauri A and B',
  unitsPerAu: 20,
  bodies: [
    { name: 'α Cen A', look: 'star', massSun: ALPHA_CENTAURI.a, radiusKm: 1.2175 * SUN_KM, colour: [255, 241, 214], orbit: alphaCentauriOrbit(ALPHA_CENTAURI.b, 0) },
    { name: 'α Cen B', look: 'star', massSun: ALPHA_CENTAURI.b, radiusKm: 0.8591 * SUN_KM, colour: [255, 214, 160], orbit: alphaCentauriOrbit(ALPHA_CENTAURI.a, 180) },
    { name: 'Ab (candidate)', parent: 'α Cen A', massEarth: 100, radiusKm: 1.05 * JUPITER_KM, colour: [205, 179, 143], orbit: { a: 1.7, e: 0.4, periodDays: 2.13 * 365.25, periapsisDeg: 60, meanAnomalyDeg: 0 } },
  ],
};

const KEPLER_16 = { a: 0.6897, b: 0.20255, separationAu: 0.22431, e: 0.15944, periodDays: 41.079, periapsisDeg: 263.464 };
const kepler16Orbit = (partnerMass, turn) => {
  const { a, b, separationAu, e, periodDays, periapsisDeg } = KEPLER_16;
  return { a: (separationAu * partnerMass) / (a + b), e, periodDays, periapsisDeg: periapsisDeg + turn, meanAnomalyDeg: 0 };
};

const kepler16 = {
  name: 'Kepler-16 (circumbinary planet)',
  unitsPerAu: 1000,
  bodies: [
    { name: 'Kepler-16 A', look: 'star', massSun: KEPLER_16.a, radiusKm: 0.6489 * SUN_KM, colour: [255, 196, 140], orbit: kepler16Orbit(KEPLER_16.b, 0) },
    { name: 'Kepler-16 B', look: 'star', massSun: KEPLER_16.b, radiusKm: 0.22623 * SUN_KM, colour: [255, 140, 90], orbit: kepler16Orbit(KEPLER_16.a, 180) },
    { name: 'Kepler-16 b', massEarth: 105.8, radiusKm: 0.7538 * JUPITER_KM, colour: [200, 170, 130], orbit: { a: 0.7048, e: 0.0069, periodDays: 228.776, periapsisDeg: 318, meanAnomalyDeg: 90 } },
  ],
};

function eccentricAnomaly(meanAnomaly, e) {
  let anomaly = e < 0.8 ? meanAnomaly : Math.PI;
  for (let i = 0; i < KEPLER_TRIES; i++) {
    const change = (anomaly - e * Math.sin(anomaly) - meanAnomaly) / (1 - e * Math.cos(anomaly));
    anomaly -= change;
    if (Math.abs(change) < KEPLER_TOLERANCE) break;
  }
  return anomaly;
}

function orbitalState({ a, e, periodDays, periapsisDeg, meanAnomalyDeg }, days) {
  const turnsPerDay = (2 * Math.PI) / periodDays;
  const meanAnomaly = (meanAnomalyDeg * DEGREES + turnsPerDay * days) % (2 * Math.PI);
  const anomaly = eccentricAnomaly(meanAnomaly, e);
  const [cos, sin] = [Math.cos(anomaly), Math.sin(anomaly)];
  const minor = a * Math.sqrt(1 - e * e);
  const anomalyPerDay = turnsPerDay / (1 - e * cos);
  const [along, across, alongSpeed, acrossSpeed] = [a * (cos - e), minor * sin, -a * sin * anomalyPerDay, minor * cos * anomalyPerDay];
  const [turnCos, turnSin] = [Math.cos(periapsisDeg * DEGREES), Math.sin(periapsisDeg * DEGREES)];
  return {
    au: [along * turnCos - across * turnSin, along * turnSin + across * turnCos],
    auPerDay: [alongSpeed * turnCos - acrossSpeed * turnSin, alongSpeed * turnSin + acrossSpeed * turnCos],
  };
}

function buildSystem({ bodies }, scale, days) {
  const placed = new Map();
  const toSpeed = (auPerDay) => scale.fromAu(auPerDay) / scale.secondsPerDay;
  return bodies.map(({ name, look = 'planet', massSun, massEarth, radiusKm, colour, parent, orbit }) => {
    const origin = placed.get(parent) ?? { x: 0, y: 0, vx: 0, vy: 0 };
    const { au: [x, y], auPerDay: [vx, vy] } = orbit ? orbitalState(orbit, days) : { au: [0, 0], auPerDay: [0, 0] };
    const mass = massSun ? fromSolarMasses(massSun) : fromEarthMasses(massEarth);
    const body = createBody({ x: origin.x + scale.fromAu(x), y: origin.y - scale.fromAu(y), vx: origin.vx + toSpeed(vx), vy: origin.vy - toSpeed(vy), mass });
    Object.assign(body, { name, look, colour, radius: scale.fromKm(radiusKm) });
    placed.set(name, body);
    return body;
  });
}

const daysSinceJ2000 = (ms) => (ms - J2000_MS) / MS_PER_DAY;

function asScene(system) {
  const scale = realScale(system.unitsPerAu);
  return { name: system.name, scale, build: (startMs) => buildSystem(system, scale, daysSinceJ2000(startMs)) };
}

export const STAR_SYSTEMS = { solarSystem: asScene(solarSystem), trappist1: asScene(trappist1), alphaCentauri: asScene(alphaCentauri), kepler16: asScene(kepler16) };
