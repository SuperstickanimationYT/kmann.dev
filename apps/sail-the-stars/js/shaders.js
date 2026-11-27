import { DEFLECTION_SAMPLES } from './light-bending.js';
import { GIANT_FACE_OVERSCAN, GIANT_FACE_SIZE } from './giant-shader.js';
import { SHADOW_MAP_SIZE } from './ground-patches.js';
import { SMALLEST_ROCK_PIXELS } from './surface-scatter.js';
import { ANCHOR_METRES, COAST_ROUGHNESS, GROUND_OCTAVES } from './terrain.js';

export const LAYERS_PER_MAP = 3;
export const MAX_NEBULAE = 64;
export const MAX_GALAXIES = 4;
export const MAX_BODIES = 12;
export const GROUND_HIT = 2;
export const SHUTTER_SHARE = 0.5;
export const LONGEST_BLUR_PIXELS = 40;
export const MAX_HAZY = 4;
export const CLOUD_NEARBY_WIDTH = 1024;
export const CLOUD_MAP_SIZE = [3072, 1536];
export const SIMULATED_CLOUD_SIZE = [2048, 1024];
export const EARTH_CLOUDS = -1;
export const UNRESOLVED_STEPS = 48;
export const NOISE_SIZE = 64;
export const LATTICE_PERIOD = 64;
export const INVENTED_COLOUR_WIDTH = 4096;
export const TABLE_WIDTH = 64;
export const TABLE_ROWS = { oldUnresolved: 0, youngUnresolved: 1, nebulaPlace: 2, nebulaGlow: 3, bulgeUnresolved: 4, armedUnresolved: 5 };
export const UNRESOLVED_NEAREST = 0.1;
export const UNRESOLVED_FARTHEST = 1e6;

export const DEFLECTION = `uniform sampler2D uDeflections;
uniform float uShadow;
uniform float uLeastLog;
uniform float uLogSpan;

float deflectionAt(float excess) {
  float place = clamp((log(excess) - uLeastLog) / uLogSpan, 0.0, 1.0) * ${DEFLECTION_SAMPLES - 1}.0;
  int low = min(int(place), ${DEFLECTION_SAMPLES - 2});
  return mix(texelFetch(uDeflections, ivec2(low, 0), 0).r, texelFetch(uDeflections, ivec2(low + 1, 0), 0).r, place - float(low));
}
`;

export const FULLSCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

const CAMERA_SPIKES = `
float spikeCross(vec2 offset, float width, float reach) {
  vec2 away = abs(offset);
  vec2 across = exp(-away * away / (2.0 * width * width));
  vec2 along = exp(-away / reach);
  return across.y * along.x + across.x * along.y;
}
`;

const EYE_SPIKES = `
const float SPIKE_FAINTEST_MAGNITUDE = 2.0;
const float SPIKE_PIXELS_PER_MAGNITUDE = 7.0;
const float SPIKE_LONGEST_REACH = 190.0;
const float SPIKE_WIDTH = 0.75;
const float SPIKE_LIGHT = 0.8;
const int SPIKE_LAYERS = 3;
const float LAYER_SPIKES[SPIKE_LAYERS] = float[](13.0, 31.0, 73.0);
const float LAYER_REACH[SPIKE_LAYERS] = float[](1.0, 0.85, 0.6);
const float LAYER_LIGHT[SPIKE_LAYERS] = float[](1.0, 0.6, 0.4);

float spikeHash(float n) {
  return fract(sin(n * 127.1 + 3.7) * 43758.5453);
}

float starburst(vec2 offset, float reach) {
  float r = length(offset);
  if (r >= reach) return 0.0;
  float turn = atan(offset.y, offset.x) / 6.2831853 + 0.5;
  float total = 0.0;
  for (int layer = 0; layer < SPIKE_LAYERS; layer++) {
    float count = LAYER_SPIKES[layer];
    float cell = min(floor(turn * count), count - 1.0);
    float seed = cell + 100.0 * float(layer);
    float centre = cell + 0.5 + 0.7 * (spikeHash(seed) - 0.5);
    float aside = r * sin(min(abs(turn * count - centre) / count * 6.2831853, 1.5707963));
    float boldness = spikeHash(seed + 41.3);
    float share = r / (reach * LAYER_REACH[layer] * mix(0.4, 1.0, boldness));
    float fade = max(1.0 - share, 0.0);
    total += LAYER_LIGHT[layer] * mix(0.35, 1.0, boldness) * fade * fade * exp(-aside * aside / (2.0 * SPIKE_WIDTH * SPIKE_WIDTH));
  }
  return SPIKE_LIGHT * total;
}
`;

const BODY_OCCLUDERS = `
uniform vec4 uBodyOccluder[${MAX_BODIES}];
uniform vec3 uBodyNorth[${MAX_BODIES}];
uniform float uBodyFlattening[${MAX_BODIES}];
uniform vec4 uBodyNarrowing[${MAX_BODIES}];
uniform int uBodyCount;

bool behindOblate(int i, vec3 direction) {
  float stretch = 1.0 / (1.0 - uBodyFlattening[i]) - 1.0;
  vec3 north = uBodyNorth[i];
  vec3 narrow = uBodyNarrowing[i].xyz;
  vec3 centre = uBodyOccluder[i].xyz;
  vec3 ray = normalize(direction + north * dot(direction, north) * stretch + narrow * dot(direction, narrow));
  vec3 roundedCentre = centre + north * dot(centre, north) * stretch + narrow * dot(centre, narrow);
  float along = dot(ray, roundedCentre);
  return along > 0.0 && length(ray * along - roundedCentre) < sin(uBodyOccluder[i].w) * uBodyNarrowing[i].w;
}

bool behindBody(vec3 direction) {
  for (int i = 0; i < ${MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    if (uBodyFlattening[i] > 0.0) {
      if (uBodyOccluder[i].w > 0.0 && behindOblate(i, direction)) return true;
      continue;
    }
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

export const COCKPIT = `
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

uniform highp sampler3D uLattice;

float smoothNoise(vec3 p) {
  vec3 f = fract(p);
  return textureLod(uLattice, (floor(p) + f * f * (3.0 - 2.0 * f) + 0.5) / ${LATTICE_PERIOD}.0, 0.0).r;
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
uniform vec4 uBodySun[${MAX_BODIES}];
uniform vec4 uBodyEclipser[${MAX_BODIES * 2}];
uniform float uSunVisible;
uniform float uSunSeen;
uniform float uCoronaShown;
uniform float uBodyReach[${MAX_BODIES}];
uniform vec3 uBodyNorth[${MAX_BODIES}];
uniform float uBodyFlattening[${MAX_BODIES}];
uniform vec4 uBodyNarrowing[${MAX_BODIES}];
uniform vec3 uBodyMeridian[${MAX_BODIES}];
uniform vec4 uBodyLook[${MAX_BODIES}];
uniform vec4 uBodyMap[${MAX_BODIES}];
uniform vec4 uBodyGlow[${MAX_BODIES}];
uniform vec4 uBodyLamp[${MAX_BODIES}];
uniform vec3 uStarlight;
uniform highp sampler2DArray uBodyColour;
uniform highp sampler2DArray uBodyHeight;
uniform highp sampler2DArray uGiantFaces;
uniform highp sampler2DArray uGiantFlow;
uniform float uGiantAge;
uniform float uPixelAngle;
uniform int uGround;
uniform float uGroundBlend;

const float BODY_CLOUDED = 1.0;
const float BODY_GIANT = 2.0;
const float BODY_STAR = 3.0;
const float BODY_OCEAN_WORLD = 4.0;
const float BODY_HAZY = 5.0;
const float BODY_INVENTED = 6.0;
const float BODY_MIRROR = 7.0;
const float MAP_WIDTH = 1024.0;
const float MAP_HEIGHT = 512.0;
const float MAX_DETAIL_OCTAVES = 7.0;
const float OCTAVES_LOST_UNDER_GROUND = 6.0;
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
const vec3 OCEAN_ALBEDO = vec3(2.0, 5.0, 20.0) / 255.0;
const float COAST_ROUGHNESS = ${COAST_ROUGHNESS};
const float COAST_SHARPEST = 0.01;
const float OCEAN_SHININESS = 250.0;
const float CLOUD_SCALE = 7.0;
const float CLOUD_STRETCH = 1.6;
const float CLOUD_SWIRL = 2.5;
const float CLOUD_OPACITY = 0.95;

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

const float EDGE_OCTAVES = 7.0;
const float EDGE_PERSISTENCE = 0.6;
const float EDGE_RAGGEDNESS = 1.2;
const float EDGE_WANDER_TEXELS = 1.3;
const float EDGE_WANDER_OCTAVES = 2.0;
const float EDGE_SHARPEST = 0.02;
const float EDGE_SOFTEST = 0.2;
const float EDGE_SOFTNESS_PATCH_TEXELS = 4.0;
const vec2 EDGE_CONTRAST = vec2(0.02, 0.06);
const vec3 LUMINANCE = vec3(0.3, 0.5, 0.2);

float raggedNoise(vec3 p, float octaves, float start, float settled) {
  float total = start;
  float amplitude = 0.5;
  for (int i = 0; i < int(EDGE_OCTAVES); i++) {
    float weight = clamp(octaves - float(i), 0.0, 1.0);
    float furthest = 0.5 * amplitude / (1.0 - EDGE_PERSISTENCE);
    if (weight <= 0.0 || abs(total) > settled + furthest) break;
    total += weight * amplitude * (smoothNoise(p) - 0.5);
    p = p * 2.03 + vec3(7.1, 2.9, 5.3);
    amplitude *= EDGE_PERSISTENCE;
  }
  return total;
}

vec3 sharpEdged(vec3 albedo, vec2 uv, float layer, vec3 local, float footprint) {
  float texel = 6.2831853 / MAP_WIDTH;
  float octaves = clamp(log2(texel / footprint), 0.0, EDGE_OCTAVES);
  if (octaves <= 0.0) return albedo;
  float maps = float(textureSize(uBodyColour, 0).z / ${LAYERS_PER_MAP});
  vec4 dark = textureLod(uBodyColour, vec3(uv, layer + maps), 0.0);
  vec3 span = textureLod(uBodyColour, vec3(uv, layer + 2.0 * maps), 0.0).rgb - dark.rgb;
  float contrast = dot(span, LUMINANCE);
  float shown = smoothstep(EDGE_CONTRAST.x, EDGE_CONTRAST.y, contrast) * min(octaves, 1.0);
  if (shown <= 0.0) return albedo;
  vec3 p = local / texel;
  float wanderOctaves = min(octaves, EDGE_WANDER_OCTAVES);
  vec2 wander = vec2(raggedNoise(0.7 * p + 3.0, wanderOctaves, 0.0, 1.0), raggedNoise(0.7 * p + 40.0, wanderOctaves, 0.0, 1.0));
  float darkest = dot(dark.rgb, LUMINANCE);
  float wandered = textureLod(uBodyColour, vec3(uv + EDGE_WANDER_TEXELS * wander / vec2(MAP_WIDTH, MAP_HEIGHT), layer + maps), 0.0).a;
  float dustiness = smoothNoise(p / EDGE_SOFTNESS_PATCH_TEXELS + 60.0);
  float softness = clamp(footprint / texel, mix(EDGE_SHARPEST, EDGE_SOFTEST, dustiness * dustiness), 0.5);
  float blurred = clamp((dark.a - darkest) / contrast, 0.0, 1.0);
  float bright = (wandered - darkest) / contrast - 0.5;
  float ragged = EDGE_RAGGEDNESS * raggedNoise(0.9 * p + 17.0, octaves, bright / EDGE_RAGGEDNESS, softness / EDGE_RAGGEDNESS);
  return max(albedo + shown * span * (smoothstep(-softness, softness, ragged) - blurred), vec3(0.0));
}

vec3 bodyLocal(vec3 surface, BodyFrame frame) {
  return vec3(dot(surface, frame.meridian), dot(surface, frame.east), dot(surface, frame.north));
}

uniform sampler2D uCityLights;
uniform int uLitBody;
uniform float uCityLightsOn;
uniform float uLitBodyKm;
const float CITY_LIGHTS_NORTH = 75.0;
const float CITY_LIGHTS_SPAN = 135.0;
const float CITY_LIGHTS_DUSK = 0.02;
const float CITY_LIGHTS_FULL_NIGHT = -0.12;
const float CITY_LIGHTS_GAIN = 1.15;
uniform float uCitiesInvented;
uniform vec2 uCityChannel;
uniform vec3 uLampDim;
uniform vec3 uLampBright;
uniform sampler2D uInventedLand;
const float TOWN_OCTAVES = 4.0;
const float TOWN_CONTRAST = 4.5;
const float FAINT_TOWN_GAIN = 6.0;
const float DISTRICT_CONTRAST = 1.6;
const float CLOUD_LAMPLIGHT = 0.17;
const float CLUMP_FAINTEST = 0.1;
const float CLUMP_FULL = 0.9;
const vec2 AVENUE_BLOCK_KM = vec2(0.7, 0.9);
const float AVENUE_HALF_WIDTH_KM = 0.011;
const float AVENUE_LIGHT = 0.25;
const float DISTRICT_KM = 2.2;
const float DISTRICT_BEND_KM = 2.6;
const float SMALLEST_BLOCK_KM = 0.09;
const float STREET_HALF_WIDTH_KM = 0.007;
const float LAMP_SPACING_KM = 0.04;
const float BUILDING_KM = 0.036;
const float BUILDING_LIGHT = 0.3;
const float LAMP_POOL_LIGHT = 0.06;
const float LAMP_POOL_KM = 0.0003;
const float LAMP_POINT_KM = 0.003;
const float CLOUD_LAMPLIGHT_BLUR_KM = 12.0;
const float LAMP_STRIPS = 1024.0;
const float LAMPS_STEEPEST_GRAZE = 0.02;

float districtShare(vec2 place, float cellKm, float footprintKm) {
  float seen = 1.0 - smoothstep(0.2, 0.6, footprintKm / cellKm);
  if (seen <= 0.0) return 1.0;
  return max(1.0 + seen * DISTRICT_CONTRAST * (smoothNoise(vec3(place / cellKm, cellKm)) - 0.5), 0.0);
}

vec3 placeChance(vec2 cell) {
  vec2 wrapped = mod(cell, 1024.0);
  return fract(sin(vec3(dot(wrapped, vec2(12.71, 31.17)), dot(wrapped, vec2(26.95, 18.33)), dot(wrapped, vec2(41.93, 28.91)))) * 4375.85);
}

float clumpShare(vec2 place, float cellKm, float footprintKm) {
  float seen = 1.0 - smoothstep(0.2, 0.6, footprintKm / cellKm);
  if (seen <= 0.0) return 1.0;
  float clump = 0.6 * smoothNoise(vec3(place / cellKm, 17.0 * cellKm)) + 0.4 * smoothNoise(vec3(place.yx * 2.7 / cellKm, 5.0));
  return mix(1.0, smoothstep(CLUMP_FAINTEST, CLUMP_FULL, clump) * 2.0, seen);
}

float bump(float away, float width, float spacing) {
  return spacing / (width * 1.7724539) * exp(-away * away / (width * width));
}

float streetShare(vec2 place, vec2 block, float seed, float footprintKm) {
  float row = floor(place.x / block.x);
  vec3 chance = placeChance(vec2(row, seed));
  float main = step(0.8, chance.x);
  float width = STREET_HALF_WIDTH_KM + 0.5 * footprintKm;
  float line = bump((fract(place.x / block.x) - 0.5 - 0.3 * (chance.y - 0.5)) * block.x, width, block.x);
  float lampsSeen = 1.0 - smoothstep(0.2, 0.6, footprintKm / LAMP_SPACING_KM);
  float lamp = floor(place.y / LAMP_SPACING_KM + chance.z);
  float along = (fract(place.y / LAMP_SPACING_KM + chance.z) - 0.5) * LAMP_SPACING_KM;
  float lamps = bump(along, STREET_HALF_WIDTH_KM + 0.5 * footprintKm, LAMP_SPACING_KM) * (0.4 + 1.2 * placeChance(vec2(lamp, row + seed)).x);
  float quarter = floor(place.y / (block.y * 3.0) + chance.y);
  float built = mix(0.3 + 1.4 * placeChance(vec2(quarter, row + seed)).y, 1.0, main);
  return line * built * mix(0.62, 2.5, main) * mix(1.0, lamps, lampsSeen);
}

float avenueShare(vec2 place, float seed, float footprintKm) {
  float seen = 1.0 - smoothstep(0.15, 0.45, footprintKm / AVENUE_BLOCK_KM.x);
  vec2 cell = place / AVENUE_BLOCK_KM;
  vec2 shift = vec2(placeChance(vec2(floor(cell.x), seed)).x, placeChance(vec2(seed, floor(cell.y))).y);
  vec2 off = (fract(cell) - 0.5 - 0.5 * (shift - 0.5)) * AVENUE_BLOCK_KM;
  float width = AVENUE_HALF_WIDTH_KM + 0.5 * footprintKm;
  vec2 lamp = placeChance(floor(place / LAMP_SPACING_KM)).xy;
  vec2 broken = mix(vec2(1.0), 0.5 + lamp, 1.0 - smoothstep(0.2, 0.6, footprintKm / LAMP_SPACING_KM));
  float lines = 0.5 * (broken.x * bump(off.x, width, AVENUE_BLOCK_KM.x) + broken.y * bump(off.y, width, AVENUE_BLOCK_KM.y));
  return mix(1.0, lines, seen);
}

float buildingShare(vec2 place, float footprintKm) {
  float seen = 1.0 - smoothstep(0.2, 0.6, footprintKm / BUILDING_KM);
  vec2 cell = place / BUILDING_KM;
  vec3 chance = placeChance(floor(cell));
  vec2 off = fract(cell) - 0.5 - 0.6 * (chance.xy - 0.5);
  return mix(1.0, 60.0 / 3.1415927 * exp(-60.0 * dot(off, off)) * 3.0 * chance.z * chance.z, seen);
}

float cityPlanShare(vec2 place, float footprintKm) {
  if (footprintKm > 0.45 * AVENUE_BLOCK_KM.x) return 1.0;
  float seen = 1.0 - smoothstep(0.15, 0.45, footprintKm / SMALLEST_BLOCK_KM);
  vec2 bent = place + DISTRICT_BEND_KM * (vec2(smoothNoise(vec3(place / DISTRICT_KM, 3.0)), smoothNoise(vec3(place / DISTRICT_KM, 9.5))) - 0.5);
  vec2 district = floor(bent / DISTRICT_KM);
  vec3 chance = placeChance(district);
  float turn = 1.5707963 * chance.x;
  vec2 inDistrict = place - district * DISTRICT_KM;
  vec2 turned = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * inDistrict;
  float seed = floor(chance.z * 997.0);
  float avenues = avenueShare(turned, seed, footprintKm);
  if (seen <= 0.0) return mix(1.0, avenues, AVENUE_LIGHT);
  vec2 block = SMALLEST_BLOCK_KM * vec2(1.0 + chance.y, 1.0 + 1.6 * chance.z);
  float streets = 0.5 * (streetShare(turned, block, seed, footprintKm) + streetShare(turned.yx, block.yx, seed + 41.0, footprintKm));
  return mix(mix(1.0, mix(streets, buildingShare(turned, footprintKm), BUILDING_LIGHT), seen), avenues, AVENUE_LIGHT);
}

float lampsWithin(vec2 uv, float footprintKm) {
  float strip = (floor(uv.y * LAMP_STRIPS) + 0.5) / LAMP_STRIPS;
  vec2 place = vec2((uv.x - 0.5) * 2.0 * sin(strip * 3.1415927), uv.y) * 3.1415927 * uLitBodyKm;
  float shares = districtShare(place, 2.6, footprintKm) * clumpShare(place, 0.7, footprintKm) * cityPlanShare(place, footprintKm);
  return shares * mix(LAMP_POOL_LIGHT, 1.0, smoothstep(LAMP_POOL_KM, LAMP_POINT_KM, footprintKm));
}

float mappedCityLevel(vec2 uv, float footprint) {
  float row = (uv.y * 180.0 - (90.0 - CITY_LIGHTS_NORTH)) / CITY_LIGHTS_SPAN;
  if (row <= 0.0 || row >= 1.0) return 0.0;
  float texel = 6.2831853 / float(textureSize(uCityLights, 0).x);
  return textureLod(uCityLights, vec2(uv.x, row), max(log2(footprint / texel), 0.0)).r * uCityLightsOn;
}

float inventedCityLevel(vec2 uv, float footprint) {
  float texel = 6.2831853 / float(textureSize(uInventedLand, 0).x);
  float level = uCityLightsOn * dot(textureLod(uInventedLand, uv, max(log2(footprint / texel), 0.0)).rg, uCityChannel);
  float octaves = clamp(log2(texel / footprint), 0.0, TOWN_OCTAVES);
  if (level <= 0.004 || octaves <= 0.0) return min(level * mix(1.0, clamp(footprint / texel, 1.0, FAINT_TOWN_GAIN), uCityChannel.x), 1.0);
  float longitude = (uv.x - 0.5) * 6.2831853;
  float latitude = (0.5 - uv.y) * 3.1415927;
  vec3 local = vec3(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
  return clamp(level * (1.0 + TOWN_CONTRAST * detailNoise(local / texel, octaves)), 0.0, 1.0);
}

vec3 cityGlow(int body, vec2 uv, float footprint, float sunHeight) {
  if (body != uLitBody || sunHeight >= CITY_LIGHTS_DUSK) return vec3(0.0);
  float level = uCitiesInvented > 0.5 ? inventedCityLevel(uv, footprint) : mappedCityLevel(uv, footprint);
  float night = 1.0 - smoothstep(CITY_LIGHTS_FULL_NIGHT, CITY_LIGHTS_DUSK, sunHeight);
  return CITY_LIGHTS_GAIN * night * mix(uLampDim, uLampBright, level) * level;
}

vec3 cityLights(int body, vec2 uv, float footprint, float facing, float sunHeight) {
  vec3 glow = cityGlow(body, uv, footprint, sunHeight);
  if (glow.r <= 0.004) return glow;
  return glow * lampsWithin(uv, footprint * uLitBodyKm / sqrt(max(facing, LAMPS_STEEPEST_GRAZE)));
}

vec3 cityGlowOnClouds(int body, vec2 uv, float footprint, float sunHeight) {
  return CLOUD_LAMPLIGHT * cityGlow(body, uv, max(footprint, CLOUD_LAMPLIGHT_BLUR_KM / uLitBodyKm), sunHeight);
}

uniform highp sampler2DArray uCloudMap;
uniform float uCloudMapOn;
const vec2 CLOUD_MAP_SIZE = vec2(${CLOUD_MAP_SIZE.map((size) => size.toFixed(1)).join(', ')});
const float CLOUD_TEXEL = 6.2831853 / CLOUD_MAP_SIZE.x;
const float CLOUD_COVER_LAYER = 0.0;
const float CLOUD_TOPS_LAYER = 1.0;
const float CLOUD_WARP_TEXELS = 0.9;
const float CLOUD_SHEET_OCTAVES = 5.0;
const float CLOUD_FRAYING = 2.0;
const float CLOUD_SHARPENING = 0.9;
const float CLOUD_FRAYING_CLOSE = 3.0;
const float CLOUD_STREAK_STRETCH = 0.35;
const float CLOUD_PERIMETER_DIMENSION = 1.35;
const float CLOUD_CLUSTER_PERSISTENCE = exp2(CLOUD_PERIMETER_DIMENSION - 2.0);
const float CLOUD_CLUSTER_TEXELS = 2.0;
const float CLOUD_CLUSTER_OCTAVES = 3.0;
const float NOISE_OCTAVE_SPREAD = 0.185;
const float CLOUD_CLUSTER_SPREAD = NOISE_OCTAVE_SPREAD / sqrt(1.0 - CLOUD_CLUSTER_PERSISTENCE * CLOUD_CLUSTER_PERSISTENCE);
const float CLOUD_CLUSTER_SOFTNESS = 1.5;
const float LOGISTIC_FOR_NORMAL = 1.702;
const float CLOUD_SHADOW_REACH = 0.0009;
const float CLOUD_TOWER_REACH = 0.0016;
const float CLOUD_LOWEST_SHADOW_SUN = 0.12;
const float CLOUD_SURFACE_SHADOW = 0.6;
const float CLOUD_SELF_SHADOW = 0.55;
const float CLOUD_EMBOSS = 0.5;
const float CLOUD_EMBOSS_TEXELS = 0.6;

vec2 cloudMapPlace(vec3 local) {
  return vec2(atan(local.y, local.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(local.z, -1.0, 1.0)) / 3.1415927);
}

uniform highp sampler2DArray uSimulatedClouds;
uniform float uSimulatedCloudsOn;
uniform vec4 uBodyClouds[${MAX_BODIES}];
uniform float uBodyWet[${MAX_BODIES}];
const vec2 SIMULATED_CLOUD_SIZE = vec2(${SIMULATED_CLOUD_SIZE.map((size) => size.toFixed(1)).join(', ')});
const float SUBSTELLAR_THICKENING = 2.2;
vec4 cloudsNow = vec4(${EARTH_CLOUDS.toFixed(1)}, 0.0, 1.0, 0.0);
vec3 cloudsSunNow = vec3(0.0);

vec3 inCloudFrame(vec3 local) {
  float c = cos(cloudsNow.y);
  float s = sin(cloudsNow.y);
  return vec3(c * local.x + s * local.y, c * local.y - s * local.x, local.z);
}

void useClouds(int body, vec3 sunLocal) {
  cloudsNow = uBodyClouds[body];
  cloudsSunNow = inCloudFrame(sunLocal);
}

bool cloudsSimulated() {
  return cloudsNow.x >= 0.0;
}

vec2 cloudTexels() {
  return cloudsSimulated() ? SIMULATED_CLOUD_SIZE : CLOUD_MAP_SIZE;
}

float cloudTexel() {
  return 6.2831853 / cloudTexels().x;
}

float simulatedCover(vec3 local, float cover) {
  float clearing = 1.0 - cloudsNow.z;
  float kept = max(cover - clearing, 0.0) / max(cloudsNow.z, 1e-3);
  return 1.0 - pow(1.0 - min(kept, 1.0), 1.0 + cloudsNow.w * SUBSTELLAR_THICKENING * smoothstep(0.1, 0.9, dot(local, cloudsSunNow)));
}

float cloudCoverTexel(vec2 place) {
  return cloudsSimulated() ? textureLod(uSimulatedClouds, vec3(place, cloudsNow.x), 0.0).r : textureLod(uCloudMap, vec3(place, CLOUD_COVER_LAYER), 0.0).r;
}

vec2 cloudMapped(vec3 local, float lod) {
  if (cloudsSimulated()) {
    vec2 simulated = textureLod(uSimulatedClouds, vec3(cloudMapPlace(local), cloudsNow.x), lod).rg * uSimulatedCloudsOn;
    return vec2(simulatedCover(local, simulated.x), simulated.y);
  }
  vec2 place = cloudMapPlace(local);
  return vec2(textureLod(uCloudMap, vec3(place, CLOUD_COVER_LAYER), lod).r, textureLod(uCloudMap, vec3(place, CLOUD_TOPS_LAYER), lod).r) * uCloudMapOn;
}

float smoothCloudCover(vec3 local) {
  vec2 size = cloudTexels();
  vec2 p = cloudMapPlace(local) * size - 0.5;
  vec2 f = fract(p);
  vec2 corner = floor(p) + 0.5;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f * f + 3.0 * f * f * f) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 w2 = 1.0 - w0 - w1 - w3;
  vec2 low = corner - 1.0 + w1 / (w0 + w1);
  vec2 high = corner + 1.0 + w3 / (w2 + w3);
  vec2 lowShare = w0 + w1;
  vec2 highShare = w2 + w3;
  float cover = lowShare.y * (lowShare.x * cloudCoverTexel(low / size) + highShare.x * cloudCoverTexel(vec2(high.x, low.y) / size))
    + highShare.y * (lowShare.x * cloudCoverTexel(vec2(low.x, high.y) / size) + highShare.x * cloudCoverTexel(high / size));
  return cloudsSimulated() ? simulatedCover(local, cover * uSimulatedCloudsOn) : cover * uCloudMapOn;
}

float billowNoise(vec3 p, float octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < int(MAX_DETAIL_OCTAVES); i++) {
    float weight = clamp(octaves - float(i), 0.0, 1.0);
    if (weight <= 0.0) break;
    total += weight * amplitude * (2.0 * abs(smoothNoise(p) - 0.5) - 0.35);
    p = p * 2.03 + vec3(7.1, 2.9, 5.3);
    amplitude *= 0.62;
  }
  return total;
}

