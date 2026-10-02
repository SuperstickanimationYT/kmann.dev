import { gatherWithin } from './tree.js';

const KERNEL_REACH = 2;
const NEIGHBOUR_SPACING = 1.3;
const SMOOTHING_CHANGE_LIMIT = 1.25;
const WIDEST_SMOOTHING = 80;
const VISCOSITY = { linear: 0.1, quadratic: 0.2, nearZero: 0.01 };
const TRAPS_HEAT_ABOVE_DENSITY = 0.01;

const kernelScale = (h) => 10 / (7 * Math.PI * h * h);

function kernel(distance, h) {
  const q = distance / h;
  if (q >= 2) return 0;
  if (q >= 1) return kernelScale(h) * 0.25 * (2 - q) ** 3;
  return kernelScale(h) * (1 - 1.5 * q * q + 0.75 * q * q * q);
}

function kernelSlope(distance, h) {
  const q = distance / h;
  if (q >= 2) return 0;
  if (q >= 1) return (kernelScale(h) / h) * -0.75 * (2 - q) ** 2;
  return (kernelScale(h) / h) * (-3 * q + 2.25 * q * q);
}

let neighbourStart = new Int32Array(0);
let neighbourCount = new Int32Array(0);
let neighbours = new Int32Array(0);
let gaps = new Float64Array(0);

function weighGas(bodies, isGas) {
  if (neighbourStart.length < bodies.length) [neighbourStart, neighbourCount] = [new Int32Array(bodies.length * 2), new Int32Array(bodies.length * 2)];
  if (!neighbours.length) [neighbours, gaps] = [new Int32Array(1 << 16), new Float64Array(1 << 16)];
  let pairs = 0;
  bodies.forEach((body, index) => {
    neighbourStart[index] = pairs;
    neighbourCount[index] = 0;
    if (!isGas(body)) return;
    let end = gatherWithin(body.x, body.y, KERNEL_REACH * body.smoothing, neighbours, gaps, pairs);
    while (end < 0) {
      const [oldNeighbours, oldGaps] = [neighbours, gaps];
      [neighbours, gaps] = [new Int32Array(oldNeighbours.length * 2), new Float64Array(oldGaps.length * 2)];
      neighbours.set(oldNeighbours.subarray(0, pairs));
      gaps.set(oldGaps.subarray(0, pairs));
      end = gatherWithin(body.x, body.y, KERNEL_REACH * body.smoothing, neighbours, gaps, pairs);
    }
    let density = 0;
    for (let k = pairs; k < end; k++) {
      const other = bodies[neighbours[k]];
      if (!isGas(other)) continue;
      neighbours[pairs + neighbourCount[index]] = neighbours[k];
      gaps[pairs + neighbourCount[index]] = gaps[k];
      neighbourCount[index]++;
      density += other.mass * kernel(gaps[k], body.smoothing);
    }
    pairs += neighbourCount[index];
    body.density = density;
  });
}

const stiffness = (gas) => 1 + gas.density / TRAPS_HEAT_ABOVE_DENSITY;
const pressureOverDensitySquared = (gas) => (gas.soundSpeed ** 2 * stiffness(gas)) / gas.density;
const soundSpeedOf = (gas) => gas.soundSpeed * Math.sqrt(stiffness(gas));

function pushApart(bodies, isGas) {
  bodies.forEach((body, index) => {
    if (!isGas(body)) return;
    const pressureTerm = pressureOverDensitySquared(body);
    let [ax, ay] = [0, 0];
    for (let k = neighbourStart[index]; k < neighbourStart[index] + neighbourCount[index]; k++) {
      const other = bodies[neighbours[k]];
      const distance = gaps[k];
      if (other === body || distance === 0) continue;
      const h = (body.smoothing + other.smoothing) / 2;
      const slope = kernelSlope(distance, h);
      if (slope === 0) continue;
      const [dx, dy] = [body.x - other.x, body.y - other.y];
      const closing = (body.vx - other.vx) * dx + (body.vy - other.vy) * dy;
      let viscosity = 0;
      if (closing < 0) {
        const squeeze = (h * closing) / (distance * distance + VISCOSITY.nearZero * h * h);
        const soundSpeed = (soundSpeedOf(body) + soundSpeedOf(other)) / 2;
        viscosity = (-VISCOSITY.linear * soundSpeed * squeeze + VISCOSITY.quadratic * squeeze * squeeze) / ((body.density + other.density) / 2);
      }
      const push = (other.mass * (pressureTerm + pressureOverDensitySquared(other) + viscosity) * slope) / distance;
      ax -= push * dx;
      ay -= push * dy;
    }
    body.ax += ax;
    body.ay += ay;
  });
}

function resmooth(bodies, isGas) {
  for (const body of bodies) {
    if (!isGas(body) || !body.density) continue;
    const wanted = NEIGHBOUR_SPACING * Math.sqrt(body.mass / body.density);
    body.smoothing = Math.min(WIDEST_SMOOTHING, body.smoothing * SMOOTHING_CHANGE_LIMIT, Math.max(body.smoothing / SMOOTHING_CHANGE_LIMIT, wanted));
    body.softening = body.smoothing;
  }
}

export function addGasPressure(bodies, isGas) {
  weighGas(bodies, isGas);
  pushApart(bodies, isGas);
  resmooth(bodies, isGas);
}
