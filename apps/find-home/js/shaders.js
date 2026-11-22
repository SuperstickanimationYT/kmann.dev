import { ANCHOR_METRES, COAST_DROP_METRES, COAST_OCTAVES, COAST_ROUGHNESS, CRATER_CHANCE, CRATER_FIRST_OCTAVE, CRATER_LAST_OCTAVE, GROUND_OCTAVES } from './terrain.js';

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
out vec4 outColour;

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

float cloudCover(vec3 local, vec3 detailPoint, float octaves) {
  float latitude = asin(clamp(local.z, -1.0, 1.0));
  vec3 swirl = vec3(terrain(local * 2.0), terrain(local * 2.0 + vec3(5.2)), terrain(local * 2.0 + vec3(9.1))) - 0.5;
  vec3 stretchedEastWest = local * CLOUD_SCALE * vec3(1.0, 1.0, CLOUD_STRETCH);
  float billows = terrain(stretchedEastWest + CLOUD_SWIRL * swirl) + CLOUD_DETAIL * detailNoise(detailPoint, octaves);
  float climate = 0.1 * latitudeBelt(latitude, 0.0, 0.1) - 0.15 * latitudeBelt(latitude, 0.45, 0.15) + 0.1 * latitudeBelt(latitude, 1.0, 0.2);
  return CLOUD_OPACITY * smoothstep(0.5, 0.75, billows + climate);
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
  if (mapped) {
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

vec4 bodiesColour(vec3 direction) {
  vec3 points = vec3(0.0);
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    if (i == uGround && uGroundBlend >= 1.0) continue;
    vec4 place = uBodyPlace[i];
    float along = dot(direction, place.xyz);
    if (along <= 0.0) continue;
    float radius = sin(place.w);
    float miss = length(direction * along - place.xyz);
    float pointSigma = POINT_SIGMA_PIXELS * uPixelAngle;
    float unresolved = 1.0 - smoothstep(0.5, 2.0, radius / uPixelAngle);
    points += uBodyLook[i].rgb * uBodyMap[i].w * unresolved * exp(-0.5 * miss * miss / (pointSigma * pointSigma));
    float cover = clamp((radius - miss) / max(fwidth(miss), 1e-9) + 0.5, 0.0, 1.0);
    if (cover <= 0.0) continue;
    float inside = min(miss, radius * 0.9999);
    float hit = along - sqrt(radius * radius - inside * inside);
    return vec4(shadeBody(i, direction, hit, radius) * cover + points, cover);
  }
  return vec4(points, 0.0);
}

uniform vec3 uGroundCamera;
uniform float uGroundRadius;
uniform float uGroundExcess;
uniform ivec3 uGroundAnchor;
uniform vec3 uGroundFromAnchor;
uniform vec4 uGroundShape;
uniform float uGroundTopKm;
uniform float uGroundSea;
uniform vec4 uGroundAir;
uniform vec4 uGroundGlow;
uniform vec3 uGroundSunset;

const float ANCHOR_METRES = ${ANCHOR_METRES}.0;
const int GROUND_OCTAVES = ${GROUND_OCTAVES};
const int CRATER_FIRST_OCTAVE = ${CRATER_FIRST_OCTAVE};
const int CRATER_LAST_OCTAVE = ${CRATER_LAST_OCTAVE};
const float CRATER_CHANCE = ${CRATER_CHANCE};
const float COAST_DROP_METRES = ${COAST_DROP_METRES}.0;
const int COAST_OCTAVES = ${COAST_OCTAVES};
const int GROUND_STEPS = 160;
const float GROUND_STEP_SHARE = 0.6;
const int SHADOW_STEPS = 12;
const float SHADOW_REACH_GROWTH = 2.0;
const float SHADOW_NEAREST_METRES = 8.0;
const float SHADOW_DETAIL_SHARE_OF_REACH = 0.5;
const float MARCH_DETAIL_SHARE_OF_GAP = 0.25;
const float SMALLEST_STEP_IN_FOOTPRINTS = 1.5;
const float CRATER_RIM_SHARE_OF_CELL = 0.05;
const float WATER_FRESNEL_HEAD_ON = 0.02;
const float CLOUD_ALTITUDE_KM = 6.0;
const float SKY_BRIGHTNESS = 0.9;
const float SKY_VEIL_GAIN = 2.5;
const float GROUND_GRAIN = 0.25;

float groundLattice(ivec3 cell, int seed) {
  uvec3 q = uvec3(cell);
  return float(hashUint(q.x * 73856093u ^ q.y * 19349663u ^ q.z * 83492791u ^ uint(seed) * 2654435761u)) / 4294967295.0;
}

ivec3 octaveCells(int octave) {
  return uGroundAnchor * (2 << octave);
}

vec3 inShiftedCells(vec3 offset, float cell, int seed) {
  return offset / cell + fract(float(seed + 1) * vec3(0.618034, 0.414214, 0.732051));
}

float octaveNoise(ivec3 cells, vec3 offset, float cell, int seed) {
  vec3 scaled = inShiftedCells(offset, cell, seed);
  vec3 whole = floor(scaled);
  vec3 f = scaled - whole;
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec3 c = cells + ivec3(whole);
  return mix(
    mix(mix(groundLattice(c, seed), groundLattice(c + ivec3(1, 0, 0), seed), f.x), mix(groundLattice(c + ivec3(0, 1, 0), seed), groundLattice(c + ivec3(1, 1, 0), seed), f.x), f.y),
    mix(mix(groundLattice(c + ivec3(0, 0, 1), seed), groundLattice(c + ivec3(1, 0, 1), seed), f.x), mix(groundLattice(c + ivec3(0, 1, 1), seed), groundLattice(c + ivec3(1, 1, 1), seed), f.x), f.y),
    f.z);
}

float craterDepth(ivec3 cells, vec3 offset, float cell, int octave) {
  vec3 scaled = inShiftedCells(offset, cell, octave);
  vec3 whole = floor(scaled);
  ivec3 c = cells + ivec3(whole);
  if (groundLattice(c, 100 + octave) > CRATER_CHANCE) return 0.0;
  vec3 centre = whole + 0.3 + 0.4 * vec3(groundLattice(c, 200 + octave), groundLattice(c, 300 + octave), groundLattice(c, 400 + octave));
  float radius = 0.06 + 0.14 * groundLattice(c, 500 + octave);
  float reach = length(scaled - centre) / radius;
  float bowl = reach < 1.0 ? reach * reach - 1.0 : 0.0;
  float rimOff = (reach - 1.0) / 0.22;
  return 0.2 * radius * cell * (bowl + 0.35 * exp(-rimOff * rimOff));
}

float octaveFade(float cell, float footprint) {
  return clamp(log2(cell / footprint), 0.0, 1.0);
}

float groundDetailMetres(vec3 offset, float footprint) {
  float height = 0.0;
  for (int octave = 0; octave < GROUND_OCTAVES; octave++) {
    float cell = ANCHOR_METRES / float(2 << octave);
    float fade = octaveFade(cell, footprint);
    if (fade <= 0.0) break;
    ivec3 cells = octaveCells(octave);
    height += fade * uGroundShape.z * cell * (octaveNoise(cells, offset, cell, octave) - 0.5);
    if (uGroundShape.w > 0.0 && octave >= CRATER_FIRST_OCTAVE && octave <= CRATER_LAST_OCTAVE) height += fade * uGroundShape.w * craterDepth(cells, offset, cell, octave);
  }
  return height;
}

float coastNoise(vec3 offset, float footprint) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < COAST_OCTAVES; octave++) {
    float cell = ANCHOR_METRES / float(2 << octave);
    float fade = octaveFade(cell, footprint);
    if (fade <= 0.0) break;
    total += fade * amplitude * (octaveNoise(octaveCells(octave), offset, cell, 700 + octave) - 0.5);
    amplitude *= 0.5;
  }
  return total;
}

