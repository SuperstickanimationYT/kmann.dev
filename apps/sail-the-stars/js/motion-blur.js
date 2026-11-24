import { createByteTarget, createProgram, createTarget, setUniforms } from './gl.js';
import { COCKPIT, FULLSCREEN_VERTEX, GROUND_HIT, LONGEST_BLUR_PIXELS, MAX_BODIES, SHUTTER_SHARE } from './shaders.js';
import { cross, dot, scale, subtract } from './vectors.js';

const FIRST_TEXTURE_UNIT = 20;
const VELOCITY_SCALE = 0.5;
const TILE_PIXELS = LONGEST_BLUR_PIXELS;
const LEAST_MOTION_PIXELS = 1;
const CUT_RADIANS = 1;
const NEAREST_GROUND_KM = 0.002;
const RING_RADII = 2.41;
const SKY_DEPTH = 60;

const VELOCITY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec2 uTanHalf;
uniform float uPixelAngle;
uniform vec3 uPastRight;
uniform vec3 uPastUp;
uniform vec3 uPastForward;
uniform vec2 uPastTanHalf;
uniform vec3 uPastShipRight;
uniform vec3 uPastShipUp;
uniform vec3 uPastShipForward;
uniform vec2 uSize;
uniform int uBlurredCount;
uniform vec4 uBlurredPlace[${MAX_BODIES}];
uniform vec4 uBlurredShift[${MAX_BODIES}];
uniform vec4 uBlurredSpin[${MAX_BODIES}];
uniform vec4 uBlurredRing;
uniform int uBlurredRingBody;
uniform float uGroundShown;
uniform float uCloudsShown;
uniform sampler2D uGroundDepth;
uniform sampler2D uCloudAlpha;
uniform sampler2D uCloudDepth;
uniform vec3 uLocalRight;
uniform vec3 uLocalUp;
uniform vec3 uLocalForward;
uniform vec3 uPastLocalRight;
uniform vec3 uPastLocalUp;
uniform vec3 uPastLocalForward;
uniform vec3 uGroundShift;
${COCKPIT}
out vec4 outVelocity;

const float SMALLEST_BODY_PIXELS = 8.0;
const float CLOUD_SEEN = 0.5;

vec2 pixelsMoved(vec3 past, vec3 right, vec3 up, vec3 forward) {
  float ahead = dot(past, forward);
  if (ahead <= 0.0) return vec2(0.0);
  vec2 pastUv = vec2(dot(past, right), dot(past, up)) / (ahead * uPastTanHalf) * 0.5 + 0.5;
  vec2 moved = (vUv - pastUv) * uSize * ${SHUTTER_SHARE.toFixed(2)};
  return moved * min(1.0, ${TILE_PIXELS.toFixed(1)} / max(length(moved), 1e-6));
}

vec4 moved(vec3 past, float distanceKm) {
  return vec4(pixelsMoved(past, uPastRight, uPastUp, uPastForward), distanceKm < 0.0 ? ${SKY_DEPTH.toFixed(1)} : log2(1.0 + distanceKm), 1.0);
}

vec3 pastPointOn(int i, vec3 fromCamera, vec3 fromCentre) {
  return fromCamera + uBlurredShift[i].xyz - cross(uBlurredSpin[i].xyz, fromCentre);
}

