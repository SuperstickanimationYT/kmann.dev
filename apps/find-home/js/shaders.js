import { SHADOW_MAP_SIZE } from './ground-patches.js';
import { ANCHOR_METRES, COAST_ROUGHNESS, GROUND_OCTAVES } from './terrain.js';

export const MAX_NEBULAE = 64;
export const MAX_GALAXIES = 4;
export const MAX_BODIES = 12;
export const UNRESOLVED_STEPS = 48;
export const NOISE_SIZE = 64;
export const TABLE_WIDTH = 64;
export const TABLE_ROWS = { oldUnresolved: 0, youngUnresolved: 1, nebulaPlace: 2, nebulaGlow: 3, bulgeUnresolved: 4, armedUnresolved: 5 };
export const UNRESOLVED_NEAREST = 0.1;
export const UNRESOLVED_FARTHEST = 1e6;

export const FULLSCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const BODY_OCCLUDERS = `
uniform vec4 uBodyOccluder[${MAX_BODIES}];
uniform int uBodyCount;

bool behindBody(vec3 direction) {
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    if (uBodyOccluder[i].w > 0.0 && dot(direction, uBodyOccluder[i].xyz) > cos(uBodyOccluder[i].w)) return true;
  }
  return false;
}
`;

const COMMON = `
precision highp float;
precision highp int;

uniform vec3 uCamera;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
uniform float uPixelAngle;
uniform sampler2D uArmMap;
uniform highp sampler3D uNoise;
uniform float uMapHalfWidth;
uniform float uSunRadius;
uniform float uBarAngle;
uniform float uBarSpin;
uniform float uFlatSpeed;
uniform float uRiseScale;
uniform float uSpeedToPcPerYear;
uniform float uYearsPerPc;
uniform vec3 uBulgeScales;
uniform vec3 uLongBarScales;
uniform float uThin;
uniform float uThinLength;
uniform float uThinHeight;
uniform float uThick;
uniform float uThickLength;
uniform float uThickHeight;
uniform float uBulge;
uniform float uLongBar;
uniform float uYoungPerArm;
uniform float uArmedFloor;
uniform float uArmedNormal;
uniform float uYoungHeight;
uniform float uDustPerPc;
uniform float uDustLength;
uniform float uDustHeight;

const vec3 EXTINCTION_BANDS = vec3(0.75, 1.0, 1.32);
const float MAG_TO_TAU = 0.921;

uint hashUint(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

float valueNoise(vec3 p, uint seed) {
  vec3 shift = vec3(float(hashUint(seed) & 1023u), float(hashUint(seed + 1u) & 1023u), float(hashUint(seed + 2u) & 1023u));
  return texture(uNoise, (p + shift) / ${NOISE_SIZE}.0).r;
}

float fbm(vec3 p, uint seed, float octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  float weight = 0.0;
  for (int i = 0; i < 5; i++) {
    float fade = clamp(octaves - float(i), 0.0, 1.0);
    if (fade <= 0.0) break;
    total += fade * amplitude * valueNoise(p, seed + uint(i) * 977u);
    weight += fade * amplitude;
    p = p * 2.07 + vec3(17.1, 3.3, 9.7);
    amplitude *= 0.5;
  }
  return weight > 0.0 ? total / weight : 0.5;
}

float angularSpeed(float radius) {
  return uFlatSpeed * (1.0 - exp(-radius / uRiseScale)) * uSpeedToPcPerYear / max(radius, 50.0);
}

vec3 turnAzimuth(vec3 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec3(p.x * c + p.y * s, -p.x * s + p.y * c, p.z);
}

vec2 armsAt(vec2 xy) {
  vec2 uv = (xy + uMapHalfWidth) / (2.0 * uMapHalfWidth);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
  return texture(uArmMap, uv).rg;
}

float sech2(float x) {
  float c = cosh(min(abs(x), 40.0));
  return 1.0 / (c * c);
}

float barDistance(vec3 p, vec3 scales) {
  float c = cos(uBarAngle);
  float s = sin(uBarAngle);
  float along = p.x * s + p.y * c;
  float across = p.x * c - p.y * s;
  return length(vec3(along / scales.x, across / scales.y, p.z / scales.z));
}

float youngTaper(float radius) {
  return 1.0 / (1.0 + exp(-(radius - 3000.0) / 400.0)) / (1.0 + exp((radius - 15000.0) / 1200.0));
}

struct Matter {
  float disk;
  float armed;
  float bar;
  float young;
  float dust;
};

Matter matterAt(vec3 seen, float delayYears, float footprint) {
  float seenRadius = length(seen.xy);
  vec3 p = turnAzimuth(seen, angularSpeed(seenRadius) * delayYears);
  vec3 barFrame = turnAzimuth(seen, uBarSpin * delayYears);
  float radius = length(p.xy);
  vec2 arms = armsAt(p.xy);
  float arm = arms.x;

  Matter m;
  float outerEdge = 1.0 / (1.0 + exp((radius - 16000.0) / 1500.0));
  float thin = uThin * exp(-(radius - uSunRadius) / uThinLength) * sech2(p.z / uThinHeight) * (0.85 + 0.3 * arms.y);
  float thick = uThick * exp(-(radius - uSunRadius) / uThickLength) * exp(-abs(p.z) / uThickHeight);
  m.disk = (thin + thick) * outerEdge;
  m.armed = uThin * exp(-(radius - uSunRadius) / uThinLength) * sech2(p.z / uThinHeight) * outerEdge * (uArmedFloor + arm) * uArmedNormal;
  m.bar = uBulge * exp(-barDistance(barFrame, uBulgeScales)) + uLongBar * exp(-pow(barDistance(barFrame, uLongBarScales), 4.0));

  float octaves = clamp(log2(900.0 / max(footprint, 1.0)), 0.0, 5.0);
  float knots = octaves > 0.0 ? fbm(p / 450.0, 11u, octaves) : 0.5;
  m.young = uYoungPerArm * arm * youngTaper(radius) * exp(-abs(p.z) / uYoungHeight) * (0.2 + 5.5 * knots * knots * knots);

  float clouds = octaves > 0.0 ? fbm(p / 380.0 + vec3(5.2, 1.3, 7.7), 29u, octaves) : 0.5;
  float innerHole = 0.3 + 0.7 * smoothstep(2500.0, 4200.0, radius);
  float centralZone = 6.0 * exp(-radius / 250.0);
  m.dust = uDustPerPc * exp(-(radius - uSunRadius) / uDustLength) * sech2(p.z / uDustHeight) * (0.3 + 1.7 * arm) * innerHole
    * max(0.0, 2.6 * clouds - 0.55) * outerEdge + uDustPerPc * centralZone * sech2(p.z / 60.0);
  return m;
}

vec3 rayDirection(vec2 uv) {
  vec2 ndc = uv * 2.0 - 1.0;
  return normalize(uForward + uRight * ndc.x * uTanHalf.x + uUp * ndc.y * uTanHalf.y);
}

float dustColumn(vec3 target, int steps) {
  vec3 offset = target - uCamera;
  float span = length(offset);
  float total = 0.0;
  for (int i = 0; i < 24; i++) {
    if (i >= steps) break;
    float t = (float(i) + 0.5) / float(steps);
    vec3 p = uCamera + offset * t;
    if (abs(p.z) > 3000.0) continue;
    total += matterAt(p, span * t * uYearsPerPc, span / float(steps)).dust;
  }
  return total * span / float(steps) * MAG_TO_TAU;
}
`;

export const SKY_FRAGMENT = `#version 300 es
${COMMON}
uniform highp sampler2D uTables;
uniform float uUnresolvedLogNear;
uniform float uUnresolvedLogStep;
uniform int uNebulaCount;
uniform vec3 uGalaxyCentre[${MAX_GALAXIES}];
uniform vec3 uGalaxyNormal[${MAX_GALAXIES}];
uniform vec4 uGalaxyShape[${MAX_GALAXIES}];
uniform vec3 uGalaxyTint[${MAX_GALAXIES}];
uniform int uGalaxyCount;
uniform float uOutputScale;
uniform uint uFrameSeed;
uniform vec3 uGasColour;
uniform float uGasPerYoung;

in vec2 vUv;
out vec4 outColour;

const int MAX_STEPS = 240;
const int CHECKPOINTS = 32;
const float LIGHT_TO_SURFACE_BRIGHTNESS = 0.02748;

vec3 lookupUnresolved(int row, float distance) {
  float x = (log(max(distance, 1e-3)) - uUnresolvedLogNear) / uUnresolvedLogStep;
  x = clamp(x, 0.0, float(${UNRESOLVED_STEPS - 1}));
  int i = int(floor(x));
  int j = min(i + 1, ${UNRESOLVED_STEPS - 1});
  return mix(texelFetch(uTables, ivec2(i, row), 0).rgb, texelFetch(uTables, ivec2(j, row), 0).rgb, x - float(i));
}

vec2 slabSpan(vec3 origin, vec3 direction, vec3 halfSize) {
  vec3 inverse = 1.0 / direction;
  vec3 t0 = (-halfSize - origin) * inverse;
  vec3 t1 = (halfSize - origin) * inverse;
  vec3 low = min(t0, t1);
  vec3 high = max(t0, t1);
  return vec2(max(max(low.x, low.y), max(low.z, 0.0)), min(min(high.x, high.y), high.z));
}

void main() {
  vec3 direction = rayDirection(vUv);
  vec3 safeDirection = direction + vec3(equal(direction, vec3(0.0))) * 1e-7;
  vec2 span = slabSpan(uCamera, safeDirection, vec3(28000.0, 28000.0, 6000.0));

  vec3 light = vec3(0.0);
  vec3 depth = vec3(0.0);
  float checkpointDistance[CHECKPOINTS];
  float checkpointDepth[CHECKPOINTS];
  int checkpoints = 0;

  if (span.x < span.y) {
    float jitter = float(hashUint(uint(gl_FragCoord.x) * 7919u + uint(gl_FragCoord.y) * 104729u + uFrameSeed)) / 4294967295.0;
    float s = span.x;
    float nextCheckpoint = s;
    for (int i = 0; i < MAX_STEPS; i++) {
      vec3 probe = uCamera + direction * s;
      float zStep = (abs(probe.z) * 0.35 + 25.0) / max(abs(direction.z), 0.02);
      float reachStep = max(4.0, 0.03 * s);
      float ds = clamp(min(zStep, max(reachStep, 0.012 * (span.y - span.x))), 4.0, 1600.0);
      float t = s + ds * (i == 0 ? jitter : 0.5);
      vec3 p = uCamera + direction * t;
      float footprint = max(t * uPixelAngle, ds * 0.25);
      Matter m = matterAt(p, t * uYearsPerPc, footprint);
      vec3 emission = m.disk * lookupUnresolved(${TABLE_ROWS.oldUnresolved}, t) + m.bar * lookupUnresolved(${TABLE_ROWS.bulgeUnresolved}, t)
        + m.armed * lookupUnresolved(${TABLE_ROWS.armedUnresolved}, t)
        + m.young * (lookupUnresolved(${TABLE_ROWS.youngUnresolved}, t) + uGasPerYoung * uGasColour);
      vec3 tau = m.dust * MAG_TO_TAU * EXTINCTION_BANDS * ds;
      vec3 transmit = exp(-depth);
      vec3 absorbed = (1.0 - exp(-tau)) / max(tau, vec3(1e-6));
      light += transmit * emission * ds * absorbed;
      depth += tau;
      if (t >= nextCheckpoint && checkpoints < CHECKPOINTS) {
        checkpointDistance[checkpoints] = t;
        checkpointDepth[checkpoints] = depth.g;
        checkpoints++;
        nextCheckpoint = t + (span.y - span.x) / float(CHECKPOINTS) * 0.5 + 0.25 * t;
      }
      s += ds;
      if (s > span.y || depth.b > 18.0) break;
    }
  }
  light *= LIGHT_TO_SURFACE_BRIGHTNESS;

  for (int n = 0; n < ${MAX_NEBULAE}; n++) {
    if (n >= uNebulaCount) break;
    vec4 place = texelFetch(uTables, ivec2(n, ${TABLE_ROWS.nebulaPlace}), 0);
    vec4 glow = texelFetch(uTables, ivec2(n, ${TABLE_ROWS.nebulaGlow}), 0);
    float cosAngle = dot(direction, place.xyz);
    if (cosAngle <= 0.0) continue;
    float angle = acos(min(cosAngle, 1.0));
    float sigma = sqrt(place.w * place.w + 0.25 * uPixelAngle * uPixelAngle);
    if (angle > 5.0 * sigma) continue;
    vec3 offset = (direction - place.xyz * cosAngle) / max(place.w, 1e-9);
    float structure = fbm(offset * 2.2 + vec3(glow.w * 13.1), uint(n) * 31u + 5u, 5.0);
    float filaments = pow(1.0 - abs(2.0 * fbm(offset * 3.1 - vec3(glow.w * 5.7), uint(n) * 13u + 9u, 5.0) - 1.0), 4.0);
    float lanes = smoothstep(0.38, 0.62, fbm(offset * 2.6 - vec3(glow.w * 7.3), uint(n) * 17u + 3u, 5.0));
    float sigmaCore = sqrt(0.0625 * place.w * place.w + 0.25 * uPixelAngle * uPixelAngle);
    float outer = 0.6 * exp(-0.5 * angle * angle / (sigma * sigma)) / (6.2831853 * sigma * sigma);
    float core = 0.4 * exp(-0.5 * angle * angle / (sigmaCore * sigmaCore)) / (6.2831853 * sigmaCore * sigmaCore);
    float resolvedShare = clamp(place.w / max(uPixelAngle, 1e-12), 0.0, 1.0);
    float pattern = mix(1.0, (0.1 + 1.5 * structure * structure + 1.3 * filaments) * (0.2 + 0.8 * lanes), resolvedShare);
    float surface = glow.x * (outer + core) * pattern / 4.2545e10;
    float behind = 0.0;
    for (int c = 0; c < CHECKPOINTS; c++) {
      if (c >= checkpoints) break;
      if (checkpointDistance[c] <= glow.y) behind = checkpointDepth[c];
    }
    light += surface * exp(-behind * EXTINCTION_BANDS) * vec3(2.6, 1.0, 0.75);
  }

  vec3 throughMilkyWay = exp(-depth);
  for (int g = 0; g < ${MAX_GALAXIES}; g++) {
    if (g >= uGalaxyCount) break;
    vec3 centre = uGalaxyCentre[g];
    vec3 normal = uGalaxyNormal[g];
    vec4 shape = uGalaxyShape[g];
    float facing = dot(direction, normal);
    float hit = abs(facing) > 1e-5 ? dot(centre, normal) / facing : -1.0;
    if (hit > 0.0) {
      vec3 inPlane = direction * hit - centre;
      float radius = length(inPlane);
      float footprint = hit * uPixelAngle;
      float octaves = clamp(log2(0.5 * shape.y / max(footprint, 1.0)), 0.0, 5.0);
      float clumps = octaves > 0.0 ? fbm(inPlane / (0.5 * shape.y) + vec3(float(g) * 37.0), uint(g) * 71u + 19u, octaves) : 0.5;
      float column = shape.x / (6.2831853 * shape.y * shape.y) * exp(-radius / shape.y) / max(abs(facing), 0.12);
      light += column * (0.3 + 1.4 * clumps) * LIGHT_TO_SURFACE_BRIGHTNESS * uGalaxyTint[g] * throughMilkyWay;
    }
    float distance = length(centre);
    float angle = acos(clamp(dot(direction, centre / distance), -1.0, 1.0));
    float sigma = sqrt(shape.w * shape.w + 0.25 * uPixelAngle * uPixelAngle);
    if (angle < 6.0 * sigma) {
      float core = shape.z * exp(-0.5 * angle * angle / (sigma * sigma)) / (6.2831853 * sigma * sigma) / 4.2545e10;
      light += core * uGalaxyTint[g] * throughMilkyWay;
    }
  }

  outColour = vec4(light * uOutputScale, 1.0);
}`;

