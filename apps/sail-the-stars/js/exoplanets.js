import { HORIZON_KM_PER_SUN } from './black-holes.js';
import { isQuiet, steadyLongEnough, suitsLife } from './civilizations.js';
import { cloudTurn, SIMULATED_CLOUD_MAPS } from './clouds.js';
import { BRIGHT_SYSTEMS } from './bright-exoplanet-data.js';
import { EXOPLANET_SYSTEMS } from './exoplanet-data.js';
import { DEGREES, directionFromEquatorial, equatorialToFrame, fromHeliocentric, SUN_PECULIAR, SUN_POSITION, velocityFromHeliocentric } from './milky-way.js';
import { createRandom } from './random.js';
import { orbitPoint } from './kepler.js';
import { apparentRadiusKm, PULSAR_SYSTEMS } from './pulsars.js';
import { facingParent, inStarlight, KM_PER_AU, ORBIT_PATH_POINTS, SUN_RADIUS_KM, SYNCHRONOUS_LOOKAHEAD_DAYS } from './solar-system.js';
import { speculationShown } from './speculation.js';
import { stellarProperties, temperatureFromColour } from './stellar-properties.js';
import { generatePlanets, generatePlanetsOfBlackHole } from './system-generator.js';
import { add, cross, dot, normalize, rotateAbout, scale, subtract } from './vectors.js';

const EARTH_RADIUS_KM = 6371;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;
const KM_S_PER_MAS_YR_KPC = 4.74047;
const SUN_KELVIN = 5772;
const SUN_ABSOLUTE = 4.83;
const DISPLAY_GAMMA = 0.45;
const EYE_ADAPTS_TO_STARLIGHT = 0.5;
const BAND_MICRONS = [0.658, 0.551, 0.445];
const PLANCK_MICRON_KELVIN = 14387.77;
const LARGEST_ROCKY_EARTH_RADII = 1.9;
const SMALLEST_GIANT_EARTH_RADII = 5;
const LONGEST_SYNCHRONOUS_DAYS = 60;
const HOLD_RADII = 200;
const HOLD_SHARE_OF_ORBIT = 0.3;
const MADE_UP_INCLINATION = [35, 75];
const ABSOLUTE_MAGNITUDE_KM = 1329;
const LONE_STAR_VIEW_RADII = 8;
const SPIN_HOURS = [10, 26];
const MOST_TILT_DEGREES = 28;
const ALBEDO_FOR_BRIGHTNESS = { rocky: 0.25, hazy: 0.4, giant: 0.4 };
const WET_KELVIN = [175, 300];
const AGE_SALT = 0x3c6ef372;
const WET_SALT = 0x5be0cd19;
const WET_CHANCE_BY_HOST_KELVIN = [[3900, 0.02], [5300, 0.15], [Infinity, 0.3]];
const SKYLIGHT = [0.07, 0.07, 0.07];
const SKYLIGHT_RADIANS = 0.6;

const planck = (microns, kelvin) => 1 / (microns ** 3 * (Math.exp(Math.min(80, PLANCK_MICRON_KELVIN / (microns * kelvin))) - 1));
const planckBands = (kelvin) => BAND_MICRONS.map((microns) => planck(microns, kelvin));

function whiteForSunlight(kelvin) {
  const sun = planckBands(SUN_KELVIN);
  const relative = planckBands(kelvin).map((value, band) => value / sun[band]);
  const brightest = Math.max(...relative);
  return relative.map((value) => (value / brightest) ** DISPLAY_GAMMA);
}

function colourFromTemperature(kelvin) {
  let low = -0.3;
  let high = 2;
  for (let step = 0; step < 30; step++) {
    const middle = (low + high) / 2;
    if (temperatureFromColour(middle) > kelvin) low = middle;
    else high = middle;
  }
  return low;
}

const along = (ra, dec) => [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];

