import { bindTextures, createByteTarget, createContext, createProgram, createTarget, setUniforms } from '../js/gl.js';
import { lightingOf, TELESCOPES } from '../js/galaxy.js';
import { presetSettings } from '../js/presets.js';
import { buildSky } from '../js/sky.js';
import { FULLSCREEN_VERTEX } from '../js/shaders/map.js';
import { MARCH_FRAGMENT } from '../js/shaders/march.js';
import { NOISE } from '../js/shaders/noise.js';
import { SPECKLE_FRAGMENT, SPECKLE_VERTEX, STAR_FRAGMENT, STAR_VERTEX, BLOB_FRAGMENT, BLOB_VERTEX } from '../js/shaders/points.js';
import { FINISH_FRAGMENT } from '../js/shaders/finish.js';
import { FINE_FRAGMENT, FINE_SIZE, FINE_TILE_KPC } from '../js/shaders/fine.js';

const KPC_PER_SIM_UNIT = 3 / 50;
const RMAX = 60;
const GRID = 1024;
const HEAT_GRID = 96;
const MAP_SIZE = 2048;
const BLUR_KPC = { small: 0.35, medium: 0.9, large: 3 };
const STARS_FOR_SHARP = 10;
const COLD_DISK_HEIGHT_KPC = 0.35;
const HEIGHT_RANGE_KPC = [0.2, 7];
const TRUSTED_HEIGHT_SHARE = 0.5;
const ARM_PATTERN_TURN_PER_SECOND = 0.6;
const DISK_ORDER = { gone: 0.2, intact: 0.8 };
const coldFromOrder = (order) => Math.min(1, Math.max(0, (order - DISK_ORDER.gone) / (DISK_ORDER.intact - DISK_ORDER.gone)));
const WIDTH = 1024;
const HEIGHT = 768;

const SIM_MAP_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
layout(location = 0) out vec4 outDisk;
layout(location = 1) out vec4 outDetail;
uniform sampler2D uStars;
uniform sampler2D uMembers;
uniform float uRmax;
uniform uint uSeed;
uniform float uYoung;
uniform float uGas;
uniform float uDust;
uniform float uSharpDensity;
uniform float uPitch;
uniform float uArmContrast;
uniform float uArmTurn;
uniform vec2 uCoreA;
uniform vec2 uCoreB;
uniform float uColdA;
uniform float uColdB;
${NOISE}

mat2 turn(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, s, -s, c);
}

float armProfile(float phase, float centre, float sharpness) {
  return pow(0.5 + 0.5 * cos(phase - centre), sharpness);
}