const COCKPIT = `
uniform vec3 uShipRight;
uniform vec3 uShipUp;
uniform vec3 uShipForward;
uniform vec4 uWindows[3];
uniform vec2 uStruts[2];
uniform float uCockpit;
uniform float uShutter;

vec2 shipAngles(vec3 direction) {
  return vec2(atan(dot(direction, uShipRight), dot(direction, uShipForward)), asin(clamp(dot(direction, uShipUp), -1.0, 1.0)));
}

float distanceOutsideWindows(vec2 angles) {
  float nearest = 10.0;
  for (int i = 0; i < 3; i++) {
    vec4 window = uWindows[i];
    float top = mix(window.w, window.z, uShutter);
    vec2 centre = vec2(window.x + window.y, window.z + top) * 0.5;
    vec2 extent = vec2(window.y - window.x, top - window.z) * 0.5;
    vec2 q = abs(angles - centre) - extent;
    nearest = min(nearest, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  for (int i = 0; i < 2; i++) {
    float strut = uStruts[i].y - abs(angles.x - uStruts[i].x);
    if (strut > 0.0 && abs(angles.y) < 1.0) nearest = max(nearest, strut);
  }
  return nearest;
}

bool seenThroughCockpit(vec3 direction) {
  return uCockpit < 0.5 || distanceOutsideWindows(shipAngles(direction)) < 0.0;
}

vec3 cabinColour(vec3 direction) {
  vec2 angles = shipAngles(direction);
  float rim = exp(-distanceOutsideWindows(angles) / 0.008);
  float shade = 0.75 + 0.25 * cos(angles.y * 1.4);
  return vec3(0.028, 0.034, 0.046) * shade + vec3(0.07, 0.09, 0.12) * rim;
}
`;

const WARP = `
uniform highp sampler2D uWarpTable;
uniform vec4 uWarpAxis;
uniform float uWarpRow;
uniform float uWarpAngleMin;
uniform int uWarpAngleCount;
uniform int uWarpSpeedCount;
uniform vec3 uBandToPhysical;

const vec3 BAND_MICRONS = vec3(0.658, 0.551, 0.445);
const float CMB_KELVIN = 2.725;
const float HALF_TURN = 3.14159265;

float planck(float microns, float kelvin) {
  float x = 14387.77 / (microns * kelvin);
  if (x > 80.0) return 0.0;
  float denominator = x < 1e-3 ? x * (1.0 + 0.5 * x) : exp(x) - 1.0;
  return 2.5718e14 / (microns * microns * microns * denominator);
}

vec3 planckBands(float kelvin) {
  return vec3(planck(BAND_MICRONS.r, kelvin), planck(BAND_MICRONS.g, kelvin), planck(BAND_MICRONS.b, kelvin));
}

float colourTemperature(float blueOverVisual) {
  float low = log(600.0);
  float high = log(3.0e6);
  for (int i = 0; i < 20; i++) {
    float mid = 0.5 * (low + high);
    float kelvin = exp(mid);
    if (planck(BAND_MICRONS.b, kelvin) < blueOverVisual * planck(BAND_MICRONS.g, kelvin)) low = mid;
    else high = mid;
  }
  return exp(0.5 * (low + high));
}

vec2 warpTexel(int angleIndex) {
  int low = int(floor(uWarpRow));
  int high = min(low + 1, uWarpSpeedCount - 1);
  vec2 a = texelFetch(uWarpTable, ivec2(angleIndex, low), 0).rg;
  vec2 b = texelFetch(uWarpTable, ivec2(angleIndex, high), 0).rg;
  if (a.x < 0.0 || b.x < 0.0) return vec2(-1.0, -30.0);
  return mix(a, b, uWarpRow - float(low));
}

float warpAngleOf(float index) {
  return index <= 0.0 ? 0.0 : uWarpAngleMin * pow(HALF_TURN / uWarpAngleMin, (index - 1.0) / float(uWarpAngleCount - 2));
}

float warpIndexOf(float angle) {
  if (angle <= uWarpAngleMin) return angle / uWarpAngleMin;
  return clamp(1.0 + float(uWarpAngleCount - 2) * log(angle / uWarpAngleMin) / log(HALF_TURN / uWarpAngleMin), 0.0, float(uWarpAngleCount - 1));
}

vec2 warpLookup(float angle) {
  float x = warpIndexOf(angle);
  int i = int(floor(x));
  int j = min(i + 1, uWarpAngleCount - 1);
  vec2 a = warpTexel(i);
  vec2 b = warpTexel(j);
  if (a.x < 0.0 || b.x < 0.0) return vec2(-1.0, -30.0);
  return mix(a, b, x - float(i));
}

vec3 atAngleFromAxis(vec3 direction, float angle) {
  vec3 axis = uWarpAxis.xyz;
  vec3 side = direction - axis * dot(direction, axis);
  float size = length(side);
  side = size > 1e-7 ? side / size : normalize(cross(axis, abs(axis.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  return axis * cos(angle) + side * sin(angle);
}

vec3 blueshifted(vec3 bands, float shift) {
  vec3 physical = bands * uBandToPhysical;
  vec3 light = planckBands(CMB_KELVIN * shift);
  if (physical.g > 0.0 && physical.b > 0.0) {
    float kelvin = colourTemperature(physical.b / physical.g);
    light += physical.g / max(planck(BAND_MICRONS.g, kelvin), 1e-30) * planckBands(kelvin * shift);
  }
  return light / uBandToPhysical;
}
`;

export const GROUND_DETAIL_PERIOD_CELLS = 8;
export const GROUND_DETAIL_SLOPE_RANGE = 2;

