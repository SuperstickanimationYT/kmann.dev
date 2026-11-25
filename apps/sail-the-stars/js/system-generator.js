const EARTH_MASSES_PER_SUN = 332946;
const DAYS_PER_YEAR = 365.25;
const EARTH_KELVIN = 278.3;
const DEGREES_PER_RADIAN = 180 / Math.PI;
const LETTERS = 'bcdefghijklmnopqrstuvwxyz';

const INNER = {
  days: [3, 500],
  clusterRate: Math.exp(-0.91),
  planetRate: Math.exp(0.75),
  periodSpread: 0.25,
  periodPower: -0.09,
  logMass: 0.35,
  logMassSpread: 1.57,
  logMassSpreadInCluster: 0.48,
  earthMasses: [0.1, 60],
  mutualHill: 10,
  aroundSmallStars: { moreMassive: 0.45, more: 0.5 },
};
const RADIUS = { norm: 2.07, breakMass: 20, lowSlope: 0.07, highSlope: 0.5, lowSpread: 0.23, highSpread: 0.3, blend: 5 };
const ENVELOPE = { transitionMass: 20, efficiency: 0.1, xuvAtEarth: 504, xuvFromDimStars: 1.5, gigayears: 5, retention: Math.exp(2.07) };
const CGS = { gravity: 6.674e-8, earthGrams: 5.972e27, earthCm: 6.371e8, secondsPerGigayear: 3.156e16 };
const LEAST_MASS_WITH_ENVELOPE = 1.6;
const MOST_MASSIVE_INNER_HOST = 2.6;

const GIANT = {
  perSunIn2To8Au: 0.141,
  au: [0.1, 32],
  fallOff: 0.86,
  turnOver: 3.6,
  sharpness: 1.59,
  extraPerHost: 0.35,
  flatMasses: [60, 900],
  rarerAbove: 900,
  largest: 6000,
  metallicityPower: 1.2,
  withSmallInner: 1.25,
  withoutSmallInner: 0.65,
  smallInner: { earthMasses: 2, au: 1 },
  mostProbable: 0.85,
  mutualHill: 8,
};
const HOT_JUPITER = { chance: 0.004, days: [2, 9], earthMasses: [100, 1500] };
const WIDE = { perSun: 0.007, starMassPower: 3.5, mostProbable: 0.09, au: [32, 110], earthMasses: [1600, 4200] };
const COLD = { perStar: 0.57, logRatio: -4.7, logRatioSpread: 0.545, auSpan: 30, mutualHill: 10, smallestRatio: -6.6, largestRatio: -3.6 };
const METALLICITY = { mean: -0.05, spread: 0.2 };
const MOST_MASSIVE_HOST = 3;
const EVOLVED_CLEARS_AU = 0.4;
const CLEAR_OF_STAR_RADII = 3;
const BINARY_STABLE_SHARE = 0.2;
const SMALLEST_HILL_BESIDE_GIANT = 8;

const ln = Math.log;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const logBetween = (random, low, high) => low * (high / low) ** random.next();
const rayleigh = (random, sigma) => sigma * Math.sqrt(-2 * ln(Math.max(1e-9, 1 - random.next())));
const axisOf = (days, starMass) => Math.cbrt(starMass * (days / DAYS_PER_YEAR) ** 2);
const daysOf = (au, starMass) => DAYS_PER_YEAR * Math.sqrt(au ** 3 / starMass);

function poisson(random, mean) {
  const threshold = Math.exp(-mean);
  let count = 0;
  for (let product = random.next(); product > threshold; product *= random.next()) count++;
  return count;
}

function poissonAboveZero(random, mean) {
  for (;;) {
    const count = poisson(random, mean);
    if (count > 0) return count;
  }
}

function powerLaw(random, low, high, power) {
  if (Math.abs(power + 1) < 1e-6) return logBetween(random, low, high);
  const [from, to] = [low ** (power + 1), high ** (power + 1)];
  return (from + (to - from) * random.next()) ** (1 / (power + 1));
}

