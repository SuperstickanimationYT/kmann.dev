import { EARTH, gravitationalParameter, lowOrbitRadius } from './bodies.js';
import { STANDARD_GRAVITY } from './parts.js';

const STEP = 0.05;
const TIME_LIMIT = 3600;
const DRAG_COEFFICIENT = 0.5;
const PERIAPSIS_MARGIN = 1000;
const TURN_END_HEIGHTS = [6000, 10000, 15000, 20000, 27000, 35000, 45000, 60000];
const TURN_SHAPES = [0.4, 0.6, 0.8];

class Engines {
  constructor(burns) {
    this.burns = burns.map((b) => ({ ...b, flow: (b.startMass - b.endMass) / b.seconds }));
    this.index = 0;
    this.elapsed = 0;
    this.restMass = burns.length ? burns[burns.length - 1].endMass : 0;
  }

  get current() {
    return this.burns[this.index] ?? null;
  }

  mass() {
    const burn = this.current;
    return burn ? burn.startMass - burn.flow * this.elapsed : this.restMass;
  }

  thrust() {
    return this.current?.thrust ?? 0;
  }

  frontalWidth() {
    return (this.current ?? this.burns[this.burns.length - 1])?.frontalWidth ?? 2;
  }

  burn(seconds) {
    let left = seconds;
    while (left > 0 && this.current) {
      const step = Math.min(left, this.current.seconds - this.elapsed);
      this.elapsed += step;
      left -= step;
      if (this.elapsed >= this.current.seconds - 1e-9) {
        this.index++;
        this.elapsed = 0;
      }
    }
  }
}

function airDensity(height) {
  const { height: top, density, curve } = EARTH.atmosphere;
  return height >= top ? 0 : density * Math.exp((-curve * height) / top);
}

function orbitOf(mu, x, y, vx, vy) {
  const r = Math.hypot(x, y);
  const speedSquared = vx * vx + vy * vy;
  const energy = speedSquared / 2 - mu / r;
  const angularMomentum = x * vy - y * vx;
  const eccentricity = Math.sqrt(Math.max(0, 1 + (2 * energy * angularMomentum * angularMomentum) / (mu * mu)));
  if (energy >= 0) return { energy, apoapsis: Infinity, periapsis: (angularMomentum * angularMomentum) / mu / (1 + eccentricity) };
  const semiMajorAxis = -mu / (2 * energy);
  return { energy, semiMajorAxis, apoapsis: semiMajorAxis * (1 + eccentricity), periapsis: semiMajorAxis * (1 - eccentricity) };
}

