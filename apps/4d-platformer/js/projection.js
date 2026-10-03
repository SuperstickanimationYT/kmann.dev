import { add, dot, lerpPoint, scale, sub } from './vec.js';
import { boxSegments } from './shapes.js';
import { platformStyle } from './paint.js';
import { playerBox, RESPAWN_BELOW_Y, surfaceBelow, UP, Y } from './world.js';

export const FOV_HALF_ANGLE_TAN = 1;
export const LINE_SUBDIVISIONS = 4;
export const VOID_HUE = 0;

const NEAR = 0.05;
const CHASE_DISTANCE = 3.5;
const CHASE_HEIGHT_ABOVE_FEET = 1.8;
const CHASE_PITCH = 20 * Math.PI / 180;
const EYE_HEIGHT_ABOVE_FEET = 1.3;
const EYE_PITCH = 15 * Math.PI / 180;
const DROP_MARKER_ARM = 0.35;

function pitchedDown(basis, F, pitch) {
  const pitched = [...basis];
  pitched[F] = add(scale(basis[F], Math.cos(pitch)), scale(basis[UP], -Math.sin(pitch)));
  pitched[UP] = add(scale(basis[F], Math.sin(pitch)), scale(basis[UP], Math.cos(pitch)));
  return pitched;
}

export function chaseCamera({ world, player }) {
  const P = player.basis;
  const F = world.forward;
  if (world.eyeView) return { position: add(player.feet, scale(P[UP], EYE_HEIGHT_ABOVE_FEET)), basis: pitchedDown(P, F, EYE_PITCH) };
  const position = add(add(player.feet, scale(P[UP], CHASE_HEIGHT_ABOVE_FEET)), scale(P[F], -CHASE_DISTANCE));
  return { position, basis: pitchedDown(P, F, CHASE_PITCH) };
}

export function dropLine({ world, player }) {
  const surface = surfaceBelow(world, player.feet);
  const landing = [...player.feet];
  landing[Y] = surface ? surface.max[Y] : RESPAWN_BELOW_Y;
  return { from: player.feet, to: landing, overSurface: Boolean(surface) };
}

function sceneSegments(game, settings) {
  const { world } = game;
  const segments = [];
  const addAll = (pairs, style) => pairs.forEach(([a, b]) => segments.push({ a, b, style }));
  if (settings.floor && world.floor) addAll(world.floor.segments, { kind: 'floor' });
  if (world.goalZone) addAll(world.goalZone.segments, { kind: 'goal' });
  addAll(world.outline, { kind: 'wall' });
  world.platforms.forEach(p => addAll(p.segments, platformStyle(p)));
  if (!world.eyeView) {
    const { min, max } = playerBox(game);
    const bodyCenter = min.map((v, axis) => (v + max[axis]) / 2);
    const bodyHalf = min.map((v, axis) => (max[axis] - v) / 2);
    addAll(boxSegments(bodyCenter, bodyHalf), { kind: 'player' });
  }

  if (settings.dropLine) {
    const { from, to, overSurface } = dropLine(game);
    const style = overSurface ? { kind: 'player' } : { kind: 'drop', hue: VOID_HUE };
    segments.push({ a: from, b: to, style });
    for (const axis of world.horizontalAxes) {
      const arm = to.map(() => 0);
      arm[axis] = DROP_MARKER_ARM;
      segments.push({ a: sub(to, arm), b: add(to, arm), style });
    }
  }
  return segments;
}

function frustumPlanes(world) {
  const F = world.forward;
  const planes = [c => c[F] - NEAR];
  for (let i = 0; i < F; i++) {
    planes.push(c => FOV_HALF_ANGLE_TAN * c[F] - c[i], c => FOV_HALF_ANGLE_TAN * c[F] + c[i]);
  }
  return planes;
}

function clipToFrustum(planes, a, b) {
  let t0 = 0;
  let t1 = 1;
  for (const plane of planes) {
    const ga = plane(a);
    const gb = plane(b);
    if (ga < 0 && gb < 0) return null;
    if (ga < 0) t0 = Math.max(t0, ga / (ga - gb));
    else if (gb < 0) t1 = Math.min(t1, ga / (ga - gb));
  }
  if (t0 > t1) return null;
  return [lerpPoint(a, b, t0), lerpPoint(a, b, t1)];
}

const toCameraFrame = (camera, point) => camera.basis.map(e => dot(sub(point, camera.position), e));
const projectToRetina = c => c.slice(0, -1).map(v => v / c[c.length - 1] / FOV_HALF_ANGLE_TAN);

export function retinaSegments(game, camera, settings) {
  const planes = frustumPlanes(game.world);
  const pieces = [];
  for (const { a, b, style } of sceneSegments(game, settings)) {
    const clipped = clipToFrustum(planes, toCameraFrame(camera, a), toCameraFrame(camera, b));
    if (!clipped) continue;
    const ra = projectToRetina(clipped[0]);
    const rb = projectToRetina(clipped[1]);
    for (let i = 0; i < LINE_SUBDIVISIONS; i++) {
      pieces.push({
        ra: lerpPoint(ra, rb, i / LINE_SUBDIVISIONS),
        rb: lerpPoint(ra, rb, (i + 1) / LINE_SUBDIVISIONS),
        style,
      });
    }
  }
  return pieces;
}

export function retinaPoint(game, camera, point) {
  const c = toCameraFrame(camera, point);
  return frustumPlanes(game.world).every(plane => plane(c) >= 0) ? projectToRetina(c) : null;
}

function topOf(platform) {
  const top = [...platform.center];
  top[Y] = platform.max[Y];
  return top;
}

export function visiblePlatformCenters(game, camera) {
  return game.world.platforms
    .filter(platform => platform.marked)
    .map(platform => ({ platform, r: retinaPoint(game, camera, topOf(platform)) }))
    .filter(({ r }) => r);
}
