import { MAX_BANDS, MAX_JETS, MAX_SPOTS } from './giants.js';

export const GIANT_FACE_SIZE = 768;
const GUTTER = 4;
export const GIANT_FACE_OVERSCAN = GIANT_FACE_SIZE / (GIANT_FACE_SIZE - 2 * GUTTER);

export const GIANT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform int uFace;
uniform int uBandCount;
uniform float uBandLatitude[${MAX_BANDS}];
uniform vec4 uBandColour[${MAX_BANDS}];
uniform int uJetCount;
uniform vec3 uJet[${MAX_JETS}];
uniform int uSpotCount;
uniform int uSpinningCount;
uniform vec4 uSpotPlace[${MAX_SPOTS}];
uniform vec4 uSpotColour[${MAX_SPOTS}];
uniform float uSpotSpin[${MAX_SPOTS}];
uniform vec4 uWake;
uniform float uEddyScale;
uniform float uEddySpeed;
uniform float uStreaks;
uniform float uHexagon;
out vec4 outColour;

const int TRACE_STEPS = 56;
const float TRACE_STEP = 1.0 / float(TRACE_STEPS);
const vec3 EDDY_STRETCH = vec3(1.0, 1.0, 1.8);
const float STREAK_FLATNESS = 9.0;
const float SPOT_TURNS = 2.2;
const float HEXAGON_REACH = 0.42;
const float HEXAGON_SIDE = 1.0471976;
const float HEXAGON_MEAN_INSET = 0.955;
const vec3 HOLLOW_COLOUR = vec3(0.86, 0.8, 0.72);

uint hashUint(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

float latticeValue(vec3 corner) {
  uvec3 q = uvec3(ivec3(corner) + 4096);
  return float(hashUint(q.x * 73856093u ^ q.y * 19349663u ^ q.z * 83492791u)) / 4294967295.0;
}

vec4 noiseAndSlope(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = latticeValue(i);
  float b = latticeValue(i + vec3(1, 0, 0));
  float c = latticeValue(i + vec3(0, 1, 0));
  float d = latticeValue(i + vec3(1, 1, 0));
  float e = latticeValue(i + vec3(0, 0, 1));
  float g = latticeValue(i + vec3(1, 0, 1));
  float h = latticeValue(i + vec3(0, 1, 1));
  float k = latticeValue(i + vec3(1, 1, 1));
  float x = b - a;
  float y = c - a;
  float z = e - a;
  float xy = a - b - c + d;
  float yz = a - c - e + h;
  float zx = a - b - e + g;
  float xyz = k - d - g - h + b + c + e - a;
  float value = a + x * u.x + y * u.y + z * u.z + xy * u.x * u.y + yz * u.y * u.z + zx * u.z * u.x + xyz * u.x * u.y * u.z;
  vec3 slope = du * vec3(
    x + xy * u.y + zx * u.z + xyz * u.y * u.z,
    y + yz * u.z + xy * u.x + xyz * u.z * u.x,
    z + zx * u.x + yz * u.y + xyz * u.x * u.y);
  return vec4(value - 0.5, slope);
}

vec4 bandAt(float latitude) {
  int above = 1;
  for (int k = 1; k < uBandCount; k++) if (latitude > uBandLatitude[k]) above = min(k + 1, uBandCount - 1);
  float low = uBandLatitude[above - 1];
  float share = smoothstep(0.0, 1.0, clamp((latitude - low) / (uBandLatitude[above] - low), 0.0, 1.0));
  return mix(uBandColour[above - 1], uBandColour[above], share);
}

float latitudeOf(vec3 p) {
  return asin(clamp(p.z, -1.0, 1.0));
}

vec3 placeAt(vec2 northEast) {
  return vec3(cos(northEast.x) * cos(northEast.y), cos(northEast.x) * sin(northEast.y), sin(northEast.x));
}

vec2 acrossSpot(vec3 p, vec4 place, out vec3 east, out vec3 north) {
  vec3 centre = placeAt(place.xy);
  east = vec3(-sin(place.y), cos(place.y), 0.0);
  north = cross(centre, east);
  return dot(p, centre) > 0.0 ? vec2(dot(p, east), dot(p, north)) / place.zw : vec2(99.0);
}

vec3 windAt(vec3 p) {
  float latitude = latitudeOf(p);
  float along = 0.0;
  for (int k = 0; k < uJetCount; k++) {
    float off = (latitude - uJet[k].x) / uJet[k].z;
    along += uJet[k].y * exp(-off * off);
  }
  vec3 eastward = vec3(-p.y, p.x, 0.0);
  vec3 swirl = vec3(0.0);
  float calm = 1.0;
  vec3 east;
  vec3 north;
  for (int k = 0; k < uSpinningCount; k++) {
    vec2 off = acrossSpot(p, uSpotPlace[k], east, north);
    float reach = exp(-0.55 * dot(off, off));
    swirl += SPOT_TURNS * 6.2831853 * uSpotSpin[k] * reach * reach * (north * off.x * uSpotPlace[k].w - east * off.y * uSpotPlace[k].z);
    calm *= 1.0 - min(1.6 * reach, 1.0);
  }
  float turbulence = bandAt(latitude).a;
  vec2 wakeOff = acrossSpot(p, vec4(uWake.x + 0.1, uWake.y, uWake.z * 0.8, 0.09), east, north);
  turbulence += uWake.w * exp(-dot(wakeOff, wakeOff));
  vec3 eddies = vec3(0.0);
  float scale = uEddyScale;
  float speed = uEddySpeed * turbulence;
  for (int octave = 0; octave < 4; octave++) {
    vec3 slope = noiseAndSlope(p * EDDY_STRETCH * scale + float(octave) * vec3(17.3, 5.1, 9.7)).yzw * EDDY_STRETCH;
    eddies += speed * cross(p, slope);
    scale *= 2.2;
    speed *= 0.62;
  }
  return calm * (along * eastward + eddies) + swirl;
}

float streakNoise(vec3 p) {
  float total = 0.0;
  float scale = 6.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 6; octave++) {
    total += amplitude * noiseAndSlope(p * vec3(1.0, 1.0, STREAK_FLATNESS) * scale + float(octave) * 11.7).x;
    scale *= 2.1;
    amplitude *= 0.72;
  }
  return total;
}

