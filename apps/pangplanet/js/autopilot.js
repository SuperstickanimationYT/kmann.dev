import { bearingBetween, surfaceClearance, wrapAngle } from './physics.js';
import { GRAVITATIONAL_CONSTANT } from './world.js';

const TOUCHDOWN_SHARE_OF_SAFE_SPEED = 0.5;
const BRAKING_SAFETY = 0.6;
const WEAKEST_BRAKING_SHARE = 0.1;
const TAKE_OVER_AT_SHARE_OF_LIMIT = 0.9;
const AIM_SHARE_OF_LIMIT = 0.8;
const FULL_THROTTLE_OVERSPEED_SHARE_OF_SAFE_SPEED = 0.3;
const BURN_ALIGNMENT = (20 * Math.PI) / 180;

const heightAbove = (rocket, body) => Math.max(0, Math.hypot(rocket.x - body.x, rocket.y - body.y) - surfaceClearance(body));

function descentSpeedLimit(rocket, body, height = heightAbove(rocket, body)) {
  const surfacePull = (GRAVITATIONAL_CONSTANT * body.mass) / body.radius ** 2;
  const braking = Math.max(rocket.thrust - surfacePull, rocket.thrust * WEAKEST_BRAKING_SHARE);
  return rocket.crashSpeed * TOUCHDOWN_SHARE_OF_SAFE_SPEED + Math.sqrt(2 * braking * BRAKING_SAFETY * height);
}

const speedOf = (rocket) => Math.hypot(rocket.vx, rocket.vy);

const clampMagnitude = (value, limit) => Math.max(-limit, Math.min(limit, value));

const retrogradeOf = (rocket) => bearingBetween(0, 0, -rocket.vx, -rocket.vy);

function heightOnceTurned(rocket, body, turn, stepTicks) {
  const turnTicks = (Math.abs(wrapAngle(retrogradeOf(rocket) - rocket.heading)) / turn) * stepTicks;
  return heightAbove(rocket, body) - speedOf(rocket) * turnTicks;
}

export const mustTakeOver = (rocket, body, { turn, stepTicks }) =>
  speedOf(rocket) > descentSpeedLimit(rocket, body, Math.max(0, heightOnceTurned(rocket, body, turn, stepTicks))) * TAKE_OVER_AT_SHARE_OF_LIMIT;

function wantedThrottle(rocket, body) {
  const overspeed = speedOf(rocket) - descentSpeedLimit(rocket, body) * AIM_SHARE_OF_LIMIT;
  const fullThrottleOverspeed = rocket.crashSpeed * FULL_THROTTLE_OVERSPEED_SHARE_OF_SAFE_SPEED;
  return Math.max(0, Math.min(100, (overspeed / fullThrottleOverspeed) * 100));
}

export function flyDescent(rocket, body, { turn, throttleChange }) {
  const retrograde = retrogradeOf(rocket);
  const offRetrograde = wrapAngle(retrograde - rocket.heading);
  rocket.heading += clampMagnitude(offRetrograde, turn);
  const aligned = Math.abs(wrapAngle(retrograde - rocket.heading)) <= BURN_ALIGNMENT;
  const target = aligned ? wantedThrottle(rocket, body) : 0;
  rocket.throttle += clampMagnitude(target - rocket.throttle, throttleChange);
  rocket.engineOn = rocket.fuel > 0 && rocket.throttle > 0;
}
