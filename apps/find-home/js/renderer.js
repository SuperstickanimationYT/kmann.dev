import { createByteTarget, createContext, createProgram, createTarget, setUniforms } from './gl.js';
import {
  ARMED_NORMAL, BAR_ANGLE, BAR_ANGULAR_SPEED, DISK, LY_PER_PC, MAP_HALF_WIDTH, MAP_SIZE, PC_PER_YEAR_PER_KM_S,
  positionSeenAt, SUN_RADIUS,
} from './milky-way.js';
import { ARMED_BINS, BULGE_BINS, luminosityOf, SMOOTH_OLD_BINS, WHITE_BALANCE, YOUNG_BINS } from './population.js';
import { createRandom } from './random.js';
import { planckNanomaggies } from './warp.js';
import {
  CAMERA_STAR_FRAGMENT, CAMERA_STAR_VERTEX, CLOUD_BAKED_OCTAVES, CLOUD_BILLOWS_FRAGMENT, CLOUD_FRAGMENT, DEVELOP_FRAGMENT,
  EYE_FRAGMENT, EYE_STAR_FRAGMENT, EYE_STAR_VERTEX, FULLSCREEN_VERTEX,
  GROUND_DETAIL_PERIOD_CELLS, GROUND_DETAIL_SLOPE_RANGE, GROUND_SKY_FRAGMENT, MAX_BODIES, MAX_GALAXIES, MAX_NEBULAE, NOISE_SIZE,
  PATCH_FRAGMENT, PATCH_VERTEX, SAMPLE_FRAGMENT, SAMPLE_LOG_FLOOR, SAMPLE_LOG_SPAN, SHADOW_CASCADES, SHADOW_FRAGMENT, SHADOW_VERTEX,
  SKY_FRAGMENT, TABLE_ROWS, TABLE_WIDTH,
  UNRESOLVED_FARTHEST, UNRESOLVED_NEAREST, UNRESOLVED_STEPS,
} from './shaders.js';
import { SHADOW_MAP_SIZE } from './ground-patches.js';
import { apparentMagnitude, MAPPED_BODIES, sunShareVisible } from './solar-system.js';
import { mapCoordinates, PATCH_FLOATS, patchIndices } from './terrain.js';
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
  if (size === 3) gl.uniform3fv(location, values);
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
const NO_SHADOWS = { uShadowsOn: 0 };
const BODY_KIND_CODES = { rocky: 0, clouded: 1, giant: 2, star: 3, ocean: 4, hazy: 5 };
const SUN_DISK_GLOW = 2;
const ECLIPSERS_PER_BODY = 2;
const AIRY_ECLIPSER_SIGN = -1;
const CORONA_FADE_SHARE = 0.004;
const HIDDEN_BEHIND_FOREGROUND = true;
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

const brightnessRank = ({ body, offsetKm }) => (body.kind === 'star' ? -Infinity : apparentMagnitude(body, offsetKm));

function brightestInDistanceOrder(seen) {
  if (seen.length <= MAX_BODIES) return seen;
  const kept = new Set([...seen].sort((a, b) => brightnessRank(a) - brightnessRank(b)).slice(0, MAX_BODIES));
  return seen.filter((entry) => kept.has(entry));
}

