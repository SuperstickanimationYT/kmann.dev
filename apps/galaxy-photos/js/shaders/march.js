import { FINE_TILE_KPC } from './fine.js';

export const MARCH_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) out vec4 outLight;
layout(location = 1) out vec4 outThrough;

uniform sampler2D uDisk;
uniform sampler2D uDetail;
uniform vec2 uResolution;
uniform float uFieldHeight;
uniform vec2 uCentre;
uniform float uInclination;
uniform float uPositionAngle;
uniform float uRmax;
uniform float uZmax;
uniform float uSteps;

uniform float uDiskLight;
uniform float uYoungLight;
uniform float uGasLight;
uniform float uClusterLight;
uniform float uThickness;
uniform float uDustOpacity;

uniform float uBulgeLight;
uniform float uBulgeRadius;
uniform float uBulgeFlattening;
uniform float uBulgeIndex;
uniform float uBarLight;
uniform float uBarLength;
uniform float uNucleusLight;
uniform vec2 uCoreA;
uniform vec2 uCoreB;
uniform sampler2D uFine;
uniform float uFineLod;
uniform vec2 uFineShift;

const float FINE_TILE = ${FINE_TILE_KPC.toFixed(3)};
const mat2 FINE_TURN = mat2(0.6, -0.8, 0.8, 0.6) * 2.37;

const vec3 OLD_DISK_COLOUR = vec3(1.0, 0.97, 0.94);
const vec3 BULGE_COLOUR = vec3(1.0, 0.9, 0.8);
const vec3 YOUNG_COLOUR = vec3(0.55, 0.72, 1.0);
const vec3 GAS_COLOUR = vec3(1.0, 0.42, 0.6);
const vec3 CLUSTER_COLOUR = vec3(0.72, 0.84, 1.0);
const vec3 REDDENING = vec3(0.84, 1.0, 1.2);

float sech2(float x) {
  float c = cosh(clamp(x, -20.0, 20.0));
  return 1.0 / (c * c);
}

float sersicDensity(vec3 p) {
  float s = length(vec3(p.xy, p.z / uBulgeFlattening)) / uBulgeRadius;
  s = max(s, 0.012);
  float n = uBulgeIndex;
  float b = 2.0 * n - 0.327;
  float cusp = 1.0 - 0.6097 / n + 0.05463 / (n * n);
  return pow(s, -cusp) * exp(-b * (pow(s, 1.0 / n) - 1.0));
}

float bulgesDensity(vec3 p) {
  return 0.5 * (sersicDensity(p - vec3(uCoreA, 0.0)) + sersicDensity(p - vec3(uCoreB, 0.0)));
}

float nucleiDensity(vec3 p) {
  vec3 fromA = p - vec3(uCoreA, 0.0);
  vec3 fromB = p - vec3(uCoreB, 0.0);
  return 0.5 * (exp(-dot(fromA, fromA) / 0.0016) + exp(-dot(fromB, fromB) / 0.0016));
}

float barDensity(vec3 p) {
  if (uBarLength <= 0.0) return 0.0;
  vec3 scaled = p / vec3(uBarLength, uBarLength * 0.3, uBarLength * 0.2);
  float s2 = dot(scaled, scaled);
  return exp(-pow(s2, 0.9) * 3.0);
}