vec4 analyticArms(vec2 p, vec2 core, float spin, uint seed) {
  vec2 q = turn(spin * uArmTurn) * (p - core);
  q.y *= spin;
  float r = max(length(q), 0.15);
  float theta = atan(q.y, q.x);
  float winding = log(r / 1.5) / tan(uPitch) + 0.4 * fbm(vec2(log(r / 1.5) * 1.2, 3.1), seed + 17u, 3);
  vec2 warped = q + 1.2 * vec2(fbm(q * 0.09, seed + 11u, 3), fbm(q * 0.09, seed + 12u, 3));
  float wobble = 0.55 * fbm(warped * 0.07, seed + 13u, 3) + 0.4 * fbm(warped * 0.17, seed + 18u, 3) + 0.2 * fbm(warped * 0.35, seed + 14u, 3);
  float phase = 2.0 * (theta - winding + wobble);
  float along = smoothstep(-0.35, 0.3, fbm(turn(-winding) * q * 0.16, seed + 21u, 4));
  float sharpness = mix(1.5, 9.0, uArmContrast);
  float inner = smoothstep(1.2, 2.0, r);
  return vec4(
    armProfile(phase, -0.35, sharpness * 0.8) * along * inner,
    armProfile(phase, -0.15, sharpness * 1.6) * along * inner,
    armProfile(phase, 0.28, sharpness * 2.2) * along * inner,
    1.0 + 0.7 * uArmContrast * (armProfile(phase, -0.1, 2.0) - 0.4) * inner
  );
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uRmax;
  vec4 stars = texture(uStars, vUv);
  vec3 members = texture(uMembers, vUv).rgb;
  float sharp = clamp(stars.g / uSharpDensity, 0.0, 1.0);
  float sparse = clamp(stars.g / (0.3 * uSharpDensity), 0.0, 1.0);
  float surface = mix(mix(stars.b, stars.g, sparse), stars.r, sharp);
  float height = stars.a;
  float shareA = members.r / max(members.r + members.g, 1e-6);
  float cold = mix(uColdB, uColdA, shareA);
  float crowded = smoothstep(0.3, 1.0, stars.g / uSharpDensity);
  float crowding = clamp(stars.g / max(stars.b, 1e-4) - 1.0, 0.0, 2.0) * crowded;

  vec4 arms = mix(analyticArms(p, uCoreB, -1.0, uSeed + 500u), analyticArms(p, uCoreA, 1.0, uSeed), shareA);
  vec4 armsHere = vec4(arms.rgb * cold, mix(1.0, arms.a, cold));

  vec2 warpedP = p + 1.2 * vec2(fbm(p * 0.09, uSeed + 11u, 3), fbm(p * 0.09, uSeed + 12u, 3));
  float mottle = 0.5 + 1.0 * smoothstep(-0.4, 0.5, fbm(warpedP * 1.6, uSeed + 41u, 4));
  float oldGrain = 0.93 + 0.14 * smoothstep(-0.5, 0.5, fbm(warpedP * 2.0, uSeed + 43u, 4));
  float starsHere = pow(stars.g, 0.8) * cold * crowded;

  float young = uYoung * starsHere * (0.08 + crowding + armsHere.r) * mottle;
  float complexes = clumps(p, 0.55, 0.4, 2.0, uSeed + 51u);
  float knots = clumps(p, 0.16, 0.4, 3.0, uSeed + 53u);
  float gasMask = smoothstep(0.08, 0.6, 0.8 * crowding + armsHere.g + 0.25 * fbm(warpedP * 0.5, uSeed + 55u, 3));
  float gas = uGas * starsHere * gasMask * complexes * knots * 16.0;
  float clusters = uYoung * clumps(p, 0.09, 0.22, 7.0, uSeed + 61u) * smoothstep(0.04, 0.5, crowding + armsHere.r) * starsHere;

  float filaments = ridged(warpedP * 0.75, uSeed + 71u, 5);
  float holes = smoothstep(-0.25, 0.25, fbm(warpedP * 0.5, uSeed + 73u, 4));
  float dust = uDust * pow(stars.g, 0.7) * cold * crowded * (0.12 + crowding + armsHere.b) * mix(0.35, 1.6, filaments) * mix(0.55, 1.0, holes);
  float extraplanarDust = pow(ridged(warpedP * 0.9, uSeed + 81u, 4), 3.0) * smoothstep(-0.2, 0.3, fbm(p * 0.6, uSeed + 83u, 3));

  outDisk = vec4(surface * oldGrain * armsHere.a, young, gas, dust);
  outDetail = vec4(clusters, extraplanarDust, height, 0.0);
}
`;

const PATCHED_MARCH = MARCH_FRAGMENT
  .replace('uniform vec2 uFineShift;', 'uniform vec2 uFineShift;\nuniform vec2 uCoreA;\nuniform vec2 uCoreB;')
  .replace('  float oldHeight = uThickness;\n  float youngHeight = uThickness * 0.3;\n  float dustHeight = uThickness * 0.45;\n', '')
  .replace('    vec4 detail = texture(uDetail, uv);', '    vec4 detail = texture(uDetail, uv);\n    float oldHeight = detail.b;\n    float youngHeight = oldHeight * 0.3;\n    float dustHeight = oldHeight * 0.45;')
  .replace('uBulgeLight * sersicDensity(p)', 'uBulgeLight * (sersicDensity(p - vec3(uCoreA, 0.0)) + sersicDensity(p - vec3(uCoreB, 0.0)))')
  .replace('uNucleusLight * exp(-dot(p, p) / 0.0016)', 'uNucleusLight * (exp(-dot(p - vec3(uCoreA, 0.0), p - vec3(uCoreA, 0.0)) / 0.0016) + exp(-dot(p - vec3(uCoreB, 0.0), p - vec3(uCoreB, 0.0)) / 0.0016))');
const PATCH_MARKERS = ['uniform vec2 uCoreB;', 'float oldHeight = detail.b;', 'sersicDensity(p - vec3(uCoreB', 'uCoreB, 0.0)) / 0.0016)'];
if (PATCHED_MARCH.includes('float oldHeight = uThickness;') || !PATCH_MARKERS.every((marker) => PATCHED_MARCH.includes(marker))) throw new Error('march patch missed an anchor');

async function loadMerger() {
  const meta = await (await fetch('merger.json')).json();
  const buffer = await (await fetch('merger.bin')).arrayBuffer();
  const galaxies = new Uint8Array(buffer, 0, meta.stars);
  const floats = new Float32Array(buffer, meta.stars);
  const snapshot = (index) => floats.subarray(index * meta.stars * 4, (index + 1) * meta.stars * 4);
  return { ...meta, galaxies, snapshot };
}

function boxBlurLine(from, to, start, stride, length, radius) {
  const width = 2 * radius + 1;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += from[start + Math.min(length - 1, Math.max(0, i)) * stride];
  for (let i = 0; i < length; i++) {
    to[start + i * stride] = sum / width;
    sum += from[start + Math.min(length - 1, i + radius + 1) * stride] - from[start + Math.max(0, i - radius) * stride];
  }
}

function blur(grid, size, sigmaCells) {
  const scratch = new Float32Array(grid.length);
  const radius = Math.max(0, Math.round((Math.sqrt((12 * sigmaCells * sigmaCells) / 3 + 1) - 1) / 2));
  if (!radius) return grid;
  for (let pass = 0; pass < 3; pass++) {
    for (let row = 0; row < size; row++) boxBlurLine(grid, scratch, row * size, 1, size, radius);
    for (let column = 0; column < size; column++) boxBlurLine(scratch, grid, column, size, size, radius);
  }
  return grid;
}

function splat(grid, size, x, y, weight) {
  const cx = ((x / RMAX) * 0.5 + 0.5) * size - 0.5;
  const cy = ((y / RMAX) * 0.5 + 0.5) * size - 0.5;
  const [left, top] = [Math.floor(cx), Math.floor(cy)];
  if (left < 0 || top < 0 || left + 1 >= size || top + 1 >= size) return;
  const [right, down] = [cx - left, cy - top];
  const at = top * size + left;
  grid[at] += weight * (1 - right) * (1 - down);
  grid[at + 1] += weight * right * (1 - down);
  grid[at + size] += weight * (1 - right) * down;
  grid[at + size + 1] += weight * right * down;
}

function coreOf(stars, galaxies, which, count) {
  let [x, y, n] = [0, 0, 0];
  for (let i = 0; i < count; i++) if (galaxies[i] === which) [x, y, n] = [x + stars[i * 4], y + stars[i * 4 + 1], n + 1];
  [x, y] = [x / n, y / n];
  for (const reach of [300, 150, 60, 30]) {
    let [sx, sy, m] = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      if (galaxies[i] !== which || Math.hypot(stars[i * 4] - x, stars[i * 4 + 1] - y) > reach) continue;
      [sx, sy, m] = [sx + stars[i * 4], sy + stars[i * 4 + 1], m + 1];
    }
    if (m) [x, y] = [sx / m, sy / m];
  }
  return [x * KPC_PER_SIM_UNIT, y * KPC_PER_SIM_UNIT];
}

function rotationalOrder(stars, galaxies, which, count) {
  const reach = 100;
  let [cx, cy, vx, vy, n] = [0, 0, 0, 0, 0];
  const [coreX, coreY] = coreOf(stars, galaxies, which, count).map((kpc) => kpc / KPC_PER_SIM_UNIT);
  for (let i = 0; i < count; i++) {
    if (galaxies[i] !== which || Math.hypot(stars[i * 4] - coreX, stars[i * 4 + 1] - coreY) > reach) continue;
    [vx, vy, n] = [vx + stars[i * 4 + 2], vy + stars[i * 4 + 3], n + 1];
  }
  [cx, cy, vx, vy] = [coreX, coreY, vx / n, vy / n];
  let [spin, most] = [0, 0];
  for (let i = 0; i < count; i++) {
    const [dx, dy, dvx, dvy] = [stars[i * 4] - cx, stars[i * 4 + 1] - cy, stars[i * 4 + 2] - vx, stars[i * 4 + 3] - vy];
    if (galaxies[i] !== which || Math.hypot(dx, dy) > reach) continue;
    spin += dx * dvy - dy * dvx;
    most += Math.hypot(dx, dy) * Math.hypot(dvx, dvy);
  }
  return Math.abs(spin / most);
}

function heatGrid(stars, count) {
  const cellKpc = (2 * RMAX) / HEAT_GRID;
  const [mass, vx, vy, vv] = [0, 0, 0, 0].map(() => new Float32Array(HEAT_GRID * HEAT_GRID));
  for (let i = 0; i < count; i++) {
    const [x, y, u, v] = [stars[i * 4] * KPC_PER_SIM_UNIT, stars[i * 4 + 1] * KPC_PER_SIM_UNIT, stars[i * 4 + 2], stars[i * 4 + 3]];
    splat(mass, HEAT_GRID, x, y, 1);
    splat(vx, HEAT_GRID, x, y, u);
    splat(vy, HEAT_GRID, x, y, v);
    splat(vv, HEAT_GRID, x, y, u * u + v * v);
  }
  [mass, vx, vy, vv].forEach((grid) => blur(grid, HEAT_GRID, 1.2));
  const roughHeight = new Float32Array(HEAT_GRID * HEAT_GRID);
  const randomPerOrdered = new Float32Array(HEAT_GRID * HEAT_GRID).fill(10);
  for (let cell = 0; cell < roughHeight.length; cell++) {
    if (mass[cell] < 0.5) continue;
    const orderedSquared = (vx[cell] / mass[cell]) ** 2 + (vy[cell] / mass[cell]) ** 2;
    const spreadSquared = Math.max(0, vv[cell] / mass[cell] - orderedSquared);
    roughHeight[cell] = spreadSquared / (mass[cell] / cellKpc ** 2);
    randomPerOrdered[cell] = Math.sqrt(spreadSquared / Math.max(orderedSquared, 1e-6));
  }
  return { roughHeight, mass, randomPerOrdered };
}

function weightedMedian(values, weights) {
  const order = [...values.keys()].filter((i) => weights[i] > 0.5).sort((a, b) => values[a] - values[b]);
  const total = order.reduce((sum, i) => sum + weights[i], 0);
  let running = 0;
  for (const i of order) if ((running += weights[i]) >= total / 2) return values[i];
  return 1;
}

function sampleBilinear(grid, size, u, v) {
  const [cx, cy] = [u * size - 0.5, v * size - 0.5];
  const [left, top] = [Math.max(0, Math.min(size - 2, Math.floor(cx))), Math.max(0, Math.min(size - 2, Math.floor(cy)))];
  const [right, down] = [Math.min(1, Math.max(0, cx - left)), Math.min(1, Math.max(0, cy - top))];
  const at = top * size + left;
  return (grid[at] * (1 - right) + grid[at + 1] * right) * (1 - down) + (grid[at + size] * (1 - right) + grid[at + size + 1] * right) * down;
}

function starTexture(merger, index, heightPerRough) {
  const stars = merger.snapshot(index);
  const count = merger.stars;
  const cellKpc = (2 * RMAX) / GRID;
  const densityUnit = count / 2 / (2 * Math.PI * 9);
  const raw = new Float32Array(GRID * GRID);
  for (let i = 0; i < count; i++) splat(raw, GRID, stars[i * 4] * KPC_PER_SIM_UNIT, stars[i * 4 + 1] * KPC_PER_SIM_UNIT, 1 / (cellKpc * cellKpc * densityUnit));
  const [small, medium, large] = [BLUR_KPC.small, BLUR_KPC.medium, BLUR_KPC.large].map((kpc) => blur(raw.slice(), GRID, kpc / cellKpc));
  const members = [0, 1].map((which) => {
    const grid = new Float32Array(GRID * GRID);
    for (let i = 0; i < count; i++) if (merger.galaxies[i] === which) splat(grid, GRID, stars[i * 4] * KPC_PER_SIM_UNIT, stars[i * 4 + 1] * KPC_PER_SIM_UNIT, 1);
    return blur(grid, GRID, BLUR_KPC.large / cellKpc);
  });
  const { roughHeight, randomPerOrdered } = heatGrid(stars, count);
  const memberTexels = new Float32Array(GRID * GRID * 4);
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const cell = row * GRID + column;
      const heat = Math.min(10, sampleBilinear(randomPerOrdered, HEAT_GRID, (column + 0.5) / GRID, (row + 0.5) / GRID));
      memberTexels.set([members[0][cell], members[1][cell], heat, 0], cell * 4);
    }
  }
  const sharpDensity = STARS_FOR_SHARP / (2 * Math.PI * BLUR_KPC.small ** 2) / densityUnit;
  const texels = new Float32Array(GRID * GRID * 4);
  const heights = [];
  for (let row = 0; row < GRID; row++) {
    for (let column = 0; column < GRID; column++) {
      const cell = row * GRID + column;
      const estimated = Math.min(HEIGHT_RANGE_KPC[1], Math.max(HEIGHT_RANGE_KPC[0], heightPerRough * sampleBilinear(roughHeight, HEAT_GRID, (column + 0.5) / GRID, (row + 0.5) / GRID)));
      const trusted = Math.min(1, large[cell] / (TRUSTED_HEIGHT_SHARE * sharpDensity));
      const height = COLD_DISK_HEIGHT_KPC + (estimated - COLD_DISK_HEIGHT_KPC) * trusted;
      texels.set([small[cell], medium[cell], large[cell], height], cell * 4);
      if (medium[cell] > 0.05) heights.push(height);
    }
  }
  heights.sort((a, b) => a - b);
  return {
    texels,
    memberTexels,
    seconds: index * merger.secondsPerSnapshot,
    sharpDensity,
    cores: [coreOf(stars, merger.galaxies, 0, count), coreOf(stars, merger.galaxies, 1, count)],
    order: [rotationalOrder(stars, merger.galaxies, 0, count), rotationalOrder(stars, merger.galaxies, 1, count)],
    medianHeight: heights[Math.floor(heights.length / 2)] ?? 0,
    tallHeight: heights[Math.floor(heights.length * 0.9)] ?? 0,
  };
}

function calibrateHeight(merger) {
  const stars = merger.snapshot(0);
  const { roughHeight, mass } = heatGrid(stars, merger.stars);
  return COLD_DISK_HEIGHT_KPC / weightedMedian(roughHeight, mass);
}

function describeAttributes(gl, layout, stride) {
  let offset = 0;
  layout.forEach((size, location) => {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
    gl.vertexAttribDivisor(location, 1);
    offset += size;
  });
}

function createMergerRenderer(canvas) {
  const gl = createContext(canvas);
  const programs = {
    simMap: createProgram(gl, FULLSCREEN_VERTEX, SIM_MAP_FRAGMENT),
    march: createProgram(gl, FULLSCREEN_VERTEX, PATCHED_MARCH),
    star: createProgram(gl, STAR_VERTEX, STAR_FRAGMENT),
    blob: createProgram(gl, BLOB_VERTEX, BLOB_FRAGMENT),
    speckle: createProgram(gl, SPECKLE_VERTEX, SPECKLE_FRAGMENT),
    finish: createProgram(gl, FULLSCREEN_VERTEX, FINISH_FRAGMENT),
    fine: createProgram(gl, FULLSCREEN_VERTEX, FINE_FRAGMENT),
  };
  const emptyVao = gl.createVertexArray();
  const drawFullscreen = () => {
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const pointBuffers = Object.fromEntries([['star', [2, 1, 3], 6], ['blob', [2, 1, 3, 4, 4], 14]].map(([name, layout, stride]) => {
    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    describeAttributes(gl, layout, stride);
    gl.bindVertexArray(null);
    return [name, { buffer, vao }];
  }));

  const fine = createByteTarget(gl, FINE_SIZE, FINE_SIZE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fine.framebuffer);
  gl.viewport(0, 0, FINE_SIZE, FINE_SIZE);
  gl.useProgram(programs.fine.program);
  drawFullscreen();
  gl.bindTexture(gl.TEXTURE_2D, fine.texture);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const [starsTexture, membersTexture] = [0, 1].map(() => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  });
  const maps = createTarget(gl, MAP_SIZE, MAP_SIZE, 2);
  const frames = new Map();
  const frameFor = (width, height) => {
    const key = `${width}x${height}`;
    if (!frames.has(key)) frames.set(key, { galaxy: createTarget(gl, width, height, 2), behind: createTarget(gl, width, height), inFront: createTarget(gl, width, height) });
    return frames.get(key);
  };

  async function render({ starField, look, view }, width, height, nextFrame, destination = null) {
    gl.bindTexture(gl.TEXTURE_2D, starsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, GRID, GRID, 0, gl.RGBA, gl.FLOAT, starField.texels);
    gl.bindTexture(gl.TEXTURE_2D, membersTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, GRID, GRID, 0, gl.RGBA, gl.FLOAT, starField.memberTexels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, maps.framebuffer);
    gl.viewport(0, 0, MAP_SIZE, MAP_SIZE);
    gl.useProgram(programs.simMap.program);
    bindTextures(gl, programs.simMap, { uStars: starsTexture, uMembers: membersTexture });
    setUniforms(gl, programs.simMap, {
      uRmax: RMAX, uSeed: { uint: look.seed }, uYoung: look.young / 100, uGas: look.gas / 100, uDust: look.dust / 100,
      uSharpDensity: starField.sharpDensity,
      uPitch: (19 * Math.PI) / 180,
      uArmContrast: look.armContrast / 100,
      uArmTurn: ARM_PATTERN_TURN_PER_SECOND * starField.seconds,
      uColdA: coldFromOrder(starField.order[0]),
      uColdB: coldFromOrder(starField.order[1]),
      uCoreA: starField.cores[0],
      uCoreB: starField.cores[1],
    });
    drawFullscreen();
    await nextFrame();

    const settings = { ...look, ...view };
    const lighting = lightingOf(settings);
    const frame = frameFor(width, height);
    const fieldHeight = view.fieldKpc;
    const marchUniforms = {
      ...lighting,
      uRmax: RMAX,
      uZmax: Math.min(RMAX, 6 * Math.max(starField.tallHeight, 1)),
      uThickness: Math.max(0.3, starField.medianHeight),
      uFieldHeight: fieldHeight,
      uCentre: [0, 0],
      uBarLight: 0,
      uBarLength: 0,
      uCoreA: starField.cores[0],
      uCoreB: starField.cores[1],
      uFineLod: Math.max(0, Math.log2(((fieldHeight / height) * FINE_SIZE) / FINE_TILE_KPC)),
      uFineShift: [(look.seed % 97) / 97, (look.seed % 89) / 89],
      uResolution: [width, height],
      uSteps: 176,
    };
    const stripHeight = Math.max(8, Math.floor(200000 / width));
    for (let top = 0; top < height; top += stripHeight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame.galaxy.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.useProgram(programs.march.program);
      bindTextures(gl, programs.march, { uDisk: maps.textures[0], uDetail: maps.textures[1], uFine: fine.texture });
      setUniforms(gl, programs.march, marchUniforms);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, top, width, stripHeight);
      drawFullscreen();
      gl.disable(gl.SCISSOR_TEST);
      await nextFrame();
    }

    const telescope = TELESCOPES[look.telescope];
    const sky = buildSky({ ...settings, bulge: 0 });
    const shared = {
      uResolution: [width, height], uFluxScale: height * height,
      uPsfSigma: Math.max(0.7, telescope.psfSigma * height), uHaloRadius: Math.max(1.5, telescope.haloRadius * height), uHaloFraction: telescope.haloFraction,
      uSpikeLength: telescope.spikeLength * height, uSpikeWidth: Math.max(0.45, telescope.spikeWidth * height), uSpikeStrength: telescope.spikeStrength,
      uSpikeDirections: telescope.spikeDirections, uSpikeRoll: sky.spikeRoll, uCrossbarStrength: telescope.crossbar,
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    for (const [target, name, data, count] of [[frame.behind, 'blob', sky.behind, sky.behindCount], [frame.inFront, 'star', sky.stars, sky.starCount]]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!count) continue;
      gl.useProgram(programs[name].program);
      setUniforms(gl, programs[name], shared);
      gl.bindVertexArray(pointBuffers[name].vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffers[name].buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    }
    const speckleCount = Math.round(width * height * 0.45);
    gl.useProgram(programs.speckle.program);
    bindTextures(gl, programs.speckle, { uLight: frame.galaxy.textures[0] });
    setUniforms(gl, programs.speckle, { ...shared, uSeed: { uint: look.seed }, uSpeckleCount: speckleCount, uYoungShare: lighting.uResolvedShare, uOldShare: 0.06 * (look.resolved / 100) });
    gl.bindVertexArray(emptyVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, speckleCount);
    gl.disable(gl.BLEND);

    gl.bindFramebuffer(gl.FRAMEBUFFER, destination ? destination.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(programs.finish.program);
    bindTextures(gl, programs.finish, { uLight: frame.galaxy.textures[0], uThrough: frame.galaxy.textures[1], uBehind: frame.behind.textures[0], uInFront: frame.inFront.textures[0] });
    setUniforms(gl, programs.finish, {
      uResolution: [width, height], uSeeing: telescope.seeing * height, uExposure: 0.55 * 10 ** ((look.exposure - 50) / 28),
      uSoftening: 4 + 0.4 * look.stretch, uNoise: telescope.noise * (look.noise / 50), uSky: telescope.sky, uSaturation: look.saturation / 100,
      uSeed: { uint: look.seed * 31 + 7 }, uMirror: 0,
    });
    drawFullscreen();
  }

  function readPixels(width, height, nextFrame, field) {
    return (async () => {
      const destination = createByteTarget(gl, width, height);
      await render(field, width, height, nextFrame, destination);
      const pixels = new Uint8Array(width * height * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      destination.destroy();
      const image = new ImageData(width, height);
      for (let row = 0; row < height; row++) image.data.set(pixels.subarray((height - 1 - row) * width * 4, (height - row) * width * 4), row * width * 4);
      return image;
    })();
  }

  return { render, readPixels };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const find = (selector) => document.querySelector(selector);
const canvas = find('[data-preview]');
canvas.width = WIDTH;
canvas.height = HEIGHT;
const status = find('[data-state]');
const form = find('[data-controls]');

const merger = await loadMerger();
const heightPerRough = calibrateHeight(merger);
const renderer = createMergerRenderer(canvas);
form.time.max = merger.snapshots - 1;

const KEY_MOMENTS = [0, 3.5, 5, 7, 10, 14, 16, 19, 23, 30];
find('[data-moments]').append(...KEY_MOMENTS.map((seconds) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${seconds}s`;
  button.addEventListener('click', () => {
    form.time.value = Math.round(seconds / merger.secondsPerSnapshot);
    draw();
  });
  return button;
}));

