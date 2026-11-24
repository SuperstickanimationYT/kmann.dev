import { GIANT_FACE_SIZE, GIANT_FLOW_SIZE, GIANT_FRAGMENT } from './giant-shader.js';
import { GIANT_NAMES, giantLookOf, giantUniforms } from './giants.js';
import { setUniforms, startProgram } from './gl.js';
import { FULLSCREEN_VERTEX } from './shaders.js';

const FACES_UNIT = 14;
const FLOW_UNIT = 15;
const FACES = 6;
const STRIPS_PER_FACE = 24;
const STRIPS = FACES * STRIPS_PER_FACE;
const STRIP_HEIGHT = GIANT_FACE_SIZE / STRIPS_PER_FACE;
const STRIPS_PER_FRAME_UNSEEN = 4;
const STRIPS_PER_FRAME_EVOLVING = 1;
const SPARE_SLOTS = [GIANT_NAMES.length, GIANT_NAMES.length + 1];
const SLOTS = GIANT_NAMES.length + SPARE_SLOTS.length;
const FACE_LEVELS = Math.floor(Math.log2(GIANT_FACE_SIZE)) + 1;
const SMALLEST_PAINTED_PIXELS = 1.5;
const SMALLEST_EVOLVING_PIXELS = 12;
const SECONDS_PER_KEYFRAME = 10;
const GROWTH_PER_KEYFRAME = 0.012;
const GROWTH_SPAN = 0.4;
const NOT_PAINTED = -1;

const UNPAINTED_GIANT = { now: NOT_PAINTED, next: NOT_PAINTED };

function growthAt(key) {
  const along = (key * GROWTH_PER_KEYFRAME) % (2 * GROWTH_SPAN);
  return 1 + Math.min(along, 2 * GROWTH_SPAN - along);
}

const pixelsAcross = ({ body, offsetKm }, pixelAngle) => body.radiusKm / Math.hypot(...offsetKm) / pixelAngle;

function createFaces(gl, unit, format, size, levels, layers) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, format, size, size, layers);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, levels > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.activeTexture(gl.TEXTURE0);
  return texture;
}

