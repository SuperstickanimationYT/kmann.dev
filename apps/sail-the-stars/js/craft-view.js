import { createByteTarget, createProgram, setUniforms } from './gl.js';
import { MODEL_ATTRIBUTES, MODEL_FLOATS, SURFACE } from './model-builder.js';
import { modelNamed } from './spacecraft-models.js';
import { FARTHEST_SEEN_METRES, FULLSCREEN_VERTEX, NEAREST_SEEN_METRES } from './shaders.js';
import { cross, dot, normalize, scale, subtract } from './vectors.js';

const SAMPLES = 4;
const DEPTH_UNIT = 0;
const SMALLEST_SHOWN_PIXELS = 0.6;
const NEAREST_PLANE_METRES = 0.05;
const ATTRIBUTE_LOCATIONS = { aPosition: 0, aNormal: 1, aColour: 2, aSurface: 3, aCell: 4, aHinge: 5 };
const FILL = { sunlit: 0.09, eclipsed: 0.03, landed: 0.04 };
const BOUNCE_SHARE = 0.3;
const DUSTY_SHARE = { inAir: 0.28, airless: 0.12 };
const SKY_SHARE = 0.5;
const SUN_SETS_BETWEEN = [-0.03, 0.03];
const TWILIGHT_SINE = 0.1;
const SPACE_LIGHT = { skyColour: [0, 0, 0], skyUp: [0, 0, 1] };

const PLACING = `
layout(location = ${ATTRIBUTE_LOCATIONS.aPosition}) in vec3 aPosition;
layout(location = ${ATTRIBUTE_LOCATIONS.aHinge}) in vec3 aHinge;
uniform vec2 uPanelTurn;
vec3 turnedOnHinge(vec3 v) {
  return aHinge.z < 0.5 ? v : vec3(v.x, v.y * uPanelTurn.x - v.z * uPanelTurn.y, v.y * uPanelTurn.y + v.z * uPanelTurn.x);
}
vec3 placed() {
  vec3 pivot = vec3(0.0, aHinge.xy);
  return turnedOnHinge(aPosition - pivot) + pivot;
}`;

const CRAFT_VERTEX = `#version 300 es
precision highp float;
${PLACING}
layout(location = ${ATTRIBUTE_LOCATIONS.aNormal}) in vec3 aNormal;
layout(location = ${ATTRIBUTE_LOCATIONS.aColour}) in vec3 aColour;
layout(location = ${ATTRIBUTE_LOCATIONS.aSurface}) in vec3 aSurface;
layout(location = ${ATTRIBUTE_LOCATIONS.aCell}) in vec2 aCell;
uniform mat3 uToCamera;
uniform vec3 uOffset;
uniform vec2 uTanHalf;
uniform vec2 uPlanes;
out vec3 vPlace;
out vec3 vNormal;
out vec3 vColour;
out vec3 vSurface;
out vec2 vCell;
out vec3 vSeen;
void main() {
  vPlace = aPosition;
  vNormal = turnedOnHinge(aNormal);
  vColour = aColour;
  vSurface = aSurface;
  vCell = aCell;
  vSeen = uOffset + uToCamera * placed();
  float depth = (uPlanes.y * (vSeen.z - uPlanes.x)) / (uPlanes.y - uPlanes.x);
  gl_Position = vec4(vSeen.xy / uTanHalf, 2.0 * depth - vSeen.z, vSeen.z);
}`;

const CRAFT_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vPlace;
in vec3 vNormal;
in vec3 vColour;
in vec3 vSurface;
in vec2 vCell;
in vec3 vSeen;
uniform mat3 uToCamera;
uniform vec3 uSun;
uniform vec3 uSunlight;
uniform vec3 uBelow;
uniform vec3 uBelowColour;
uniform float uBelowReach;
uniform vec3 uSkyUp;
uniform vec3 uSkyColour;
uniform sampler2D uGroundDepth;
uniform float uGroundOn;
uniform vec4 uDust;
uniform vec3 uFill;
out vec4 outColour;