function hillSpacing(inner, outer, starMass) {
  const hill = ((inner.a + outer.a) / 2) * Math.cbrt((inner.earthMasses + outer.earthMasses) / (3 * starMass * EARTH_MASSES_PER_SUN));
  return (outer.a * (1 - outer.e) - inner.a * (1 + inner.e)) / hill;
}

const byAxis = (planets) => [...planets].sort((a, b) => a.a - b.a);
const spacedBy = (planets, starMass, least) => {
  const sorted = byAxis(planets);
  return sorted.every((planet, k) => k === 0 || hillSpacing(sorted[k - 1], planet, starMass) >= least);
};

const rockyRadius = (mass, random) =>
  3.9 * 10 ** (-0.209594 + Math.log10(mass / 10.55) / 3 - 0.0799 * (mass / 10.55) ** 0.413) * (1 + 0.05 * clamp(random.normal(), -2, 2));

function envelopeRadius(mass, random) {
  const { norm, breakMass, lowSlope, highSlope, lowSpread, highSpread, blend } = RADIUS;
  const share = 1 / (1 + Math.exp(-blend * (ln(mass) - ln(breakMass))));
  const low = norm * mass ** lowSlope;
  const high = norm * breakMass ** (lowSlope - highSlope) * mass ** highSlope;
  const mean = low + (high - low) * share;
  const spread = lowSpread + (highSpread - lowSpread) * share;
  return mean * Math.max(0.4, 1 + spread * clamp(random.normal(), -2.5, 2.5));
}

function keepsEnvelope(mass, radius, flux, random) {
  const { transitionMass, efficiency, xuvAtEarth, gigayears, retention } = ENVELOPE;
  const share = 1 / (1 + Math.exp(-RADIUS.blend * (ln(mass) - ln(transitionMass))));
  const envelope = (1 - share) * 0.1 * mass + share * (mass - Math.sqrt(mass));
  const grams = envelope * CGS.earthGrams;
  const seconds = (CGS.gravity * grams * grams) / (Math.PI * efficiency * (radius * CGS.earthCm) ** 3 * xuvAtEarth * flux);
  return random.next() < Math.min(1, (retention * seconds) / (gigayears * CGS.secondsPerGigayear));
}

const xuvBoost = (starMass) => Math.min(1, starMass) ** -ENVELOPE.xuvFromDimStars;

function smallBody(mass, a, star, random) {
  const puffed = envelopeRadius(mass, random);
  const bare = rockyRadius(mass, random);
  const kept = mass > LEAST_MASS_WITH_ENVELOPE && puffed > bare && keepsEnvelope(mass, puffed, (star.luminosity / (a * a)) * xuvBoost(star.mass), random);
  return { earthRadii: kept ? puffed : bare, bare: !kept };
}

function giantRadius(mass, kelvin, random) {
  const cool = mass < 127 ? 0.56 * mass ** 0.67 : 18.6 * mass ** -0.06;
  const inflated = kelvin > 1000 ? 1 + 0.25 * clamp((kelvin - 1000) / 900, 0, 1) : 1;
  return cool * inflated * (1 + 0.06 * clamp(random.normal(), -2, 2));
}

