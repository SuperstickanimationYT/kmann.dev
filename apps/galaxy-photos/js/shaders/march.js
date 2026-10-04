export const MARCH_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

layout(location = 0) out vec4 outLight;
layout(location = 1) out vec4 outThrough;

uniform sampler2D uDisk;
uniform sampler2D uDetail;
uniform vec2 uResolution;
uniform float uFieldHeight;
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

const vec3 OLD_DISK_COLOUR = vec3(1.0, 0.88, 0.76);
const vec3 BULGE_COLOUR = vec3(1.0, 0.82, 0.64);
const vec3 YOUNG_COLOUR = vec3(0.6, 0.75, 1.0);
const vec3 GAS_COLOUR = vec3(1.0, 0.3, 0.52);
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
  vec2 screen = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uFieldHeight;
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

  float oldHeight = uThickness;
  float youngHeight = uThickness * 0.3;
  float dustHeight = uThickness * 0.5;

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

    float oldShape = 0.82 * sech2(p.z / oldHeight) / (2.0 * oldHeight) + 0.18 * sech2(p.z / (3.2 * oldHeight)) / (6.4 * oldHeight);
    float youngShape = sech2(p.z / youngHeight) / (2.0 * youngHeight);
    float chimneyHeight = dustHeight * (0.7 + 2.2 * detail.g);
    float dustShape = exp(-abs(p.z) / chimneyHeight) / (2.0 * dustHeight);

    vec3 emission = OLD_DISK_COLOUR * (uDiskLight * disk.r * oldShape)
      + YOUNG_COLOUR * (uYoungLight * disk.g * youngShape)
      + GAS_COLOUR * (uGasLight * disk.b * youngShape)
      + CLUSTER_COLOUR * (uClusterLight * detail.r * youngShape)
      + BULGE_COLOUR * (uBulgeLight * sersicDensity(p) + uBarLight * barDensity(p))
      + BULGE_COLOUR * uNucleusLight * exp(-dot(p, p) / 0.0016);

    float youngEmission = uYoungLight * disk.g * youngShape + uClusterLight * detail.r * youngShape;
    float tau = uDustOpacity * disk.a * dustShape * ds;
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
