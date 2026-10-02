import { add, dot, range, scale } from './vec.js';
import { box } from './shapes.js';

export const Y = 1;
export const RIGHT = 0;
export const UP = 1;
export const ANA = 2;
export const PLAYER_HALF_WIDTH = 0.25;
export const PLAYER_HEIGHT = 0.9;
export const RESPAWN_BELOW_Y = -8;

const WALK_SPEED = 3;
const FLY_SPEED = 3;
const TURN_SPEED = 1.1;
const GRAVITY = 18;
const JUMP_SPEED = 7.4;
const MAX_FALL_SPEED = 15;

export const GOAL_LABEL = 'goal';
const PLATFORM_HUE_START = 85;
const PLATFORM_HUE_SPAN = 290;

function buildWorld(layout) {
  const { n } = layout;
  const floor = box(layout.floor.center, layout.floor.half, { isFloor: true });
  const ordinaryCount = layout.platforms.filter(p => !p.goal).length;
  let platformNumber = 0;
  const platforms = layout.platforms.map(p => {
    if (p.goal) return box(p.center, p.half, { isGoal: true, label: GOAL_LABEL });
    const hue = Math.round(PLATFORM_HUE_START + platformNumber * PLATFORM_HUE_SPAN / ordinaryCount) % 360;
    return box(p.center, p.half, { hue, label: String(++platformNumber) });
  });
  const axes = range(n);
  return {
    n,
    floor,
    platforms,
    solids: [floor, ...platforms],
    start: layout.start,
    axes,
    horizontalAxes: axes.filter(axis => axis !== Y),
    forward: n - 1,
    hasAna: n === 4,
    hasGoal: platforms.some(p => p.isGoal),
  };
}

function levelBasis(n) {
  const basis = range(n).map(i => range(n).map(j => (i === j ? 1 : 0)));
  if (n === 4) [basis[ANA], basis[3]] = [[0, 0, 0, 1], [0, 0, 1, 0]];
  return basis;
}

export function createGame(layout) {
  const game = { world: buildWorld(layout), player: {}, falls: 0, landedOn: new Set(), reachedGoal: false };
  respawn(game);
  return game;
}

export function respawn({ world, player }) {
  player.feet = [...world.start];
  player.verticalSpeed = 0;
  player.grounded = false;
  player.basis = levelBasis(world.n);
}

export function playerBox({ player }) {
  return {
    min: player.feet.map((v, axis) => (axis === Y ? v : v - PLAYER_HALF_WIDTH)),
    max: player.feet.map((v, axis) => (axis === Y ? v + PLAYER_HEIGHT : v + PLAYER_HALF_WIDTH)),
  };
}

const overlaps = (world, a, b) => world.axes.every(axis => a.min[axis] < b.max[axis] && a.max[axis] > b.min[axis]);

function rotateBasis(basis, i, j, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const a = basis[i];
  const b = basis[j];
  basis[i] = a.map((v, k) => c * v + s * b[k]);
  basis[j] = b.map((v, k) => -s * a[k] + c * v);
}

function reorthonormalize(basis) {
  for (let i = 0; i < basis.length; i++) {
    for (let j = 0; j < i; j++) {
      const overlap = dot(basis[i], basis[j]);
      basis[i] = basis[i].map((v, k) => v - overlap * basis[j][k]);
    }
    const length = Math.hypot(...basis[i]);
    basis[i] = basis[i].map(v => v / length);
  }
}

export function turn({ world, player }, input, dt) {
  const F = world.forward;
  if (input.turnRight) rotateBasis(player.basis, F, RIGHT, input.turnRight * TURN_SPEED * dt);
  if (world.hasAna) {
    if (input.turnAna) rotateBasis(player.basis, F, ANA, input.turnAna * TURN_SPEED * dt);
    if (input.spin) rotateBasis(player.basis, RIGHT, ANA, input.spin * TURN_SPEED * dt);
  }
  reorthonormalize(player.basis);
}

function wishDirection({ world, player }, input) {
  const P = player.basis;
  let direction = add(scale(P[world.forward], input.forward), scale(P[RIGHT], input.right));
  if (world.hasAna) direction = add(direction, scale(P[ANA], input.ana));
  const length = Math.hypot(...direction);
  return length > 1 ? scale(direction, 1 / length) : direction;
}

function fly(game, input, dt) {
  const { player } = game;
  const move = add(wishDirection(game, input), scale(player.basis[UP], input.vertical));
  player.feet = add(player.feet, scale(move, FLY_SPEED * dt));
  player.verticalSpeed = 0;
  player.grounded = false;
}

function walk(game, input, dt) {
  const { world, player } = game;
  if (player.grounded && input.jump) player.verticalSpeed = JUMP_SPEED;
  player.verticalSpeed = Math.max(player.verticalSpeed - GRAVITY * dt, -MAX_FALL_SPEED);
  const delta = scale(wishDirection(game, input), WALK_SPEED * dt);
  delta[Y] = player.verticalSpeed * dt;
  player.grounded = false;

  for (const axis of [Y, ...world.horizontalAxes]) {
    if (!delta[axis]) continue;
    player.feet[axis] += delta[axis];
    const hit = world.solids.find(solid => overlaps(world, playerBox(game), solid));
    if (!hit) continue;
    if (axis !== Y) {
      player.feet[axis] -= delta[axis];
      continue;
    }
    if (delta[Y] < 0) {
      player.feet[Y] = hit.max[Y];
      player.grounded = true;
      if (hit.isGoal) game.reachedGoal = true;
      else if (hit.label) game.landedOn.add(hit.label);
    } else {
      player.feet[Y] = hit.min[Y] - PLAYER_HEIGHT;
    }
    player.verticalSpeed = 0;
  }

  if (player.feet[Y] < RESPAWN_BELOW_Y) {
    game.falls++;
    respawn(game);
  }
}

export function stepPhysics(game, input, dt, flying) {
  (flying ? fly : walk)(game, input, dt);
}

export function surfaceBelow(world, point) {
  const containsHorizontally = solid => world.horizontalAxes.every(axis => point[axis] >= solid.min[axis] && point[axis] <= solid.max[axis]);
  const candidates = world.solids.filter(solid => solid.max[Y] <= point[Y] + 1e-6 && containsHorizontally(solid));
  if (!candidates.length) return null;
  return candidates.reduce((best, solid) => (solid.max[Y] > best.max[Y] ? solid : best));
}