function velocityOf({ ra, dec, parsecs, motion: [pmRa, pmDec], radialKmS }) {
  const [a, d] = [ra * DEGREES, dec * DEGREES];
  const east = [-Math.sin(a), Math.cos(a), 0];
  const north = [-Math.sin(d) * Math.cos(a), -Math.sin(d) * Math.sin(a), Math.cos(d)];
  const acrossKmS = (masPerYear) => (KM_S_PER_MAS_YR_KPC * masPerYear * parsecs) / 1000;
  const heliocentric = add(add(scale(along(a, d), radialKmS), scale(east, acrossKmS(pmRa))), scale(north, acrossKmS(pmDec)));
  return add(equatorialToFrame(heliocentric), velocityFromHeliocentric(SUN_PECULIAR));
}

export function skyFrame({ ra, dec }) {
  const away = equatorialToFrame(along(ra * DEGREES, dec * DEGREES));
  const pole = equatorialToFrame([0, 0, 1]);
  const north = normalize(subtract(pole, scale(away, dot(pole, away))));
  const west = cross(away, north);
  return ([x, y, z]) => add(add(scale(north, x), scale(west, y)), scale(away, z));
}

function meanAnomalyAtTransit(e, periapsis) {
  const trueAnomaly = 90 * DEGREES - periapsis;
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(trueAnomaly / 2));
  return E - e * Math.sin(E);
}

function orbitOf(planet, node, madeUpInclination, random) {
  const { e, transitJd, periastronJd, periodDays } = planet;
  const periapsis = (planet.periapsis ?? 0) * DEGREES;
  const madeUpAnomaly = random.between(0, 2 * Math.PI);
  const startJd = transitJd ?? periastronJd ?? UNIX_EPOCH_JD;
  let startAnomaly = periastronJd ? 0 : madeUpAnomaly;
  if (transitJd) startAnomaly = meanAnomalyAtTransit(e, periapsis);
  return {
    a: planet.a * KM_PER_AU,
    e,
    inclination: (planet.inclination ?? madeUpInclination) * DEGREES,
    node: planet.node === undefined ? node : planet.node * DEGREES,
    periapsisArgument: periapsis + Math.PI,
    meanAnomalyAt: (ms) => startAnomaly + (2 * Math.PI * (ms / MS_PER_DAY + UNIX_EPOCH_JD - startJd)) / periodDays,
  };
}

const GIANT_PALETTES = [
  [150, [[0.88, 0.82, 0.7], [0.66, 0.5, 0.37]]],
  [350, [[0.93, 0.92, 0.9], [0.68, 0.73, 0.8]]],
  [850, [[0.3, 0.47, 0.72], [0.19, 0.32, 0.58]]],
  [1260, [[0.16, 0.29, 0.62], [0.08, 0.16, 0.42]]],
  [Infinity, [[0.38, 0.31, 0.32], [0.17, 0.13, 0.17]]],
];
const ICE_PALETTE = [[0.66, 0.82, 0.86], [0.46, 0.64, 0.8]];
const SMALLEST_BANDED_EARTH_RADII = 2.6;
const WARMEST_BANDED_ICE_KELVIN = 200;
const SELF_LIT_PALETTE = [[0.5, 0.36, 0.28], [0.2, 0.12, 0.1]];
const HAZY_TINTS = [[300, [0.55, 0.72, 0.78]], [380, [0.6, 0.68, 0.78]], [600, [0.68, 0.64, 0.58]], [1000, [0.6, 0.53, 0.47]], [Infinity, [0.5, 0.4, 0.36]]];

const COLOUR_VARIETY = 0.14;
const varied = (colour, random) => colour.map((value) => Math.min(0.97, value * (1 + COLOUR_VARIETY * (2 * random.next() - 1))));
const mixed = (from, to, share) => from.map((value, axis) => value + (to[axis] - value) * share);
const underTemperature = (table, kelvin) => table.find(([ceiling]) => kelvin < ceiling)[1];

