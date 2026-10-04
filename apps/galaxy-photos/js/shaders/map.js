import { NOISE } from './noise.js';

export const FULLSCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const MAP_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
layout(location = 0) out vec4 outDisk;
layout(location = 1) out vec4 outDetail;

uniform float uRmax;
uniform uint uSeed;
uniform float uArms;
uniform float uPitch;
uniform float uArmContrast;
uniform float uFlocculence;
uniform float uBarLength;
uniform float uDiskScale;
uniform float uYoung;
uniform float uGas;
uniform float uDust;

${NOISE}

mat2 turn(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, s, -s, c);
}

float armProfile(float phase, float centre, float sharpness) {
  return pow(0.5 + 0.5 * cos(phase - centre), sharpness);
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uRmax;
  float r = max(length(p), 1e-3);
  float theta = atan(p.y, p.x);
  float armStart = max(uBarLength, 0.6 * uDiskScale * 0.5);

  float logRadius = log(max(r, 0.15) / armStart);
  float pitchDrift = 0.4 * fbm(vec2(logRadius * 1.2, 3.1), uSeed + 17u, 3);
  float winding = logRadius / tan(uPitch) + pitchDrift;
  vec2 unwound = turn(-winding) * p;
  vec2 unwoundWarped = unwound + 1.1 * vec2(fbm(p * 0.45, uSeed + 15u, 3), fbm(p * 0.45, uSeed + 16u, 3));
  float featherWinding = log(max(r, 0.15) / armStart) / tan(min(uPitch * 2.6, 1.25));
  vec2 featherUnwound = turn(-featherWinding) * p;

  vec2 warpedP = p + 1.2 * vec2(fbm(p * 0.09, uSeed + 11u, 3), fbm(p * 0.09, uSeed + 12u, 3));
  float armWobble = 0.55 * fbm(warpedP * 0.07, uSeed + 13u, 3) * (0.4 + uFlocculence) + 0.4 * fbm(warpedP * 0.17, uSeed + 18u, 3) + 0.2 * fbm(warpedP * 0.35, uSeed + 14u, 3) * (0.5 + uFlocculence);
  float phase = uArms * (theta - winding + armWobble);

  float alongArm = fbm(unwound * 0.16, uSeed + 21u, 4);
  float armStrength = smoothstep(-0.35, 0.3, alongArm);
  float sharpness = mix(1.5, 9.0, uArmContrast);

  float branchPhase = uArms * (theta - winding * 1.3 + armWobble) + 1.7;
  float branchStrength = smoothstep(0.25, 0.55, fbm(unwound * 0.2, uSeed + 23u, 3)) * 0.4;

  float grandYoung = armProfile(phase, -0.35, sharpness * 0.8) * armStrength + armProfile(branchPhase, -0.35, sharpness) * branchStrength;
  float grandGas = armProfile(phase, -0.15, sharpness * 1.6) * armStrength + armProfile(branchPhase, -0.15, sharpness * 1.8) * branchStrength;
  float grandDust = armProfile(phase, 0.28, sharpness * 2.2) * armStrength + armProfile(branchPhase, 0.32, sharpness * 2.4) * branchStrength;

  float fragments = 0.7 * fbm(unwoundWarped * 0.42 + 0.8 * vec2(alongArm), uSeed + 31u, 3) + 0.5 * fbm(warpedP * 1.3, uSeed + 33u, 3);
  float floccYoung = smoothstep(-0.15, 0.45, fragments);
  float floccGas = smoothstep(0.05, 0.5, fragments);
  float floccDust = smoothstep(-0.05, 0.3, fbm(unwoundWarped * 0.42 + vec2(0.35, 0.0) + 0.8 * vec2(alongArm), uSeed + 31u, 3) + 0.25 * fbm(warpedP * 1.3, uSeed + 35u, 3));

  float youngArms = mix(grandYoung, floccYoung, uFlocculence);
  float gasArms = mix(grandGas, floccGas, uFlocculence);
  float dustArms = mix(grandDust, floccDust, uFlocculence);

  float outerEdge = 1.0 - smoothstep(uRmax * 0.62, uRmax * 0.95, r);
  float youngOuterEdge = 1.0 - smoothstep(uRmax * 0.4, uRmax * 0.8, r);
  float innerDust = smoothstep(armStart * 0.85, armStart * 1.2, r);

  float innerYoung = smoothstep(armStart * 0.8, armStart * 1.3, r);
  float oldModulation = 1.0 + 0.7 * uArmContrast * (armProfile(phase, -0.1, 2.0) - 0.4) * (1.0 - uFlocculence * 0.6) * innerYoung;
  float oldGrain = 0.93 + 0.14 * smoothstep(-0.5, 0.5, fbm(warpedP * 2.0, uSeed + 43u, 4));
  float oldDisk = exp(-r / uDiskScale) * oldModulation * oldGrain * outerEdge;

  float mottle = 0.5 + 1.0 * smoothstep(-0.4, 0.5, fbm(warpedP * 1.6, uSeed + 41u, 4));
  float young = uYoung * exp(-r / (uDiskScale * 1.25)) * innerYoung * youngOuterEdge * (0.08 + youngArms) * mottle;

  float complexes = clumps(p, 0.55, 0.4, 2.0, uSeed + 51u);
  float knots = clumps(p, 0.16, 0.4, 3.0, uSeed + 53u);
  float gasMask = smoothstep(0.08, 0.6, gasArms + 0.25 * fbm(warpedP * 0.5, uSeed + 55u, 3));
  float gas = uGas * exp(-r / (uDiskScale * 1.3)) * innerYoung * youngOuterEdge * gasMask * complexes * knots * 16.0;

  float clusters = uYoung * clumps(p, 0.09, 0.22, 7.0, uSeed + 61u) * smoothstep(0.04, 0.5, youngArms) * innerYoung * youngOuterEdge * exp(-r / (uDiskScale * 1.4));

  float filaments = ridged(warpedP * 0.75, uSeed + 71u, 5);
  float holes = smoothstep(-0.25, 0.25, fbm(warpedP * 0.5, uSeed + 73u, 4));
  float feathers = pow(ridged(featherUnwound * 0.5, uSeed + 75u, 3), 3.0) * armProfile(phase, -0.9, 1.5) * (1.0 - uFlocculence * 0.7);

  vec2 barFrame = p;
  float barLaneSide = barFrame.y + sign(barFrame.x) * (0.12 + 0.1 * abs(barFrame.x) / max(uBarLength, 1e-3)) * uBarLength + 0.06 * uBarLength * fbm(p * 1.2, uSeed + 85u, 3);
  float barLanes = uBarLength > 0.0
    ? exp(-barLaneSide * barLaneSide / (0.004 * uBarLength * uBarLength)) * smoothstep(-0.3, 0.2, fbm(p * 2.0, uSeed + 87u, 3)) * (1.0 - smoothstep(uBarLength * 0.7, uBarLength * 1.15, abs(barFrame.x))) * smoothstep(0.08, 0.35, abs(barFrame.x) / uBarLength)
    : 0.0;
  float nuclearDust = exp(-r / (armStart * 0.35)) * smoothstep(0.05, 0.45, fbm(warpedP * 1.8, uSeed + 77u, 4));

  float dustArmsTotal = 0.12 + dustArms + 0.6 * feathers;
  float dust = uDust * exp(-r / (uDiskScale * 1.5)) * innerDust * outerEdge * dustArmsTotal * mix(0.35, 1.6, filaments) * mix(0.55, 1.0, holes);
  dust += uDust * (1.4 * barLanes + 0.25 * nuclearDust * (1.0 - innerDust)) * mix(0.4, 1.4, filaments);

  float extraplanarDust = pow(ridged(warpedP * 0.9, uSeed + 81u, 4), 3.0) * smoothstep(-0.2, 0.3, fbm(p * 0.6, uSeed + 83u, 3));

  outDisk = vec4(oldDisk, young, gas, dust);
  outDetail = vec4(clusters, extraplanarDust, 0.0, 0.0);
}
`;