bool ringCrossed(vec3 direction, out float hit) {
  vec4 place = uBlurredPlace[uBlurredRingBody];
  vec3 centre = place.xyz * place.w;
  float facing = dot(direction, uBlurredRing.xyz);
  hit = abs(facing) < 1e-6 ? -1.0 : dot(centre, uBlurredRing.xyz) / facing;
  return hit > 0.0 && length(direction * hit - centre) < uBlurredRing.w;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 aim = vec3(ndc * uTanHalf, 1.0);
  vec3 direction = normalize(uForward + uRight * aim.x + uUp * aim.y);
  if (!seenThroughCockpit(direction)) {
    vec3 inShip = vec3(dot(direction, uShipRight), dot(direction, uShipUp), dot(direction, uShipForward));
    outVelocity = moved(uPastShipRight * inShip.x + uPastShipUp * inShip.y + uPastShipForward * inShip.z, 0.0);
    return;
  }
  if (uGroundShown > 0.5) {
    float depthKm = texelFetch(uGroundDepth, ivec2(vUv * vec2(textureSize(uGroundDepth, 0))), 0).a - ${GROUND_HIT.toFixed(1)};
    if (uCloudsShown > 0.5 && texture(uCloudAlpha, vUv).a > CLOUD_SEEN) {
      float cloudKm = texture(uCloudDepth, vUv).r;
      if (cloudKm > 0.0 && (depthKm < 0.0 || cloudKm < depthKm)) depthKm = cloudKm;
    }
    if (depthKm >= 0.0) {
      vec3 local = normalize(uLocalForward + uLocalRight * aim.x + uLocalUp * aim.y) * max(depthKm, ${NEAREST_GROUND_KM});
      outVelocity = vec4(pixelsMoved(local + uGroundShift, uPastLocalRight, uPastLocalUp, uPastLocalForward), log2(1.0 + depthKm), 1.0);
      return;
    }
  }
  float ringHit = -1.0;
  bool ring = uBlurredRingBody >= 0 && ringCrossed(direction, ringHit);
  for (int i = 0; i < uBlurredCount; i++) {
    vec4 place = uBlurredPlace[i];
    float along = dot(direction, place.xyz);
    if (along <= 0.0) continue;
    float miss = length(direction * along - place.xyz);
    float radius = uBlurredShift[i].w / place.w;
    if (miss < radius) {
      float hit = place.w * (along - sqrt(max(radius * radius - miss * miss, 0.0)));
      if (ring && i == uBlurredRingBody && ringHit < hit) break;
      outVelocity = moved(pastPointOn(i, direction * hit, direction * hit - place.xyz * place.w), hit);
      return;
    }
    if (radius < 2.0 * uPixelAngle && miss < SMALLEST_BODY_PIXELS * uPixelAngle) {
      outVelocity = moved(direction * place.w + uBlurredShift[i].xyz, place.w);
      return;
    }
  }
  if (ring) {
    outVelocity = moved(direction * ringHit + uBlurredShift[uBlurredRingBody].xyz, ringHit);
    return;
  }
  outVelocity = moved(direction, -1.0);
}`;

const TILE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
out vec4 outFastest;
const int ACROSS = ${TILE_PIXELS * VELOCITY_SCALE};
void main() {
  ivec2 corner = ivec2(gl_FragCoord.xy) * ACROSS;
  ivec2 last = textureSize(uVelocity, 0) - 1;
  vec2 fastest = vec2(0.0);
  for (int y = 0; y < ACROSS; y += 2) {
    for (int x = (y >> 1) & 1; x < ACROSS; x += 2) {
      vec2 velocity = texelFetch(uVelocity, min(corner + ivec2(x, y), last), 0).xy;
      if (dot(velocity, velocity) > dot(fastest, fastest)) fastest = velocity;
    }
  }
  outFastest = vec4(fastest, 0.0, 1.0);
}`;

const SPREAD_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uTiles;
out vec4 outFastest;
void main() {
  ivec2 here = ivec2(gl_FragCoord.xy);
  ivec2 last = textureSize(uTiles, 0) - 1;
  vec2 fastest = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 velocity = texelFetch(uTiles, clamp(here + ivec2(x, y), ivec2(0), last), 0).xy;
      if (dot(velocity, velocity) > dot(fastest, fastest)) fastest = velocity;
    }
  }
  outFastest = vec4(fastest, 0.0, 1.0);
}`;

const GATHER_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uPicture;
uniform sampler2D uVelocity;
uniform sampler2D uFastest;
uniform vec2 uSize;
out vec4 outColour;

const int SAMPLES = 12;
const float DEPTH_SOFTNESS = 8.0;
const float SCREEN_GAMMA = 2.2;

vec3 toLight(vec3 shown) { return pow(shown, vec3(SCREEN_GAMMA)); }

float inFrontShare(float depth, float other) { return clamp(1.0 + (other - depth) * DEPTH_SOFTNESS, 0.0, 1.0); }

float reaches(float away, float length) { return clamp(1.0 - away / max(length, 0.5), 0.0, 1.0); }

float within(float away, float length) { return 1.0 - smoothstep(0.95 * length, 1.05 * length + 0.01, away); }

void main() {
  vec3 here = texture(uPicture, vUv).rgb;
  vec2 fastest = texelFetch(uFastest, min(ivec2(gl_FragCoord.xy) / ${TILE_PIXELS}, textureSize(uFastest, 0) - 1), 0).xy;
  float reach = 0.5 * length(fastest);
  if (reach < 0.5) {
    outColour = vec4(here, 1.0);
    return;
  }
  vec3 mine = texture(uVelocity, vUv).xyz;
  float myReach = 0.5 * length(mine.xy);
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  float total = 1.0 / max(myReach, 0.5);
  vec3 light = toLight(here) * total;
  for (int i = 0; i < SAMPLES; i++) {
    float along = (float(i) + 0.5 + jitter) / float(SAMPLES) - 0.5;
    vec2 place = vUv + fastest * along / uSize;
    if (any(lessThan(place, vec2(0.0))) || any(greaterThan(place, vec2(1.0)))) continue;
    float away = abs(along) * 2.0 * reach;
    vec3 theirs = textureLod(uVelocity, place, 0.0).xyz;
    float theirReach = 0.5 * length(theirs.xy);
    float weight = inFrontShare(theirs.z, mine.z) * reaches(away, theirReach)
      + inFrontShare(mine.z, theirs.z) * reaches(away, myReach)
      + within(away, theirReach) * within(away, myReach) * 2.0;
    total += weight;
    light += toLight(textureLod(uPicture, place, 0.0).rgb) * weight;
  }
  outColour = vec4(pow(light / total, vec3(1.0 / SCREEN_GAMMA)), 1.0);
}`;

