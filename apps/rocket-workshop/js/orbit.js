import { BODIES, bodyState, dominantBody } from './planets.js';

const MOST_POINTS = 4000;
const UNBOUND_HORIZON_SECONDS = 365 * 86400;
const MAX_HORIZON_SECONDS = 50 * 365 * 86400;
const STEP_SHARE_OF_ORBIT = 0.02;
const SHORTEST_STEP_SECONDS = 0.05;
const LOWEST_STEP_ALTITUDE = 50;

function orbitShape(body, rx, ry, vx, vy) {
  const r = Math.hypot(rx, ry);
  const energy = (vx * vx + vy * vy) / 2 - body.mu / r;
  const angularMomentum = rx * vy - ry * vx;
  const ex = (vy * angularMomentum) / body.mu - rx / r;
  const ey = (-vx * angularMomentum) / body.mu - ry / r;
  const eccentricity = Math.hypot(ex, ey);
  const semiMajorAxis = energy < 0 ? -body.mu / (2 * energy) : Infinity;
  const toPeriapsis = eccentricity > 1e-9 ? { x: ex / eccentricity, y: ey / eccentricity } : { x: rx / r, y: ry / r };
  const semiLatusRectum = angularMomentum ** 2 / body.mu;
  return { eccentricity, semiMajorAxis, semiLatusRectum, toPeriapsis };
}

export function accelerationAt(x, y, time) {
  let ax = 0;
  let ay = 0;
  for (const body of BODIES) {
    const state = bodyState(body, time);
    const dx = state.x - x;
    const dy = state.y - y;
    const r2 = dx * dx + dy * dy;
    const pull = body.mu / (r2 * Math.sqrt(r2));
    ax += dx * pull;
    ay += dy * pull;
  }
  return { ax, ay };
}

function surfaceHit(x, y, time) {
  return BODIES.some((body) => {
    const state = bodyState(body, time);
    return Math.hypot(x - state.x, y - state.y) < body.radius;
  });
}

function stepLength(x, y, vx, vy, time, left) {
  const near = dominantBody(x, y, time);
  const state = bodyState(near, time);
  const distance = Math.hypot(x - state.x, y - state.y);
  const altitude = Math.max(LOWEST_STEP_ALTITUDE, distance - near.radius);
  const speed = Math.max(1e-3, Math.hypot(vx - state.vx, vy - state.vy));
  return Math.min(left, Math.max(SHORTEST_STEP_SECONDS, (STEP_SHARE_OF_ORBIT * Math.min(distance, altitude)) / speed));
}

export function orbitAltitudes(position, velocity, time) {
  const body = dominantBody(position.x, position.y, time);
  const center = bodyState(body, time);
  const shape = orbitShape(body, position.x - center.x, position.y - center.y, velocity.x - center.vx, velocity.y - center.vy);
  const periapsis = shape.semiLatusRectum / (1 + shape.eccentricity) - body.radius;
  const apoapsis = shape.semiMajorAxis === Infinity ? null : shape.semiMajorAxis * (1 + shape.eccentricity) - body.radius;
  return { apoapsis, periapsis };
}

export function predictPath(position, velocity, time) {
  const body = dominantBody(position.x, position.y, time);
  const start = bodyState(body, time);
  const shape = orbitShape(body, position.x - start.x, position.y - start.y, velocity.x - start.vx, velocity.y - start.vy);
  const bound = shape.semiMajorAxis !== Infinity;
  const periapsis = shape.semiLatusRectum / (1 + shape.eccentricity);
  const apoapsis = bound ? shape.semiMajorAxis * (1 + shape.eccentricity) : null;
  const period = bound ? 2 * Math.PI * Math.sqrt(shape.semiMajorAxis ** 3 / body.mu) : null;
  const horizon = bound ? Math.min(period, MAX_HORIZON_SECONDS) : UNBOUND_HORIZON_SECONDS;

  let { x, y } = position;
  let vx = velocity.x;
  let vy = velocity.y;
  let t = time;
  const points = [];
  let impact = null;
  while (t < time + horizon && points.length < MOST_POINTS) {
    const anchor = bodyState(body, t);
    points.push({ x: x - anchor.x, y: y - anchor.y });
    if (points.length > 1 && surfaceHit(x, y, t)) {
      impact = points[points.length - 1];
      break;
    }
    const dt = stepLength(x, y, vx, vy, t, time + horizon - t);
    let pull = accelerationAt(x, y, t);
    vx += pull.ax * dt * 0.5;
    vy += pull.ay * dt * 0.5;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    pull = accelerationAt(x, y, t);
    vx += pull.ax * dt * 0.5;
    vy += pull.ay * dt * 0.5;
  }

  const along = (distance) => ({ x: shape.toPeriapsis.x * distance, y: shape.toPeriapsis.y * distance });
  return {
    body,
    points,
    impact,
    period,
    periapsis: { altitude: periapsis - body.radius, at: along(periapsis) },
    apoapsis: apoapsis === null ? null : { altitude: apoapsis - body.radius, at: along(-apoapsis) },
  };
}
