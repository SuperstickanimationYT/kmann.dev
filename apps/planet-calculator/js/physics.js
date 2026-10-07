const G = 6.674e-11;
const BOLTZMANN = 1.380649e-23;
const ATOMIC_MASS = 1.6605e-27;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;

export const AU_M = 1.495978707e11;
export const SUN = { massKg: 1.989e30, radiusM: 6.957e8, temperatureK: 5772 };
export const EARTH = { massKg: 5.972e24, radiusM: 6.371e6, gravity: 9.81, escapeKms: 11.19, densityGcc: 5.51 };
export const SUN_FROM_EARTH_DEG = 0.533;

const MAIN_SEQUENCE_LIFETIME_OF_SUN_GYR = 10;
const SPECTRAL_CLASSES = [
  { from: 30000, letter: 'O' },
  { from: 10000, letter: 'B' },
  { from: 7500, letter: 'A' },
  { from: 6000, letter: 'F' },
  { from: 5200, letter: 'G' },
  { from: 3700, letter: 'K' },
  { from: 0, letter: 'M' },
];

const HABITABLE_EDGES = {
  recentVenus: [1.776, 2.136e-4, 2.533e-8, -1.332e-11, -3.097e-15],
  runawayGreenhouse: [1.107, 1.332e-4, 1.58e-8, -8.308e-12, -1.931e-15],
  maximumGreenhouse: [0.356, 6.171e-5, 1.698e-9, -3.198e-12, -5.575e-16],
  earlyMars: [0.32, 5.547e-5, 1.526e-9, -2.874e-12, -5.011e-16],
};
const HABITABLE_FIT_COOLEST_K = 2600;
const HABITABLE_FIT_HOTTEST_K = 7200;

const STARTING_SPIN_SECONDS = 12 * 3600;
const TIDAL_DISSIPATION_Q = 100;
const LOVE_NUMBER_K2 = 0.3;
const UNIFORM_SPHERE_INERTIA = 0.4;
const RESONANCE_RATHER_THAN_LOCK_FROM_ECCENTRICITY = 0.1;

const EXOSPHERE_HEAT_OVER_EQUILIBRIUM = 4;
const ESCAPE_OVER_THERMAL_SPEED_TO_HOLD_FOR_BILLIONS_OF_YEARS = 6;
export const GASES = [
  { name: 'Hydrogen', formula: 'H₂', mass: 2 },
  { name: 'Helium', formula: 'He', mass: 4 },
  { name: 'Water vapour', formula: 'H₂O', mass: 18 },
  { name: 'Nitrogen', formula: 'N₂', mass: 28 },
  { name: 'Oxygen', formula: 'O₂', mass: 32 },
  { name: 'Carbon dioxide', formula: 'CO₂', mass: 44 },
];

const ROCKY_UP_TO_EARTH_RADII = 1.6;
const NEPTUNE_LIKE_UP_TO_EARTH_RADII = 6;
const STABLE_MOON_FRACTION_OF_HILL_RADIUS = 0.5;
const ROCKY_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS = 2.04;
const GIANT_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS = 131.6;
const ICE_MELTS_K = 273.15;
const WATER_BOILS_AT_ONE_BAR_K = 373.15;
const DAY_SIDE_OVER_AVERAGE_WHEN_LOCKED = (8 / 3) ** 0.25;

export function mainSequenceStar(massSun) {
  const luminositySun =
    massSun < 0.43 ? 0.23 * massSun ** 2.3 : massSun < 2 ? massSun ** 4 : massSun < 55 ? 1.4 * massSun ** 3.5 : 32000 * massSun;
  const radiusSun = massSun < 1 ? massSun ** 0.8 : massSun ** 0.57;
  const temperatureK = SUN.temperatureK * (luminositySun / radiusSun ** 2) ** 0.25;
  return { massSun, luminositySun, radiusSun, temperatureK };
}

export function spectralClass(temperatureK) {
  return SPECTRAL_CLASSES.find((spectral) => temperatureK >= spectral.from).letter;
}

export function mainSequenceLifetimeGyr(star) {
  return (MAIN_SEQUENCE_LIFETIME_OF_SUN_GYR * star.massSun) / star.luminositySun;
}

function habitableEdgeAu(star, coefficients) {
  const clamped = Math.min(HABITABLE_FIT_HOTTEST_K, Math.max(HABITABLE_FIT_COOLEST_K, star.temperatureK));
  const offset = clamped - SUN.temperatureK;
  const [base, ...powers] = coefficients;
  const effectiveFlux = powers.reduce((sum, coefficient, index) => sum + coefficient * offset ** (index + 1), base);
  return Math.sqrt(star.luminositySun / effectiveFlux);
}

export function habitableZone(star) {
  return {
    optimisticInner: habitableEdgeAu(star, HABITABLE_EDGES.recentVenus),
    inner: habitableEdgeAu(star, HABITABLE_EDGES.runawayGreenhouse),
    outer: habitableEdgeAu(star, HABITABLE_EDGES.maximumGreenhouse),
    optimisticOuter: habitableEdgeAu(star, HABITABLE_EDGES.earlyMars),
    outsideFit: star.temperatureK < HABITABLE_FIT_COOLEST_K || star.temperatureK > HABITABLE_FIT_HOTTEST_K,
  };
}

export function habitableVerdict(zone, distanceAu) {
  if (distanceAu >= zone.inner && distanceAu <= zone.outer) return 'inside';
  if (distanceAu >= zone.optimisticInner && distanceAu <= zone.optimisticOuter) return 'edge';
  return distanceAu < zone.optimisticInner ? 'too-hot' : 'too-cold';
}

