import {
  CRASH_SPEED,
  GRAVITATIONAL_CONSTANT,
  HOME_BODY,
  MAX_FUEL,
  ROCKET_HEIGHT,
  TICKS_PER_SECOND,
  WORMHOLE_EXIT_GAP,
} from './world.js';
import { bodies } from './universe.js';

// Bearings follow Scratch: 0 is world up, positive turns clockwise, unit vector (sin, cos).
export function bearingBetween(fromX, fromY, toX, toY) {
  return Math.atan2(toX - fromX, toY - fromY);
}

export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function sphereOfInfluence(x, y) {
  return bodies.findLast((body) => Math.hypot(x - body.x, y - body.y) <= body.soi) ?? null;
}

export function surfaceClearance(body) {
  return body.radius + ROCKET_HEIGHT / 2;
}

export function createRocket() {
  const rocket = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    throttle: 100,
    engineOn: false,
    fuel: MAX_FUEL,
    fuelCapacity: MAX_FUEL,
    thrust: 1,
    soi: HOME_BODY,
    landed: false,
    destroyed: false,
  };
  placeOnSurface(rocket, HOME_BODY, 0);
  return rocket;
}

export function placeOnSurface(rocket, body, bearing) {
  const clearance = surfaceClearance(body);
  rocket.x = body.x + Math.sin(bearing) * clearance;
  rocket.y = body.y + Math.cos(bearing) * clearance;
  rocket.vx = 0;
  rocket.vy = 0;
  rocket.heading = bearing;
  rocket.landed = true;
}

function passThroughWormhole(rocket, mouth) {
  const { exit } = mouth;
  const bearing = bearingBetween(mouth.x, mouth.y, rocket.x, rocket.y);
  const distance = exit.radius + WORMHOLE_EXIT_GAP;
  rocket.x = exit.x + Math.sin(bearing) * distance;
  rocket.y = exit.y + Math.cos(bearing) * distance;
  rocket.heading = bearing;
  rocket.vx = -rocket.vx;
  rocket.vy = -rocket.vy;
}

function touchDown(rocket, body) {
  if (body.kind === 'wormhole') {
    passThroughWormhole(rocket, body);
    return 'wormhole';
  }
  if (body.kind === 'star' || Math.hypot(rocket.vx, rocket.vy) > CRASH_SPEED) {
    rocket.destroyed = true;
    rocket.engineOn = false;
    return 'crash';
  }
  placeOnSurface(rocket, body, bearingBetween(body.x, body.y, rocket.x, rocket.y));
  return 'land';
}

function burnEngine(rocket, dt) {
  if (!rocket.engineOn) return;
  if (rocket.fuel <= 0) {
    rocket.engineOn = false;
    return;
  }
  const push = (rocket.throttle / 100) * rocket.thrust * dt;
  rocket.vx += Math.sin(rocket.heading) * push;
  rocket.vy += Math.cos(rocket.heading) * push;
  rocket.fuel = Math.max(0, rocket.fuel - (rocket.throttle / 100) * (dt / TICKS_PER_SECOND));
}

// One symplectic Euler step (move, then pull) in ticks; returns what the rocket hit, if anything.
export function advance(rocket, dt) {
  if (rocket.destroyed) return null;
  rocket.soi = sphereOfInfluence(rocket.x, rocket.y);
  burnEngine(rocket, dt);
  rocket.x += rocket.vx * dt;
  rocket.y += rocket.vy * dt;
  rocket.landed = false;
  const body = rocket.soi;
  if (!body) return null;

  const dx = body.x - rocket.x;
  const dy = body.y - rocket.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= surfaceClearance(body)) return touchDown(rocket, body);

  const pull = (GRAVITATIONAL_CONSTANT * body.mass) / (distance * distance);
  rocket.vx += (dx / distance) * pull * dt;
  rocket.vy += (dy / distance) * pull * dt;
  return null;
}

export function altitude(rocket) {
  const body = rocket.soi;
  if (!body) return null;
  return Math.max(0, Math.hypot(rocket.x - body.x, rocket.y - body.y) - surfaceClearance(body));
}

// Coasting forecast: a list of polyline segments (split at wormholes) and where it ends.
export function forecast(rocket, steps, dt) {
  const ghost = { ...rocket, engineOn: false };
  const segments = [[ghost.x, ghost.y]];
  let ending = null;
  for (let i = 0; i < steps && !ending; i++) {
    const hit = advance(ghost, dt);
    if (hit === 'wormhole') segments.push([]);
    else if (hit) ending = { kind: hit, x: ghost.x, y: ghost.y };
    segments[segments.length - 1].push(ghost.x, ghost.y);
  }
  return { segments, ending };
}