const EYE_SHARED = `
precision highp float;
precision highp int;
uniform sampler2D uSky;
uniform vec3 uWhiteBalance;
uniform uint uFrameSeed;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
uniform samplerCube uSkyCube;
uniform float uGlareLux;
uniform float uAdaptation;
uniform float uLongExposure;
${COCKPIT}
${WARP}
in vec2 vUv;
layout(location = 0) out vec4 outColour;

uint hashUint(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

float grain() {
  uint h = hashUint(uint(gl_FragCoord.x) + hashUint(uint(gl_FragCoord.y) + hashUint(uFrameSeed)));
  return float(h) / 4294967295.0 - 0.5;
}

float latticeValue(vec3 corner) {
  uvec3 q = uvec3(ivec3(corner) + 4096);
  return float(hashUint(q.x * 73856093u ^ q.y * 19349663u ^ q.z * 83492791u)) / 4294967295.0;
}

float smoothNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(latticeValue(i), latticeValue(i + vec3(1, 0, 0)), f.x), mix(latticeValue(i + vec3(0, 1, 0)), latticeValue(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(latticeValue(i + vec3(0, 0, 1)), latticeValue(i + vec3(1, 0, 1)), f.x), mix(latticeValue(i + vec3(0, 1, 1)), latticeValue(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

float terrain(vec3 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 6; i++) {
    total += amplitude * smoothNoise(p);
    p = p * 2.03 + vec3(7.1, 2.9, 5.3);
    amplitude *= 0.5;
  }
  return total / 0.984;
}

uniform vec4 uBodyPlace[${MAX_BODIES}];
uniform int uBodyCount;
uniform vec3 uBodySun[${MAX_BODIES}];
uniform vec3 uBodyNorth[${MAX_BODIES}];
uniform vec3 uBodyMeridian[${MAX_BODIES}];
uniform vec4 uBodyLook[${MAX_BODIES}];
uniform vec4 uBodyMap[${MAX_BODIES}];
uniform highp sampler2DArray uBodyColour;
uniform highp sampler2DArray uBodyHeight;
uniform float uPixelAngle;
uniform int uGround;
uniform float uGroundBlend;

const float BODY_CLOUDED = 1.0;
const float BODY_GIANT = 2.0;
const float BODY_STAR = 3.0;
const float BODY_OCEAN_WORLD = 4.0;
const float BODY_HAZY = 5.0;
const float MAP_WIDTH = 1024.0;
const float MAP_HEIGHT = 512.0;
const float MAX_DETAIL_OCTAVES = 7.0;
const float POINT_SIGMA_PIXELS = 0.7;
const float DETAIL_PERSISTENCE = 0.42;
const float DETAIL_ALBEDO = 0.3;
const float CLOUD_DETAIL = 0.25;
const vec3 CLOUD_ALBEDO = vec3(0.95);
const float OCEAN_GLINT = 0.6;
const float CLOUD_TOP_CONTRAST = 0.04;
const float CHEVRON_SWEEP = 1.2;
const float STREAK_LENGTH = 3.0;
const float STREAK_SPACING = 9.0;
const float STREAK_WOBBLE = 0.6;
const float CLOUD_DECK_FLATNESS = 0.5;
const float HAZE_CONTRAST = 0.03;
const float HAZE_HEMISPHERE_CONTRAST = 0.04;
const float HAZE_POLAR_HOOD = 0.12;
const float HAZE_TWILIGHT = 0.12;
const vec3 DETACHED_HAZE = vec3(0.3, 0.42, 0.7);
const vec3 OCEAN_ALBEDO = vec3(2.0, 5.0, 20.0) / 255.0;
const float COAST_ROUGHNESS = ${COAST_ROUGHNESS};
const float COAST_SHARPEST = 0.01;
const float OCEAN_SHININESS = 250.0;
const float CLOUD_SCALE = 7.0;
const float CLOUD_STRETCH = 1.6;
const float CLOUD_SWIRL = 2.5;
const float CLOUD_OPACITY = 0.9;
const float CLOUD_THIN_EDGE = 0.5;
const float CLOUD_THICK_EDGE = 0.75;

struct BodyFrame {
  vec3 north;
  vec3 meridian;
  vec3 east;
};

vec2 mapCoordinates(vec3 surface, BodyFrame frame) {
  float latitude = asin(clamp(dot(surface, frame.north), -1.0, 1.0));
  float longitude = atan(dot(surface, frame.east), dot(surface, frame.meridian));
  return vec2(longitude / 6.2831853 + 0.5, 0.5 - latitude / 3.1415927);
}

float detailNoise(vec3 p, float octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < int(MAX_DETAIL_OCTAVES); i++) {
    float weight = clamp(octaves - float(i), 0.0, 1.0);
    if (weight <= 0.0) break;
    total += weight * amplitude * (smoothNoise(p) - 0.5);
    p = p * 2.03 + vec3(7.1, 2.9, 5.3);
    amplitude *= DETAIL_PERSISTENCE;
  }
  return total;
}

vec3 bodyLocal(vec3 surface, BodyFrame frame) {
  return vec3(dot(surface, frame.meridian), dot(surface, frame.east), dot(surface, frame.north));
}

vec3 placeholderAlbedo(vec4 look, vec3 local) {
  float latitude = local.z;
  if (look.w == BODY_GIANT) {
    float bands = sin(latitude * 22.0 + 2.5 * terrain(local * 3.0)) * 0.5 + 0.5;
    return look.rgb * (0.78 + 0.3 * bands);
  }
  return look.rgb * (0.7 + 0.6 * terrain(local * 4.0));
}

float latitudeBelt(float latitude, float centre, float width) {
  float off = (abs(latitude) - centre) / width;
  return exp(-off * off);
}

float cloudBillows(vec3 local, vec3 detailPoint, float octaves) {
  float latitude = asin(clamp(local.z, -1.0, 1.0));
  vec3 swirl = vec3(terrain(local * 2.0), terrain(local * 2.0 + vec3(5.2)), terrain(local * 2.0 + vec3(9.1))) - 0.5;
  vec3 stretchedEastWest = local * CLOUD_SCALE * vec3(1.0, 1.0, CLOUD_STRETCH);
  float billows = terrain(stretchedEastWest + CLOUD_SWIRL * swirl) + CLOUD_DETAIL * detailNoise(detailPoint, octaves);
  float climate = 0.1 * latitudeBelt(latitude, 0.0, 0.1) - 0.15 * latitudeBelt(latitude, 0.45, 0.15) + 0.1 * latitudeBelt(latitude, 1.0, 0.2);
  return billows + climate;
}

float cloudCover(vec3 local, vec3 detailPoint, float octaves) {
  return CLOUD_OPACITY * smoothstep(CLOUD_THIN_EDGE, CLOUD_THICK_EDGE, cloudBillows(local, detailPoint, octaves));
}

float cloudTopShade(vec3 local, vec3 detailPoint, float octaves) {
  float latitude = asin(clamp(local.z, -1.0, 1.0));
  float chevron = atan(local.y, local.x) + CHEVRON_SWEEP * abs(latitude);
  vec3 streakSpace = vec3(cos(chevron) * STREAK_LENGTH, sin(chevron) * STREAK_LENGTH, latitude * STREAK_SPACING);
  float streaks = terrain(streakSpace + STREAK_WOBBLE * (terrain(local * 2.0) - 0.5)) - 0.5;
  float darkerEquator = -0.5 * latitudeBelt(latitude, 0.0, 0.35);
  float polarCollar = 0.6 * latitudeBelt(latitude, 1.1, 0.12);
  return 1.0 + CLOUD_TOP_CONTRAST * (2.0 * streaks + darkerEquator + polarCollar + detailNoise(detailPoint, octaves));
}

float hazeShade(vec3 local, vec3 detailPoint, float octaves) {
  float latitude = asin(clamp(local.z, -1.0, 1.0));
  float hemisphereContrast = HAZE_HEMISPHERE_CONTRAST * sin(latitude);
  float polarHood = -HAZE_POLAR_HOOD * latitudeBelt(latitude, 1.2, 0.1) * step(0.0, latitude);
  float drift = terrain(vec3(local.xy * 2.0, latitude * 6.0)) - 0.5;
  return 1.0 + hemisphereContrast + polarHood + HAZE_CONTRAST * (drift + detailNoise(detailPoint, octaves));
}

float mapHeight(float layer, vec2 uv) {
  return texture(uBodyHeight, vec3(uv, layer)).r;
}

vec3 shadeBody(int i, vec3 direction, float hit, float radius) {
  vec4 place = uBodyPlace[i];
  vec4 look = uBodyLook[i];
  vec4 map = uBodyMap[i];
  vec3 normal = normalize(direction * hit - place.xyz);
  float mu = max(dot(normal, -direction), 0.0);
  if (look.w == BODY_STAR) return look.rgb * (0.4 + 0.6 * mu);

  BodyFrame frame = BodyFrame(uBodyNorth[i], uBodyMeridian[i], cross(uBodyNorth[i], uBodyMeridian[i]));
  vec3 local = bodyLocal(normal, frame);
  vec2 uv = mapCoordinates(normal, frame);
  bool mapped = map.x >= 0.0;
  vec4 surface = mapped ? texture(uBodyColour, vec3(uv, map.x)) : vec4(placeholderAlbedo(look, local), 1.0);
  vec3 albedo = surface.rgb;
  float land = surface.a;

  float footprint = uPixelAngle * hit / radius;
  float mapTexel = 6.2831853 / MAP_WIDTH;
  float octaves = clamp(log2(mapTexel / max(footprint, 1e-9)), 0.0, MAX_DETAIL_OCTAVES);
  vec3 detailPoint = local / mapTexel;
  if (look.w == BODY_OCEAN_WORLD && mapped) {
    float edgeWidth = clamp(0.5 * footprint / mapTexel, COAST_SHARPEST, 0.5);
    float nearCoast = 4.0 * land * (1.0 - land);
    float coastline = land + COAST_ROUGHNESS * nearCoast * detailNoise(detailPoint + vec3(31.7, 4.3, 17.9), octaves);
    land = smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, coastline);
    albedo = mix(OCEAN_ALBEDO, albedo, land);
  }
  if (look.w == BODY_CLOUDED) albedo = look.rgb * cloudTopShade(local, detailPoint, octaves);
  if (look.w == BODY_HAZY) albedo = look.rgb * hazeShade(local, detailPoint, octaves);

  vec3 shaded = normal;
  if (mapped && look.w != BODY_CLOUDED && look.w != BODY_HAZY) {
    float latitudeCos = max(sqrt(1.0 - local.z * local.z), 0.05);
    vec2 texel = vec2(1.0 / MAP_WIDTH, 1.0 / MAP_HEIGHT);
    float eastSlope = (mapHeight(map.x, uv + vec2(texel.x, 0.0)) - mapHeight(map.x, uv - vec2(texel.x, 0.0))) / (2.0 * 6.2831853 * texel.x * latitudeCos);
    float northSlope = (mapHeight(map.x, uv - vec2(0.0, texel.y)) - mapHeight(map.x, uv + vec2(0.0, texel.y))) / (2.0 * 3.1415927 * texel.y);
    vec3 eastward = normalize(frame.east - normal * dot(frame.east, normal));
    vec3 northward = cross(normal, eastward);
    shaded = normalize(normal - land * map.y * (eastSlope * eastward + northSlope * northward));
    if (octaves > 0.0) {
      float probe = 0.35;
      float here = detailNoise(detailPoint, octaves);
      float towardEast = detailNoise(detailPoint + probe * bodyLocal(eastward, frame), octaves);
      float towardNorth = detailNoise(detailPoint + probe * bodyLocal(northward, frame), octaves);
      float roughness = map.z * land;
      shaded = normalize(shaded - roughness * ((towardEast - here) * eastward + (towardNorth - here) * northward) / probe);
      albedo *= 1.0 + land * DETAIL_ALBEDO * here;
    }
  }

  vec3 sun = uBodySun[i];
  float daylight = look.w == BODY_HAZY ? smoothstep(-HAZE_TWILIGHT, HAZE_TWILIGHT, dot(normal, sun)) : smoothstep(-0.02, 0.05, dot(normal, sun));
  float sunHeight = max(dot(normal, sun), 0.0);
  float lighting = max(dot(shaded, sun), 0.0);
  if (look.w == BODY_CLOUDED || look.w == BODY_HAZY) lighting = mix(lighting, 2.0 * sunHeight / (sunHeight + mu + 1e-4), CLOUD_DECK_FLATNESS);
  vec3 lit = albedo * lighting * daylight;
  if (look.w == BODY_OCEAN_WORLD) {
    vec3 halfway = normalize(sun - direction);
    lit += (1.0 - land) * daylight * sunHeight * OCEAN_GLINT * pow(max(dot(normal, halfway), 0.0), OCEAN_SHININESS);
    lit = mix(lit, CLOUD_ALBEDO * sunHeight * daylight, cloudCover(local, detailPoint, octaves));
  }
  if (look.w == BODY_OCEAN_WORLD || look.w == BODY_CLOUDED) {
    float limb = pow(1.0 - mu, 3.0) * smoothstep(-0.15, 0.4, dot(normal, sun));
    lit += (look.w == BODY_OCEAN_WORLD ? vec3(0.2, 0.4, 0.9) : vec3(0.6, 0.55, 0.4)) * limb;
  }
  if (look.w == BODY_HAZY) lit += DETACHED_HAZE * pow(1.0 - mu, 6.0) * smoothstep(-0.3, 0.3, dot(normal, sun));
  return lit;
}


uniform int uRingedBody;
uniform float uRingedBodyKm;

const float RING_INNER_KM = 66900.0;
const float RING_OUTER_KM = 140300.0;
const float RING_BRIGHTNESS = 3.5;
const float RING_BRIGHTEST_SHARE = 0.3;
const float RINGLET_CONTRAST = 0.45;
const float RINGLET_ALBEDO_CONTRAST = 0.25;
const float RING_SHADOW_SOFTNESS = 0.004;
const float RING_FLATTEST_VIEW = 1e-3;
const vec3 RING_DUSTY_COLOUR = vec3(0.6, 0.55, 0.5);
const vec3 RING_ICY_COLOUR = vec3(0.86, 0.78, 0.64);

float band(float r, float footprint, float inner, float outer) {
  return clamp((min(r + 0.5 * footprint, outer) - max(r - 0.5 * footprint, inner)) / footprint, 0.0, 1.0);
}

float ringletNoise(float x) {
  float cell = floor(x);
  float a = fract(sin(cell * 127.1) * 43758.5453);
  float b = fract(sin((cell + 1.0) * 127.1) * 43758.5453);
  float t = fract(x);
  return mix(a, b, t * t * (3.0 - 2.0 * t)) * 2.0 - 1.0;
}

float ringlets(float rKm, float footprint) {
  float total = 0.0;
  float wavelength = 2400.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    total += amplitude * ringletNoise(rKm / wavelength + float(octave) * 17.3) * (1.0 - smoothstep(0.25 * wavelength, wavelength, footprint));
    wavelength *= 0.3;
    amplitude *= 0.75;
  }
  return total;
}

vec2 ringDepths(float r, float w) {
  float dusty = 0.002 * band(r, w, 66900.0, 74510.0)
    + 0.08 * band(r, w, 74658.0, 92000.0)
    + 0.25 * (band(r, w, 85900.0, 86600.0) + band(r, w, 88700.0, 89100.0) + band(r, w, 89800.0, 90300.0))
    + 0.1 * band(r, w, 117580.0, 122170.0)
    - 0.1 * band(r, w, 117680.0, 118183.0);
  float icy = 1.0 * band(r, w, 92000.0, 99000.0)
    + 3.0 * band(r, w, 99000.0, 110000.0)
    + 2.0 * band(r, w, 110000.0, 117580.0)
    + 0.6 * band(r, w, 122170.0, 133423.0)
    + 0.45 * band(r, w, 133745.0, 136485.0)
    + 0.3 * band(r, w, 136527.0, 136775.0)
    + 0.6 * band(r, w, 140155.0, 140205.0);
  return max(vec2(dusty, icy), 0.0);
}

float ringRadiusKm(vec3 fromCentre, float radius) {
  return length(fromCentre) / radius * uRingedBodyKm;
}

vec4 ringSeen(int i, vec3 direction, out float ringHit) {
  ringHit = -1.0;
  vec3 centre = uBodyPlace[i].xyz;
  float radius = sin(uBodyPlace[i].w);
  vec3 north = uBodyNorth[i];
  float facing = dot(direction, north);
  float hit = dot(centre, north) / (abs(facing) < RING_FLATTEST_VIEW ? sign(facing + 1e-9) * RING_FLATTEST_VIEW : facing);
  vec3 fromCentre = direction * hit - centre;
  float rKm = ringRadiusKm(fromCentre, radius);
  float footprint = max(fwidth(rKm), 1.0);
  if (hit <= 0.0 || rKm + footprint < RING_INNER_KM || rKm - footprint > RING_OUTER_KM) return vec4(0.0);
  float ringlet = ringlets(rKm, footprint);
  vec2 depths = ringDepths(rKm, footprint);
  float depth = (depths.x + depths.y) * (1.0 + RINGLET_CONTRAST * ringlet);
  if (depth <= 0.0) return vec4(0.0);
  vec3 albedo = (RING_DUSTY_COLOUR * depths.x + RING_ICY_COLOUR * depths.y) / (depths.x + depths.y) * (1.0 + RINGLET_ALBEDO_CONTRAST * ringlet);
  vec3 sun = uBodySun[i];
  float viewSlant = max(abs(facing), RING_FLATTEST_VIEW);
  float sunSlant = max(abs(dot(sun, north)), RING_FLATTEST_VIEW);
  bool litFace = sign(dot(sun, north)) == sign(-dot(centre, north));
  float scattered = depth / viewSlant * exp(-depth / viewSlant);
  if (litFace) scattered = sunSlant / (sunSlant + viewSlant) * (1.0 - exp(-depth * (1.0 / sunSlant + 1.0 / viewSlant)));
  else if (abs(sunSlant - viewSlant) >= 1e-3) scattered = sunSlant / (sunSlant - viewSlant) * (exp(-depth / sunSlant) - exp(-depth / viewSlant));
  float towardSun = dot(fromCentre, sun);
  float offShadowAxis = length(fromCentre - sun * towardSun) / radius;
  float inSaturnShadow = towardSun < 0.0 ? 1.0 - smoothstep(1.0 - RING_SHADOW_SOFTNESS, 1.0 + RING_SHADOW_SOFTNESS, offShadowAxis) : 0.0;
  ringHit = hit;
  return vec4(albedo * RING_BRIGHTNESS * min(scattered, RING_BRIGHTEST_SHARE) * (1.0 - inSaturnShadow), 1.0 - exp(-depth / viewSlant));
}

float sunThroughRings(int i, vec3 surface) {
  vec3 north = uBodyNorth[i];
  vec3 sun = uBodySun[i];
  vec3 fromCentre = surface - uBodyPlace[i].xyz;
  float sunRise = dot(sun, north);
  if (abs(sunRise) < 1e-6) return 1.0;
  float toPlane = -dot(fromCentre, north) / sunRise;
  if (toPlane <= 0.0) return 1.0;
  float rKm = ringRadiusKm(fromCentre + sun * toPlane, sin(uBodyPlace[i].w));
  float footprint = max(fwidth(rKm), 1.0);
  vec2 depths = ringDepths(rKm, footprint);
  return exp(-(depths.x + depths.y) * (1.0 + RINGLET_CONTRAST * ringlets(rKm, footprint)) / abs(sunRise));
}

const float STAR_KIND = 3.0;
bool starHit = false;

vec4 bodiesColour(vec3 direction) {
  vec3 points = vec3(0.0);
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    if (i == uGround && uGroundBlend >= 1.0) continue;
    float ringHit = -1.0;
    vec4 ring = i == uRingedBody ? ringSeen(i, direction, ringHit) : vec4(0.0);
    vec4 place = uBodyPlace[i];
    float along = dot(direction, place.xyz);
    float radius = sin(place.w);
    float miss = length(direction * along - place.xyz);
    float pointSigma = POINT_SIGMA_PIXELS * uPixelAngle;
    float unresolved = 1.0 - smoothstep(0.5, 2.0, radius / uPixelAngle);
    float cover = along > 0.0 ? clamp((radius - miss) / max(fwidth(miss), 1e-9) + 0.5, 0.0, 1.0) : 0.0;
    if (along > 0.0) points += uBodyLook[i].rgb * uBodyMap[i].w * unresolved * exp(-0.5 * miss * miss / (pointSigma * pointSigma));
    if (cover <= 0.0) {
      if (ring.a > 0.0) return vec4(ring.rgb + points, ring.a);
      continue;
    }
    float inside = min(miss, radius * 0.9999);
    float hit = along - sqrt(radius * radius - inside * inside);
    starHit = uBodyLook[i].w == STAR_KIND;
    vec3 body = shadeBody(i, direction, hit, radius);
    if (i == uRingedBody) body *= sunThroughRings(i, direction * hit);
    if (ring.a <= 0.0) return vec4(body * cover + points, cover);
    if (ringHit < hit) return vec4(ring.rgb + body * cover * (1.0 - ring.a) + points, 1.0 - (1.0 - ring.a) * (1.0 - cover));
    return vec4(body * cover + ring.rgb * (1.0 - cover) + points, cover + ring.a * (1.0 - cover));
  }
  return vec4(points, 0.0);
}

uniform vec3 uGroundCamera;
uniform float uGroundRadius;
uniform float uGroundExcess;
uniform ivec3 uGroundAnchor;
uniform vec3 uGroundFromAnchor;
uniform vec4 uGroundClouds;
uniform vec4 uGroundAir;
uniform vec4 uGroundGlow;
uniform vec3 uGroundSunset;
uniform float uGroundOvercast;
uniform vec3 uGroundMeridian;
uniform vec3 uGroundCameraUp;
uniform vec2 uGroundCameraUv;
uniform float uGroundRoughness;

const float ANCHOR_METRES = ${ANCHOR_METRES}.0;
const float WATER_FRESNEL_HEAD_ON = 0.02;
const float GROUND_HIT = 2.0;
const int CLOUD_STEPS = 16;
const float CLOUD_STEP_BLUR_SHARE = 0.5;
const ivec4 CLOUD_JITTER_ORDER = ivec4(0, 2, 3, 1);
const float CLOUD_GOLDEN_STEP = 0.618034;
const float CLOUD_LONGEST_MARCH_KM = 50.0;
const float CLOUD_LIT_ALBEDO = 0.8;
const float CLOUD_DARK_BASE_SHARE = 0.4;
const float CLOUD_CLEAR_BILLOWS = 0.4;
const float CLOUD_OVERCAST_BILLOWS = 0.75;
const float CLOUD_SPARSEST_CELL = 1.0;
const float CLOUD_DENSEST_CELL = 0.2;
const float CLOUD_EDGE_SOFTNESS = 0.15;
const float CLOUD_BLURRED_SOFTNESS = 0.8;
const float CLOUD_CELL_CONTRAST = 2.0;
const float CLOUD_DOME_EROSION = 0.25;
const float CLOUD_SHADOW_BLUR_METRES = 200.0;
const vec4 CLOUD_CELL_WEIGHTS = vec4(0.45, 0.28, 0.17, 0.1);
const ivec4 CLOUD_CELL_OCTAVES = ivec4(3, 4, 6, 7);
const ivec3 CLOUD_REGION_OCTAVES = ivec3(0, 1, 2);
const vec3 CLOUD_REGION_WEIGHTS = vec3(0.5, 0.3, 0.2);
const float CLOUD_REGION_SWING = 1.6;
const float CLOUD_FLAT_BASE_SHARE = 0.12;
const float CLOUD_DOME_START_SHARE = 0.35;
const float CLOUD_SUN_PROBE_SHARE = 0.35;
const float CLOUD_SCATTERED_SHARE = 0.2;
const float CLOUD_SCATTERED_REACH = 0.25;
const float CLOUD_FORWARD_GLOW = 1.6;
const float CLOUD_SKY_LIGHT = 0.5;
const int CLOUD_ALL_CELL_OCTAVES = 4;
const int CLOUD_COARSE_CELL_OCTAVES = 2;
const int CLOUD_SHADOW_SAMPLES = 3;
const float CLOUD_LEAST_COVERAGE = 0.01;
const float CLOUD_OPAQUE_CLEARNESS = 0.02;
uniform sampler2D uCloudBillows;
const float SKY_BRIGHTNESS = 0.9;
const float SKY_VEIL_GAIN = 2.5;
const float OVERCAST_SKY_LIGHT = 0.9;
const float OVERCAST_VEIL_GAIN = 2.0;
const float GROUND_GRAIN = 0.25;
const int GROUND_OCTAVES = ${GROUND_OCTAVES};

ivec3 octaveCells(int octave) {
  return uGroundAnchor * (2 << octave);
}

uniform highp sampler3D uGroundDetail;

vec4 groundDetail(int octave, vec3 offset, float cell, int seed) {
  vec3 cells = vec3(octaveCells(octave) & ivec3(${GROUND_DETAIL_PERIOD_CELLS - 1}));
  vec3 shifted = cells + offset / cell + fract(float(seed + 1) * vec3(0.618034, 0.414214, 0.732051)) * ${GROUND_DETAIL_PERIOD_CELLS}.0;
  vec4 texel = texture(uGroundDetail, fract(shifted / ${GROUND_DETAIL_PERIOD_CELLS}.0));
  return vec4((texel.rgb * 2.0 - 1.0) * ${GROUND_DETAIL_SLOPE_RANGE.toFixed(1)} / cell, texel.a);
}

float octaveFade(float cell, float footprint) {
  return clamp(log2(cell / footprint) - 1.0, 0.0, 1.0);
}

vec3 slopeFinerThanMesh(vec3 offset, float footprint, float meshSpacing) {
  vec3 slope = vec3(0.0);
  int coarsestMissing = max(0, int(floor(log2(ANCHOR_METRES / (4.0 * meshSpacing)))));
  int finestSeen = min(GROUND_OCTAVES - 1, int(ceil(log2(ANCHOR_METRES / (2.0 * footprint)))) - 2);
  for (int octave = coarsestMissing; octave <= finestSeen; octave++) {
    float cell = ANCHOR_METRES / float(2 << octave);
    float finer = octaveFade(cell, footprint) - octaveFade(cell, meshSpacing);
    slope += max(finer, 0.0) * uGroundRoughness * cell * groundDetail(octave, offset, cell, octave).xyz;
  }
  return slope;
}

vec2 groundUv(vec3 up) {
  vec3 camera = uGroundCameraUp;
  float across = length(up.xy);
  float cameraAcross = length(camera.xy);
  float eastOfCamera = atan(camera.x * up.y - camera.y * up.x, camera.x * up.x + camera.y * up.y);
  float northOfCamera = atan(up.z * cameraAcross - camera.z * across, across * cameraAcross + up.z * camera.z);
  return uGroundCameraUv + vec2(eastOfCamera / 6.2831853, -northOfCamera / 3.1415927);
}

float groundLayer() {
  return uBodyMap[uGround].x;
}

vec3 groundLocal(vec3 direction) {
  return vec3(dot(direction, uGroundMeridian), dot(direction, cross(uBodyNorth[uGround], uGroundMeridian)), dot(direction, uBodyNorth[uGround]));
}

float cameraAltitudeKm() {
  return uGroundExcess / (sqrt(uGroundRadius * uGroundRadius + uGroundExcess) + uGroundRadius);
}

float airDensityHere() {
  return exp(-max(cameraAltitudeKm(), 0.0) / uGroundAir.w);
}

vec3 groundSky(vec3 ray, vec3 sun, vec3 upHere) {
  if (uGroundAir.w <= 0.0) return vec3(0.0);
  float density = airDensityHere();
  float viewHeight = dot(ray, upHere);
  float sunHeight = dot(sun, upHere);
  float day = smoothstep(-0.15, 0.05, sunHeight);
  float airmass = density / (max(viewHeight, 0.0) + 0.05);
  float lowSun = 1.0 - smoothstep(0.0, 0.35, sunHeight);
  vec3 tint = mix(uGroundAir.rgb, uGroundSunset, lowSun * pow(1.0 - max(viewHeight, 0.0), 3.0));
  vec3 sky = tint * (1.0 - exp(-airmass * 0.35)) * day * SKY_BRIGHTNESS;
  float towardSun = max(dot(ray, sun), 0.0);
  sky += mix(uGroundGlow.rgb, uGroundSunset, lowSun) * density * day * (0.5 * pow(towardSun, 12.0) + 0.15 * pow(towardSun, 3.0));
  vec3 overcastSky = uGroundAir.rgb * day * SKY_BRIGHTNESS * (0.55 + 0.45 * max(viewHeight, 0.0)) * (0.8 + 0.4 * towardSun * towardSun);
  return mix(sky, overcastSky, uGroundOvercast);
}

vec3 sunlightThroughAir(vec3 sun, vec3 upHere) {
  if (uGroundAir.w <= 0.0) return vec3(1.0);
  float airmass = 1.0 / (max(dot(sun, upHere), 0.0) + 0.04);
  return exp(-airmass * 0.06 * (vec3(1.0) - uGroundAir.rgb * 0.8));
}

bool cloudsHere() {
  return uGroundClouds.y > uGroundClouds.x;
}

vec2 shellCrossings(float altitudeKm, vec3 ray) {
  float shell = uGroundRadius + altitudeKm;
  float b = dot(uGroundCamera, ray);
  float c = uGroundExcess - (shell * shell - uGroundRadius * uGroundRadius);
  float disc = b * b - c;
  if (disc < 0.0) return vec2(-1.0);
  float root = sqrt(disc);
  return vec2(-b - root, -b + root);
}

vec2 cloudSlabSpan(vec3 ray) {
  float altitude = cameraAltitudeKm();
  vec2 base = shellCrossings(uGroundClouds.x, ray);
  vec2 top = shellCrossings(uGroundClouds.y, ray);
  float baseAhead = base.x > 0.0 ? base.x : -1.0;
  if (altitude < uGroundClouds.x) return vec2(base.y, top.y);
  if (altitude < uGroundClouds.y) return vec2(0.0, baseAhead > 0.0 ? baseAhead : top.y);
  if (top.x <= 0.0) return vec2(-1.0);
  return vec2(top.x, baseAhead > 0.0 ? baseAhead : top.y);
}

float cloudHeightErosion(float share) {
  float flatBase = smoothstep(0.0, CLOUD_FLAT_BASE_SHARE, share);
  float dome = smoothstep(CLOUD_DOME_START_SHARE, 1.0, share);
  return CLOUD_DOME_EROSION * (1.0 - flatBase * (1.0 - dome));
}

float cloudCoverageAt(vec3 up) {
  return smoothstep(CLOUD_CLEAR_BILLOWS, CLOUD_OVERCAST_BILLOWS, textureLod(uCloudBillows, groundUv(up), 0.0).r + uGroundClouds.w);
}

float cloudRegionalCoverage(float coverage, vec3 offset) {
  float region = 0.0;
  for (int i = 0; i < 3; i++) {
    int octave = CLOUD_REGION_OCTAVES[i];
    region += CLOUD_REGION_WEIGHTS[i] * (groundDetail(octave, offset, ANCHOR_METRES / float(2 << octave), 970 + i).w - 0.5);
  }
  return clamp(coverage * (1.0 + CLOUD_REGION_SWING * region * 2.0), 0.0, 1.0);
}

float cloudCells(vec3 offset, float blurMetres, int octaves) {
  float cells = 0.0;
  for (int i = 0; i < octaves; i++) {
    int octave = CLOUD_CELL_OCTAVES[i];
    float cell = ANCHOR_METRES / float(2 << octave);
    cells += CLOUD_CELL_WEIGHTS[i] * octaveFade(cell, blurMetres) * (groundDetail(octave, offset, cell, 950 + i).w - 0.5);
  }
  return 0.5 + CLOUD_CELL_CONTRAST * cells;
}

float cloudDensityFor(float coverage, vec3 offset, float share, float blurMetres, int octaves) {
  float threshold = mix(CLOUD_SPARSEST_CELL, CLOUD_DENSEST_CELL, coverage);
  float coarsestCell = ANCHOR_METRES / float(2 << 3);
  float softness = mix(CLOUD_BLURRED_SOFTNESS, CLOUD_EDGE_SOFTNESS, octaveFade(coarsestCell, blurMetres));
  return smoothstep(threshold - 0.5 * softness, threshold + 0.5 * softness, cloudCells(offset, blurMetres, octaves) - cloudHeightErosion(share));
}

float cloudDensity(float coverage, vec3 fromCamera, float blurMetres, int octaves) {
  float altitude = length(uGroundCamera + fromCamera) - uGroundRadius;
  float share = (altitude - uGroundClouds.x) / (uGroundClouds.y - uGroundClouds.x);
  if (share < 0.0 || share > 1.0) return 0.0;
  return cloudDensityFor(coverage, uGroundFromAnchor + fromCamera * 1000.0, share, blurMetres, octaves);
}

uniform float uCloudFrame;

vec4 cloudsSeenFrom(vec3 ray, vec3 sun, float nearestSolidKm, out float depthKm) {
  depthKm = -1.0;
  if (!cloudsHere()) return vec4(0.0);
  vec2 span = cloudSlabSpan(ray);
  float enter = max(span.x, 0.0);
  float leave = min(min(span.y, nearestSolidKm), enter + CLOUD_LONGEST_MARCH_KM);
  if (span.y <= 0.0 || leave <= enter) return vec4(0.0);
  depthKm = 0.5 * (enter + leave);
  ivec2 pixel = ivec2(gl_FragCoord.xy) & 1;
  float jitter = fract((float(CLOUD_JITTER_ORDER[pixel.x + 2 * pixel.y]) + 0.5) / 4.0 + uCloudFrame * CLOUD_GOLDEN_STEP);
  float coverageIn = cloudCoverageAt(normalize(uGroundCamera + ray * enter));
  float coverageOut = cloudCoverageAt(normalize(uGroundCamera + ray * leave));
  if (max(coverageIn, coverageOut) < CLOUD_LEAST_COVERAGE) return vec4(0.0);
  float depthWeight = 0.0;
  float weightedDepth = 0.0;
  float sunProbeKm = CLOUD_SUN_PROBE_SHARE * (uGroundClouds.y - uGroundClouds.x);
  float phase = 1.0 + CLOUD_FORWARD_GLOW * pow(max(dot(ray, sun), 0.0), 6.0);
  vec3 skyBehind = groundSky(ray, sun, normalize(uGroundCamera));
  float hazePerKm = uGroundAir.w > 0.0 ? airDensityHere() / uGroundGlow.w : 0.0;
  float clear = 1.0;
  vec3 light = vec3(0.0);
  for (int i = 0; i < CLOUD_STEPS && clear >= CLOUD_OPAQUE_CLEARNESS; i++) {
    float along = (float(i) + jitter) / float(CLOUD_STEPS);
    float t = mix(enter, leave, along * along);
    float stepKm = (leave - enter) * 2.0 * max(along, 0.5 / float(CLOUD_STEPS)) / float(CLOUD_STEPS);
    float coverage = cloudRegionalCoverage(mix(coverageIn, coverageOut, along * along), uGroundFromAnchor + ray * t * 1000.0);
    float blurMetres = max(uPixelAngle * t, CLOUD_STEP_BLUR_SHARE * stepKm) * 1000.0;
    float density = cloudDensity(coverage, ray * t, blurMetres, CLOUD_ALL_CELL_OCTAVES);
    if (density > 0.0) {
      vec3 up = normalize(uGroundCamera + ray * t);
      float above = cloudDensity(coverage, ray * t + sun * sunProbeKm, blurMetres, CLOUD_COARSE_CELL_OCTAVES);
      float depthTowardSun = uGroundClouds.z * above * sunProbeKm;
      float sunThrough = max(exp(-depthTowardSun), CLOUD_SCATTERED_SHARE * exp(-CLOUD_SCATTERED_REACH * depthTowardSun));
      float sunHeight = dot(sun, up);
      float daylight = smoothstep(-0.05, 0.05, sunHeight);
      vec3 sunlit = sunlightThroughAir(sun, up) * sunThrough * phase * max(sunHeight, 0.0);
      vec3 skylit = mix(vec3(dot(uGroundAir.rgb, vec3(0.3, 0.5, 0.2))), uGroundAir.rgb, 0.5) * CLOUD_SKY_LIGHT * smoothstep(-0.15, 0.1, sunHeight);
      float opacity = 1.0 - exp(-uGroundClouds.z * density * stepKm);
      float share = (length(uGroundCamera + ray * t) - uGroundRadius - uGroundClouds.x) / (uGroundClouds.y - uGroundClouds.x);
      vec3 scattered = CLOUD_LIT_ALBEDO * (sunlit * daylight + skylit * mix(CLOUD_DARK_BASE_SHARE, 1.0, share));
      light += clear * opacity * mix(scattered, skyBehind, 1.0 - exp(-t * hazePerKm));
      depthWeight += clear * opacity;
      weightedDepth += clear * opacity * t;
      clear *= 1.0 - opacity;
    }
  }
  if (depthWeight > CLOUD_LEAST_COVERAGE) depthKm = weightedDepth / depthWeight;
  return vec4(light, 1.0 - clear);
}

float sunThroughClouds(vec3 up, vec3 sun, vec3 offset, float footprint) {
  if (!cloudsHere()) return 1.0;
  float sunHeight = max(dot(sun, up), 0.05);
  float towardSunKm = 0.5 * (uGroundClouds.x + uGroundClouds.y) / sunHeight;
  float coverage = cloudRegionalCoverage(cloudCoverageAt(normalize(up * uGroundRadius + sun * towardSunKm)), offset + sun * towardSunKm * 1000.0);
  if (coverage < CLOUD_LEAST_COVERAGE) return 1.0;
  float thicknessKm = uGroundClouds.y - uGroundClouds.x;
  float density = 0.0;
  for (int i = 0; i < CLOUD_SHADOW_SAMPLES; i++) {
    float share = (float(i) + 0.5) / float(CLOUD_SHADOW_SAMPLES);
    float alongKm = (uGroundClouds.x + share * thicknessKm) / sunHeight;
    density += cloudDensityFor(coverage, offset + sun * alongKm * 1000.0, share, max(footprint, CLOUD_SHADOW_BLUR_METRES), CLOUD_COARSE_CELL_OCTAVES);
  }
  return exp(-uGroundClouds.z * density / float(CLOUD_SHADOW_SAMPLES) * thicknessKm / sunHeight);
}

vec3 shadeGround(vec3 up, vec3 offset, vec3 normal, bool water, float t, float footprint, vec3 ray, vec3 sun, vec3 upHere, float sunVisible) {
  vec3 albedo = textureLod(uBodyColour, vec3(groundUv(up), groundLayer()), 0.0).rgb;
  float fineCell = ANCHOR_METRES / float(2 << 12);
  float coarseCell = ANCHOR_METRES / float(2 << 7);
  float grain = octaveFade(fineCell, footprint) * (groundDetail(12, offset, fineCell, 900).w - 0.5)
    + octaveFade(coarseCell, footprint) * (groundDetail(7, offset, coarseCell, 901).w - 0.5);
  albedo *= 1.0 + GROUND_GRAIN * grain;
  vec3 sunlight = sunlightThroughAir(sun, up);
  float sunHeight = dot(sun, up);
  float shadow = sunHeight > -0.05 ? sunVisible * (1.0 - uGroundOvercast) * sunThroughClouds(up, sun, offset, footprint) : 0.0;
  float skyDome = 0.5 + 0.5 * dot(normal, up);
  vec3 ambient = uGroundAir.w > 0.0 ? uGroundAir.rgb * (0.18 + OVERCAST_SKY_LIGHT * uGroundOvercast * skyDome) * smoothstep(-0.15, 0.1, sunHeight) : vec3(0.0);
  vec3 lit;
  if (water) {
    vec3 halfway = normalize(sun - ray);
    float facing = clamp(dot(-ray, normal), 0.0, 1.0);
    float fresnel = WATER_FRESNEL_HEAD_ON + (1.0 - WATER_FRESNEL_HEAD_ON) * pow(1.0 - facing, 5.0);
    vec3 skyInWater = groundSky(normalize(reflect(ray, normal) + normal * 0.02), sun, up);
    lit = OCEAN_ALBEDO * (max(sunHeight, 0.0) * sunlight * shadow + ambient) * (1.0 - fresnel) + skyInWater * fresnel + sunlight * shadow * OCEAN_GLINT * pow(max(dot(normal, halfway), 0.0), OCEAN_SHININESS);
  } else {
    lit = albedo * (max(dot(normal, sun), 0.0) * sunlight * shadow + ambient);
  }
  if (uGroundAir.w > 0.0) {
    float haze = 1.0 - exp(-t * airDensityHere() / uGroundGlow.w);
    lit = mix(lit, groundSky(normalize(ray + upHere * 0.02), sun, upHere), haze);
  }
  return lit;
}

vec4 skyOverGround(vec3 direction) {
  vec3 ray = groundLocal(direction);
  vec3 sun = groundLocal(uBodySun[uGround]);
  vec3 sky = groundSky(ray, sun, normalize(uGroundCamera));
  float veil = max(clamp(dot(sky, vec3(0.3, 0.5, 0.2)) * SKY_VEIL_GAIN, 0.0, 1.0), min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN));
  return vec4(sky, veil);
}

uniform vec4 uPlanet;
uniform vec3 uPlanetSun;
uniform vec3 uPlanetNorth;
uniform float uPlanetSpin;

vec3 planetSurface(vec3 normal) {
  float c = cos(uPlanetSpin);
  float s = sin(uPlanetSpin);
  vec3 body = normal * c + cross(uPlanetNorth, normal) * s + uPlanetNorth * dot(uPlanetNorth, normal) * (1.0 - c);
  float land = terrain(body * 1.7);
  vec3 ocean = mix(vec3(0.01, 0.04, 0.13), vec3(0.03, 0.1, 0.26), smoothstep(0.3, 0.52, land));
  vec3 ground = mix(vec3(0.13, 0.22, 0.08), vec3(0.42, 0.34, 0.22), smoothstep(0.58, 0.72, land));
  vec3 surface = land > 0.53 ? ground : ocean;
  float latitude = abs(dot(normal, uPlanetNorth));
  surface = mix(surface, vec3(0.85), smoothstep(0.86, 0.9, latitude + 0.05 * land));
  float cloud = smoothstep(0.5, 0.68, terrain(body * 3.4 + vec3(4.1, 1.7, 8.3)));
  return mix(surface, vec3(0.9), 0.85 * cloud);
}

vec4 planetColour(vec3 direction) {
  if (uPlanet.w <= 0.0) return vec4(0.0);
  float radius = sin(uPlanet.w);
  float along = dot(direction, uPlanet.xyz);
  vec3 fromCentre = direction * along - uPlanet.xyz;
  float miss = length(fromCentre);
  float haloEdge = radius * 1.035;
  if (along <= 0.0 || miss > haloEdge) return vec4(0.0);
  vec3 edgeNormal = fromCentre / max(miss, 1e-12);
  float edgeLit = smoothstep(-0.25, 0.35, dot(edgeNormal, uPlanetSun));
  float haze = 1.0 - smoothstep(radius, haloEdge, miss);
  vec3 halo = vec3(0.25, 0.5, 1.0) * haze * haze * edgeLit * 0.7;
  float cover = clamp((radius - miss) / max(fwidth(miss), 1e-9) + 0.5, 0.0, 1.0);
  if (cover <= 0.0) return vec4(halo, 0.0);
  float inside = min(miss, radius * 0.9999);
  float hit = along - sqrt(radius * radius - inside * inside);
  vec3 normal = normalize(direction * hit - uPlanet.xyz);
  float sunlit = max(dot(normal, uPlanetSun), 0.0);
  float limb = pow(1.0 - max(dot(normal, -direction), 0.0), 3.0);
  vec3 lit = planetSurface(normal) * sunlit + vec3(0.2, 0.4, 0.9) * limb * smoothstep(-0.15, 0.4, dot(normal, uPlanetSun));
  return vec4(mix(halo, lit, cover), cover);
}

vec3 warpedSky(vec3 direction) {
  vec2 look = warpLookup(acos(clamp(dot(direction, uWarpAxis.xyz), -1.0, 1.0)));
  if (look.x < 0.0) return vec3(0.0);
  vec3 bands = max(texture(uSkyCube, atAngleFromAxis(direction, look.x)).rgb, vec3(0.0));
  return blueshifted(bands, pow(10.0, look.y));
}

float glare(vec3 direction) {
  if (uGlareLux <= 0.0) return 0.0;
  vec3 axis = uWarpAxis.xyz;
  float degreesOff = max(degrees(acos(clamp(dot(direction, axis), -1.0, 1.0))), 0.1);
  float veil = 10.0 * uGlareLux / (degreesOff * degreesOff);
  vec3 across = normalize(uUp - axis * dot(uUp, axis));
  float turn = atan(dot(direction, cross(axis, across)), dot(direction, across));
  float spikes = 0.0;
  for (int i = 0; i < 18; i++) {
    float spikeTurn = float(hashUint(uint(i) * 2654435761u) % 6283u) / 1000.0;
    float strength = 0.4 + float(hashUint(uint(i) * 40503u + 7u) % 1000u) / 1000.0;
    float gap = abs(mod(turn - spikeTurn + HALF_TURN, 2.0 * HALF_TURN) - HALF_TURN);
    spikes += strength * exp(-gap * gap / 6e-5) * exp(-degreesOff / (3.0 + 9.0 * strength));
  }
  return veil * (1.0 + 6.0 * spikes * degreesOff) / 1.08e-4;
}

const float LONG_EXPOSURE_SATURATION = 1.5;
const float PHOTO_KNEE_LOG = -4.7;
const float PHOTO_WHITE_LOG = -3.0;

float nakedEyeLightness(float logSeen, float colourShare) {
  float lightness = clamp((logSeen + 5.6) / 5.1, 0.0, 1.0);
  lightness = lightness * lightness * smoothstep(-6.2, -5.4, logSeen);
  return lightness + grain() * 0.06 * (1.0 - colourShare) * smoothstep(-6.6, -5.0, logSeen);
}

float photoLightness(float logSeen) {
  float overKnee = pow(10.0, logSeen - PHOTO_KNEE_LOG);
  return clamp(asinh(overKnee) / asinh(pow(10.0, PHOTO_WHITE_LOG - PHOTO_KNEE_LOG)), 0.0, 1.0);
}

const float LOCAL_CONTRAST = 1.5;
const float LOCAL_CONTRAST_RADIUS = 0.025;
const int LOCAL_CONTRAST_TAPS = 12;

float broadbandAt(vec2 uv) {
  return dot(max(texture(uSky, uv).rgb, vec3(0.0)) / uWhiteBalance, vec3(1.0 / 3.0));
}

float localContrastGain(float here) {
  vec2 step = LOCAL_CONTRAST_RADIUS * vec2(uTanHalf.y / uTanHalf.x, 1.0);
  float background = 0.0;
  for (int i = 0; i < LOCAL_CONTRAST_TAPS; i++) {
    float angle = 6.2831853 * float(i) / float(LOCAL_CONTRAST_TAPS);
    vec2 direction = vec2(cos(angle), sin(angle));
    background += broadbandAt(vUv + direction * step) + broadbandAt(vUv + direction * step * 2.0);
  }
  background /= float(2 * LOCAL_CONTRAST_TAPS);
  return pow(clamp(here / max(background, 1e-12), 0.25, 4.0), LOCAL_CONTRAST);
}

vec3 directionBeforeWarp(vec3 direction) {
  if (uWarpAxis.w < 0.5) return direction;
  vec2 look = warpLookup(acos(clamp(dot(direction, uWarpAxis.xyz), -1.0, 1.0)));
  return look.x < 0.0 ? vec3(0.0) : atAngleFromAxis(direction, look.x);
}

vec3 boostSaturation(vec3 tint, float amount) {
  float grey = dot(tint, vec3(0.3, 0.5, 0.2));
  vec3 pushed = max(mix(vec3(grey), tint, amount), vec3(0.0));
  return pushed / max(max(pushed.r, pushed.g), max(pushed.b, 1e-9));
}

vec3 viewDirection() {
  vec2 ndc = vUv * 2.0 - 1.0;
  return normalize(uForward + uRight * ndc.x * uTanHalf.x + uUp * ndc.y * uTanHalf.y);
}
`;

