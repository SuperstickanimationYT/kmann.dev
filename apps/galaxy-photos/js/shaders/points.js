import { NOISE } from './noise.js';

const QUAD_CORNER = `
vec2 quadCorner() {
  return vec2(gl_VertexID & 1, gl_VertexID >> 1) * 2.0 - 1.0;
}

vec4 toClip(vec2 pixel) {
  return vec4(pixel / uResolution * 2.0 - 1.0, 0.0, 1.0);
}
`;

const PSF = `
uniform float uPsfSigma;
uniform float uHaloRadius;
uniform float uHaloFraction;

const vec3 WAVELENGTH = vec3(1.22, 1.0, 0.8);

vec3 psfCore(vec2 offset) {
  vec3 sigma = uPsfSigma * mix(vec3(1.0), WAVELENGTH, 0.35);
  vec3 core = exp(-dot(offset, offset) / (2.0 * sigma * sigma)) / (6.2831853 * sigma * sigma);
  vec3 haloRadius = uHaloRadius * WAVELENGTH;
  vec3 haloSpread = 1.0 + dot(offset, offset) / (haloRadius * haloRadius);
  vec3 halo = 1.0 / (haloSpread * haloSpread * 3.1415927 * haloRadius * haloRadius);
  return (1.0 - uHaloFraction) * core + uHaloFraction * halo;
}
`;

export const STAR_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPlace;
layout(location = 1) in float aFlux;
layout(location = 2) in vec3 aColour;

uniform vec2 uResolution;
uniform float uPsfSigma;
uniform float uHaloRadius;
uniform float uHaloFraction;
uniform float uSpikeLength;
uniform float uSpikeStrength;
uniform float uFluxScale;

out vec2 vOffset;
out float vFlux;
out vec3 vColour;

${QUAD_CORNER}

void main() {
  const float faintest = 0.002;
  float flux = aFlux * uFluxScale;
  float spikeReach = uSpikeStrength > 0.0 ? uSpikeLength * sqrt(flux * uSpikeStrength / faintest) : 0.0;
  float haloReach = uHaloRadius * pow(flux * uHaloFraction / (faintest * 3.1415927 * uHaloRadius * uHaloRadius), 0.25);
  float extent = min(max(max(5.0 * uPsfSigma, spikeReach), haloReach) * 1.3, 0.7 * uResolution.y);
  vec2 centre = (aPlace * uResolution.y) + 0.5 * uResolution;
  vOffset = quadCorner() * extent;
  vFlux = flux;
  vColour = aColour;
  gl_Position = toClip(centre + vOffset);
}
`;

export const STAR_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vOffset;
in float vFlux;
in vec3 vColour;
out vec4 outColour;

uniform float uSpikeLength;
uniform float uSpikeWidth;
uniform float uSpikeStrength;
uniform float uSpikeDirections;
uniform float uSpikeRoll;
uniform float uCrossbarStrength;

${PSF}

vec3 spike(vec2 offset, float angle) {
  vec2 along = vec2(cos(angle), sin(angle));
  float distanceAlong = abs(dot(offset, along));
  float distanceAcross = dot(offset, vec2(-along.y, along.x));
  vec3 width = uSpikeWidth * WAVELENGTH;
  vec3 reach = uSpikeLength * WAVELENGTH;
  vec3 falloff = 1.0 / pow(1.0 + distanceAlong / reach, vec3(2.0));
  vec3 ripple = 0.8 + 0.2 * cos(distanceAlong / (WAVELENGTH * 1.7));
  return exp(-distanceAcross * distanceAcross / (2.0 * width * width)) * falloff * ripple / (reach * width * 5.0);
}

void main() {
  vec3 light = psfCore(vOffset);
  if (uSpikeStrength > 0.0) {
    vec3 spikes = vec3(0.0);
    for (float i = 0.0; i < 3.0; i++) {
      if (i >= uSpikeDirections) break;
      spikes += spike(vOffset, uSpikeRoll + i * 3.1415927 / uSpikeDirections);
    }
    spikes += uCrossbarStrength * spike(vOffset, uSpikeRoll + 3.1415927 / 2.0);
    light += uSpikeStrength * spikes;
  }
  outColour = vec4(vColour * vFlux * light, 1.0);
}
`;