vec2 groundUv(vec3 up) {
  return vec2(atan(up.y, up.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(up.z, -1.0, 1.0)) / 3.1415927);
}

float groundLayer() {
  return uBodyMap[uGround].x;
}

vec4 mapTexelsLikeCollision(highp sampler2DArray map, vec2 uv) {
  ivec2 size = textureSize(map, 0).xy;
  float fx = uv.x * float(size.x) - 0.5;
  float fy = clamp(uv.y * float(size.y) - 0.5, 0.0, float(size.y - 1));
  vec2 corner = floor(vec2(fx, fy));
  vec2 t = vec2(fx, fy) - corner;
  int x0 = int(corner.x);
  int y0 = int(corner.y);
  int left = ((x0 % size.x) + size.x) % size.x;
  int right = (left + 1) % size.x;
  int below = min(y0 + 1, size.y - 1);
  int layer = int(groundLayer());
  vec4 a = texelFetch(map, ivec3(left, y0, layer), 0);
  vec4 b = texelFetch(map, ivec3(right, y0, layer), 0);
  vec4 c = texelFetch(map, ivec3(left, below, layer), 0);
  vec4 d = texelFetch(map, ivec3(right, below, layer), 0);
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}

float landShare(vec2 uv, vec3 offset, float footprint) {
  if (uGroundSea < 0.5) return 1.0;
  float alpha = mapTexelsLikeCollision(uBodyColour, uv).a;
  float edgeWidth = clamp(0.5 * footprint / (6.2831853 * uGroundRadius * 1000.0 / MAP_WIDTH), 0.002, 0.5);
  float coastline = alpha + COAST_ROUGHNESS * 4.0 * alpha * (1.0 - alpha) * coastNoise(offset, footprint);
  return smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, coastline);
}