export const GROUND_SKY_FRAGMENT = `#version 300 es
${EYE_SHARED}
void main() {
  outColour = skyOverGround(viewDirection());
}`;

const NEAREST_SEEN_METRES = 0.05;
const FARTHEST_SEEN_METRES = 1e8;

export const PATCH_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in float aWet;
layout(location = 3) in vec3 aTowardParent;
layout(location = 4) in vec3 aParentNormal;
uniform vec3 uPatchFromCamera;
uniform vec3 uPatchCentreKm;
uniform vec3 uMorph;
uniform vec3 uLocalRight;
uniform vec3 uLocalUp;
uniform vec3 uLocalForward;
uniform vec2 uTanHalf;
out vec2 vUv;
out vec3 vFromCamera;
out vec3 vNormal;
out vec3 vUpward;
out float vWet;
void main() {
  float detail = uMorph.x <= 0.0 ? 1.0 : clamp((uMorph.x - length(uPatchFromCamera + aPosition)) / max(uMorph.x - uMorph.y, 1e-3), 0.0, 1.0) * uMorph.z;
  vec3 position = aPosition + aTowardParent * (1.0 - detail);
  vec3 fromCamera = uPatchFromCamera + position;
  vec3 seen = vec3(dot(fromCamera, uLocalRight), dot(fromCamera, uLocalUp), dot(fromCamera, uLocalForward));
  vUv = vec2(0.0);
  vFromCamera = fromCamera;
  vNormal = mix(aParentNormal, aNormal, detail);
  vUpward = uPatchCentreKm + position / 1000.0;
  vWet = aWet;
  float depth = log2(max(seen.z, ${NEAREST_SEEN_METRES} * 0.5) / ${NEAREST_SEEN_METRES}) / log2(${FARTHEST_SEEN_METRES.toFixed(1)} / ${NEAREST_SEEN_METRES});
  gl_Position = vec4(seen.x / uTanHalf.x, seen.y / uTanHalf.y, (2.0 * depth - 1.0) * seen.z, seen.z);
}`;

export const SHADOW_CASCADES = 2;

export const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform vec3 uPatchFromCamera;
uniform vec3 uShadowRight;
uniform vec3 uShadowUp;
uniform vec3 uShadowSun;
uniform vec4 uShadowCascade;
void main() {
  vec3 p = uPatchFromCamera + aPosition;
  gl_Position = vec4((vec2(dot(p, uShadowRight), dot(p, uShadowUp)) - uShadowCascade.xy) / uShadowCascade.z, -dot(p, uShadowSun) / uShadowCascade.w, 1.0);
}`;

