import { compileVariantForTarget, createByteTarget, createContext, createFullFloatTarget, createPrograms, createTarget, setUniforms } from './gl.js';
import { createInventedGround } from './invented-ground.js';
import { SIMULATED_CLOUD_MAPS } from './clouds.js';
import {
  ARMED_NORMAL, BAR_ANGLE, BAR_ANGULAR_SPEED, DISK, LY_PER_PC, MAP_HALF_WIDTH, MAP_SIZE, PC_PER_YEAR_PER_KM_S,
  positionSeenAt, SUN_RADIUS,
} from './milky-way.js';
import { ARMED_BINS, BULGE_BINS, luminosityOf, SMOOTH_OLD_BINS, WHITE_BALANCE, YOUNG_BINS } from './population.js';
import { createRandom } from './random.js';
import { planckNanomaggies } from './warp.js';
import {
  BODIES_FRAGMENT, CAMERA_STAR_FRAGMENT, CAMERA_STAR_VERTEX, CLOUD_BAKED_OCTAVES, CLOUD_BILLOWS_FRAGMENT, CLOUD_FRAGMENT, CLOUD_MAP_SIZE, CLOUD_NEARBY_FRAGMENT, CLOUD_NEARBY_WIDTH, DEVELOP_FRAGMENT, EARTH_CLOUDS, LAYERS_PER_MAP,
  EYE_FRAGMENT, EYE_STAR_FRAGMENT, EYE_STAR_VERTEX, FULLSCREEN_VERTEX,
  GROUND_DETAIL_PERIOD_CELLS, GROUND_DETAIL_SLOPE_RANGE, GROUND_SKY_FRAGMENT, LATTICE_PERIOD, MAX_BODIES, MAX_HAZY, MAX_GALAXIES, MAX_NEBULAE, NOISE_SIZE,
  PATCH_FRAGMENT, PATCH_VERTEX, RIVER_FRAGMENT, RIVER_VERTEX, SAMPLE_FRAGMENT, SAMPLE_LOG_FLOOR, SAMPLE_LOG_SPAN, ROCK_SHADOW_LAYER, SHADOW_CASCADES, SHADOW_FRAGMENT, SHADOW_VERTEX,
  SKY_FRAGMENT, SKY_FROM_CUBE_FRAGMENT, SURFACES_FRAGMENT, INVENTED_SURFACES_FRAGMENT, TABLE_ROWS, TABLE_WIDTH,
  UNRESOLVED_FARTHEST, UNRESOLVED_NEAREST, UNRESOLVED_STEPS,
  SIMULATED_CLOUD_SIZE,
} from './shaders.js';
import { createSettlementPainter, settlementShown } from './settlements.js';
import { speculationShown } from './speculation.js';
import { createCraftView } from './craft-view.js';
import { createMotionBlur } from './motion-blur.js';
import { createGiantPainter } from './giant-painter.js';
import { grassMesh, MESH_FLOATS, ROCK_SHAPES, rockMesh } from './detail-meshes.js';
import { createBlackHoleView } from './black-hole-view.js';
import { SHADOW_MAP_SIZE } from './ground-patches.js';
import { createMapEdges } from './map-edges.js';
import { RIBBON_FLOATS } from './rivers.js';
import { rocksSeen, SCATTER_FLOATS, SCATTER_LAYERS } from './surface-scatter.js';
import { apparentMagnitude, KM_PER_PC, longestRadiusKm, MAPPED_BODIES, narrowAxis, sunShareVisible } from './solar-system.js';
import { lattice, mapCoordinates, PATCH_FLOATS, patchIndices } from './terrain.js';
import { nebulaRadius, STAR_FLOATS } from './stars.js';

const NEBULA_LIGHT_PER_IONIZING = 3700 / 1e49;
const NANOMAGGIES_PER_LIGHT_AT_PC = 1.169e9;
const GAS_COLOUR = [2.6, 1, 0.75];
const GAS_SHARE = 0.15;
const NOISE_SEED = 1;
const SAMPLE_WIDTH = 256;
const SAMPLE_HEIGHT = 192;
const YOUNG_LOCAL_LIGHT = YOUNG_BINS.reduce((sum, bin) => sum + bin.density * luminosityOf(bin.absolute), 0);

function modelUniforms() {
  return {
    uMapHalfWidth: MAP_HALF_WIDTH,
    uSunRadius: SUN_RADIUS,
    uBarAngle: BAR_ANGLE,
    uBarSpin: BAR_ANGULAR_SPEED,
    uFlatSpeed: 236,
    uRiseScale: 900,
    uSpeedToPcPerYear: PC_PER_YEAR_PER_KM_S,
    uYearsPerPc: LY_PER_PC,
    uBulgeScales: DISK.bulgeScales,
    uLongBarScales: DISK.longBarScales,
    uThin: DISK.midplane,
    uThinLength: DISK.scaleLength,
    uThinHeight: DISK.scaleHeight,
    uThick: DISK.thick,
    uThickLength: DISK.thickScaleLength,
    uThickHeight: DISK.thickScaleHeight,
    uBulge: DISK.bulge,
    uLongBar: DISK.longBar,
    uYoungPerArm: DISK.youngPerArm,
    uArmedFloor: DISK.armedFloor,
    uArmedNormal: ARMED_NORMAL,
    uYoungHeight: DISK.youngScaleHeight,
    uDustPerPc: DISK.dustPerPc,
    uDustLength: DISK.dustScaleLength,
    uDustHeight: DISK.dustScaleHeight,
    uGasColour: GAS_COLOUR,
    uGasPerYoung: GAS_SHARE * YOUNG_LOCAL_LIGHT,
  };
}

const UNRESOLVED_LOG_NEAR = Math.log(UNRESOLVED_NEAREST);
const UNRESOLVED_LOG_STEP = (Math.log(UNRESOLVED_FARTHEST) - UNRESOLVED_LOG_NEAR) / (UNRESOLVED_STEPS - 1);

const tableRow = (tables, row) => tables.subarray(row * TABLE_WIDTH * 4, (row + 1) * TABLE_WIDTH * 4);

function writeUnresolved(row, bins, reaches) {
  row.fill(0);
  for (let step = 0; step < UNRESOLVED_STEPS; step++) {
    const distance = Math.exp(UNRESOLVED_LOG_NEAR + step * UNRESOLVED_LOG_STEP);
    bins.forEach((bin, i) => {
      const reach = reaches[i];
      const hidden = reach <= 0 ? 1 : Math.min(1, Math.max(0, 5 * Math.log10(distance / reach) + 0.5));
      for (let band = 0; band < 3; band++) row[step * 4 + band] += hidden * bin.light[band];
    });
  }
}

function writeNebulae(place, glow, nebulae, camera) {
  nebulae.slice(0, MAX_NEBULAE).forEach((nebula, i) => {
    const firstGuess = Math.hypot(...nebula.present.map((value, axis) => value - camera[axis]));
    const seen = positionSeenAt(nebula.present, [0, 0, 0], firstGuess * LY_PER_PC);
    const offset = seen.map((value, axis) => value - camera[axis]);
    const distance = Math.max(Math.hypot(...offset), 1e-3);
    const radius = nebulaRadius(nebula);
    place.set([offset[0] / distance, offset[1] / distance, offset[2] / distance, Math.min(radius / distance, 1.5)], i * 4);
    const light = NEBULA_LIGHT_PER_IONIZING * nebula.ionizing;
    glow.set([(light * NANOMAGGIES_PER_LIGHT_AT_PC) / Math.max(distance, radius) ** 2, distance, 0, i * 0.618], i * 4);
  });
  return Math.min(nebulae.length, MAX_NEBULAE);
}

function galaxyUniforms(galaxies, camera) {
  const centre = new Float32Array(MAX_GALAXIES * 3);
  const normal = new Float32Array(MAX_GALAXIES * 3);
  const shape = new Float32Array(MAX_GALAXIES * 4);
  const tint = new Float32Array(MAX_GALAXIES * 3);
  galaxies.slice(0, MAX_GALAXIES).forEach((galaxy, i) => {
    const offset = galaxy.centre.map((value, axis) => value - camera[axis]);
    const distance = Math.hypot(...offset);
    centre.set(offset, i * 3);
    normal.set(galaxy.normal, i * 3);
    shape.set([galaxy.diskLight, galaxy.scaleLength, (galaxy.coreLight * NANOMAGGIES_PER_LIGHT_AT_PC) / distance ** 2, galaxy.coreSigma / distance], i * 4);
    tint.set(galaxy.tint, i * 3);
  });
  return { centre, normal, shape, tint, count: Math.min(galaxies.length, MAX_GALAXIES) };
}

function setArray(gl, program, name, values, size) {
  const location = program.uniforms[name];
  if (!location) return;
  if (size === 1) gl.uniform1fv(location, values);
  else if (size === 3) gl.uniform3fv(location, values);
  else gl.uniform4fv(location, values);
}

function viewUniforms({ camera, basis, tanHalf, pixelAngle }) {
  return {
    uCamera: camera,
    uRight: basis.right,
    uUp: basis.up,
    uForward: basis.forward,
    uTanHalf: tanHalf,
    uPixelAngle: pixelAngle,
  };
}