function giantLook(palette, synchronous, random) {
  const count = synchronous ? 9 : 17;
  const bands = Array.from({ length: count }, (_, k) => {
    const latitude = -90 + (180 * k) / (count - 1) + (k > 0 && k < count - 1 ? random.between(-3, 3) : 0);
    const share = Math.min(1, Math.max(0, (k % 2) * 0.75 + random.between(0, 0.35)));
    return [latitude, ...mixed(palette[0], palette[1], share), random.between(0.4, 1.4)];
  });
  const jets = synchronous
    ? [[0, 0.5, 18], [-52, -0.2, 10], [52, -0.2, 10]]
    : [-60, -42, -27, -13, 0, 13, 27, 42, 60].map((latitude) => [latitude, random.between(-0.2, 0.4), random.between(2, 5)]);
  const spots = Array.from({ length: 3 }, (_, k) => ({
    north: (k % 2 ? 1 : -1) * random.between(16, 50), east: random.between(-180, 180), wide: random.between(3, 6), tall: random.between(1.5, 3.5),
    colour: mixed(palette[k % 2], [1, 1, 1], 0.12), spin: 0.8, hollow: 0.3,
  }));
  return { bands, jets, spots, eddyScale: synchronous ? 5 : 9, eddySpeed: synchronous ? 0.09 : 0.06, streaks: 0.14, wisps: 0.45, hexagon: 0 };
}

const THIN_AIR = { gas: { depth: [0.035, 0.08, 0.19], scaleKm: 8 }, dust: { depth: [0.05, 0.05, 0.05], light: [0.05, 0.05, 0.05], scaleKm: 2, forwardness: 0.76, sunDimming: 1 } };
const DEEP_AIR = { gas: { depth: [0.03, 0.07, 0.16], scaleKm: 60 }, dust: { depth: [0.2, 0.2, 0.2], light: [0.16, 0.16, 0.16], scaleKm: 60, forwardness: 0.4, sunDimming: 0.5 } };

const isWet = ({ kelvin }) => kelvin > WET_KELVIN[0] && kelvin < WET_KELVIN[1];

const wetChance = (hostKelvin) => WET_CHANCE_BY_HOST_KELVIN.find(([below]) => hostKelvin < below)[1];
const dryTint = (seed) => mixed([0.5, 0.43, 0.37], [0.55, 0.36, 0.25], seed % 1);

function rockyTint({ kelvin }, random) {
  if (kelvin > 1300) return [0.2, 0.17, 0.16];
  if (kelvin > 850) return [0.33, 0.28, 0.26];
  if (isWet({ kelvin })) return mixed([0.36, 0.25, 0.17], [0.3, 0.28, 0.24], random.next());
  if (kelvin < WET_KELVIN[0]) return [0.8, 0.78, 0.75];
  return mixed([0.5, 0.43, 0.37], [0.55, 0.36, 0.25], random.next());
}

let seaWorlds = 0;
const nextCloudMap = () => seaWorlds++ % SIMULATED_CLOUD_MAPS;
const cloudMapFor = (planet, random) => (planet.bare === undefined ? nextCloudMap() : random.integer(0, SIMULATED_CLOUD_MAPS - 1));
const isRocky = ({ bare, earthRadii }) => bare ?? earthRadii < LARGEST_ROCKY_EARTH_RADII;

function rockyLook(planet, random) {
  const seed = random.between(1, 60);
  if (!isWet(planet)) return { kind: 'rocky', invented: { seed }, tint: rockyTint(planet, random) };
  const wet = { kind: 'rocky', invented: { seed, wet: true, version: 'wet', shapeVersion: 'wet', cloudMap: cloudMapFor(planet, random) }, tint: rockyTint(planet, random), haze: THIN_AIR };
  const dry = { kind: 'rocky', invented: { seed, version: 'dry', shapeVersion: 'dry' }, tint: dryTint(seed), haze: undefined };
  return { ...dry, looks: { wet, dry } };
}

function lookOf(planet, synchronous, selfLit, random) {
  const madeUp = planet.bare !== undefined;
  if (isRocky(planet)) return rockyLook(planet, random);
  const bandedIce = madeUp && planet.earthRadii >= SMALLEST_BANDED_EARTH_RADII && planet.kelvin < WARMEST_BANDED_ICE_KELVIN;
  if (planet.earthRadii < SMALLEST_GIANT_EARTH_RADII && !bandedIce) {
    const tint = underTemperature(HAZY_TINTS, planet.kelvin);
    return { kind: 'hazy', tint: madeUp ? varied(tint, random) : tint, haze: DEEP_AIR };
  }
  const usual = bandedIce && planet.earthRadii < SMALLEST_GIANT_EARTH_RADII ? ICE_PALETTE : underTemperature(GIANT_PALETTES, planet.kelvin);
  const palette = selfLit ? SELF_LIT_PALETTE : madeUp ? usual.map((colour) => varied(colour, random)) : usual;
  return { kind: 'giant', tint: mixed(...palette, 0.4), giantLook: giantLook(palette, synchronous, random) };
}

