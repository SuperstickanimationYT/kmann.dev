import {
  CORRIDOR, EARTH_RADIUS, ENTRY_ALTITUDE, LOST_DISTANCE, MOON_RADIUS, MU_MOON,
  apsides, dominantBody, flightPathAngle, judgeEntry, moonAt, predict, relativeTo, rk4, safeStep, siteAt,
} from './orbit.js';
import { EXHAUST_VELOCITY, THRUST, dryMass } from './rocket.js';

export const WARPS = [1, 2, 5, 10, 50, 100, 1000, 10000, 100000];
const MAX_THRUST_WARP_INDEX = WARPS.indexOf(10);
const TURN_RATE = Math.PI / 3;
const SITE_ANGLE = Math.PI / 2;
const LANDING_SPEED = 5;
const MOON_SURFACE_GRAVITY = MU_MOON / MOON_RADIUS ** 2;
const PREDICTION_INTERVAL = 0.25;
const MAX_SUBSTEPS = 6000;

export function createFlight(rocket, practice) {
  const site = siteAt(0, SITE_ANGLE);
  return {
    practice,
    rocket: { ...rocket },
    dry: dryMass(rocket),
    propellant: rocket.propellant,
    s: { t: 0, x: site.x, y: site.y, vx: site.vx, vy: site.vy },
    heading: Math.atan2(site.uy, site.ux),
    throttle: 0,
    landed: true,
    siteAngle: SITE_ANGLE,
    warpIndex: 0,
    hold: 'off',
    deltaVUsed: 0,
    prediction: null,
    predictionClock: 0,
    outcome: null,
  };
}

export function mass(f) {
  return f.dry + f.propellant;
}

export function deltaVLeft(f) {
  return EXHAUST_VELOCITY * Math.log(mass(f) / f.dry);
}

export function setWarp(f, index) {
  const ceiling = f.throttle > 0 ? MAX_THRUST_WARP_INDEX : WARPS.length - 1;
  f.warpIndex = Math.max(0, Math.min(ceiling, index));
}

export function setThrottle(f, value) {
  f.throttle = f.propellant > 0 ? Math.max(0, Math.min(1, value)) : 0;
  if (f.throttle > 0) setWarp(f, f.warpIndex);
}

function holdHeading(f) {
  if (f.hold === 'off' || f.landed) return;
  const rel = relativeTo(f.s, dominantBody(f.s));
  const prograde = Math.atan2(rel.vy, rel.vx);
  f.heading = f.hold === 'prograde' ? prograde : prograde + Math.PI;
}

function surfaceVelocity(f) {
  const moon = moonAt(f.s.t);
  const angle = Math.atan2(f.s.y - moon.y, f.s.x - moon.x) - moon.angle;
  const site = siteAt(f.s.t, angle);
  return { angle, speed: Math.hypot(f.s.vx - site.vx, f.s.vy - site.vy) };
}

function finish(f, kind, title, detail) {
  f.outcome = { kind, title, detail };
  f.throttle = 0;
}

export function describeTime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return days > 0 ? `${days} d ${hours} h` : `${hours} h ${minutes} min`;
}

function checkEvents(f) {
  const s = f.s;
  const rE = Math.hypot(s.x, s.y);
  if (rE < EARTH_RADIUS + ENTRY_ALTITUDE) {
    const angle = flightPathAngle(relativeTo(s, 'earth'));
    const verdict = judgeEntry(angle);
    const facts = `Entry angle ${angle.toFixed(1)}° (corridor ${CORRIDOR.shallow}° to ${CORRIDOR.steep}°), ${describeTime(s.t)} after liftoff, ${Math.round(f.deltaVUsed)} m/s of Δv used.`;
    if (verdict === 'good') finish(f, 'win', 'Splashdown! You made it home.', facts);
    else if (verdict === 'shallow') finish(f, 'lost', 'Skipped off the atmosphere', `Too shallow: the capsule bounced back out into space. ${facts}`);
    else finish(f, 'lost', 'Burned up on reentry', `Too steep: heat and g-forces were more than the capsule could take. ${facts}`);
    return;
  }
  const moon = moonAt(s.t);
  if (Math.hypot(s.x - moon.x, s.y - moon.y) < MOON_RADIUS) {
    const { angle, speed } = surfaceVelocity(f);
    if (speed <= LANDING_SPEED) {
      f.landed = true;
      f.siteAngle = angle;
    } else {
      finish(f, 'lost', 'Crashed into the Moon', `Hit the surface at ${Math.round(speed)} m/s. Under ${LANDING_SPEED} m/s counts as a landing.`);
    }
    return;
  }
  if (rE > LOST_DISTANCE) finish(f, 'lost', 'Lost in deep space', 'The capsule left the Earth–Moon system.');
}

