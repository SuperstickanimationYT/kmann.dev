import { createProgram, setUniforms } from './gl.js';
import { FARTHEST_SEEN_METRES, NEAREST_SEEN_METRES } from './shaders.js';

const PLUME_METRES = 18;
const JET_METRES = 4;
export const EXHAUST_REACH_METRES = PLUME_METRES * 1.2;

const PLUME_PARTICLES = 1400;
const JET_PARTICLES_PER_POD = 90;
const PODS = 4;
const PARTICLES = PLUME_PARTICLES + PODS * JET_PARTICLES_PER_POD;
const MOST_NOZZLES = 16;
const POD_FIRST_ANGLE = Math.PI / 4;
const CROSSINGS_PER_SECOND = { plume: 7, jet: 9 };
const SPREAD_RADIANS = { plume: 0.34, jet: 0.25 };
const SECONDS_WRAP = 1000;

const EXHAUST_VERTEX = `#version 300 es
precision highp float;
uniform mat3 uToCamera;
uniform vec3 uOffset;
uniform vec2 uTanHalf;
uniform vec2 uPlanes;
uniform float uPixelAngle;
uniform float uSeconds;
uniform float uPlume;
uniform vec4 uJet;
uniform vec4 uGround;
uniform vec4 uNozzles[${MOST_NOZZLES}];
uniform int uNozzleCount;
uniform vec2 uPods;
out vec3 vColour;
out float vSeenZ;
const float PI = 3.14159265;

float hash(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

vec3 coneDirection(vec3 axis, float spread, vec2 r) {
  vec3 side = normalize(abs(axis.z) < 0.9 ? cross(axis, vec3(0.0, 0.0, 1.0)) : cross(axis, vec3(1.0, 0.0, 0.0)));
  vec3 other = cross(axis, side);
  float angle = 2.0 * PI * r.x;
  float tilt = spread * sqrt(r.y);
  return axis * cos(tilt) + (side * cos(angle) + other * sin(angle)) * sin(tilt);
}

vec3 spreadOverGround(vec3 place, vec3 axisStart, vec3 axis) {
  float height = uGround.w + dot(place, uGround.xyz);
  if (height >= 0.0) return place;
  float towardGround = -dot(axis, uGround.xyz);
  vec3 hit = axisStart + axis * max(0.0, uGround.w + dot(axisStart, uGround.xyz)) / max(towardGround, 0.05);
  vec3 onGround = place - uGround.xyz * height;
  vec3 outward = onGround - hit;
  outward -= uGround.xyz * dot(outward, uGround.xyz);
  float across = length(outward);
  vec3 away = across > 1e-3 ? outward / across : normalize(cross(uGround.xyz, vec3(0.31, 0.57, 0.76)));
  return onGround + away * (-height * 0.9) + uGround.xyz * 0.15;
}

void main() {
  int id = gl_VertexID;
  bool plume = id < ${PLUME_PARTICLES};
  int index = plume ? id : (id - ${PLUME_PARTICLES}) % ${JET_PARTICLES_PER_POD};
  int pod = plume ? -1 : (id - ${PLUME_PARTICLES}) / ${JET_PARTICLES_PER_POD};
  float seed = float(id) * 1.618;
  float rate = (plume ? ${CROSSINGS_PER_SECOND.plume.toFixed(1)} : ${CROSSINGS_PER_SECOND.jet.toFixed(1)}) * (0.8 + 0.4 * hash(seed + 0.3));
  float run = uSeconds * rate + hash(seed);
  float age = fract(run);
  float cycle = floor(run);
  vec2 r = vec2(hash(seed + cycle * 7.13), hash(seed * 3.7 + cycle * 1.91));
  float strength;
  vec3 axisStart;
  vec3 axis;
  float reach;
  float spread;
  if (plume) {
    strength = uNozzleCount > 0 ? uPlume : 0.0;
    axis = vec3(0.0, 0.0, -1.0);
    float ring = 2.0 * PI * hash(seed + cycle * 4.3);
    vec4 exit = uNozzles[index % max(uNozzleCount, 1)];
    axisStart = exit.xyz + vec3(cos(ring), sin(ring), 0.0) * exit.w * sqrt(hash(seed + cycle * 5.9));
    reach = ${PLUME_METRES.toFixed(1)} * sqrt(uPlume);
    spread = ${SPREAD_RADIANS.plume.toFixed(2)};
  } else {
    float podAngle = ${POD_FIRST_ANGLE.toFixed(4)} + float(pod) * PI * 0.5;
    vec3 radial = vec3(cos(podAngle), sin(podAngle), 0.0);
    strength = uJet.w * clamp(max(dot(radial, uJet.xyz), 0.0) + max(uJet.z, 0.0), 0.0, 1.0);
    axis = uJet.xyz;
    axisStart = radial * uPods.x + vec3(0.0, 0.0, uPods.y);
    reach = ${JET_METRES.toFixed(1)};
    spread = ${SPREAD_RADIANS.jet.toFixed(2)};
  }
  bool lit = hash(seed * 1.3 + cycle * 2.7) < strength;
  vec3 place = axisStart + coneDirection(axis, spread, r) * age * reach;
  place = spreadOverGround(place, axisStart, axis);
  vec3 seen = uOffset + uToCamera * place;
  vSeenZ = seen.z;
  float fade = (1.0 - age) * (1.0 - age);
  vColour = plume
    ? mix(vec3(1.0, 0.92, 0.7), vec3(1.0, 0.42, 0.12), smoothstep(0.0, 0.45, age)) * fade * 0.32
    : vec3(0.75, 0.82, 0.9) * fade * 0.3;
  float sizeMetres = plume ? 0.3 + 1.6 * age : 0.2 + 0.8 * age;
  float depth = (uPlanes.y * (seen.z - uPlanes.x)) / (uPlanes.y - uPlanes.x);
  gl_Position = lit && seen.z > 0.0 ? vec4(seen.xy / uTanHalf, 2.0 * depth - seen.z, seen.z) : vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = clamp(sizeMetres / max(seen.z, 0.01) / uPixelAngle, 1.5, 96.0);
}`;

