import { EXOPLANET_SYSTEMS } from './exoplanet-data.js';
import { DEGREES, directionFromEquatorial, equatorialToFrame, fromHeliocentric, SUN_PECULIAR, SUN_POSITION, velocityFromHeliocentric } from './milky-way.js';
import { createRandom } from './random.js';
import { facingParent, inStarlight, KM_PER_AU, ORBIT_PATH_POINTS, orbitPoint, SUN_RADIUS_KM, SYNCHRONOUS_LOOKAHEAD_DAYS } from './solar-system.js';
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
const SPIN_HOURS = [10, 26];
const MOST_TILT_DEGREES = 28;
const ALBEDO_FOR_BRIGHTNESS = { rocky: 0.25, hazy: 0.4, giant: 0.4 };
const WET_KELVIN = [175, 300];

const planck = (microns, kelvin) => 1 / (microns ** 3 * (Math.exp(Math.min(80, PLANCK_MICRON_KELVIN / (microns * kelvin))) - 1));
const planckBands = (kelvin) => BAND_MICRONS.map((microns) => planck(microns, kelvin));

function whiteForSunlight(kelvin) {
  const sun = planckBands(SUN_KELVIN);
  const relative = planckBands(kelvin).map((value, band) => value / sun[band]);
  const brightest = Math.max(...relative);
  return relative.map((value) => (value / brightest) ** DISPLAY_GAMMA);
}

const temperatureFromColour = (colour) => 4600 * (1 / (0.92 * colour + 1.7) + 1 / (0.92 * colour + 0.62));

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

function skyFrame({ ra, dec }) {
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
    node,
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
const SELF_LIT_PALETTE = [[0.5, 0.36, 0.28], [0.2, 0.12, 0.1]];
const HAZY_TINTS = [[300, [0.55, 0.72, 0.78]], [380, [0.6, 0.68, 0.78]], [600, [0.68, 0.64, 0.58]]];

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

function rockyTint({ kelvin }, random) {
  if (kelvin > 1300) return [0.2, 0.17, 0.16];
  if (kelvin > 850) return [0.33, 0.28, 0.26];
  if (isWet({ kelvin })) return mixed([0.36, 0.25, 0.17], [0.3, 0.28, 0.24], random.next());
  if (kelvin < WET_KELVIN[0]) return [0.8, 0.78, 0.75];
  return mixed([0.5, 0.43, 0.37], [0.55, 0.36, 0.25], random.next());
}

function lookOf(planet, synchronous, selfLit, random) {
  if (planet.earthRadii < LARGEST_ROCKY_EARTH_RADII) return { kind: 'rocky', invented: { seed: random.between(1, 60) }, tint: rockyTint(planet, random), haze: isWet(planet) ? THIN_AIR : undefined };
  if (planet.earthRadii < SMALLEST_GIANT_EARTH_RADII) return { kind: 'hazy', tint: underTemperature(HAZY_TINTS, planet.kelvin), haze: DEEP_AIR };
  const palette = selfLit ? SELF_LIT_PALETTE : underTemperature(GIANT_PALETTES, planet.kelvin);
  return { kind: 'giant', tint: mixed(...palette, 0.4), giantLook: giantLook(palette, synchronous, random) };
}

const SELF_LIT_HOSTS = ['HR 8799', 'Beta Pictoris'];

function glowOf(lamp, kelvin) {
  return planckBands(kelvin).map((value, band) => (value / lamp[band]) ** DISPLAY_GAMMA);
}

const poleOf = ({ inclination, node }) => [Math.sin(inclination) * Math.sin(node), -Math.sin(inclination) * Math.cos(node), Math.cos(inclination)];

function buildSystem(data, index) {
  const random = createRandom(7001 + 97 * index);
  const position = fromHeliocentric(scale(directionFromEquatorial(data.ra, data.dec), data.parsecs));
  const toFrame = skyFrame(data);
  const node = random.between(0, 2 * Math.PI);
  const madeUpInclination = random.between(...MADE_UP_INCLINATION);
  const absolute = data.visual - 5 * Math.log10(data.parsecs / 10);
  const radiusKm = data.radius * SUN_RADIUS_KM;
  const light = whiteForSunlight(data.kelvin);
  const starBands = planckBands(data.kelvin);
  const selfLit = SELF_LIT_HOSTS.includes(data.name);
  const planets = data.planets.map((planet) => {
    const orbit = orbitOf(planet, node, madeUpInclination, random);
    const synchronous = planet.periodDays < LONGEST_SYNCHRONOUS_DAYS;
    const look = lookOf(planet, synchronous, selfLit, random);
    const bodyRadiusKm = planet.earthRadii * EARTH_RADIUS_KM;
    const lamp = starBands.map((value) => value * (radiusKm / orbit.a) ** 2);
    const emits = selfLit && look.kind === 'giant';
    const albedo = ALBEDO_FOR_BRIGHTNESS[look.kind];
    return {
      name: `${data.name} ${planet.letter}`,
      host: data.name,
      radiusKm: bodyRadiusKm,
      magnitude: 5 * Math.log10(ABSOLUTE_MAGNITUDE_KM / (2 * bodyRadiusKm * Math.sqrt(albedo))) + absolute - SUN_ABSOLUTE,
      glowOverReflected: emits ? planckBands(planet.kelvin)[1] / lamp[1] / albedo : 0,
      glow: emits ? glowOf(lamp, planet.kelvin) : undefined,
      lamp,
      measured: planet,
      tideLocked: synchronous,
      holdKm: Math.min(HOLD_RADII * bodyRadiusKm, HOLD_SHARE_OF_ORBIT * orbit.a),
      orbit,
      spinHours: random.between(...SPIN_HOURS),
      tilt: random.between(0, MOST_TILT_DEGREES) * DEGREES,
      ...look,
    };
  });
  const north = normalize(toFrame(poleOf(planets[0].orbit)));
  const meridian = normalize(cross(north, [0.3, 0.5, 0.8]));
  const star = { name: data.name, kind: 'star', radiusKm, tint: light, magnitude: absolute, host: data.name, north, meridian, fromSunKm: [0, 0, 0] };
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
    planets,
    data,
    outermostKm: Math.max(...planets.map(({ orbit }) => orbit.a * (1 + orbit.e))),
    catalogueStar: { name: data.name, host: data.name, position, velocity: velocityOf(data), absolute, colour: colourFromTemperature(data.kelvin) },
    place(ms) {
      const bodies = planets.map((planet) => {
        const fromSunKm = offsetAt(planet, ms);
        return { ...planet, ...facing(planet, fromSunKm, ms), fromSunKm };
      });
      return inStarlight([star, ...bodies], position, radiusKm);
    },
    paths: (ms) =>
      planets.map(({ name, orbit }) => ({
        name,
        parent: data.name,
        pointsKm: Array.from({ length: ORBIT_PATH_POINTS }, (_, step) => toFrame(orbitPoint({ ...orbit, meanAnomaly: orbit.meanAnomalyAt(ms) - (2 * Math.PI * step) / ORBIT_PATH_POINTS }))),
      })),
  };
}

export const EXOPLANET_HOSTS = EXOPLANET_SYSTEMS.map(buildSystem);

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
  const isHost = (star) => {
    const { toward, apparent } = seenFromSun(star);
    return seenHosts.some((host) => dot(host.toward, toward) > nearestCosine && Math.abs(host.apparent - apparent) < SAME_STAR_MAGNITUDES);
  };
  return [...stars.filter((star) => !isHost(star)), ...hosts];
}