function drawCluster(star, random) {
  const { planetRate, periodSpread, periodPower, logMass, logMassSpread, logMassSpreadInCluster, earthMasses, days, aroundSmallStars } = INNER;
  const smallness = 1 / clamp(star.mass, 0.1, 1);
  const count = poissonAboveZero(random, planetRate * smallness ** aroundSmallStars.more);
  const scaleByStar = smallness ** aroundSmallStars.moreMassive;
  const [least, most] = earthMasses;
  let middle;
  do middle = Math.exp(logMass + logMassSpread * random.normal());
  while (middle < least || middle > most);
  const masses = Array.from({ length: count }, () => clamp(middle * Math.exp(logMassSpreadInCluster * random.normal()), least, most) * scaleByStar);
  for (let attempt = 0; attempt < 100; attempt++) {
    const shape = masses.map(() => (count === 1 ? 1 : Math.exp(count * periodSpread * random.normal())));
    const [shortest, longest] = [Math.min(...shape), Math.max(...shape)];
    if (longest / shortest > days[1] / days[0]) continue;
    const base = powerLaw(random, days[0] / shortest, days[1] / longest, periodPower - 1);
    const planets = masses.map((mass, k) => ({ earthMasses: mass, a: axisOf(base * shape[k], star.mass), e: 0 }));
    if (spacedBy(planets, star.mass, INNER.mutualHill)) return planets;
  }
  return [];
}

const shareWithInner = ({ gaiaColour, mass }) => (mass > MOST_MASSIVE_INNER_HOST ? 0 : clamp(0.9 * (gaiaColour - 0.81) + 0.88, 0, 1));

function drawInner(star, random) {
  if (random.next() >= shareWithInner(star)) return [];
  const clusters = poissonAboveZero(random, INNER.clusterRate);
  let planets = [];
  for (let k = 0; k < clusters; k++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const joined = [...planets, ...drawCluster(star, random)];
      if (joined.length === planets.length || !spacedBy(joined, star.mass, INNER.mutualHill)) continue;
      planets = joined;
      break;
    }
  }
  return planets.map((planet) => ({ ...planet, ...smallBody(planet.earthMasses, planet.a, star, random) }));
}

const giantRate = (au) => au ** -GIANT.fallOff * (1 - Math.exp(-((au / GIANT.turnOver) ** GIANT.sharpness)));
const GIANT_STEPS = 400;
const giantSteps = (low, high) => {
  const width = ln(high / low) / GIANT_STEPS;
  return Array.from({ length: GIANT_STEPS }, (_, k) => ({ au: low * Math.exp(width * (k + 0.5)), weight: giantRate(low * Math.exp(width * (k + 0.5))) * width }));
};
const weightOf = (steps) => steps.reduce((sum, { weight }) => sum + weight, 0);
const GIANT_STEPS_ALL = giantSteps(...GIANT.au);
const GIANTS_PER_SUN = (GIANT.perSunIn2To8Au * weightOf(GIANT_STEPS_ALL)) / weightOf(giantSteps(2, 8));
const GIANT_WEIGHTS = GIANT_STEPS_ALL.map((step) => [step.au, step.weight]);

const meanMetalBoost = 10 ** (GIANT.metallicityPower * METALLICITY.mean) * Math.exp((GIANT.metallicityPower * Math.LN10 * METALLICITY.spread) ** 2 / 2);

function giantMass(random) {
  const { flatMasses, rarerAbove, largest } = GIANT;
  const flat = ln(flatMasses[1] / flatMasses[0]);
  const tail = 1 - rarerAbove / largest;
  return random.next() < flat / (flat + tail) ? logBetween(random, ...flatMasses) : powerLaw(random, rarerAbove, largest, -2);
}

const giantEccentricity = (random) => {
  for (;;) {
    const e = random.next();
    if (random.next() < 0.66 * e ** -0.133 * (1 - e) ** 2.03) return e;
  }
};

function drawGiants(star, inner, random) {
  const { earthMasses, au } = GIANT.smallInner;
  const companion = inner.some((planet) => planet.earthMasses >= earthMasses && planet.a < au);
  const boost = star.mass * 10 ** (GIANT.metallicityPower * star.metallicity) / meanMetalBoost;
  const share = (GIANTS_PER_SUN / (1 + GIANT.extraPerHost)) * boost * (companion ? GIANT.withSmallInner : GIANT.withoutSmallInner);
  if (random.next() >= Math.min(GIANT.mostProbable, share)) return [];
  const count = 1 + poisson(random, GIANT.extraPerHost);
  let giants = [];
  for (let k = 0; k < count; k++) {
    for (let attempt = 0; attempt < 30; attempt++) {
      const a = random.pick(GIANT_WEIGHTS) * Math.exp(0.02 * (random.next() - 0.5)) * Math.cbrt(Math.min(1, star.mass));
      const joined = [...giants, { earthMasses: giantMass(random), a, e: giantEccentricity(random) * (count > 1 ? 0.6 : 1) }];
      if (!spacedBy(joined, star.mass, GIANT.mutualHill)) continue;
      giants = joined;
      break;
    }
  }
  return giants;
}