const float PI = 3.14159265;
const float CRINKLE = 0.16;
const float CRINKLES_PER_METRE = 9.0;

float random(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 low = vec4(random(cell), random(cell + vec3(1, 0, 0)), random(cell + vec3(0, 1, 0)), random(cell + vec3(1, 1, 0)));
  vec4 high = vec4(random(cell + vec3(0, 0, 1)), random(cell + vec3(1, 0, 1)), random(cell + vec3(0, 1, 1)), random(cell + vec3(1, 1, 1)));
  vec4 mixed = mix(low, high, f.z);
  return mix(mix(mixed.x, mixed.y, f.x), mix(mixed.z, mixed.w, f.x), f.y);
}

vec3 crinkled(vec3 normal, float footprint) {
  vec3 p = vPlace * CRINKLES_PER_METRE;
  float shown = CRINKLE * clamp(1.0 - footprint * CRINKLES_PER_METRE, 0.0, 1.0);
  vec3 bump = vec3(noise(p), noise(p + 37.2), noise(p + 71.9)) + 0.5 * vec3(noise(p * 2.3), noise(p * 2.3 + 11.0), noise(p * 2.3 + 53.0)) - 0.75;
  return normalize(normal + 2.0 * shown * bump);
}

vec3 cellColour(vec3 colour) {
  vec2 wide = max(fwidth(vCell), vec2(1e-4));
  vec2 inCell = abs(fract(vCell) - 0.5);
  vec2 line = smoothstep(0.5 - 0.035 - wide, vec2(0.5 - 0.02), inCell) * clamp(1.2 - 2.0 * wide, 0.0, 1.0);
  return mix(colour, vec3(0.28, 0.28, 0.3), 0.5 * max(line.x, line.y));
}

bool behindGround() {
  if (uGroundOn < 0.5) return false;
  float ground = texelFetch(uGroundDepth, ivec2(gl_FragCoord.xy), 0).r;
  float depth = log2(max(vSeen.z, ${NEAREST_SEEN_METRES} * 0.5) / ${NEAREST_SEEN_METRES}) / log2(${FARTHEST_SEEN_METRES.toFixed(1)} / ${NEAREST_SEEN_METRES});
  return ground < depth;
}

vec3 surroundings(vec3 direction, float blur) {
  float below = smoothstep(-blur - 0.02, blur + 0.02, dot(direction, uBelow) - uBelowReach);
  float sky = smoothstep(-blur - 0.02, blur + 0.02, dot(direction, uSkyUp));
  return uBelowColour * below + uSkyColour * sky * (1.0 - below);
}

void main() {
  if (behindGround()) discard;
  vec3 toEye = -normalize(vSeen * uToCamera);
  vec3 normal = normalize(vNormal);
  if (dot(normal, toEye) < 0.0) normal = -normal;
  float footprint = length(fwidth(vPlace));
  bool foil = abs(vSurface.x - ${SURFACE.foil.toFixed(1)}) < 0.5;
  bool cells = vSurface.x > 1.5;
  if (foil) normal = crinkled(normal, footprint);
  vec3 albedo = cells ? cellColour(vColour) : vColour;
  float dusted = uDust.a * (0.45 + 0.55 * noise(vPlace * 7.0)) * mix(1.0, 0.55, smoothstep(0.0, 1.5, vPlace.z));
  albedo = mix(albedo, uDust.rgb, dusted);
  float gloss = vSurface.y * (1.0 - dusted);
  float metal = vSurface.z * (1.0 - dusted);
  float rough = max(0.06, (1.0 - gloss) * (1.0 - gloss));
  vec3 head = mix(vec3(0.04), albedo, metal);
  vec3 matte = albedo * (1.0 - metal * 0.85);

  float sunHeight = max(dot(normal, uSun), 0.0);
  vec3 halfway = normalize(uSun + toEye);
  float facing = max(dot(normal, toEye), 1e-3);
  float spread = rough * rough;
  float peak = max(dot(normal, halfway), 0.0);
  float lobe = spread / (PI * pow(peak * peak * (spread - 1.0) + 1.0, 2.0));
  vec3 fresnel = head + (1.0 - head) * pow(1.0 - max(dot(halfway, toEye), 0.0), 5.0);
  vec3 sunGlint = fresnel * lobe / (4.0 * max(facing, 0.2));
  vec3 lit = uSunlight * sunHeight * (matte + min(sunGlint, vec3(6.0)));

  float towardBelow = 0.5 + 0.5 * dot(normal, uBelow);
  float towardSky = 0.5 + 0.5 * dot(normal, uSkyUp);
  float belowShare = 1.0 - uBelowReach;
  lit += matte * (uBelowColour * towardBelow * towardBelow * belowShare + uSkyColour * towardSky + uFill);
  vec3 edge = head + (max(vec3(gloss), head) - head) * pow(1.0 - facing, 5.0);
  lit += edge * (surroundings(reflect(-toEye, normal), rough) + uFill);
  outColour = vec4(pow(max(lit, 0.0), vec3(1.0 / 2.2)), 1.0);
}`;

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uCraft;
out vec4 outColour;
void main() {
  outColour = texture(uCraft, vUv);
}`;

