import { bearingBetween, surfaceClearance } from './physics.js';
import { GRAVITATIONAL_CONSTANT } from './world.js';

const TOUCHDOWN_SHARE_OF_SAFE_SPEED = 0.5;
const BRAKING_SAFETY = 0.6;
const WEAKEST_BRAKING_SHARE = 0.1;
const TAKE_OVER_AT_SHARE_OF_LIMIT = 0.9;

function descentSpeedLimit(rocket, body) {
  const height = Math.max(0, Math.hypot(rocket.x - body.x, rocket.y - body.y) - surfaceClearance(body));
  const surfacePull = (GRAVITATIONAL_CONSTANT * body.mass) / body.radius ** 2;
  const braking = Math.max(rocket.thrust - surfacePull, rocket.thrust * WEAKEST_BRAKING_SHARE);
  return rocket.crashSpeed * TOUCHDOWN_SHARE_OF_SAFE_SPEED + Math.sqrt(2 * braking * BRAKING_SAFETY * height);
}

const speedOf = (rocket) => Math.hypot(rocket.vx, rocket.vy);

export const mustTakeOver = (rocket, body) => speedOf(rocket) > descentSpeedLimit(rocket, body) * TAKE_OVER_AT_SHARE_OF_LIMIT;

export function flyDescent(rocket, body) {
  rocket.heading = bearingBetween(0, 0, -rocket.vx, -rocket.vy);
  rocket.throttle = 100;
  rocket.engineOn = rocket.fuel > 0 && speedOf(rocket) > descentSpeedLimit(rocket, body);
}