export const SHADOW_FRAGMENT = `#version 300 es
precision highp float;
void main() {}`;

export const CLOUD_BAKED_OCTAVES = 2;

export const CLOUD_BILLOWS_FRAGMENT = `#version 300 es
${EYE_SHARED}
void main() {
  float longitude = (vUv.x - 0.5) * 6.2831853;
  float latitude = (0.5 - vUv.y) * 3.1415927;
  vec3 local = vec3(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
  float mapTexel = 6.2831853 / MAP_WIDTH;
  outColour = vec4(cloudBillows(local, local / mapTexel, ${CLOUD_BAKED_OCTAVES}.0), 0.0, 0.0, 1.0);
}`;

export const PATCH_FRAGMENT = `#version 300 es
${EYE_SHARED}
in vec3 vFromCamera;
in vec3 vNormal;
in vec3 vUpward;
in float vWet;
uniform float uPatchSpacing;
uniform highp sampler2DArrayShadow uShadowMaps;
uniform vec3 uShadowRight;
uniform vec3 uShadowUp;
uniform vec3 uShadowSun;
uniform vec4 uShadowCascades[${SHADOW_CASCADES}];
uniform float uShadowsOn;

const float SHADOW_MAP_SIZE = ${SHADOW_MAP_SIZE}.0;
const float SHADOW_NORMAL_OFFSET_TEXELS = 1.5;
const float SHADOW_DEPTH_BIAS_TEXELS = 1.0;
const float SHADOW_MAP_EDGE = 0.98;

float sunVisibleAt(vec3 fromCamera, vec3 normal) {
  if (uShadowsOn < 0.5) return 1.0;
  for (int i = 0; i < ${SHADOW_CASCADES}; i++) {
    vec4 cascade = uShadowCascades[i];
    float texel = 2.0 * cascade.z / SHADOW_MAP_SIZE;
    vec3 p = fromCamera + normal * texel * SHADOW_NORMAL_OFFSET_TEXELS;
    vec2 across = (vec2(dot(p, uShadowRight), dot(p, uShadowUp)) - cascade.xy) / cascade.z;
    if (max(abs(across.x), abs(across.y)) > SHADOW_MAP_EDGE) continue;
    float depth = 0.5 - 0.5 * dot(p, uShadowSun) / cascade.w - texel * SHADOW_DEPTH_BIAS_TEXELS / (2.0 * cascade.w);
    vec2 uv = across * 0.5 + 0.5;
    float lit = 0.0;
    for (int tap = 0; tap < 4; tap++) lit += texture(uShadowMaps, vec4(uv + (vec2(tap & 1, tap >> 1) - 0.5) / SHADOW_MAP_SIZE, float(i), depth));
    return lit * 0.25;
  }
  return 1.0;
}

void main() {
  float distance = length(vFromCamera);
  vec3 ray = vFromCamera / distance;
  vec3 sun = groundLocal(uBodySun[uGround]);
  vec3 up = normalize(vUpward);
  bool water = vWet > 0.5;
  float footprint = max(distance * uPixelAngle, ${NEAREST_SEEN_METRES});
  vec3 slope = water ? vec3(0.0) : slopeFinerThanMesh(uGroundFromAnchor + vFromCamera, footprint, uPatchSpacing);
  vec3 normal = water ? up : normalize(normalize(vNormal) - (slope - up * dot(slope, up)));
  float sunVisible = sunVisibleAt(vFromCamera, normalize(vNormal));
  vec3 lit = shadeGround(up, uGroundFromAnchor + vFromCamera, normal, water, distance / 1000.0, footprint, ray, sun, normalize(uGroundCamera), sunVisible);
  outColour = vec4(lit, GROUND_HIT + distance / 1000.0);
}`;