float clusterField(vec3 p, float octaves) {
  float total = 0.0;
  float amplitude = 1.0;
  for (int i = 0; i < int(CLOUD_CLUSTER_OCTAVES); i++) {
    float weight = clamp(octaves - float(i), 0.0, 1.0);
    if (weight <= 0.0) break;
    total += weight * amplitude * (smoothNoise(p) - 0.5);
    p = p * 2.03 + vec3(7.1, 2.9, 5.3);
    amplitude *= CLOUD_CLUSTER_PERSISTENCE;
  }
  return total;
}

float clusteredCover(vec3 local, float cover, float footprint) {
  float octaves = clamp(log2(CLOUD_CLUSTER_TEXELS * cloudTexel() / max(footprint, 1e-9)), 0.0, CLOUD_CLUSTER_OCTAVES);
  if (octaves <= 0.0) return cover;
  float unresolved = CLOUD_CLUSTER_SPREAD * pow(CLOUD_CLUSTER_PERSISTENCE, octaves);
  float softness = max(unresolved, CLOUD_CLUSTER_SOFTNESS * CLOUD_CLUSTER_SPREAD);
  float resolvedVariance = CLOUD_CLUSTER_SPREAD * CLOUD_CLUSTER_SPREAD - unresolved * unresolved;
  float threshold = sqrt(resolvedVariance + softness * softness) * log((1.0 - cover) / cover) / LOGISTIC_FOR_NORMAL;
  float field = clusterField(local / (CLOUD_CLUSTER_TEXELS * cloudTexel()), octaves);
  return 1.0 / (1.0 + exp(-LOGISTIC_FOR_NORMAL * (field - threshold) / softness));
}

vec2 cloudSheet(vec3 local, float footprint, bool clustered) {
  float lod = max(log2(footprint / cloudTexel()), 0.0);
  float octaves = clamp(log2(cloudTexel() / max(footprint, 1e-9)), 0.0, CLOUD_SHEET_OCTAVES);
  vec2 mapped = cloudMapped(local, lod);
  if (octaves <= 0.0) return vec2(clustered && mapped.x * (1.0 - mapped.x) > 0.004 ? clusteredCover(local, mapped.x, footprint) : mapped.x, mapped.y);
  vec3 p = local / cloudTexel();
  vec3 wander = vec3(detailNoise(p * 0.8, min(octaves, 2.0)), detailNoise(p * 0.8 + 37.1, min(octaves, 2.0)), 0.0);
  wander.z = -0.5 * (wander.x + wander.y);
  vec3 warped = normalize(local + CLOUD_WARP_TEXELS * cloudTexel() * 2.0 * wander);
  float cover = mix(mapped.x, smoothCloudCover(warped), min(octaves, 1.0));
  if (clustered && cover * (1.0 - cover) > 0.004) cover = clusteredCover(local, cover, footprint);
  float high = smoothstep(0.25, 0.6, mapped.y);
  vec3 drifted = p + 2.0 * wander;
  if (cover * (1.0 - cover) <= 0.004) return vec2(step(0.5, cover), mapped.y);
  float fray = cover * (1.0 - cover) * 4.0;
  float grain = high < 1.0 ? (1.0 - high) * billowNoise(1.4 * drifted, octaves) : 0.0;
  if (high > 0.0) grain += high * 0.45 * detailNoise(drifted * vec3(0.8, 0.8, 0.8 / CLOUD_STREAK_STRETCH), octaves);
  float closeness = smoothstep(1.0, CLOUD_SHEET_OCTAVES, octaves);
  cover += mix(CLOUD_FRAYING, CLOUD_FRAYING_CLOSE, closeness) * fray * 0.5 * grain;
  return vec2(clamp(mix(cover, smoothstep(0.2, 0.8, cover), CLOUD_SHARPENING * closeness * (1.0 - 0.7 * high)), 0.0, 1.0), mapped.y);
}

const float CLOUD_NEARBY_FINE_KM = 40.0;
const float CLOUD_NEARBY_REACH_KM = 800.0;
const float CLOUD_NEARBY_WARP = asinh(CLOUD_NEARBY_REACH_KM / CLOUD_NEARBY_FINE_KM);

float cloudNearbyTexelKm(float distanceKm) {
  return length(vec2(distanceKm, CLOUD_NEARBY_FINE_KM)) * CLOUD_NEARBY_WARP * 2.0 / ${CLOUD_NEARBY_WIDTH}.0;
}

vec3 alongSurfaceTowardSun(vec3 local, vec3 sun) {
  float sunHeight = dot(sun, local);
  return (sun - local * sunHeight) / max(sunHeight, CLOUD_LOWEST_SHADOW_SUN);
}

const float DECK_CELL_TEXELS = 1.5;
const float DECK_RELIEF_OCTAVES = 6.0;
const float DECK_THICKNESS_CONTRAST = 0.35;
const float DECK_SLOPE_SHADING = 0.5;
const float DECK_SLOPE_PROBE = 0.15;
const float DECK_STEEPEST_SUN = 3.0;
const float DECK_SLOPE_PIXELS = 3.0;
const float HIGH_DECK_FLATTENING = 0.6;

float deckRelief(vec3 local, vec2 sheet, vec3 toSun, float footprint) {
  float deck = smoothstep(0.6, 1.0, sheet.x) * (1.0 - HIGH_DECK_FLATTENING * smoothstep(0.25, 0.6, sheet.y));
  float cell = DECK_CELL_TEXELS * cloudTexel();
  float octaves = clamp(log2(cell / max(footprint, 1e-9)), 0.0, DECK_RELIEF_OCTAVES);
  if (deck <= 0.0 || octaves <= 0.0) return 1.0;
  vec3 p = local / cell;
  float tops = billowNoise(p, octaves);
  float probe = max(DECK_SLOPE_PROBE, DECK_SLOPE_PIXELS * footprint / cell);
  float sunwardLength = min(length(toSun), DECK_STEEPEST_SUN);
  float towardSun = billowNoise(p + probe * toSun / max(length(toSun), 1e-5), octaves);
  float facing = (towardSun - tops) / probe * sunwardLength / DECK_STEEPEST_SUN;
  float relief = DECK_THICKNESS_CONTRAST * tops - DECK_SLOPE_SHADING * facing;
  return 1.0 + deck * min(octaves, 1.0) * relief;
}

float cloudSheetLight(vec3 local, vec2 sheet, vec3 sun, float footprint) {
  float lod = max(log2(footprint / cloudTexel()), 0.0);
  vec3 toSun = alongSurfaceTowardSun(local, sun);
  vec2 beside = cloudMapped(normalize(local + CLOUD_TOWER_REACH * toSun), lod);
  float shaded = clamp(beside.x * beside.y - sheet.x * sheet.y, 0.0, 1.0);
  vec2 near = cloudMapped(normalize(local + CLOUD_EMBOSS_TEXELS * max(cloudTexel(), footprint) * normalize(toSun + 1e-5)), lod);
  float emboss = clamp(sheet.x - near.x, -0.5, 0.5) * (1.0 - max(dot(sun, local), 0.0) * 0.6);
  return (1.0 - CLOUD_SELF_SHADOW * shaded) * (1.0 + CLOUD_EMBOSS * emboss) * mix(0.86, 1.0, sheet.x) * deckRelief(local, sheet, toSun, footprint);
}

float cloudSheetShadow(vec3 local, vec3 sun, float lod) {
  return 1.0 - CLOUD_SURFACE_SHADOW * cloudMapped(normalize(local + CLOUD_SHADOW_REACH * alongSurfaceTowardSun(local, sun)), lod).x;
}

const float GIANT_TEXEL = ${(Math.PI / 2 / GIANT_FACE_SIZE).toFixed(8)};
const float GIANT_DETAIL_SCALE = 0.4;
const float GIANT_DETAIL_CONTRAST = 0.25;
const float GIANT_DETAIL_FOLLOWS = 30.0;
const vec3 GIANT_DETAIL_STRETCH = vec3(1.0, 1.0, 2.5);
const float GIANT_FLOW_REACH = 0.1;
const float HIGH_CLOUD_WIND = 1.8;
const float HIGH_CLOUD_HEIGHT = 0.005;
const float HIGH_CLOUD_SHADOW = 0.4;
const float HIGH_CLOUD_BRIGHTNESS = 0.96;
const float HIGH_CLOUD_WHITENESS = 0.45;

vec3 giantFaceAt(vec3 local) {
  vec3 size = abs(local);
  float axis = size.x >= size.y && size.x >= size.z ? 0.0 : size.y >= size.z ? 1.0 : 2.0;
  vec3 st = axis == 0.0 ? local.yzx : axis == 1.0 ? local.xzy : local;
  return vec3(0.5 + 0.5 * st.xy / (abs(st.z) * ${GIANT_FACE_OVERSCAN.toFixed(6)}), axis * 2.0 + (st.z < 0.0 ? 1.0 : 0.0));
}

vec4 giantFaces(vec3 local, float firstFace, float lod) {
  return textureLod(uGiantFaces, giantFaceAt(local) + vec3(0.0, 0.0, firstFace), lod);
}

vec4 giantLayers(vec3 local, vec3 flow, float firstFace, float lod, float octaves, vec3 towardSun) {
  vec3 deckPlace = normalize(local - flow);
  vec3 highPlace = normalize(local - HIGH_CLOUD_WIND * flow);
  vec3 deck = giantFaces(deckPlace, firstFace, lod).rgb;
  vec3 detailPoint = deckPlace * GIANT_DETAIL_STRETCH * GIANT_DETAIL_SCALE / GIANT_TEXEL + GIANT_DETAIL_FOLLOWS * dot(deck, vec3(0.333));
  deck *= 1.0 + GIANT_DETAIL_CONTRAST * detailNoise(detailPoint, octaves);
  deck *= 1.0 - HIGH_CLOUD_SHADOW * giantFaces(normalize(highPlace + towardSun), firstFace, lod).a;
  return vec4(deck, giantFaces(highPlace, firstFace, lod).a);
}

vec3 giantAlbedo(vec3 local, vec2 firstFaces, float footprint, vec3 sun) {
  float lod = max(log2(footprint / GIANT_TEXEL), 0.0);
  float octaves = clamp(log2(GIANT_TEXEL / (GIANT_DETAIL_SCALE * max(footprint, 1e-9))), 0.0, MAX_DETAIL_OCTAVES);
  float sunHeight = dot(sun, local);
  vec3 towardSun = HIGH_CLOUD_HEIGHT * (sun - local * sunHeight) / max(sunHeight, 0.3);
  vec4 layers;
  if (firstFaces.y < 0.0) layers = giantLayers(local, vec3(0.0), firstFaces.x, lod, octaves, towardSun);
  else {
    vec3 flow = GIANT_FLOW_REACH * textureLod(uGiantFlow, giantFaceAt(local), 0.0).xyz;
    vec4 leaving = giantLayers(local, flow * uGiantAge, firstFaces.x, lod, octaves, towardSun);
    vec4 arriving = giantLayers(local, flow * (uGiantAge - 1.0), firstFaces.y, lod, octaves, towardSun);
    layers = mix(leaving, arriving, smoothstep(0.1, 0.9, uGiantAge));
  }
  vec3 deckHue = layers.rgb / max(max(layers.r, max(layers.g, layers.b)), 0.01);
  return mix(layers.rgb, HIGH_CLOUD_BRIGHTNESS * mix(deckHue, vec3(1.0), HIGH_CLOUD_WHITENESS), layers.a);
}

vec3 placeholderAlbedo(vec4 look, vec3 local) {
  if (look.w == BODY_GIANT) return look.rgb;
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

float discOverlapShare(float sunRadius, float coverRadius, float apart) {
  if (apart >= sunRadius + coverRadius) return 0.0;
  if (apart <= abs(sunRadius - coverRadius)) {
    float smaller = min(sunRadius, coverRadius);
    return smaller * smaller / (sunRadius * sunRadius);
  }
  float sunPart = sunRadius * sunRadius * acos(clamp((apart * apart + sunRadius * sunRadius - coverRadius * coverRadius) / (2.0 * apart * sunRadius), -1.0, 1.0));
  float coverPart = coverRadius * coverRadius * acos(clamp((apart * apart + coverRadius * coverRadius - sunRadius * sunRadius) / (2.0 * apart * coverRadius), -1.0, 1.0));
  float kite = 0.5 * sqrt(max((-apart + sunRadius + coverRadius) * (apart + sunRadius - coverRadius) * (apart - sunRadius + coverRadius) * (apart + sunRadius + coverRadius), 0.0));
  return (sunPart + coverPart - kite) / (3.1415927 * sunRadius * sunRadius);
}

const vec3 LIGHT_BENT_THROUGH_AIR = vec3(0.32, 0.09, 0.03);

vec3 sunlightReaching(int i, vec3 surface) {
  vec3 sun = uBodySun[i].xyz;
  float sunRadius = uBodySun[i].w;
  float hidden = 0.0;
  vec3 bent = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec4 eclipser = uBodyEclipser[i * 2 + k];
    if (eclipser.w == 0.0) continue;
    vec3 toward = eclipser.xyz - surface;
    float along = dot(toward, sun);
    if (along <= 0.0) continue;
    float coverRadius = asin(min(abs(eclipser.w) / length(toward), 1.0));
    float share = discOverlapShare(sunRadius, coverRadius, atan(length(cross(toward, sun)), along));
    hidden += share;
    if (eclipser.w < 0.0) bent += LIGHT_BENT_THROUGH_AIR * share;
  }
  return (vec3(max(1.0 - hidden, 0.0)) + bent) * (1.0 - uBodyGlow[i].w);
}