const NO_PLANET = { uPlanet: [0, 0, 1, 0] };
const SKY_CUBE_SIZE = 256;
const KEPT_SKY_UNITS = [19, 31];
const KEPT_SKY_SIZE = 512;
const KEPT_SKY_TILE = 128;
const KEPT_SKY_TILES_ACROSS = KEPT_SKY_SIZE / KEPT_SKY_TILE;
const KEPT_SKY_TILE_COUNT = 6 * KEPT_SKY_TILES_ACROSS ** 2;
const KEPT_SKY_DRIFT_PC = 0.01;
const KEPT_SKY_REACH_CHANGE = 0.02;
const KEPT_SKY_COARSEST = 1.5;
const SKY_PIXELS_PER_FRAME = 32768;
const SKY_CUBE_UNIT = 3;
const WARP_TABLE_UNIT = 4;
const SUN_KELVIN = 5772;
const BAND_MICRONS = [0.658, 0.551, 0.445];
const SUN_BANDS = BAND_MICRONS.map((microns) => planckNanomaggies(microns, SUN_KELVIN));
const BAND_TO_PHYSICAL = SUN_BANDS.map((flux, band) => flux / SUN_BANDS[1] / WHITE_BALANCE[band]);
const CUBE_FACES = [
  { forward: [1, 0, 0], right: [0, 0, -1], up: [0, -1, 0] },
  { forward: [-1, 0, 0], right: [0, 0, 1], up: [0, -1, 0] },
  { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { forward: [0, 0, 1], right: [1, 0, 0], up: [0, -1, 0] },
  { forward: [0, 0, -1], right: [-1, 0, 0], up: [0, -1, 0] },
];
const BODY_COLOUR_UNIT = 5;
const BODY_HEIGHT_UNIT = 6;
const BODY_MAP_SIZE = [1024, 512];
const GROUND_VIEW_UNIT = 7;
const SHADOW_MAP_UNIT = 8;
const NO_MORPH = [0, 0, 1];
const GROUND_DETAIL_UNIT = 9;
const CLOUD_BILLOWS_UNIT = 10;
const CLOUD_MAP_UNIT = 16;
const CLOUD_MAP_LAYERS = 2;
const SIMULATED_CLOUDS_UNIT = 27;
const CLOUD_NEARBY_UNIT = 17;
const CLOUD_NEARBY_DRIFT_KM = 12;
const CLOUD_VIEW_UNIT = 11;
const CLOUD_HISTORY_UNIT = 12;
const CLOUD_HISTORY_DEPTH_UNIT = 13;
const CLOUD_PASS_OUTPUTS = 2;
const CLOUD_RESOLUTION_SHARE = 0.5;
const CLOUD_BILLOWS_WIDTH = 1024 * 2 ** (CLOUD_BAKED_OCTAVES - 1);
const GROUND_DETAIL_TEXELS_PER_CELL = 4;
const GROUND_DETAIL_SEED = 2;
const SHADOW_SLOPE_BIAS = 3;
const SHADOW_CONSTANT_BIAS = 4;
const ROCK_SHADOW_SLOPE_BIAS = 1.5;
const NO_ROCK_SHADOW = [0, 0, 0, 1];
const NO_SHADOWS = { uShadowsOn: 0, uRockShadow: NO_ROCK_SHADOW };
const PLACED_LOCATION = 5;
const SEED_LOCATION = 6;
const ROCK_SUBDIVISIONS_WITHIN = [[0.08, 2], [0.35, 1], [Infinity, 0]];
const SHADOWS_COARSENED_BY = 0.15;
const TUFTS_THINNED_AT_REACH_SHARE = 0.7;
const FEWEST_TUFTS_SHARE = 0.15;
const GRASS_TINT = [1.05, 1.15, 0.85, 0];
const NO_DETAIL = [0, 0, 0, 0];
const RIVER_CYCLE_SECONDS = 1024;
const BODY_KIND_CODES = { rocky: 0, clouded: 1, giant: 2, star: 3, ocean: 4, hazy: 5, mirror: 7 };
const MIRROR_OCCLUDES_FROM_COSINE = 0.5;
const INVENTED_ROCKY_CODE = 6;
const NO_GLOW = [0, 0, 0];
const MIRROR_GLOW = [1, 0.97, 0.9];
const UNLIT_LAMP = [1, 1, 1];
const SUNLIGHT = [1, 1, 1];
const SUN_DISK_GLOW = 2;
const ECLIPSERS_PER_BODY = 2;
const REDDENING_ECLIPSER_SIGN = -1;
const CORONA_FADE_SHARE = 0.004;
const HIDDEN_BEHIND_FOREGROUND = true;
const STANDING_SHADOW_HALF_KM = 0.03;
const LATTICE_UNIT = 18;
const SURFACES_SEEN_UNIT = 19;
const INVENTED_SURFACES_SEEN_UNIT = 22;
const BODIES_SEEN_UNIT = 31;
const INVENTED_COLOUR_UNIT = 23;
const INVENTED_LAND_UNIT = 24;
const CITY_LIGHTS_UNIT = 25;
const SETTLEMENTS_UNIT = 26;
const EARTH_LAMPS = { dim: [1, 0.58, 0.24], bright: [1, 0.84, 0.6] };
const LATTICE_ORIGIN = 4096;

const nearestToZero = (index) => (index < LATTICE_PERIOD / 2 ? index : index - LATTICE_PERIOD) + LATTICE_ORIGIN;

function latticeByte(_, index) {
  const x = nearestToZero(index % LATTICE_PERIOD);
  const y = nearestToZero(Math.floor(index / LATTICE_PERIOD) % LATTICE_PERIOD);
  const z = nearestToZero(Math.floor(index / LATTICE_PERIOD ** 2));
  return Math.floor(255 * lattice(x, y, z, 0) + 0.5);
}
const NO_GROUND = { uGround: { int: -1 } };
const NO_CLOUDS = [0, 0, 0, 0];
const CLOUD_SETTING_ORDER = ['baseKm', 'topKm', 'extinctionPerKm', 'coverShift'];
const AIRLESS = { tint: [0, 0, 0], scaleKm: 0, glow: [0, 0, 0], hazeKm: 1, sunset: [0, 0, 0] };

function groundUniforms(ground, shown) {
  if (!ground) return NO_GROUND;
  const index = shown.findIndex(({ body }) => body.name === ground.body.name);
  if (index < 0) return NO_GROUND;
  const air = ground.settings.air ?? AIRLESS;
  return {
    uGround: { int: index },
    uGroundCamera: ground.cameraLocalKm,
    uGroundRadius: ground.body.radiusKm,
    uGroundExcess: ground.frame.excess,
    uGroundFromAnchor: ground.frame.fromAnchor,
    uGroundClouds: ground.settings.clouds ? CLOUD_SETTING_ORDER.map((name) => ground.settings.clouds[name]) : NO_CLOUDS,
    uGroundAir: [...air.tint, air.scaleKm],
    uGroundGlow: [...air.glow, air.hazeKm],
    uGroundSunset: air.sunset,
    uGroundOvercast: air.overcast ?? 0,
    uGroundRoughness: ground.settings.roughness,
    uGroundMeridian: ground.body.meridian,
    uGroundCameraUp: ground.frame.up,
    uGroundCameraUv: mapCoordinates(ground.frame.up),
    uGroundBlend: ground.blend,
  };
}

const NO_HAZY_BODY = -1;

function hazeUniforms(shown) {
  const hazy = shown.flatMap(({ body }, index) => (body.haze ? [{ index, ...body.haze, radiusKm: body.radiusKm }] : [])).slice(0, MAX_HAZY);
  const rows = (row) => {
    const values = new Float32Array(MAX_HAZY * 4);
    hazy.forEach((haze, k) => values.set(row(haze), k * 4));
    return values;
  };
  return {
    bodies: Array.from({ length: MAX_HAZY }, (_, k) => hazy[k]?.index ?? NO_HAZY_BODY),
    arrays: {
      uHazeGas: rows(({ gas, radiusKm }) => [...gas.depth, gas.scaleKm / radiusKm]),
      uHazeDust: rows(({ dust, radiusKm }) => [...dust.depth, dust.scaleKm / radiusKm]),
      uHazeDustLight: rows(({ dust }) => [...dust.light, dust.forwardness]),
      uHazeLayer: rows(({ layer, radiusKm }) => (layer ? [...layer.light, layer.heightKm / radiusKm] : [0, 0, 0, 0])),
      uHazeLayerShape: rows(({ dust, layer, radiusKm }) => [(layer?.thicknessKm ?? 0) / radiusKm, dust.sunDimming, 0, 0]),
    },
  };
}

function bodyLocalBasis(body, { right, up, forward }) {
  const { meridian, north } = body;
  const east = [north[1] * meridian[2] - north[2] * meridian[1], north[2] * meridian[0] - north[0] * meridian[2], north[0] * meridian[1] - north[1] * meridian[0]];
  const local = (v) => [meridian, east, north].map((axis) => v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]);
  return { uLocalRight: local(right), uLocalUp: local(up), uLocalForward: local(forward) };
}

function groundDetailTexels() {
  const period = GROUND_DETAIL_PERIOD_CELLS;
  const size = period * GROUND_DETAIL_TEXELS_PER_CELL;
  const random = createRandom(GROUND_DETAIL_SEED);
  const lattice = Float32Array.from({ length: period ** 3 }, () => random.next());
  const at = (x, y, z) => lattice[((z % period) * period + (y % period)) * period + (x % period)];
  const texels = new Uint8Array(size ** 3 * 4);
  const byte = (value) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  for (let k = 0; k < size; k++) for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const p = [i, j, k].map((texel) => (texel + 0.5) / GROUND_DETAIL_TEXELS_PER_CELL);
    const [x, y, z] = p.map(Math.floor);
    const f = p.map((value, axis) => value - [x, y, z][axis]);
    const u = f.map((t) => t * t * t * (t * (t * 6 - 15) + 10));
    const du = f.map((t) => 30 * t * t * (t * (t - 2) + 1));
    const a = at(x, y, z), b = at(x + 1, y, z), d = at(x, y + 1, z), e = at(x + 1, y + 1, z);
    const g = at(x, y, z + 1), h = at(x + 1, y, z + 1), m = at(x, y + 1, z + 1), n = at(x + 1, y + 1, z + 1);
    const xy = a - b - d + e, yz = a - d - g + m, zx = a - b - g + h, xyz = -a + b + d - e + g - h - m + n;
    const value = a + (b - a) * u[0] + (d - a) * u[1] + (g - a) * u[2] + xy * u[0] * u[1] + yz * u[1] * u[2] + zx * u[2] * u[0] + xyz * u[0] * u[1] * u[2];
    const slope = [
      du[0] * (b - a + xy * u[1] + zx * u[2] + xyz * u[1] * u[2]),
      du[1] * (d - a + yz * u[2] + xy * u[0] + xyz * u[2] * u[0]),
      du[2] * (g - a + zx * u[0] + yz * u[1] + xyz * u[0] * u[1]),
    ];
    const index = ((k * size + j) * size + i) * 4;
    slope.forEach((value, axis) => (texels[index + axis] = byte(0.5 + value / (2 * GROUND_DETAIL_SLOPE_RANGE))));
    texels[index + 3] = byte(value);
  }
  return { size, texels };
}