const turnBetween = (past, now) => Math.max(...['right', 'up', 'forward'].map((axis) => Math.hypot(...subtract(now[axis], past[axis]))));

function spinBetween(past, body) {
  const angle = Math.atan2(dot(cross(past.meridian, body.meridian), body.north), dot(past.meridian, body.meridian));
  return scale(body.north, angle);
}

function movedBodies(past, bodies) {
  return (bodies ?? []).flatMap(({ body, offsetKm }) => {
    const before = past?.find((entry) => entry.body.name === body.name);
    if (!before) return [];
    return [{ body, offsetKm, distanceKm: Math.hypot(...offsetKm), shiftKm: subtract(before.offsetKm, offsetKm), spin: spinBetween(before.body, body) }];
  });
}

function mostPixelsMoved(past, now, moved, groundShift) {
  const { pixelAngle } = now.view;
  const turned = turnBetween(past.view.basis, now.view.basis);
  const zoomed = Math.abs(past.view.tanHalf[1] - now.view.tanHalf[1]);
  const shipTurned = turnBetween(past.ship, now.ship);
  const overGround = groundShift
    ? Math.hypot(...groundShift) / Math.max(now.ground.aboveGroundKm, NEAREST_GROUND_KM) + turnBetween(past.ground.local, now.ground.local)
    : 0;
  const bodies = moved.map(({ body, distanceKm, shiftKm, spin }) => {
    const nearest = Math.max(distanceKm - body.radiusKm, body.radiusKm * 1e-4);
    return (Math.hypot(...shiftKm) + Math.hypot(...spin) * body.radiusKm) / nearest;
  });
  return Math.max(turned, zoomed, shipTurned, overGround, ...bodies) / pixelAngle;
}