function drawHotJupiter(star, random) {
  const chance = HOT_JUPITER.chance * Math.min(1.5, star.mass) * 10 ** (GIANT.metallicityPower * star.metallicity) / meanMetalBoost;
  if (star.evolved || random.next() >= chance) return [];
  return [{ earthMasses: logBetween(random, ...HOT_JUPITER.earthMasses), a: axisOf(logBetween(random, ...HOT_JUPITER.days), star.mass), e: 0.01 * random.next() }];
}

function drawWide(star, random) {
  if (random.next() >= Math.min(WIDE.mostProbable, WIDE.perSun * star.mass ** WIDE.starMassPower)) return [];
  return [{ earthMasses: logBetween(random, ...WIDE.earthMasses), a: logBetween(random, ...WIDE.au), e: 0.3 * random.next() }];
}

function drawCold(star, random) {
  const from = axisOf(INNER.days[1], star.mass);
  return Array.from({ length: poisson(random, COLD.perStar * Math.log10(COLD.auSpan)) }, () => {
    const logRatio = clamp(COLD.logRatio + COLD.logRatioSpread * random.normal(), COLD.smallestRatio, COLD.largestRatio);
    const earthMasses = 10 ** logRatio * star.mass * EARTH_MASSES_PER_SUN;
    const a = logBetween(random, from, from * COLD.auSpan);
    return { earthMasses, a, e: Math.min(0.2, rayleigh(random, 0.04)), tilt: rayleigh(random, 1.2), ...smallBody(earthMasses, a, star, random) };
  });
}

function withSpread(planets, random) {
  if (planets.length === 1) return planets.map((planet) => ({ ...planet, e: Math.min(0.7, rayleigh(random, 0.25)), tilt: rayleigh(random, 1.5) }));
  const typicalE = 0.031 * (planets.length / 5) ** -1.74;
  const typicalTilt = 1.1 * (planets.length / 5) ** -1.73;
  return planets.map((planet) => ({
    ...planet,
    e: Math.min(0.5, typicalE * Math.exp(0.68 * random.normal())),
    tilt: Math.min(20, typicalTilt * Math.exp(0.85 * random.normal())),
  }));
}

function calmed(planets, starMass, least) {
  for (let share = 1; share > 0.01; share *= 0.7) {
    const tried = planets.map((planet) => ({ ...planet, e: planet.e * share }));
    if (spacedBy(tried, starMass, least)) return tried;
  }
  return planets.map((planet) => ({ ...planet, e: 0 }));
}

function clearOf(giants, smalls, starMass) {
  return smalls.filter((small) =>
    giants.every((giant) => (small.a < giant.a ? hillSpacing(small, giant, starMass) : hillSpacing(giant, small, starMass)) >= SMALLEST_HILL_BESIDE_GIANT));
}

function fitBetween(settled, candidates, starMass) {
  return candidates.reduce((kept, planet) => (spacedBy([...kept, planet], starMass, COLD.mutualHill) ? [...kept, planet] : kept), settled);
}

function massOfGiants(star, inner, random) {
  const hot = drawHotJupiter(star, random);
  const regular = hot.length ? [] : inner;
  const outer = fitGiants([...hot], [...drawGiants(star, regular, random), ...drawWide(star, random)], star.mass);
  return { giants: outer.map((giant) => withGiantBody(giant, star, random)), regular };
}