float interleavedGradient(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec2 screen = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uFieldHeight - uCentre;
  float ca = cos(uPositionAngle);
  float sa = sin(uPositionAngle);
  vec2 sky = vec2(ca * screen.x - sa * screen.y, sa * screen.x + ca * screen.y);

  float ci = cos(uInclination);
  float si = sin(uInclination);
  vec3 origin = vec3(sky.x, sky.y * ci, sky.y * si);
  vec3 direction = vec3(0.0, si, -ci);

  float closest = -dot(origin, direction);
  float reach = uRmax * uRmax - dot(origin, origin) + closest * closest;
  if (reach <= 0.0) {
    outLight = vec4(0.0);
    outThrough = vec4(1.0);
    return;
  }
  float halfChord = sqrt(reach);
  float tNear = closest - halfChord;
  float tFar = closest + halfChord;
  if (abs(direction.z) > 1e-4) {
    float ta = (uZmax - origin.z) / direction.z;
    float tb = (-uZmax - origin.z) / direction.z;
    tNear = max(tNear, min(ta, tb));
    tFar = min(tFar, max(ta, tb));
  } else if (abs(origin.z) > uZmax) {
    tFar = tNear;
  }
  if (tFar <= tNear) {
    outLight = vec4(0.0);
    outThrough = vec4(1.0);
    return;
  }

  float midplane = abs(direction.z) > 1e-4 ? -origin.z / direction.z : closest;
  float focus = clamp(mix(closest, midplane, smoothstep(0.05, 0.25, abs(direction.z))), tNear, tFar);
  float spread = clamp(0.35 * uThickness / max(abs(direction.z), 0.02), 0.04, max((tFar - tNear) * 0.25, 0.04));
  float xNear = asinh((tNear - focus) / spread);
  float xFar = asinh((tFar - focus) / spread);
  float dx = (xFar - xNear) / uSteps;
  float jitter = interleavedGradient(gl_FragCoord.xy);


  vec3 light = vec3(0.0);
  vec3 through = vec3(1.0);
  float youngSeen = 0.0;

  for (float i = 0.0; i < 512.0; i++) {
    if (i >= uSteps) break;
    float x = xNear + (i + jitter) * dx;
    float t = focus + spread * sinh(x);
    float ds = spread * cosh(x) * dx;
    vec3 p = origin + direction * t;

    vec2 uv = p.xy / (2.0 * uRmax) + 0.5;
    vec4 disk = texture(uDisk, uv);
    vec4 detail = texture(uDetail, uv);
    float oldHeight = detail.b > 0.0 ? detail.b : uThickness;
    float youngHeight = oldHeight * 0.3;
    float dustHeight = oldHeight * 0.45;

    float oldShape = 0.82 * sech2(p.z / oldHeight) / (2.0 * oldHeight) + 0.18 * sech2(p.z / (3.2 * oldHeight)) / (6.4 * oldHeight);
    float youngShape = sech2(p.z / youngHeight) / (2.0 * youngHeight);
    float lift = p.z / dustHeight;
    vec2 driftedPlace = p.xy + dustHeight * (lift * vec2(0.8, -0.5) + lift * abs(lift) * vec2(-0.3, 0.45));
    float filaments = texture(uDetail, driftedPlace / (2.0 * uRmax) + 0.5).g;
    float dustShape = (exp(-abs(lift)) * (0.6 + 0.8 * filaments) + 0.7 * filaments * exp(-abs(lift) / 1.8)) / (2.0 * dustHeight);

    vec2 fineUv = p.xy / FINE_TILE + uFineShift;
    vec2 fineDustUv = driftedPlace / FINE_TILE + uFineShift;
    vec4 fineNear = textureLod(uFine, fineUv, uFineLod);
    vec4 fineFar = textureLod(uFine, FINE_TURN * fineUv, uFineLod + 1.25);
    float dustFine = 0.4 + 1.2 * (0.65 * textureLod(uFine, fineDustUv, uFineLod).r + 0.35 * textureLod(uFine, FINE_TURN * fineDustUv, uFineLod + 1.25).r);
    float youngFine = 0.25 + 1.5 * (0.6 * fineNear.g + 0.4 * fineFar.g);
    float knotFine = 0.35 + 6.0 * (fineNear.b + 0.6 * fineFar.b);
    float oldFine = 0.9 + 0.2 * fineNear.g;

    vec3 emission = OLD_DISK_COLOUR * (uDiskLight * disk.r * oldShape * oldFine)
      + YOUNG_COLOUR * (uYoungLight * disk.g * youngShape * youngFine)
      + GAS_COLOUR * (uGasLight * disk.b * youngShape * knotFine)
      + CLUSTER_COLOUR * (uClusterLight * detail.r * youngShape)
      + BULGE_COLOUR * (uBulgeLight * bulgesDensity(p) + uBarLight * barDensity(p))
      + BULGE_COLOUR * uNucleusLight * nucleiDensity(p);

    float youngEmission = uYoungLight * disk.g * youngShape * youngFine + uClusterLight * detail.r * youngShape;
    float tau = uDustOpacity * disk.a * dustShape * dustFine * ds;
    vec3 stepThrough = exp(-tau * REDDENING);
    vec3 stepFraction = tau > 1e-5 ? (1.0 - stepThrough) / (tau * REDDENING) : vec3(1.0);

    light += through * emission * ds * stepFraction;
    youngSeen += through.g * youngEmission * ds * stepFraction.g;
    through *= stepThrough;
  }

  outLight = vec4(light, youngSeen);
  outThrough = vec4(through, 1.0);
}
`;
