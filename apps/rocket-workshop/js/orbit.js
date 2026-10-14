import { BODIES, bodyState, dominantBody } from './planets.js';

const PATH_STEPS = 2000;
const UNBOUND_HORIZON_SECONDS = 2 * 86400;
const MAX_HORIZON_SECONDS = 6 * 86400;
const SUBORBITAL_HORIZON_SECONDS = 1200;

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

export function orbitAltitudes(position, velocity, time) {
  const body = dominantBody(position.x, position.y, time);
  const center = bodyState(body, time);
  const shape = orbitShape(body, position.x - center.x, position.y - center.y, velocity.x - center.vx, velocity.y - center.vy);
  const periapsis = shape.semiLatusRectum / (1 + shape.eccentricity) - body.radius;
  const apoapsis = shape.semiMajorAxis === Infinity ? null : shape.semiLatusRectum / (1 - shape.eccentricity) - body.radius;
  return { apoapsis, periapsis };
}

export function predictPath(position, velocity, time) {
  const body = dominantBody(position.x, position.y, time);
  const start = bodyState(body, time);
  const shape = orbitShape(body, position.x - start.x, position.y - start.y, velocity.x - start.vx, velocity.y - start.vy);
  const bound = shape.semiMajorAxis !== Infinity;
  const periapsis = shape.semiLatusRectum / (1 + shape.eccentricity);
  const apoapsis = bound ? shape.semiLatusRectum / (1 - shape.eccentricity) : null;
  const period = bound ? 2 * Math.PI * Math.sqrt(shape.semiMajorAxis ** 3 / body.mu) : null;
  const suborbital = periapsis < body.radius;
  const naturalHorizon = bound ? Math.min(period, MAX_HORIZON_SECONDS) : UNBOUND_HORIZON_SECONDS;
  const horizon = suborbital ? Math.min(naturalHorizon, SUBORBITAL_HORIZON_SECONDS) : naturalHorizon;
  const dt = horizon / PATH_STEPS;

  let { x, y } = position;
  let vx = velocity.x;
  let vy = velocity.y;
  let t = time;
  let { ax, ay } = accelerationAt(x, y, t);
  const points = [];
  let impact = null;
  for (let step = 0; step <= PATH_STEPS; step += 1) {
    const anchor = bodyState(body, t);
    points.push({ x: x - anchor.x + start.x, y: y - anchor.y + start.y });
    if (step > 0 && surfaceHit(x, y, t)) {
      impact = points[points.length - 1];
      break;
    }
    vx += ax * dt * 0.5;
    vy += ay * dt * 0.5;
    x += vx * dt;
    y += vy * dt;
    t += dt;
    ({ ax, ay } = accelerationAt(x, y, t));
    vx += ax * dt * 0.5;
    vy += ay * dt * 0.5;
  }

  const along = (distance) => ({ x: start.x + shape.toPeriapsis.x * distance, y: start.y + shape.toPeriapsis.y * distance });
  return {
    body,
    points,
    impact,
    period,
    periapsis: { altitude: periapsis - body.radius, at: along(periapsis) },
    apoapsis: apoapsis === null ? null : { altitude: apoapsis - body.radius, at: along(-apoapsis) },
  };
}
