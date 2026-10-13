export const G = 6.6743e-11;
export const EARTH_MASS = 5.9722e24;
export const MOON_MASS = 7.342e22;
export const MU_EARTH = G * EARTH_MASS;
export const MU_MOON = G * MOON_MASS;
export const EARTH_RADIUS = 6.371e6;
export const MOON_RADIUS = 1.7374e6;
export const MOON_DISTANCE = 3.844e8;
export const MOON_RATE = Math.sqrt((G * (EARTH_MASS + MOON_MASS)) / MOON_DISTANCE ** 3);
export const MOON_SOI = MOON_DISTANCE * (MOON_MASS / EARTH_MASS) ** 0.4;
export const ENTRY_ALTITUDE = 120e3;
export const CORRIDOR = { shallow: -5, steep: -8 };
export const LOST_DISTANCE = 1.5e9;

const MOON_START_ANGLE = 0;

export function moonAt(t) {
  const angle = MOON_START_ANGLE + MOON_RATE * t;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: MOON_DISTANCE * c, y: MOON_DISTANCE * s, vx: -MOON_DISTANCE * MOON_RATE * s, vy: MOON_DISTANCE * MOON_RATE * c, angle };
}

export function siteAt(t, siteAngle) {
  const moon = moonAt(t);
  const angle = moon.angle + siteAngle;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  return {
    x: moon.x + MOON_RADIUS * ux,
    y: moon.y + MOON_RADIUS * uy,
    vx: moon.vx - MOON_RADIUS * MOON_RATE * uy,
    vy: moon.vy + MOON_RADIUS * MOON_RATE * ux,
    ux,
    uy,
  };
}

export function gravity(t, x, y) {
  const moon = moonAt(t);
  const rE3 = Math.hypot(x, y) ** 3;
  const dx = x - moon.x;
  const dy = y - moon.y;
  const rM3 = Math.hypot(dx, dy) ** 3;
  const m3 = MOON_DISTANCE ** 3;
  return {
    ax: (-MU_EARTH * x) / rE3 - (MU_MOON * dx) / rM3 - (MU_MOON * moon.x) / m3,
    ay: (-MU_EARTH * y) / rE3 - (MU_MOON * dy) / rM3 - (MU_MOON * moon.y) / m3,
  };
}

export function rk4(s, dt, thrustX = 0, thrustY = 0) {
  const k1 = gravity(s.t, s.x, s.y);
  const h = dt / 2;
  const x2 = s.x + s.vx * h;
  const y2 = s.y + s.vy * h;
  const vx2 = s.vx + (k1.ax + thrustX) * h;
  const vy2 = s.vy + (k1.ay + thrustY) * h;
  const k2 = gravity(s.t + h, x2, y2);
  const x3 = s.x + vx2 * h;
  const y3 = s.y + vy2 * h;
  const vx3 = s.vx + (k2.ax + thrustX) * h;
  const vy3 = s.vy + (k2.ay + thrustY) * h;
  const k3 = gravity(s.t + h, x3, y3);
  const x4 = s.x + vx3 * dt;
  const y4 = s.y + vy3 * dt;
  const vx4 = s.vx + (k3.ax + thrustX) * dt;
  const vy4 = s.vy + (k3.ay + thrustY) * dt;
  const k4 = gravity(s.t + dt, x4, y4);
  s.x += (dt / 6) * (s.vx + 2 * vx2 + 2 * vx3 + vx4);
  s.y += (dt / 6) * (s.vy + 2 * vy2 + 2 * vy3 + vy4);
  s.vx += (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax + 6 * thrustX);
  s.vy += (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay + 6 * thrustY);
  s.t += dt;
}

export function safeStep(s, accuracy) {
  const moon = moonAt(s.t);
  const rE = Math.hypot(s.x, s.y);
  const rM = Math.hypot(s.x - moon.x, s.y - moon.y);
  return accuracy * Math.min(Math.sqrt(rE ** 3 / MU_EARTH), Math.sqrt(rM ** 3 / MU_MOON));
}

export function relativeTo(s, body) {
  if (body === 'earth') return { x: s.x, y: s.y, vx: s.vx, vy: s.vy, mu: MU_EARTH, radius: EARTH_RADIUS };
  const moon = moonAt(s.t);
  return { x: s.x - moon.x, y: s.y - moon.y, vx: s.vx - moon.vx, vy: s.vy - moon.vy, mu: MU_MOON, radius: MOON_RADIUS };
}

export function dominantBody(s) {
  const moon = moonAt(s.t);
  return Math.hypot(s.x - moon.x, s.y - moon.y) < MOON_SOI ? 'moon' : 'earth';
}

export function flightPathAngle(rel) {
  const r = Math.hypot(rel.x, rel.y);
  const v = Math.hypot(rel.vx, rel.vy);
  if (v === 0) return 0;
  return (Math.asin((rel.x * rel.vx + rel.y * rel.vy) / (r * v)) * 180) / Math.PI;
}

export function apsides(rel) {
  const r = Math.hypot(rel.x, rel.y);
  const v2 = rel.vx ** 2 + rel.vy ** 2;
  const energy = v2 / 2 - rel.mu / r;
  const h = rel.x * rel.vy - rel.y * rel.vx;
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (rel.mu * rel.mu)));
  const p = (h * h) / rel.mu;
  const periapsis = p / (1 + e) - rel.radius;
  const apoapsis = e < 1 ? p / (1 - e) - rel.radius : Infinity;
  return { periapsis, apoapsis, eccentricity: e };
}

export function judgeEntry(angle) {
  if (angle > CORRIDOR.shallow) return 'shallow';
  if (angle < CORRIDOR.steep) return 'steep';
  return 'good';
}

export function predict(start, horizon = 15 * 86400) {
  const s = { t: start.t, x: start.x, y: start.y, vx: start.vx, vy: start.vy };
  const points = [{ t: s.t, x: s.x, y: s.y }];
  const end = start.t + horizon;
  let event = null;
  for (let n = 0; n < 40000 && s.t < end; n += 1) {
    const dt = Math.min(safeStep(s, 0.02), 1800);
    rk4(s, dt);
    if (n % 4 === 0) points.push({ t: s.t, x: s.x, y: s.y });
    const rE = Math.hypot(s.x, s.y);
    if (rE < EARTH_RADIUS + ENTRY_ALTITUDE) {
      event = { kind: 'entry', t: s.t, angle: flightPathAngle(relativeTo(s, 'earth')) };
      break;
    }
    const moon = moonAt(s.t);
    if (Math.hypot(s.x - moon.x, s.y - moon.y) < MOON_RADIUS) {
      event = { kind: 'moon', t: s.t };
      break;
    }
    if (rE > LOST_DISTANCE) {
      event = { kind: 'lost', t: s.t };
      break;
    }
  }
  points.push({ t: s.t, x: s.x, y: s.y });
  return { points, event };
}
