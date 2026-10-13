import { beamMap, sharedNode } from './design.js';

export const WORLD = {
  gravity: 9.81,
  substeps: 32,
  beamKgPerMeter: 0.4,
  pinKg: 0.05,
  friction: 0.9,
  swingGain: 4,
};

const TAU = Math.PI * 2;

function wrapAngle(angle) {
  return angle - TAU * Math.round(angle / TAU);
}

function rpmToRadPerSecond(rpm) {
  return (rpm * TAU) / 60;
}

export class Simulation {
  constructor(design) {
    const index = new Map(design.nodes.map((node, i) => [node.id, i]));
    const count = design.nodes.length;
    this.ids = design.nodes.map((node) => node.id);
    this.x = Float64Array.from(design.nodes, (n) => n.x);
    this.y = Float64Array.from(design.nodes, (n) => n.y);
    this.prevX = new Float64Array(count);
    this.prevY = new Float64Array(count);
    this.vx = new Float64Array(count);
    this.vy = new Float64Array(count);
    const mass = new Float64Array(count).fill(WORLD.pinKg);

    this.beams = design.beams.map((beam) => {
      const a = index.get(beam.a);
      const b = index.get(beam.b);
      const length = Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a]);
      mass[a] += (length * WORLD.beamKgPerMeter) / 2;
      mass[b] += (length * WORLD.beamKgPerMeter) / 2;
      return { a, b, length };
    });
    this.mass = mass;
    this.inverseMass = Float64Array.from(mass, (m) => 1 / m);
    this.totalMass = mass.reduce((sum, m) => sum + m, 0);

    const beams = beamMap(design);
    this.motors = design.motors.map((settings) => {
      const driven = beams.get(settings.driven);
      const base = beams.get(settings.base);
      const pivotId = sharedNode(driven, base);
      const otherEnd = (beam) => index.get(beam.a === pivotId ? beam.b : beam.a);
      const motor = { settings, pivot: index.get(pivotId), drivenEnd: otherEnd(driven), baseEnd: otherEnd(base), torque: 0, speed: 0 };
      motor.restAngle = this.relativeAngle(motor);
      return motor;
    });

    this.time = 0;
    this.startX = this.centerOfMass().x;
    this.broken = false;
  }

  centerOfMass() {
    let x = 0;
    let y = 0;
    for (let i = 0; i < this.mass.length; i += 1) {
      x += this.x[i] * this.mass[i];
      y += this.y[i] * this.mass[i];
    }
    return { x: x / this.totalMass, y: y / this.totalMass };
  }

  distance() {
    return this.mass.length ? this.centerOfMass().x - this.startX : 0;
  }

  relativeAngle({ pivot, drivenEnd, baseEnd }) {
    const driven = Math.atan2(this.y[drivenEnd] - this.y[pivot], this.x[drivenEnd] - this.x[pivot]);
    const base = Math.atan2(this.y[baseEnd] - this.y[pivot], this.x[baseEnd] - this.x[pivot]);
    return driven - base;
  }

  throttle(motor) {
    const { settings } = motor;
    if (settings.mode === 'spin') return settings.power;
    const target = motor.restAngle + ((settings.amplitude * Math.PI) / 180) * Math.sin(TAU * settings.frequency * this.time + (settings.phase * Math.PI) / 180);
    const error = wrapAngle(target - this.relativeAngle(motor));
    return Math.max(-1, Math.min(1, error * WORLD.swingGain));
  }

  driveMotor(motor, h) {
    const { pivot: p, drivenEnd: d, baseEnd: b, settings } = motor;
    const w = this.inverseMass;
    const rdx = this.x[d] - this.x[p];
    const rdy = this.y[d] - this.y[p];
    const rbx = this.x[b] - this.x[p];
    const rby = this.y[b] - this.y[p];
    const rd2 = rdx * rdx + rdy * rdy;
    const rb2 = rbx * rbx + rby * rby;
    if (rd2 < 1e-12 || rb2 < 1e-12) return;
    const gdx = -rdy / rd2;
    const gdy = rdx / rd2;
    const gbx = rby / rb2;
    const gby = -rbx / rb2;
    const gpx = -gdx - gbx;
    const gpy = -gdy - gby;

    const speed = gdx * this.vx[d] + gdy * this.vy[d] + gbx * this.vx[b] + gby * this.vy[b] + gpx * this.vx[p] + gpy * this.vy[p];
    const inverseInertia = w[d] * (gdx * gdx + gdy * gdy) + w[b] * (gbx * gbx + gby * gby) + w[p] * (gpx * gpx + gpy * gpy);
    const stall = settings.stallTorque;
    const backEmfDamping = stall / rpmToRadPerSecond(settings.freeRpm);
    const dampingThatStopsWithoutReversing = Math.min(backEmfDamping, 1 / (h * inverseInertia));
    const torque = Math.max(-stall, Math.min(stall, stall * this.throttle(motor) - dampingThatStopsWithoutReversing * speed));
    const impulse = torque * h;

    this.vx[d] += w[d] * gdx * impulse;
    this.vy[d] += w[d] * gdy * impulse;
    this.vx[b] += w[b] * gbx * impulse;
    this.vy[b] += w[b] * gby * impulse;
    this.vx[p] += w[p] * gpx * impulse;
    this.vy[p] += w[p] * gpy * impulse;
    motor.torque = torque;
    motor.speed = speed;
  }

  solveBeams() {
    const { x, y, inverseMass: w } = this;
    for (const { a, b, length } of this.beams) {
      const dx = x[b] - x[a];
      const dy = y[b] - y[a];
      const current = Math.hypot(dx, dy);
      const weight = w[a] + w[b];
      if (current < 1e-9) continue;
      const correction = (current - length) / (current * weight);
      x[a] += dx * correction * w[a];
      y[a] += dy * correction * w[a];
      x[b] -= dx * correction * w[b];
      y[b] -= dy * correction * w[b];
    }
  }

  solveGround() {
    const { x, y, prevX } = this;
    for (let i = 0; i < x.length; i += 1) {
      if (y[i] >= 0) continue;
      const depth = -y[i];
      y[i] = 0;
      const slide = x[i] - prevX[i];
      const grip = WORLD.friction * depth;
      x[i] = Math.abs(slide) <= grip ? prevX[i] : x[i] - Math.sign(slide) * grip;
    }
  }

  step(dt) {
    if (this.broken) return;
    const h = dt / WORLD.substeps;
    const { x, y, vx, vy, prevX, prevY } = this;
    for (let s = 0; s < WORLD.substeps; s += 1) {
      for (const motor of this.motors) this.driveMotor(motor, h);
      for (let i = 0; i < x.length; i += 1) {
        vy[i] -= WORLD.gravity * h;
        prevX[i] = x[i];
        prevY[i] = y[i];
        x[i] += vx[i] * h;
        y[i] += vy[i] * h;
      }
      this.solveBeams();
      this.solveGround();
      for (let i = 0; i < x.length; i += 1) {
        vx[i] = (x[i] - prevX[i]) / h;
        vy[i] = (y[i] - prevY[i]) / h;
      }
      this.time += h;
    }
    this.broken = !x.every(Number.isFinite) || !y.every(Number.isFinite);
  }
}
