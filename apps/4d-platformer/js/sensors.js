import { add, normalize, scale } from './vec.js';
import { ANA, PLAYER_HEIGHT, RIGHT, UP } from './world.js';

export const SENSOR_RANGE = 6.5;

const AXIS_DIRECTIONS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIAGONAL_DIRECTIONS = [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].map(c => normalize([a, b, c]))));
export const SENSOR_DIRECTIONS = [...AXIS_DIRECTIONS, ...DIAGONAL_DIRECTIONS];

export function sensorFrame({ world, player }) {
  const P = player.basis;
  const second = world.n === 4 ? ANA : UP;
  return {
    origin: add(player.feet, scale(P[UP], PLAYER_HEIGHT / 2)),
    axes: [P[RIGHT], P[second], P[world.forward]],
    names: world.n === 4 ? ['right', 'ana', 'forward'] : ['right', 'up', 'forward'],
    oppositeNames: world.n === 4 ? ['left', 'kata', 'back'] : ['left', 'down', 'back'],
  };
}

export const worldDirection = (frame, sensorDirection) => sensorDirection.reduce((sum, s, k) => add(sum, scale(frame.axes[k], s)), frame.origin.map(() => 0));

const MISSED = { distance: Infinity, faceAxis: null };

function entry(origin, direction, { min, max }) {
  let near = 0;
  let far = Infinity;
  let faceAxis = null;
  for (let axis = 0; axis < origin.length; axis++) {
    if (Math.abs(direction[axis]) < 1e-9) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return MISSED;
      continue;
    }
    const t1 = (min[axis] - origin[axis]) / direction[axis];
    const t2 = (max[axis] - origin[axis]) / direction[axis];
    if (Math.min(t1, t2) > near) [near, faceAxis] = [Math.min(t1, t2), axis];
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return MISSED;
  }
  return { distance: near, faceAxis };
}

function nearestHit(world, origin, direction) {
  let hit = { distance: SENSOR_RANGE, kind: 'nothing', faceAxis: null };
  const consider = (target, kind) => {
    const { distance, faceAxis } = entry(origin, direction, target);
    if (distance < hit.distance) hit = { distance, kind, faceAxis };
  };
  world.solids.forEach(solid => consider(solid, 'wall'));
  if (world.goalZone) consider(world.goalZone, 'goal');
  return hit;
}

export function readSensors(game) {
  const frame = sensorFrame(game);
  const readings = SENSOR_DIRECTIONS.map(sensorDirection => {
    const direction = worldDirection(frame, sensorDirection);
    const { distance, kind, faceAxis } = nearestHit(game.world, frame.origin, direction);
    const hitPoint = add(frame.origin, scale(direction, distance));
    return { sensorDirection, direction, distance, kind, faceAxis, hitPoint, nearness: 1 - distance / SENSOR_RANGE };
  });
  return { frame, readings };
}