const shownNow = ({ measured }) => !measured.speculative || speculationShown();
const shownLook = ({ looks, measured }) => (looks && (speculationShown() || measured.wetByDefault) ? looks.wet : looks?.dry);

const SELF_LIT_HOSTS = ['HR 8799', 'Beta Pictoris'];

function glowOf(lamp, kelvin) {
  return planckBands(kelvin).map((value, band) => (value / lamp[band]) ** DISPLAY_GAMMA);
}

const poleOf = ({ inclination, node }) => [Math.sin(inclination) * Math.sin(node), -Math.sin(inclination) * Math.cos(node), Math.cos(inclination)];

function measuredSystem(data, index) {
  const position = fromHeliocentric(scale(directionFromEquatorial(data.ra, data.dec), data.parsecs));
  const absolute = data.visual - 5 * Math.log10(data.parsecs / 10);
  const catalogueStar = { name: data.name, host: data.name, position, velocity: velocityOf(data), absolute, colour: colourFromTemperature(data.kelvin), wellKnown: index < EXOPLANET_SYSTEMS.length };
  const planets = data.planets.map((planet) => ({ ...planet, inhabited: isRocky(planet) && suitsLife(planet) && isQuiet(data) }));
  return buildSystem({ ...data, planets }, { random: createRandom(7001 + 97 * index), toFrame: skyFrame(data), catalogueStar });
}

function madeUpPlanets(properties, random, { seed, companionAu }) {
  const planets = generatePlanets(properties, random, companionAu);
  const steady = steadyLongEnough(properties, createRandom(seed ^ AGE_SALT));
  const wetRoll = createRandom(seed ^ WET_SALT);
  return planets.map((planet) => {
    const habitable = isRocky(planet) && suitsLife(planet) && steady(planet);
    const roll = wetRoll.next();
    return { ...planet, inhabited: habitable, wetByDefault: habitable && roll < wetChance(properties.kelvin) };
  });
}

export const hasMadeUpCivilization = (star, drawn) => madeUpPlanets(stellarProperties(star), createRandom(drawn.seed), drawn).some(({ inhabited }) => inhabited);

export function madeUpSystem(star, drawn) {
  const random = createRandom(drawn.seed);
  const properties = stellarProperties(star);
  const data = { name: star.name, kelvin: properties.kelvin, radius: properties.radius, madeUp: true, planets: madeUpPlanets(properties, random, drawn) };
  return buildSystem(data, { random, toFrame: (vector) => vector, catalogueStar: { ...star, host: star.name } });
}

const SUN_VISUAL_RADIANCE = planckBands(SUN_KELVIN)[1];
const thermalAbsolute = ({ suns, kelvin }) => SUN_ABSOLUTE - 2.5 * Math.log10((apparentRadiusKm(suns) / SUN_RADIUS_KM) ** 2 * (planckBands(kelvin)[1] / SUN_VISUAL_RADIANCE));

function pulsarSystem(data, index) {
  const position = fromHeliocentric(scale(directionFromEquatorial(data.ra, data.dec), data.parsecs));
  const absolute = data.visual === undefined ? thermalAbsolute(data.pulsar) : data.visual - 5 * Math.log10(data.parsecs / 10);
  const catalogueStar = { name: data.name, host: data.name, position, velocity: velocityOf(data), absolute, colour: colourFromTemperature(data.pulsar.kelvin), wellKnown: true, pulsar: data.pulsar };
  const planets = data.planets.map((planet) => ({ ...planet, inhabited: false }));
  return buildSystem({ ...data, planets }, { random: createRandom(9001 + 97 * index), toFrame: skyFrame(data), catalogueStar });
}

export function blackHoleSystem(star, seed) {
  const random = createRandom(seed);
  const planets = star.hole.star ? generatePlanetsOfBlackHole(star.hole, random) : [];
  const data = { name: star.name, hole: star.hole, madeUp: true, planets };
  return buildSystem(data, { random, toFrame: (vector) => vector, catalogueStar: { ...star, host: star.name } });
}