export const CLOUD_FRAGMENT = `#version 300 es
${EYE_SHARED}
uniform sampler2D uGroundView;

const float UNBLOCKED_KM = 1e9;

float farthestGroundKm() {
  ivec2 last = textureSize(uGroundView, 0) - 1;
  ivec2 corner = ivec2(gl_FragCoord.xy) * 2;
  float farthest = 0.0;
  for (int i = 0; i < 4; i++) {
    float hit = texelFetch(uGroundView, min(corner + ivec2(i & 1, i >> 1), last), 0).a;
    farthest = max(farthest, hit >= GROUND_HIT ? hit - GROUND_HIT : UNBLOCKED_KM);
  }
  return farthest;
}

uniform sampler2D uCloudHistory;
uniform sampler2D uCloudHistoryDepth;
uniform float uCloudHistoryOn;
uniform vec3 uPreviousLocalRight;
uniform vec3 uPreviousLocalUp;
uniform vec3 uPreviousLocalForward;
uniform vec3 uPreviousGroundCamera;
uniform vec2 uPreviousTanHalf;
layout(location = 1) out vec4 outCloudDepth;

const float CLOUD_HISTORY_WEIGHT = 0.85;
const float CLOUD_HISTORY_DEPTH_TOLERANCE = 0.15;

vec2 previousUv(vec3 fromPrevious) {
  float ahead = dot(fromPrevious, uPreviousLocalForward);
  if (ahead <= 0.0) return vec2(-1.0);
  return vec2(dot(fromPrevious, uPreviousLocalRight) / (ahead * uPreviousTanHalf.x), dot(fromPrevious, uPreviousLocalUp) / (ahead * uPreviousTanHalf.y)) * 0.5 + 0.5;
}

void main() {
  vec3 ray = groundLocal(viewDirection());
  float depthKm;
  vec4 current = cloudsSeenFrom(ray, groundLocal(uBodySun[uGround]), farthestGroundKm(), depthKm);
  outColour = current;
  outCloudDepth = vec4(depthKm, 0.0, 0.0, 1.0);
  if (uCloudHistoryOn < 0.5 || depthKm <= 0.0) return;
  vec3 fromPrevious = uGroundCamera + ray * depthKm - uPreviousGroundCamera;
  vec2 uv = previousUv(fromPrevious);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return;
  float expected = length(fromPrevious);
  if (abs(texture(uCloudHistoryDepth, uv).r - expected) > CLOUD_HISTORY_DEPTH_TOLERANCE * expected) return;
  outColour = mix(current, texture(uCloudHistory, uv), CLOUD_HISTORY_WEIGHT);
}`;