export const SPECKLE_VERTEX = `#version 300 es
precision highp float;
precision highp int;

uniform vec2 uResolution;
uniform sampler2D uLight;
uniform uint uSeed;
uniform float uSpeckleCount;
uniform float uYoungShare;
uniform float uOldShare;
uniform float uPsfSigma;

out vec2 vOffset;
out float vFlux;
out vec3 vColour;

${NOISE}
${QUAD_CORNER}

void main() {
  uint id = uint(gl_InstanceID);
  uint h = hashUint(id + hashUint(uSeed));
  vec2 place = vec2(unitFrom(h), unitFrom(hashUint(h + 1u)));
  bool young = (h & 1u) == 1u;
  float tail = pow(max(unitFrom(hashUint(h + 2u)), 1e-4), -0.62) * 0.38;
  vec4 light = texture(uLight, place);
  float pixelsPerStar = uResolution.x * uResolution.y / (uSpeckleCount * 0.5);
  float oldLight = max(dot(light.rgb, vec3(0.333)) - light.a, 0.0);
  vFlux = young
    ? uYoungShare * light.a * pixelsPerStar * tail
    : uOldShare * oldLight * pixelsPerStar * tail;
  vColour = young ? vec3(0.68, 0.8, 1.0) : vec3(1.0, 0.72, 0.48);
  float extent = vFlux > 0.0 ? 4.0 * uPsfSigma : 0.0;
  vOffset = quadCorner() * extent;
  gl_Position = toClip(place * uResolution + vOffset);
}
`;

export const SPECKLE_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vOffset;
in float vFlux;
in vec3 vColour;
out vec4 outColour;

${PSF}

void main() {
  outColour = vec4(vColour * vFlux * psfCore(vOffset), 1.0);
}
`;

export const BLOB_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPlace;
layout(location = 1) in float aFlux;
layout(location = 2) in vec3 aColour;
layout(location = 3) in vec4 aShape;
layout(location = 4) in vec4 aDetail;

uniform vec2 uResolution;
uniform float uFluxScale;
uniform float uPsfSigma;

out vec2 vOffset;
out float vFlux;
out vec3 vColour;
out vec4 vShape;
out vec4 vDetail;

${QUAD_CORNER}

void main() {
  float index = aShape.w;
  float concentration = pow(2.0 * index - 0.327, index);
  float halfLight = aShape.x * uResolution.y * concentration;
  float psfHalfLight = 1.18 * uPsfSigma;
  float seenHalfLight = sqrt(halfLight * halfLight + psfHalfLight * psfHalfLight);
  float minorHalfLight = halfLight * aShape.y;
  float seenAxisRatio = sqrt(minorHalfLight * minorHalfLight + psfHalfLight * psfHalfLight) / seenHalfLight;
  float scale = seenHalfLight / concentration;
  float extent = scale * pow(9.0, index) + 2.0;
  vec2 centre = aPlace * uResolution.y + 0.5 * uResolution;
  vOffset = quadCorner() * extent;
  vFlux = aFlux * uFluxScale;
  vColour = aColour;
  vShape = vec4(scale, seenAxisRatio, aShape.z, index);
  vDetail = vec4(aDetail.x * smoothstep(3.0, 8.0, seenHalfLight), aDetail.yzw);
  gl_Position = toClip(centre + vOffset);
}
`;

export const BLOB_FRAGMENT = `#version 300 es
precision highp float;

in vec2 vOffset;
in float vFlux;
in vec3 vColour;
in vec4 vShape;
in vec4 vDetail;
out vec4 outColour;

uniform float uPsfSigma;

const vec3 BULGE_COLOUR = vec3(1.0, 0.8, 0.58);

void main() {
  float scale = vShape.x;
  float axisRatio = vShape.y;
  float angle = vShape.z;
  float index = vShape.w;
  float armAmount = vDetail.x;
  float bulgeShare = vDetail.y;
  float twist = vDetail.z;
  float armAngle = vDetail.w;

  vec2 along = vec2(cos(angle), sin(angle));
  vec2 local = vec2(dot(vOffset, along), dot(vOffset, vec2(-along.y, along.x)) / axisRatio);
  float radius = length(local) / scale;
  float gammaTwoN = index < 1.5 ? 1.0 : index < 3.0 ? 6.0 : 5040.0;
  float diskTotal = 6.2831853 * axisRatio * scale * scale * index * gammaTwoN;
  float disk = exp(-pow(radius, 1.0 / index)) / diskTotal;

  float arms = 1.0 + armAmount * cos(2.0 * atan(local.y, local.x) - twist * log(radius + 0.3) + armAngle) * smoothstep(0.3, 1.2, radius);
  float bulgeSigma = max(0.45 * scale, uPsfSigma);
  float bulge = exp(-dot(local, local) / (2.0 * bulgeSigma * bulgeSigma)) / (6.2831853 * axisRatio * bulgeSigma * bulgeSigma);

  vec3 light = vColour * (1.0 - bulgeShare) * disk * max(arms, 0.0) + BULGE_COLOUR * bulgeShare * bulge;
  outColour = vec4(vFlux * light, 1.0);
}
`;