function readForm() {
  const look = { ...presetSettings('grand', Number(form.seed.value)), young: Number(form.young.value), gas: Number(form.gas.value), dust: Number(form.dust.value), bulge: Number(form.bulge.value), disk: Number(form.disk.value), exposure: Number(form.exposure.value), telescope: form.telescope.value };
  const view = { inclination: Number(form.inclination.value), angle: Number(form.angle.value), fieldKpc: Number(form.field.value) };
  return { index: Number(form.time.value), look, view };
}

let drawing = Promise.resolve();
let queued = false;
function draw() {
  if (queued) return;
  queued = true;
  drawing = drawing.then(async () => {
    queued = false;
    const { index, look, view } = readForm();
    const started = performance.now();
    const starField = starTexture(merger, index, heightPerRough);
    const baked = performance.now();
    await renderer.render({ starField, look, view }, WIDTH, HEIGHT, nextFrame);
    const [[ax, ay], [bx, by]] = starField.cores;
    status.textContent = [
      `t = ${(index * merger.secondsPerSnapshot).toFixed(1)} sim-s (snapshot ${index}/${merger.snapshots - 1})`,
      `core separation = ${Math.hypot(ax - bx, ay - by).toFixed(1)} kpc`,
      `rotational order A / B = ${starField.order.map((order) => order.toFixed(2)).join(' / ')}`,
      `disk height median / p90 = ${starField.medianHeight.toFixed(2)} / ${starField.tallHeight.toFixed(2)} kpc`,
      `stars = ${merger.stars}, density bake ${(baked - started).toFixed(0)} ms, render ${(performance.now() - baked).toFixed(0)} ms`,
    ].join('\n');
  });
}

async function contactSheet() {
  const sheet = find('[data-sheet]');
  sheet.replaceChildren();
  const { look, view } = readForm();
  for (const seconds of KEY_MOMENTS) {
    const index = Math.round(seconds / merger.secondsPerSnapshot);
    const image = await renderer.readPixels(512, 384, nextFrame, { starField: starTexture(merger, index, heightPerRough), look, view });
    const tile = document.createElement('figure');
    const tileCanvas = document.createElement('canvas');
    [tileCanvas.width, tileCanvas.height] = [512, 384];
    tileCanvas.getContext('2d').putImageData(image, 0, 0);
    const caption = document.createElement('figcaption');
    caption.textContent = `${seconds}s`;
    tile.append(tileCanvas, caption);
    sheet.append(tile);
  }
  draw();
}

const showValues = () => form.querySelectorAll('output').forEach((output) => (output.value = form[output.htmlFor.value].value));
form.addEventListener('input', showValues);
form.addEventListener('change', draw);
find('[data-contact-sheet]').addEventListener('click', () => (drawing = drawing.then(contactSheet)));
showValues();
draw();
