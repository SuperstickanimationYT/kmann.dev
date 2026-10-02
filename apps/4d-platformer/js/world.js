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

const FLOOR_4D = { center: [0, -0.25, 2, 0], half: [7, 0.25, 7, 7] };
const PLATFORMS_4D = [
  { center: [-2, 0.6, 1, -2], half: [0.8, 0.15, 0.8, 0.8] },
  { center: [2, 1.0, 2, 1], half: [0.7, 0.15, 0.9, 0.7] },
  { center: [0, 1.6, 4, 0], half: [1.0, 0.15, 0.6, 1.0] },
  { center: [-3, 2.2, 5, 3], half: [0.8, 0.15, 0.8, 0.6] },
  { center: [3, 2.6, 6, -3], half: [0.6, 0.15, 0.6, 0.9] },
  { center: [0, 3.0, 7, 4], half: [0.9, 0.15, 0.7, 0.7] },
  { center: [-1, 0.9, 3, 4], half: [0.6, 0.15, 0.6, 0.6] },
  { center: [1, 1.9, 1, -4], half: [0.7, 0.15, 0.7, 0.7] },
  { center: [4, 0.5, 4, 2], half: [0.8, 0.15, 0.8, 0.8] },
  { center: [-4, 1.3, 7, -1], half: [0.7, 0.15, 0.9, 0.7] },
];
const START_FEET_4D = [0, 0, -3.5, 0];

function buildWorld(n) {
  const dropExtraAxes = v => v.slice(0, n);
  const floor = box(dropExtraAxes(FLOOR_4D.center), dropExtraAxes(FLOOR_4D.half), { isFloor: true });
  const platforms = PLATFORMS_4D.map((p, i) => box(dropExtraAxes(p.center), dropExtraAxes(p.half), {
    hue: Math.round(i * 360 / PLATFORMS_4D.length),
    label: String(i + 1),
  }));
  const axes = range(n);
  return {
    n,
    floor,
    platforms,
    solids: [floor, ...platforms],
    start: dropExtraAxes(START_FEET_4D),
    axes,
    horizontalAxes: axes.filter(axis => axis !== Y),
    forward: n - 1,
    hasAna: n === 4,
  };
}

function levelBasis(n) {
  const basis = range(n).map(i => range(n).map(j => (i === j ? 1 : 0)));
  if (n === 4) [basis[ANA], basis[3]] = [[0, 0, 0, 1], [0, 0, 1, 0]];
  return basis;
}

export function createGame(n) {
  const game = { world: buildWorld(n), player: {}, falls: 0, landedOn: new Set() };
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
      if (hit.label) game.landedOn.add(hit.label);
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