const NO_WARP = { uWarpAxis: [0, 0, 1, 0], uGlareLux: 0, uShutter: 0 };

const starPointBrightness = (magnitude) => (magnitude < 6.8 ? Math.min(2.5, 0.2 * 10 ** (0.16 * (6.5 - magnitude))) : 0);

const bendsLight = ({ hole, kind }) => hole || kind === 'wormhole';
const ABSOLUTE_MAGNITUDE_PC = 10;
const nearest = (entries) => entries.reduce((best, entry) => (!best || Math.hypot(...entry.offsetKm) < Math.hypot(...best.offsetKm) ? entry : best), null);
const shownAsPoint = (body) => body.kind !== 'star' || body.pulsar;
const pointMagnitude = (body, offsetKm) => (body.pulsar ? body.magnitude + 5 * Math.log10(Math.hypot(...offsetKm) / KM_PER_PC / ABSOLUTE_MAGNITUDE_PC) : apparentMagnitude(body, offsetKm));

function pointsOf(planets) {
  const values = planets.flatMap(({ body, offsetKm }) => {
    const apparent = apparentMagnitude(body, offsetKm);
    const offset = offsetKm.map((value) => value / KM_PER_PC);
    return apparent > FAINTEST_FAR_PLANET ? [] : [...offset, apparent - 5 * Math.log10(Math.hypot(...offset) / 10), FAR_PLANET_COLOUR, 0];
  });
  return { values: Float32Array.from(values), count: values.length / STAR_FLOATS };
}

const brightnessRank = ({ body, offsetKm }) => (body.kind === 'star' || body.kind === 'mirror' ? -Infinity : apparentMagnitude(body, offsetKm));

function brightestInDistanceOrder(seen) {
  if (seen.length <= MAX_BODIES) return seen;
  const kept = new Set([...seen].sort((a, b) => brightnessRank(a) - brightnessRank(b)).slice(0, MAX_BODIES));
  return seen.filter((entry) => kept.has(entry));
}

const VALUES_PER_BODY = { uBodyNorth: 3, uBodyMeridian: 3, uBodyFlattening: 1, uBodyWet: 1 };
const NO_STAR_SHIFT = [0, 0, 0];
const NO_HOLE = [0, 0, 0, 0];
const ONE_STAR_IMAGE = [0];
const FAINTEST_FAR_PLANET = 6.8;
const FAR_PLANET_COLOUR = 0.65;
const SEEN_RADII = 1.5;
const RINGS_SEEN_RADII = 2.5;
const GLOW_SEEN_PIXELS = 200;
const SMALLEST_GLOW_ANGLE = 0.01;

function bodyReaches(shown, pixelAngle, coronaShown) {
  const reaches = new Float32Array(MAX_BODIES).fill(1);
  shown.forEach(({ body, offsetKm }, i) => {
    const share = (body.radiusKm * (body.rings ? RINGS_SEEN_RADII : SEEN_RADII)) / Math.hypot(...offsetKm);
    const everywhere = share >= 1 || (body.kind === 'star' && coronaShown > 0);
    reaches[i] = everywhere ? -1 : Math.cos(Math.min(Math.PI, Math.asin(share) + Math.max(SMALLEST_GLOW_ANGLE, GLOW_SEEN_PIXELS * pixelAngle)));
  });
  return reaches;
}

const edgeOn = (body, direction) => body.kind === 'mirror' && Math.abs(body.north[0] * direction[0] + body.north[1] * direction[1] + body.north[2] * direction[2]) < MIRROR_OCCLUDES_FROM_COSINE;

function bodyArrays(shown, mapRelief, giants) {
  const arrays = {
    uBodyPlace: new Float32Array(MAX_BODIES * 4),
    uBodyOccluder: new Float32Array(MAX_BODIES * 4),
    uBodySun: new Float32Array(MAX_BODIES * 4),
    uBodyEclipser: new Float32Array(MAX_BODIES * ECLIPSERS_PER_BODY * 4),
    uBodyNorth: new Float32Array(MAX_BODIES * 3),
    uBodyFlattening: new Float32Array(MAX_BODIES),
    uBodyNarrowing: new Float32Array(MAX_BODIES * 4),
    uBodyMeridian: new Float32Array(MAX_BODIES * 3),
    uBodyLook: new Float32Array(MAX_BODIES * 4),
    uBodyMap: new Float32Array(MAX_BODIES * 4),
    uBodyGlow: new Float32Array(MAX_BODIES * 4),
    uBodyLamp: new Float32Array(MAX_BODIES * 4),
    uBodyClouds: new Float32Array(MAX_BODIES * 4),
    uBodyWet: new Float32Array(MAX_BODIES),
  };
  const ringed = shown.findIndex(({ body }) => body.rings);
  const rings = { uRingedBody: { int: ringed }, uRingedBodyKm: ringed >= 0 ? shown[ringed].body.radiusKm : 0 };
  shown.forEach(({ body, offsetKm }, i) => {
    const distance = Math.hypot(...offsetKm);
    const angularRadius = Math.asin(Math.min(1, body.radiusKm / distance));
    const direction = offsetKm.map((value) => value / distance);
    const star = body.kind === 'star';
    const relief = mapRelief[body.mapLayer] ?? 0;
    const giantFaces = body.kind === 'giant' ? giants.facesOf(body.name) : null;
    const mapped = body.mapLayer >= 0 && mapRelief[body.mapLayer] !== undefined;
    arrays.uBodyPlace.set([...direction, angularRadius], i * 4);
    arrays.uBodyOccluder.set([...direction, star || body.shades || edgeOn(body, direction) ? 0 : angularRadius], i * 4);
    arrays.uBodySun.set([...body.sunward, body.sunAngularRadius], i * 4);
    body.eclipsers.forEach(({ offsetKm: eclipserKm, radiusKm, reddens }, k) =>
      arrays.uBodyEclipser.set([...eclipserKm.map((value) => value / body.radiusKm), ((reddens ? REDDENING_ECLIPSER_SIGN : 1) * radiusKm) / body.radiusKm], (i * ECLIPSERS_PER_BODY + k) * 4));
    arrays.uBodyNorth.set(body.north, i * 3);
    arrays.uBodyFlattening[i] = body.flattening ?? 0;
    arrays.uBodyWet[i] = body.invented?.wet ? 1 : 0;
    arrays.uBodyNarrowing.set([...narrowAxis(body).map((value) => value * Math.sqrt(1 / (1 - (body.narrowing ?? 0)) - 1)), longestRadiusKm(body) / body.radiusKm], i * 4);
    arrays.uBodyMeridian.set(body.cloudMeridian || body.meridian, i * 3);
    arrays.uBodyLook.set([...body.tint.map((value) => (star ? value * SUN_DISK_GLOW : value)), body.invented ? INVENTED_ROCKY_CODE : BODY_KIND_CODES[body.kind]], i * 4);
    arrays.uBodyGlow.set([...(body.shines ? MIRROR_GLOW : body.glow ?? NO_GLOW), 1 - (body.lightShare ?? 1)], i * 4);
    arrays.uBodyLamp.set([...(body.lamp ?? UNLIT_LAMP), body.tideLocked ? 1 : 0], i * 4);
    arrays.uBodyClouds.set([body.invented?.cloudMap ?? EARTH_CLOUDS, body.cloudTurn ?? 0, body.invented?.terrain?.cloudiness ?? 1, body.tideLocked ? 1 : 0], i * 4);
    arrays.uBodyMap.set([
      mapped ? body.mapLayer : -1,
      giantFaces ? giantFaces.now : body.invented?.seed ?? relief,
      giantFaces ? giantFaces.next : body.invented?.kelvin ?? body.measured?.kelvin ?? body.roughness ?? 0,
      shownAsPoint(body) ? starPointBrightness(pointMagnitude(body, offsetKm)) : 0,
    ], i * 4);
  });
  return { arrays, count: shown.length, rings };
}

function planetUniforms(planet, camera) {
  if (!planet) return NO_PLANET;
  const offset = planet.centre.map((value, axis) => value - camera[axis]);
  const distance = Math.hypot(...offset);
  return {
    uPlanet: [...offset.map((value) => value / distance), Math.asin(Math.min(1, planet.radius / distance))],
    uPlanetSun: planet.sunward,
    uPlanetNorth: planet.north,
    uPlanetSpin: planet.spin,
  };
}

const PROGRAM_SOURCES = {
  eyeProgram: [FULLSCREEN_VERTEX, EYE_FRAGMENT],
  surfacesProgram: [FULLSCREEN_VERTEX, SURFACES_FRAGMENT],
  inventedSurfacesProgram: [FULLSCREEN_VERTEX, INVENTED_SURFACES_FRAGMENT],
  bodiesProgram: [FULLSCREEN_VERTEX, BODIES_FRAGMENT],
  skyProgram: [FULLSCREEN_VERTEX, SKY_FRAGMENT],
  skyFromCubeProgram: [FULLSCREEN_VERTEX, SKY_FROM_CUBE_FRAGMENT],
  groundSkyProgram: [FULLSCREEN_VERTEX, GROUND_SKY_FRAGMENT],
  cloudProgram: [FULLSCREEN_VERTEX, CLOUD_FRAGMENT],
  cloudNearbyProgram: [FULLSCREEN_VERTEX, CLOUD_NEARBY_FRAGMENT],
  cloudBillowsProgram: [FULLSCREEN_VERTEX, CLOUD_BILLOWS_FRAGMENT],
  patchProgram: [PATCH_VERTEX, PATCH_FRAGMENT],
  riverProgram: [RIVER_VERTEX, RIVER_FRAGMENT],
  shadowProgram: [SHADOW_VERTEX, SHADOW_FRAGMENT],
  eyeStarProgram: [EYE_STAR_VERTEX, EYE_STAR_FRAGMENT],
  cameraStarProgram: [CAMERA_STAR_VERTEX, CAMERA_STAR_FRAGMENT],
  developProgram: [FULLSCREEN_VERTEX, DEVELOP_FRAGMENT],
  sampleProgram: [FULLSCREEN_VERTEX, SAMPLE_FRAGMENT],
};