vec3 paintSpots(vec3 colour, vec3 p, vec3 origin) {
  float ragged = noiseAndSlope(p * 30.0).x * 0.08 + noiseAndSlope(p * 70.0).x * 0.04;
  vec3 east;
  vec3 north;
  for (int k = 0; k < uSpotCount; k++) {
    float off = length(acrossSpot(p, uSpotPlace[k], east, north)) + ragged;
    vec3 fill = uSpotColour[k].rgb;
    if (uSpotSpin[k] != 0.0) fill *= 1.0 + 0.14 * streakNoise(origin * 2.0) + 0.1 * sin(off * 13.0) * max(1.0 - off, 0.0);
    colour = mix(colour, HOLLOW_COLOUR, uSpotColour[k].a * (1.0 - smoothstep(1.2, 1.75, off)));
    colour = mix(colour, fill, 1.0 - smoothstep(0.85, 1.12, off));
  }
  return colour;
}

void main() {
  vec2 st = (gl_FragCoord.xy / ${GIANT_FACE_SIZE.toFixed(1)} * 2.0 - 1.0) * ${GIANT_FACE_OVERSCAN.toFixed(6)};
  float side = uFace % 2 == 0 ? 1.0 : -1.0;
  int axis = uFace / 2;
  vec3 here = normalize(axis == 0 ? vec3(side, st) : axis == 1 ? vec3(st.x, side, st.y) : vec3(st, side));
  vec3 origin = here;
  for (int k = 0; k < TRACE_STEPS; k++) origin = normalize(origin - TRACE_STEP * windAt(origin));
  float latitude = latitudeOf(origin);
  float fromPole = 1.5707963 - latitude;
  float alongSide = mod(atan(here.y, here.x), HEXAGON_SIDE) - 0.5 * HEXAGON_SIDE;
  float hexagon = uHexagon * (1.0 - smoothstep(0.6 * HEXAGON_REACH, HEXAGON_REACH, fromPole));
  latitude = 1.5707963 - fromPole * mix(1.0, cos(alongSide) / HEXAGON_MEAN_INSET, hexagon);
  vec4 band = bandAt(latitude);
  float streak = streakNoise(origin);
  vec3 colour = band.rgb * (1.0 + uStreaks * (1.2 + 1.6 * band.a) * streak);
  colour *= mix(vec3(1.0), vec3(1.05, 1.0, 0.93), clamp(-16.0 * uStreaks * streak, 0.0, 1.0));
  colour = paintSpots(colour, here, origin);
  outColour = vec4(clamp(colour, 0.0, 1.0), clamp(band.a * 0.5, 0.0, 1.0));
}
`;