const starShape = ({ radius, kelvin }) => ({ radiusKm: radius * SUN_RADIUS_KM, light: whiteForSunlight(kelvin), starBands: planckBands(kelvin) });
const holeShape = ({ suns }) => ({ radiusKm: suns * HORIZON_KM_PER_SUN, light: SKYLIGHT, starBands: planckBands(SUN_KELVIN) });
const neutronStarShape = ({ suns, kelvin }) => ({ radiusKm: apparentRadiusKm(suns), light: whiteForSunlight(kelvin), starBands: planckBands(kelvin) });
const shapeOf = (data) => (data.hole ? holeShape(data.hole) : data.pulsar ? neutronStarShape(data.pulsar) : starShape(data));
const neutronStarLook = (pulsar) => ({ kind: 'star', tint: whiteForSunlight(pulsar.kelvin), pulsar });

function axisOnSky(positionAngleDegrees, fromEarthDegrees) {
  const [angle, fromEarth] = [positionAngleDegrees * DEGREES, fromEarthDegrees * DEGREES];
  return [Math.sin(fromEarth) * Math.cos(angle), -Math.sin(fromEarth) * Math.sin(angle), -Math.cos(fromEarth)];
}

function spinFromSky({ positionAngle, fromEarthDegrees }, toFrame, random) {
  return normalize(toFrame(axisOnSky(positionAngle ?? random.between(0, 360), fromEarthDegrees)));
}

export const skyAxis = (place, { positionAngle, fromEarthDegrees }) => normalize(skyFrame(place)(axisOnSky(positionAngle, fromEarthDegrees)));