export function typicalRadiusEarth(massEarth) {
  if (massEarth < ROCKY_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS) return 1.008 * massEarth ** 0.279;
  if (massEarth < GIANT_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS) return 0.808 * massEarth ** 0.589;
  return 0.808 * GIANT_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS ** 0.589 * (massEarth / GIANT_FROM_EARTH_MASSES_ON_TYPICAL_RADIUS) ** -0.044;
}

export function planetKind(radiusEarth) {
  if (radiusEarth <= ROCKY_UP_TO_EARTH_RADII) return 'rocky';
  if (radiusEarth <= NEPTUNE_LIKE_UP_TO_EARTH_RADII) return 'neptune';
  return 'giant';
}

function tidalLockSeconds(starKg, planetKg, planetRadiusM, distanceM) {
  const spin = (2 * Math.PI) / STARTING_SPIN_SECONDS;
  return (
    (spin * distanceM ** 6 * UNIFORM_SPHERE_INERTIA * planetKg * TIDAL_DISSIPATION_Q) /
    (3 * G * starKg ** 2 * LOVE_NUMBER_K2 * planetRadiusM ** 3)
  );
}

function thermalSpeed(molecularMass, temperatureK) {
  return Math.sqrt((3 * BOLTZMANN * temperatureK) / (molecularMass * ATOMIC_MASS));
}

function localDayDays(rotationHours, yearDays) {
  const spinDays = rotationHours / 24;
  const difference = 1 / spinDays - 1 / yearDays;
  return difference === 0 ? Infinity : Math.abs(1 / difference);
}

export function describeWorld({ star, ageGyr, planet, orbit, rotation }) {
  const starKg = star.massSun * SUN.massKg;
  const starRadiusM = star.radiusSun * SUN.radiusM;
  const planetKg = planet.massEarth * EARTH.massKg;
  const planetRadiusM = planet.radiusEarth * EARTH.radiusM;
  const distanceM = orbit.distanceAu * AU_M;

  const lifetimeGyr = mainSequenceLifetimeGyr(star);
  const zone = habitableZone(star);

  const yearSeconds = 2 * Math.PI * Math.sqrt(distanceM ** 3 / (G * (starKg + planetKg)));
  const yearDays = yearSeconds / SECONDS_PER_DAY;

  const gravityG = planet.massEarth / planet.radiusEarth ** 2;
  const escapeKms = EARTH.escapeKms * Math.sqrt(planet.massEarth / planet.radiusEarth);
  const densityGcc = (EARTH.densityGcc * planet.massEarth) / planet.radiusEarth ** 3;

  const starlightEarth = star.luminositySun / orbit.distanceAu ** 2;
  const nearestAu = orbit.distanceAu * (1 - orbit.eccentricity);
  const farthestAu = orbit.distanceAu * (1 + orbit.eccentricity);

  const equilibriumK = star.temperatureK * Math.sqrt(starRadiusM / (2 * distanceM)) * (1 - planet.albedo) ** 0.25;
  const surfaceK = equilibriumK + planet.greenhouseK;
  const daySideK = rotation.locked ? equilibriumK * DAY_SIDE_OVER_AVERAGE_WHEN_LOCKED + planet.greenhouseK : null;

  const lockYears = tidalLockSeconds(starKg, planetKg, planetRadiusM, distanceM) / SECONDS_PER_YEAR;
  const tidesWon = lockYears < ageGyr * 1e9;

  const exosphereK = equilibriumK * EXOSPHERE_HEAT_OVER_EQUILIBRIUM;
  const gases = GASES.map((gas) => ({
    ...gas,
    held: escapeKms * 1000 > ESCAPE_OVER_THERMAL_SPEED_TO_HOLD_FOR_BILLIONS_OF_YEARS * thermalSpeed(gas.mass, exosphereK),
  }));

  const hillM = distanceM * (1 - orbit.eccentricity) * Math.cbrt(planetKg / (3 * starKg));

  return {
    star: {
      ...star,
      spectral: spectralClass(star.temperatureK),
      lifetimeGyr,
      ageGyr,
      pastMainSequence: ageGyr > lifetimeGyr,
    },
    zone: { ...zone, verdict: habitableVerdict(zone, orbit.distanceAu) },
    orbit: {
      ...orbit,
      yearDays,
      yearEarthYears: yearDays / 365.25,
      nearestAu,
      farthestAu,
      starlightRange: [star.luminositySun / farthestAu ** 2, star.luminositySun / nearestAu ** 2],
    },
    planet: {
      ...planet,
      kind: planetKind(planet.radiusEarth),
      gravityG,
      escapeKms,
      densityGcc,
    },
    climate: {
      starlightEarth,
      equilibriumK,
      surfaceK,
      daySideK,
      liquidWater: surfaceK > ICE_MELTS_K && surfaceK < WATER_BOILS_AT_ONE_BAR_K,
      gases,
    },
    spin: {
      locked: rotation.locked,
      rotationHours: rotation.locked ? yearDays * 24 : rotation.hours,
      localDayDays: rotation.locked ? Infinity : localDayDays(rotation.hours, yearDays),
      lockYears,
      tidesWon,
      resonanceLikely: tidesWon && orbit.eccentricity >= RESONANCE_RATHER_THAN_LOCK_FROM_ECCENTRICITY,
      tropicsDeg: planet.tiltDeg,
      polarCirclesDeg: 90 - planet.tiltDeg,
    },
    sky: {
      starDiameterDeg: (2 * Math.atan(starRadiusM / distanceM) * 180) / Math.PI,
    },
    moons: {
      hillKm: hillM / 1000,
      stableMoonsWithinKm: (hillM * STABLE_MOON_FRACTION_OF_HILL_RADIUS) / 1000,
    },
  };
}