const int HAZE_STEPS_PER_SIDE = 8;
const float HAZE_SCALES_SHOWN = 12.0;
const float HAZE_PIXEL_BLUR = 0.5;
const float HAZE_DEEPEST_EXPONENT = 40.0;
const float HAZE_SMALLEST_PIXELS = 1.0;
const float HAZE_FULL_PIXELS = 4.0;
const float HAZE_DISPLAY_GAIN = 4.5;
const float HAZE_RESCATTERING = 0.6;
const float HAZE_DISPLAY_GAMMA = 0.4545;
uniform vec4 uHazeBody;
uniform vec4 uHazeGas[${MAX_HAZY}];
uniform vec4 uHazeDust[${MAX_HAZY}];
uniform vec4 uHazeDustLight[${MAX_HAZY}];
uniform vec4 uHazeLayer[${MAX_HAZY}];
uniform vec4 uHazeLayerShape[${MAX_HAZY}];

vec3 rounded(int i, vec3 place) {
  return place + uBodyNorth[i] * dot(place, uBodyNorth[i]) * (1.0 / (1.0 - uBodyFlattening[i]) - 1.0) + uBodyNarrowing[i].xyz * dot(place, uBodyNarrowing[i].xyz);
}

float longestRadius(int i) {
  return sin(uBodyPlace[i].w) * uBodyNarrowing[i].w;
}

vec3 surfaceNormal(int i, vec3 fromCentre) {
  return normalize(uBodyFlattening[i] > 0.0 ? rounded(i, rounded(i, fromCentre)) : fromCentre);
}

struct Haze {
  vec3 light;
  vec3 clear;
};

const Haze NO_HAZE = Haze(vec3(0.0), vec3(1.0));

int hazeOf(int body) {
  for (int k = 0; k < ${MAX_HAZY}; k++) if (int(uHazeBody[k]) == body) return k;
  return -1;
}

float airMassTowardSun(float r, float sunHeight, float scaleHeight) {
  float x = r / scaleHeight;
  float c = sqrt(1.5707963 * x);
  float climbing = c / ((c - 1.0) * abs(sunHeight) + 1.0);
  if (sunHeight >= 0.0) return climbing;
  float lowest = x * sqrt(max(1.0 - sunHeight * sunHeight, 0.0));
  return 2.0 * sqrt(1.5707963 * lowest) * exp(min(x - lowest, HAZE_DEEPEST_EXPONENT)) - climbing;
}

float rayleighPhase(float towardSun) {
  return 0.75 * (1.0 + towardSun * towardSun);
}

float dustPhase(float towardSun, float forwardness) {
  float g2 = forwardness * forwardness;
  return (1.0 - g2) / pow(1.0 + g2 - 2.0 * forwardness * towardSun, 1.5);
}

vec3 sunlightIntoHaze(int k, float r, float sunHeight, vec2 scales, vec2 density) {
  vec3 depth = uHazeGas[k].rgb * density.x * airMassTowardSun(r, sunHeight, scales.x)
    + uHazeLayerShape[k].y * uHazeDust[k].rgb * density.y * airMassTowardSun(r, sunHeight, scales.y);
  return exp(-HAZE_RESCATTERING * max(depth, 0.0));
}

vec3 sunlightToSurface(int i, float sunHeight) {
  int k = hazeOf(i);
  if (k < 0) return vec3(1.0);
  return pow(sunlightIntoHaze(k, 1.0, max(sunHeight, 0.0), vec2(uHazeGas[k].w, uHazeDust[k].w), vec2(1.0)), vec3(HAZE_DISPLAY_GAMMA));
}

vec3 detachedHaze(int k, float miss, float farSideSeen, float sunHeight) {
  float height = 1.0 + uHazeLayer[k].w;
  float width = uHazeLayerShape[k].x;
  if (width <= 0.0) return vec3(0.0);
  float above = max(miss - height, 0.0) / width;
  float column = 2.0 * height * exp(-above * above) / sqrt(max(height * height - miss * miss, 0.0) + 1.5 * width * height);
  return uHazeLayer[k].rgb * column * (0.5 + 0.5 * farSideSeen) * smoothstep(-0.55, 0.1, sunHeight);
}

const float GAS_LIGHT_RESCATTERED = 0.65;

Haze hazeAround(int i, vec3 direction) {
  int k = hazeOf(i);
  if (k < 0) return NO_HAZE;
  vec3 centre = uBodyPlace[i].xyz;
  float radius = sin(uBodyPlace[i].w);
  float along = dot(direction, centre) / radius;
  vec3 nearest = (direction * dot(direction, centre) - centre) / radius;
  float miss = length(nearest);
  float pixel = uPixelAngle / radius;
  vec2 trueScales = vec2(uHazeGas[k].w, uHazeDust[k].w);
  float blur = HAZE_PIXEL_BLUR * min(pixel, 0.1);
  vec2 scales = sqrt(trueScales * trueScales + blur * blur);
  float top = 1.0 + max(HAZE_SCALES_SHOWN * max(scales.x, scales.y), uHazeLayer[k].w + 3.0 * uHazeLayerShape[k].x);
  float leaving = sqrt(max(top * top - miss * miss, 0.0));
  if (miss >= top || leaving <= -along || pixel * HAZE_SMALLEST_PIXELS >= 1.0) return NO_HAZE;
  float cover = along > 0.0 ? clamp((1.0 - miss) / pixel + 0.5, 0.0, 1.0) : 0.0;
  float start = max(-leaving, -along);
  float end = mix(leaving, -sqrt(max(1.0 - miss * miss, 0.0)), cover);
  if (end <= start) return NO_HAZE;
  float closest = clamp(0.0, start, end);

  vec3 sun = uBodySun[i].xyz;
  float towardSun = dot(direction, sun);
  float gasPhase = 0.25 * rayleighPhase(towardSun);
  vec3 dustShine = 0.25 * dustPhase(towardSun, uHazeDustLight[k].w) * uHazeDustLight[k].rgb;
  vec3 light = vec3(0.0);
  vec3 depth = vec3(0.0);
  vec3 depthRefilled = vec3(0.0);
  for (int n = 0; n < 2 * HAZE_STEPS_PER_SIDE; n++) {
    float t = (float(n) + 0.5) / float(HAZE_STEPS_PER_SIDE) - 1.0;
    float reach = t < 0.0 ? start - closest : end - closest;
    float stepLength = 2.0 * abs(t * reach) / float(HAZE_STEPS_PER_SIDE);
    if (stepLength <= 0.0) continue;
    vec3 p = nearest + direction * (closest + reach * t * t);
    float r = max(length(p), 1.0);
    vec2 density = exp((1.0 - r) / scales);
    vec3 gas = uHazeGas[k].rgb * density.x * stepLength / scales.x;
    vec3 dust = uHazeDust[k].rgb * density.y * stepLength / scales.y;
    vec3 dustLight = dustShine * density.y * stepLength / scales.y;
    vec3 sunlit = sunlightIntoHaze(k, r, dot(p, sun) / r, scales, density);
    vec3 stepDepth = gas + dust;
    vec3 refilled = GAS_LIGHT_RESCATTERED * smoothstep(0.05, 0.6, dot(p, sun) / r) * gas;
    vec3 stepDimmed = stepDepth - refilled;
    light += ((gas * gasPhase + dustLight) * sunlit + refilled * 0.25 * (1.0 - sunlit)) * exp(depthRefilled - depth) * (1.0 - exp(-stepDimmed)) / max(stepDimmed, 1e-6);
    depth += stepDepth;
    depthRefilled += refilled;
  }
  vec3 outward = normalize(nearest - direction * sqrt(max(1.0 - miss * miss, 0.0)));
  vec3 detached = detachedHaze(k, miss, (1.0 - cover) * exp(-depth.g), dot(outward, sun));
  float shown = smoothstep(HAZE_SMALLEST_PIXELS, HAZE_FULL_PIXELS, 1.0 / pixel);
  float spread = max(trueScales.x / scales.x, trueScales.y / scales.y);
  shown *= mix(spread, 1.0, cover);
  vec3 glow = 1.0 - exp(-HAZE_DISPLAY_GAIN * (light + detached));
  return Haze(glow * uStarlight * sunlightReaching(i, outward) * shown, mix(vec3(1.0), exp(-HAZE_DISPLAY_GAMMA * depth), shown));
}

const int CRATER_SIZES = 4;
const float CRATER_COARSEST = 2.2;
const float CRATER_FINER = 2.7;
const float CRATER_SMALLEST_PIXELS = 3.0;
const float CRATER_DEPTH = 0.42;
const float CRATER_WOBBLE = 0.35;
const float CRATER_DEEPEST_KM = 3.0;
const float CRATER_DEEP_FROM_KM = 90.0;
const float EARTH_RADIUS_KM = 6371.0;
const float LAND_RISE_KM = 14.0;
const float SEA_FLOOR_KM = 8.0;
const float MOUNTAIN_KM = 5.0;
const float CITY_LIGHT_LIFT = 0.8;
const float COAST_CROWDING = 22.0;
const float FROZEN_LAND_SETTLED = 0.6;
const float FROZEN_SEA_KM = 0.05;
const float HIGHLAND_KM = 10.0;
const float HILL_KM = 3.5;
const float LAVA_PLAIN_KM = -0.6;
const float COAST_HALF_WIDTH = 0.02;
const float CRATER_RAY_LIGHT = 0.16;
const float RELIEF_SCALE = 5.0;
const float RELIEF_PROBE = 0.2;
const float RELIEF_STRENGTH = 0.22;
const float SEA_LEVEL = 0.53;
const float FREEZING_KELVIN = 258.0;
const float MELTING_KELVIN = 1250.0;
const float SUBSTELLAR_WARMTH = 1.41;
const vec3 INVENTED_OCEAN = vec3(0.025, 0.06, 0.11);
const vec3 INVENTED_ICE = vec3(0.82, 0.87, 0.92);
const float CLOUD_HIDES_SURFACE = 0.97;
const float GLOW_GAMMA = 0.65;

struct Invented {
  vec3 albedo;
  vec3 slope;
  float water;
  float kelvin;
  vec3 dryAlbedo;
  float solid;
  float heightKm;
  float settled;
  float growing;
  float runny;
};

vec3 cellHash(vec3 cell) {
  return vec3(textureLod(uLattice, (cell + 0.5) / ${LATTICE_PERIOD}.0, 0.0).r, textureLod(uLattice, (cell.yzx + 17.5) / ${LATTICE_PERIOD}.0, 0.0).r, textureLod(uLattice, (cell.zxy + 41.5) / ${LATTICE_PERIOD}.0, 0.0).r);
}

float craterFloorKm(float radiusKm, float reach) {
  float bowl = reach < 1.0 ? reach * reach - 1.0 : 0.0;
  float rim = 0.25 * exp(-(reach - 1.0) * (reach - 1.0) / 0.04);
  return CRATER_DEEPEST_KM * (1.0 - exp(-radiusKm / CRATER_DEEP_FROM_KM)) * (bowl + rim);
}

vec3 inverseAxes = vec3(1.0);

vec3 ontoSurface(vec3 place) {
  return place / length(place * inverseAxes);
}

vec4 craters(vec3 local, float seed, float footprint, out float heightKm) {
  heightKm = 0.0;
  vec3 slope = vec3(0.0);
  float light = 0.0;
  float wobble = detailNoise(local * 14.0 + seed, 3.0);
  float scale = CRATER_COARSEST;
  for (int k = 0; k < CRATER_SIZES; k++) {
    float shown = smoothstep(1.0, 2.0, 0.3 / (scale * footprint * CRATER_SMALLEST_PIXELS));
    if (shown <= 0.0) break;
    vec3 p = local * scale + seed + float(k) * 11.3;
    vec3 base = floor(p - 0.5);
    for (int n = 0; n < 8; n++) {
      vec3 cell = base + vec3(n & 1, (n >> 1) & 1, (n >> 2) & 1);
      vec3 random = cellHash(cell);
      vec3 centre = cell + 0.3 + 0.4 * random;
      vec3 surfaceCentre = ontoSurface(centre - seed - float(k) * 11.3) * scale + seed + float(k) * 11.3;
      if (length(surfaceCentre - centre) > 0.35) continue;
      float size = 0.07 + 0.26 * random.y * random.x * random.x;
      vec3 off = p - surfaceCentre;
      float reach = length(off) / size * (1.0 + CRATER_WOBBLE * wobble);
      if (reach > 2.0) continue;
      heightKm += shown * craterFloorKm(size / scale * EARTH_RADIUS_KM, reach);
      float inner = 1.6 * smoothstep(0.3, 0.75, reach) * (1.0 - smoothstep(0.8, 1.05, reach));
      float outer = -0.9 * smoothstep(0.9, 1.15, reach) * exp(-3.0 * max(reach - 1.1, 0.0)) * (2.0 - reach);
      slope += shown * CRATER_DEPTH * (0.5 + 0.8 * random.z) * (inner + outer) * off / max(length(off), 1e-4);
      light += shown * CRATER_RAY_LIGHT * (random.z > 0.7 ? 1.0 : -0.25) * (1.0 - smoothstep(0.7, 2.0, reach));
    }
    scale *= CRATER_FINER;
  }
  return vec4(slope, light);
}

vec3 reliefSlope(vec3 p, float octaves) {
  float here = detailNoise(p, octaves);
  return (vec3(detailNoise(p + vec3(RELIEF_PROBE, 0.0, 0.0), octaves), detailNoise(p + vec3(0.0, RELIEF_PROBE, 0.0), octaves), detailNoise(p + vec3(0.0, 0.0, RELIEF_PROBE), octaves)) - here) / RELIEF_PROBE;
}

float broadNoise(vec3 p) {
  return 0.57 * smoothNoise(p) + 0.29 * smoothNoise(p * 2.03 + vec3(7.1, 2.9, 5.3)) + 0.14 * smoothNoise(p * 4.12 + vec3(21.5, 8.8, 16.1));
}

vec3 broadWarp(vec3 p) {
  return vec3(broadNoise(p), broadNoise(p + 9.2), broadNoise(p + 18.4)) - 0.5;
}

float citiesNear(vec3 local, float scale, float seed) {
  vec3 p = local * scale + seed;
  vec3 base = floor(p - 0.5);
  float glow = 0.0;
  for (int n = 0; n < 8; n++) {
    vec3 cell = base + vec3(n & 1, (n >> 1) & 1, (n >> 2) & 1);
    vec3 random = cellHash(cell);
    vec3 centre = normalize(cell + 0.25 + 0.5 * random - seed) * scale + seed;
    float size = 0.04 + 0.16 * random.x * random.x;
    float reach = length(p - centre) / size;
    glow += smoothstep(0.4, 0.75, random.y) * (exp(-2.0 * reach * reach) + 0.1 * exp(-reach));
  }
  return glow;
}

const float COLDEST_STAINED_KELVIN = 60.0;
const float DARKER_COLD_ICE = 0.8;
uniform vec4 uMappedTerrain;
uniform float uGreenery;
const float COAST_FRAY_KM = 0.5;
const float MAPPED_MOUNTAIN_SHARE = 0.25;
const vec3 GREENERY = vec3(0.13, 0.22, 0.08);
const vec3 DRY_GREENERY = vec3(0.34, 0.31, 0.17);

float mappedAboveSea(vec3 local, float fray) {
  vec2 uv = vec2(atan(local.y, local.x) / 6.2831853 + 0.5, 0.5 - asin(clamp(local.z, -1.0, 1.0)) / 3.1415927);
  float km = uMappedTerrain.z + uMappedTerrain.w * mapHeight(uMappedTerrain.x, uv) - uMappedTerrain.y + COAST_FRAY_KM * fray;
  return km / (km > 0.0 ? LAND_RISE_KM : SEA_FLOOR_KM);
}

const float COOLEST_FLOWING_KELVIN = 950.0;

Invented inventSurface(vec3 local, vec3 sun, vec3 tint, float seed, float kelvin, float tideLocked, bool wet, float footprint, bool bareGround) {
  Invented made = Invented(tint, vec3(0.0), 0.0, kelvin, tint, 1.0, 0.0, 0.0, 0.0, 0.0);
  float sunHeight = dot(local, sun);
  vec3 p = local * 1.7 + seed;
  vec3 warp = broadWarp(p * 1.3);
  if (wet) {
    if (!bareGround && sunHeight < -0.1) return made;
  }
  float plains = terrain(p + 1.1 * warp);
  float fine = terrain(p * 6.0 + 3.0 * warp);
  float octaves = clamp(log2(1.0 / (RELIEF_SCALE * footprint)), 0.0, MAX_DETAIL_OCTAVES);
  if (wet) {
    float poleward = local.z * local.z;
    float warmth = tideLocked > 0.5 ? kelvin + 42.0 * sunHeight + 14.0 : kelvin + 32.0 - 60.0 * poleward;
    warmth += 26.0 * (fine - 0.5) + 30.0 * (plains - 0.5);
    bool terrainMapped = uMappedTerrain.w > 0.0;
    float aboveSea = terrainMapped ? mappedAboveSea(local, detailNoise(local * RELIEF_SCALE + seed, octaves)) : plains + 0.12 * (fine - 0.5) - SEA_LEVEL;
    float land = smoothstep(0.0, max(0.004, 2.0 * footprint), aboveSea);
    float ice = smoothstep(FREEZING_KELVIN + 3.0, FREEZING_KELVIN - 3.0, warmth - 5.0 * land);
    float crack = ice > 0.0 && land < 1.0 ? 1.0 - smoothstep(0.0, 0.035, abs(terrain(p * 3.4 + 5.0 * warp) - 0.5)) : 0.0;
    vec3 ground = tint * (0.55 + 0.9 * fine);
    if (terrainMapped) {
      float damp = smoothstep(0.3, 0.7, terrain(p * 2.3 + 7.0) + 0.25 * (0.5 - abs(abs(local.z) - 0.45)));
      float lowland = smoothstep(0.45, 0.15, aboveSea);
      ground = mix(ground, mix(DRY_GREENERY, GREENERY, damp) * (0.6 + 0.8 * fine), uGreenery * lowland);
      made.growing = lowland * mix(0.25, 1.0, damp) * (1.0 - ice);
    }
    vec3 frozen = INVENTED_ICE * (0.8 + 0.3 * fine) * (1.0 - 0.22 * crack * (1.0 - land));
    made.albedo = mix(mix(INVENTED_OCEAN, ground, land), frozen, ice);
    made.water = (1.0 - land) * (1.0 - ice);
    made.runny = 1.0 - ice;
    made.dryAlbedo = mix(ground, frozen, ice);
    made.solid = max(smoothstep(-COAST_HALF_WIDTH, COAST_HALF_WIDTH, aboveSea), ice);
    if (bareGround) {
      float mountains = (terrainMapped ? MAPPED_MOUNTAIN_SHARE : 1.0) * MOUNTAIN_KM * max(detailNoise(local * RELIEF_SCALE + seed, octaves), 0.0) * smoothstep(0.0, 0.06, aboveSea);
      made.heightKm = aboveSea > 0.0 ? LAND_RISE_KM * aboveSea + mountains : mix(SEA_FLOOR_KM * aboveSea, FROZEN_SEA_KM, ice);
      float coast = exp(-COAST_CROWDING * max(aboveSea, 0.0));
      float region = smoothstep(0.42, 0.62, terrain(local * 5.0 + seed + 33.0));
      float roads = smoothstep(0.07, 0.0, abs(terrain(local * 16.0 + seed + 2.0 * warp) - 0.5)) * smoothstep(0.4, 0.65, broadNoise(local * 60.0 + seed));
      float cities = citiesNear(local, 16.0, seed) + 0.8 * citiesNear(local, 45.0, seed) + 0.5 * citiesNear(local, 110.0, seed);
      float crowded = mix(0.3, 1.0, coast) * mix(0.15, 1.0, region);
      made.settled = land * mix(1.0, FROZEN_LAND_SETTLED, ice) * crowded * max(3.2 * cities + 0.4 * roads - 0.09, 0.0);
    }
    float relief = max(land, 0.25 * ice);
    if (relief > 0.0) made.slope = RELIEF_STRENGTH * relief * reliefSlope(local * RELIEF_SCALE + seed, octaves);
    return made;
  }
  float craterKm = 0.0;
  vec4 cratered = kelvin < MELTING_KELVIN ? craters(local, seed, footprint, craterKm) : vec4(0.0);
  if (bareGround) made.heightKm = HIGHLAND_KM * (plains - 0.5) + HILL_KM * detailNoise(local * RELIEF_SCALE + seed, octaves) + craterKm;
  made.slope = RELIEF_STRENGTH * reliefSlope(local * RELIEF_SCALE + seed, octaves) + cratered.xyz;
  if (kelvin <= 175.0) {
    float stain = smoothstep(0.48, 0.62, plains);
    float crack = 1.0 - smoothstep(0.0, 0.03, abs(terrain(p * 2.8 + 5.0 * warp) - 0.5));
    made.albedo = tint * mix(vec3(1.0), kelvin < COLDEST_STAINED_KELVIN ? DARKER_COLD_ICE * tint / max(tint.r, max(tint.g, tint.b)) : vec3(0.62, 0.45, 0.33), 0.7 * stain + 0.5 * crack) * (0.75 + 0.45 * fine) + 0.5 * cratered.w;
    return made;
  }
  float basalt = smoothstep(0.46, 0.56, plains);
  made.albedo = tint * mix(1.1, 0.55, basalt) * (0.72 + 0.56 * fine) * (1.0 + cratered.w);
  if (kelvin < 850.0) return made;
  float dayside = tideLocked > 0.5 ? pow(max(sunHeight, 0.0), 0.25) : 0.75;
  made.kelvin = max(kelvin * SUBSTELLAR_WARMTH * dayside, 0.55 * kelvin);
  made.runny = smoothstep(COOLEST_FLOWING_KELVIN - 100.0, COOLEST_FLOWING_KELVIN + 100.0, made.kelvin);
  float crust = smoothstep(0.03, 0.12, abs(terrain(p * 4.5 + 4.0 * warp) - 0.5));
  float molten = smoothstep(MELTING_KELVIN, MELTING_KELVIN + 550.0, made.kelvin + 500.0 * (plains - 0.5));
  made.kelvin = mix(made.kelvin, made.kelvin * mix(1.08, 0.78, crust), molten);
  made.albedo *= mix(1.0, 0.4, molten);
  made.slope *= 1.0 - 0.8 * molten;
  made.heightKm = mix(made.heightKm, LAVA_PLAIN_KM, 0.85 * molten);
  return made;
}

