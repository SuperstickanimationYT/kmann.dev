import { createTarget, setUniforms, startProgram } from './gl.js';
import { bendingAt, DEFLECTION_SAMPLES, IMAGE_SAMPLES, starImages } from './light-bending.js';
import { FULLSCREEN_VERTEX, LATTICE_PERIOD } from './shaders.js';
import { simNow } from './sim-clock.js';
import { KM_PER_PC } from './solar-system.js';

const RADII_PER_HORIZON = 2;
const LEAST_BENDING_PIXELS = 1;
const REBEND_CHANGE = 2e-4;
const DEFLECTION_UNIT = 28;
const IMAGES_UNIT = 29;
const FLOW_UNIT = 30;
const FLOW_RESOLUTION = { outside: 0.5, inside: 0.3 };
const FLOW_HORIZONS = 22;
const FLOW_STEPS = 84;
const LIGHT_KM_PER_SECOND = 299792.458;
const SWIRL_PERIOD = 80;
const BLURRING_SKIP = 4;
const SPRITE_HORIZONS = { shown: 700, hidden: 220 };
const LEAST_FLOW_PIXELS = 3;
const FLOW_LUX_AT_AU = 3e5;
const KM_PER_AU = 149597870.7;
const UNDAZZLING_LUX = 0.5;
const DAZZLE_PER_DECADE = 0.3;

const VIEW_RAY = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
uniform vec3 uHole;
out vec4 outColour;

vec3 viewDirection() {
  vec2 ndc = vUv * 2.0 - 1.0;
  return normalize(uForward + uRight * ndc.x * uTanHalf.x + uUp * ndc.y * uTanHalf.y);
}

float angleFromHole(vec3 direction) {
  return atan(length(cross(uHole, direction)), dot(uHole, direction));
}

vec3 acrossFrom(vec3 direction) {
  vec3 across = direction - uHole * dot(direction, uHole);
  return across / max(length(across), 1e-9);
}
`;

const LENS_FRAGMENT = `${VIEW_RAY}
precision highp samplerCube;
uniform sampler2D uSky;
uniform samplerCube uKeptSky;
uniform float uKeptSkyOn;
uniform sampler2D uDeflections;
uniform sampler2D uFlow;
uniform float uFlowOn;
uniform float uShadow;
uniform float uLeastLog;
uniform float uLogSpan;
uniform float uPixelAngle;
const float SEEN_SKY_EDGE = 0.04;

float deflectionAt(float excess) {
  float place = clamp((log(excess) - uLeastLog) / uLogSpan, 0.0, 1.0) * ${DEFLECTION_SAMPLES - 1}.0;
  int low = min(int(place), ${DEFLECTION_SAMPLES - 2});
  return mix(texelFetch(uDeflections, ivec2(low, 0), 0).r, texelFetch(uDeflections, ivec2(low + 1, 0), 0).r, place - float(low));
}

vec3 skyToward(vec3 direction) {
  float ahead = dot(direction, uForward);
  vec2 uv = vec2(dot(direction, uRight), dot(direction, uUp)) / max(ahead, 1e-4) / uTanHalf * 0.5 + 0.5;
  vec2 inside = min(uv, 1.0 - uv);
  float onScreen = ahead > 0.0 ? smoothstep(0.0, SEEN_SKY_EDGE, min(inside.x, inside.y)) : 0.0;
  if (uKeptSkyOn < 0.5) return textureLod(uSky, ahead > 0.0 ? clamp(uv, 0.0, 1.0) : vUv, 0.0).rgb;
  vec3 whole = onScreen < 1.0 ? textureLod(uKeptSky, direction, 0.0).rgb : vec3(0.0);
  return onScreen > 0.0 ? mix(whole, textureLod(uSky, uv, 0.0).rgb, onScreen) : whole;
}