function fly(burns, turnEndHeight, turnShape) {
  const mu = gravitationalParameter(EARTH);
  const radius = EARTH.radius;
  const airTop = radius + EARTH.atmosphere.height;
  const target = lowOrbitRadius(EARTH);
  const engines = new Engines(burns);

  let x = 0;
  let y = radius;
  let vx = 0;
  let vy = 0;
  let time = 0;
  let spent = 0;
  let dragLoss = 0;
  let maxHeight = 0;
  let phase = 'climb';

  const finish = (outcome) => {
    const orbit = orbitOf(mu, x, y, vx, vy);
    return { ...outcome, turnEndHeight, turnShape, spent, dragLoss, time, maxHeight, orbit, speed: Math.hypot(vx, vy), radius: Math.hypot(x, y) };
  };

  while (time < TIME_LIMIT) {
    const r = Math.hypot(x, y);
    const height = r - radius;
    maxHeight = Math.max(maxHeight, height);
    const upX = x / r;
    const upY = y / r;
    const eastX = upY;
    const eastY = -upX;
    const climbSpeed = vx * upX + vy * upY;
    const orbit = orbitOf(mu, x, y, vx, vy);
    const mass = engines.mass();
    const thrust = engines.thrust();

    if (phase === 'climb' && orbit.apoapsis >= target) phase = 'coast';
    if (phase === 'coast' && orbit.apoapsis < target - 500 && r < airTop) phase = 'climb';
    if (phase === 'coast') {
      const apoapsisSpeed = Math.sqrt(Math.max(0, mu * (2 / orbit.apoapsis - 1 / orbit.semiMajorAxis)));
      const needed = Math.sqrt(mu / orbit.apoapsis) - apoapsisSpeed;
      const burnTime = thrust > 0 ? (needed * mass) / (thrust * STANDARD_GRAVITY) : Infinity;
      const timeToApoapsis = climbSpeed / (mu / (r * r));
      if (r >= airTop && timeToApoapsis <= burnTime / 2) phase = 'circularise';
    }
    if (phase === 'circularise' && orbit.periapsis >= airTop + PERIAPSIS_MARGIN) return finish({ reached: true });

    let thrustX = 0;
    let thrustY = 0;
    if (phase !== 'coast') {
      if (!engines.current) return finish({ reached: false, reason: 'fuel' });
      let pitch = phase === 'climb' ? (Math.PI / 2) * Math.min(1, Math.max(0, height) / turnEndHeight) ** turnShape : Math.PI / 2;
      if (phase === 'circularise' && climbSpeed < 0) pitch = Math.PI / 2 - Math.min(0.5, (-climbSpeed / 200) * 0.5);
      const acceleration = (thrust * STANDARD_GRAVITY) / mass;
      thrustX = acceleration * (upX * Math.cos(pitch) + eastX * Math.sin(pitch));
      thrustY = acceleration * (upY * Math.cos(pitch) + eastY * Math.sin(pitch));
      if (time === 0 && acceleration <= EARTH.gravity) return finish({ reached: false, reason: 'weight' });
      spent += acceleration * STEP;
      engines.burn(STEP);
    }

    const gravity = mu / (r * r);
    const speed = Math.hypot(vx, vy);
    const drag = speed > 0 ? (DRAG_COEFFICIENT * airDensity(height) * speed * speed * engines.frontalWidth()) / mass : 0;
    dragLoss += drag * STEP;
    vx += (thrustX - gravity * upX - (speed > 0 ? (drag * vx) / speed : 0)) * STEP;
    vy += (thrustY - gravity * upY - (speed > 0 ? (drag * vy) / speed : 0)) * STEP;
    if (height <= 0 && climbSpeed < 0 && time > 0) {
      vx = 0;
      vy = 0;
    }
    x += vx * STEP;
    y += vy * STEP;
    time += STEP;

    if (Math.hypot(x, y) < radius - 1) return finish({ reached: false, reason: 'crash' });
  }
  return finish({ reached: false, reason: 'time' });
}

function progress(attempt) {
  const { periapsis, apoapsis } = attempt.orbit;
  return Number.isFinite(apoapsis) ? periapsis + apoapsis : -Infinity;
}

export function bestAscent(burns) {
  if (burns.length === 0) return { reached: false, reason: 'weight', spent: 0 };
  let best = null;
  for (const turnEndHeight of TURN_END_HEIGHTS) {
    for (const turnShape of TURN_SHAPES) {
      const attempt = fly(burns, turnEndHeight, turnShape);
      if (attempt.reason === 'weight') return attempt;
      const better = !best
        || (attempt.reached && (!best.reached || attempt.spent < best.spent))
        || (!attempt.reached && !best.reached && progress(attempt) > progress(best));
      if (better) best = attempt;
    }
  }
  return best;
}

export function shortfallAtApoapsis(attempt) {
  const mu = gravitationalParameter(EARTH);
  const { apoapsis, semiMajorAxis } = attempt.orbit;
  if (!Number.isFinite(apoapsis) || apoapsis < EARTH.radius + EARTH.atmosphere.height) return null;
  return Math.sqrt(mu / apoapsis) - Math.sqrt(Math.max(0, mu * (2 / apoapsis - 1 / semiMajorAxis)));
}