function bodyArrays(shown, mapRelief) {
  const arrays = {
    uBodyPlace: new Float32Array(MAX_BODIES * 4),
    uBodyOccluder: new Float32Array(MAX_BODIES * 4),
    uBodySun: new Float32Array(MAX_BODIES * 4),
    uBodyEclipser: new Float32Array(MAX_BODIES * ECLIPSERS_PER_BODY * 4),
    uBodyNorth: new Float32Array(MAX_BODIES * 3),
    uBodyMeridian: new Float32Array(MAX_BODIES * 3),
    uBodyLook: new Float32Array(MAX_BODIES * 4),
    uBodyMap: new Float32Array(MAX_BODIES * 4),
  };
  const ringed = shown.findIndex(({ body }) => body.rings);
  const rings = { uRingedBody: { int: ringed }, uRingedBodyKm: ringed >= 0 ? shown[ringed].body.radiusKm : 0 };
  shown.forEach(({ body, offsetKm }, i) => {
    const distance = Math.hypot(...offsetKm);
    const angularRadius = Math.asin(Math.min(1, body.radiusKm / distance));
    const direction = offsetKm.map((value) => value / distance);
    const star = body.kind === 'star';
    const mapped = body.mapLayer >= 0 && mapRelief[body.mapLayer] !== undefined;
    arrays.uBodyPlace.set([...direction, angularRadius], i * 4);
    arrays.uBodyOccluder.set([...direction, star ? 0 : angularRadius], i * 4);
    arrays.uBodySun.set([...body.sunward, body.sunAngularRadius], i * 4);
    body.eclipsers.forEach(({ offsetKm: eclipserKm, radiusKm, hasAir }, k) =>
      arrays.uBodyEclipser.set([...eclipserKm.map((value) => value / body.radiusKm), ((hasAir ? AIRY_ECLIPSER_SIGN : 1) * radiusKm) / body.radiusKm], (i * ECLIPSERS_PER_BODY + k) * 4));
    arrays.uBodyNorth.set(body.north, i * 3);
    arrays.uBodyMeridian.set(body.cloudMeridian || body.meridian, i * 3);
    arrays.uBodyLook.set([...body.tint.map((value) => (star ? value * SUN_DISK_GLOW : value)), BODY_KIND_CODES[body.kind]], i * 4);
    arrays.uBodyMap.set([
      mapped ? body.mapLayer : -1,
      mapped ? mapRelief[body.mapLayer] : 0,
      body.roughness ?? 0,
      star ? 0 : starPointBrightness(apparentMagnitude(body, offsetKm)),
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

export function createRenderer(canvas, armMap, galaxies) {
  const gl = createContext(canvas);
  if (!gl) return null;

  const skyProgram = createProgram(gl, FULLSCREEN_VERTEX, SKY_FRAGMENT);
  const eyeProgram = createProgram(gl, FULLSCREEN_VERTEX, EYE_FRAGMENT);
  const groundSkyProgram = createProgram(gl, FULLSCREEN_VERTEX, GROUND_SKY_FRAGMENT);
  const cloudProgram = createProgram(gl, FULLSCREEN_VERTEX, CLOUD_FRAGMENT);
  const patchProgram = createProgram(gl, PATCH_VERTEX, PATCH_FRAGMENT);
  const shadowProgram = createProgram(gl, SHADOW_VERTEX, SHADOW_FRAGMENT);
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
  let cloudBillows = null;
  let cloudTargets = [];
  let cloudFrame = 0;
  let previousCloudView = null;
  const eyeStarProgram = createProgram(gl, EYE_STAR_VERTEX, EYE_STAR_FRAGMENT);
  const cameraStarProgram = createProgram(gl, CAMERA_STAR_VERTEX, CAMERA_STAR_FRAGMENT);
  const developProgram = createProgram(gl, FULLSCREEN_VERTEX, DEVELOP_FRAGMENT);
  const sampleProgram = createProgram(gl, FULLSCREEN_VERTEX, SAMPLE_FRAGMENT);
  const sampleTarget = createByteTarget(gl, SAMPLE_WIDTH, SAMPLE_HEIGHT);
  const emptyVao = gl.createVertexArray();

  const armTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, armTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, MAP_SIZE, MAP_SIZE, 0, gl.RG, gl.FLOAT, armMap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const noiseTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, noiseTexture);
  const random = createRandom(NOISE_SEED);
  const noise = new Uint8Array(NOISE_SIZE ** 3).map(() => Math.floor(random.next() * 256));
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, 0, gl.RED, gl.UNSIGNED_BYTE, noise);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);

  const createBodyMaps = (unit, format) => {
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, format, ...BODY_MAP_SIZE, Math.max(1, MAPPED_BODIES.length));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    return texture;
  };
  const bodyColourMaps = createBodyMaps(BODY_COLOUR_UNIT, gl.RGBA8);
  const bodyHeightMaps = createBodyMaps(BODY_HEIGHT_UNIT, gl.R8);
  const mapRelief = [];

  function loadBodyMap(layer, { colour, heights, relief }) {
    const upload = (unit, texture, format, pixels) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, ...BODY_MAP_SIZE, 1, format, gl.UNSIGNED_BYTE, pixels);
    };
    upload(BODY_COLOUR_UNIT, bodyColourMaps, gl.RGBA, colour);
    upload(BODY_HEIGHT_UNIT, bodyHeightMaps, gl.RED, heights.values);
    gl.activeTexture(gl.TEXTURE0);
    mapRelief[layer] = relief;
  }

  function setBodies(program, seen, ground) {
    const shown = brightestInDistanceOrder(seen ?? []);
    const { arrays, count, rings } = bodyArrays(shown, mapRelief);
    const groundValues = groundUniforms(ground, shown);
    setUniforms(gl, program, groundValues);
    if (groundValues.uGround.int >= 0 && program.uniforms.uGroundAnchor) gl.uniform3iv(program.uniforms.uGroundAnchor, ground.frame.anchor);
    for (const [name, values] of Object.entries(arrays)) setArray(gl, program, name, values, name === 'uBodyNorth' || name === 'uBodyMeridian' ? 3 : 4);
    const sunVisible = sunShareVisible(seen ?? [], ground?.body.name);
    const coronaShown = Math.max(0, 1 - sunVisible / CORONA_FADE_SHARE) ** 2;
    setUniforms(gl, program, { uBodyCount: { int: count }, ...rings, uSunVisible: sunVisible, uCoronaShown: coronaShown });
    if (program.uniforms.uBodyColour) {
      gl.activeTexture(gl.TEXTURE0 + BODY_COLOUR_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, bodyColourMaps);
      gl.activeTexture(gl.TEXTURE0 + BODY_HEIGHT_UNIT);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, bodyHeightMaps);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1i(program.uniforms.uBodyColour, BODY_COLOUR_UNIT);
      gl.uniform1i(program.uniforms.uBodyHeight, BODY_HEIGHT_UNIT);
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

  const skyCube = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + SKY_CUBE_UNIT);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyCube);
  for (let face = 0; face < 6; face++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, gl.RGBA16F, SKY_CUBE_SIZE, SKY_CUBE_SIZE, 0, gl.RGBA, gl.HALF_FLOAT, null);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

  function captureSkyCube({ camera, nebulae, stars }) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, skyCubeFramebuffer);
    gl.viewport(0, 0, SKY_CUBE_SIZE, SKY_CUBE_SIZE);
    CUBE_FACES.forEach((basis, face) => {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + face, skyCube, 0);
      drawSky({ camera, basis, tanHalf: [1, 1], pixelAngle: Math.PI / 2 / SKY_CUBE_SIZE }, nebulae, stars.reaches, 1, 1);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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

  function groundTargetFitting() {
    const { width, height } = canvas;
    if (groundTarget?.width === width && groundTarget.height === height) return groundTarget;
    groundTarget?.destroy();
    const target = createTarget(gl, width, height);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT32F, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    groundTarget = { ...target, destroy: () => {
      target.destroy();
      gl.deleteRenderbuffer(depth);
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
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT32F, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE, SHADOW_CASCADES);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    const framebuffers = Array.from({ length: SHADOW_CASCADES }, (_, layer) => {
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

  function drawShadows(ground) {
    const { light, casters, cameraLocalKm } = ground;
    if (!light) return NO_SHADOWS;
    const { texture, framebuffers } = shadowMapsReady();
    const cameraMetres = cameraLocalKm.map((value) => value * 1000);
    const along = (axis) => cameraMetres[0] * axis[0] + cameraMetres[1] * axis[1] + cameraMetres[2] * axis[2];
    const centres = light.halvesKm.map((halfKm) => [light.right, light.up].map((axis) => Math.round(along(axis) / ((2 * halfKm * 1000) / SHADOW_MAP_SIZE))));
    const cascades = light.halvesKm.map((halfKm, layer) => {
      const half = halfKm * 1000;
      const texel = (2 * half) / SHADOW_MAP_SIZE;
      const shift = [light.right, light.up].map((axis, i) => centres[layer][i] * texel - along(axis));
      return [...shift, half, light.depthKm * 1000];
    });
    const lightUniforms = { uShadowRight: light.right, uShadowUp: light.up, uShadowSun: light.sun };
    const drawnFor = JSON.stringify([centres, light.halvesKm, light.sun, casters.map((patch) => patch.key)]);
    if (drawnFor !== shadowMaps.drawnFor) {
      shadowMaps.drawnFor = drawnFor;
      renderShadowMaps(framebuffers, cascades, lightUniforms, casters, cameraLocalKm);
    }
    gl.activeTexture(gl.TEXTURE0 + SHADOW_MAP_UNIT);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.activeTexture(gl.TEXTURE0);
    return { ...lightUniforms, uShadowsOn: 1, cascades: new Float32Array(cascades.flat()) };
  }

  function renderShadowMaps(framebuffers, cascades, lightUniforms, casters, cameraLocalKm) {
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
      drawPatches(shadowProgram, casters, cameraLocalKm);
    });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.disable(gl.DEPTH_TEST);
  }

  function bakedCloudBillows() {
    if (cloudBillows) return cloudBillows;
    const target = createTarget(gl, CLOUD_BILLOWS_WIDTH, CLOUD_BILLOWS_WIDTH / 2);
    const program = createProgram(gl, FULLSCREEN_VERTEX, CLOUD_BILLOWS_FRAGMENT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program.program);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.deleteProgram(program.program);
    [cloudBillows] = target.textures;
    gl.bindTexture(gl.TEXTURE_2D, cloudBillows);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.deleteFramebuffer(target.framebuffer);
    return cloudBillows;
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
    return target.textures[0];
  }

  function drawGround(view, bodies, ground) {
    const shadows = drawShadows(ground);
    const billows = ground.settings.clouds ? bakedCloudBillows() : null;
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

    gl.useProgram(patchProgram.program);
    setUniforms(gl, patchProgram, { ...viewUniforms(view), ...bodyLocalBasis(ground.body, view.basis), ...shadows });
    if (shadows.cascades) setArray(gl, patchProgram, 'uShadowCascades', shadows.cascades, 4);
    gl.uniform1i(patchProgram.uniforms.uShadowMaps, SHADOW_MAP_UNIT);
    gl.uniform1i(patchProgram.uniforms.uGroundDetail, GROUND_DETAIL_UNIT);
    gl.uniform1i(patchProgram.uniforms.uCloudBillows, CLOUD_BILLOWS_UNIT);
    setBodies(patchProgram, bodies, ground);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    drawPatches(patchProgram, ground.drawn, ground.cameraLocalKm);
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
    return { ground: target.textures[0], clouds: billows ? drawClouds(view, bodies, ground, target) : null };
  }

  function setCockpit(program, cockpit) {
    setUniforms(gl, program, { uShipRight: cockpit.uShipRight, uShipUp: cockpit.uShipUp, uShipForward: cockpit.uShipForward, uCockpit: cockpit.enabled ? 1 : 0 });
    gl.uniform4fv(program.uniforms.uWindows, cockpit.windows);
    gl.uniform2fv(program.uniforms.uStruts, cockpit.struts);
  }

  function renderEye({ view, nebulae, stars, starsChanged, seed, skyResolution, cockpit, planet, bodies, ground, warp, adaptation, longExposure }) {
    const planetValues = planetUniforms(planet, view.camera);
    if (starsChanged) uploadStars(eyeStars, stars);
    if (skyResolution && !warp) {
      shownSky = skyTargetFor(skyResolution);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shownSky.framebuffer);
      gl.viewport(0, 0, shownSky.width, shownSky.height);
      drawSky({ ...view, pixelAngle: view.pixelAngle / skyResolution }, nebulae, stars.reaches, 1, seed);
    }

    const groundView = ground && !warp ? drawGround(view, bodies, ground) : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(eyeProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shownSky.textures[0]);
    gl.uniform1i(eyeProgram.uniforms.uSky, 0);
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
    setUniforms(gl, eyeProgram, { ...viewUniforms(view), uWhiteBalance: WHITE_BALANCE, uFrameSeed: { uint: seed }, uLongExposure: longExposure ? 1 : 0 });
    setCockpit(eyeProgram, cockpit);
    setUniforms(gl, eyeProgram, planetValues);
    setBodies(eyeProgram, bodies, ground);
    bindWarp(eyeProgram, warp, adaptation);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.useProgram(eyeStarProgram.program);
    setCockpit(eyeStarProgram, cockpit);
    setUniforms(gl, eyeStarProgram, { ...planetValues, uLongExposure: longExposure ? 1 : 0 });
    setBodies(eyeStarProgram, bodies);
    bindWarp(eyeStarProgram, warp, adaptation);
    drawStars(eyeStarProgram, eyeStars, view, { uWhiteBalance: WHITE_BALANCE, uAnchorShift: view.anchorShift }, HIDDEN_BEHIND_FOREGROUND);
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

  return { renderEye, exposeCamera, developCamera, captureSkyCube, loadWarpTable, loadBodyMap, releasePatch };
}
