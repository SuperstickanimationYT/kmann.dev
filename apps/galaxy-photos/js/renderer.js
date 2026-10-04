import { bindTextures, createByteTarget, createContext, createProgram, createTarget, setUniforms } from './gl.js';
import { lightingOf, morphologyOf, TELESCOPES } from './galaxy.js';
import { buildSky } from './sky.js';
import { FULLSCREEN_VERTEX, MAP_FRAGMENT } from './shaders/map.js';
import { MARCH_FRAGMENT } from './shaders/march.js';
import { BLOB_FRAGMENT, BLOB_VERTEX, SPECKLE_FRAGMENT, SPECKLE_VERTEX, STAR_FRAGMENT, STAR_VERTEX } from './shaders/points.js';
import { FINISH_FRAGMENT } from './shaders/finish.js';

const MAP_SIZE = 2048;
const MAP_STRIPS = 4;
const MARCH_STEPS = 176;
const MARCH_PIXELS_PER_STRIP = 200000;
const SPECKLES_PER_PIXEL = 0.14;
const STAR_FLOATS = 6;
const BLOB_FLOATS = 14;

function exposureOf(settings) {
  return 0.55 * 10 ** ((settings.exposure - 50) / 28);
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

export function createRenderer(canvas) {
  const gl = createContext(canvas);
  if (!gl) return null;

  const mapProgram = createProgram(gl, FULLSCREEN_VERTEX, MAP_FRAGMENT);
  const marchProgram = createProgram(gl, FULLSCREEN_VERTEX, MARCH_FRAGMENT);
  const starProgram = createProgram(gl, STAR_VERTEX, STAR_FRAGMENT);
  const speckleProgram = createProgram(gl, SPECKLE_VERTEX, SPECKLE_FRAGMENT);
  const blobProgram = createProgram(gl, BLOB_VERTEX, BLOB_FRAGMENT);
  const finishProgram = createProgram(gl, FULLSCREEN_VERTEX, FINISH_FRAGMENT);

  const emptyVao = gl.createVertexArray();
  const starBuffer = gl.createBuffer();
  const starVao = gl.createVertexArray();
  gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
  describeAttributes(gl, [2, 1, 3], STAR_FLOATS);
  const blobBuffer = gl.createBuffer();
  const blobVao = gl.createVertexArray();
  gl.bindVertexArray(blobVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, blobBuffer);
  describeAttributes(gl, [2, 1, 3, 4, 4], BLOB_FLOATS);
  gl.bindVertexArray(null);

  const maps = createTarget(gl, MAP_SIZE, MAP_SIZE, 2);
  let mapsKey = '';
  const frames = new Map();

  function frameFor(width, height) {
    const key = `${width}x${height}`;
    if (!frames.has(key)) {
      frames.set(key, {
        galaxy: createTarget(gl, width, height, 2),
        behind: createTarget(gl, width, height),
        inFront: createTarget(gl, width, height),
      });
    }
    return frames.get(key);
  }

  function forgetFrame(width, height) {
    const key = `${width}x${height}`;
    const frame = frames.get(key);
    if (!frame) return;
    Object.values(frame).forEach((target) => target.destroy());
    frames.delete(key);
  }

  function drawFullscreen() {
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function* buildMaps(settings) {
    const morphology = morphologyOf(settings);
    const key = JSON.stringify(morphology);
    if (key === mapsKey) return;
    mapsKey = '';
    const stripHeight = MAP_SIZE / MAP_STRIPS;
    for (let strip = 0; strip < MAP_STRIPS; strip++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, maps.framebuffer);
      gl.viewport(0, 0, MAP_SIZE, MAP_SIZE);
      gl.useProgram(mapProgram.program);
      setUniforms(gl, mapProgram, morphology);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, strip * stripHeight, MAP_SIZE, stripHeight);
      drawFullscreen();
      gl.disable(gl.SCISSOR_TEST);
      yield;
    }
    mapsKey = key;
  }

  function* march(settings, frame, width, height) {
    const stripHeight = Math.max(8, Math.floor(MARCH_PIXELS_PER_STRIP / width));
    for (let top = 0; top < height; top += stripHeight) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, frame.galaxy.framebuffer);
      gl.viewport(0, 0, width, height);
      gl.useProgram(marchProgram.program);
      bindTextures(gl, marchProgram, { uDisk: maps.textures[0], uDetail: maps.textures[1] });
      setUniforms(gl, marchProgram, {
        ...lightingOf(settings),
        uResolution: [width, height],
        uSteps: MARCH_STEPS,
      });
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, top, width, stripHeight);
      drawFullscreen();
      gl.disable(gl.SCISSOR_TEST);
      yield;
    }
  }

  function psfUniforms(telescope, width, height, sky) {
    return {
      uResolution: [width, height],
      uFluxScale: height * height,
      uPsfSigma: Math.max(0.7, telescope.psfSigma * height),
      uHaloRadius: Math.max(1.5, telescope.haloRadius * height),
      uHaloFraction: telescope.haloFraction,
      uSpikeLength: telescope.spikeLength * height,
      uSpikeWidth: Math.max(0.45, telescope.spikeWidth * height),
      uSpikeStrength: telescope.spikeStrength,
      uSpikeDirections: telescope.spikeDirections,
      uSpikeRoll: sky.spikeRoll,
      uCrossbarStrength: telescope.crossbar,
    };
  }

  function drawPoints(settings, frame, width, height) {
    const telescope = TELESCOPES[settings.telescope];
    const sky = buildSky(settings);
    const shared = psfUniforms(telescope, width, height, sky);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.behind.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (sky.behindCount) {
      gl.useProgram(blobProgram.program);
      setUniforms(gl, blobProgram, shared);
      gl.bindVertexArray(blobVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, blobBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, sky.behind, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sky.behindCount);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, frame.inFront.framebuffer);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (sky.starCount) {
      gl.useProgram(starProgram.program);
      setUniforms(gl, starProgram, shared);
      gl.bindVertexArray(starVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, sky.stars, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sky.starCount);
    }

    const speckleCount = Math.round(width * height * SPECKLES_PER_PIXEL);
    gl.useProgram(speckleProgram.program);
    bindTextures(gl, speckleProgram, { uLight: frame.galaxy.textures[0] });
    setUniforms(gl, speckleProgram, {
      ...shared,
      uSeed: { uint: settings.seed },
      uSpeckleCount: speckleCount,
      uYoungShare: 0.35 * (settings.resolved / 100),
      uOldShare: 0.06 * (settings.resolved / 100),
    });
    gl.bindVertexArray(emptyVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, speckleCount);

    gl.disable(gl.BLEND);
  }

  function finish(settings, frame, width, height, destination) {
    const telescope = TELESCOPES[settings.telescope];
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination ? destination.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(finishProgram.program);
    bindTextures(gl, finishProgram, {
      uLight: frame.galaxy.textures[0],
      uThrough: frame.galaxy.textures[1],
      uBehind: frame.behind.textures[0],
      uInFront: frame.inFront.textures[0],
    });
    setUniforms(gl, finishProgram, {
      uResolution: [width, height],
      uSeeing: telescope.seeing * height,
      uExposure: exposureOf(settings),
      uSoftening: 4 + 0.4 * settings.stretch,
      uNoise: telescope.noise * (settings.noise / 50),
      uSky: telescope.sky,
      uSaturation: settings.saturation / 100,
      uSeed: { uint: settings.seed * 31 + 7 },
    });
    drawFullscreen();
  }

  function* render(settings, width, height, destination = null) {
    yield* buildMaps(settings);
    const frame = frameFor(width, height);
    yield* march(settings, frame, width, height);
    drawPoints(settings, frame, width, height);
    finish(settings, frame, width, height, destination);
  }

  async function renderToBlob(settings, width, height, nextFrame) {
    const destination = createByteTarget(gl, width, height);
    for (const _ of render(settings, width, height, destination)) await nextFrame();
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, destination.framebuffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    destination.destroy();
    forgetFrame(width, height);

    const flat = document.createElement('canvas');
    flat.width = width;
    flat.height = height;
    const context = flat.getContext('2d');
    const image = context.createImageData(width, height);
    const rowBytes = width * 4;
    for (let row = 0; row < height; row++) {
      image.data.set(pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
    }
    context.putImageData(image, 0, 0);
    return new Promise((resolve) => flat.toBlob(resolve, 'image/png'));
  }

  return { render, renderToBlob };
}
