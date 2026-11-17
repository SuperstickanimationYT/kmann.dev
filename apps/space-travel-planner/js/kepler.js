import { add, cross, dot, norm, scale, sub } from './vector.js';

const TWO_PI = 2 * Math.PI;
const SERIES_BELOW = 1e-6;
const TOLERANCE = 1e-12;
const MAX_STEPS = 100;

export function stumpffC(z) {
  if (Math.abs(z) < SERIES_BELOW) return 1 / 2 - z / 24 + (z * z) / 720;
  if (z > 0) return (1 - Math.cos(Math.sqrt(z))) / z;
  return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
}

export function stumpffS(z) {
  if (Math.abs(z) < SERIES_BELOW) return 1 / 6 - z / 120 + (z * z) / 5040;
  if (z > 0) {
    const root = Math.sqrt(z);
    return (root - Math.sin(root)) / root ** 3;
  }
  const root = Math.sqrt(-z);
  return (Math.sinh(root) - root) / root ** 3;
}

export function wrapAngle(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

export function eccentricAnomaly(meanAnomaly, e) {
  const wrapped = Math.atan2(Math.sin(meanAnomaly), Math.cos(meanAnomaly));
  let anomaly = wrapped + e * Math.sin(wrapped);
  for (let step = 0; step < MAX_STEPS; step++) {
    const change = (wrapped - (anomaly - e * Math.sin(anomaly))) / (1 - e * Math.cos(anomaly));
    anomaly += change;
    if (Math.abs(change) < TOLERANCE) return anomaly;
  }
  throw new Error(`Kepler's equation did not converge for M=${meanAnomaly}, e=${e}`);
}

export function trueFromEccentric(eccentric, e) {
  return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(eccentric / 2), Math.sqrt(1 - e) * Math.cos(eccentric / 2));
}

export function stateToElements(r, v, mu) {
  const distance = norm(r);
  const speed = norm(v);
  const radialSpeed = dot(r, v) / distance;
  const h = cross(r, v);
  const hNorm = norm(h);
  const i = Math.acos(h[2] / hNorm);
  const node = [-h[1], h[0], 0];
  const nodeNorm = norm(node);
  const eVector = scale(sub(scale(r, speed * speed - mu / distance), scale(v, distance * radialSpeed)), 1 / mu);
  const e = norm(eVector);
  const a = 1 / (2 / distance - (speed * speed) / mu);

  const equatorial = nodeNorm < TOLERANCE * hNorm;
  const circular = e < 1e-10;
  const raan = equatorial ? 0 : wrapAngle(Math.atan2(node[1], node[0]));
  const lineOfNodes = equatorial ? [1, 0, 0] : scale(node, 1 / nodeNorm);
  const inPlaneNormal = scale(cross(h, lineOfNodes), 1 / hNorm);
  const angleFromNodes = (vector) => wrapAngle(Math.atan2(dot(vector, inPlaneNormal), dot(vector, lineOfNodes)));

  const argPeriapsis = circular ? 0 : angleFromNodes(eVector);
  const trueAnomaly = wrapAngle(angleFromNodes(r) - argPeriapsis);
  return { a, e, i, raan, argPeriapsis, trueAnomaly, h: hNorm };
}

export function elementsToState({ a, e, i, raan, argPeriapsis, trueAnomaly }, mu) {
  const p = a * (1 - e * e);
  const distance = p / (1 + e * Math.cos(trueAnomaly));
  const rPlane = [distance * Math.cos(trueAnomaly), distance * Math.sin(trueAnomaly), 0];
  const speedScale = Math.sqrt(mu / p);
  const vPlane = [-speedScale * Math.sin(trueAnomaly), speedScale * (e + Math.cos(trueAnomaly)), 0];
  return { r: perifocalToInertial(rPlane, i, raan, argPeriapsis), v: perifocalToInertial(vPlane, i, raan, argPeriapsis) };
}

export function perifocalToInertial([x, y], i, raan, argPeriapsis) {
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosW = Math.cos(argPeriapsis);
  const sinW = Math.sin(argPeriapsis);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  return [
    (cosW * cosO - sinW * sinO * cosI) * x + (-sinW * cosO - cosW * sinO * cosI) * y,
    (cosW * sinO + sinW * cosO * cosI) * x + (-sinW * sinO + cosW * cosO * cosI) * y,
    sinW * sinI * x + cosW * sinI * y,
  ];
}

export function propagate(r0, v0, dt, mu) {
  const r0Norm = norm(r0);
  const radialSpeed = dot(r0, v0) / r0Norm;
  const alpha = 2 / r0Norm - dot(v0, v0) / mu;
  const rootMu = Math.sqrt(mu);
  const chi = universalAnomaly(dt, r0Norm, radialSpeed, alpha, mu);
  const z = alpha * chi * chi;
  const c = stumpffC(z);
  const s = stumpffS(z);

  const f = 1 - (chi * chi * c) / r0Norm;
  const g = dt - (chi ** 3 * s) / rootMu;
  const r = add(scale(r0, f), scale(v0, g));
  const rNorm = norm(r);
  const fDot = (rootMu / (rNorm * r0Norm)) * (alpha * chi ** 3 * s - chi);
  const gDot = 1 - (chi * chi * c) / rNorm;
  return { r, v: add(scale(r0, fDot), scale(v0, gDot)) };
}

function universalAnomaly(dt, r0, radialSpeed, alpha, mu) {
  const rootMu = Math.sqrt(mu);
  let chi = rootMu * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = (rootMu * dt) / r0;
  for (let step = 0; step < MAX_STEPS; step++) {
    const z = alpha * chi * chi;
    const c = stumpffC(z);
    const s = stumpffS(z);
    const lead = (r0 * radialSpeed) / rootMu;
    const value = lead * chi * chi * c + (1 - alpha * r0) * chi ** 3 * s + r0 * chi - rootMu * dt;
    const slope = lead * chi * (1 - z * s) + (1 - alpha * r0) * chi * chi * c + r0;
    const change = value / slope;
    chi -= change;
    if (Math.abs(change) < TOLERANCE * Math.max(1, Math.abs(chi))) return chi;
  }
  throw new Error(`Universal anomaly did not converge for dt=${dt}`);
}