float groundHeightMetres(vec3 up, vec3 offset, float footprint, out float land) {
  vec2 uv = groundUv(up);
  float mapped = (uGroundShape.x + mapTexelsLikeCollision(uBodyHeight, uv).r * uGroundShape.y) * 1000.0;
  land = landShare(uv, offset, footprint);
  float coast = uGroundSea > 0.5 ? (land - 0.5) * COAST_DROP_METRES : 0.0;
  return mapped + groundDetailMetres(offset, footprint) * land + coast;
}

float surfaceHeightMetres(vec3 up, vec3 offset, float footprint) {
  float land;
  return max(groundHeightMetres(up, offset, footprint, land), uGroundSea > 0.5 ? 0.0 : -1e9);
}

struct GroundPoint {
  vec3 up;
  vec3 offset;
  float altitudeKm;
};

GroundPoint groundPointAt(vec3 ray, float t) {
  float excess = uGroundExcess + 2.0 * t * dot(uGroundCamera, ray) + t * t;
  float fromCentre = sqrt(uGroundRadius * uGroundRadius + excess);
  float altitudeKm = excess / (fromCentre + uGroundRadius);
  vec3 up = (uGroundCamera + ray * t) / fromCentre;
  return GroundPoint(up, uGroundFromAnchor + ray * t * 1000.0 - up * altitudeKm * 1000.0, altitudeKm);
}

vec3 groundLocal(vec3 direction) {
  return vec3(dot(direction, uBodyMeridian[uGround]), dot(direction, cross(uBodyNorth[uGround], uBodyMeridian[uGround])), dot(direction, uBodyNorth[uGround]));
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
  return sky;
}

vec3 sunlightThroughAir(vec3 sun, vec3 upHere) {
  if (uGroundAir.w <= 0.0) return vec3(1.0);
  float airmass = 1.0 / (max(dot(sun, upHere), 0.0) + 0.04);
  return exp(-airmass * 0.06 * (vec3(1.0) - uGroundAir.rgb * 0.8));
}

float groundShadow(GroundPoint p, float height, vec3 sun, float footprint) {
  vec3 along = sun - p.up * dot(sun, p.up);
  float rise = dot(sun, p.up);
  float light = 1.0;
  float reach = max(footprint * 4.0, SHADOW_NEAREST_METRES);
  for (int i = 0; i < SHADOW_STEPS; i++) {
    vec3 offset = p.offset + along * reach;
    vec3 up = normalize(p.up + along * reach / (uGroundRadius * 1000.0));
    float terrain = surfaceHeightMetres(up, offset, reach * SHADOW_DETAIL_SHARE_OF_REACH);
    float ray = height + rise * reach;
    light = min(light, clamp((ray - terrain) / (0.02 * reach) + 0.5, 0.0, 1.0));
    if (light <= 0.0) break;
    reach *= SHADOW_REACH_GROWTH;
  }
  return light;
}

