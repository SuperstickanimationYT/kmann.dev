import { speculationShown } from './speculation.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';

const MS_PER_DAY = 86400000;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;
const DEGREES = Math.PI / 180;
const STARTS = 2400;
const CLOUDS_GONE = 2740;
const CO2_FROZEN = 3000;
const SHADE_FINISHED = 2560;
const MIRROR_STARTS = 5300;
const MIRROR_FINISHED = 5600;
const SETTLED_FROM = 5900;
const LAST_CHANGE = 9500;
const REPAINT_EVERY_YEARS = 25;
const SHADE_DISTANCE_KM = 1.01e6;
const SHADE_RADIUS_KM = 12550;
const FULL_SHADE_SHEEN_MAGNITUDE = -2.2;
const MIRROR_ORBIT_KM = 39450;
const MIRROR_RADIUS_KM = 4370;
const MIRROR_TILT = 20 * DEGREES;
const MIRROR_PERIOD_MS = MS_PER_DAY;
const COLD_LOOK_SHIFT_KELVIN = 40;
const WARMEST_SEA_LOOK_KELVIN = 299;
const VENUS_SEED = 23;
const VENUS_CLOUD_MAP = 4;

const LIGHT = [[STARTS, 1], [SHADE_FINISHED, 0], [2950, 0], [3050, 0.2], [MIRROR_STARTS - 20, 0.2], [MIRROR_STARTS, 0], [MIRROR_FINISHED, 1]];
const KELVIN = [[STARTS, 735], [SHADE_FINISHED, 715], [2760, 304], [2900, 217], [CO2_FROZEN, 190], [MIRROR_STARTS, 190], [5750, 287], [LAST_CHANGE, 288]];
const SEA_LEVEL_KM = [[CLOUDS_GONE, -2.4], [2760, -2], [2820, 0.2], [2900, 0.83], [MIRROR_STARTS, 0.69]];
const CLOUDINESS = [[CLOUDS_GONE, 0.6], [2900, 0.3], [CO2_FROZEN, 0.08], [MIRROR_STARTS, 0.08], [5750, 0.95]];
const GREENERY = [[5800, 0], [6400, 0.35], [7500, 1]];
const PEOPLE = [[SETTLED_FROM, 1e5], [6500, 5e7], [7500, 8e8], [8500, 3e9], [LAST_CHANGE, 5e9]];
const CITIES_SHOWN = [[SETTLED_FROM, 0], [6500, 0.25], [7500, 0.6], [LAST_CHANGE, 1]];

const STAGES = [
  [STARTS, 'Building the sunshade'],
  [SHADE_FINISHED, 'Cooling in the shade'],
  [2760, 'Carbon dioxide raining out as seas'],
  [2900, 'Carbon dioxide seas freezing'],
  [CO2_FROZEN, 'Turning dry ice into water with shipped hydrogen'],
  [MIRROR_STARTS, 'Building the day mirror, ice melting'],
  [5750, 'Seeding plants and making oxygen'],
  [7500, 'Breathable, oceans and forests'],
];

const SEA_AIR_HAZE = { gas: { depth: [0.046, 0.108, 0.265], scaleKm: 8 }, dust: { depth: [0.05, 0.05, 0.05], light: [0.05, 0.05, 0.05], scaleKm: 2, forwardness: 0.76, sunDimming: 1 } };
const VENUS_LAMPS = { dim: [1, 0.82, 0.62], bright: [1, 0.95, 0.86] };

const yearOf = (ms) => 2000 + (ms - Date.UTC(2000, 0, 1)) / MS_PER_YEAR;

function along(curve, year) {
  const next = curve.findIndex(([from]) => from > year);
  if (next === 0) return curve[0][1];
  if (next < 0) return curve.at(-1)[1];
  const [[earlier, before], [later, after]] = [curve[next - 1], curve[next]];
  return before + ((after - before) * (year - earlier)) / (later - earlier);
}

function peopleIn(year) {
  return year < SETTLED_FROM ? 0 : Math.exp(along(PEOPLE.map(([from, people]) => [from, Math.log(people)]), year));
}

const progress = (from, to, year) => Math.min(1, Math.max(0, (year - from) / (to - from)));

