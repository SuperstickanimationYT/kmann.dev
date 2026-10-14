import { Processor } from './cpu.js';
import { beamMap, sharedNode } from './design.js';
import { BODIES, EARTH, airDensity, bodyState, dominantBody } from './planets.js';

export const WORLD = {
  substeps: 32,
  beamPasses: 4,
  beamKgPerMeter: 10,
  pinKg: 2,
  cpuKg: 20,
  sensorKg: 2,
  touchMeters: 0.05,
  friction: 0.8,
  swingGain: 4,
  beamWidth: 0.3,
  dragCoefficient: 1,
  standardGravity: 9.80665,
  rangeLimit: 20000,
  separationSpeed: 1.5,
};

export const TANK = { fuelKgPerMeter: 400, dryKgPerMeter: 40, width: 1.6 };
export const ENGINE = { kg: 250, isp: 300 };

const TAU = Math.PI * 2;

function wrapAngle(angle) {
  return angle - TAU * Math.round(angle / TAU);
}

function rpmToRadPerSecond(rpm) {
  return (rpm * TAU) / 60;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function raySphereDistance(ox, oy, dx, dy, cx, cy, radius) {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - radius * radius;
  if (c <= 0) return 0;
  const disc = b * b - c;
  if (disc < 0 || b > 0) return Infinity;
  return -b - Math.sqrt(disc);
}

export class Simulation {
  constructor(design, program = null) {
    const index = new Map(design.nodes.map((node, i) => [node.id, i]));
    const count = design.nodes.length;
    this.ids = design.nodes.map((node) => node.id);
    this.x = Float64Array.from(design.nodes, (n) => n.x);
    this.y = Float64Array.from(design.nodes, (n) => n.y);
    this.prevX = new Float64Array(count);
    this.prevY = new Float64Array(count);
    this.vx = new Float64Array(count);
    this.vy = new Float64Array(count);
    this.time = 0;
    this.input = { steer: 0, throttle: 0 };
    const mass = new Float64Array(count).fill(WORLD.pinKg);
    const beams = beamMap(design);
    const beamIndex = new Map(design.beams.map((beam, i) => [beam.id, i]));
    const tankBeams = new Set(design.tanks ?? []);

    this.beams = design.beams.map((beam) => {
      const a = index.get(beam.a);
      const b = index.get(beam.b);
      const length = Math.hypot(this.x[b] - this.x[a], this.y[b] - this.y[a]);
      const kgPerMeter = tankBeams.has(beam.id) ? TANK.dryKgPerMeter : WORLD.beamKgPerMeter;
      mass[a] += (length * kgPerMeter) / 2;
      mass[b] += (length * kgPerMeter) / 2;
      return { a, b, length, active: true, width: tankBeams.has(beam.id) ? TANK.width : WORLD.beamWidth };
    });

    const gyroOn = (beamId, kg) => {
      const beam = beams.get(beamId);
      const gyro = { a: index.get(beam.a), b: index.get(beam.b) };
      mass[gyro.a] += kg / 2;
      mass[gyro.b] += kg / 2;
      gyro.restAngle = this.beamAngle(gyro);
      return gyro;
    };
    const jointOf = (drivenId, baseId) => {
      const driven = beams.get(drivenId);
      const base = beams.get(baseId);
      const pivotId = sharedNode(driven, base);
      const otherEnd = (beam) => index.get(beam.a === pivotId ? beam.b : beam.a);
      const joint = { pivot: index.get(pivotId), drivenEnd: otherEnd(driven), baseEnd: otherEnd(base), turned: 0 };
      joint.restAngle = this.relativeAngle(joint);
      joint.lastAngle = joint.restAngle;
      return joint;
    };
    const otherEndOf = (beamId, nodeId) => {
      const beam = beams.get(beamId);
      return index.get(beam.a === nodeId ? beam.b : beam.a);
    };

    for (const id of design.sensors ?? []) mass[index.get(id)] += WORLD.sensorKg;
    this.sensors = (design.sensors ?? []).map((id) => index.get(id));
    this.gyros = (design.gyros ?? []).map((beamId) => gyroOn(beamId, WORLD.sensorKg));
    this.angleSensors = (design.angles ?? []).map(({ driven, base }) => jointOf(driven, base));
    for (const joint of this.angleSensors) mass[joint.pivot] += WORLD.sensorKg;
    this.pens = (design.pens ?? []).map((pen) => {
      if (pen.node !== undefined) return { a: index.get(pen.node), b: index.get(pen.node), down: 1 };
      const beam = beams.get(pen.beam);
      return { a: index.get(beam.a), b: index.get(beam.b), down: 1 };
    });
    this.ranges = (design.ranges ?? []).map(({ beam, tip }) => {
      mass[index.get(tip)] += WORLD.sensorKg;
      return { tip: index.get(tip), back: otherEndOf(beam, tip), distance: WORLD.rangeLimit };
    });

    this.tanks = (design.tanks ?? []).map((beamId) => {
      const beam = this.beams[beamIndex.get(beamId)];
      const capacity = beam.length * TANK.fuelKgPerMeter;
      return { a: beam.a, b: beam.b, capacity, fuel: capacity };
    });
    this.engines = (design.engines ?? []).map((settings) => {
      const nozzle = index.get(settings.nozzle);
      mass[nozzle] += ENGINE.kg;
      const back = otherEndOf(settings.beam, settings.nozzle);
      const byDistance = [...this.tanks].sort((p, q) => this.distanceTo(nozzle, p) - this.distanceTo(nozzle, q));
      return { settings, nozzle, back, tanksNearestFirst: byDistance, cpuThrottle: 0, cpuControlled: false, firing: 0 };
    });
    this.separatorGroups = new Map();
    for (const { beam, group } of design.separators ?? []) {
      if (!this.separatorGroups.has(group)) this.separatorGroups.set(group, { beams: [], fired: false });
      this.separatorGroups.get(group).beams.push(beamIndex.get(beam));
    }

    if (design.cpu) {
      this.cpuGyro = gyroOn(design.cpu.beam, WORLD.cpuKg);
      this.cpuClock = design.cpu.clock;
      if (program) this.processor = new Processor(program, this);
    }

    this.dryMass = mass;
    this.mass = new Float64Array(count);
    this.inverseMass = new Float64Array(count);
    this.updateMass();

    this.motors = design.motors.map((settings) => ({ settings, ...jointOf(settings.driven, settings.base), torque: 0, speed: 0, cpuPower: 0 }));
    this.motors.forEach((motor, i) => {
      motor.cpuControlled = Boolean(this.processor?.program.drives.motor.has(i));
    });
    this.engines.forEach((engine, i) => {
      engine.cpuControlled = Boolean(this.processor?.program.drives.engine.has(i));
    });

    this.findPieces();
    this.cpuStartUp = this.cpuGyro ? this.upAngle(this.centerOf(this.cpuGyro)) : 0;
    this.broken = false;
  }

  distanceTo(node, tank) {
    return Math.hypot((this.x[tank.a] + this.x[tank.b]) / 2 - this.x[node], (this.y[tank.a] + this.y[tank.b]) / 2 - this.y[node]);
  }

  updateMass() {
    this.mass.set(this.dryMass);
    for (const tank of this.tanks) {
      this.mass[tank.a] += tank.fuel / 2;
      this.mass[tank.b] += tank.fuel / 2;
    }
    for (let i = 0; i < this.mass.length; i += 1) this.inverseMass[i] = 1 / this.mass[i];
    this.totalMass = this.mass.reduce((sum, m) => sum + m, 0);
  }

  findPieces() {
    const parent = this.ids.map((_, i) => i);
    const root = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    for (const beam of this.beams) if (beam.active) parent[root(beam.a)] = root(beam.b);
    this.piece = Int32Array.from(parent, (_, i) => root(i));
  }

  pieceOf(node) {
    return this.piece[node];
  }

  pieceStats(node) {
    const piece = this.pieceOf(node);
    let mass = 0;
    for (let i = 0; i < this.mass.length; i += 1) if (this.piece[i] === piece) mass += this.mass[i];
    const fuel = this.tanks.reduce((sum, tank) => sum + (this.piece[tank.a] === piece ? tank.fuel : 0), 0);
    return { mass, fuel };
  }

  centerOf({ a, b }) {
    return { x: (this.x[a] + this.x[b]) / 2, y: (this.y[a] + this.y[b]) / 2 };
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

  velocityOf({ a, b }) {
    return { x: (this.vx[a] + this.vx[b]) / 2, y: (this.vy[a] + this.vy[b]) / 2 };
  }

  telemetry(point = this.cpuGyro ?? this.heaviestNode()) {
    const at = this.centerOf(point);
    const velocity = this.velocityOf(point);
    const body = dominantBody(at.x, at.y, this.time);
    const state = bodyState(body, this.time);
    const rx = at.x - state.x;
    const ry = at.y - state.y;
    const distance = Math.hypot(rx, ry);
    const vx = velocity.x - state.vx;
    const vy = velocity.y - state.vy;
    return {
      body,
      altitude: distance - body.radius,
      speed: Math.hypot(vx, vy),
      vspeed: (vx * rx + vy * ry) / distance,
      hspeed: (vy * rx - vx * ry) / distance,
    };
  }

  heaviestNode() {
    let best = 0;
    for (let i = 1; i < this.mass.length; i += 1) if (this.mass[i] > this.mass[best]) best = i;
    return { a: best, b: best };
  }

  upAngle(point) {
    const body = dominantBody(point.x, point.y, this.time);
    const state = bodyState(body, this.time);
    return Math.atan2(point.y - state.y, point.x - state.x);
  }

  relativeAngle({ pivot, drivenEnd, baseEnd }) {
    const driven = Math.atan2(this.y[drivenEnd] - this.y[pivot], this.x[drivenEnd] - this.x[pivot]);
    const base = Math.atan2(this.y[baseEnd] - this.y[pivot], this.x[baseEnd] - this.x[pivot]);
    return driven - base;
  }

  penPoint({ a, b }) {
    return { x: (this.x[a] + this.x[b]) / 2, y: (this.y[a] + this.y[b]) / 2 };
  }

  beamAngle({ a, b }) {
    return Math.atan2(this.y[b] - this.y[a], this.x[b] - this.x[a]);
  }

  beamSpin({ a, b }) {
    const dx = this.x[b] - this.x[a];
    const dy = this.y[b] - this.y[a];
    return (dx * (this.vy[b] - this.vy[a]) - dy * (this.vx[b] - this.vx[a])) / (dx * dx + dy * dy);
  }

  gyroTilt(gyro) {
    return toDegrees(wrapAngle(this.beamAngle(gyro) - gyro.restAngle));
  }

  pitch() {
    const turnedSinceRun = this.beamAngle(this.cpuGyro) - this.cpuGyro.restAngle;
    const upTurnedSinceRun = this.upAngle(this.centerOf(this.cpuGyro)) - this.cpuStartUp;
    return toDegrees(wrapAngle(turnedSinceRun - upTurnedSinceRun));
  }

  jointSpeed({ pivot: p, drivenEnd: d, baseEnd: b }) {
    return this.beamSpin({ a: p, b: d }) - this.beamSpin({ a: p, b });
  }

  trackJoint(joint) {
    const angle = this.relativeAngle(joint);
    joint.turned += wrapAngle(angle - joint.lastAngle);
    joint.lastAngle = angle;
  }

  measureRange(range) {
    const dx = this.x[range.tip] - this.x[range.back];
    const dy = this.y[range.tip] - this.y[range.back];
    const length = Math.hypot(dx, dy);
    let nearest = Infinity;
    for (const body of BODIES) {
      const state = bodyState(body, this.time);
      nearest = Math.min(nearest, raySphereDistance(this.x[range.tip], this.y[range.tip], dx / length, dy / length, state.x, state.y, body.radius));
    }
    range.distance = Math.min(nearest, WORLD.rangeLimit);
    return range.distance;
  }

  touching(node) {
    return BODIES.some((body) => {
      const state = bodyState(body, this.time);
      return Math.hypot(this.x[node] - state.x, this.y[node] - state.y) < body.radius + WORLD.touchMeters;
    });
  }

  read(port, processor) {
    const motor = this.motors[port.index];
    const gyro = this.gyros[port.index];
    const joint = this.angleSensors[port.index];
    const radPerSecondToRpm = 60 / TAU;
    switch (port.kind) {
      case 'tilt': return this.gyroTilt(this.cpuGyro);
      case 'spin': return toDegrees(this.beamSpin(this.cpuGyro));
      case 'pitch': return this.pitch();
      case 'altitude': return this.telemetry().altitude;
      case 'speed': return this.telemetry().speed;
      case 'vspeed': return this.telemetry().vspeed;
      case 'hspeed': return this.telemetry().hspeed;
      case 'mass': return this.pieceStats(this.cpuGyro.a).mass;
      case 'fuel': return this.pieceStats(this.cpuGyro.a).fuel;
      case 'steer': return this.input.steer;
      case 'throttle': return this.input.throttle;
      case 'time': return this.time;
      case 'dt': return processor.dt;
      case 'touch': return this.touching(this.sensors[port.index]) ? 1 : 0;
      case 'motor-power': return motor.cpuPower;
      case 'motor-angle': return toDegrees(motor.turned);
      case 'motor-speed': return motor.speed * radPerSecondToRpm;
      case 'gyro-tilt': return this.gyroTilt(gyro);
      case 'gyro-spin': return toDegrees(this.beamSpin(gyro));
      case 'angle-angle': return toDegrees(joint.turned);
      case 'angle-speed': return this.jointSpeed(joint) * radPerSecondToRpm;
      case 'pen-down': return this.pens[port.index].down;
      case 'engine-throttle': return this.engines[port.index].cpuThrottle;
      case 'sep-fire': return this.separatorGroups.get(port.index + 1)?.fired ? 1 : 0;
      case 'range-distance': return this.measureRange(this.ranges[port.index]);
      default: return 0;
    }
  }

  write(port, value) {
    if (port.kind === 'motor-power') this.motors[port.index].cpuPower = Math.max(-1, Math.min(1, value));
    if (port.kind === 'pen-down') this.pens[port.index].down = value === 0 ? 0 : 1;
    if (port.kind === 'engine-throttle') this.engines[port.index].cpuThrottle = Math.max(0, Math.min(1, value));
    if (port.kind === 'sep-fire' && value !== 0) this.fireSeparators(port.index + 1);
  }

  fireSeparators(group) {
    const separators = this.separatorGroups.get(group);
    if (!separators || separators.fired) return;
    separators.fired = true;
    for (const beamIndex of separators.beams) {
      const beam = this.beams[beamIndex];
      beam.active = false;
      const dx = this.x[beam.b] - this.x[beam.a];
      const dy = this.y[beam.b] - this.y[beam.a];
      const length = Math.hypot(dx, dy) || 1;
      const kick = WORLD.separationSpeed / 2;
      this.vx[beam.a] -= (dx / length) * kick;
      this.vy[beam.a] -= (dy / length) * kick;
      this.vx[beam.b] += (dx / length) * kick;
      this.vy[beam.b] += (dy / length) * kick;
    }
    this.findPieces();
  }

  engineThrottle(engine) {
    return engine.cpuControlled ? engine.cpuThrottle : engine.settings.limit * this.input.throttle;
  }

  burnEngines(h) {
    let burned = false;
    for (const engine of this.engines) {
      const throttle = this.engineThrottle(engine);
      engine.firing = 0;
      if (throttle <= 0) continue;
      const piece = this.pieceOf(engine.nozzle);
      const tank = engine.tanksNearestFirst.find((t) => t.fuel > 0 && this.piece[t.a] === piece);
      if (!tank) continue;
      const thrust = engine.settings.thrust * 1000 * throttle;
      const fuelUsed = Math.min(tank.fuel, (thrust / (ENGINE.isp * WORLD.standardGravity)) * h);
      tank.fuel -= fuelUsed;
      burned = true;
      engine.firing = throttle;
      const dx = this.x[engine.back] - this.x[engine.nozzle];
      const dy = this.y[engine.back] - this.y[engine.nozzle];
      const length = Math.hypot(dx, dy);
      const impulse = (thrust * h) / 2;
      for (const node of [engine.nozzle, engine.back]) {
        this.vx[node] += (dx / length) * impulse * this.inverseMass[node];
        this.vy[node] += (dy / length) * impulse * this.inverseMass[node];
      }
    }
    if (burned) this.updateMass();
  }

  throttle(motor) {
    const { settings } = motor;
    if (motor.cpuControlled) return motor.cpuPower;
    if (settings.mode === 'spin') return settings.power;
    const swing = settings.mode === 'steer'
      ? settings.steerRange * this.input.steer
      : settings.amplitude * Math.sin(TAU * settings.frequency * this.time + (settings.phase * Math.PI) / 180);
    const target = motor.restAngle + (swing * Math.PI) / 180;
    const error = wrapAngle(target - this.relativeAngle(motor));
    return Math.max(-1, Math.min(1, error * WORLD.swingGain));
  }

  driveMotor(motor, h) {
    const { pivot: p, drivenEnd: d, baseEnd: b, settings } = motor;
    this.trackJoint(motor);
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

  applyGravity(h, bodies) {
    const { x, y, vx, vy } = this;
    for (let i = 0; i < x.length; i += 1) {
      for (const { body, state } of bodies) {
        const dx = state.x - x[i];
        const dy = state.y - y[i];
        const r2 = dx * dx + dy * dy;
        const pull = (body.mu / (r2 * Math.sqrt(r2))) * h;
        vx[i] += dx * pull;
        vy[i] += dy * pull;
      }
    }
  }

  applyDrag(h, earth) {
    const { x, y, vx, vy, inverseMass: w } = this;
    for (const beam of this.beams) {
      if (!beam.active) continue;
      const mx = (x[beam.a] + x[beam.b]) / 2;
      const my = (y[beam.a] + y[beam.b]) / 2;
      const density = airDensity(Math.hypot(mx - earth.x, my - earth.y) - EARTH.radius);
      if (density === 0) continue;
      const bx = (x[beam.b] - x[beam.a]) / beam.length;
      const by = (y[beam.b] - y[beam.a]) / beam.length;
      for (const node of [beam.a, beam.b]) {
        const speed = Math.hypot(vx[node], vy[node]);
        if (speed < 1e-6) continue;
        const across = Math.abs(bx * vy[node] - by * vx[node]) / speed;
        const area = (beam.length * beam.width * across + beam.width * beam.width * 0.25) / 2;
        const k = 0.5 * density * WORLD.dragCoefficient * area * w[node];
        const slow = 1 / (1 + k * speed * h);
        vx[node] *= slow;
        vy[node] *= slow;
      }
    }
  }

  solveBeams() {
    const { x, y, inverseMass: w } = this;
    for (const { a, b, length, active } of this.beams) {
      if (!active) continue;
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

  solveGround(h, bodies) {
    const { x, y, prevX, prevY } = this;
    for (let i = 0; i < x.length; i += 1) {
      for (const { body, state } of bodies) {
        const rx = x[i] - state.x;
        const ry = y[i] - state.y;
        const distance = Math.hypot(rx, ry);
        if (distance >= body.radius) continue;
        const nx = rx / distance;
        const ny = ry / distance;
        const depth = body.radius - distance;
        x[i] += nx * depth;
        y[i] += ny * depth;
        const slideX = x[i] - prevX[i] - state.vx * h;
        const slideY = y[i] - prevY[i] - state.vy * h;
        const along = slideX * -ny + slideY * nx;
        const grip = WORLD.friction * depth;
        const kept = Math.abs(along) <= grip ? 0 : along - Math.sign(along) * grip;
        x[i] -= (along - kept) * -ny;
        y[i] -= (along - kept) * nx;
      }
    }
  }

  step(dt) {
    if (this.broken) return;
    const h = dt / WORLD.substeps;
    const { x, y, vx, vy, prevX, prevY } = this;
    for (let s = 0; s < WORLD.substeps; s += 1) {
      const bodies = BODIES.map((body) => ({ body, state: bodyState(body, this.time) }));
      for (const joint of this.angleSensors) this.trackJoint(joint);
      this.processor?.run(this.cpuClock * h, this.time);
      for (const motor of this.motors) this.driveMotor(motor, h);
      this.burnEngines(h);
      this.applyGravity(h, bodies);
      this.applyDrag(h, bodies[0].state);
      for (let i = 0; i < x.length; i += 1) {
        prevX[i] = x[i];
        prevY[i] = y[i];
        x[i] += vx[i] * h;
        y[i] += vy[i] * h;
      }
      for (let pass = 0; pass < WORLD.beamPasses; pass += 1) this.solveBeams();
      this.solveGround(h, bodies);
      for (let i = 0; i < x.length; i += 1) {
        vx[i] = (x[i] - prevX[i]) / h;
        vy[i] = (y[i] - prevY[i]) / h;
      }
      this.time += h;
    }
    for (const range of this.ranges) this.measureRange(range);
    this.broken = !x.every(Number.isFinite) || !y.every(Number.isFinite);
  }
}
