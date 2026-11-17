import { add, cross, norm, scale, sub } from './vector.js';

const TOLERANCE = 1e-11;
const MAX_STEPS = 35;
const SERIES_WINDOW = [Math.sqrt(0.6), Math.sqrt(1.4)];

export function lambert(r1, r2, timeOfFlight, mu, { prograde = true } = {}) {
  if (!(timeOfFlight > 0)) throw new Error('Time of flight must be positive');
  const r1Norm = norm(r1);
  const r2Norm = norm(r2);
  const chord = norm(sub(r2, r1));
  const semiperimeter = (r1Norm + r2Norm + chord) / 2;

  const radial1 = scale(r1, 1 / r1Norm);
  const radial2 = scale(r2, 1 / r2Norm);
  let normal = cross(radial1, radial2);
  const normalNorm = norm(normal);
  if (normalNorm < 1e-12) throw new Error('Start and end are collinear with the central body, so the transfer plane is undefined');
  normal = scale(normal, 1 / normalNorm);

  let lambda = Math.sqrt(Math.max(0, 1 - chord / semiperimeter));
  if (normal[2] < 0) {
    lambda = -lambda;
    normal = scale(normal, -1);
  }
  let tangent1 = cross(normal, radial1);
  let tangent2 = cross(normal, radial2);
  if (!prograde) {
    lambda = -lambda;
    tangent1 = scale(tangent1, -1);
    tangent2 = scale(tangent2, -1);
  }

  const dimensionlessTime = Math.sqrt((2 * mu) / semiperimeter ** 3) * timeOfFlight;
  const x = solveX(lambda, dimensionlessTime);
  const y = yFromX(x, lambda);

  const gamma = Math.sqrt((mu * semiperimeter) / 2);
  const rho = (r1Norm - r2Norm) / chord;
  const sigma = Math.sqrt(1 - rho * rho);
  const radialSpeed1 = (gamma * ((lambda * y - x) - rho * (lambda * y + x))) / r1Norm;
  const radialSpeed2 = (-gamma * ((lambda * y - x) + rho * (lambda * y + x))) / r2Norm;
  const tangentialSpeed1 = (gamma * sigma * (y + lambda * x)) / r1Norm;
  const tangentialSpeed2 = (gamma * sigma * (y + lambda * x)) / r2Norm;

  return {
    v1: add(scale(radial1, radialSpeed1), scale(tangent1, tangentialSpeed1)),
    v2: add(scale(radial2, radialSpeed2), scale(tangent2, tangentialSpeed2)),
  };
}

function yFromX(x, lambda) {
  return Math.sqrt(1 - lambda * lambda * (1 - x * x));
}

function solveX(lambda, targetTime) {
  let x = initialGuess(lambda, targetTime);
  for (let step = 0; step < MAX_STEPS; step++) {
    const y = yFromX(x, lambda);
    const time = timeFromX(x, y, lambda);
    const error = time - targetTime;
    const lambda2 = lambda * lambda;
    const lambda3 = lambda2 * lambda;
    const lambda5 = lambda3 * lambda2;
    const oneMinusX2 = 1 - x * x;
    const d1 = (3 * time * x - 2 + (2 * lambda3 * x) / y) / oneMinusX2;
    const d2 = (3 * time + 5 * x * d1 + (2 * (1 - lambda2) * lambda3) / y ** 3) / oneMinusX2;
    const d3 = (7 * x * d2 + 8 * d1 - (6 * (1 - lambda2) * lambda5 * x) / y ** 5) / oneMinusX2;
    const householderStep =
      (error * (d1 * d1 - (error * d2) / 2)) / (d1 * (d1 * d1 - error * d2) + (d3 * error * error) / 6);
    x -= householderStep;
    if (Math.abs(householderStep) < TOLERANCE) return x;
  }
  throw new Error(`Lambert solver did not converge for lambda=${lambda}, T=${targetTime}`);
}

function initialGuess(lambda, targetTime) {
  const parabolicTime = (2 / 3) * (1 - lambda ** 3);
  const minimumEnergyTime = Math.acos(lambda) + lambda * Math.sqrt(1 - lambda * lambda);
  if (targetTime >= minimumEnergyTime) return (minimumEnergyTime / targetTime) ** (2 / 3) - 1;
  if (targetTime < parabolicTime) {
    return ((5 / 2) * parabolicTime * (parabolicTime - targetTime)) / (targetTime * (1 - lambda ** 5)) + 1;
  }
  return Math.exp((Math.LN2 * Math.log(targetTime / minimumEnergyTime)) / Math.log(parabolicTime / minimumEnergyTime)) - 1;
}

function timeFromX(x, y, lambda) {
  if (x > SERIES_WINDOW[0] && x < SERIES_WINDOW[1]) {
    const eta = y - lambda * x;
    const s1 = (1 - lambda - x * eta) / 2;
    const q = (4 / 3) * hypergeometric(s1);
    return (eta ** 3 * q + 4 * lambda * eta) / 2;
  }
  const oneMinusX2 = 1 - x * x;
  return (anomalyPsi(x, y, lambda) / Math.sqrt(Math.abs(oneMinusX2)) - x + lambda * y) / oneMinusX2;
}

function anomalyPsi(x, y, lambda) {
  if (x < 1) return Math.acos(x * y + lambda * (1 - x * x));
  return Math.asinh((y - x * lambda) * Math.sqrt(x * x - 1));
}

function hypergeometric(z) {
  let sum = 1;
  let term = 1;
  for (let n = 0; n < 1000; n++) {
    term *= (((3 + n) * (1 + n)) / (2.5 + n)) * (z / (n + 1));
    sum += term;
    if (Math.abs(term) < 1e-16) return sum;
  }
  return sum;
}
