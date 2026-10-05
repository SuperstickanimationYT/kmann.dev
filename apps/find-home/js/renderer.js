import { createByteTarget, createContext, createProgram, createTarget, setUniforms } from './gl.js';
import {
  BAR_ANGLE, BAR_ANGULAR_SPEED, DISK, LY_PER_PC, MAP_HALF_WIDTH, MAP_SIZE, PC_PER_YEAR_PER_KM_S,
  positionSeenAt, SUN_RADIUS,
} from './milky-way.js';
import { luminosityOf, OLD_BINS, WHITE_BALANCE, YOUNG_BINS } from './population.js';
import { createRandom } from './random.js';
import {
  DEVELOP_FRAGMENT, EYE_FRAGMENT, EYE_STAR_FRAGMENT, EYE_STAR_VERTEX, FULLSCREEN_VERTEX, MAX_GALAXIES, MAX_NEBULAE, NOISE_SIZE,
  SCOPE_STAR_FRAGMENT, SCOPE_STAR_VERTEX, SKY_FRAGMENT, UNRESOLVED_FARTHEST, UNRESOLVED_NEAREST, UNRESOLVED_STEPS,
} from './shaders.js';
import { nebulaRadius, STAR_FLOATS } from './stars.js';

const NEBULA_LIGHT_PER_IONIZING = 3700 / 1e49;
const NANOMAGGIES_PER_LIGHT_AT_PC = 1.169e9;
const GAS_COLOUR = [2.6, 1, 0.75];
const GAS_SHARE = 0.15;
const NOISE_SEED = 1;
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
    uYoungHeight: DISK.youngScaleHeight,
    uDustPerPc: DISK.dustPerPc,
    uDustLength: DISK.dustScaleLength,
    uDustHeight: DISK.dustScaleHeight,
    uGasColour: GAS_COLOUR,
    uGasPerYoung: GAS_SHARE * YOUNG_LOCAL_LIGHT,
  };
}

function unresolvedTable(bins, reaches) {
  const table = new Float32Array(UNRESOLVED_STEPS * 3);
  const logNear = Math.log(UNRESOLVED_NEAREST);
  const logStep = (Math.log(UNRESOLVED_FARTHEST) - logNear) / (UNRESOLVED_STEPS - 1);
  for (let step = 0; step < UNRESOLVED_STEPS; step++) {
    const distance = Math.exp(logNear + step * logStep);
    bins.forEach((bin, i) => {
      const reach = reaches[i];
      const hidden = reach <= 0 ? 1 : Math.min(1, Math.max(0, 5 * Math.log10(distance / reach) + 0.5));
      for (let band = 0; band < 3; band++) table[step * 3 + band] += hidden * bin.light[band];
    });
  }
  return { table, logNear, logStep };
}

