import { startProgram } from './gl.js';
import { FULLSCREEN_VERTEX, LAYERS_PER_MAP } from './shaders.js';

const CHROMA_BLUR_REACH = 4;
const CHROMA_BLUR_TEXELS = 2;
const PATCH_REACH = 2;
const TONE_REACH = 5;
const TONE_TEXELS = 3.5;
const TONE_CONTRAST = 40;

const TAP_SHARED = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uMap;
const vec3 LUMINANCE = vec3(0.3, 0.5, 0.2);
ivec2 size;

ivec2 wrapped(ivec2 texel) {
  return ivec2((texel.x + size.x) % size.x, clamp(texel.y, 0, size.y - 1));
}

float closeness(ivec2 offset, float texels) {
  return exp(-float(offset.x * offset.x + offset.y * offset.y) / (2.0 * texels * texels));
}
`;

const CLEAN_FRAGMENT = `${TAP_SHARED}
out vec4 outColour;
void main() {
  size = textureSize(uMap, 0);
  ivec2 here = ivec2(gl_FragCoord.xy);
  vec4 texel = texelFetch(uMap, here, 0);
  vec3 total = vec3(0.0);
  for (int y = -${CHROMA_BLUR_REACH}; y <= ${CHROMA_BLUR_REACH}; y++) {
    for (int x = -${CHROMA_BLUR_REACH}; x <= ${CHROMA_BLUR_REACH}; x++) {
      vec4 tap = texelFetch(uMap, wrapped(here + ivec2(x, y)), 0);
      total += tap.rgb * (tap.a + 1e-3) * closeness(ivec2(x, y), ${CHROMA_BLUR_TEXELS.toFixed(1)});
    }
  }
  vec3 hue = total / max(dot(total, LUMINANCE), 1e-5);
  outColour = vec4(min(hue * dot(texel.rgb, LUMINANCE), vec3(1.0)), texel.a);
}`;

const disc = (reach) => {
  const offsets = Array.from({ length: (2 * reach + 1) ** 2 }, (_, k) => [k % (2 * reach + 1) - reach, Math.floor(k / (2 * reach + 1)) - reach]);
  return offsets.filter(([x, y]) => x * x + y * y <= reach * reach + 1);
};
const PATCH_OFFSETS = disc(PATCH_REACH);

const PATCHES_FRAGMENT = `${TAP_SHARED}
const ivec2 OFFSETS[${PATCH_OFFSETS.length}] = ivec2[](${PATCH_OFFSETS.map(([x, y]) => `ivec2(${x}, ${y})`).join(', ')});
out vec4 outColour;
void main() {
  size = textureSize(uMap, 0);
  ivec2 here = ivec2(gl_FragCoord.xy);
  vec4 taps[${PATCH_OFFSETS.length}];
  float tones[${PATCH_OFFSETS.length}];
  for (int i = 0; i < ${PATCH_OFFSETS.length}; i++) {
    taps[i] = texelFetch(uMap, wrapped(here + OFFSETS[i]), 0);
    tones[i] = dot(taps[i].rgb, LUMINANCE);
  }
  float leastSpread = 1e9;
  vec3 median = vec3(0.0);
  for (int i = 0; i < ${PATCH_OFFSETS.length}; i++) {
    float spread = 1e3 * step(taps[i].a, 0.5);
    for (int j = 0; j < ${PATCH_OFFSETS.length}; j++) spread += (taps[j].a + 1e-3) * abs(tones[j] - tones[i]);
    if (spread < leastSpread) {
      leastSpread = spread;
      median = taps[i].rgb;
    }
  }
  outColour = vec4(median, texelFetch(uMap, here, 0).a);
}`;

const TONES_FRAGMENT = `${TAP_SHARED}
layout(location = 0) out vec4 outDark;
layout(location = 1) out vec4 outBright;
void main() {
  size = textureSize(uMap, 0);
  ivec2 here = ivec2(gl_FragCoord.xy);
  float middle = dot(texelFetch(uMap, here, 0).rgb, LUMINANCE);
  vec4 dark = vec4(0.0);
  vec4 bright = vec4(0.0);
  for (int y = -${TONE_REACH}; y <= ${TONE_REACH}; y++) {
    for (int x = -${TONE_REACH}; x <= ${TONE_REACH}; x++) {
      if (x * x + y * y > ${TONE_REACH * TONE_REACH}) continue;
      vec4 tap = texelFetch(uMap, wrapped(here + ivec2(x, y)), 0);
      float weight = closeness(ivec2(x, y), ${TONE_TEXELS.toFixed(1)}) * (tap.a + 1e-3);
      float contrast = ${TONE_CONTRAST.toFixed(1)} * (dot(tap.rgb, LUMINANCE) - middle);
      dark += vec4(tap.rgb, 1.0) * weight * exp(-contrast);
      bright += vec4(tap.rgb, 1.0) * weight * exp(contrast);
    }
  }
  outDark = vec4(dark.rgb / dark.a, middle);
  outBright = vec4(bright.rgb / bright.a, 1.0);
}`;

function pixelTexture(gl, [width, height]) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}

export function createMapEdges(gl, emptyVao, size) {
  const compiling = [CLEAN_FRAGMENT, PATCHES_FRAGMENT, TONES_FRAGMENT].map((fragment) => startProgram(gl, FULLSCREEN_VERTEX, fragment));
  let programs = null;

  function draw({ program, uniforms }, source, framebuffer, attachments) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    attachments.forEach((attach, k) => attach(gl.COLOR_ATTACHMENT0 + k));
    gl.drawBuffers(attachments.map((_, k) => gl.COLOR_ATTACHMENT0 + k));
    [gl.BLEND, gl.DEPTH_TEST, gl.SCISSOR_TEST].forEach((state) => gl.disable(state));
    gl.viewport(0, 0, ...size);
    gl.useProgram(program);
    gl.bindVertexArray(emptyVao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(uniforms.uMap, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  return function bake(maps, layer, layers, image) {
    programs ??= compiling.map((program) => program.finish());
    const [clean, patches, tones] = programs;
    const raw = pixelTexture(gl, size);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ...size, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const cleaned = pixelTexture(gl, size);
    const patched = pixelTexture(gl, size);
    const framebuffers = [];
    const drawInto = (program, source, ...attachments) => {
      framebuffers.push(gl.createFramebuffer());
      draw(program, source, framebuffers.at(-1), attachments);
    };
    const toTexture = (texture) => (attachment) => gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);
    const toLayer = (k) => (attachment) => gl.framebufferTextureLayer(gl.FRAMEBUFFER, attachment, maps, 0, layer + k * layers);
    drawInto(clean, raw, toTexture(cleaned));
    drawInto(clean, raw, toLayer(0));
    drawInto(patches, cleaned, toTexture(patched));
    drawInto(tones, patched, toLayer(1), toLayer(2));
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
    [raw, cleaned, patched].forEach((texture) => gl.deleteTexture(texture));
  };
}
