import { NOISE } from './noise.js';

export const MERGER_MAP_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
layout(location = 0) out vec4 outDisk;
layout(location = 1) out vec4 outDetail;

uniform sampler2D uStarLight;
uniform sampler2D uMembers;
uniform float uRmax;
uniform uint uSeed;
uniform float uArms;
uniform float uPitch;
uniform float uArmContrast;
uniform float uArmTurn;
uniform float uYoung;
uniform float uGas;
uniform float uDust;
uniform float uSharpDensity;
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

vec4 spiralArms(vec2 p, vec2 core, float spin, uint seed) {
  vec2 q = turn(spin * uArmTurn) * (p - core);
  q.y *= spin;
  float r = max(length(q), 0.15);
  float theta = atan(q.y, q.x);
  float logRadius = log(r / 1.5);
  float winding = logRadius / tan(uPitch) + 0.4 * fbm(vec2(logRadius * 1.2, 3.1), seed + 17u, 3);
  vec2 warped = q + 1.2 * vec2(fbm(q * 0.09, seed + 11u, 3), fbm(q * 0.09, seed + 12u, 3));
  float wobble = 0.55 * fbm(warped * 0.07, seed + 13u, 3) + 0.4 * fbm(warped * 0.17, seed + 18u, 3) + 0.2 * fbm(warped * 0.35, seed + 14u, 3);
  float phase = uArms * (theta - winding + wobble);
  float alongArm = smoothstep(-0.35, 0.3, fbm(turn(-winding) * q * 0.16, seed + 21u, 4));
  float sharpness = mix(1.5, 9.0, uArmContrast);
  float pastBulge = smoothstep(1.2, 2.0, r);
  return vec4(
    armProfile(phase, -0.35, sharpness * 0.8) * alongArm * pastBulge,
    armProfile(phase, -0.15, sharpness * 1.6) * alongArm * pastBulge,
    armProfile(phase, 0.28, sharpness * 2.2) * alongArm * pastBulge,
    1.0 + 0.7 * uArmContrast * (armProfile(phase, -0.1, 2.0) - 0.4) * pastBulge
  );
}

struct Texture {
  float mottle;
  float oldGrain;
  float gasNoise;
  float complexes;
  float knots;
  float clusterClumps;
  float filaments;
  float holes;
  float extraplanar;
};

Texture textureIn(vec2 q, uint seed) {
  vec2 warped = q + 1.2 * vec2(fbm(q * 0.09, seed + 11u, 3), fbm(q * 0.09, seed + 12u, 3));
  return Texture(
    0.5 + 1.0 * smoothstep(-0.4, 0.5, fbm(warped * 1.6, seed + 41u, 4)),
    0.93 + 0.14 * smoothstep(-0.5, 0.5, fbm(warped * 2.0, seed + 43u, 4)),
    fbm(warped * 0.5, seed + 55u, 3),
    clumps(q, 0.55, 0.4, 2.0, seed + 51u),
    clumps(q, 0.16, 0.4, 3.0, seed + 53u),
    clumps(q, 0.09, 0.22, 7.0, seed + 61u),
    ridged(warped * 0.75, seed + 71u, 5),
    smoothstep(-0.25, 0.25, fbm(warped * 0.5, seed + 73u, 4)),
    pow(ridged(warped * 0.9, seed + 81u, 4), 3.0) * smoothstep(-0.2, 0.3, fbm(q * 0.6, seed + 83u, 3))
  );
}

Texture textureFollowing(vec2 p, float shareA) {
  Texture b = textureIn(turn(-uArmTurn) * (p - uCoreB), uSeed + 500u);
  Texture a = textureIn(turn(uArmTurn) * (p - uCoreA), uSeed);
  return Texture(
    mix(b.mottle, a.mottle, shareA),
    mix(b.oldGrain, a.oldGrain, shareA),
    mix(b.gasNoise, a.gasNoise, shareA),
    mix(b.complexes, a.complexes, shareA),
    mix(b.knots, a.knots, shareA),
    mix(b.clusterClumps, a.clusterClumps, shareA),
    mix(b.filaments, a.filaments, shareA),
    mix(b.holes, a.holes, shareA),
    mix(b.extraplanar, a.extraplanar, shareA)
  );
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uRmax;
  vec4 stars = texture(uStarLight, vUv);
  vec2 members = texture(uMembers, vUv).rg;

  float sharp = clamp(stars.g / uSharpDensity, 0.0, 1.0);
  float sparse = clamp(stars.g / (0.3 * uSharpDensity), 0.0, 1.0);
  float surface = mix(mix(stars.b, stars.g, sparse), stars.r, sharp);
  float crowded = smoothstep(0.3, 1.0, stars.g / uSharpDensity);
  float crowding = clamp(stars.g / max(stars.b, 1e-4) - 1.0, 0.0, 2.0) * crowded;

  float shareA = members.r / max(members.r + members.g, 1e-6);
  float cold = mix(uColdB, uColdA, shareA);
  vec4 arms = mix(spiralArms(p, uCoreB, -1.0, uSeed + 500u), spiralArms(p, uCoreA, 1.0, uSeed), shareA);
  vec3 coldArms = arms.rgb * cold;
  float armLight = mix(1.0, arms.a, cold);

  Texture look = textureFollowing(p, shareA);
  float formingStars = pow(stars.g, 0.8) * cold * crowded;

  float young = uYoung * formingStars * (0.08 + crowding + coldArms.r) * look.mottle;
  float gasMask = smoothstep(0.08, 0.6, 0.8 * crowding + coldArms.g + 0.25 * look.gasNoise);
  float gas = uGas * formingStars * gasMask * look.complexes * look.knots * 16.0;
  float clusters = uYoung * look.clusterClumps * smoothstep(0.04, 0.5, crowding + coldArms.r) * formingStars;
  float dust = uDust * pow(stars.g, 0.7) * cold * crowded * (0.12 + crowding + coldArms.b) * mix(0.35, 1.6, look.filaments) * mix(0.55, 1.0, look.holes);

  outDisk = vec4(surface * look.oldGrain * armLight, young, gas, dust);
  outDetail = vec4(clusters, look.extraplanar, stars.a, shareA);
}
`;