function nebulaUniforms(nebulae, camera) {
  const place = new Float32Array(MAX_NEBULAE * 4);
  const glow = new Float32Array(MAX_NEBULAE * 4);
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
  return { uNebulaPlace: place, uNebulaGlow: glow, count: Math.min(nebulae.length, MAX_NEBULAE) };
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

export function createRenderer(canvas, armMap, galaxies) {
  const gl = createContext(canvas);
  if (!gl) return null;

  const skyProgram = createProgram(gl, FULLSCREEN_VERTEX, SKY_FRAGMENT);
  const eyeProgram = createProgram(gl, FULLSCREEN_VERTEX, EYE_FRAGMENT);
  const eyeStarProgram = createProgram(gl, EYE_STAR_VERTEX, EYE_STAR_FRAGMENT);
  const scopeStarProgram = createProgram(gl, SCOPE_STAR_VERTEX, SCOPE_STAR_FRAGMENT);
  const developProgram = createProgram(gl, FULLSCREEN_VERTEX, DEVELOP_FRAGMENT);
  const emptyVao = gl.createVertexArray();

  const armTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, armTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, MAP_SIZE, MAP_SIZE, 0, gl.RED, gl.FLOAT, armMap);
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

  const model = modelUniforms();
  [skyProgram, eyeStarProgram, scopeStarProgram].forEach((program) => {
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
  const scopeStars = makeStarBuffer();

  function uploadStars(target, stars) {
    gl.bindBuffer(gl.ARRAY_BUFFER, target.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, stars.values, gl.STATIC_DRAW);
    target.count = stars.count;
  }

  let scopeSignal = null;
  let scopePicture = null;

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
    const old = unresolvedTable(OLD_BINS, reaches.slice(YOUNG_BINS.length));
    const young = unresolvedTable(YOUNG_BINS, reaches.slice(0, YOUNG_BINS.length));
    setArray(gl, skyProgram, 'uOldUnresolved', old.table, 3);
    setArray(gl, skyProgram, 'uYoungUnresolved', young.table, 3);
    setUniforms(gl, skyProgram, { uUnresolvedLogNear: old.logNear, uUnresolvedLogStep: old.logStep });
    const nebulaValues = nebulaUniforms(nebulae, view.camera);
    setArray(gl, skyProgram, 'uNebulaPlace', nebulaValues.uNebulaPlace, 4);
    setArray(gl, skyProgram, 'uNebulaGlow', nebulaValues.uNebulaGlow, 4);
    gl.uniform1i(skyProgram.uniforms.uNebulaCount, nebulaValues.count);
    const galaxyValues = galaxyUniforms(galaxies, view.camera);
    setArray(gl, skyProgram, 'uGalaxyCentre', galaxyValues.centre, 3);
    setArray(gl, skyProgram, 'uGalaxyNormal', galaxyValues.normal, 3);
    setArray(gl, skyProgram, 'uGalaxyShape', galaxyValues.shape, 4);
    setArray(gl, skyProgram, 'uGalaxyTint', galaxyValues.tint, 3);
    gl.uniform1i(skyProgram.uniforms.uGalaxyCount, galaxyValues.count);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawStars(program, target, view, extra) {
    gl.useProgram(program.program);
    bindGalaxyTextures(program);
    setUniforms(gl, program, { ...viewUniforms(view), ...extra });
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
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

  function renderEye({ view, nebulae, stars, starsChanged, seed, skyResolution }) {
    if (starsChanged) uploadStars(eyeStars, stars);
    if (skyResolution) {
      shownSky = skyTargetFor(skyResolution);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shownSky.framebuffer);
      gl.viewport(0, 0, shownSky.width, shownSky.height);
      drawSky({ ...view, pixelAngle: view.pixelAngle / skyResolution }, nebulae, stars.reaches, 1, seed);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(eyeProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, shownSky.textures[0]);
    gl.uniform1i(eyeProgram.uniforms.uSky, 0);
    setUniforms(gl, eyeProgram, { uWhiteBalance: WHITE_BALANCE, uFrameSeed: { uint: seed } });
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawStars(eyeStarProgram, eyeStars, view, { uWhiteBalance: WHITE_BALANCE, uAnchorShift: view.anchorShift });
  }

  function exposeScope({ view, nebulae, stars, width, height, electronsPerNanomaggy, psfPixels }) {
    if (!scopeSignal || scopeSignal.width !== width || scopeSignal.height !== height) {
      scopeSignal?.destroy();
      scopePicture?.destroy();
      scopeSignal = createTarget(gl, width, height);
      scopePicture = createByteTarget(gl, width, height);
    }
    uploadStars(scopeStars, stars);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scopeSignal.framebuffer);
    gl.viewport(0, 0, width, height);
    const pixelArcsec2 = (view.pixelAngle * 206264.8) ** 2;
    drawSky(view, nebulae, stars.reaches, (pixelArcsec2 * electronsPerNanomaggy) / 1000, 1);
    drawStars(scopeStarProgram, scopeStars, view, { uElectronsPerNanomaggy: electronsPerNanomaggy, uPsfPixels: psfPixels, uAnchorShift: [0, 0, 0] });
    const raw = new Float32Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, raw);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return raw;
  }

  function developScope({ seconds, frames, seed, black, white, stretch, readNoise, dark, fullWell }) {
    const { width, height } = scopeSignal;
    gl.bindFramebuffer(gl.FRAMEBUFFER, scopePicture.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(developProgram.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scopeSignal.textures[0]);
    gl.uniform1i(developProgram.uniforms.uSignal, 0);
    setUniforms(gl, developProgram, {
      uSize: [width, height],
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

  return { renderEye, exposeScope, developScope };
}