function buildSystem(data, { random, toFrame, catalogueStar }) {
  const { position, absolute } = catalogueStar;
  const node = random.between(0, 2 * Math.PI);
  const madeUpInclination = random.between(...MADE_UP_INCLINATION);
  const { radiusKm, light, starBands } = shapeOf(data);
  const skylit = data.hole && { litFrom: normalize(scale(position, -1)), sunAngularRadius: SKYLIGHT_RADIANS };
  const selfLit = data.selfLit || SELF_LIT_HOSTS.includes(data.name);
  const planets = data.planets.map((planet) => {
    const orbit = orbitOf(planet, node, madeUpInclination, random);
    const synchronous = planet.periodDays < LONGEST_SYNCHRONOUS_DAYS;
    const look = planet.pulsar ? neutronStarLook(planet.pulsar) : lookOf(planet, synchronous, selfLit, random);
    const bodyRadiusKm = planet.pulsar ? apparentRadiusKm(planet.pulsar.suns) : planet.earthRadii * EARTH_RADIUS_KM;
    const lamp = starBands.map((value) => value * (radiusKm / orbit.a) ** 2);
    const emits = selfLit && look.kind === 'giant';
    const albedo = ALBEDO_FOR_BRIGHTNESS[look.kind] ?? 1;
    return {
      name: planet.name ?? `${data.name} ${planet.letter}`,
      host: data.name,
      radiusKm: bodyRadiusKm,
      magnitude: planet.pulsar ? thermalAbsolute(planet.pulsar) : 5 * Math.log10(ABSOLUTE_MAGNITUDE_KM / (2 * bodyRadiusKm * Math.sqrt(albedo))) + absolute - SUN_ABSOLUTE,
      glowOverReflected: emits ? planckBands(planet.kelvin)[1] / lamp[1] / albedo : 0,
      glow: emits ? glowOf(lamp, planet.kelvin) : undefined,
      lamp,
      measured: planet,
      tideLocked: synchronous,
      madeUp: data.madeUp,
      civilization: planet.inhabited ? { lamps: { dim: light, bright: light } } : undefined,
      speculative: planet.speculative,
      ...(planet.ringOuterKm && { rings: true, ringOuterKm: planet.ringOuterKm }),
      holdKm: Math.min(HOLD_RADII * bodyRadiusKm, HOLD_SHARE_OF_ORBIT * orbit.a),
      orbit,
      spinHours: random.between(...SPIN_HOURS),
      tilt: random.between(0, MOST_TILT_DEGREES) * DEGREES,
      ...look,
      ...skylit,
    };
  });
  const north = data.hole?.pole ?? (data.pulsar?.spin && spinFromSky(data.pulsar.spin, toFrame, random)) ?? normalize(toFrame(poleOf(planets[0]?.orbit ?? { inclination: madeUpInclination * DEGREES, node })));
  const meridian = normalize(cross(north, [0.3, 0.5, 0.8]));
  const star = { name: data.name, kind: 'star', radiusKm, tint: light, magnitude: absolute, host: data.name, hole: data.hole, pulsar: data.pulsar, north, meridian, fromSunKm: [0, 0, 0] };
  const offsetAt = ({ orbit }, ms) => toFrame(orbitPoint({ ...orbit, meanAnomaly: orbit.meanAnomalyAt(ms) }));

  function facing(planet, offset, ms) {
    const locked = facingParent(offset, offsetAt(planet, ms + SYNCHRONOUS_LOOKAHEAD_DAYS * MS_PER_DAY));
    if (planet.tideLocked) return locked;
    const inPlane = normalize(cross(locked.north, equatorialToFrame([0, 0, 1])));
    const north = rotateAbout(locked.north, inPlane, planet.tilt);
    const turn = ((ms / (planet.spinHours * 3600000)) % 1) * 2 * Math.PI;
    return { north, meridian: rotateAbout(inPlane, north, turn) };
  }

  return {
    name: data.name,
    position,
    light: light.map((value) => value ** EYE_ADAPTS_TO_STARLIGHT),
    star,
    get planets() {
      return planets.filter(shownNow);
    },
    data,
    outermostKm: Math.max(LONE_STAR_VIEW_RADII * radiusKm, ...planets.map(({ orbit }) => orbit.a * (1 + orbit.e))),
    catalogueStar,
    planetFromStarKm: (letter, ms) => offsetAt(planets.find(({ measured }) => measured.letter === letter), ms),
    place(ms) {
      const bodies = planets.filter(shownNow).map((planet) => {
        const fromSunKm = offsetAt(planet, ms);
        return { ...planet, ...shownLook(planet), ...facing(planet, fromSunKm, ms), fromSunKm, cloudTurn: planet.tideLocked ? 0 : cloudTurn(ms) };
      });
      return inStarlight([star, ...bodies], position, radiusKm);
    },
    paths: (ms) =>
      planets.filter(shownNow).map(({ name, orbit }) => ({
        name,
        parent: data.name,
        pointsKm: Array.from({ length: ORBIT_PATH_POINTS }, (_, step) => toFrame(orbitPoint({ ...orbit, meanAnomaly: orbit.meanAnomalyAt(ms) - (2 * Math.PI * step) / ORBIT_PATH_POINTS }))),
      })),
  };
}

export const EXOPLANET_HOSTS = [...EXOPLANET_SYSTEMS, ...BRIGHT_SYSTEMS].map(measuredSystem);
export const PULSAR_HOSTS = PULSAR_SYSTEMS.map(pulsarSystem);

const SAME_STAR_DEGREES = 0.1;
const SAME_STAR_MAGNITUDES = 1;

export function withExoplanetHosts(stars) {
  const hosts = EXOPLANET_HOSTS.map(({ catalogueStar }) => catalogueStar);
  const seenFromSun = (star) => {
    const offset = subtract(star.position, SUN_POSITION);
    const distance = Math.hypot(...offset);
    return { toward: scale(offset, 1 / distance), apparent: star.absolute + 5 * Math.log10(distance / 10) };
  };
  const seenHosts = hosts.map(seenFromSun);
  const nearestCosine = Math.cos(SAME_STAR_DEGREES * DEGREES);
  const sightings = stars.map((star) => ({ star, ...seenFromSun(star) }));
  const replaced = seenHosts.map((host) => {
    const same = sightings.filter(({ toward, apparent }) => dot(host.toward, toward) > nearestCosine && Math.abs(host.apparent - apparent) < SAME_STAR_MAGNITUDES);
    return same.sort((a, b) => dot(b.toward, host.toward) - dot(a.toward, host.toward))[0]?.star;
  });
  return [...stars.filter((star) => !replaced.includes(star)), ...hosts];
}
