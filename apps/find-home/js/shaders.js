export const MAX_NEBULAE = 64;
export const MAX_GALAXIES = 4;
export const UNRESOLVED_STEPS = 48;
export const NOISE_SIZE = 64;
export const TABLE_WIDTH = 64;
export const TABLE_ROWS = { oldUnresolved: 0, youngUnresolved: 1, nebulaPlace: 2, nebulaGlow: 3 };
export const UNRESOLVED_NEAREST = 0.1;
export const UNRESOLVED_FARTHEST = 1e6;

export const FULLSCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = corner;
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

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

float armAt(vec2 xy) {
  vec2 uv = (xy + uMapHalfWidth) / (2.0 * uMapHalfWidth);
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  return texture(uArmMap, uv).r;
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
  float bar;
  float young;
  float dust;
};

Matter matterAt(vec3 seen, float delayYears, float footprint) {
  float seenRadius = length(seen.xy);
  vec3 p = turnAzimuth(seen, angularSpeed(seenRadius) * delayYears);
  vec3 barFrame = turnAzimuth(seen, uBarSpin * delayYears);
  float radius = length(p.xy);
  float arm = armAt(p.xy);

  Matter m;
  float outerEdge = 1.0 / (1.0 + exp((radius - 16000.0) / 1500.0));
  float thin = uThin * exp(-(radius - uSunRadius) / uThinLength) * sech2(p.z / uThinHeight) * (0.85 + 0.3 * arm);
  float thick = uThick * exp(-(radius - uSunRadius) / uThickLength) * exp(-abs(p.z) / uThickHeight);
  m.disk = (thin + thick) * outerEdge;
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
      vec3 emission = (m.disk + m.bar) * lookupUnresolved(${TABLE_ROWS.oldUnresolved}, t)
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

vec2 shipAngles(vec3 direction) {
  return vec2(atan(dot(direction, uShipRight), dot(direction, uShipForward)), asin(clamp(dot(direction, uShipUp), -1.0, 1.0)));
}

float distanceOutsideWindows(vec2 angles) {
  float nearest = 10.0;
  for (int i = 0; i < 3; i++) {
    vec4 window = uWindows[i];
    vec2 centre = vec2(window.x + window.y, window.z + window.w) * 0.5;
    vec2 extent = vec2(window.y - window.x, window.w - window.z) * 0.5;
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

export const EYE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uSky;
uniform vec3 uWhiteBalance;
uniform uint uFrameSeed;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
${COCKPIT}
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

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 direction = normalize(uForward + uRight * ndc.x * uTanHalf.x + uUp * ndc.y * uTanHalf.y);
  if (!seenThroughCockpit(direction)) {
    outColour = vec4(cabinColour(direction), 1.0);
    return;
  }
  vec4 planet = planetColour(direction);
  if (planet.a >= 1.0) {
    outColour = vec4(planet.rgb, 1.0);
    return;
  }
  vec3 sky = max(texture(uSky, vUv).rgb, vec3(0.0));
  float photopic = 1.08e-4 * sky.g;
  float scotopic = 1.08e-4 * (0.3 * sky.g + 0.7 * sky.b);
  float logPhotopic = log(max(photopic, 1e-12)) / log(10.0);
  float colourShare = smoothstep(-3.0, -0.5, logPhotopic);
  float seen = mix(scotopic, photopic, colourShare);
  float logSeen = log(max(seen, 1e-12)) / log(10.0);
  float lightness = clamp((logSeen + 5.6) / 5.1, 0.0, 1.0);
  lightness = lightness * lightness * smoothstep(-6.2, -5.4, logSeen);
  lightness += grain() * 0.06 * (1.0 - colourShare) * smoothstep(-6.6, -5.0, logSeen);
  vec3 tint = sky / uWhiteBalance;
  tint /= max(max(tint.r, tint.g), max(tint.b, 1e-9));
  vec3 colour = mix(vec3(0.86, 0.9, 1.0), tint, colourShare);
  outColour = vec4(mix(colour * max(lightness, 0.0) + planet.rgb, planet.rgb, planet.a), 1.0);
}`;

export const EYE_STAR_VERTEX = `#version 300 es
${COMMON}
layout(location = 0) in vec3 aOffset;
layout(location = 1) in vec3 aLook;
uniform vec3 uAnchorShift;
uniform vec3 uWhiteBalance;
uniform vec4 uPlanet;
${COCKPIT}
out vec3 vColour;
out float vSpread;
out float vSize;
out float vGlare;

vec3 bandFluxes(float colour) {
  float redIndex = min(1.4, 0.62 * colour + 0.04);
  return vec3(pow(10.0, 0.4 * redIndex), 1.0, pow(10.0, -0.4 * colour));
}

void main() {
  vec3 offset = aOffset - uAnchorShift;
  float distance = length(offset);
  vec3 local = vec3(dot(offset, uRight), dot(offset, uUp), dot(offset, uForward));
  vGlare = 0.0;
  bool behindPlanet = uPlanet.w > 0.0 && dot(offset / distance, uPlanet.xyz) > cos(uPlanet.w);
  if (local.z <= 0.0 || behindPlanet || !seenThroughCockpit(offset / distance)) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec2 ndc = local.xy / local.z / uTanHalf;
  float apparent = aLook.x + 5.0 * log(distance / 10.0) / log(10.0);
  float tau = distance > 30.0 ? dustColumn(uCamera + offset, 10) : 0.0;
  vec3 extinction = exp(-tau * EXTINCTION_BANDS);
  float seenMagnitude = apparent - 2.5 * log(extinction.g) / log(10.0);
  float brightness = min(2.5, 0.2 * pow(10.0, 0.16 * (6.5 - seenMagnitude)));
  float colourShare = smoothstep(2.0, -1.0, seenMagnitude) * 0.75;
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
