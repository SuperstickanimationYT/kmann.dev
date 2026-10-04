import { NOISE } from './noise.js';

export const FINE_TILE_KPC = 1.2;
export const FINE_SIZE = 1024;

export const FINE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 outFine;

${NOISE}

const float BASE_PERIOD = 8.0;

float periodicNoise(vec2 p, float period, uint seed) {
  vec2 cellFloor = floor(p);
  vec2 f = p - cellFloor;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float corners[4];
  for (int i = 0; i < 4; i++) {
    vec2 offset = vec2(i & 1, i >> 1);
    ivec2 cell = ivec2(mod(cellFloor + offset, period));
    float angle = 6.2831853 * hashCell1(cell, seed);
    corners[i] = dot(vec2(cos(angle), sin(angle)), f - offset);
  }
  return 1.4 * mix(mix(corners[0], corners[1], u.x), mix(corners[2], corners[3], u.x), u.y);
}

float periodicFbm(vec2 uv, uint seed) {
  float total = 0.0;
  float amplitude = 0.5;
  float period = BASE_PERIOD;
  for (int i = 0; i < 5; i++) {
    total += amplitude * periodicNoise(uv * period, period, seed + uint(i) * 101u);
    period *= 2.0;
    amplitude *= 0.55;
  }
  return total;
}

float periodicRidged(vec2 uv, uint seed) {
  float total = 0.0;
  float amplitude = 0.5;
  float period = BASE_PERIOD;
  float weight = 1.0;
  for (int i = 0; i < 5; i++) {
    float ridge = 1.0 - abs(periodicNoise(uv * period, period, seed + uint(i) * 131u));
    ridge *= ridge * weight;
    weight = clamp(ridge * 1.5, 0.0, 1.0);
    total += amplitude * ridge;
    period *= 2.0;
    amplitude *= 0.6;
  }
  return total;
}

float periodicKnots(vec2 uv, float period, uint seed) {
  vec2 g = uv * period;
  vec2 cellFloor = floor(g);
  vec2 f = g - cellFloor;
  float total = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 offset = vec2(i, j);
      ivec2 cell = ivec2(mod(cellFloor + offset, period));
      vec2 toKnot = offset + hashCell2(cell, seed) - f;
      float brightness = pow(hashCell1(cell, seed + 7u), 4.0);
      total += brightness * exp(-dot(toKnot, toKnot) / 0.05);
    }
  }
  return total;
}

void main() {
  vec2 warp = 0.04 * vec2(periodicFbm(vUv, 901u), periodicFbm(vUv + 0.37, 902u));
  float filaments = periodicRidged(vUv + warp, 911u);
  float clumps = 0.5 + 0.9 * periodicFbm(vUv + warp * 0.5, 921u);
  float knots = periodicKnots(vUv, 48.0, 931u);
  outFine = vec4(clamp(filaments * 0.9, 0.0, 1.0), clamp(clumps, 0.0, 1.0), clamp(knots, 0.0, 1.0), 1.0);
}
`;