const fitGiants = (settled, candidates, starMass) =>
  candidates.reduce((kept, giant) => (spacedBy([...kept, giant], starMass, GIANT.mutualHill) ? [...kept, giant] : kept), settled);

const JUPITER_MASSES = 317.8;
const JUPITER_INNER_KELVIN = 100;
const innerKelvin = (earthMasses) => JUPITER_INNER_KELVIN * (earthMasses / JUPITER_MASSES) ** (earthMasses < JUPITER_MASSES ? 0.21 : 0.6);
const equilibriumKelvin = (star, a) => (EARTH_KELVIN * star.luminosity ** 0.25) / Math.sqrt(a);

const withGiantBody = (giant, star, random) =>
  ({ ...giant, tilt: rayleigh(random, 3), earthRadii: giantRadius(giant.earthMasses, equilibriumKelvin(star, giant.a), random) });

const survives = (planet, star) => {
  const nearest = Math.max((CLEAR_OF_STAR_RADII * star.radius) / 215, star.evolved ? EVOLVED_CLEARS_AU : 0);
  return planet.a * (1 - planet.e) > nearest && planet.a * (1 + planet.e) < star.companionAu * BINARY_STABLE_SHARE;
};

function described(planet, k, star, plane, random) {
  const around = 2 * Math.PI * random.next();
  return {
    letter: LETTERS[k],
    earthRadii: planet.earthRadii,
    earthMasses: planet.earthMasses,
    bare: Boolean(planet.bare),
    periodDays: daysOf(planet.a, star.mass),
    a: planet.a,
    e: planet.e,
    inclination: plane.inclination + planet.tilt * Math.cos(around),
    node: plane.node + (planet.tilt * Math.sin(around)) / Math.max(0.2, Math.sin(plane.inclination / DEGREES_PER_RADIAN)),
    periapsis: 360 * random.next(),
    kelvin: star.luminosity > 0 ? equilibriumKelvin(star, planet.a) : innerKelvin(planet.earthMasses),
    transitJd: null,
    periastronJd: null,
    radiusMeasured: true,
    massKnown: 'measured',
  };
}

const drawnMetallicity = (random) => clamp(METALLICITY.mean + METALLICITY.spread * random.normal(), -0.7, 0.5);

export function generatePlanets(properties, random, companionAu = Infinity) {
  const star = { ...properties, companionAu, metallicity: drawnMetallicity(random) };
  if (star.mass > MOST_MASSIVE_HOST) return [];
  return formPlanets(star, random, (planet) => survives(planet, star), (planet) => planet);
}

const SOLAR_RADII_PER_AU = 215.03;

export function generatePlanetsOfBlackHole({ suns, star: former }, random) {
  const star = { mass: MOST_MASSIVE_HOST, luminosity: 0, radius: 0, gaiaColour: 0, evolved: true, metallicity: drawnMetallicity(random) };
  const clearOfFormerStar = ({ a, e }) => a * (1 - e) > former.largestRadiusSuns / SOLAR_RADII_PER_AU;
  const widened = (planet) => ({ ...planet, a: (planet.a * former.suns) / suns });
  return formPlanets(star, random, clearOfFormerStar, widened).map((planet) => ({ ...planet, periodDays: daysOf(planet.a, suns) }));
}

function formPlanets(star, random, kept, moved) {
  const plane = { inclination: Math.acos(2 * random.next() - 1) * DEGREES_PER_RADIAN, node: 360 * random.next() };
  const { giants, regular } = massOfGiants(star, drawInner(star, random), random);
  const inner = clearOf(giants, calmed(withSpread(regular, random), star.mass, INNER.mutualHill), star.mass);
  const cold = clearOf(giants, drawCold(star, random), star.mass);
  const smalls = fitBetween(inner, cold, star.mass);
  return byAxis([...giants, ...smalls].filter((planet) => kept(planet))).map((planet, k) => described(moved(planet), k, star, plane, random));
}