float flowSeen() {
  vec2 reach = 0.8 / vec2(textureSize(uFlow, 0));
  float total = 0.0;
  for (int k = 0; k < 4; k++) total += texture(uFlow, vUv + reach * vec2(k < 2 ? -1.0 : 1.0, k % 2 == 0 ? -1.0 : 1.0)).r;
  return 0.25 * total;
}

void main() {
  vec3 direction = viewDirection();
  float angle = angleFromHole(direction);
  float flow = uFlowOn > 0.5 ? flowSeen() : 0.0;
  float outside = smoothstep(-0.5, 0.5, (angle - uShadow) / uPixelAngle);
  if (outside <= 0.0) {
    outColour = vec4(0.0, 0.0, 0.0, flow);
    return;
  }
  float bent = angle - deflectionAt(max(angle - uShadow, 1e-12));
  vec3 source = uHole * cos(bent) + acrossFrom(direction) * sin(bent);
  outColour = vec4(skyToward(source) * outside, flow);
}`;

const FLOW_FRAGMENT = `${VIEW_RAY}
precision highp sampler3D;
uniform sampler3D uLattice;
uniform float uHorizons;
uniform vec3 uAxis;
uniform vec2 uSwirl;
uniform vec2 uSwirlShare;
uniform float uClumpiness;
const float REACH = ${FLOW_HORIZONS.toFixed(1)};
const float THICKNESS = 0.4;
const float FALL_OFF = 3.6;
const float BRIGHTNESS = 9.0;
const float SPECTRAL_BEAMING = 2.7;
const float INNERMOST_ORBIT = 3.0;
const float CAUGHT = 1.01;
const float FAINTEST = 2e-6;
const float USUAL_CLUMP = 1.25;

float smoothNoise(vec3 p) {
  vec3 f = fract(p);
  return textureLod(uLattice, (floor(p) + f * f * (3.0 - 2.0 * f) + 0.5) / ${LATTICE_PERIOD}.0, 0.0).r;
}

float clumps(vec3 place, float ring, float height, float turned, float seed) {
  float c = cos(turned);
  float s = sin(turned);
  vec2 spun = vec2(c * place.x + s * place.y, c * place.y - s * place.x) / ring;
  vec3 p = vec3(spun * (2.6 + 6.0 * height / ring), 3.4 * log(ring) + seed);
  float total = 0.52 * smoothNoise(p) + 0.3 * smoothNoise(p * 2.1 + 7.3) + 0.18 * smoothNoise(p * 5.1 + 3.1);
  return exp(5.5 * (total - 0.5));
}

float emission(vec3 x, vec3 travel, vec3 east, vec3 north) {
  float r = length(x);
  float height = dot(x, uAxis);
  vec3 flat3 = x - uAxis * height;
  float ring = max(length(flat3), 0.2);
  float share = height / (THICKNESS * ring);
  float thin = exp(-0.5 * share * share);
  float radial = pow(r, -FALL_OFF) * smoothstep(CAUGHT, 1.8, r) * pow(1.0 - smoothstep(0.15 * REACH, REACH, r), 2.0);
  float amount = thin * radial - FAINTEST;
  if (amount <= 0.0) return 0.0;
  vec3 ahead = cross(uAxis, flat3) / ring;
  float bound = min(1.0, r / INNERMOST_ORBIT);
  float orbital = sqrt(0.5 / max(r - 1.0, 0.5)) * mix(0.75, 1.0, bound);
  vec3 velocity = min(orbital, 0.6) * ahead - 0.6 * (1.0 - bound) * x / r;
  float speed2 = min(dot(velocity, velocity), 0.9);
  float shift = sqrt(max(1.0 - 1.0 / r, 0.0)) * sqrt(1.0 - speed2) / (1.0 + dot(velocity, travel));
  float rate = sqrt(0.5 / (ring * ring * ring));
  vec3 place = vec3(dot(flat3, east), dot(flat3, north), height);
  float clumped = uSwirlShare.x * clumps(place, ring, height, rate * uSwirl.x, 0.0) + uSwirlShare.y * clumps(place, ring, height, rate * uSwirl.y, 31.7);
  clumped = mix(USUAL_CLUMP, clumped, uClumpiness);
  return amount * clumped * pow(shift, SPECTRAL_BEAMING);
}