const CRAFT_SHADOW_VERTEX = `#version 300 es
precision highp float;
${PLACING}
uniform vec3 uFromCamera;
uniform mat3 uToBody;
uniform vec3 uShadowRight;
uniform vec3 uShadowUp;
uniform vec3 uShadowSun;
uniform vec4 uShadowCascade;
void main() {
  vec3 p = uFromCamera + uToBody * placed();
  gl_Position = vec4((vec2(dot(p, uShadowRight), dot(p, uShadowUp)) - uShadowCascade.xy) / uShadowCascade.z, -dot(p, uShadowSun) / uShadowCascade.w, 1.0);
}`;

const CRAFT_SHADOW_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;

const axesOf = ({ north, meridian }) => [meridian, cross(north, meridian), north];
const inAxes = (axes, vector) => axes.map((axis) => dot(axis, vector));
const squared = (colour) => colour.map((value) => value ** 2.2);

function panelTurn(sunInModel) {
  const length = Math.hypot(sunInModel[1], sunInModel[2]);
  return length < 1e-6 ? [1, 0] : [sunInModel[2] / length, -sunInModel[1] / length];
}

function coveredBy(offsetKm, { body, offsetKm: bodyKm }) {
  if (body.kind === 'craft') return false;
  const distance = Math.hypot(...offsetKm);
  const direction = scale(offsetKm, 1 / distance);
  const along = dot(bodyKm, direction);
  const radius = body.radiusKm * 0.998;
  if (along <= 0 || along > distance + radius) return false;
  const missSquared = dot(bodyKm, bodyKm) - along * along;
  return missSquared < radius * radius && along - Math.sqrt(radius * radius - missSquared) < distance;
}

function orbitLight(craft, parentSeen) {
  if (!parentSeen || parentSeen.body.kind === 'star') return { below: [0, 0, -1], belowColour: [0, 0, 0], belowReach: 1, ...SPACE_LIGHT };
  const toParent = subtract(parentSeen.offsetKm, craft.offsetKm);
  const distance = Math.hypot(...toParent);
  const below = scale(toParent, 1 / distance);
  const share = Math.min(1, parentSeen.body.radiusKm / distance);
  const phase = (1 - dot(below, craft.body.sunward)) / 2;
  return { below, belowColour: scale(squared(parentSeen.body.tint), phase), belowReach: Math.sqrt(1 - share * share), ...SPACE_LIGHT };
}

