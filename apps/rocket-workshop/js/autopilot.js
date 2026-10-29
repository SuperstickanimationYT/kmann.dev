import { orbitAltitudes } from './orbit.js';

export const PATH_REACH = 2.5;
export const MIN_TURN_SHARE = 0.05;

const DEGREES = Math.PI / 180;
const SOLVE_STEPS = 30;
const ORBIT_DONE_SHARE = 0.95;
const TOO_HIGH_SHARE = 1.5;
const LEVEL_GAIN = 0.5;
const MOST_NOSE_UP = 30;
const MOST_NOSE_DOWN = 20;

export function planPoints(plan) {
  const height = plan.orbitHeight;
  const reach = height * PATH_REACH;
  return [
    { x: 0, y: 0 },
    { x: 0, y: Math.max(MIN_TURN_SHARE, plan.turnStart) * height },
    { x: reach * (1 - Math.max(MIN_TURN_SHARE, plan.turnFlat)), y: height },
    { x: reach, y: height },
  ];
}

export function pathAt([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const along = (key) => u * u * u * p0[key] + 3 * u * u * t * p1[key] + 3 * u * t * t * p2[key] + t * t * t * p3[key];
  const slope = (key) => 3 * u * u * (p1[key] - p0[key]) + 6 * u * t * (p2[key] - p1[key]) + 3 * t * t * (p3[key] - p2[key]);
  return { x: along('x'), y: along('y'), dx: slope('x'), dy: slope('y') };
}

export function leanAt(plan, altitude) {
  if (altitude <= 0) return 0;
  if (altitude >= plan.orbitHeight) return 90;
  const points = planPoints(plan);
  let low = 0;
  let high = 1;
  for (let i = 0; i < SOLVE_STEPS; i += 1) {
    const middle = (low + high) / 2;
    if (pathAt(points, middle).y < altitude) low = middle;
    else high = middle;
  }
  const { dx, dy } = pathAt(points, (low + high) / 2);
  return Math.atan2(dx, dy) / DEGREES;
}

export const PHASE_NOTES = {
  climb: 'climbing and leaning over along the plan',
  coast: 'engines off, coasting up to the highest point',
  circle: 'burning sideways at the top to round out the orbit',
  orbit: 'in orbit',
};

export class Autopilot {
  constructor(plan, sim) {
    this.plan = plan;
    this.phase = this.phaseFor(sim);
  }

  orbitNow(sim) {
    const point = sim.cpuGyro;
    return orbitAltitudes(sim.centerOf(point), sim.velocityOf(point), sim.time);
  }

  phaseFor(sim) {
    const { apoapsis, periapsis } = this.orbitNow(sim);
    if (periapsis >= this.doneHeight(apoapsis)) return 'orbit';
    if (apoapsis !== null && apoapsis >= this.plan.orbitHeight) return 'coast';
    return 'climb';
  }

  doneHeight(apoapsis) {
    return ORBIT_DONE_SHARE * Math.min(this.plan.orbitHeight, apoapsis ?? Infinity);
  }

  thrustNow(sim) {
    const piece = sim.pieceOf(sim.cpuGyro.a);
    return sim.engines.reduce((sum, engine) => {
      const fed = engine.lit && sim.pieceOf(engine.nozzle) === piece && engine.tanksNearestFirst.some((tank) => tank.fuel > 0 && sim.pieceOf(tank.a) === piece);
      return sum + (fed ? engine.settings.thrust * 1000 * engine.settings.limit : 0);
    }, 0);
  }

  secondsToCircle(sim, flight) {
    const thrust = this.thrustNow(sim);
    if (thrust <= 0) return Infinity;
    const radius = flight.body.radius + flight.altitude;
    const circleSpeed = Math.sqrt(flight.body.mu / radius);
    const mass = sim.pieceStats(sim.cpuGyro.a).mass;
    return (Math.max(0, circleSpeed - Math.abs(flight.hspeed)) * mass) / thrust;
  }

  update(sim) {
    const flight = sim.telemetry(sim.cpuGyro);
    const { apoapsis, periapsis } = this.orbitNow(sim);
    let lean = leanAt(this.plan, flight.altitude);
    let throttle = 0;
    if (this.phase === 'climb') {
      throttle = 1;
      if (apoapsis !== null && apoapsis >= this.plan.orbitHeight) this.phase = 'coast';
    } else if (this.phase === 'coast') {
      const gravity = flight.body.mu / (flight.body.radius + flight.altitude) ** 2;
      const secondsToTop = Math.max(0, flight.vspeed) / gravity;
      if (apoapsis !== null && apoapsis < this.plan.orbitHeight * ORBIT_DONE_SHARE) throttle = 1;
      if (secondsToTop <= this.secondsToCircle(sim, flight) / 2) this.phase = 'circle';
    }
    if (this.phase === 'circle') {
      lean = 90 + Math.max(-MOST_NOSE_UP, Math.min(MOST_NOSE_DOWN, flight.vspeed * LEVEL_GAIN));
      throttle = 1;
      if (periapsis >= this.doneHeight(apoapsis) || (apoapsis ?? Infinity) > this.plan.orbitHeight * TOO_HIGH_SHARE) this.phase = 'orbit';
    }
    if (this.phase === 'orbit') {
      lean = 90;
      throttle = 0;
    }
    return { throttle, aim: sim.upAngle(sim.centerOf(sim.cpuGyro)) - lean * DEGREES, note: PHASE_NOTES[this.phase] };
  }
}