export const EYE_FRAGMENT = `#version 300 es
${EYE_SHARED}
uniform sampler2D uGroundView;
uniform sampler2D uCloudView;
uniform float uCloudsOn;

float starVeil = 0.0;

vec4 groundSeen() {
  vec4 ground = texture(uGroundView, vUv);
  vec4 cloud = vec4(0.0);
  if (uCloudsOn > 0.5) {
    vec2 texel = 1.0 / vec2(textureSize(uCloudView, 0));
    for (int i = 0; i < 4; i++) cloud += 0.25 * texture(uCloudView, vUv + (vec2(i & 1, i >> 1) - 0.5) * texel);
  }
  float solid = ground.a >= GROUND_HIT ? 1.0 : 0.0;
  starVeil = max(max(solid, cloud.a), min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN)) * uGroundBlend;
  return vec4(ground.rgb * (1.0 - cloud.a) + cloud.rgb, max(min(ground.a, 1.0), cloud.a)) * uGroundBlend;
}

const float SUN_GLARE_CORE = 0.6;
const float SUN_GLARE_CORE_DEGREES = 0.7;
const float SUN_GLARE_WIDE = 0.15;
const float SUN_GLARE_WIDE_DEGREES = 6.0;

int sunIndex() {
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    if (uBodyLook[i].w == STAR_KIND) return i;
  }
  return -1;
}

float starVeilAt(vec2 uv) {
  float solid = texture(uGroundView, uv).a >= GROUND_HIT ? 1.0 : 0.0;
  float cloud = uCloudsOn > 0.5 ? texture(uCloudView, uv).a : 0.0;
  return max(max(solid, cloud), min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN)) * uGroundBlend;
}

float sunVisibleFromGround(vec3 toSun) {
  float ahead = dot(toSun, uForward);
  vec2 uv = vec2(dot(toSun, uRight) / (ahead * uTanHalf.x), dot(toSun, uUp) / (ahead * uTanHalf.y)) * 0.5 + 0.5;
  if (ahead > 0.0 && all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) return 1.0 - starVeilAt(uv);
  float aboveHorizon = step(0.0, dot(groundLocal(uBodySun[uGround]), normalize(uGroundCamera)));
  return aboveHorizon * (1.0 - min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN) * uGroundBlend);
}

vec3 sunGlare(vec3 direction) {
  if (uGround < 0 || uWarpAxis.w > 0.5) return vec3(0.0);
  int sun = sunIndex();
  if (sun < 0) return vec3(0.0);
  vec3 toSun = uBodyPlace[sun].xyz;
  float degreesOff = degrees(acos(clamp(dot(direction, toSun), -1.0, 1.0)));
  float spread = SUN_GLARE_CORE * exp(-degreesOff / SUN_GLARE_CORE_DEGREES) + SUN_GLARE_WIDE * exp(-degreesOff / SUN_GLARE_WIDE_DEGREES);
  vec3 tint = uBodyLook[sun].rgb * sunlightThroughAir(groundLocal(uBodySun[uGround]), normalize(uGroundCamera));
  return tint * spread * sunVisibleFromGround(toSun) * uGroundBlend;
}

vec4 sceneSeen(vec3 direction) {
  vec4 planet = planetColour(direction);
  if (planet.a >= 1.0) {
    return vec4(planet.rgb, 1.0);
  }
  vec4 ground = uGround >= 0 && uWarpAxis.w < 0.5 ? groundSeen() : vec4(0.0);
  if (starVeil >= 1.0) {
    return vec4(ground.rgb, 1.0);
  }
  vec4 body = bodiesColour(directionBeforeWarp(direction));
  bool sunThroughAir = starHit && uGround >= 0 && uWarpAxis.w < 0.5;
  float bodyVeil = sunThroughAir ? starVeil : ground.a;
  if (sunThroughAir) body.rgb *= sunlightThroughAir(groundLocal(uBodySun[uGround]), normalize(uGroundCamera));
  if (body.a >= 1.0) {
    return vec4(body.rgb * (1.0 - bodyVeil) + ground.rgb, 1.0);
  }
  vec3 sky = uWarpAxis.w > 0.5 ? warpedSky(direction) + glare(direction) * uWhiteBalance : max(texture(uSky, vUv).rgb, vec3(0.0));
  float photopic = 1.08e-4 * sky.g;
  float scotopic = 1.08e-4 * (0.3 * sky.g + 0.7 * sky.b);
  float logPhotopic = log(max(photopic, 1e-12)) / log(10.0);
  float colourShare = max(smoothstep(-3.0, -0.5, logPhotopic), uLongExposure);
  float broadband = 1.08e-4 * dot(sky / uWhiteBalance, vec3(1.0 / 3.0));
  bool photo = uLongExposure > 0.5 && uWarpAxis.w < 0.5;
  float seen = photo ? broadband * localContrastGain(broadband / 1.08e-4) : mix(scotopic, photopic, colourShare);
  float logSeen = log(max(seen, 1e-12)) / log(10.0) - uAdaptation;
  float lightness = photo ? photoLightness(logSeen) : nakedEyeLightness(logSeen, colourShare);
  vec3 tint = sky / uWhiteBalance;
  tint /= max(max(tint.r, tint.g), max(tint.b, 1e-9));
  tint = boostSaturation(tint, mix(1.0, LONG_EXPOSURE_SATURATION, uLongExposure));
  vec3 colour = mix(vec3(0.86, 0.9, 1.0), tint, colourShare);
  vec3 behind = colour * max(lightness, 0.0) * (1.0 - body.a);
  vec3 throughAir = behind * (1.0 - ground.a) + body.rgb * (1.0 - bodyVeil) + ground.rgb;
  return vec4(mix(throughAir + planet.rgb, planet.rgb, planet.a), max(max(body.a, ground.a), planet.a));
}
void main() {
  vec3 direction = viewDirection();
  if (!seenThroughCockpit(direction)) {
    outColour = vec4(cabinColour(direction), 1.0);
    return;
  }
  vec4 scene = sceneSeen(direction);
  outColour = vec4(scene.rgb + sunGlare(direction), scene.a);
}`;