uniform sampler2D uInventedColour;
uniform int uInventedBody;
const float INVENTED_TEXEL = 6.2831853 / ${INVENTED_COLOUR_WIDTH}.0;
const float PAINTED_RELIEF_OCTAVES = 4.0;

vec4 inventedPaint(vec2 uv, float footprint) {
  vec4 texel = textureLod(uInventedColour, uv, max(log2(footprint / INVENTED_TEXEL), 0.0));
  return vec4(texel.rgb * texel.rgb, texel.a);
}

Invented paintedSeaWorld(vec3 local, vec2 uv, float seed, float footprint) {
  vec4 paint = inventedPaint(uv, footprint);
  Invented made = Invented(paint.rgb, vec3(0.0), 0.0, 0.0, paint.rgb, 1.0, 0.0, 0.0, 0.0, 0.0);
  float coastTexel = 6.2831853 / float(textureSize(uInventedLand, 0).x);
  float solid = textureLod(uInventedLand, uv, 0.0).r;
  float nearCoast = 4.0 * solid * (1.0 - solid);
  if (nearCoast > 0.0) solid += COAST_ROUGHNESS * nearCoast * detailNoise(local / coastTexel, clamp(log2(coastTexel / footprint), 0.0, MAX_DETAIL_OCTAVES));
  float edge = clamp(0.5 * footprint / coastTexel, COAST_SHARPEST, 0.5);
  float land = smoothstep(0.5 - edge, 0.5 + edge, solid);
  made.albedo = mix(INVENTED_OCEAN, paint.rgb, land);
  made.water = 1.0 - land;
  if (land > 0.0) made.slope = RELIEF_STRENGTH * land * reliefSlope(local * RELIEF_SCALE + seed, clamp(log2(1.0 / (RELIEF_SCALE * footprint)), 0.0, PAINTED_RELIEF_OCTAVES));
  return made;
}

vec3 thermalGlow(int i, float kelvin) {
  return pow(planckBands(kelvin) / 2.5718e14 / uBodyLamp[i].rgb, vec3(GLOW_GAMMA));
}

vec3 placeOnShape(int i, vec3 fromCentre, BodyFrame frame, vec3 ballLocal) {
  if (uBodyFlattening[i] <= 0.0) return ballLocal;
  vec3 narrow = uBodyNarrowing[i].xyz;
  inverseAxes = vec3(1.0, 1.0 + dot(narrow, narrow), 1.0 / (1.0 - uBodyFlattening[i])) / uBodyNarrowing[i].w;
  return bodyLocal(fromCentre, frame) / sin(uBodyPlace[i].w);
}

#ifndef INVENTED_PASS
#define INVENTED_PASS 0
#endif

vec3 shadeBody(int i, vec3 direction, float hit, float radius) {
  vec4 place = uBodyPlace[i];
  vec4 look = uBodyLook[i];
  vec4 map = uBodyMap[i];
  vec3 normal = surfaceNormal(i, direction * hit - place.xyz);
  float mu = max(dot(normal, -direction), 0.0);
  if (look.w == BODY_STAR) return look.rgb * (0.4 + 0.6 * mu);
  bool invented = INVENTED_PASS == 1;
  bool wet = invented && uBodyWet[i] > 0.5;

  BodyFrame frame = BodyFrame(uBodyNorth[i], uBodyMeridian[i], cross(uBodyNorth[i], uBodyMeridian[i]));
  vec3 local = bodyLocal(normal, frame);
  vec2 uv = mapCoordinates(normal, frame);
  bool mapped = map.x >= 0.0;
  vec4 surface = mapped ? texture(uBodyColour, vec3(uv, map.x)) : vec4(invented ? look.rgb : placeholderAlbedo(look, local), 1.0);
  vec3 albedo = surface.rgb;
  float land = surface.a;

  float replacedByGround = i == uGround ? uGroundBlend : 0.0;
  float footprint = uPixelAngle * hit / radius * exp2(OCTAVES_LOST_UNDER_GROUND * replacedByGround);
  float mapTexel = 6.2831853 / MAP_WIDTH;
  float octaves = clamp(log2(mapTexel / max(footprint, 1e-9)), 0.0, MAX_DETAIL_OCTAVES);
  vec3 detailPoint = local / mapTexel;
#if INVENTED_PASS == 0
  if (mapped && look.w != BODY_CLOUDED && look.w != BODY_HAZY) albedo = sharpEdged(albedo, uv, map.x, local, footprint);
  if (look.w == BODY_OCEAN_WORLD && mapped) {
    float edgeWidth = clamp(0.5 * footprint / mapTexel, COAST_SHARPEST, 0.5);
    float nearCoast = 4.0 * land * (1.0 - land);
    float coastline = nearCoast > 0.0 ? land + COAST_ROUGHNESS * nearCoast * detailNoise(detailPoint + vec3(31.7, 4.3, 17.9), octaves) : land;
    land = smoothstep(0.5 - edgeWidth, 0.5 + edgeWidth, coastline);
    albedo = mix(OCEAN_ALBEDO, albedo, land);
  }
  if (look.w == BODY_CLOUDED) albedo = look.rgb * cloudTopShade(local, detailPoint, octaves);
  if (look.w == BODY_GIANT && map.y >= 0.0) albedo = giantAlbedo(local, map.yz, footprint, bodyLocal(uBodySun[i].xyz, frame));
  if (look.w == BODY_HAZY) albedo = look.rgb * hazeShade(local, detailPoint, octaves);
#endif

  vec3 shaded = normal;
#if INVENTED_PASS == 0
  if (mapped && look.w != BODY_CLOUDED && look.w != BODY_HAZY) {
    float latitudeCos = max(sqrt(1.0 - local.z * local.z), 0.05);
    vec2 texel = vec2(1.0 / MAP_WIDTH, 1.0 / MAP_HEIGHT);
    float eastSlope = (mapHeight(map.x, uv + vec2(texel.x, 0.0)) - mapHeight(map.x, uv - vec2(texel.x, 0.0))) / (2.0 * 6.2831853 * texel.x * latitudeCos);
    float northSlope = (mapHeight(map.x, uv - vec2(0.0, texel.y)) - mapHeight(map.x, uv + vec2(0.0, texel.y))) / (2.0 * 3.1415927 * texel.y);
    vec3 eastward = normalize(frame.east - normal * dot(frame.east, normal));
    vec3 northward = cross(normal, eastward);
    shaded = normalize(normal - land * map.y * (eastSlope * eastward + northSlope * northward));
    if (octaves > 0.0 && land > 0.0) {
      float probe = 0.35;
      float here = detailNoise(detailPoint, octaves);
      float towardEast = detailNoise(detailPoint + probe * bodyLocal(eastward, frame), octaves);
      float towardNorth = detailNoise(detailPoint + probe * bodyLocal(northward, frame), octaves);
      float roughness = map.z * land;
      shaded = normalize(shaded - roughness * ((towardEast - here) * eastward + (towardNorth - here) * northward) / probe);
      albedo *= 1.0 + land * DETAIL_ALBEDO * here;
    }
  }
#endif

  vec3 sun = uBodySun[i].xyz;
  Invented made = Invented(albedo, vec3(0.0), 0.0, 0.0, albedo, 1.0, 0.0, 0.0, 0.0, 0.0);
  vec3 sunLocal = bodyLocal(sun, frame);
  bool underClouds = look.w == BODY_OCEAN_WORLD || wet;
  vec2 sheet = vec2(0.0);
  if (underClouds) {
    useClouds(i, sunLocal);
    sheet = cloudSheet(inCloudFrame(local), footprint, true);
  }
#if INVENTED_PASS
  if (sheet.x <= CLOUD_HIDES_SURFACE) {
    bool painted = i == uInventedBody && wet;
    if (painted) made = paintedSeaWorld(local, uv, map.y, footprint);
    else made = inventSurface(placeOnShape(i, direction * hit - place.xyz, frame, local), sunLocal, look.rgb, map.y, map.z, uBodyLamp[i].w, wet, footprint, false);
    albedo = made.albedo;
    vec3 slope = made.slope.x * frame.meridian + made.slope.y * frame.east + made.slope.z * frame.north;
    shaded = normalize(normal - (slope - normal * dot(slope, normal)));
  }
#endif
  float daylight = look.w == BODY_HAZY ? smoothstep(-HAZE_TWILIGHT, HAZE_TWILIGHT, dot(normal, sun)) : smoothstep(-0.02, 0.05, dot(normal, sun));
  float sunHeight = max(dot(normal, sun), 0.0);
  float lighting = max(dot(shaded, sun), 0.0);
  if (look.w == BODY_CLOUDED || look.w == BODY_HAZY) lighting = mix(lighting, 2.0 * sunHeight / (sunHeight + mu + 1e-4), CLOUD_DECK_FLATNESS);
  vec3 lit = albedo * lighting * daylight;
  float cloudsOver = 0.0;
  if (look.w == BODY_OCEAN_WORLD) {
    vec3 halfway = normalize(sun - direction);
    lit += (1.0 - land) * daylight * sunHeight * OCEAN_GLINT * pow(max(dot(normal, halfway), 0.0), OCEAN_SHININESS);
  }
  if (invented) {
    vec3 halfway = normalize(sun - direction);
    lit += made.water * daylight * sunHeight * OCEAN_GLINT * pow(max(dot(normal, halfway), 0.0), OCEAN_SHININESS);
  }
  if (underClouds) {
    vec3 cloudLocal = inCloudFrame(local);
    if (daylight > 0.0) lit *= cloudSheetShadow(cloudLocal, cloudsSunNow, max(log2(footprint / cloudTexel()), 0.0));
    cloudsOver = CLOUD_OPACITY * sheet.x;
    float sheetLight = daylight > 0.0 ? cloudSheetLight(cloudLocal, sheet, cloudsSunNow, footprint) : 0.0;
    lit = mix(lit, CLOUD_ALBEDO * sunHeight * daylight * sheetLight, cloudsOver);
  }
  lit *= sunlightToSurface(i, dot(normal, sun)) * sunlightReaching(i, normal) * uStarlight;
  vec3 glow = invented && made.kelvin > 850.0 ? thermalGlow(i, made.kelvin) : uBodyGlow[i].rgb * (0.45 + 1.6 * albedo.g) * (0.45 + 0.55 * mu);
  vec3 lamps = mix((1.0 - made.water) * cityLights(i, uv, footprint, mu, dot(normal, sun)), cityGlowOnClouds(i, uv, footprint, dot(normal, sun)), cloudsOver);
  float brightest = max(1.0, max(glow.r, uBodyGlow[i].r));
  return (lit + lamps + glow) / brightest;
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
const vec2 F_RING_KM = vec2(140155.0, 140205.0);
const float F_RING_DEPTH = 0.6;
const int RING_SAMPLES = 2;
const int RING_SHADOW_SAMPLES = 3;
const float RING_SHADOW_LEAST_FACING = 0.05;
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
    + 0.3 * band(r, w, 136527.0, 136775.0);
  return max(vec2(dusty, icy), 0.0);
}

vec4 ringLook(float depth, vec3 albedo, float viewSlant, float sunSlant, bool litFace) {
  float scattered = depth / viewSlant * exp(-depth / viewSlant);
  if (litFace) scattered = sunSlant / (sunSlant + viewSlant) * (1.0 - exp(-depth * (1.0 / sunSlant + 1.0 / viewSlant)));
  else if (abs(sunSlant - viewSlant) >= 1e-3) scattered = sunSlant / (sunSlant - viewSlant) * (exp(-depth / sunSlant) - exp(-depth / viewSlant));
  float cover = 1.0 - exp(-depth / viewSlant);
  return vec4(albedo * RING_BRIGHTNESS * min(scattered, RING_BRIGHTEST_SHARE), cover);
}

vec4 ringSheet(float rKm, float footprint, float ringlet, float viewSlant, float sunSlant, bool litFace) {
  vec2 depths = ringDepths(rKm, footprint);
  float depth = (depths.x + depths.y) * (1.0 + RINGLET_CONTRAST * ringlet);
  if (depth <= 0.0) return vec4(0.0);
  vec3 albedo = (RING_DUSTY_COLOUR * depths.x + RING_ICY_COLOUR * depths.y) / (depths.x + depths.y) * (1.0 + RINGLET_ALBEDO_CONTRAST * ringlet);
  return ringLook(depth, albedo, viewSlant, sunSlant, litFace);
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
  vec3 outward = normalize(fromCentre);
  vec3 radialGain = outward - north * dot(outward, direction) / (abs(facing) < RING_FLATTEST_VIEW ? RING_FLATTEST_VIEW : facing);
  float footprint = max(uPixelAngle * abs(hit) / radius * uRingedBodyKm * length(radialGain), 1.0);
  if (hit <= 0.0 || rKm + footprint < RING_INNER_KM || rKm - footprint > RING_OUTER_KM) return vec4(0.0);
  vec3 sun = uBodySun[i].xyz;
  float viewSlant = max(abs(facing), RING_FLATTEST_VIEW);
  float sunSlant = max(abs(dot(sun, north)), RING_FLATTEST_VIEW);
  bool litFace = sign(dot(sun, north)) == sign(-dot(centre, north));
  vec4 seen = vec4(0.0);
  float ringlet = ringlets(rKm, footprint);
  for (int k = 0; k < RING_SAMPLES; k++) {
    float off = (float(k) + 0.5) / float(RING_SAMPLES) - 0.5;
    seen += ringSheet(rKm + off * footprint, footprint / float(RING_SAMPLES), ringlet, viewSlant, sunSlant, litFace) / float(RING_SAMPLES);
  }
  seen += band(rKm, footprint, F_RING_KM.x, F_RING_KM.y) * ringLook(F_RING_DEPTH, RING_ICY_COLOUR, viewSlant, sunSlant, litFace);
  if (seen.a <= 0.0) return vec4(0.0);
  vec3 roundedSun = normalize(rounded(i, sun));
  vec3 roundedPlace = rounded(i, fromCentre);
  float towardSun = dot(roundedPlace, roundedSun);
  float offShadowAxis = length(roundedPlace - roundedSun * towardSun) / longestRadius(i);
  float inSaturnShadow = towardSun < 0.0 ? 1.0 - smoothstep(1.0 - RING_SHADOW_SOFTNESS, 1.0 + RING_SHADOW_SOFTNESS, offShadowAxis) : 0.0;
  ringHit = hit;
  return vec4(seen.rgb * (1.0 - inSaturnShadow), seen.a);
}

float sunThroughRings(int i, vec3 direction, float hit) {
  vec3 north = uBodyNorth[i];
  vec3 sun = uBodySun[i].xyz;
  vec3 fromCentre = direction * hit - uBodyPlace[i].xyz;
  float sunRise = dot(sun, north);
  if (abs(sunRise) < 1e-6) return 1.0;
  float toPlane = -dot(fromCentre, north) / sunRise;
  if (toPlane <= 0.0) return 1.0;
  float radius = sin(uBodyPlace[i].w);
  vec3 shadowPlace = fromCentre + sun * toPlane;
  float rKm = ringRadiusKm(shadowPlace, radius);
  vec3 outward = normalize(shadowPlace);
  vec3 surfaceGain = outward - north * dot(outward, sun) / sunRise;
  vec3 normal = surfaceNormal(i, fromCentre);
  vec3 viewGain = surfaceGain - normal * dot(surfaceGain, direction) / min(dot(normal, direction), -RING_SHADOW_LEAST_FACING);
  float footprint = max(uPixelAngle * hit / radius * uRingedBodyKm * length(viewGain), 1.0);
  if (rKm + footprint < RING_INNER_KM || rKm - footprint > RING_OUTER_KM) return 1.0;
  float ringlet = ringlets(rKm, footprint);
  float through = 0.0;
  for (int k = 0; k < RING_SHADOW_SAMPLES; k++) {
    float off = (float(k) + 0.5) / float(RING_SHADOW_SAMPLES) - 0.5;
    vec2 depths = ringDepths(rKm + off * footprint, footprint / float(RING_SHADOW_SAMPLES));
    through += exp(-(depths.x + depths.y) * (1.0 + RINGLET_CONTRAST * ringlet) / abs(sunRise)) / float(RING_SHADOW_SAMPLES);
  }
  return through;
}

const float STAR_KIND = 3.0;
const int CORONA_STREAMERS = 5;
const vec4 CORONA_STREAMER_SHAPE[CORONA_STREAMERS] = vec4[](
  vec4(1.05, 0.7, 1.0, 0.08),
  vec4(-0.2, 0.42, 0.75, -0.06),
  vec4(-1.95, 0.55, 0.65, -0.1),
  vec4(2.95, 0.62, 0.85, 0.12),
  vec4(-1.1, 0.34, 0.35, 0.05)
);
const float CORONA_CONVERGENCE = 1.4;
const float CORONA_CONVERGENCE_HEIGHT = 0.9;
const float CORONA_PINCH_REACH = 1.3;
const float CORONA_HOLE_DENSITY = 0.35;
const float CORONA_STREAMER_DENSITY = 2.6;
const float CORONA_GAIN = 4.5;
const float CORONA_TONE = 1.0;
const float CORONA_LOOP_HEIGHT = 0.3;
const float CORONA_REACH_RADII = 1.1;
const float CORONA_TAPER = 0.8;
const float CORONA_TAPER_RADII = 2.5;
const float CORONA_THREAD_CONTRAST = 0.16;
const float CORONA_PLUME_CONTRAST = 0.4;
const vec3 CORONA_COLOUR = vec3(1.0, 0.98, 0.96);
bool starHit = false;
const float STAR_HIT_MARK = 2.0;

float angleApart(float a, float b) {
  return atan(sin(a - b), cos(a - b));
}

float coronaRootAngle(float positionAngle, float climb) {
  float root = positionAngle;
  for (int k = 0; k < CORONA_STREAMERS; k++) {
    vec4 streamer = CORONA_STREAMER_SHAPE[k];
    float off = angleApart(positionAngle, streamer.x + streamer.w * climb);
    float reach = off / (CORONA_PINCH_REACH * streamer.y);
    float pinch = exp(-reach * reach);
    root += pinch * (off * CORONA_CONVERGENCE * climb - streamer.w * climb);
  }
  return root;
}

float coronaThread(float root, float cells) {
  float x = fract(root / 6.2831853) * cells;
  float cell = floor(x);
  float next = mod(cell + 1.0, cells);
  float a = fract(sin(cell * 127.1 + cells) * 43758.5453);
  float b = fract(sin(next * 127.1 + cells) * 43758.5453);
  float t = fract(x);
  return 2.0 * mix(a, b, t * t * (3.0 - 2.0 * t)) - 1.0;
}