function factsIn(year) {
  const kelvin = Math.round(along(KELVIN, year) / 5) * 5;
  return {
    stage: STAGES.findLast(([from]) => year >= from)[1],
    temperature: `about ${kelvin} K (${kelvin - 273} °C)`,
    people: peopleIn(year),
  };
}

function paintedLook(year) {
  const version = Math.floor(Math.min(year, LAST_CHANGE) / REPAINT_EVERY_YEARS);
  const shownYear = Math.max(CLOUDS_GONE, version * REPAINT_EVERY_YEARS);
  const seaLevelKm = along(SEA_LEVEL_KM, shownYear);
  const kelvin = Math.min(WARMEST_SEA_LOOK_KELVIN, along(KELVIN, shownYear) + (shownYear < MIRROR_STARTS ? COLD_LOOK_SHIFT_KELVIN : 0));
  return {
    kind: 'rocky',
    tint: [0.34, 0.28, 0.22],
    haze: SEA_AIR_HAZE,
    cloudSpin: undefined,
    invented: {
      seed: VENUS_SEED,
      cloudMap: VENUS_CLOUD_MAP,
      kelvin,
      wet: true,
      version,
      shapeVersion: `${Math.round(seaLevelKm * 10)} ${Math.round(kelvin / 10)}`,
      terrain: { seaLevelKm, greenery: along(GREENERY, shownYear), cloudiness: along(CLOUDINESS, shownYear) },
    },
    ...(year >= SETTLED_FROM && { civilization: { lamps: VENUS_LAMPS }, cityLights: along(CITIES_SHOWN, year) }),
  };
}

export function terraformed(body, ms) {
  const year = yearOf(ms);
  if (body.name !== 'Venus' || year < STARTS || !speculationShown()) return body;
  return {
    ...body,
    ...(year >= CLOUDS_GONE && paintedLook(year)),
    lightShare: along(LIGHT, year),
    sunThroughShade: along(LIGHT, Math.min(year, MIRROR_STARTS)),
    terraforming: factsIn(year),
  };
}

function mirrorOffsetKm(venus, sunward, ms) {
  const side = normalize(cross(venus.north, sunward));
  const level = normalize(subtract(sunward, scale(venus.north, dot(sunward, venus.north))));
  const rising = add(scale(level, Math.cos(MIRROR_TILT)), scale(venus.north, Math.sin(MIRROR_TILT)));
  const angle = (2 * Math.PI * (ms % MIRROR_PERIOD_MS)) / MIRROR_PERIOD_MS;
  return scale(add(scale(rising, Math.cos(angle)), scale(side, Math.sin(angle))), MIRROR_ORBIT_KM);
}

const swarm = (name, offsetKm, venus, radiusKm, shape) => ({
  name,
  kind: 'mirror',
  parent: 'Venus',
  radiusKm,
  holdKm: 0,
  tint: [0.75, 0.77, 0.8],
  magnitude: FULL_SHADE_SHEEN_MAGNITUDE - 5 * Math.log10(radiusKm / SHADE_RADIUS_KM),
  fromSunKm: add(venus.fromSunKm, offsetKm),
  mapLayer: -1,
  ...shape,
});

export function mirrorsAround(venus, ms) {
  const year = yearOf(ms);
  if (!venus.terraforming) return [];
  const sunward = normalize(scale(venus.fromSunKm, -1));
  const across = normalize(cross(sunward, venus.north));
  const shadeSize = SHADE_RADIUS_KM * Math.sqrt(progress(STARTS, SHADE_FINISHED, year));
  const mirrors = [];
  if (shadeSize > 0) mirrors.push(swarm('Venus sunshade', scale(sunward, SHADE_DISTANCE_KM), venus, shadeSize, { north: sunward, meridian: across, shades: true }));
  const mirrorSize = MIRROR_RADIUS_KM * Math.sqrt(progress(MIRROR_STARTS, MIRROR_FINISHED, year));
  if (mirrorSize <= 0) return mirrors;
  const offset = mirrorOffsetKm(venus, sunward, ms);
  const facing = normalize(scale(offset, -1));
  return [...mirrors, swarm('Venus day mirror', offset, venus, mirrorSize, { north: facing, meridian: normalize(cross(facing, venus.north)), shines: true })];
}

export function mirrorLight(venus, mirrors) {
  const mirror = mirrors.find(({ shines }) => shines);
  return mirror ? normalize(subtract(mirror.fromSunKm, venus.fromSunKm)) : null;
}