export function createMotionBlur(gl, emptyVao) {
  const velocityProgram = createProgram(gl, FULLSCREEN_VERTEX, VELOCITY_FRAGMENT);
  const tileProgram = createProgram(gl, FULLSCREEN_VERTEX, TILE_FRAGMENT);
  const spreadProgram = createProgram(gl, FULLSCREEN_VERTEX, SPREAD_FRAGMENT);
  const gatherProgram = createProgram(gl, FULLSCREEN_VERTEX, GATHER_FRAGMENT);
  let targets = null;
  let past = null;

  function targetsFitting(width, height) {
    if (targets?.picture.width === width && targets.picture.height === height) return targets;
    Object.values(targets ?? {}).forEach((target) => target.destroy());
    const tiles = [Math.ceil(width / TILE_PIXELS), Math.ceil(height / TILE_PIXELS)];
    targets = {
      picture: createByteTarget(gl, width, height),
      velocity: createTarget(gl, Math.ceil(width * VELOCITY_SCALE), Math.ceil(height * VELOCITY_SCALE)),
      tiles: createTarget(gl, ...tiles),
      fastest: createTarget(gl, ...tiles),
    };
    gl.bindTexture(gl.TEXTURE_2D, targets.picture.texture);
    for (const side of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, side, gl.LINEAR);
    for (const side of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, side, gl.CLAMP_TO_EDGE);
    return targets;
  }

  function drawOver(target, program, textures, uniforms) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.useProgram(program.program);
    Object.entries(textures).forEach(([name, texture], i) => {
      gl.activeTexture(gl.TEXTURE0 + FIRST_TEXTURE_UNIT + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(program.uniforms[name], FIRST_TEXTURE_UNIT + i);
    });
    gl.activeTexture(gl.TEXTURE0);
    setUniforms(gl, program, uniforms);
    gl.bindVertexArray(emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function setMovedBodies(moved) {
    const shown = moved.slice(0, MAX_BODIES);
    const { uniforms } = velocityProgram;
    const pack = (value) => Float32Array.from(shown.flatMap(value));
    if (shown.length) {
      gl.uniform4fv(uniforms.uBlurredPlace, pack(({ offsetKm, distanceKm }) => [...scale(offsetKm, 1 / distanceKm), distanceKm]));
      gl.uniform4fv(uniforms.uBlurredShift, pack(({ body, shiftKm }) => [...shiftKm, body.radiusKm]));
      gl.uniform4fv(uniforms.uBlurredSpin, pack(({ spin }) => [...spin, 0]));
    }
    const ringed = shown.findIndex(({ body }) => body.rings);
    setUniforms(gl, velocityProgram, { uBlurredCount: { int: shown.length }, uBlurredRingBody: { int: ringed } });
    if (ringed >= 0) setUniforms(gl, velocityProgram, { uBlurredRing: [...shown[ringed].body.north, shown[ringed].body.radiusKm * RING_RADII] });
  }

  function planFor(now) {
    const before = past;
    past = now;
    if (!now || !before) return null;
    if (turnBetween(before.view.basis, now.view.basis) > CUT_RADIANS) return null;
    const groundShift = now.ground && before.ground?.name === now.ground.name ? subtract(now.ground.cameraLocalKm, before.ground.cameraLocalKm) : null;
    const moved = movedBodies(before.bodies, now.bodies);
    return {
      before,
      now,
      groundShift,
      moved,
      starShiftPc: subtract(now.view.camera, before.view.camera),
      needed: mostPixelsMoved(before, now, moved, groundShift) * SHUTTER_SHARE >= LEAST_MOTION_PIXELS,
    };
  }

  function apply({ before, now, groundShift, moved }, groundView, cockpit, { width, height }) {
    const { picture, velocity, tiles, fastest } = targetsFitting(width, height);
    const { view } = now;
    gl.useProgram(velocityProgram.program);
    setMovedBodies(groundShift ? moved.filter(({ body }) => body.name !== now.ground.name) : moved);
    gl.uniform4fv(velocityProgram.uniforms.uWindows, cockpit.windows);
    gl.uniform2fv(velocityProgram.uniforms.uStruts, cockpit.struts);
    const localBases = groundShift
      ? {
          uLocalRight: now.ground.local.right,
          uLocalUp: now.ground.local.up,
          uLocalForward: now.ground.local.forward,
          uPastLocalRight: before.ground.local.right,
          uPastLocalUp: before.ground.local.up,
          uPastLocalForward: before.ground.local.forward,
          uGroundShift: groundShift,
        }
      : {};
    drawOver(velocity, velocityProgram, { uGroundDepth: groundView?.ground ?? null, uCloudAlpha: groundView?.clouds ?? null, uCloudDepth: groundView?.cloudDepth ?? null }, {
      uRight: view.basis.right,
      uUp: view.basis.up,
      uForward: view.basis.forward,
      uTanHalf: view.tanHalf,
      uPixelAngle: view.pixelAngle,
      uPastRight: before.view.basis.right,
      uPastUp: before.view.basis.up,
      uPastForward: before.view.basis.forward,
      uPastTanHalf: before.view.tanHalf,
      uShipRight: now.ship.right,
      uShipUp: now.ship.up,
      uShipForward: now.ship.forward,
      uPastShipRight: before.ship.right,
      uPastShipUp: before.ship.up,
      uPastShipForward: before.ship.forward,
      uCockpit: cockpit.enabled ? 1 : 0,
      uShutter: 0,
      uSize: [width, height],
      uGroundShown: groundShift && groundView ? 1 : 0,
      uCloudsShown: groundView?.clouds ? 1 : 0,
      ...localBases,
    });
    drawOver(tiles, tileProgram, { uVelocity: velocity.textures[0] }, {});
    drawOver(fastest, spreadProgram, { uTiles: tiles.textures[0] }, {});
    drawOver({ framebuffer: null, width, height }, gatherProgram, { uPicture: picture.texture, uVelocity: velocity.textures[0], uFastest: fastest.textures[0] }, { uSize: [width, height] });
  }

  return { planFor, apply, pictureFitting: (width, height) => targetsFitting(width, height).picture };
}