vec3 coronaLight(int i, vec3 direction) {
  vec3 centre = uBodyPlace[i].xyz;
  float apart = atan(length(cross(direction, centre)), dot(direction, centre));
  float radii = max(apart / uBodyPlace[i].w, 1.0);
  if (uCoronaShown <= 0.0) return vec3(0.0);
  vec3 northOnSky = normalize(uBodyNorth[i] - centre * dot(uBodyNorth[i], centre));
  vec3 outward = direction - centre * dot(direction, centre);
  float positionAngle = atan(dot(outward, cross(centre, northOnSky)), dot(outward, northOnSky));
  float climb = 1.0 - exp((1.0 - radii) / CORONA_CONVERGENCE_HEIGHT);
  float root = coronaRootAngle(positionAngle, climb);
  float taper = 1.0 - CORONA_TAPER * smoothstep(1.0, CORONA_TAPER_RADII, radii);
  float streamers = 0.0;
  for (int k = 0; k < CORONA_STREAMERS; k++) {
    vec4 streamer = CORONA_STREAMER_SHAPE[k];
    float off = abs(angleApart(root, streamer.x)) / (streamer.y * taper);
    streamers = max(streamers, streamer.z * (1.0 - smoothstep(0.35, 1.15, off)));
  }
  float resolved = smoothstep(8.0, 40.0, uBodyPlace[i].w / uPixelAngle);
  float threads = resolved * (0.5 * coronaThread(root, 37.0) + 0.3 * coronaThread(root, 83.0) + 0.2 * coronaThread(root, 171.0));
  float contrast = mix(CORONA_PLUME_CONTRAST, CORONA_THREAD_CONTRAST, min(streamers, 1.0));
  float density = mix(1.0, mix(CORONA_HOLE_DENSITY, CORONA_STREAMER_DENSITY, streamers) * (1.0 + contrast * threads), smoothstep(0.0, CORONA_LOOP_HEIGHT, radii - 1.0));
  float falloff = 2.565 * pow(radii, -17.0) + 1.425 * pow(radii, -7.0) + 0.0532 * pow(radii, -2.5);
  float reached = (radii - 1.0) / CORONA_REACH_RADII;
  float shown = 1.0 - exp(-CORONA_GAIN * exp(-reached * reached) * pow(falloff * density, CORONA_TONE));
  return CORONA_COLOUR * shown * uCoronaShown;
}

vec3 coronaBehind(vec3 direction) {
  if (uCoronaShown <= 0.0) return vec3(0.0);
  for (int i = 0; i < uBodyCount; i++) {
    if (uBodyLook[i].w == STAR_KIND && dot(direction, uBodyPlace[i].xyz) > 0.0) return coronaLight(i, direction);
  }
  return vec3(0.0);
}

vec4 throughHaze(vec4 behind, Haze haze) {
  return vec4(haze.light + haze.clear * behind.rgb, 1.0 - (1.0 - behind.a) * dot(haze.clear, vec3(1.0 / 3.0)));
}

const float MIRROR_TILES = 90.0;
const float MIRROR_GAP = 0.12;

vec2 gapsUpTo(vec2 tile) {
  return floor(tile) * MIRROR_GAP + min(fract(tile), MIRROR_GAP);
}

vec3 mirrorLook(int i, vec2 place, float footprint, float facing) {
  vec2 tile = place * MIRROR_TILES;
  float seen = 1.0 - smoothstep(0.2, 0.7, footprint * MIRROR_TILES);
  vec2 halfPixel = vec2(0.5 * max(footprint * MIRROR_TILES, 1e-3));
  vec2 gaps = (gapsUpTo(tile + halfPixel) - gapsUpTo(tile - halfPixel)) / (2.0 * halfPixel);
  float solid = (1.0 - gaps.x) * (1.0 - gaps.y);
  vec3 chance = cellHash(vec3(floor(tile), 5.0));
  float sunSide = dot(uBodySun[i].xyz, uBodyNorth[i]) * facing > 0.0 ? 1.0 : 0.0;
  vec3 reflected = uBodyLook[i].rgb * mix(0.01, 0.12, sunSide) * (1.0 + seen * 0.5 * (chance.x - 0.5));
  if (uBodyGlow[i].r > 0.0 && facing > 0.0) reflected = uBodyGlow[i].rgb * (0.75 + seen * 0.6 * (chance.y - 0.3));
  return reflected * solid;
}

float mirrorCover(int i, vec3 direction, out vec3 colour) {
  colour = vec3(0.0);
  vec4 place = uBodyPlace[i];
  float along = dot(direction, uBodyNorth[i]);
  if (abs(along) < 1e-4) return 0.0;
  float reach = dot(place.xyz, uBodyNorth[i]) / along;
  if (reach <= 0.0) return 0.0;
  float radius = sin(place.w);
  vec3 spot = direction * reach - place.xyz;
  float footprint = uPixelAngle * reach / radius;
  float cover = clamp((1.0 - length(spot) / radius) / footprint + 0.5, 0.0, 1.0);
  if (cover <= 0.0) return 0.0;
  vec3 across = uBodyMeridian[i];
  vec2 plane = vec2(dot(spot, across), dot(spot, cross(uBodyNorth[i], across))) / radius;
  colour = mirrorLook(i, plane, footprint / max(abs(along), 0.05), -along);
  return cover;
}

${EYE_SPIKES}
float spikeReachOf(float pointBrightness) {
  float magnitude = 6.5 - log(max(pointBrightness, 1e-6) / 0.2) / (0.16 * log(10.0));
  return max(SPIKE_FAINTEST_MAGNITUDE - magnitude, 0.0) * SPIKE_PIXELS_PER_MAGNITUDE;
}

vec2 pixelsFrom(vec3 direction, vec3 place) {
  vec3 away = direction - place;
  vec2 onScreen = vec2(dot(away, uRight), dot(away, uUp));
  return onScreen * length(away) / max(length(onScreen) * uPixelAngle, 1e-12);
}

struct BodyHit {
  float along;
  float miss;
  float radius;
  float stretch;
  float cover;
};

BodyHit bodyHit(int i, vec3 direction) {
  vec4 place = uBodyPlace[i];
  bool oblate = uBodyFlattening[i] > 0.0;
  float radius = oblate ? longestRadius(i) : sin(place.w);
  vec3 roundedRay = oblate ? rounded(i, direction) : direction;
  float stretch = oblate ? length(roundedRay) : 1.0;
  vec3 ray = roundedRay / stretch;
  vec3 centre = oblate ? rounded(i, place.xyz) : place.xyz;
  float along = dot(ray, centre);
  float miss = length(ray * along - centre);
  float cover = along > 0.0 ? clamp((radius - miss) / uPixelAngle + 0.5, 0.0, 1.0) : 0.0;
  return BodyHit(along, miss, radius, stretch, cover);
}

float hitDistance(BodyHit seen) {
  float inside = min(seen.miss, seen.radius * 0.9999);
  return (seen.along - sqrt(seen.radius * seen.radius - inside * inside)) / seen.stretch;
}

bool bodyOutOfSight(int i, vec3 direction) {
  return (i == uGround && uGroundBlend >= 1.0) || dot(direction, uBodyPlace[i].xyz) < uBodyReach[i];
}

uniform sampler2D uSurfacesSeen;
uniform sampler2D uInventedSurfacesSeen;

struct Strike {
  int body;
  float hit;
  float radius;
  float cover;
  vec4 ring;
  float ringHit;
};

vec4 strikeColour(Strike strike, vec3 direction, vec3 points) {
  starHit = uBodyLook[strike.body].w == STAR_KIND;
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 surface = texelFetch(uSurfacesSeen, pixel, 0);
  vec3 body = surface.a > 0.0 ? surface.rgb : texelFetch(uInventedSurfacesSeen, pixel, 0).rgb;
  if (strike.body == uRingedBody) body *= sunThroughRings(strike.body, direction, strike.hit);
  float cover = strike.cover;
  vec4 ring = strike.ring;
  if (ring.a <= 0.0) {
    vec3 behind = starHit || cover >= 1.0 ? vec3(0.0) : coronaBehind(direction) * (1.0 - cover);
    return vec4(body * cover + behind + points, cover);
  }
  if (strike.ringHit < strike.hit) return vec4(ring.rgb + body * cover * (1.0 - ring.a) + points, 1.0 - (1.0 - ring.a) * (1.0 - cover));
  return vec4(body * cover + ring.rgb * (1.0 - cover) + points, cover + ring.a * (1.0 - cover));
}