const EXHAUST_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
in float vSeenZ;
uniform sampler2D uGroundDepth;
uniform float uGroundOn;
out vec4 outColour;

bool behindGround() {
  if (uGroundOn < 0.5) return false;
  float ground = texelFetch(uGroundDepth, ivec2(gl_FragCoord.xy), 0).r;
  float depth = log2(max(vSeenZ, ${NEAREST_SEEN_METRES} * 0.5) / ${NEAREST_SEEN_METRES}) / log2(${FARTHEST_SEEN_METRES.toFixed(1)} / ${NEAREST_SEEN_METRES});
  return ground < depth;
}

void main() {
  vec2 fromMiddle = gl_PointCoord * 2.0 - 1.0;
  float soft = max(0.0, 1.0 - dot(fromMiddle, fromMiddle));
  if (soft <= 0.0 || behindGround()) discard;
  outColour = vec4(vColour * soft * soft, 0.0);
}`;

export function exhaustOf({ pushInModel, groundUpInModel, groundMetres, nozzles, pods }) {
  const [x, y, z] = pushInModel;
  const plume = Math.min(1, Math.max(0, z));
  const sideways = [-x, -y, -Math.min(0, z)];
  const jet = Math.min(1, Math.hypot(...sideways));
  if (!plume && !jet) return null;
  return {
    plume,
    jet: jet ? [...sideways.map((value) => value / jet), jet] : [0, 0, 1, 0],
    ground: groundUpInModel ? [...groundUpInModel, groundMetres] : [0, 0, 1, 1e6],
    nozzles: Float32Array.from({ length: MOST_NOZZLES * 4 }, (_, k) => nozzles[Math.floor(k / 4)]?.[k % 4] ?? 0),
    nozzleCount: Math.min(MOST_NOZZLES, nozzles.length),
    pods,
    seconds: (performance.now() / 1000) % SECONDS_WRAP,
  };
}

export function createExhaustView(gl, emptyVao) {
  let program = null;

  function draw(exhaust, { toCamera, offset, planes, view, groundOn, depthUnit }) {
    program ??= createProgram(gl, EXHAUST_VERTEX, EXHAUST_FRAGMENT);
    gl.useProgram(program.program);
    gl.uniformMatrix3fv(program.uniforms.uToCamera, false, toCamera);
    setUniforms(gl, program, {
      uOffset: offset,
      uTanHalf: view.tanHalf,
      uPlanes: planes,
      uPixelAngle: view.pixelAngle,
      uSeconds: exhaust.seconds,
      uPlume: exhaust.plume,
      uJet: exhaust.jet,
      uGround: exhaust.ground,
      uGroundOn: groundOn ? 1 : 0,
      uNozzleCount: { int: exhaust.nozzleCount },
      uPods: exhaust.pods,
    });
    gl.uniform4fv(program.uniforms.uNozzles, exhaust.nozzles);
    gl.uniform1i(program.uniforms.uGroundDepth, depthUnit);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.POINTS, 0, PARTICLES);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
  }

  return { draw };
}