float hash(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  outColour = vec4(0.0);
  vec3 direction = viewDirection();
  float angle = angleFromHole(direction);
  vec3 outward = -uHole;
  vec3 across = acrossFrom(direction);
  float lapse = sqrt(1.0 - 1.0 / uHorizons);
  float impact = uHorizons * sin(angle) / lapse;
  bool inside = uHorizons <= REACH;
  if (!inside && (impact > REACH || angle > 1.5707963)) return;
  float start = inside ? uHorizons : REACH;
  float azimuth = inside ? 0.0 : acos(clamp(impact / uHorizons, 0.0, 1.0)) - acos(clamp(impact / REACH, 0.0, 1.0));
  vec3 radialOut = outward * cos(azimuth) + across * sin(azimuth);
  vec3 sideways = across * cos(azimuth) - outward * sin(azimuth);
  float u = 1.0 / start;
  float fall = sqrt(max(0.0, 1.0 - impact * impact * u * u * (1.0 - u)));
  vec3 travel = normalize((angle < 1.5707963 ? -fall : fall) * radialOut + impact * u * sideways);
  vec3 x = start * radialOut;
  vec3 spin = cross(x, travel);
  float pull = 1.5 * dot(spin, spin);
  vec3 east = normalize(cross(uAxis, abs(uAxis.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  vec3 north = cross(uAxis, east);
  float light = 0.0;
  float jitter = hash(gl_FragCoord.xy);
  for (int i = 0; i < ${FLOW_STEPS}; i++) {
    float r = length(x);
    float stride = 0.075 * max(r - 0.4, 0.25) * (i == 0 ? 0.2 + jitter : 1.0);
    vec3 kicked = travel - 0.5 * stride * pull * x / pow(r, 5.0);
    x += stride * kicked;
    r = length(x);
    if (r < CAUGHT) break;
    travel = kicked - 0.5 * stride * pull * x / pow(r, 5.0);
    if (r > REACH && dot(x, travel) > 0.0) break;
    light += stride * emission(x, normalize(travel), east, north);
  }
  outColour = vec4(BRIGHTNESS * light / lapse, 0.0, 0.0, 1.0);
}`;

function tableTexture(gl, unit, format, width, height) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height);
  for (const side of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, side, gl.NEAREST);
  gl.activeTexture(gl.TEXTURE0);
  return (channels, values) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, channels, gl.FLOAT, values);
    gl.activeTexture(gl.TEXTURE0);
  };
}

let swirledAt = 0;

function swirlNow(radiusKm) {
  const time = (simNow() / 1000) * (LIGHT_KM_PER_SECOND / radiusKm);
  const share = (((time / SWIRL_PERIOD) % 1) + 1) % 1;
  const other = (share + 0.5) % 1;
  const weight = 1 - Math.abs(2 * share - 1);
  const skipped = time - swirledAt;
  swirledAt = time;
  return { uClumpiness: 1 / (1 + (skipped / BLURRING_SKIP) ** 2), uSwirl: [share * SWIRL_PERIOD, other * SWIRL_PERIOD], uSwirlShare: [weight, 1 - weight] };
}

function spriteHidden(horizons) {
  const { shown, hidden } = SPRITE_HORIZONS;
  return Math.min(1, Math.max(0, Math.log(shown / horizons) / Math.log(shown / hidden)));
}

export function createBlackHoleView(gl, emptyVao, { keptSkyUnit, latticeUnit }) {
  const compiling = [LENS_FRAGMENT, FLOW_FRAGMENT].map((fragment) => startProgram(gl, FULLSCREEN_VERTEX, fragment));
  let programs = null;
  let tables = null;
  let bending = null;
  const targets = new Map();

  function bendFor(radius) {
    tables ??= {
      deflections: tableTexture(gl, DEFLECTION_UNIT, gl.R32F, DEFLECTION_SAMPLES, 1),
      images: tableTexture(gl, IMAGES_UNIT, gl.RG32F, IMAGE_SAMPLES, 2),
    };
    if (bending && Math.abs(radius / bending.radius - 1) < REBEND_CHANGE) return;
    bending = bendingAt(radius);
    tables.deflections(gl.RED, bending.deflections);
    tables.images(gl.RG, starImages(bending));
  }

  function targetFor(name, width, height) {
    let target = targets.get(name);
    if (target?.width !== width || target.height !== height) {
      target?.destroy();
      target = createTarget(gl, width, height);
      targets.set(name, target);
    }
    return target;
  }

  function draw({ program, uniforms }, target, values, textures) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program);
    setUniforms(gl, { uniforms }, values);
    for (const [name, unit] of Object.entries(textures)) gl.uniform1i(uniforms[name], unit);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function lensed({ seen, view, sky, keptSkyReady, width, height }) {
    if (!seen) return null;
    const { body, offsetKm } = seen;
    const distanceKm = Math.hypot(...offsetKm);
    const horizons = distanceKm / body.radiusKm;
    if (Math.sqrt(RADII_PER_HORIZON / horizons) < LEAST_BENDING_PIXELS * view.pixelAngle) return null;
    programs ??= compiling.map((program) => program.finish());
    const [lens, flow] = programs;
    bendFor(RADII_PER_HORIZON * horizons);
    const hole = offsetKm.map((value) => value / distanceKm);
    const { right, up, forward } = view.basis;
    const ray = { uRight: right, uUp: up, uForward: forward, uTanHalf: view.tanHalf, uHole: hole };
    const target = targetFor('lens', width, height);
    const glowing = body.hole.glowing && FLOW_HORIZONS / horizons > LEAST_FLOW_PIXELS * view.pixelAngle;
    if (glowing) {
      const resolution = horizons < FLOW_HORIZONS ? FLOW_RESOLUTION.inside : FLOW_RESOLUTION.outside;
      const flowTarget = targetFor('flow', Math.round(width * resolution), Math.round(height * resolution));
      draw(flow, flowTarget, { ...ray, ...swirlNow(body.radiusKm), uHorizons: horizons, uAxis: body.north }, { uLattice: latticeUnit });
      gl.activeTexture(gl.TEXTURE0 + FLOW_UNIT);
      gl.bindTexture(gl.TEXTURE_2D, flowTarget.textures[0]);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sky);
    draw(lens, target, {
      ...ray,
      uKeptSkyOn: keptSkyReady ? 1 : 0,
      uFlowOn: glowing ? 1 : 0,
      uShadow: bending.shadow,
      uLeastLog: bending.leastLog,
      uLogSpan: bending.logSpan,
      uPixelAngle: view.pixelAngle,
    }, { uSky: 0, uKeptSky: keptSkyUnit, uDeflections: DEFLECTION_UNIT, uFlow: FLOW_UNIT });
    const dazzle = glowing ? DAZZLE_PER_DECADE * Math.log10(1 + FLOW_LUX_AT_AU * (KM_PER_AU / distanceKm) ** 2 / UNDAZZLING_LUX) : 0;
    return { sky: target.textures[0], glowing, dazzle, starUniforms: { uHole: [...hole, 1], uHoleDistancePc: distanceKm / KM_PER_PC, uHoleHidesSprite: glowing ? spriteHidden(horizons) : 0, uDazzle: dazzle } };
  }

  function bindStarImages(program) {
    gl.uniform1i(program.uniforms.uHoleImages, IMAGES_UNIT);
  }

  return { lensed, bindStarImages };
}