vec4 cloudsSeenFrom(vec3 ray, vec3 sun, out float cloudT) {
  cloudT = -1.0;
  if (uGroundSea < 0.5) return vec4(0.0);
  float shell = uGroundRadius + CLOUD_ALTITUDE_KM;
  float b = dot(uGroundCamera, ray);
  float c = uGroundExcess - (shell * shell - uGroundRadius * uGroundRadius);
  float disc = b * b - c;
  if (disc < 0.0) return vec4(0.0);
  float root = sqrt(disc);
  cloudT = c > 0.0 ? -b - root : -b + root;
  if (cloudT <= 0.0) return vec4(0.0);
  vec3 up = normalize(uGroundCamera + ray * cloudT);
  float mapTexel = 6.2831853 / MAP_WIDTH;
  float footprint = uPixelAngle * cloudT / uGroundRadius;
  float octaves = clamp(log2(mapTexel / max(footprint, 1e-9)), 0.0, MAX_DETAIL_OCTAVES);
  float cover = cloudCover(up, up / mapTexel, octaves);
  float underside = c < 0.0 ? 0.65 : 1.0;
  return vec4(CLOUD_ALBEDO * max(dot(sun, up), 0.0) * underside * sunlightThroughAir(sun, up), cover);
}

vec3 groundNormal(GroundPoint p, float rawHeight, float footprint) {
  vec3 east = normalize(abs(p.up.z) < 0.999 ? cross(vec3(0.0, 0.0, 1.0), p.up) : vec3(1.0, 0.0, 0.0));
  vec3 north = cross(p.up, east);
  float probe = max(footprint, 0.5);
  float scratch;
  float towardEast = groundHeightMetres(normalize(p.up + east * probe / (uGroundRadius * 1000.0)), p.offset + east * probe, footprint, scratch);
  float towardNorth = groundHeightMetres(normalize(p.up + north * probe / (uGroundRadius * 1000.0)), p.offset + north * probe, footprint, scratch);
  return normalize(p.up - east * (towardEast - rawHeight) / probe - north * (towardNorth - rawHeight) / probe);
}