function groundLight(craft, parent, ground) {
  const up = normalize(subtract(craft.body.fromSunKm, parent.fromSunKm));
  const sunHeight = dot(up, craft.body.sunward);
  const daylight = Math.max(0, sunHeight);
  const air = ground?.settings.air;
  const overcast = air?.overcast ?? 0;
  const tint = squared(parent.tint);
  return {
    below: scale(up, -1),
    belowColour: scale(tint, BOUNCE_SHARE * daylight),
    belowReach: 0,
    skyUp: up,
    skyColour: air ? scale(tint, SKY_SHARE * Math.sqrt(Math.max(0, sunHeight + TWILIGHT_SINE))) : [0, 0, 0],
    direct: (1 - overcast) * Math.min(1, Math.max(0, (sunHeight - SUN_SETS_BETWEEN[0]) / (SUN_SETS_BETWEEN[1] - SUN_SETS_BETWEEN[0]))),
  };
}

export function createCraftView(gl, emptyVao) {
  let programs = null;
  let target = null;
  const buffers = new Map();

  function programsReady() {
    programs ??= {
      craft: createProgram(gl, CRAFT_VERTEX, CRAFT_FRAGMENT),
      composite: createProgram(gl, FULLSCREEN_VERTEX, COMPOSITE_FRAGMENT),
      shadow: createProgram(gl, CRAFT_SHADOW_VERTEX, CRAFT_SHADOW_FRAGMENT),
    };
    return programs;
  }

  function targetFitting(width, height) {
    if (target?.width === width && target.height === height) return target;
    if (target) {
      target.resolved.destroy();
      [target.colour, target.depth].forEach((buffer) => gl.deleteRenderbuffer(buffer));
      gl.deleteFramebuffer(target.framebuffer);
    }
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const attach = (format, point) => {
      const buffer = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, SAMPLES, format, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, point, gl.RENDERBUFFER, buffer);
      return buffer;
    };
    target = { width, height, framebuffer, colour: attach(gl.RGBA8, gl.COLOR_ATTACHMENT0), depth: attach(gl.DEPTH_COMPONENT24, gl.DEPTH_ATTACHMENT), resolved: createByteTarget(gl, width, height) };
    return target;
  }

  function buffersOf(name) {
    if (buffers.has(name)) return buffers.get(name);
    const { vertices, indices, radiusMetres } = modelNamed(name);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    let offset = 0;
    for (const [attribute, size] of MODEL_ATTRIBUTES) {
      gl.enableVertexAttribArray(ATTRIBUTE_LOCATIONS[attribute]);
      gl.vertexAttribPointer(ATTRIBUTE_LOCATIONS[attribute], size, gl.FLOAT, false, MODEL_FLOATS * 4, offset * 4);
      offset += size;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const made = { vao, count: indices.length, radiusMetres };
    buffers.set(name, made);
    return made;
  }

  function pixelBox(spot, reachMetres, { tanHalf }, width, height) {
    const [x, y, z] = spot;
    if (z < reachMetres * 1.5) return [0, 0, width, height];
    const near = z - reachMetres;
    const spanOf = (value, tan, size) => {
      const edges = [(value - reachMetres) / (value - reachMetres < 0 ? near : z + reachMetres), (value + reachMetres) / (value + reachMetres > 0 ? near : z + reachMetres)];
      return edges.map((edge, k) => Math.min(size, Math.max(0, Math.round((edge / tan / 2 + 0.5) * size) + (k ? 2 : -2))));
    };
    const [left, right] = spanOf(x, tanHalf[0], width);
    const [bottom, top] = spanOf(y, tanHalf[1], height);
    return [left, bottom, right - left, top - bottom];
  }

  function inView(craft, view, { width, height }) {
    return craft
      .map((seen) => {
        const spot = inAxes([view.basis.right, view.basis.up, view.basis.forward], seen.offsetKm).map((km) => km * 1000);
        const distance = Math.hypot(...spot);
        if ((seen.body.radiusKm * 1000 * 2) / distance / view.pixelAngle < SMALLEST_SHOWN_PIXELS) return null;
        const { radiusMetres } = modelNamed(seen.body.model);
        if (spot[2] < -radiusMetres) return null;
        const box = pixelBox(spot, radiusMetres, view, width, height);
        return box[2] > 0 && box[3] > 0 ? { ...seen, spot, distance, radiusMetres, box } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.distance - a.distance);
  }

  function draw({ craft, bodies, ground, groundDepth, view, width, height, light, drawInto }) {
    const shown = inView(craft, view, { width, height }).filter((seen) => !bodies.some((other) => coveredBy(seen.offsetKm, other) && !(seen.body.landed && other.body.name === seen.body.parent)));
    if (!shown.length) return;
    const { craft: program, composite } = programsReady();
    const { framebuffer, resolved } = targetFitting(width, height);
    for (const seen of shown) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(...seen.box);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.useProgram(program.program);
      drawModel(program, seen, bodies, ground, groundDepth, view, light);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, resolved.framebuffer);
      const [x, y, w, h] = seen.box;
      gl.blitFramebuffer(x, y, x + w, y + h, x, y, x + w, y + h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, drawInto);
      gl.useProgram(composite.program);
      gl.activeTexture(gl.TEXTURE0 + DEPTH_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, resolved.texture);
      gl.uniform1i(composite.uniforms.uCraft, DEPTH_UNIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  function drawModel(program, seen, bodies, ground, groundDepth, view, light) {
    const { body, spot, distance, radiusMetres } = seen;
    const axes = axesOf(body);
    const toModel = (vector) => inAxes(axes, vector);
    const sun = toModel(body.sunward);
    const parentSeen = bodies.find((other) => other.body.name === body.parent);
    const around = body.landed ? groundLight(seen, parentSeen.body, ground) : orbitLight(seen, parentSeen);
    const strength = body.sunlitShare * (around.direct ?? 1);
    gl.uniformMatrix3fv(program.uniforms.uToCamera, false, axes.flatMap((axis) => inAxes([view.basis.right, view.basis.up, view.basis.forward], axis)));
    setUniforms(gl, program, {
      uOffset: spot,
      uTanHalf: view.tanHalf,
      uPlanes: [Math.max(NEAREST_PLANE_METRES, distance - radiusMetres * 1.02), distance + radiusMetres * 1.02],
      uPanelTurn: panelTurn(sun),
      uSun: sun,
      uSunlight: scale(light, strength),
      uFill: scale(light, body.landed ? FILL.landed * strength : FILL.eclipsed + (FILL.sunlit - FILL.eclipsed) * body.sunlitShare),
      uBelow: toModel(around.below),
      uBelowColour: scale(around.belowColour, body.sunlitShare),
      uBelowReach: around.belowReach,
      uSkyUp: toModel(around.skyUp),
      uSkyColour: around.skyColour,
      uGroundOn: groundDepth ? 1 : 0,
      uDust: body.landed ? [...squared(parentSeen.body.tint), ground?.settings.air ? DUSTY_SHARE.inAir : DUSTY_SHARE.airless] : [0, 0, 0, 0],
    });
    gl.activeTexture(gl.TEXTURE0 + DEPTH_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, groundDepth);
    gl.uniform1i(program.uniforms.uGroundDepth, DEPTH_UNIT);
    const { vao, count } = buffersOf(body.model);
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
  }

  function drawShadows(standing, { body, cameraLocalKm }, lightUniforms, cascade) {
    const { shadow } = programsReady();
    gl.useProgram(shadow.program);
    setUniforms(gl, shadow, { ...lightUniforms, uShadowCascade: cascade });
    const bodyAxes = axesOf(body);
    for (const craft of standing) {
      const axes = axesOf(craft);
      setUniforms(gl, shadow, { uFromCamera: scale(subtract(craft.localKm, cameraLocalKm), 1000), uPanelTurn: panelTurn(inAxes(axes, craft.sunward)) });
      gl.uniformMatrix3fv(shadow.uniforms.uToBody, false, axes.flatMap((axis) => inAxes(bodyAxes, axis)));
      const { vao, count } = buffersOf(craft.model);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
    }
  }

  return { draw, drawShadows };
}