export async function createRenderer(canvas, armMap, galaxies, showProgress) {
  const gl = createContext(canvas);
  if (!gl) return null;

  const emptyVao = gl.createVertexArray();
  const bakeMapEdges = createMapEdges(gl, emptyVao, BODY_MAP_SIZE);
  const giants = createGiantPainter(gl, emptyVao);
  const blackHoleView = createBlackHoleView(gl, emptyVao, { latticeUnit: LATTICE_UNIT });
  const inventedGround = createInventedGround(gl, { emptyVao, latticeUnit: LATTICE_UNIT, colourUnit: INVENTED_COLOUR_UNIT, landUnit: INVENTED_LAND_UNIT, heightUnit: BODY_HEIGHT_UNIT, heightLayerOf: (name) => MAPPED_BODIES.findIndex((mapped) => mapped.name === name), heightRangeOf: (layer) => mapRanges[layer] });
  const {
    skyProgram, skyFromCubeProgram, eyeProgram, surfacesProgram, inventedSurfacesProgram, bodiesProgram, groundSkyProgram, cloudProgram, cloudNearbyProgram, cloudBillowsProgram, patchProgram, riverProgram, shadowProgram,
    eyeStarProgram, cameraStarProgram, developProgram, sampleProgram,
  } = await createPrograms(gl, PROGRAM_SOURCES, showProgress, {
    cloudProgram: (program) => compileVariantForTarget(gl, program, CLOUD_PASS_OUTPUTS, emptyVao),
  });
  let shadowMaps = null;
  const groundDetailTexture = (() => {
    const { size, texels } = groundDetailTexels();
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + GROUND_DETAIL_UNIT);
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, texels);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  })();
  const patchIndexBuffer = gl.createBuffer();
  const patchIndexCount = (() => {
    const indices = patchIndices();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, patchIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    return indices.length;
  })();
  let groundTarget = null;
  let bodiesSeenTargets = null;
  let inventedSurfacesTarget = null;
  let cloudBillows = null;
  let cloudTargets = [];
  let cloudFrame = 0;
  let previousCloudView = null;
  let riverSeconds = 0;
  const sampleTarget = createByteTarget(gl, SAMPLE_WIDTH, SAMPLE_HEIGHT);

  const armTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, armTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, MAP_SIZE, MAP_SIZE, 0, gl.RG, gl.FLOAT, armMap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const createNoiseTexture = (unit, size, noise) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, texture);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, size, size, size, 0, gl.RED, gl.UNSIGNED_BYTE, noise);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  };
  const random = createRandom(NOISE_SEED);
  const noiseTexture = createNoiseTexture(0, NOISE_SIZE, new Uint8Array(NOISE_SIZE ** 3).map(() => Math.floor(random.next() * 256)));
  createNoiseTexture(LATTICE_UNIT, LATTICE_PERIOD, new Uint8Array(LATTICE_PERIOD ** 3).map(latticeByte));

  const createBodyMaps = (unit, format, layersPerMap = 1) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, format, ...BODY_MAP_SIZE, layersPerMap * Math.max(1, MAPPED_BODIES.length));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  };
  const bodyColourMaps = createBodyMaps(BODY_COLOUR_UNIT, gl.RGBA8, LAYERS_PER_MAP);
  const bodyHeightMaps = createBodyMaps(BODY_HEIGHT_UNIT, gl.R8);
  const mapRelief = [];
  const mapRanges = [];

  function loadBodyMap(layer, { colour, heights, relief, ground }) {
    gl.activeTexture(gl.TEXTURE0 + BODY_HEIGHT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, bodyHeightMaps);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, ...BODY_MAP_SIZE, 1, gl.RED, gl.UNSIGNED_BYTE, heights.values);
    gl.activeTexture(gl.TEXTURE0);
    bakeMapEdges(bodyColourMaps, layer, MAPPED_BODIES.length, colour);
    mapRelief[layer] = relief;
    mapRanges[layer] = ground;
  }

  const cloudMap = gl.createTexture();
  let cloudMapOn = false;
  let cloudNearby = null;
  const cloudNearbyTarget = createTarget(gl, CLOUD_NEARBY_WIDTH, CLOUD_NEARBY_WIDTH);
  gl.activeTexture(gl.TEXTURE0 + CLOUD_NEARBY_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, cloudNearbyTarget.textures[0]);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.activeTexture(gl.TEXTURE0);
  gl.activeTexture(gl.TEXTURE0 + CLOUD_MAP_UNIT);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, cloudMap);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(CLOUD_MAP_SIZE[0])) + 1, gl.R8, ...CLOUD_MAP_SIZE, CLOUD_MAP_LAYERS);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);

  function loadCloudMap(images) {
    gl.activeTexture(gl.TEXTURE0 + CLOUD_MAP_UNIT);
    images.forEach((image, layer) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, ...CLOUD_MAP_SIZE, 1, gl.RED, gl.UNSIGNED_BYTE, image));
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.activeTexture(gl.TEXTURE0);
    cloudMapOn = true;
    cloudNearby = null;
  }

  let simulatedClouds = null;

  function prepareSimulatedClouds() {
    simulatedClouds = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, simulatedClouds);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(SIMULATED_CLOUD_SIZE[0])) + 1, gl.RG8, ...SIMULATED_CLOUD_SIZE, SIMULATED_CLOUD_MAPS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function loadSimulatedClouds(layer, image) {
    gl.activeTexture(gl.TEXTURE0 + SIMULATED_CLOUDS_UNIT);
    if (!simulatedClouds) prepareSimulatedClouds();
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, ...SIMULATED_CLOUD_SIZE, 1, gl.RG, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.activeTexture(gl.TEXTURE0);
    cloudNearby = null;
  }

  let cityLightsOn = false;

  function loadCityLights(image) {
    gl.activeTexture(gl.TEXTURE0 + CITY_LIGHTS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(image.width)) + 1, gl.R8, image.width, image.height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RED, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    image.close();
    cityLightsOn = true;
  }

  function litAtNight(body) {
    if (body.civilization) return speculationShown() && inventedGround.isPainted(body);
    return body.settlement ? settlementShown(body) : cityLightsOn && body.cityLights > 0;
  }

  function largestLit(shown) {
    const sizes = shown.map(({ body, offsetKm }) => (litAtNight(body) ? body.radiusKm / Math.hypot(...offsetKm) : 0));
    const largest = Math.max(0, ...sizes);
    return largest > 0 ? sizes.indexOf(largest) : -1;
  }

  function useCityLights(program, shown) {
    const lit = largestLit(shown);
    if (lit < 0) return setUniforms(gl, program, { uLitBody: { int: lit } });
    const { radiusKm, cityLights, civilization, settlement } = shown[lit].body;
    if (settlement) {
      settlements.paint(shown[lit].body);
      gl.uniform1i(program.uniforms.uInventedLand, SETTLEMENTS_UNIT);
    }
    const { dim, bright } = (civilization ?? settlement)?.lamps ?? EARTH_LAMPS;
    setUniforms(gl, program, { uLitBody: { int: lit }, uLitBodyKm: radiusKm, uCityLightsOn: cityLights ?? 1, uCitiesInvented: civilization || settlement ? 1 : 0, uCityChannel: settlement ? [1, 0] : [0, 1], uLampDim: dim, uLampBright: bright });
  }

  let motionBlur = null;
  let systemLight = SUNLIGHT;
  const craftView = createCraftView(gl, emptyVao);
  const settlements = createSettlementPainter(gl, SETTLEMENTS_UNIT);

  function setBodies(program, seen, ground, pixelAngle = 0, standingOn = ground?.body) {
    if (program.uniforms.uCloudNearby) gl.uniform1i(program.uniforms.uCloudNearby, CLOUD_NEARBY_UNIT);
    if (cloudNearby) setUniforms(gl, program, { uCloudNearbyUp: cloudNearby.up, uCloudNearbyEast: cloudNearby.east });
    if (program.uniforms.uLattice) gl.uniform1i(program.uniforms.uLattice, LATTICE_UNIT);
    if (program.uniforms.uCloudMap) gl.uniform1i(program.uniforms.uCloudMap, CLOUD_MAP_UNIT);
    if (program.uniforms.uSimulatedClouds) gl.uniform1i(program.uniforms.uSimulatedClouds, SIMULATED_CLOUDS_UNIT);
    setUniforms(gl, program, { uSimulatedCloudsOn: simulatedClouds ? 1 : 0, uCloudMapOn: cloudMapOn ? 1 : 0, uGroundCloudsMapped: ground?.settings.clouds?.mapped ? 1 : 0 });
    const shown = brightestInDistanceOrder(seen ?? []);
    inventedGround.bind(program, shown);
    if (program.uniforms.uCityLights) {
      gl.uniform1i(program.uniforms.uCityLights, CITY_LIGHTS_UNIT);
      useCityLights(program, shown);
    }
    const { arrays, count, rings } = bodyArrays(shown, mapRelief, giants);
    const groundValues = groundUniforms(ground, shown);
    setUniforms(gl, program, groundValues);
    if (groundValues.uGround.int >= 0 && program.uniforms.uGroundAnchor) gl.uniform3iv(program.uniforms.uGroundAnchor, ground.frame.anchor);
    const haze = hazeUniforms(shown);
    setUniforms(gl, program, { uHazeBody: haze.bodies });
    for (const [name, values] of Object.entries({ ...arrays, ...haze.arrays })) setArray(gl, program, name, values, VALUES_PER_BODY[name] ?? 4);
    const sunUneclipsed = sunShareVisible(seen ?? [], standingOn?.name);
    const sunVisible = standingOn?.lightShare ?? sunUneclipsed;
    const sunSeen = sunUneclipsed * (standingOn?.sunThroughShade ?? 1);
    const coronaShown = Math.max(0, 1 - sunUneclipsed / CORONA_FADE_SHARE) ** 2;
    setUniforms(gl, program, { uStarlight: systemLight, uBodyCount: { int: count }, ...rings, uSunVisible: sunVisible, uSunSeen: sunSeen, uCoronaShown: coronaShown });
    if (program.uniforms.uBodyReach) gl.uniform1fv(program.uniforms.uBodyReach, bodyReaches(shown, pixelAngle, coronaShown));
    if (program.uniforms.uBodyColour) {
      gl.activeTexture(gl.TEXTURE0 + BODY_COLOUR_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, bodyColourMaps);
      gl.activeTexture(gl.TEXTURE0 + BODY_HEIGHT_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, bodyHeightMaps);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(program.uniforms.uBodyColour, BODY_COLOUR_UNIT);
      gl.uniform1i(program.uniforms.uBodyHeight, BODY_HEIGHT_UNIT);
      giants.bind(program);
    }
  }

  const model = modelUniforms();
  [skyProgram, eyeStarProgram, cameraStarProgram].forEach((program) => {
    gl.useProgram(program.program);
    setUniforms(gl, program, model);
  });

  function makeStarBuffer() {
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STAR_FLOATS * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STAR_FLOATS * 4, 12);
    gl.bindVertexArray(null);
    return { buffer, vao, count: 0 };
  }
  const eyeStars = makeStarBuffer();
  const cameraStars = makeStarBuffer();
  const farStars = makeStarBuffer();
  const farPlanets = makeStarBuffer();
  let farStarsShown = null;

  function uploadStars(target, stars) {
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, stars.values, gl.STATIC_DRAW);
    target.count = stars.count;
  }

  const tables = new Float32Array(TABLE_WIDTH * Object.keys(TABLE_ROWS).length * 4);
  const tableTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tableTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  let cameraSignal = null;
  let cameraPicture = null;

  const createSkyCube = (unit, size) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.texStorage2D(gl.TEXTURE_CUBE_MAP, 1, gl.RGBA16F, size, size);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  };
  const skyCube = createSkyCube(SKY_CUBE_UNIT, SKY_CUBE_SIZE);
  let [keptSky, farSky] = KEPT_SKY_UNITS.map((unit) => ({ unit, cube: createSkyCube(unit, KEPT_SKY_SIZE), place: null, ready: false }));
  const skyCubeFramebuffer = gl.createFramebuffer();

  const warpTable = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + WARP_TABLE_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, warpTable);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);
  let warpShape = { uWarpAngleMin: 1, uWarpAngleCount: { int: 2 }, uWarpSpeedCount: { int: 1 } };

  function loadWarpTable(optics) {
    gl.activeTexture(gl.TEXTURE0 + WARP_TABLE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, warpTable);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, optics.angleCount, optics.speedCount, 0, gl.RG, gl.FLOAT, optics.table);
    gl.activeTexture(gl.TEXTURE0);
    warpShape = { uWarpAngleMin: optics.smallestAngle, uWarpAngleCount: { int: optics.angleCount }, uWarpSpeedCount: { int: optics.speedCount } };
  }

  function bindWarp(program, warp, adaptation) {
    gl.activeTexture(gl.TEXTURE0 + SKY_CUBE_UNIT);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube);
    gl.activeTexture(gl.TEXTURE0 + WARP_TABLE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, warpTable);
    gl.activeTexture(gl.TEXTURE0);
    if (program.uniforms.uSkyCube) gl.uniform1i(program.uniforms.uSkyCube, SKY_CUBE_UNIT);
    if (program.uniforms.uWarpTable) gl.uniform1i(program.uniforms.uWarpTable, WARP_TABLE_UNIT);
    const values = warp ? { uWarpAxis: [...warp.axis, 1], uWarpRow: warp.row, uGlareLux: warp.glareLux, uShutter: warp.shutter } : NO_WARP;
    setUniforms(gl, program, { ...warpShape, ...values, uBandToPhysical: BAND_TO_PHYSICAL, uAdaptation: adaptation });
  }

  function drawSkyCubeFace(cube, size, face, { camera, nebulae, stars }) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyCubeFramebuffer);
    gl.viewport(0, 0, size, size);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, cube, 0);
    drawSky({ camera, basis: CUBE_FACES[face], tanHalf: [1, 1], pixelAngle: Math.PI / 2 / size }, nebulae, stars.reaches, 1, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function captureSkyCube(place) {
    CUBE_FACES.forEach((_, face) => drawSkyCubeFace(skyCube, SKY_CUBE_SIZE, face, place));
  }

  const skyStillMatches = ({ place: kept }, { camera, stars }) =>
    kept
    && Math.hypot(...camera.map((value, axis) => value - kept.camera[axis])) < KEPT_SKY_DRIFT_PC
    && stars.reaches.every((reach, bin) => Math.abs(reach - kept.reaches[bin]) <= KEPT_SKY_REACH_CHANGE * Math.max(reach, kept.reaches[bin]));

  function scissored(x, y, width, height, draw) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, width, height);
    draw();
    gl.disable(gl.SCISSOR_TEST);
  }

  function growSky(sky, place) {
    if (!skyStillMatches(sky, place)) {
      Object.assign(sky, { place: { camera: [...place.camera], reaches: [...place.stars.reaches] }, tiles: 0, ready: false });
      return;
    }
    if (sky.ready) return;
    const tile = sky.tiles++;
    const withinFace = tile % KEPT_SKY_TILES_ACROSS ** 2;
    const column = withinFace % KEPT_SKY_TILES_ACROSS;
    const row = Math.floor(withinFace / KEPT_SKY_TILES_ACROSS);
    scissored(column * KEPT_SKY_TILE, row * KEPT_SKY_TILE, KEPT_SKY_TILE, KEPT_SKY_TILE, () =>
      drawSkyCubeFace(sky.cube, KEPT_SKY_SIZE, Math.floor(tile / KEPT_SKY_TILES_ACROSS ** 2), place));
    sky.ready = sky.tiles >= KEPT_SKY_TILE_COUNT;
  }

  function growKeptSky(place) {
    if (!skyStillMatches(keptSky, place) && skyStillMatches(farSky, place)) [keptSky, farSky] = [farSky, keptSky];
    growSky(keptSky, place);
  }

  const keptSkyFineEnough = (skyPixelAngle) => keptSky.ready && Math.PI / 2 / KEPT_SKY_SIZE < KEPT_SKY_COARSEST * skyPixelAngle;

  function drawKeptSky(view) {
    gl.useProgram(skyFromCubeProgram.program);
    setUniforms(gl, skyFromCubeProgram, viewUniforms(view));
    gl.uniform1i(skyFromCubeProgram.uniforms.uSkyCube, keptSky.unit);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function bindGalaxyTextures(program) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, armTexture);
    gl.uniform1i(program.uniforms.uArmMap, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
    gl.uniform1i(program.uniforms.uNoise, 1);
    gl.activeTexture(gl.TEXTURE0);
  }

  function drawSky(view, nebulae, reaches, outputScale, seed) {
    gl.useProgram(skyProgram.program);
    bindGalaxyTextures(skyProgram);
    setUniforms(gl, skyProgram, { ...viewUniforms(view), uOutputScale: outputScale, uFrameSeed: { uint: seed } });
    writeUnresolved(tableRow(tables, TABLE_ROWS.oldUnresolved), SMOOTH_OLD_BINS, reaches.slice(YOUNG_BINS.length));
    writeUnresolved(tableRow(tables, TABLE_ROWS.armedUnresolved), ARMED_BINS, reaches.slice(YOUNG_BINS.length));
    writeUnresolved(tableRow(tables, TABLE_ROWS.youngUnresolved), YOUNG_BINS, reaches.slice(0, YOUNG_BINS.length));
    writeUnresolved(tableRow(tables, TABLE_ROWS.bulgeUnresolved), BULGE_BINS, reaches.slice(YOUNG_BINS.length));
    const nebulaCount = writeNebulae(tableRow(tables, TABLE_ROWS.nebulaPlace), tableRow(tables, TABLE_ROWS.nebulaGlow), nebulae, view.camera);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, tableTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TABLE_WIDTH, Object.keys(TABLE_ROWS).length, 0, gl.RGBA, gl.FLOAT, tables);
    gl.uniform1i(skyProgram.uniforms.uTables, 2);
    gl.activeTexture(gl.TEXTURE0);
    setUniforms(gl, skyProgram, { uUnresolvedLogNear: UNRESOLVED_LOG_NEAR, uUnresolvedLogStep: UNRESOLVED_LOG_STEP });
    gl.uniform1i(skyProgram.uniforms.uNebulaCount, nebulaCount);
    const galaxyValues = galaxyUniforms(galaxies, view.camera);
    setArray(gl, skyProgram, 'uGalaxyCentre', galaxyValues.centre, 3);
    setArray(gl, skyProgram, 'uGalaxyNormal', galaxyValues.normal, 3);
    setArray(gl, skyProgram, 'uGalaxyShape', galaxyValues.shape, 4);
    setArray(gl, skyProgram, 'uGalaxyTint', galaxyValues.tint, 3);
    gl.uniform1i(skyProgram.uniforms.uGalaxyCount, galaxyValues.count);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawStars(program, target, view, extra, hiddenBehindForeground = false) {
    gl.useProgram(program.program);
    bindGalaxyTextures(program);
    setUniforms(gl, program, { ...viewUniforms(view), ...extra });
    gl.enable(gl.BLEND);
    if (hiddenBehindForeground) gl.blendFuncSeparate(gl.ONE_MINUS_DST_ALPHA, gl.ONE, gl.ZERO, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(target.vao);
    gl.drawArrays(gl.POINTS, 0, target.count);
    gl.disable(gl.BLEND);
  }

  const skyTargets = new Map();
  let shownSky = null;

  function skyTargetFor(resolution) {
    const width = Math.max(1, Math.round(canvas.width * resolution));
    const height = Math.max(1, Math.round(canvas.height * resolution));
    let target = skyTargets.get(resolution);
    if (!target || target.width !== width || target.height !== height) {
      target?.destroy();
      target = createTarget(gl, width, height);
      skyTargets.set(resolution, target);
    }
    return target;
  }

  let sharpening = null;

  function startSky(view, place, resolution, sharpenGradually, seed) {
    const previous = shownSky;
    shownSky = skyTargetFor(resolution);
    const pixelAngle = view.pixelAngle / resolution;
    sharpening = null;
    if (sharpenGradually && previous) {
      if (previous !== shownSky) copySky(previous, shownSky);
      sharpening = { resolution, seed, rows: 0 };
      return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, shownSky.framebuffer);
    gl.viewport(0, 0, shownSky.width, shownSky.height);
    if (keptSkyFineEnough(pixelAngle)) drawKeptSky(view);
    else drawSky({ ...view, pixelAngle }, place.nebulae, place.stars.reaches, 1, seed);
  }

  function copySky(from, to) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer);
    gl.blitFramebuffer(0, 0, from.width, from.height, 0, 0, to.width, to.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  }

  function sharpenSky(view, place) {
    if (!sharpening) return;
    const { resolution, seed, rows } = sharpening;
    const rowsNow = Math.max(1, Math.ceil(SKY_PIXELS_PER_FRAME / shownSky.width));
    gl.bindFramebuffer(gl.FRAMEBUFFER, shownSky.framebuffer);
    gl.viewport(0, 0, shownSky.width, shownSky.height);
    scissored(0, rows, shownSky.width, rowsNow, () => drawSky({ ...view, pixelAngle: view.pixelAngle / resolution }, place.nebulae, place.stars.reaches, 1, seed));
    sharpening.rows += rowsNow;
    if (sharpening.rows >= shownSky.height) sharpening = null;
  }

  function bodiesSeenTargetsFitting() {
    const { width, height } = canvas;
    if (bodiesSeenTargets?.surfaces.width === width && bodiesSeenTargets.surfaces.height === height) return bodiesSeenTargets;
    bodiesSeenTargets?.surfaces.destroy();
    bodiesSeenTargets?.bodies.destroy();
    bodiesSeenTargets = { surfaces: createFullFloatTarget(gl, width, height), bodies: createFullFloatTarget(gl, width, height) };
    return bodiesSeenTargets;
  }

  function inventedSurfacesTargetFitting() {
    const { width, height } = canvas;
    if (inventedSurfacesTarget?.width === width && inventedSurfacesTarget.height === height) return inventedSurfacesTarget;
    inventedSurfacesTarget?.destroy();
    inventedSurfacesTarget = createFullFloatTarget(gl, width, height);
    return inventedSurfacesTarget;
  }

  function groundTargetFitting() {
    const { width, height } = canvas;
    if (groundTarget?.width === width && groundTarget.height === height) return groundTarget;
    groundTarget?.destroy();
    const target = createTarget(gl, width, height);
    const depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    groundTarget = { ...target, depth, destroy: () => {
      target.destroy();
      gl.deleteTexture(depth);
    } };
    return groundTarget;
  }

  function uploadPatch(patch) {
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, patch.vertices, gl.STATIC_DRAW);
    const stride = PATCH_FLOATS * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 28);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 40);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, patchIndexBuffer);
    gl.bindVertexArray(null);
    patch.gpu = { buffer, vao };
    patch.vertices = null;
  }

  const detailMeshes = new Map();

  function detailMesh(key, build) {
    if (detailMeshes.has(key)) return detailMeshes.get(key);
    const { vertices, indices } = build();
    const mesh = { key, vertexBuffer: gl.createBuffer(), indexBuffer: gl.createBuffer(), indexCount: indices.length };
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    detailMeshes.set(key, mesh);
    return mesh;
  }

  function meshOf(tile, sharpness, reachShare) {
    if (SCATTER_LAYERS[tile.layer].kind === 'grass') return detailMesh('grass', grassMesh);
    const subdivisions = ROCK_SUBDIVISIONS_WITHIN.find(([share]) => reachShare < share)[1];
    const shape = Math.floor(tile.instances[SCATTER_FLOATS - 1] * ROCK_SHAPES);
    return detailMesh(`rock ${shape} ${subdivisions} ${sharpness}`, () => rockMesh(shape, subdivisions, sharpness));
  }

  function detailVao(tile, mesh) {
    tile.gpu ??= { buffer: null, vaos: new Map() };
    if (!tile.gpu.buffer) {
      tile.gpu.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, tile.gpu.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, tile.instances, gl.STATIC_DRAW);
    }
    if (tile.gpu.vaos.has(mesh.key)) return tile.gpu.vaos.get(mesh.key);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
    [0, 1].forEach((location) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 3, gl.FLOAT, false, MESH_FLOATS * 4, location * 12);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, tile.gpu.buffer);
    [[PLACED_LOCATION, 4, 0], [SEED_LOCATION, 1, 16]].forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, SCATTER_FLOATS * 4, offset);
      gl.vertexAttribDivisor(location, 1);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indexBuffer);
    tile.gpu.vaos.set(mesh.key, vao);
    return vao;
  }

  function releaseDetails(tile) {
    if (!tile.gpu) return;
    gl.deleteBuffer(tile.gpu.buffer);
    tile.gpu.vaos.forEach((vao) => gl.deleteVertexArray(vao));
    tile.gpu = null;
  }

  function drawDetails(program, tiles, ground, pixelAngle, coarsened = 0) {
    const { rocks } = ground.settings;
    for (const tile of tiles) {
      const { kind, reachMetres, sizes } = SCATTER_LAYERS[tile.layer];
      const grass = kind === 'grass';
      const reachShare = (tile.nearestKm * 1000) / reachMetres;
      const mesh = meshOf(tile, rocks?.sharpness, reachShare + coarsened);
      const shown = grass ? Math.ceil(tile.count * Math.max(FEWEST_TUFTS_SHARE, 1 - reachShare / TUFTS_THINNED_AT_REACH_SHARE)) : rocksSeen(tile, tile.nearestKm * 1000, pixelAngle);
      if (!shown) continue;
      const vao = detailVao(tile, mesh);
      setUniforms(gl, program, {
        uPatchFromCamera: tile.centreKm.map((value, axis) => (value - ground.cameraLocalKm[axis]) * 1000),
        uPatchCentreKm: tile.centreKm,
        uPatchSpacing: sizes[0],
        uMorph: NO_MORPH,
        uPixelAngle: pixelAngle,
        uDetailShape: [grass ? 2 : 1, reachMetres, grass ? 1 : rocks.flatness, 0],
        uDetailUp: tile.up,
        uDetailTint: grass ? GRASS_TINT : [...rocks.tint, rocks.greyness ?? 0],
      });
      gl.bindVertexArray(vao);
      gl.drawElementsInstanced(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0, shown);
    }
    setUniforms(gl, program, { uDetailShape: NO_DETAIL });
  }

  function uploadRibbon(ribbon) {
    const [vertexBuffer, indexBuffer, vao] = [gl.createBuffer(), gl.createBuffer(), gl.createVertexArray()];
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ribbon.vertices, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 3, 12], [2, 1, 24], [3, 3, 28]].forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, RIBBON_FLOATS * 4, offset);
    });
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, ribbon.indices, gl.STATIC_DRAW);
    ribbon.gpu = { vertexBuffer, indexBuffer, vao, indexCount: ribbon.indices.length };
    ribbon.vertices = null;
    ribbon.indices = null;
  }

  function releaseRibbon(ribbon) {
    if (!ribbon.gpu) return;
    gl.deleteBuffer(ribbon.gpu.vertexBuffer);
    gl.deleteBuffer(ribbon.gpu.indexBuffer);
    gl.deleteVertexArray(ribbon.gpu.vao);
    ribbon.gpu = null;
  }

  function useOnGround(program, view, bodies, ground, shadows) {
    gl.useProgram(program.program);
    setUniforms(gl, program, { ...viewUniforms(view), ...bodyLocalBasis(ground.body, view.basis), ...shadows });
    if (shadows.cascades) setArray(gl, program, 'uShadowCascades', shadows.cascades, 4);
    gl.uniform1i(program.uniforms.uShadowMaps, SHADOW_MAP_UNIT);
    gl.uniform1i(program.uniforms.uGroundDetail, GROUND_DETAIL_UNIT);
    gl.uniform1i(program.uniforms.uCloudBillows, CLOUD_BILLOWS_UNIT);
    setBodies(program, bodies, ground);
  }

  function drawRivers(ribbons, ground, pixelAngle) {
    setUniforms(gl, riverProgram, { uPixelAngle: pixelAngle, uRiverSeconds: riverSeconds, uMolten: ground.settings.rivers.molten ? 1 : 0 });
    for (const ribbon of ribbons) {
      if (!ribbon.gpu) uploadRibbon(ribbon);
      setUniforms(gl, riverProgram, { uPatchFromCamera: ribbon.centreKm.map((value, axis) => (value - ground.cameraLocalKm[axis]) * 1000), uPatchCentreKm: ribbon.centreKm });
      gl.bindVertexArray(ribbon.gpu.vao);
      gl.drawElements(gl.TRIANGLES, ribbon.gpu.indexCount, gl.UNSIGNED_INT, 0);
    }
  }

  function releasePatch(patch) {
    if (!patch.gpu) return;
    gl.deleteBuffer(patch.gpu.buffer);
    gl.deleteVertexArray(patch.gpu.vao);
    patch.gpu = null;
  }

  function drawPatches(program, patches, camera) {
    for (const patch of patches) {
      if (!patch.gpu) uploadPatch(patch);
      setUniforms(gl, program, {
        uPatchFromCamera: patch.centreKm.map((value, axis) => (value - camera[axis]) * 1000),
        uPatchCentreKm: patch.centreKm,
        uPatchSpacing: patch.spacingMetres,
        uMorph: patch.morph ?? NO_MORPH,
      });
      gl.bindVertexArray(patch.gpu.vao);
      gl.drawElements(gl.TRIANGLES, patchIndexCount, gl.UNSIGNED_SHORT, 0);
    }
  }

  function shadowMapsReady() {
    if (shadowMaps) return shadowMaps;
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + SHADOW_MAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT32F, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, SHADOW_CASCADES + 1);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    const framebuffers = Array.from({ length: SHADOW_CASCADES + 1 }, (_, layer) => {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, texture, 0, layer);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      return framebuffer;
    });
    shadowMaps = { texture, framebuffers };
    return shadowMaps;
  }

  function drawShadows(ground, pixelAngle) {
    const { light, casters, cameraLocalKm, details, standing } = ground;
    if (!light) return NO_SHADOWS;
    const { texture, framebuffers } = shadowMapsReady();
    const cameraMetres = cameraLocalKm.map((value) => value * 1000);
    const along = (axis) => cameraMetres[0] * axis[0] + cameraMetres[1] * axis[1] + cameraMetres[2] * axis[2];
    const rocksCast = details.casters.length > 0 || standing.length > 0;
    const halvesKm = rocksCast ? [...light.halvesKm, details.shadowHalfKm || STANDING_SHADOW_HALF_KM] : light.halvesKm;
    const centres = halvesKm.map((halfKm) => [light.right, light.up].map((axis) => Math.round(along(axis) / ((2 * halfKm * 1000) / SHADOW_MAP_SIZE))));
    const cascades = halvesKm.map((halfKm, layer) => {
      const half = halfKm * 1000;
      const texel = (2 * half) / SHADOW_MAP_SIZE;
      const shift = [light.right, light.up].map((axis, i) => centres[layer][i] * texel - along(axis));
      return [...shift, half, light.depthKm * 1000];
    });
    const lightUniforms = { uShadowRight: light.right, uShadowUp: light.up, uShadowSun: light.sun };
    const drawnFor = JSON.stringify([centres, halvesKm, light.sun, standing.map(({ localKm }) => localKm), ...[casters, details.casters, details.largeCasters].map((drawn) => drawn.map(({ key }) => key))]);
    if (drawnFor !== shadowMaps.drawnFor) {
      shadowMaps.drawnFor = drawnFor;
      renderShadowMaps(framebuffers, cascades, lightUniforms, ground, pixelAngle);
    }
    gl.activeTexture(gl.TEXTURE0 + SHADOW_MAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.activeTexture(gl.TEXTURE0);
    return { ...lightUniforms, uShadowsOn: 1, uRockShadow: rocksCast ? cascades[ROCK_SHADOW_LAYER] : NO_ROCK_SHADOW, cascades: new Float32Array(cascades.slice(0, SHADOW_CASCADES).flat()) };
  }

  function renderShadowMaps(framebuffers, cascades, lightUniforms, ground, pixelAngle) {
    const { casters, details, cameraLocalKm, standing } = ground;
    gl.useProgram(shadowProgram.program);
    setUniforms(gl, shadowProgram, lightUniforms);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearDepth(1);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(SHADOW_SLOPE_BIAS, SHADOW_CONSTANT_BIAS);
    cascades.forEach((cascade, layer) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[layer]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      setUniforms(gl, shadowProgram, { uShadowCascade: cascade });
      if (layer === ROCK_SHADOW_LAYER) {
        gl.polygonOffset(ROCK_SHADOW_SLOPE_BIAS, SHADOW_CONSTANT_BIAS);
        drawDetails(shadowProgram, details.casters, ground, pixelAngle, SHADOWS_COARSENED_BY);
        if (standing.length) craftView.drawShadows(standing, ground, lightUniforms, cascade);
        return;
      }
      drawPatches(shadowProgram, casters, cameraLocalKm);
      if (layer === 0) drawDetails(shadowProgram, details.largeCasters, ground, pixelAngle, SHADOWS_COARSENED_BY);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.DEPTH_TEST);
  }

  function bakedCloudBillows() {
    if (cloudBillows) return cloudBillows;
    const target = createTarget(gl, CLOUD_BILLOWS_WIDTH, CLOUD_BILLOWS_WIDTH / 2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(cloudBillowsProgram.program);
    gl.uniform1i(cloudBillowsProgram.uniforms.uLattice, LATTICE_UNIT);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.deleteProgram(cloudBillowsProgram.program);
    [cloudBillows] = target.textures;
    gl.bindTexture(gl.TEXTURE_2D, cloudBillows);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.deleteFramebuffer(target.framebuffer);
    return cloudBillows;
  }

  function bakeNearbyClouds(bodies, ground) {
    const { radiusKm, cloudTurn = 0 } = ground.body;
    const [x, y, z] = ground.frame.up;
    const up = [x * Math.cos(cloudTurn) + y * Math.sin(cloudTurn), y * Math.cos(cloudTurn) - x * Math.sin(cloudTurn), z];
    if (cloudNearby?.body === ground.body.name && Math.hypot(...up.map((value, axis) => value - cloudNearby.up[axis])) * radiusKm < CLOUD_NEARBY_DRIFT_KM) return;
    const acrossPole = Math.hypot(up[0], up[1]);
    cloudNearby = { body: ground.body.name, up: [...up], east: acrossPole > 0 ? [-up[1] / acrossPole, up[0] / acrossPole, 0] : [0, 1, 0] };
    gl.bindFramebuffer(gl.FRAMEBUFFER, cloudNearbyTarget.framebuffer);
    gl.viewport(0, 0, CLOUD_NEARBY_WIDTH, CLOUD_NEARBY_WIDTH);
    gl.useProgram(cloudNearbyProgram.program);
    setBodies(cloudNearbyProgram, bodies, ground);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0 + CLOUD_NEARBY_UNIT);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
  }

  function cloudTargetsFitting(width, height) {
    const wanted = [width, height].map((size) => Math.ceil(size * CLOUD_RESOLUTION_SHARE));
    if (cloudTargets[0]?.width === wanted[0] && cloudTargets[0].height === wanted[1]) return cloudTargets;
    cloudTargets.forEach((target) => target.destroy());
    cloudTargets = [0, 1].map(() => createTarget(gl, ...wanted, CLOUD_PASS_OUTPUTS));
    previousCloudView = null;
    return cloudTargets;
  }

  function cloudHistoryUniforms(ground) {
    const previous = previousCloudView?.body === ground.body.name ? previousCloudView : null;
    if (!previous) return { uCloudHistoryOn: 0 };
    return {
      uCloudHistoryOn: 1,
      uPreviousLocalRight: previous.local.uLocalRight,
      uPreviousLocalUp: previous.local.uLocalUp,
      uPreviousLocalForward: previous.local.uLocalForward,
      uPreviousGroundCamera: previous.camera,
      uPreviousTanHalf: previous.tanHalf,
    };
  }

  function drawClouds(view, bodies, ground, groundView) {
    const targets = cloudTargetsFitting(groundView.width, groundView.height);
    cloudFrame += 1;
    const target = targets[cloudFrame % 2];
    const history = targets[(cloudFrame + 1) % 2];
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(cloudProgram.program);
    setUniforms(gl, cloudProgram, { ...viewUniforms(view), ...cloudHistoryUniforms(ground), uCloudFrame: cloudFrame });
    gl.activeTexture(gl.TEXTURE0 + GROUND_VIEW_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, groundView.textures[0]);
    gl.activeTexture(gl.TEXTURE0 + CLOUD_HISTORY_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, history.textures[0]);
    gl.activeTexture(gl.TEXTURE0 + CLOUD_HISTORY_DEPTH_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, history.textures[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(cloudProgram.uniforms.uGroundView, GROUND_VIEW_UNIT);
    gl.uniform1i(cloudProgram.uniforms.uCloudHistory, CLOUD_HISTORY_UNIT);
    gl.uniform1i(cloudProgram.uniforms.uCloudHistoryDepth, CLOUD_HISTORY_DEPTH_UNIT);
    gl.uniform1i(cloudProgram.uniforms.uGroundDetail, GROUND_DETAIL_UNIT);
    gl.uniform1i(cloudProgram.uniforms.uCloudBillows, CLOUD_BILLOWS_UNIT);
    setBodies(cloudProgram, bodies, ground);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    previousCloudView = { body: ground.body.name, local: bodyLocalBasis(ground.body, view.basis), camera: [...ground.cameraLocalKm], tanHalf: [...view.tanHalf] };
    return target;
  }

  function drawGround(view, bodies, ground) {
    const shadows = drawShadows(ground, view.pixelAngle);
    const billows = ground.settings.clouds && !ground.settings.invented ? bakedCloudBillows() : null;
    if (ground.settings.clouds?.mapped) bakeNearbyClouds(bodies, ground);
    const target = groundTargetFitting();
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.activeTexture(gl.TEXTURE0 + GROUND_DETAIL_UNIT);
    gl.bindTexture(gl.TEXTURE_3D, groundDetailTexture);
    gl.activeTexture(gl.TEXTURE0 + CLOUD_BILLOWS_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, billows);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(groundSkyProgram.program);
    setUniforms(gl, groundSkyProgram, viewUniforms(view));
    setBodies(groundSkyProgram, bodies, ground);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    useOnGround(patchProgram, view, bodies, ground, shadows);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    drawDetails(patchProgram, ground.details.drawn, ground, view.pixelAngle);
    drawPatches(patchProgram, ground.drawn, ground.cameraLocalKm);
    if (ground.rivers.length) {
      useOnGround(riverProgram, view, bodies, ground, shadows);
      drawRivers(ground.rivers, ground, view.pixelAngle);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    const clouds = ground.settings.clouds ? drawClouds(view, bodies, ground, target) : null;
    return { ground: target.textures[0], depth: target.depth, clouds: clouds?.textures[0] ?? null, cloudDepth: clouds?.textures[1] ?? null };
  }

  function motionSeen({ view, cockpit, bodies, ground }) {
    const { uLocalRight, uLocalUp, uLocalForward } = ground ? bodyLocalBasis(ground.body, view.basis) : {};
    return {
      view,
      ship: { right: cockpit.uShipRight, up: cockpit.uShipUp, forward: cockpit.uShipForward },
      bodies,
      ground: ground && { name: ground.body.name, cameraLocalKm: [...ground.cameraLocalKm], aboveGroundKm: ground.aboveGroundKm, local: { right: uLocalRight, up: uLocalUp, forward: uLocalForward } },
    };
  }

  function setCockpit(program, cockpit) {
    setUniforms(gl, program, { uShipRight: cockpit.uShipRight, uShipUp: cockpit.uShipUp, uShipForward: cockpit.uShipForward, uCockpit: cockpit.enabled ? 1 : 0 });
    gl.uniform4fv(program.uniforms.uWindows, cockpit.windows);
    gl.uniform2fv(program.uniforms.uStruts, cockpit.struts);
  }

  function drawFarStars(view, beyond, { farStarImages, farStarUniforms }) {
    if (farStarsShown !== beyond.stars) uploadStars(farStars, beyond.stars);
    farStarsShown = beyond.stars;
    uploadStars(farPlanets, pointsOf(beyond.planets));
    const farView = { ...view, camera: beyond.camera };
    for (const [target, anchorShift] of [[farStars, beyond.anchorShift], [farPlanets, NO_STAR_SHIFT]]) {
      for (const image of farStarImages) {
        drawStars(eyeStarProgram, target, farView, { uWhiteBalance: WHITE_BALANCE, uAnchorShift: anchorShift, uStarShift: NO_STAR_SHIFT, ...farStarUniforms, uHoleImage: { int: image } }, HIDDEN_BEHIND_FOREGROUND);
      }
    }
  }

  function renderEye({ view, nebulae, stars, starsChanged, seed, skyResolution, skySharpening, cockpit, planet, bodies: placedBodies, beyond, craft = [], cloudSeconds, ground, warp, adaptation, longExposure, blurMotion, starlight }) {
    systemLight = starlight ?? SUNLIGHT;
    const hole = nearest(placedBodies?.filter(({ body }) => body.hole || body.pulsar || body === beyond?.mouth) ?? []);
    const holeInFront = Boolean(hole) && nearest(placedBodies) === hole;
    const bodies = placedBodies?.filter((entry) => entry !== hole && !bendsLight(entry.body)) ?? null;
    if (blurMotion) motionBlur ??= createMotionBlur(gl, emptyVao);
    const motion = motionBlur?.planFor(blurMotion ? motionSeen({ view, cockpit, bodies, ground }) : null);
    const planetValues = planetUniforms(planet, view.camera);
    if (starsChanged) uploadStars(eyeStars, stars);
    if (!warp) {
      const place = { camera: view.camera, nebulae, stars };
      growKeptSky(place);
      if (beyond) growSky(farSky, { camera: beyond.camera, nebulae, stars: beyond.stars });
      if (skyResolution) startSky(view, place, skyResolution, skySharpening, seed);
      sharpenSky(view, place);
    }

    giants.advance(bodies ?? [], view.pixelAngle, cloudSeconds);
    riverSeconds = (riverSeconds + cloudSeconds) % RIVER_CYCLE_SECONDS;
    const groundView = ground && !warp ? drawGround(view, bodies, ground) : null;
    const lens = warp ? null : blackHoleView.lensed(hole && { ...hole, beyond }, { view, sky: shownSky.textures[0], keptSky, farSky, width: canvas.width, height: canvas.height });
    const useEyeView = (program) => {
      gl.useProgram(program.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lens?.sky ?? shownSky.textures[0]);
      gl.uniform1i(program.uniforms.uSky, 0);
      setUniforms(gl, program, { ...viewUniforms(view), uWhiteBalance: WHITE_BALANCE, uFrameSeed: { uint: seed }, uLongExposure: longExposure ? 1 : 0, uFlowOn: lens?.glowing ? 1 : 0, uDazzle: lens?.dazzle ?? 0 });
      blackHoleView.bindDeflections(program, lens, holeInFront);
      setCockpit(program, cockpit);
      setUniforms(gl, program, planetValues);
      setBodies(program, bodies, ground, view.pixelAngle);
      bindWarp(program, warp, adaptation);
    };
    const drawFullscreen = () => {
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const bindSeen = (program, uniform, unit, texture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(program.uniforms[uniform], unit);
    };
    const bodiesSeen = bodiesSeenTargetsFitting();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bodiesSeen.surfaces.framebuffer);
    useEyeView(surfacesProgram);
    drawFullscreen();
    const inventedShown = bodies?.some(({ body }) => body.invented);
    const inventedSurfaces = inventedShown ? inventedSurfacesTargetFitting() : bodiesSeen.surfaces;
    if (inventedShown) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, inventedSurfaces.framebuffer);
      useEyeView(inventedSurfacesProgram);
      drawFullscreen();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, bodiesSeen.bodies.framebuffer);
    useEyeView(bodiesProgram);
    bindSeen(bodiesProgram, 'uSurfacesSeen', SURFACES_SEEN_UNIT, bodiesSeen.surfaces.texture);
    bindSeen(bodiesProgram, 'uInventedSurfacesSeen', INVENTED_SURFACES_SEEN_UNIT, inventedSurfaces.texture);
    drawFullscreen();
    gl.bindFramebuffer(gl.FRAMEBUFFER, motion?.needed ? motionBlur.pictureFitting(canvas.width, canvas.height).framebuffer : null);
    useEyeView(eyeProgram);
    bindSeen(eyeProgram, 'uBodiesSeen', BODIES_SEEN_UNIT, bodiesSeen.bodies.texture);
    if (groundView) {
      gl.activeTexture(gl.TEXTURE0 + GROUND_VIEW_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, groundView.ground);
      gl.activeTexture(gl.TEXTURE0 + CLOUD_VIEW_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, groundView.clouds);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(eyeProgram.uniforms.uGroundView, GROUND_VIEW_UNIT);
      gl.uniform1i(eyeProgram.uniforms.uCloudView, CLOUD_VIEW_UNIT);
      setUniforms(gl, eyeProgram, { uCloudsOn: groundView.clouds ? 1 : 0 });
    }
    drawFullscreen();
    if (motion?.needed) motionBlur.apply(motion, groundView, cockpit, canvas);
    gl.useProgram(eyeStarProgram.program);
    setCockpit(eyeStarProgram, cockpit);
    setUniforms(gl, eyeStarProgram, { ...planetValues, uLongExposure: longExposure ? 1 : 0 });
    setBodies(eyeStarProgram, bodies, null, 0, ground?.body);
    bindWarp(eyeStarProgram, warp, adaptation);
    blackHoleView.bindStarImages(eyeStarProgram);
    for (const image of lens?.starImages ?? ONE_STAR_IMAGE) {
      drawStars(eyeStarProgram, eyeStars, view, { uWhiteBalance: WHITE_BALANCE, uAnchorShift: view.anchorShift, uStarShift: motion?.starShiftPc ?? NO_STAR_SHIFT, uHole: NO_HOLE, ...lens?.starUniforms, uHoleImage: { int: image } }, HIDDEN_BEHIND_FOREGROUND);
    }
    if (lens?.farStarImages) drawFarStars(view, beyond, lens);
    if (craft.length && !warp) craftView.draw({ craft, bodies, ground, groundDepth: groundView?.depth ?? null, view, width: canvas.width, height: canvas.height, light: systemLight, drawInto: null });
    gl.colorMask(false, false, false, true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.colorMask(true, true, true, true);
  }

  function exposeCamera({ view, nebulae, stars, width, height, electronsPerNanomaggy, electronsPerUnit, psfPixels }) {
    if (!cameraSignal || cameraSignal.width !== width || cameraSignal.height !== height) {
      cameraSignal?.destroy();
      cameraPicture?.destroy();
      cameraSignal = createTarget(gl, width, height);
      cameraPicture = createByteTarget(gl, width, height);
    }
    uploadStars(cameraStars, stars);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cameraSignal.framebuffer);
    gl.viewport(0, 0, width, height);
    const pixelArcsec2 = (view.pixelAngle * 206264.8) ** 2;
    drawSky(view, nebulae, stars.reaches, (pixelArcsec2 * electronsPerNanomaggy) / electronsPerUnit, 1);
    drawStars(cameraStarProgram, cameraStars, view, { uElectronsPerNanomaggy: electronsPerNanomaggy, uElectronsPerUnit: electronsPerUnit, uPsfPixels: psfPixels, uAnchorShift: view.anchorShift });
    return sampleSignal(width, height);
  }

  function sampleSignal(width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, sampleTarget.framebuffer);
    gl.viewport(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    gl.useProgram(sampleProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cameraSignal.textures[0]);
    gl.uniform1i(sampleProgram.uniforms.uSignal, 0);
    gl.uniform2f(sampleProgram.uniforms.uStride, width / SAMPLE_WIDTH, height / SAMPLE_HEIGHT);
    gl.bindVertexArray(emptyVao);
    const bytes = new Uint8Array(SAMPLE_WIDTH * SAMPLE_HEIGHT * 4);
    const bands = [0, 1, 2].map((band) => {
      gl.uniform1i(sampleProgram.uniforms.uBand, band);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.readPixels(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      const values = new Float32Array(SAMPLE_WIDTH * SAMPLE_HEIGHT);
      for (let i = 0; i < values.length; i++) {
        const level = (bytes[i * 4] * 256 + bytes[i * 4 + 1]) / 65535;
        values[i] = level <= 0 ? 0 : 2 ** (SAMPLE_LOG_FLOOR + level * SAMPLE_LOG_SPAN);
      }
      return values;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return bands;
  }

  function developCamera({ electronsPerUnit, seconds, frames, seed, black, white, stretch, readNoise, dark, fullWell }) {
    const { width, height } = cameraSignal;
    gl.bindFramebuffer(gl.FRAMEBUFFER, cameraPicture.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(developProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, cameraSignal.textures[0]);
    gl.uniform1i(developProgram.uniforms.uSignal, 0);
    setUniforms(gl, developProgram, {
      uSize: [width, height],
      uElectronsPerUnit: electronsPerUnit,
      uSeconds: seconds,
      uFrames: frames,
      uSeed: { uint: seed },
      uReadNoise: readNoise,
      uDark: dark,
      uFullWell: fullWell,
      uBlack: black,
      uWhite: white,
      uStretch: stretch,
    });
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const pixels = new Uint8ClampedArray(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return pixels;
  }

  return { renderEye, exposeCamera, developCamera, captureSkyCube, loadWarpTable, loadBodyMap, loadCloudMap, loadSimulatedClouds, loadCityLights, widestTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), inventGround: inventedGround.groundOf, releasePatch, releaseDetails, releaseRibbon };
}