function pinToSite(f) {
  const site = siteAt(f.s.t, f.siteAngle);
  Object.assign(f.s, { x: site.x, y: site.y, vx: site.vx, vy: site.vy });
  return site;
}

function substep(f, dt) {
  holdHeading(f);
  const thrustAccel = f.propellant > 0 ? (f.throttle * THRUST) / mass(f) : 0;
  if (f.landed) {
    const site = pinToSite(f);
    const upward = thrustAccel * (Math.cos(f.heading) * site.ux + Math.sin(f.heading) * site.uy);
    if (upward <= MOON_SURFACE_GRAVITY) {
      f.s.t += dt;
      burn(f, dt, thrustAccel);
      pinToSite(f);
      return;
    }
    f.landed = false;
  }
  rk4(f.s, dt, thrustAccel * Math.cos(f.heading), thrustAccel * Math.sin(f.heading));
  burn(f, dt, thrustAccel);
  checkEvents(f);
}

function burn(f, dt, thrustAccel) {
  if (thrustAccel === 0) return;
  f.propellant = Math.max(0, f.propellant - ((f.throttle * THRUST) / EXHAUST_VELOCITY) * dt);
  f.deltaVUsed += thrustAccel * dt;
  if (f.propellant === 0) f.throttle = 0;
}

function slowDownBeforeEvent(f, realDt) {
  const event = f.prediction && f.prediction.event;
  if (!event || f.throttle > 0) return;
  const remaining = event.t - f.s.t;
  while (f.warpIndex > 0 && WARPS[f.warpIndex] * realDt * 6 > remaining) f.warpIndex -= 1;
}

export function refreshPrediction(f) {
  f.prediction = predict(f.s);
  f.predictionClock = 0;
}

export function updateFlight(f, realDt, turn) {
  if (f.outcome) return;
  if (turn) {
    f.hold = 'off';
    f.heading += turn * TURN_RATE * realDt;
  }
  slowDownBeforeEvent(f, realDt);
  let remaining = realDt * WARPS[f.warpIndex];
  for (let n = 0; remaining > 0 && n < MAX_SUBSTEPS && !f.outcome; n += 1) {
    const limit = f.throttle > 0 || f.landed ? 0.1 : Math.min(safeStep(f.s, 0.004), 600);
    const dt = Math.min(remaining, limit);
    substep(f, dt);
    remaining -= dt;
  }
  f.predictionClock += realDt;
  if (!f.prediction || f.predictionClock > PREDICTION_INTERVAL) refreshPrediction(f);
}

export function readout(f) {
  const body = dominantBody(f.s);
  const rel = relativeTo(f.s, body);
  const r = Math.hypot(rel.x, rel.y);
  const radial = (rel.x * rel.vx + rel.y * rel.vy) / r;
  const up = Math.atan2(rel.y, rel.x);
  let pitch = ((f.heading - up) * 180) / Math.PI;
  pitch = ((((pitch + 180) % 360) + 360) % 360) - 180;
  const surface = body === 'moon' ? surfaceVelocity(f).speed : Math.hypot(rel.vx, rel.vy);
  return {
    body,
    altitude: r - rel.radius,
    speed: Math.hypot(rel.vx, rel.vy),
    surfaceSpeed: surface,
    verticalSpeed: radial,
    pitchFromVertical: pitch,
    ...apsides(rel),
    time: describeTime(f.s.t),
  };
}