vec4 bodiesColour(vec3 direction) {
  vec3 points = vec3(0.0);
  Haze haze = NO_HAZE;
  Strike strike = Strike(-1, 0.0, 0.0, 0.0, vec4(0.0), -1.0);
  for (int i = 0; i < uBodyCount; i++) {
    if (bodyOutOfSight(i, direction)) continue;
    if (i != uGround || uWarpAxis.w > 0.5) {
      Haze ahead = hazeAround(i, direction);
      haze = Haze(haze.light + haze.clear * ahead.light, haze.clear * ahead.clear);
    }
    float ringHit = -1.0;
    vec4 ring = i == uRingedBody ? ringSeen(i, direction, ringHit) : vec4(0.0);
    vec4 place = uBodyPlace[i];
    BodyHit seen = bodyHit(i, direction);
    float radius = seen.radius;
    float along = seen.along;
    float miss = seen.miss;
    float cover = seen.cover;
    float pointSigma = POINT_SIGMA_PIXELS * uPixelAngle;
    float unresolved = 1.0 - smoothstep(0.5, 2.0, radius / uPixelAngle);
    if (along > 0.0) points += uBodyLook[i].rgb * uBodyMap[i].w * unresolved * exp(-0.5 * miss * miss / (pointSigma * pointSigma));
    float spikeReach = spikeReachOf(uBodyMap[i].w);
    if (along > 0.0 && unresolved > 0.0 && spikeReach > 0.0 && miss < spikeReach * uPixelAngle) {
      points += uBodyLook[i].rgb * uBodyMap[i].w * unresolved * starburst(pixelsFrom(direction, place.xyz), spikeReach);
    }
    if (along > 0.0 && uBodyLook[i].w == STAR_KIND) points += coronaLight(i, direction);
    if (uBodyLook[i].w == BODY_MIRROR) {
      vec3 mirror;
      float mirrored = mirrorCover(i, direction, mirror);
      if (mirrored > 0.5) return throughHaze(vec4(mirror + points, 1.0), haze);
      continue;
    }
    if (cover <= 0.0) {
      if (ring.a > 0.0) return throughHaze(vec4(ring.rgb + points, ring.a), haze);
      continue;
    }
    strike = Strike(i, hitDistance(seen), radius, cover, ring, ringHit);
    break;
  }
  vec4 seen = strike.body < 0 ? vec4(points, 0.0) : strikeColour(strike, direction, points);
  return throughHaze(seen, haze);
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
const float GROUND_HIT = ${GROUND_HIT.toFixed(1)};
const int CLOUD_STEPS = 72;
const float CLOUD_FINEST_STEP_KM = 0.025;
const float CLOUD_FINEST_STEP_SHARE = 0.009;
const float CLOUD_RELIT_CLEARNESS = 0.5;
const float CLOUD_INSIDE_STEP_KM = 0.09;
const float CLOUD_INSIDE_STEP_SHARE = 0.01;
const float CLOUD_CLEAR_STEP_KM = 0.5;
const float CLOUD_CLEAR_STEP_SHARE = 0.15;
const float CLOUD_FIELD_SLOPE_PER_KM = 0.8;
const float CLOUD_STEP_GROWTH = 1.03;
const int CLOUD_SURFACE_HALVINGS = 3;
const float CLOUD_EDGE_GAIN = 5.0;
const float CLOUD_CREST_PROBE_KM = 0.1;
const float CLOUD_CREST_SOFTNESS = 0.4;
const float CLOUD_CREST_DEPTH = 2.0;
const float CLOUD_FACE_SHADE = 0.8;
const float CLOUD_MAPPED_STEP_BLUR_SHARE = 0.25;
const int CLOUD_BILLOW_COUNT = 5;
const int CLOUD_BILLOW_COARSEST = 5;
const float CLOUD_BILLOW_SWING = 0.3;
const float CLOUD_BILLOW_FALLOFF = 0.62;
const float CLOUD_BILLOW_MEAN = 0.3;
const float CLOUD_BILLOW_PEAK = 0.7;
const int THIN_CLOUD_STEPS = 8;
const float CLOUD_STEP_BLUR_SHARE = 0.5;
const ivec4 CLOUD_JITTER_ORDER = ivec4(0, 2, 3, 1);
const float CLOUD_GOLDEN_STEP = 0.618034;
const float CLOUD_LONGEST_MARCH_KM = 160.0;
const float CLOUD_LIT_ALBEDO = 0.8;
const float CLOUD_DARK_BASE_SHARE = 0.75;
const float CLOUD_CLEAR_BILLOWS = 0.4;
const float CLOUD_OVERCAST_BILLOWS = 0.75;
const float CLOUD_SPARSEST_CELL = 1.0;
const float CLOUD_DENSEST_CELL = 0.2;
const float CLOUD_EDGE_SOFTNESS = 0.15;
const float CLOUD_BLURRED_SOFTNESS = 0.8;
const float CLOUD_CELL_CONTRAST = 2.0;
const float CLOUD_DOME_EROSION = 0.25;
const float CLOUD_TOP_CLOSING = 1.0;
const float CLOUD_TOP_CLOSING_SHARE = 0.4;
const float CLOUD_SHADOW_BLUR_METRES = 200.0;
const vec4 CLOUD_CELL_WEIGHTS = vec4(0.45, 0.28, 0.17, 0.1);
const ivec4 CLOUD_CELL_OCTAVES = ivec4(3, 4, 6, 7);
const ivec3 CLOUD_REGION_OCTAVES = ivec3(0, 1, 2);
const vec3 CLOUD_REGION_WEIGHTS = vec3(0.5, 0.3, 0.2);
const float CLOUD_REGION_SWING = 1.6;
const float CLOUD_FLAT_BASE_SHARE = 0.12;
const float CLOUD_DOME_START_SHARE = 0.35;
const float CLOUD_SUN_PROBE_SHARE = 0.35;
const float CLOUD_SCATTERED_SHARE = 0.9;
const float CLOUD_SCATTERED_REACH = 0.24;
const float CLOUD_FORWARD_GLOW = 1.6;
const float CLOUD_FAR_PROBE = 2.4;
const int CLOUD_FAR_CELL_OCTAVES = 1;
const float CLOUD_SHOULDER = 0.75;
const float CLOUD_SKY_LIGHT = 0.5;
const int CLOUD_ALL_CELL_OCTAVES = 4;
const int CLOUD_COARSE_CELL_OCTAVES = 2;
const int CLOUD_SHADOW_SAMPLES = 3;
const int THIN_CLOUD_SHADOW_SAMPLES = 2;
const float CLOUD_LEAST_COVERAGE = 0.01;
const float CLOUDS_DARK_BELOW = -0.15;
const float CLOUD_OPAQUE_CLEARNESS = 0.02;
uniform sampler2D uCloudBillows;
const float SKY_BRIGHTNESS = 0.9;
const float SKY_VEIL_GAIN = 2.5;
const float CLEAR_SKY_LIGHT = 0.3;
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
  vec4 texel = textureLod(uGroundDetail, fract(shifted / ${GROUND_DETAIL_PERIOD_CELLS}.0), 0.0);
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

const float HOTTEST_GROUND_KELVIN = 4000.0;

bool groundInvented() {
  return uBodyLook[uGround].w == BODY_INVENTED;
}

vec4 inventedGround(vec3 up, float footprintMetres) {
  return inventedPaint(groundUv(up), footprintMetres / (1000.0 * uGroundRadius));
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

const float HAZE_LOWEST_SCALES = 0.8;
const float HAZE_FULL_SCALES = 2.8;

float hazeSeenFromAbove() {
  return max(smoothstep(HAZE_LOWEST_SCALES, HAZE_FULL_SCALES, cameraAltitudeKm() / uGroundAir.w), 1.0 - uGroundBlend);
}

float airDensityHere() {
  return exp(-max(cameraAltitudeKm(), 0.0) / uGroundAir.w);
}

float airDensityAlong(vec3 ray, float km) {
  float from = max(cameraAltitudeKm(), 0.0);
  float to = max(from + km * dot(ray, uGroundCameraUp) + km * km / (2.0 * uGroundRadius), 0.0);
  float climb = (to - from) / uGroundAir.w;
  if (abs(climb) < 1e-3) return exp(-from / uGroundAir.w);
  return (exp(-from / uGroundAir.w) - exp(-to / uGroundAir.w)) / climb;
}

const float TOTALITY_SKYLIGHT = 0.02;
const float TOTALITY_HORIZON_GLOW = 0.08;

float skylightLeft() {
  return mix(TOTALITY_SKYLIGHT, 1.0, uSunVisible);
}

vec3 skyThrough(float density, vec3 ray, vec3 sun, vec3 upHere) {
  if (uGroundAir.w <= 0.0) return vec3(0.0);
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
  vec3 totalityHorizon = uGroundSunset * day * TOTALITY_HORIZON_GLOW * pow(1.0 - abs(viewHeight), 8.0);
  return mix(sky, overcastSky, uGroundOvercast) * skylightLeft() + totalityHorizon * (1.0 - uSunVisible);
}

vec3 groundSky(vec3 ray, vec3 sun, vec3 upHere) {
  return skyThrough(airDensityHere(), ray, sun, upHere);
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
  return CLOUD_DOME_EROSION * (1.0 - flatBase * (1.0 - dome)) + CLOUD_TOP_CLOSING * smoothstep(CLOUD_TOP_CLOSING_SHARE, 1.0, share);
}

uniform float uGroundCloudsMapped;
const float CLOUD_HIGH_LIFTED = 0.6;
const float CLOUD_HIGH_OPACITY = 0.7;
const float CLOUD_HIGH_KM = 9.0;
const float CLOUD_HIGH_FOOTPRINT = CLOUD_TEXEL / 32.0;
const float CLOUD_SHEET_FROM_KM = 20.0;
const float CLOUD_SHEET_ONLY_KM = 45.0;
const float CLOUD_SHEET_UNLIT_BY_SKY_KM = 160.0;
const float CLOUD_SHEET_SKYLIGHT = 0.6;
const float CLOUD_SHEET_HEIGHT_SHARE = 0.25;
const float CLOUD_THINNEST_COVER = 0.26;
const float CLOUD_TALLEST_COVER = 1.75;
const float CLOUD_MAPPED_BASE_SHARE = 0.1;
const float CLOUD_BASE_CLOSING = 1.6;
const float CLOUD_MAPPED_SUN_PROBE_KM = 1.2;
const float CLOUD_MAPPED_LIT_FROM_SHARE = 0.7;
const float CLOUD_TOWER_STEEPNESS = 1.5;
const float CLOUD_MAPPED_SOFTNESS = 0.05;
const float CLOUD_MAPPED_COARSE_SOFTNESS = 0.22;
const float CLOUD_MAPPED_BLURRED_SOFTNESS = 0.45;
const float CLOUD_MAPPED_CELL_SWING = 0.5;
const float CLOUD_MAPPED_THIN_DENSITY = 0.25;

uniform sampler2D uCloudNearby;
uniform vec3 uCloudNearbyUp;
uniform vec3 uCloudNearbyEast;

vec2 cloudNearby(vec3 up, float blurMetres) {
  vec3 drifted = inCloudFrame(up);
  vec2 across = vec2(dot(drifted, uCloudNearbyEast), dot(drifted, cross(uCloudNearbyUp, uCloudNearbyEast))) * uGroundRadius;
  float distanceKm = length(across);
  vec2 place = across / max(distanceKm, 1e-6) * asinh(distanceKm / CLOUD_NEARBY_FINE_KM) / CLOUD_NEARBY_WARP;
  float lod = max(log2(max(blurMetres, 1.0) / (1000.0 * cloudNearbyTexelKm(distanceKm))), 0.0);
  return textureLod(uCloudNearby, place * 0.5 + 0.5, lod).rg;
}

float highCloudShare(float top) {
  return smoothstep(0.25, 0.6, top);
}

float cloudSheetShare() {
  return uGroundCloudsMapped * smoothstep(CLOUD_SHEET_FROM_KM, CLOUD_SHEET_ONLY_KM, cameraAltitudeKm());
}

vec3 cloudSkylight(float sunHeight) {
  return mix(vec3(dot(uGroundAir.rgb, vec3(0.3, 0.5, 0.2))), uGroundAir.rgb, 0.5) * CLOUD_SKY_LIGHT * smoothstep(-0.15, 0.1, sunHeight) * skylightLeft();
}

vec4 cloudSheetFrom(vec3 ray, vec3 sun, float shellKm, float nearestSolidKm, bool onlyHigh, out float hitKm) {
  vec2 hits = shellCrossings(shellKm, ray);
  hitKm = cameraAltitudeKm() > shellKm ? hits.x : hits.y;
  if (hitKm <= 0.0 || hitKm > nearestSolidKm) return vec4(0.0);
  vec3 up = normalize(uGroundCamera + ray * hitKm);
  vec3 drifted = inCloudFrame(up);
  float footprint = uPixelAngle * hitKm / uGroundRadius;
  if (onlyHigh && highCloudShare(cloudMapped(drifted, 0.0).y) <= 0.0) return vec4(0.0);
  vec2 sheet = cloudSheet(drifted, onlyHigh ? max(footprint, CLOUD_HIGH_FOOTPRINT) : footprint, true);
  float opacity = onlyHigh ? CLOUD_HIGH_OPACITY * sheet.x * highCloudShare(sheet.y) : CLOUD_OPACITY * sheet.x;
  float sunHeight = dot(sun, up);
  vec3 light = onlyHigh
    ? CLOUD_ALBEDO * (0.35 + 0.65 * max(sunHeight, 0.0)) * smoothstep(-0.08, 0.08, sunHeight) * (1.0 + 0.6 * pow(max(dot(ray, sun), 0.0), 8.0))
    : CLOUD_ALBEDO * max(sunHeight, 0.0) * smoothstep(-0.02, 0.05, sunHeight) * cloudSheetLight(drifted, sheet, cloudsSunNow, footprint);
  light *= sunlightToSurface(uGround, sunHeight) * uSunVisible;
  light += CLOUD_SHEET_SKYLIGHT * CLOUD_LIT_ALBEDO * cloudSkylight(sunHeight) * (1.0 - smoothstep(CLOUD_SHEET_ONLY_KM, CLOUD_SHEET_UNLIT_BY_SKY_KM, cameraAltitudeKm()));
  return vec4(light * opacity, opacity);
}

float cloudCoverageAt(vec3 up, float blurMetres) {
  if (uGroundCloudsMapped > 0.5) {
    vec2 mapped = cloudNearby(up, blurMetres);
    return mapped.x * (1.0 - CLOUD_HIGH_LIFTED * highCloudShare(mapped.y));
  }
  return smoothstep(CLOUD_CLEAR_BILLOWS, CLOUD_OVERCAST_BILLOWS, textureLod(uCloudBillows, groundUv(up), 0.0).r + uGroundClouds.w);
}

float cloudRegionalCoverage(float coverage, vec3 offset) {
  if (uGroundCloudsMapped > 0.5) return coverage;
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

vec2 mappedCloudField(float coverage, vec3 offset, float share, float blurMetres, float shareBlur, int octaves) {
  bool sculptFinely = octaves > CLOUD_COARSE_CELL_OCTAVES;
  float base = 1.0 - smoothstep(0.0, CLOUD_MAPPED_BASE_SHARE + min(shareBlur, CLOUD_MAPPED_BASE_SHARE), share);
  float needed = mix(CLOUD_THINNEST_COVER, CLOUD_TALLEST_COVER, pow(share, CLOUD_TOWER_STEEPNESS)) + CLOUD_BASE_CLOSING * base;
  float softness = mix(CLOUD_MAPPED_BLURRED_SOFTNESS, sculptFinely ? CLOUD_MAPPED_SOFTNESS : CLOUD_MAPPED_COARSE_SOFTNESS, octaveFade(ANCHOR_METRES / float(2 << 4), blurMetres)) + shareBlur;
  float low = needed - 0.5 * softness;
  float high = needed + 0.5 * softness;
  float carving = smoothstep(0.0, 0.25, coverage);
  float thickness = mix(CLOUD_MAPPED_THIN_DENSITY, 1.0, coverage);
  float tallest = coverage + carving * (CLOUD_MAPPED_CELL_SWING + CLOUD_BILLOW_SWING);
  if (coverage < CLOUD_LEAST_COVERAGE || tallest < low) return vec2(0.0, max(low - tallest, 0.0));
  float sculpted = coverage + CLOUD_MAPPED_CELL_SWING * carving * (cloudCells(offset, blurMetres, min(octaves, CLOUD_COARSE_CELL_OCTAVES)) - 0.5);
  if (sculptFinely) {
    float weight = CLOUD_BILLOW_SWING * carving;
    float left = weight / (1.0 - CLOUD_BILLOW_FALLOFF);
    for (int k = 0; k < CLOUD_BILLOW_COUNT; k++) {
      if (sculpted + left * CLOUD_BILLOW_PEAK < low) return vec2(0.0, low - sculpted - left * CLOUD_BILLOW_PEAK);
      if (sculpted - left * CLOUD_BILLOW_MEAN > high) return vec2(thickness, 0.0);
      int octave = CLOUD_BILLOW_COARSEST + k;
      float cell = ANCHOR_METRES / float(2 << octave);
      float shown = octaveFade(cell, blurMetres);
      if (shown <= 0.0) break;
      float billow = abs(2.0 * groundDetail(octave, offset, cell, 960 + k).w - 1.0);
      sculpted += weight * shown * (billow - CLOUD_BILLOW_MEAN);
      left -= weight;
      weight *= CLOUD_BILLOW_FALLOFF;
    }
  }
  return vec2(thickness * smoothstep(low, high, sculpted), max(low - sculpted, 0.0));
}

vec2 cloudFieldFor(float coverage, vec3 offset, float share, float blurMetres, float shareBlur, int octaves) {
  if (uGroundCloudsMapped > 0.5) return mappedCloudField(coverage, offset, share, blurMetres, shareBlur, octaves);
  float threshold = mix(CLOUD_SPARSEST_CELL, CLOUD_DENSEST_CELL, coverage);
  float coarsestCell = ANCHOR_METRES / float(2 << 3);
  float softness = mix(CLOUD_BLURRED_SOFTNESS, CLOUD_EDGE_SOFTNESS, octaveFade(coarsestCell, blurMetres));
  return vec2(smoothstep(threshold - 0.5 * softness, threshold + 0.5 * softness, cloudCells(offset, blurMetres, octaves) - cloudHeightErosion(share)), 0.0);
}

float cloudDensityFor(float coverage, vec3 offset, float share, float blurMetres, float shareBlur, int octaves) {
  return cloudFieldFor(coverage, offset, share, blurMetres, shareBlur, octaves).x;
}

float cloudShare(vec3 fromCamera) {
  return (length(uGroundCamera + fromCamera) - uGroundRadius - uGroundClouds.x) / (uGroundClouds.y - uGroundClouds.x);
}

float finestCloudStepKm(float t) {
  return max(CLOUD_FINEST_STEP_KM, CLOUD_FINEST_STEP_SHARE * t);
}

float cloudDensity(float coverage, vec3 fromCamera, float blurMetres, float shareBlur, int octaves) {
  float share = cloudShare(fromCamera);
  if (share < 0.0 || share > 1.0) return 0.0;
  return cloudDensityFor(coverage, uGroundFromAnchor + fromCamera * 1000.0, share, blurMetres, shareBlur, octaves);
}

float cloudDensityForLight(float coverage, vec3 fromCamera, float blurMetres, float shareBlur, int octaves) {
  bool mapped = uGroundCloudsMapped > 0.5;
  float share = cloudShare(fromCamera);
  if (mapped) share = max(share, 2.0 * CLOUD_MAPPED_BASE_SHARE);
  if (share > 1.0 || share < 0.0) return 0.0;
  return cloudDensityFor(coverage, uGroundFromAnchor + fromCamera * 1000.0, share, blurMetres, shareBlur, octaves);
}

uniform float uCloudFrame;

vec3 softShoulder(vec3 light) {
  vec3 over = max(light - CLOUD_SHOULDER, 0.0) / (1.0 - CLOUD_SHOULDER);
  return min(light, CLOUD_SHOULDER) + (1.0 - CLOUD_SHOULDER) * (1.0 - exp(-over));
}

vec4 cloudVolumeFrom(vec3 ray, vec3 sun, float nearestSolidKm, out float depthKm) {
  depthKm = -1.0;
  if (!cloudsHere()) return vec4(0.0);
  vec2 span = cloudSlabSpan(ray);
  float enter = max(span.x, 0.0);
  float leave = min(min(span.y, nearestSolidKm), enter + CLOUD_LONGEST_MARCH_KM);
  if (span.y <= 0.0 || leave <= enter) return vec4(0.0);
  depthKm = 0.5 * (enter + leave);
  ivec2 pixel = ivec2(gl_FragCoord.xy) & 1;
  float jitter = fract((float(CLOUD_JITTER_ORDER[pixel.x + 2 * pixel.y]) + 0.5) / 4.0 + uCloudFrame * CLOUD_GOLDEN_STEP);
  float coverageIn = cloudCoverageAt(normalize(uGroundCamera + ray * enter), 0.0);
  float coverageOut = cloudCoverageAt(normalize(uGroundCamera + ray * leave), 0.0);
  if (uGroundCloudsMapped < 0.5 && max(coverageIn, coverageOut) < CLOUD_LEAST_COVERAGE) return vec4(0.0);
  float depthWeight = 0.0;
  float weightedDepth = 0.0;
  float phase = 1.0 + CLOUD_FORWARD_GLOW * pow(max(dot(ray, sun), 0.0), 6.0);
  float densityToClouds = uGroundAir.w > 0.0 ? airDensityAlong(ray, enter) : 0.0;
  vec3 skyBehind = skyThrough(densityToClouds, ray, sun, normalize(uGroundCamera));
  float hazePerKm = densityToClouds / uGroundGlow.w * (1.0 - hazeSeenFromAbove());
  float clear = 1.0;
  vec3 light = vec3(0.0);
  bool mapped = uGroundCloudsMapped > 0.5;
  float sunProbeKm = mapped ? CLOUD_MAPPED_SUN_PROBE_KM : CLOUD_SUN_PROBE_SHARE * (uGroundClouds.y - uGroundClouds.x);
  int steps = mapped ? CLOUD_STEPS : THIN_CLOUD_STEPS;
  vec3 upBetween = normalize(uGroundCamera + ray * mix(enter, leave, 0.25));
  vec3 airSunlight = sunlightThroughAir(sun, upBetween) * uSunVisible;
  float sunHeight = dot(sun, upBetween);
  float edgeGain = mapped ? CLOUD_EDGE_GAIN : 1.0;
  float outsideKm = enter;
  vec3 scattered = vec3(0.0);
  float nextKm = enter + jitter * finestCloudStepKm(enter);
  float growth = 1.0;
  for (int i = 0; i < steps && clear >= CLOUD_OPAQUE_CLEARNESS && (!mapped || nextKm < leave); i++) {
    float along = (float(i) + jitter) / float(steps);
    float t = mapped ? nextKm : mix(enter, leave, along * along);
    growth *= CLOUD_STEP_GROWTH;
    float finestKm = finestCloudStepKm(t);
    float stepKm = mapped
      ? growth * max(CLOUD_INSIDE_STEP_KM, CLOUD_INSIDE_STEP_SHARE * t)
      : (leave - enter) * 2.0 * max(along, 0.5 / float(steps)) / float(steps);
    float blurKm = mapped ? CLOUD_MAPPED_STEP_BLUR_SHARE * finestKm : CLOUD_STEP_BLUR_SHARE * stepKm;
    float blurMetres = max(uPixelAngle * t, blurKm) * 1000.0;
    float shareBlur = (mapped ? blurKm : stepKm) * abs(dot(ray, normalize(uGroundCamera + ray * t))) / (uGroundClouds.y - uGroundClouds.x);
    float mapCoverage = mapped ? cloudCoverageAt(normalize(uGroundCamera + ray * t), blurMetres) : mix(coverageIn, coverageOut, along * along);
    float coverage = cloudRegionalCoverage(mapCoverage, uGroundFromAnchor + ray * t * 1000.0);
    float heightShare = cloudShare(ray * t);
    vec2 field = mapped || (heightShare >= 0.0 && heightShare <= 1.0) ? cloudFieldFor(coverage, uGroundFromAnchor + ray * t * 1000.0, mapped ? clamp(heightShare, 0.0, 1.0) : heightShare, blurMetres, shareBlur, CLOUD_ALL_CELL_OCTAVES) : vec2(0.0);
    float density = field.x;
    if (mapped) {
      float clearKm = clamp(field.y / CLOUD_FIELD_SLOPE_PER_KM, finestKm, max(CLOUD_CLEAR_STEP_KM, CLOUD_CLEAR_STEP_SHARE * t));
      nextKm = t + (density > 0.0 ? stepKm : growth * clearKm);
      if (density <= 0.0) outsideKm = t;
    }
    if (density > 0.0) {
      if (mapped && outsideKm >= 0.0) {
        float insideKm = t;
        for (int k = 0; k < CLOUD_SURFACE_HALVINGS; k++) {
          float between = 0.5 * (outsideKm + insideKm);
          float found = cloudDensity(coverage, ray * between, blurMetres, shareBlur, CLOUD_ALL_CELL_OCTAVES);
          if (found > 0.0) {
            insideKm = between;
            density = max(density, found);
          } else outsideKm = between;
        }
        t = insideKm;
        nextKm = t + stepKm;
      }
      outsideKm = -1.0;
      float opacity = 1.0 - exp(-uGroundClouds.z * edgeGain * density * stepKm);
      if (sunHeight > CLOUDS_DARK_BELOW && (!mapped || clear > CLOUD_RELIT_CLEARNESS)) {
        float above = cloudDensityForLight(coverage, ray * t + sun * sunProbeKm, blurMetres, shareBlur, CLOUD_COARSE_CELL_OCTAVES);
        float beside = mapped ? cloudDensityForLight(coverage, ray * t + sun * CLOUD_CREST_PROBE_KM, blurMetres, shareBlur + CLOUD_CREST_SOFTNESS, CLOUD_ALL_CELL_OCTAVES) : density;
        float depthTowardSun = uGroundClouds.z * sunProbeKm * 0.5 * (mix(beside, density, CLOUD_FACE_SHADE) + above);
        if (mapped) depthTowardSun += CLOUD_CREST_DEPTH * beside;
        float higher = cloudDensityForLight(coverage, ray * t + sun * sunProbeKm * CLOUD_FAR_PROBE, blurMetres, shareBlur, CLOUD_FAR_CELL_OCTAVES);
        depthTowardSun += uGroundClouds.z * sunProbeKm * 0.5 * (CLOUD_FAR_PROBE - 1.0) * (above + higher);
        float sunThrough = phase * exp(-depthTowardSun) + CLOUD_SCATTERED_SHARE * exp(-CLOUD_SCATTERED_REACH * depthTowardSun);
        float daylight = smoothstep(-0.05, 0.05, sunHeight);
        vec3 sunlit = airSunlight * sunThrough * max(sunHeight, 0.0);
        vec3 skylit = cloudSkylight(sunHeight);
        float share = mapped ? min(cloudShare(ray * t) / CLOUD_MAPPED_LIT_FROM_SHARE, 1.0) : cloudShare(ray * t);
        scattered = CLOUD_LIT_ALBEDO * (sunlit * daylight + skylit * mix(CLOUD_DARK_BASE_SHARE, 1.0, share));
        scattered = softShoulder(scattered);
      }
      light += clear * opacity * mix(scattered, skyBehind, 1.0 - exp(-t * hazePerKm));
      depthWeight += clear * opacity;
      weightedDepth += clear * opacity * t;
      clear *= 1.0 - opacity;
    }
  }
  if (depthWeight > CLOUD_LEAST_COVERAGE) depthKm = weightedDepth / depthWeight;
  return vec4(light, 1.0 - clear);
}

vec4 daylitCloudsSeenFrom(vec3 ray, vec3 sun, float nearestSolidKm, out float depthKm) {
  float sheetShare = cloudSheetShare();
  depthKm = -1.0;
  vec4 volume = sheetShare < 1.0 ? cloudVolumeFrom(ray, sun, nearestSolidKm, depthKm) : vec4(0.0);
  volume.rgb *= uStarlight;
  if (uGroundCloudsMapped < 0.5) return volume;
  float sheetKm;
  vec4 sheet = sheetShare > 0.0 ? cloudSheetFrom(ray, sun, mix(uGroundClouds.x, uGroundClouds.y, CLOUD_SHEET_HEIGHT_SHARE), nearestSolidKm, false, sheetKm) : vec4(0.0);
  vec4 high = vec4(0.0);
  float highKm = -1.0;
  if (sheetShare < 1.0) {
    high = cloudSheetFrom(ray, sun, CLOUD_HIGH_KM, nearestSolidKm, true, highKm);
    high.rgb *= uStarlight;
  }
  bool highInFront = cameraAltitudeKm() > CLOUD_HIGH_KM;
  float haze = 1.0 - exp(-max(highKm, 0.0) * airDensityHere() / uGroundGlow.w * 0.5);
  high.rgb = mix(high.rgb, groundSky(ray, sun, normalize(uGroundCamera)) * uStarlight * high.a, highInFront ? 0.0 : haze);
  vec4 front = highInFront ? high : volume;
  vec4 back = highInFront ? volume : high;
  vec4 layered = front + back * (1.0 - front.a);
  if (depthKm <= 0.0) depthKm = sheetShare > 0.5 ? sheetKm : highKm;
  return mix(layered, vec4(sheet.rgb * uStarlight, sheet.a), sheetShare);
}

vec4 cloudsSeenFrom(vec3 ray, vec3 sun, float nearestSolidKm, out float depthKm) {
  useClouds(uGround, sun);
  vec4 clouds = daylitCloudsSeenFrom(ray, sun, nearestSolidKm, depthKm);
  if (uGround != uLitBody || clouds.a <= 0.0 || depthKm <= 0.0) return clouds;
  vec3 up = normalize(uGroundCamera + ray * depthKm);
  if (dot(up, sun) >= CITY_LIGHTS_DUSK) return clouds;
  clouds.rgb += clouds.a * cityGlowOnClouds(uGround, groundUv(up), 0.0, dot(up, sun));
  return clouds;
}

float sunThroughClouds(vec3 up, vec3 sun, vec3 offset, float footprint) {
  if (!cloudsHere()) return 1.0;
  float sheetShare = cloudSheetShare();
  useClouds(uGround, sun);
  if (sheetShare >= 1.0) return cloudSheetShadow(inCloudFrame(up), cloudsSunNow, 0.0);
  float sunHeight = max(dot(sun, up), 0.05);
  float cloudyShare = uGroundCloudsMapped > 0.5 ? CLOUD_MAPPED_LIT_FROM_SHARE : 1.0;
  float towardSunKm = mix(uGroundClouds.x, uGroundClouds.y, 0.5 * cloudyShare) / sunHeight;
  float coverage = cloudRegionalCoverage(cloudCoverageAt(normalize(up * uGroundRadius + sun * towardSunKm), max(footprint, CLOUD_SHADOW_BLUR_METRES)), offset + sun * towardSunKm * 1000.0);
  if (coverage < CLOUD_LEAST_COVERAGE && sheetShare <= 0.0) return 1.0;
  float thicknessKm = cloudyShare * (uGroundClouds.y - uGroundClouds.x);
  float density = 0.0;
  int samples = uGroundCloudsMapped > 0.5 ? CLOUD_SHADOW_SAMPLES : THIN_CLOUD_SHADOW_SAMPLES;
  for (int i = 0; i < samples; i++) {
    float share = (float(i) + 0.5) / float(samples);
    float alongKm = (uGroundClouds.x + share * thicknessKm) / sunHeight;
    density += cloudDensityFor(coverage, offset + sun * alongKm * 1000.0, share * cloudyShare, max(footprint, CLOUD_SHADOW_BLUR_METRES), 0.0, CLOUD_COARSE_CELL_OCTAVES);
  }
  float through = exp(-uGroundClouds.z * density / float(samples) * thicknessKm / sunHeight);
  return sheetShare > 0.0 ? mix(through, cloudSheetShadow(inCloudFrame(up), cloudsSunNow, 0.0), sheetShare) : through;
}

const float HOT_PLANET_KELVIN = 850.0;
const float COOLEST_GLOW_KELVIN = 500.0;
const int MOTTLE_OCTAVES[3] = int[3](0, 2, 4);
const float MOTTLE_WEIGHTS[3] = float[3](0.6, 0.5, 0.45);
const int LAVA_VEIN_OCTAVES[3] = int[3](3, 6, 9);
const float LAVA_VEIN_HEAT[3] = float[3](1.0, 0.85, 0.6);
const float LAVA_VEIN_WIDTH = 0.06;
const float LAVA_VEIN_SEEN_SHARE = 0.15;
const float LAVA_CRUST_KELVIN_SHARE = 0.78;
const float LAVA_VEIN_KELVIN_SHARE = 1.4;

float inventedMottle(vec3 offset, float footprint) {
  float total = 0.0;
  for (int k = 0; k < 3; k++) {
    int octave = MOTTLE_OCTAVES[k];
    float cell = ANCHOR_METRES / float(2 << octave);
    total += MOTTLE_WEIGHTS[k] * octaveFade(cell, footprint) * (groundDetail(octave, offset, cell, 910 + k).w - 0.5);
  }
  return total;
}

float lavaKelvin(float kelvin, vec3 offset, float footprint) {
  float veins = 0.0;
  float shown = 0.0;
  for (int k = 0; k < 3; k++) {
    int octave = LAVA_VEIN_OCTAVES[k];
    float cell = ANCHOR_METRES / float(2 << octave);
    float fade = octaveFade(cell * LAVA_VEIN_SEEN_SHARE, footprint);
    shown = max(shown, fade);
    veins = max(veins, fade * LAVA_VEIN_HEAT[k] * (1.0 - smoothstep(0.0, LAVA_VEIN_WIDTH, abs(groundDetail(octave, offset, cell, 920 + k).w - 0.5))));
  }
  float molten = smoothstep(MELTING_KELVIN - 150.0, MELTING_KELVIN + 350.0, kelvin);
  return kelvin * mix(1.0, mix(LAVA_CRUST_KELVIN_SHARE, LAVA_VEIN_KELVIN_SHARE, veins), shown * molten);
}

vec4 surfaceTint = vec4(1.0, 1.0, 1.0, 0.0);
vec3 freshWater = vec3(-1.0);
bool groundGlowHidden = false;
float riverLevel = 0.0;
const float RIVER_MEETS_SEA_METRES = 8.0;

vec3 shadeGround(vec3 up, vec3 offset, vec3 normal, bool water, float t, float footprint, vec3 ray, vec3 sun, vec3 upHere, float sunVisible) {
  bool invented = groundInvented();
  vec2 uv = groundUv(up);
  vec4 painted = invented ? inventedPaint(uv, footprint / (1000.0 * uGroundRadius)) : textureLod(uBodyColour, vec3(uv, groundLayer()), 0.0);
  vec3 albedo = invented || water ? painted.rgb : sharpEdged(painted.rgb, uv, groundLayer(), up, footprint / (1000.0 * uGroundRadius));
  if (invented) albedo *= 1.0 + inventedMottle(offset, footprint);
  vec3 seaAlbedo = invented ? INVENTED_OCEAN : OCEAN_ALBEDO;
  if (freshWater.x >= 0.0) seaAlbedo = mix(seaAlbedo, freshWater, smoothstep(0.0, RIVER_MEETS_SEA_METRES, riverLevel));
  float fineCell = ANCHOR_METRES / float(2 << 12);
  float coarseCell = ANCHOR_METRES / float(2 << 7);
  float grain = octaveFade(fineCell, footprint) * (groundDetail(12, offset, fineCell, 900).w - 0.5)
    + octaveFade(coarseCell, footprint) * (groundDetail(7, offset, coarseCell, 901).w - 0.5);
  albedo *= 1.0 + GROUND_GRAIN * grain;
  albedo = mix(albedo, vec3(dot(albedo, vec3(0.3, 0.5, 0.2))), surfaceTint.a) * surfaceTint.rgb;
  vec3 sunlight = sunlightThroughAir(sun, up) * uSunVisible;
  float sunHeight = dot(sun, up);
  float shadow = sunHeight > -0.05 ? sunVisible * (1.0 - uGroundOvercast) * sunThroughClouds(up, sun, offset, footprint) : 0.0;
  float skyDome = 0.5 + 0.5 * dot(normal, up);
  vec3 ambient = uGroundAir.w > 0.0 ? uGroundAir.rgb * (CLEAR_SKY_LIGHT + OVERCAST_SKY_LIGHT * uGroundOvercast * skyDome) * smoothstep(-0.15, 0.1, sunHeight) * skylightLeft() : vec3(0.0);
  vec3 lit;
  if (water) {
    vec3 halfway = normalize(sun - ray);
    float facing = clamp(dot(-ray, normal), 0.0, 1.0);
    float fresnel = WATER_FRESNEL_HEAD_ON + (1.0 - WATER_FRESNEL_HEAD_ON) * pow(1.0 - facing, 5.0);
    vec3 skyInWater = groundSky(normalize(reflect(ray, normal) + normal * 0.02), sun, up);
    lit = seaAlbedo * (max(sunHeight, 0.0) * sunlight * shadow + ambient) * (1.0 - fresnel) + skyInWater * fresnel + sunlight * shadow * OCEAN_GLINT * pow(max(dot(normal, halfway), 0.0), OCEAN_SHININESS);
  } else {
    lit = albedo * (max(dot(normal, sun), 0.0) * sunlight * shadow + ambient);
  }
  if (!water) lit += cityLights(uGround, uv, footprint / (1000.0 * uGroundRadius), dot(-ray, up), sunHeight);
  if (uGroundAir.w > 0.0) {
    float density = airDensityAlong(ray, t);
    float haze = (1.0 - exp(-t * density / uGroundGlow.w)) * (1.0 - hazeSeenFromAbove());
    lit = mix(lit, skyThrough(density, normalize(ray + upHere * 0.02), sun, upHere), haze);
  }
  lit *= uStarlight;
  float groundKelvin = painted.a * HOTTEST_GROUND_KELVIN;
  if (groundGlowHidden || !invented || uBodyMap[uGround].z <= HOT_PLANET_KELVIN || groundKelvin <= COOLEST_GLOW_KELVIN) return lit;
  vec3 glow = thermalGlow(uGround, lavaKelvin(groundKelvin, offset, footprint));
  return (lit + glow) / max(1.0, glow.r);
}

vec4 skyOverGround(vec3 direction) {
  vec3 ray = groundLocal(direction);
  vec3 sun = groundLocal(uBodySun[uGround].xyz);
  vec3 sky = groundSky(ray, sun, normalize(uGroundCamera)) * uStarlight;
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

export const NEAREST_SEEN_METRES = 0.05;
export const FARTHEST_SEEN_METRES = 1e8;

const DETAIL_PLACING = `
layout(location = 5) in vec4 aPlaced;
layout(location = 6) in float aSeed;
uniform vec4 uDetailShape;
uniform vec3 uDetailUp;
uniform float uPixelAngle;
const float ROCK_LIFT = 0.2;
const float BLADE_HALF_WIDTH_METRES = 0.0045;
const float BLADE_SEEN_PIXELS = 0.6;
const float TUFT_SPREAD = 0.9;

float detailRandom(float which) {
  return fract(aSeed * (89.0 + 137.0 * which));
}

mat3 tumbled() {
  vec4 q = normalize(vec4(detailRandom(1.0), detailRandom(2.0), detailRandom(3.0), detailRandom(4.0)) - 0.5);
  vec3 doubled = 2.0 * q.xyz;
  vec3 squares = q.xyz * doubled;
  vec3 turns = q.w * doubled;
  float xy = q.x * doubled.y;
  float xz = q.x * doubled.z;
  float yz = q.y * doubled.z;
  return mat3(1.0 - squares.y - squares.z, xy + turns.z, xz - turns.y, xy - turns.z, 1.0 - squares.x - squares.z, yz + turns.x, xz + turns.y, yz - turns.x, 1.0 - squares.x - squares.y);
}

vec3 placeDetail(vec3 tileFromCamera, inout vec3 normal, out float climb) {
  float away = length(tileFromCamera + aPlaced.xyz);
  float shown = smoothstep(uDetailShape.y, 0.75 * uDetailShape.y, away) * smoothstep(0.7, 1.3, away / max(aPlaced.w, 1e-3));
  vec3 east = normalize(abs(uDetailUp.z) < 0.9 ? vec3(-uDetailUp.y, uDetailUp.x, 0.0) : vec3(0.0, -uDetailUp.z, uDetailUp.y));
  mat3 upright = mat3(east, cross(uDetailUp, east), uDetailUp);
  float turn = 6.2831853 * detailRandom(5.0);
  mat2 turned = mat2(cos(turn), sin(turn), -sin(turn), cos(turn));
  if (uDetailShape.x > 1.5) {
    climb = normal.z;
    float halfWidth = max(BLADE_HALF_WIDTH_METRES, BLADE_SEEN_PIXELS * away * uPixelAngle);
    vec3 blade = vec3(turned * (aPosition.xy * TUFT_SPREAD * aPlaced.w + normal.xy * halfWidth), aPosition.z * aPlaced.w * shown);
    normal = normalize(upright * vec3(0.35 * (turned * vec2(-normal.y, normal.x)), 1.0));
    return aPlaced.xyz + upright * blade;
  }
  shown *= smoothstep(${SMALLEST_ROCK_PIXELS}.0, ${2 * SMALLEST_ROCK_PIXELS}.0, aPlaced.w / (away * uPixelAngle));
  vec3 stretch = vec3(1.0, 0.7 + 0.3 * detailRandom(6.0), uDetailShape.z * (0.7 + 0.5 * detailRandom(8.0)));
  mat3 tumble = tumbled();
  vec3 shape = tumble * aPosition * stretch;
  vec3 facing = tumble * normal / stretch;
  climb = smoothstep(-0.35, 0.3, shape.z / stretch.z + ROCK_LIFT);
  shape.z += ROCK_LIFT * stretch.z;
  shape.xy = turned * shape.xy;
  facing.xy = turned * facing.xy;
  normal = normalize(upright * facing);
  return aPlaced.xyz + upright * shape * (0.5 * aPlaced.w * shown);
}`;

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
uniform vec4 uDetailTint;
${DETAIL_PLACING}
const float ROCK_GRAIN_CELLS = 2.5;
out vec4 vDetail;
out vec4 vTint;
out vec2 vUv;
out vec3 vFromCamera;
out vec3 vNormal;
out vec3 vUpward;
out float vWet;
void main() {
  float detail = uMorph.x <= 0.0 ? 1.0 : clamp((uMorph.x - length(uPatchFromCamera + aPosition)) / max(uMorph.x - uMorph.y, 1e-3), 0.0, 1.0) * uMorph.z;
  vec3 position = aPosition + aTowardParent * (1.0 - detail);
  vec3 normal = mix(aParentNormal, aNormal, detail);
  vWet = aWet;
  vDetail = vec4(0.0);
  vTint = vec4(1.0, 1.0, 1.0, 0.0);
  if (uDetailShape.x > 0.5) {
    float climb;
    normal = aNormal;
    position = placeDetail(uPatchFromCamera, normal, climb);
    vWet = 0.0;
    vDetail = vec4(aPosition * ROCK_GRAIN_CELLS + 64.0 * aSeed, uDetailShape.x);
    vTint = vec4(uDetailTint.rgb * (0.75 + 0.5 * detailRandom(7.0)) * mix(0.6, 1.0, climb), uDetailTint.a);
  }
  vec3 fromCamera = uPatchFromCamera + position;
  vec3 seen = vec3(dot(fromCamera, uLocalRight), dot(fromCamera, uLocalUp), dot(fromCamera, uLocalForward));
  vUv = vec2(0.0);
  vFromCamera = fromCamera;
  vNormal = normal;
  vUpward = uPatchCentreKm + position / 1000.0;
  float depth = log2(max(seen.z, ${NEAREST_SEEN_METRES} * 0.5) / ${NEAREST_SEEN_METRES}) / log2(${FARTHEST_SEEN_METRES.toFixed(1)} / ${NEAREST_SEEN_METRES});
  gl_Position = vec4(seen.x / uTanHalf.x, seen.y / uTanHalf.y, (2.0 * depth - 1.0) * seen.z, seen.z);
}`;

export const SHADOW_CASCADES = 2;
export const ROCK_SHADOW_LAYER = SHADOW_CASCADES;

export const SHADOW_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
uniform vec3 uPatchFromCamera;
${DETAIL_PLACING}
uniform vec3 uShadowRight;
uniform vec3 uShadowUp;
uniform vec3 uShadowSun;
uniform vec4 uShadowCascade;
void main() {
  vec3 normal = aNormal;
  float climb;
  vec3 p = uPatchFromCamera + (uDetailShape.x > 0.5 ? placeDetail(uPatchFromCamera, normal, climb) : aPosition);
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

export const INVENTED_GROUND_FRAGMENT = `#version 300 es
${EYE_SHARED}
uniform vec3 uInventedTint;
uniform vec3 uInventedSun;
uniform vec4 uInventedPlanet;
uniform vec3 uInventedShape;
uniform float uInventedFootprint;
void main() {
  float longitude = (vUv.x - 0.5) * 6.2831853;
  float latitude = (0.5 - vUv.y) * 3.1415927;
  vec3 local = vec3(cos(latitude) * cos(longitude), cos(latitude) * sin(longitude), sin(latitude));
  bool wet = uInventedPlanet.w > 0.5;
  Invented made = inventSurface(local, uInventedSun, uInventedTint, uInventedPlanet.x, uInventedPlanet.y, uInventedPlanet.z, wet, uInventedFootprint, true);
  if (uInventedShape.x > 0.5) {
    outColour = vec4((made.heightKm - uInventedShape.y) / uInventedShape.z, made.solid, pow(clamp(made.settled, 0.0, 1.0), CITY_LIGHT_LIFT), 0.5 * made.runny + 0.5 * made.growing);
    return;
  }
  bool hot = uInventedPlanet.y > HOT_PLANET_KELVIN;
  outColour = vec4(sqrt(max(wet ? made.dryAlbedo : made.albedo, 0.0)), hot ? made.kelvin / HOTTEST_GROUND_KELVIN : 1.0);
}`;

export const CLOUD_NEARBY_FRAGMENT = `#version 300 es
${EYE_SHARED}
void main() {
  vec2 place = vUv * 2.0 - 1.0;
  float outward = length(place);
  float distanceKm = CLOUD_NEARBY_FINE_KM * sinh(outward * CLOUD_NEARBY_WARP);
  vec2 across = place / max(outward, 1e-6) * distanceKm / uGroundRadius;
  vec3 up = uCloudNearbyUp * sqrt(max(1.0 - dot(across, across), 0.0)) + uCloudNearbyEast * across.x + cross(uCloudNearbyUp, uCloudNearbyEast) * across.y;
  float footprint = cloudNearbyTexelKm(distanceKm) / uGroundRadius;
  useClouds(uGround, groundLocal(uBodySun[uGround].xyz));
  outColour = vec4(cloudSheet(normalize(up), footprint, false), 0.0, 1.0);
}`;

const SUN_ON_GROUND = `
in vec3 vFromCamera;
in vec3 vNormal;
in vec3 vUpward;
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
}`;

export const PATCH_FRAGMENT = `#version 300 es
${EYE_SHARED}
${SUN_ON_GROUND}
in float vWet;
in vec4 vDetail;
in vec4 vTint;
uniform vec4 uRockShadow;
uniform float uPatchSpacing;

const float ROCK_SHADOW_FADES_FROM = 0.8;
const float ROCK_SHADOW_NORMAL_OFFSET_TEXELS = 0.75;
const float ROCK_GRAIN = 0.16;

float sunPastRocks(vec3 fromCamera, vec3 normal) {
  if (uShadowsOn < 0.5 || uRockShadow.z <= 0.0) return 1.0;
  float texel = 2.0 * uRockShadow.z / SHADOW_MAP_SIZE;
  vec3 p = fromCamera + normal * texel * ROCK_SHADOW_NORMAL_OFFSET_TEXELS;
  vec2 across = (vec2(dot(p, uShadowRight), dot(p, uShadowUp)) - uRockShadow.xy) / uRockShadow.z;
  float outward = max(abs(across.x), abs(across.y));
  if (outward > SHADOW_MAP_EDGE) return 1.0;
  float depth = 0.5 - 0.5 * dot(p, uShadowSun) / uRockShadow.w - texel * SHADOW_DEPTH_BIAS_TEXELS / (2.0 * uRockShadow.w);
  float lit = 0.0;
  for (int tap = 0; tap < 4; tap++) lit += texture(uShadowMaps, vec4(across * 0.5 + 0.5 + (vec2(tap & 1, tap >> 1) - 0.5) / SHADOW_MAP_SIZE, float(${ROCK_SHADOW_LAYER}), depth));
  return mix(lit * 0.25, 1.0, smoothstep(ROCK_SHADOW_FADES_FROM, SHADOW_MAP_EDGE, outward));
}

vec3 rockSlope(vec3 place) {
  vec3 coarse = textureLod(uGroundDetail, place / ${GROUND_DETAIL_PERIOD_CELLS}.0, 0.0).rgb * 2.0 - 1.0;
  vec3 fine = textureLod(uGroundDetail, place * 3.7 / ${GROUND_DETAIL_PERIOD_CELLS}.0, 0.0).rgb * 2.0 - 1.0;
  return (coarse + fine) * ${GROUND_DETAIL_SLOPE_RANGE.toFixed(1)};
}

void main() {
  float distance = length(vFromCamera);
  vec3 ray = vFromCamera / distance;
  vec3 sun = groundLocal(uBodySun[uGround].xyz);
  vec3 up = normalize(vUpward);
  bool water = vWet > 0.5;
  float footprint = max(distance * uPixelAngle, ${NEAREST_SEEN_METRES});
  bool rock = abs(vDetail.w - 1.0) < 0.5;
  surfaceTint = vTint;
  vec3 slope = rock ? ROCK_GRAIN * rockSlope(vDetail.xyz) : water || vDetail.w > 1.5 ? vec3(0.0) : slopeFinerThanMesh(uGroundFromAnchor + vFromCamera, footprint, uPatchSpacing);
  vec3 normal = water ? up : normalize(normalize(vNormal) - (slope - up * dot(slope, up)));
  float sunVisible = sunVisibleAt(vFromCamera, normalize(vNormal)) * sunPastRocks(vFromCamera, normalize(vNormal));
  vec3 lit = shadeGround(up, uGroundFromAnchor + vFromCamera, normal, water, distance / 1000.0, footprint, ray, sun, normalize(uGroundCamera), sunVisible);
  outColour = vec4(lit, GROUND_HIT + distance / 1000.0);
}`;

export const RIVER_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aDownstream;
layout(location = 2) in float aSide;
layout(location = 3) in vec3 aAlongHalfWidthLevel;
uniform vec3 uPatchFromCamera;
uniform vec3 uPatchCentreKm;
uniform vec3 uLocalRight;
uniform vec3 uLocalUp;
uniform vec3 uLocalForward;
uniform vec2 uTanHalf;
uniform float uPixelAngle;
const float EDGE_PIXELS = 1.0;
out vec2 vUv;
out vec3 vFromCamera;
out vec3 vNormal;
out vec3 vUpward;
out vec4 vFlow;
out float vPixel;
void main() {
  vUv = vec2(0.0);
  vPixel = uPixelAngle * length(uPatchFromCamera + aPosition);
  float halfWidth = aAlongHalfWidthLevel.y;
  float across = aSide * (halfWidth + EDGE_PIXELS * vPixel);
  vec3 position = aPosition + normalize(cross(uPatchCentreKm * 1000.0 + aPosition, aDownstream)) * across;
  vFromCamera = uPatchFromCamera + position;
  vNormal = aDownstream;
  vUpward = uPatchCentreKm + position / 1000.0;
  vFlow = vec4(aAlongHalfWidthLevel.x, across, halfWidth, aAlongHalfWidthLevel.z);
  gl_Position = vec4(dot(vFromCamera, uLocalRight) / uTanHalf.x, dot(vFromCamera, uLocalUp) / uTanHalf.y, 0.0, dot(vFromCamera, uLocalForward));
}`;

export const RIVER_FRAGMENT = `#version 300 es
${EYE_SHARED}
${SUN_ON_GROUND}
in vec4 vFlow;
in float vPixel;
uniform float uMolten;
uniform float uRiverSeconds;

const vec3 RIVER_ALBEDO = vec3(0.035, 0.05, 0.04);
const float RIPPLE_CELLS[3] = float[3](12.8, 3.2, 0.8);
const float RIPPLE_SPEEDS[3] = float[3](1.6, 1.6, 0.8);
const float DRAWN_NEARER = 0.997;
const float RIPPLE_STEEPNESS = 0.035;
const float RIPPLE_CHANGE_PER_SECOND = 0.25;
const float ACROSS_TILT = 0.37;
const float FOAM_CELL = 25.6;
const float NARROWEST_SHARP_EDGED_PIXELS = 6.0;
const float FOAM_STRETCH = 8.0;
const float FLOWING_CRUST_KELVIN_SHARE = 0.62;
const float LEAST_FLOWING_LAVA_KELVIN = 1450.0;
const float LAVA_MEAN_HEAT = 0.7;
const float LAVA_SPEED = 0.8;

vec4 flowing(float cell, float speed, float stretch, float change) {
  vec3 place = vec3((vFlow.x - speed * uRiverSeconds) / cell, vFlow.y * stretch / cell, change * uRiverSeconds + vFlow.y * ACROSS_TILT / cell);
  return textureLod(uGroundDetail, place / ${GROUND_DETAIL_PERIOD_CELLS}.0, 0.0);
}

void main() {
  float distance = length(vFromCamera);
  vec3 ray = vFromCamera / distance;
  vec3 sun = groundLocal(uBodySun[uGround].xyz);
  vec3 up = normalize(vUpward);
  vec3 upHere = normalize(uGroundCamera);
  vec3 offset = uGroundFromAnchor + vFromCamera;
  float km = distance / 1000.0;
  float footprint = max(distance * uPixelAngle, ${NEAREST_SEEN_METRES});
  float pixelsFromEdge = (vFlow.z - abs(vFlow.y)) / vPixel;
  bool sharpEdged = vFlow.z > NARROWEST_SHARP_EDGED_PIXELS * vPixel;
  if (sharpEdged && pixelsFromEdge < 0.0) discard;
  float sunVisible = sunVisibleAt(vFromCamera, up);
  vec3 colour;
  if (uMolten > 0.5) {
    float plates = flowing(25.6, LAVA_SPEED, 2.0, 0.0).w;
    float fine = flowing(6.4, LAVA_SPEED, 2.0, 0.0).w;
    float inwards = clamp(1.0 - abs(vFlow.y) / vFlow.z, 0.0, 1.0);
    float crust = smoothstep(0.46, 0.56, 0.6 * plates + 0.4 * fine + 0.15 - 0.22 * smoothstep(0.0, 0.5, inwards));
    float heat = mix(0.35 + 0.9 * fine, 0.3 * fine - 0.1, crust);
    heat = mix(LAVA_MEAN_HEAT * (0.4 + 0.6 * smoothstep(0.0, 0.4, inwards)), heat, octaveFade(6.4, footprint));
    surfaceTint = vec4(vec3(0.35), 0.8);
    groundGlowHidden = true;
    vec3 lit = shadeGround(up, offset, up, false, km, footprint, ray, sun, upHere, sunVisible);
    float groundKelvin = inventedPaint(groundUv(up), footprint / (1000.0 * uGroundRadius)).a * HOTTEST_GROUND_KELVIN;
    float hottest = max(LEAST_FLOWING_LAVA_KELVIN, groundKelvin * LAVA_VEIN_KELVIN_SHARE);
    vec3 glow = thermalGlow(uGround, hottest * mix(FLOWING_CRUST_KELVIN_SHARE, 1.0, clamp(heat, 0.0, 1.0)));
    colour = (lit + glow) / max(1.0, glow.r);
  } else {
    vec3 downstream = normalize(vNormal - up * dot(vNormal, up));
    vec4 gusts = flowing(FOAM_CELL, 1.6, 1.0, 0.125);
    vec2 slope = vec2(0.0);
    for (int k = 0; k < 3; k++) slope += octaveFade(RIPPLE_CELLS[k], footprint) * 2.0 * gusts[k + 1] * (flowing(RIPPLE_CELLS[k], RIPPLE_SPEEDS[k], 1.0, RIPPLE_CHANGE_PER_SECOND).xy * 2.0 - 1.0) * ${GROUND_DETAIL_SLOPE_RANGE.toFixed(1)};
    vec3 normal = normalize(up - RIPPLE_STEEPNESS * (downstream * slope.x + cross(up, downstream) * slope.y));
    float streaks = flowing(FOAM_CELL, 1.6, FOAM_STRETCH, 0.0).w * flowing(6.4, 1.6, FOAM_STRETCH, 0.0).w;
    freshWater = RIVER_ALBEDO * (1.0 + 1.5 * octaveFade(FOAM_CELL / FOAM_STRETCH, footprint) * (streaks - 0.25));
    riverLevel = vFlow.w;
    colour = shadeGround(up, offset, normal, true, km, footprint, ray, sun, upHere, sunVisible);
  }
  if (!sharpEdged) {
    float covered = min(1.0, vFlow.z / vPixel) * smoothstep(-1.0, 0.5, pixelsFromEdge);
    surfaceTint = vec4(1.0, 1.0, 1.0, 0.0);
    groundGlowHidden = false;
    colour = mix(shadeGround(up, offset, up, false, km, footprint, ray, sun, upHere, sunVisible), colour, covered);
  }
  outColour = vec4(colour, GROUND_HIT + km);
  gl_FragDepth = log2(max(DRAWN_NEARER / gl_FragCoord.w, ${NEAREST_SEEN_METRES} * 0.5) / ${NEAREST_SEEN_METRES}) / log2(${FARTHEST_SEEN_METRES.toFixed(1)} / ${NEAREST_SEEN_METRES});
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
const float CLOUD_HISTORY_PARALLAX_PIXELS = 6.0;

vec2 previousUv(vec3 fromPrevious) {
  float ahead = dot(fromPrevious, uPreviousLocalForward);
  if (ahead <= 0.0) return vec2(-1.0);
  return vec2(dot(fromPrevious, uPreviousLocalRight) / (ahead * uPreviousTanHalf.x), dot(fromPrevious, uPreviousLocalUp) / (ahead * uPreviousTanHalf.y)) * 0.5 + 0.5;
}

void main() {
  vec3 ray = groundLocal(viewDirection());
  float depthKm;
  vec4 current = cloudsSeenFrom(ray, groundLocal(uBodySun[uGround].xyz), farthestGroundKm(), depthKm);
  outColour = current;
  outCloudDepth = vec4(depthKm, 0.0, 0.0, 1.0);
  if (uCloudHistoryOn < 0.5 || depthKm <= 0.0) return;
  vec3 fromPrevious = uGroundCamera + ray * depthKm - uPreviousGroundCamera;
  vec2 uv = previousUv(fromPrevious);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return;
  float expected = length(fromPrevious);
  float seenBefore = texture(uCloudHistoryDepth, uv).r;
  float movedKm = length(uGroundCamera - uPreviousGroundCamera);
  bool parallaxShows = seenBefore <= 0.0 || movedKm > CLOUD_HISTORY_PARALLAX_PIXELS * uPixelAngle * min(seenBefore, expected);
  if (parallaxShows && abs(seenBefore - expected) > CLOUD_HISTORY_DEPTH_TOLERANCE * expected) return;
  outColour = mix(current, texture(uCloudHistory, uv), CLOUD_HISTORY_WEIGHT);
}`;

export const EYE_FRAGMENT = `#version 300 es
${EYE_SHARED}
uniform sampler2D uGroundView;
uniform sampler2D uCloudView;
uniform float uCloudsOn;

float starVeil = 0.0;
float cloudSeen = 0.0;

vec4 groundSeen() {
  vec4 ground = texture(uGroundView, vUv);
  vec4 cloud = vec4(0.0);
  if (uCloudsOn > 0.5) {
    vec2 texel = 1.0 / vec2(textureSize(uCloudView, 0));
    for (int i = 0; i < 4; i++) cloud += 0.25 * texture(uCloudView, vUv + (vec2(i & 1, i >> 1) - 0.5) * texel);
  }
  cloudSeen = min(cloud.a, 1.0) * uGroundBlend;
  float solid = ground.a >= GROUND_HIT ? 1.0 : 0.0;
  starVeil = max(max(solid, cloud.a), min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN)) * uGroundBlend;
  return vec4(ground.rgb * (1.0 - cloud.a) + cloud.rgb, max(min(ground.a, 1.0), cloud.a)) * uGroundBlend;
}

const float SUN_GLARE_CORE = 0.6;
const float SUN_GLARE_CORE_DEGREES = 0.7;
const float SUN_GLARE_WIDE = 0.15;
const float SUN_GLARE_WIDE_DEGREES = 6.0;
const float SUN_SPIKE_LIGHT = 1.5;

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
  float aboveHorizon = step(0.0, dot(groundLocal(uBodySun[uGround].xyz), normalize(uGroundCamera)));
  return aboveHorizon * (1.0 - min(1.0, uGroundOvercast * OVERCAST_VEIL_GAIN) * uGroundBlend);
}

vec3 sunGlare(vec3 direction) {
  if (uGround < 0 || uWarpAxis.w > 0.5) return vec3(0.0);
  int sun = sunIndex();
  if (sun < 0) return vec3(0.0);
  vec3 toSun = uBodyPlace[sun].xyz;
  float degreesOff = degrees(acos(clamp(dot(direction, toSun), -1.0, 1.0)));
  float spread = SUN_GLARE_CORE * exp(-degreesOff / SUN_GLARE_CORE_DEGREES) + SUN_GLARE_WIDE * exp(-degreesOff / SUN_GLARE_WIDE_DEGREES);
  spread += SUN_SPIKE_LIGHT * starburst(pixelsFrom(direction, toSun), SPIKE_LONGEST_REACH);
  vec3 tint = uBodyLook[sun].rgb * sunlightThroughAir(groundLocal(uBodySun[uGround].xyz), normalize(uGroundCamera));
  return tint * spread * sunVisibleFromGround(toSun) * uGroundBlend * uSunSeen;
}

Haze hazeAboveGround(vec3 direction) {
  if (uGroundAir.w <= 0.0) return NO_HAZE;
  float share = hazeSeenFromAbove();
  if (share <= 0.0) return NO_HAZE;
  Haze haze = hazeAround(uGround, direction);
  return Haze(haze.light * share, mix(vec3(1.0), haze.clear, share));
}

float airAboveClouds() {
  return exp(-mix(uGroundClouds.x, uGroundClouds.y, CLOUD_SHEET_HEIGHT_SHARE) / uGroundAir.w);
}

vec4 groundThroughHaze(vec4 ground, vec3 direction) {
  Haze haze = hazeAboveGround(direction);
  if (cloudSeen > 0.0) {
    float clear = dot(haze.clear, vec3(1.0 / 3.0));
    vec3 share = vec3(mix(1.0, airAboveClouds(), cloudSeen * clear));
    vec3 litFromBelow = mix(haze.clear, vec3(clear), cloudSeen * clear);
    haze = Haze(1.0 - pow(max(1.0 - haze.light, 0.0), share), pow(litFromBelow, share));
  }
  vec4 hazy = throughHaze(ground, haze);
  return vec4(hazy.rgb - haze.light * haze.clear * ground.rgb * uGroundBlend, hazy.a);
}

uniform float uFlowOn;
uniform float uDazzle;
uniform vec4 uFarSunLook;
uniform sampler2D uBodiesSeen;
const vec3 FLOW_TINT = vec3(0.68, 0.75, 1.0);

vec3 throughFlow(vec3 behind) {
  if (uFarSunLook.a > 0.5) return mix(behind, uFarSunLook.rgb, texture(uSky, vUv).a);
  if (uFlowOn < 0.5) return behind;
  vec3 glow = pow(1.0 - exp(-texture(uSky, vUv).a * FLOW_TINT), vec3(0.4545));
  return 1.0 - (1.0 - min(behind, 1.0)) * (1.0 - glow);
}

vec4 bodiesSeen() {
  vec4 seen = texelFetch(uBodiesSeen, ivec2(gl_FragCoord.xy), 0);
  starHit = seen.a >= STAR_HIT_MARK;
  return vec4(seen.rgb, starHit ? seen.a - STAR_HIT_MARK : seen.a);
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
  vec4 body = bodiesSeen();
  bool sunThroughAir = starHit && uGround >= 0 && uWarpAxis.w < 0.5;
  float bodyVeil = sunThroughAir ? starVeil : ground.a;
  if (sunThroughAir) body.rgb *= sunlightThroughAir(groundLocal(uBodySun[uGround].xyz), normalize(uGroundCamera));
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
  float logSeen = log(max(seen, 1e-12)) / log(10.0) - uAdaptation - uDazzle;
  float lightness = photo ? photoLightness(logSeen) : nakedEyeLightness(logSeen, colourShare);
  vec3 tint = sky / uWhiteBalance;
  tint /= max(max(tint.r, tint.g), max(tint.b, 1e-9));
  tint = boostSaturation(tint, mix(1.0, LONG_EXPOSURE_SATURATION, uLongExposure));
  vec3 colour = mix(vec3(0.86, 0.9, 1.0), tint, colourShare);
  vec3 behind = throughFlow(colour * max(lightness, 0.0)) * (1.0 - body.a);
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
  if (uGround >= 0 && uWarpAxis.w < 0.5) scene = groundThroughHaze(scene, direction);
  outColour = vec4(scene.rgb + sunGlare(direction), scene.a);
}`;

const HOLE_BENDING = `${DEFLECTION}
uniform vec4 uHoleInFront;
uniform vec4 uHoleSurface;

bool bentAroundHole(inout vec3 direction) {
  if (uHoleInFront.w < 0.5) return false;
  float toward = dot(direction, uHoleInFront.xyz);
  vec3 across = direction - uHoleInFront.xyz * toward;
  float miss = length(across);
  float angle = atan(miss, toward);
  if (angle < uShadow) return true;
  float bent = angle - deflectionAt(max(angle - uShadow, 1e-12));
  direction = uHoleInFront.xyz * cos(bent) + across * (sin(bent) / max(miss, 1e-9));
  return false;
}
`;

const surfacesFragment = (inventedPass) => `#version 300 es
#define INVENTED_PASS ${inventedPass ? 1 : 0}
${EYE_SHARED}
${HOLE_BENDING}
void main() {
  vec3 unbent = directionBeforeWarp(viewDirection());
  outColour = vec4(0.0);
  if (bentAroundHole(unbent)) return;
  for (int i = 0; i < uBodyCount; i++) {
    if (bodyOutOfSight(i, unbent) || uBodyLook[i].w == BODY_MIRROR) continue;
    BodyHit seen = bodyHit(i, unbent);
    if (seen.cover <= 0.0) continue;
    if ((uBodyLook[i].w == BODY_INVENTED) == (INVENTED_PASS == 1)) outColour = vec4(shadeBody(i, unbent, hitDistance(seen), seen.radius), 1.0);
    return;
  }
}`;

export const SURFACES_FRAGMENT = surfacesFragment(false);
export const INVENTED_SURFACES_FRAGMENT = surfacesFragment(true);

export const BODIES_FRAGMENT = `#version 300 es
${EYE_SHARED}
${HOLE_BENDING}
void main() {
  vec3 unbent = directionBeforeWarp(viewDirection());
  if (bentAroundHole(unbent)) {
    outColour = uHoleSurface.w > 0.5 ? vec4(uHoleSurface.rgb, 1.0) : vec4(0.0);
    return;
  }
  vec4 body = bodiesColour(unbent);
  outColour = vec4(body.rgb, starHit ? body.a + STAR_HIT_MARK : body.a);
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
out float vSpikeReach;
out vec2 vStreak;
out float vSprite;
uniform float uLongExposure;
uniform float uSunSeen;
uniform vec3 uStarShift;
uniform vec4 uHole;
uniform float uHoleDistancePc;
uniform float uHoleHidesSprite;
uniform int uHoleImage;
uniform float uDazzle;
uniform sampler2D uHoleImages;
uniform mat3 uFarToNear;
const int FIRST_FAR_IMAGE = 2;
const float BEHIND_HOLE = 2.0;
const float FAINTEST_DRAWN = 6.8;
const float SPRITE_FADE_DECADES = 13.0;
const float SPRITE_AT_HOLE_COSINE = 0.99;

vec2 imageSeen(float skyAngle) {
  float count = float(textureSize(uHoleImages, 0).x);
  float place = clamp(pow(skyAngle / 3.14159265, 1.0 / 3.0) * count - 0.5, 0.0, count - 1.0);
  int low = min(int(place), int(count) - 2);
  return mix(texelFetch(uHoleImages, ivec2(low, uHoleImage), 0).rg, texelFetch(uHoleImages, ivec2(low + 1, uHoleImage), 0).rg, place - float(low));
}

float bendThroughHole(inout vec3 seen) {
  vec3 label = uFarToNear * seen;
  float outward = -dot(label, uHole.xyz);
  vec3 across = label + uHole.xyz * outward;
  float miss = length(across);
  vec2 image = imageSeen(atan(miss, outward));
  across *= (uHoleImage == FIRST_FAR_IMAGE ? 1.0 : -1.0) / max(miss, 1e-9);
  seen = uHole.xyz * cos(image.x) + across * sin(image.x);
  return image.y;
}

float bendAroundHole(inout vec3 seen, float distance) {
  if (uHoleImage >= FIRST_FAR_IMAGE) return bendThroughHole(seen);
  float toward = dot(seen, uHole.xyz);
  if (distance < BEHIND_HOLE * uHoleDistancePc) {
    bool holeItself = toward > SPRITE_AT_HOLE_COSINE && distance > 0.5 * uHoleDistancePc;
    return uHoleImage == 1 ? 0.0 : holeItself ? pow(10.0, -SPRITE_FADE_DECADES * uHoleHidesSprite) : 1.0;
  }
  vec3 across = seen - uHole.xyz * toward;
  float miss = length(across);
  vec2 image = imageSeen(atan(miss, toward));
  across *= (uHoleImage == 0 ? 1.0 : -1.0) / max(miss, 1e-9);
  seen = uHole.xyz * cos(image.x) + across * sin(image.x);
  return image.y;
}

vec2 streakPixels(vec3 offset, vec2 ndc) {
  if (uWarpAxis.w > 0.5 || uHole.w > 0.5) return vec2(0.0);
  vec3 past = offset + uStarShift;
  float ahead = dot(past, uForward);
  if (ahead <= 0.0) return vec2(0.0);
  vec2 pastNdc = vec2(dot(past, uRight), dot(past, uUp)) / ahead / uTanHalf;
  vec2 streak = (ndc - pastNdc) * uTanHalf / uPixelAngle * ${SHUTTER_SHARE.toFixed(2)};
  return streak * min(1.0, ${LONGEST_BLUR_PIXELS.toFixed(1)} / max(length(streak), 1e-6));
}

const float BRIGHTER_THAN_ANY_OTHER_STAR = -15.0;
${EYE_SPIKES}

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
  bool behindBodyBeforeWarp = uHoleImage < FIRST_FAR_IMAGE && behindBody(seen);
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
  } else if (uHole.w > 0.5) {
    warping = vec3(bendAroundHole(seen, distance) * pow(10.0, -uDazzle));
    if (warping.g <= 0.0 || aLook.x + 5.0 * log(distance / 10.0) / log(10.0) - 2.5 * log(warping.g) / log(10.0) > FAINTEST_DRAWN) {
      hide();
      return;
    }
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
  if (seenMagnitude < BRIGHTER_THAN_ANY_OTHER_STAR) vColour *= uSunSeen;
  vSpread = 1.0 + max(0.0, 4.0 - seenMagnitude) * 0.5;
  vGlare = clamp(-1.0 - seenMagnitude, 0.0, 10.0);
  vSize = seenMagnitude < 6.8 ? min(128.0, ceil(vSpread * 4.0 + vGlare * 10.0)) : 0.0;
  vSpikeReach = clamp((SPIKE_FAINTEST_MAGNITUDE - seenMagnitude) * SPIKE_PIXELS_PER_MAGNITUDE, 0.0, SPIKE_LONGEST_REACH);
  vSize = max(vSize, ceil(2.0 * vSpikeReach));
  vStreak = vec2(0.0);
  vSprite = vSize;
  if (vSize > 0.0) {
    vStreak = streakPixels(offset, ndc);
    vSprite += ceil(length(vStreak));
    vColour *= sqrt(vSpread / (vSpread + length(vStreak)));
    ndc -= 0.5 * vStreak * uPixelAngle / uTanHalf;
  }
  gl_PointSize = vSprite;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const EYE_STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
in float vSpread;
in float vSize;
in float vGlare;
in float vSpikeReach;
in vec2 vStreak;
in float vSprite;
out vec4 outColour;
${EYE_SPIKES}
void main() {
  vec2 offset = (gl_PointCoord - 0.5) * vSprite;
  vec2 halfStreak = vec2(0.5, -0.5) * vStreak;
  offset -= halfStreak * clamp(dot(offset, halfStreak) / max(dot(halfStreak, halfStreak), 1e-6), -1.0, 1.0);
  float r2 = dot(offset, offset);
  float r = sqrt(r2);
  float core = exp(-r2 / (2.0 * 0.6 * 0.6 * vSpread * vSpread / 1.21));
  float halo = (0.05 + 0.06 * vGlare) * exp(-r / (0.9 * vSpread + 1.5 * vGlare));
  float edge = 1.0 - smoothstep(0.3 * vSize, 0.5 * vSize, r);
  float spikes = vSpikeReach > 0.0 ? min(vSpikeReach / 8.0, 1.0) * starburst(offset, vSpikeReach) : 0.0;
  outColour = vec4(vColour * (core + halo * edge + spikes), 1.0);
}`;

export const SKY_FROM_CUBE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform samplerCube uSkyCube;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
out vec4 outColour;
void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  outColour = texture(uSkyCube, uForward + uRight * ndc.x * uTanHalf.x + uUp * ndc.y * uTanHalf.y);
}`;

export const CAMERA_STAR_VERTEX = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aLook;
uniform vec3 uAnchorShift;
uniform float uElectronsPerNanomaggy;
uniform float uElectronsPerUnit;
uniform float uPsfPixels;
const float SPIKE_FAINTEST_RATE = 1.0;
const float SPIKE_PIXELS_PER_LOG = 2.5;
const float SPIKE_LONGEST_REACH = 25.0;
out vec3 vRate;
out float vSigma;
out float vSize;
out float vSpikeReach;

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
  vSpikeReach = min(SPIKE_LONGEST_REACH, SPIKE_PIXELS_PER_LOG * max(log(brightness / SPIKE_FAINTEST_RATE), 0.0));
  vSize = max(min(64.0, ceil(2.0 * (4.0 * vSigma + halo) + 2.0)), ceil(7.0 * vSpikeReach));
  gl_PointSize = vSize;
  gl_Position = vec4(ndc, 0.0, 1.0);
}`;

export const CAMERA_STAR_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vRate;
in float vSigma;
in float vSize;
in float vSpikeReach;
out vec4 outColour;
${CAMERA_SPIKES}
const float SPIKE_LIGHT = 0.04;
void main() {
  vec2 offset = (gl_PointCoord - 0.5) * vSize;
  float r2 = dot(offset, offset);
  float core = exp(-r2 / (2.0 * vSigma * vSigma)) / (6.2831853 * vSigma * vSigma);
  float wing = 3.0 * vSigma;
  float halo = 1.0 / (3.14159265 * wing * wing) / pow(1.0 + r2 / (wing * wing), 2.0);
  float spikes = 0.0;
  if (vSpikeReach > 0.0) {
    float edge = 1.0 - smoothstep(0.35 * vSize, 0.5 * vSize, sqrt(r2));
    spikes = edge * spikeCross(offset, vSigma, vSpikeReach) / (4.0 * vSpikeReach * 2.5066 * vSigma);
  }
  outColour = vec4(vRate * (0.94 * core + 0.06 * halo + SPIKE_LIGHT * spikes), 1.0);
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
