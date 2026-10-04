import { NOISE } from './noise.js';

export const FINISH_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 outColour;

uniform sampler2D uLight;
uniform sampler2D uThrough;
uniform sampler2D uBehind;
uniform sampler2D uInFront;
uniform vec2 uResolution;
uniform float uSeeing;
uniform float uExposure;
uniform float uSoftening;
uniform float uNoise;
uniform float uSky;
uniform float uSaturation;
uniform float uMirror;
uniform uint uSeed;

${NOISE}

const int TAPS = 24;

vec3 skyLight(vec2 uv) {
  vec4 light = texture(uLight, uv);
  vec3 through = texture(uThrough, uv).rgb;
  vec3 behind = texture(uBehind, uv).rgb;
  return light.rgb + through * behind;
}

vec3 seen(vec2 uv) {
  if (uSeeing < 0.35) return skyLight(uv);
  vec3 total = vec3(0.0);
  float weights = 0.0;
  for (int i = 0; i < TAPS; i++) {
    float radius = sqrt((float(i) + 0.5) / float(TAPS)) * 2.6 * uSeeing;
    float angle = float(i) * 2.3999632;
    vec2 offset = radius * vec2(cos(angle), sin(angle));
    float weight = exp(-radius * radius / (2.0 * uSeeing * uSeeing));
    total += weight * skyLight(uv + offset / uResolution);
    weights += weight;
  }
  return total / weights;
}

float gaussian(ivec2 pixel, uint channel) {
  float u1 = max(hashCell1(pixel, uSeed + channel * 7919u), 1e-7);
  float u2 = hashCell1(pixel, uSeed + channel * 7919u + 3u);
  return sqrt(-2.0 * log(u1)) * cos(6.2831853 * u2);
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec2 uv = uMirror > 0.5 ? vec2(1.0 - vUv.x, vUv.y) : vUv;
  vec3 linear = seen(uv) + texture(uInFront, uv).rgb;
  linear = linear * uExposure + uSky * vec3(0.92, 0.96, 1.0);

  float shared = gaussian(pixel, 0u);
  vec3 grain = vec3(gaussian(pixel, 1u), gaussian(pixel, 2u), gaussian(pixel, 3u));
  grain = mix(grain, vec3(shared), 0.75);
  linear += uNoise * grain * sqrt(0.00008 + 0.0012 * max(linear, 0.0));

  float intensity = max(dot(linear, vec3(0.3333)), 1e-6);
  vec3 stretched = linear * asinh(uSoftening * intensity) / (asinh(uSoftening) * intensity);
  stretched = max(stretched - 0.02, 0.0) * 1.02;

  float grey = dot(stretched, vec3(0.2126, 0.7152, 0.0722));
  stretched = max(mix(vec3(grey), stretched, uSaturation), 0.0);

  float peak = max(max(stretched.r, stretched.g), stretched.b);
  float shoulder = (1.0 - exp(-1.4 * peak)) / max(peak, 1e-6);
  vec3 colour = mix(stretched * shoulder, vec3(1.0), smoothstep(1.2, 5.0, peak) * 0.85);

  outColour = vec4(clamp(colour, 0.0, 1.0), 1.0);
}
`;