vec3 shadeGround(GroundPoint p, float t, float footprint, vec3 ray, vec3 sun, vec3 upHere) {
  float land;
  float rawHeight = groundHeightMetres(p.up, p.offset, footprint, land);
  bool water = uGroundSea > 0.5 && rawHeight <= 0.0;
  float height = water ? 0.0 : rawHeight;
  vec3 normal = water ? p.up : groundNormal(p, rawHeight, footprint);
  vec3 albedo = textureLod(uBodyColour, vec3(groundUv(p.up), groundLayer()), 0.0).rgb;
  float grain = octaveNoise(octaveCells(12), p.offset, ANCHOR_METRES / float(2 << 12), 900) + octaveNoise(octaveCells(7), p.offset, ANCHOR_METRES / float(2 << 7), 901) - 1.0;
  albedo *= 1.0 + GROUND_GRAIN * grain;
  vec3 sunlight = sunlightThroughAir(sun, p.up);
  float sunHeight = dot(sun, p.up);
  float shadow = sunHeight > -0.05 ? groundShadow(p, height, sun, footprint) : 0.0;
  vec3 ambient = uGroundAir.w > 0.0 ? uGroundAir.rgb * 0.18 * smoothstep(-0.15, 0.1, sunHeight) : vec3(0.0);
  vec3 lit;
  if (water) {
    vec3 halfway = normalize(sun - ray);
    float facing = clamp(dot(-ray, normal), 0.0, 1.0);
    float fresnel = WATER_FRESNEL_HEAD_ON + (1.0 - WATER_FRESNEL_HEAD_ON) * pow(1.0 - facing, 5.0);
    vec3 skyInWater = groundSky(normalize(reflect(ray, normal) + normal * 0.02), sun, p.up);
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

vec4 groundView(vec3 direction) {
  vec3 ray = groundLocal(direction);
  vec3 sun = groundLocal(uBodySun[uGround]);
  vec3 upHere = normalize(uGroundCamera);
  float top = uGroundTopKm;
  float topExcess = (uGroundRadius + top) * (uGroundRadius + top) - uGroundRadius * uGroundRadius;
  float t = 0.0;
  if (cameraAltitudeKm() > top) {
    float b = dot(uGroundCamera, ray);
    float disc = b * b - (uGroundExcess - topExcess);
    t = disc < 0.0 ? -1.0 : -b - sqrt(disc);
  }
  float farthest = sqrt(max(topExcess, 0.0)) + sqrt(max(uGroundExcess, 0.0)) + 1.0;
  float cloudT;
  vec4 cloud = cloudsSeenFrom(ray, sun, cloudT);
  vec3 sky = groundSky(ray, sun, upHere);

  bool hit = false;
  float previous = t;
  float footprint = 1.0;
  float lastGap = 0.0;
  GroundPoint p = groundPointAt(ray, max(t, 0.0));
  if (t >= 0.0) {
    for (int i = 0; i < GROUND_STEPS; i++) {
      p = groundPointAt(ray, t);
      footprint = max(t * 1000.0 * uPixelAngle, 0.05);
      float detailWorthSeeing = max(footprint, MARCH_DETAIL_SHARE_OF_GAP * lastGap);
      float skippedDetailReach = (uGroundShape.z + uGroundShape.w * CRATER_RIM_SHARE_OF_CELL) * (detailWorthSeeing - footprint);
      float gap = p.altitudeKm * 1000.0 - surfaceHeightMetres(p.up, p.offset, detailWorthSeeing) - skippedDetailReach;
      lastGap = gap;
      if (gap < footprint * 0.5) {
        hit = true;
        break;
      }
      if ((p.altitudeKm > top && dot(p.up, ray) > 0.0) || t > farthest) break;
      previous = t;
      t += max(gap * GROUND_STEP_SHARE, footprint * SMALLEST_STEP_IN_FOOTPRINTS) / 1000.0;
    }
    if (!hit && p.altitudeKm < top && t <= farthest && dot(p.up, ray) <= 0.0) hit = true;
  }
  if (hit) {
    float low = previous;
    float high = t;
    for (int i = 0; i < 5; i++) {
      float middle = 0.5 * (low + high);
      GroundPoint q = groundPointAt(ray, middle);
      if (q.altitudeKm * 1000.0 < surfaceHeightMetres(q.up, q.offset, footprint)) high = middle;
      else low = middle;
    }
    p = groundPointAt(ray, high);
    vec3 lit = shadeGround(p, high, footprint, ray, sun, upHere);
    if (cloudT > 0.0 && cloudT < high) lit = mix(lit, cloud.rgb, cloud.a);
    return vec4(lit, 1.0);
  }
  if (cloudT > 0.0) sky = mix(sky, cloud.rgb, cloud.a);
  float veil = clamp(dot(sky, vec3(0.3, 0.5, 0.2)) * SKY_VEIL_GAIN + (cloudT > 0.0 ? cloud.a : 0.0), 0.0, 1.0);
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

export const GROUND_FRAGMENT = `#version 300 es
${EYE_SHARED}
void main() {
  outColour = groundView(viewDirection());
}`;

export const EYE_FRAGMENT = `#version 300 es
${EYE_SHARED}
uniform sampler2D uGroundView;

void main() {
  vec3 direction = viewDirection();
  if (!seenThroughCockpit(direction)) {
    outColour = vec4(cabinColour(direction), 1.0);
    return;
  }
  vec4 planet = planetColour(direction);
  if (planet.a >= 1.0) {
    outColour = vec4(planet.rgb, 1.0);
    return;
  }
  vec4 ground = uGround >= 0 && uWarpAxis.w < 0.5 ? texture(uGroundView, vUv) * uGroundBlend : vec4(0.0);
  if (ground.a >= 1.0) {
    outColour = vec4(ground.rgb, 1.0);
    return;
  }
  vec4 body = bodiesColour(directionBeforeWarp(direction));
  if (body.a >= 1.0) {
    outColour = vec4(body.rgb * (1.0 - ground.a) + ground.rgb, 1.0);
    return;
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
  vec3 throughAir = (behind + body.rgb) * (1.0 - ground.a) + ground.rgb;
  outColour = vec4(mix(throughAir + planet.rgb, planet.rgb, planet.a), max(max(body.a, ground.a), planet.a));
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