export const EYE_STAR_VERTEX = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aLook;
uniform vec3 uAnchorShift;
uniform vec3 uWhiteBalance;
uniform vec4 uPlanet;
${BODY_OCCLUDERS}
${COCKPIT}
${WARP}
out vec3 vColour;
out float vSpread;
out float vSize;
out float vGlare;
uniform float uLongExposure;

vec3 bandFluxes(float colour) {
  float redIndex = min(1.4, 0.62 * colour + 0.04);
  return vec3(pow(10.0, 0.4 * redIndex), 1.0, pow(10.0, -0.4 * colour));
}

float warpedAngle(float skyAngle, out float magnification) {
  int low = 0;
  int high = uWarpAngleCount - 1;
  for (int i = 0; i < 9; i++) {
    if (high - low <= 1) break;
    int middle = (low + high) / 2;
    vec2 probe = warpTexel(middle);
    if (probe.x >= 0.0 && probe.x <= skyAngle) low = middle;
    else high = middle;
  }
  vec2 a = warpTexel(low);
  vec2 b = warpTexel(low + 1);
  if (a.x < 0.0 || b.x <= a.x) return -1.0;
  float share = (skyAngle - a.x) / (b.x - a.x);
  if (share < -0.01 || share > 1.01) return -1.0;
  float angleLow = warpAngleOf(float(low));
  float angleHigh = warpAngleOf(float(low + 1));
  float observed = mix(angleLow, angleHigh, clamp(share, 0.0, 1.0));
  float slope = (b.x - a.x) / max(angleHigh - angleLow, 1e-12);
  magnification = skyAngle < 1e-6 ? 1.0 / (slope * slope) : sin(observed) / max(sin(skyAngle) * slope, 1e-12);
  return observed;
}

vec3 warpBrightening(float colour, float shift, float magnification) {
  vec3 physical = bandFluxes(colour) * uBandToPhysical;
  float kelvin = colourTemperature(physical.b / physical.g);
  return magnification * planckBands(kelvin * shift) / max(planckBands(kelvin), vec3(1e-30));
}

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
}

void main() {
  vec3 offset = aOffset - uAnchorShift;
  float distance = length(offset);
  vec3 seen = offset / distance;
  bool behindBodyBeforeWarp = behindBody(seen);
  vec3 warping = vec3(1.0);
  vGlare = 0.0;
  if (uWarpAxis.w > 0.5) {
    float magnification = 1.0;
    float observed = warpedAngle(acos(clamp(dot(seen, uWarpAxis.xyz), -1.0, 1.0)), magnification);
    if (observed < 0.0) {
      hide();
      return;
    }
    seen = atAngleFromAxis(seen, observed);
    warping = warpBrightening(aLook.y, pow(10.0, warpLookup(observed).y), magnification);
  }
  vec3 local = vec3(dot(seen, uRight), dot(seen, uUp), dot(seen, uForward));
  bool behindPlanet = (uPlanet.w > 0.0 && dot(seen, uPlanet.xyz) > cos(uPlanet.w)) || behindBodyBeforeWarp;
  if (local.z <= 0.0 || behindPlanet || !seenThroughCockpit(seen) || warping.g <= 0.0) {
    hide();
    return;
  }
  vec2 ndc = local.xy / local.z / uTanHalf;
  float apparent = aLook.x + 5.0 * log(distance / 10.0) / log(10.0);
  float tau = distance > 30.0 ? dustColumn(uCamera + offset, 10) : 0.0;
  vec3 extinction = exp(-tau * EXTINCTION_BANDS) * warping / warping.g;
  float seenMagnitude = apparent + 2.5 * tau / log(10.0) - 2.5 * log(warping.g) / log(10.0);
  float brightness = min(2.5, 0.2 * pow(10.0, 0.16 * (6.5 - seenMagnitude)));
  float colourShare = max(smoothstep(2.0, -1.0, seenMagnitude) * 0.75, uLongExposure);
  vec3 tint = bandFluxes(aLook.y) * extinction / uWhiteBalance;
  tint /= max(max(tint.r, tint.g), tint.b);
  vColour = mix(vec3(0.9, 0.93, 1.0), tint, colourShare) * brightness;
  vSpread = 1.0 + max(0.0, 4.0 - seenMagnitude) * 0.5;
  vGlare = clamp(-1.0 - seenMagnitude, 0.0, 10.0);
  vSize = seenMagnitude < 6.8 ? min(128.0, ceil(vSpread * 4.0 + vGlare * 10.0)) : 0.0;
  gl_PointSize = vSize;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const EYE_STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
in float vSpread;
in float vSize;
in float vGlare;
out vec4 outColour;
void main() {
  vec2 offset = (gl_PointCoord - 0.5) * vSize;
  float r2 = dot(offset, offset);
  float r = sqrt(r2);
  float core = exp(-r2 / (2.0 * 0.6 * 0.6 * vSpread * vSpread / 1.21));
  float halo = (0.05 + 0.06 * vGlare) * exp(-r / (0.9 * vSpread + 1.5 * vGlare));
  float edge = 1.0 - smoothstep(0.3 * vSize, 0.5 * vSize, r);
  outColour = vec4(vColour * (core + halo * edge), 1.0);
}`;

export const CAMERA_STAR_VERTEX = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aLook;
uniform vec3 uAnchorShift;
uniform float uElectronsPerNanomaggy;
uniform float uElectronsPerUnit;
uniform float uPsfPixels;
out vec3 vRate;
out float vSigma;
out float vSize;

vec3 bandFluxes(float colour) {
  float redIndex = min(1.4, 0.62 * colour + 0.04);
  return vec3(pow(10.0, 0.4 * redIndex), 1.0, pow(10.0, -0.4 * colour));
}

void main() {
  vec3 offset = aOffset - uAnchorShift;
  float distance = length(offset);
  vec3 local = vec3(dot(offset, uRight), dot(offset, uUp), dot(offset, uForward));
  if (local.z <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec2 ndc = local.xy / local.z / uTanHalf;
  float apparent = aLook.x + 5.0 * log(distance / 10.0) / log(10.0);
  float tau = distance > 30.0 ? dustColumn(uCamera + offset, 20) : 0.0;
  vec3 nanomaggies = pow(10.0, -0.4 * (apparent - 22.5)) * bandFluxes(aLook.y) * exp(-tau * EXTINCTION_BANDS);
  vRate = min(nanomaggies * uElectronsPerNanomaggy / uElectronsPerUnit, vec3(60000.0));
  vSigma = uPsfPixels;
  float brightness = max(vRate.g, max(vRate.r, vRate.b));
  float halo = brightness > 0.05 ? min(56.0, 6.0 * log(1.0 + brightness * 20.0)) : 0.0;
  vSize = min(64.0, ceil(2.0 * (4.0 * vSigma + halo) + 2.0));
  gl_PointSize = vSize;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const CAMERA_STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vRate;
in float vSigma;
in float vSize;
out vec4 outColour;
void main() {
  vec2 offset = (gl_PointCoord - 0.5) * vSize;
  float r2 = dot(offset, offset);
  float core = exp(-r2 / (2.0 * vSigma * vSigma)) / (6.2831853 * vSigma * vSigma);
  float wing = 3.0 * vSigma;
  float halo = 1.0 / (3.14159265 * wing * wing) / pow(1.0 + r2 / (wing * wing), 2.0);
  outColour = vec4(vRate * (0.94 * core + 0.06 * halo), 1.0);
}`;

export const SAMPLE_LOG_FLOOR = -40;
export const SAMPLE_LOG_SPAN = 64;

export const SAMPLE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSignal;
uniform int uBand;
uniform vec2 uStride;
out vec4 outColour;
void main() {
  float value = texelFetch(uSignal, ivec2(floor(gl_FragCoord.xy) * uStride), 0)[uBand];
  float level = clamp((log2(max(value, 1e-12)) - (${SAMPLE_LOG_FLOOR}.0)) / ${SAMPLE_LOG_SPAN}.0, 0.0, 1.0);
  float steps = floor(level * 65535.0 + 0.5);
  outColour = vec4(floor(steps / 256.0) / 255.0, mod(steps, 256.0) / 255.0, 0.0, 1.0);
}`;

export const DEVELOP_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSignal;
uniform float uElectronsPerUnit;
uniform vec2 uSize;
uniform float uSeconds;
uniform float uFrames;
uniform uint uSeed;
uniform float uReadNoise;
uniform float uDark;
uniform float uFullWell;
uniform vec3 uBlack;
uniform vec3 uWhite;
uniform float uStretch;
in vec2 vUv;
out vec4 outColour;

uint hashUint(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

float unit(uint h) {
  return (float(h) + 0.5) / 4294967296.0;
}

float gaussian(uint h) {
  float a = unit(h);
  float b = unit(hashUint(h ^ 0x68bc21ebu));
  return sqrt(-2.0 * log(a)) * cos(6.2831853 * b);
}

void main() {
  uvec2 pixel = uvec2(gl_FragCoord.xy);
  uint site = hashUint(pixel.x * 73856093u ^ pixel.y * 19349663u);
  vec3 rate = max(texture(uSignal, vUv).rgb, vec3(0.0)) * uElectronsPerUnit;
  vec3 electrons;
  for (int band = 0; band < 3; band++) {
    uint key = hashUint(site ^ hashUint(uSeed + uint(band) * 7777u));
    float mean = rate[band] * uSeconds + uDark * uSeconds;
    if (unit(hashUint(site + uint(band) * 31u)) < 3e-4) mean += 40.0 * uSeconds;
    float value = mean + sqrt(mean) * gaussian(key) + sqrt(uFrames) * uReadNoise * gaussian(hashUint(key + 1u));
    if (unit(hashUint(key + 2u)) < 4e-7 * uSeconds) value += 1500.0 + 4000.0 * unit(hashUint(key + 3u));
    electrons[band] = min(value, uFullWell * uFrames);
  }
  vec3 scaled = (electrons - uBlack) / max(uWhite - uBlack, vec3(1e-6));
  vec3 stretched = asinh(max(scaled, vec3(-0.05)) * uStretch) / asinh(uStretch);
  outColour = vec4(pow(clamp(stretched, 0.0, 1.0), vec3(1.0 / 2.2)), 1.0);
}`;