export function createGiantPainter(gl, emptyVao) {
  const paintedSlots = new Map();
  let looks = new Map();
  let resources = null;
  let job = null;
  let evolving = null;

  function prepare() {
    resources ??= {
      faces: createFaces(gl, FACES_UNIT, gl.RGBA8, GIANT_FACE_SIZE, FACE_LEVELS, SLOTS * FACES),
      flow: createFaces(gl, FLOW_UNIT, gl.RGBA16F, GIANT_FLOW_SIZE, 1, FACES),
      framebuffer: gl.createFramebuffer(),
      smallerFramebuffer: gl.createFramebuffer(),
      compiling: startProgram(gl, FULLSCREEN_VERTEX, GIANT_FRAGMENT),
      program: null,
    };
    if (!resources.program && !resources.compiling.ready()) return false;
    resources.program ??= resources.compiling.finish();
    return true;
  }

  function usePaintProgram(name, key, values) {
    const { program } = resources;
    const giant = giantUniforms(looks.get(name).look);
    gl.useProgram(program.program);
    setUniforms(gl, program, { ...giant.values, uGrowth: growthAt(key), ...values });
    for (const [uniform, [entries, width]] of Object.entries(giant.arrays)) {
      if (program.uniforms[uniform]) gl[`uniform${width}fv`](program.uniforms[uniform], entries);
    }
    gl.bindVertexArray(emptyVao);
  }

  function paintFlow(name, key) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    gl.viewport(0, 0, GIANT_FLOW_SIZE, GIANT_FLOW_SIZE);
    for (let face = 0; face < FACES; face++) {
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.flow, 0, face);
      usePaintProgram(name, key, { uFace: { int: face }, uFaceSize: GIANT_FLOW_SIZE, uFlowOnly: { int: 1 } });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function shrinkFace(layer) {
    for (let level = 1; level < FACE_LEVELS; level++) {
      const from = GIANT_FACE_SIZE >> (level - 1);
      const to = GIANT_FACE_SIZE >> level;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resources.framebuffer);
      gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.faces, level - 1, layer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resources.smallerFramebuffer);
      gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.faces, level, layer);
      gl.blitFramebuffer(0, 0, from, from, 0, 0, to, to, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function paintStrip() {
    const face = Math.floor(job.strip / STRIPS_PER_FACE);
    const layer = job.slot * FACES + face;
    usePaintProgram(job.name, job.key, { uFace: { int: face }, uFaceSize: GIANT_FACE_SIZE, uFlowOnly: { int: 0 } });
    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffer);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, resources.faces, 0, layer);
    gl.viewport(0, 0, GIANT_FACE_SIZE, GIANT_FACE_SIZE);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, (job.strip % STRIPS_PER_FACE) * STRIP_HEIGHT, GIANT_FACE_SIZE, STRIP_HEIGHT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    job.strip++;
    if (job.strip % STRIPS_PER_FACE === 0) shrinkFace(layer);
    return job.strip === STRIPS;
  }

  function evolve(name) {
    evolving = { name, age: 0, key: 0, now: paintedSlots.get(name), next: null, coming: null };
    paintFlow(name, 0);
  }

  function stopEvolving() {
    if (!evolving) return;
    if (SPARE_SLOTS.includes(evolving.now)) paintedSlots.delete(evolving.name);
    if (job?.name === evolving.name) job = null;
    evolving = null;
  }

  function freeSlot() {
    return [looks.get(evolving.name).slot, ...SPARE_SLOTS].find((slot) => slot !== evolving.now && slot !== evolving.next && slot !== evolving.coming);
  }

  function age(seconds) {
    if (evolving.next === null) return;
    evolving.age += seconds / SECONDS_PER_KEYFRAME;
    if (evolving.age < 1) return;
    if (evolving.coming === null) {
      evolving.age = 1;
      return;
    }
    Object.assign(evolving, { now: evolving.next, next: evolving.coming, coming: null, key: evolving.key + 1, age: evolving.age - 1 });
    paintedSlots.set(evolving.name, evolving.now);
    paintFlow(evolving.name, evolving.key);
  }

  function nextJob(seen, pixelAngle) {
    const unpainted = seen.find((entry) => entry.body.kind === 'giant' && !paintedSlots.has(entry.body.name) && pixelsAcross(entry, pixelAngle) > SMALLEST_PAINTED_PIXELS);
    if (unpainted) return { name: unpainted.body.name, slot: looks.get(unpainted.body.name).slot, key: 0, strip: 0, evolves: false };
    if (!evolving || evolving.coming !== null) return null;
    return { name: evolving.name, slot: freeSlot(), key: evolving.key + (evolving.next === null ? 1 : 2), strip: 0, evolves: true };
  }

  function finishJob() {
    if (!job.evolves) paintedSlots.set(job.name, job.slot);
    else if (evolving.next === null) evolving.next = job.slot;
    else evolving.coming = job.slot;
    job = null;
  }

  function meetGiants(giants) {
    if (giants.length === looks.size && giants.every(({ body }) => looks.has(body.name))) return;
    stopEvolving();
    paintedSlots.clear();
    job = null;
    const names = giants.map(({ body }) => body.name).sort();
    looks = new Map(giants.map(({ body }) => [body.name, { slot: names.indexOf(body.name), look: giantLookOf(body) }]));
  }

  function advance(seen, pixelAngle, seconds) {
    const giants = seen.filter(({ body }) => body.kind === 'giant');
    const largest = giants.reduce((best, entry) => (!best || pixelsAcross(entry, pixelAngle) > pixelsAcross(best, pixelAngle) ? entry : best), null);
    const pixels = largest ? pixelsAcross(largest, pixelAngle) : 0;
    if (giants.length) meetGiants(giants);
    if (pixels < SMALLEST_PAINTED_PIXELS || !prepare()) return;
    if (pixels > SMALLEST_EVOLVING_PIXELS) {
      const { name } = largest.body;
      if (evolving && evolving.name !== name) stopEvolving();
      if (!evolving && seconds > 0 && paintedSlots.has(name)) evolve(name);
      if (evolving) age(seconds);
    }
    job ??= nextJob(giants, pixelAngle);
    if (!job) return;
    const strips = job.evolves ? STRIPS_PER_FRAME_EVOLVING : STRIPS_PER_FRAME_UNSEEN;
    for (let k = 0; k < strips; k++) {
      if (!paintStrip()) continue;
      finishJob();
      return;
    }
  }

  function facesOf(name) {
    if (!paintedSlots.has(name)) return UNPAINTED_GIANT;
    const next = evolving?.name === name && evolving.next !== null ? evolving.next * FACES : NOT_PAINTED;
    return { now: paintedSlots.get(name) * FACES, next };
  }

  function bind(program) {
    if (program.uniforms.uGiantFaces) gl.uniform1i(program.uniforms.uGiantFaces, FACES_UNIT);
    if (program.uniforms.uGiantFlow) gl.uniform1i(program.uniforms.uGiantFlow, FLOW_UNIT);
    setUniforms(gl, program, { uGiantAge: evolving?.age ?? 0 });
  }

  return { advance, facesOf, bind };
}
