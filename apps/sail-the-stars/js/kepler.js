import { add, cross, dot, scale, subtract } from './vectors.js';

const KEPLER_STEPS = 60;
const KEPLER_CLOSE_ENOUGH = 1e-11;
const SERIES_BELOW = 1e-4;

function stumpff(z) {
  if (Math.abs(z) < SERIES_BELOW) return { c: 0.5 - z / 24 + (z * z) / 720, s: 1 / 6 - z / 120 + (z * z) / 5040 };
  const root = Math.sqrt(Math.abs(z));
  if (z > 0) return { c: (1 - Math.cos(root)) / z, s: (root - Math.sin(root)) / root ** 3 };
  return { c: (Math.cosh(root) - 1) / -z, s: (Math.sinh(root) - root) / root ** 3 };
}

export function coastedState({ position, velocity }, mu, seconds) {
  const distance = Math.hypot(...position);
  const rootMu = Math.sqrt(mu);
  const alpha = 2 / distance - dot(velocity, velocity) / mu;
  const climb = dot(position, velocity) / rootMu;
  const period = alpha > 0 ? (2 * Math.PI) / (rootMu * alpha ** 1.5) : Infinity;
  const wanted = Number.isFinite(period) ? seconds - period * Math.round(seconds / period) : seconds;
  if (wanted === 0) return { position, velocity };
  const reached = (chi) => {
    const z = alpha * chi * chi;
    const { c, s } = stumpff(z);
    return {
      seconds: (climb * chi * chi * c + (1 - alpha * distance) * chi ** 3 * s + distance * chi) / rootMu,
      radius: climb * chi * (1 - z * s) + (1 - alpha * distance) * chi * chi * c + distance,
    };
  };
  const direction = Math.sign(wanted);
  let near = 0;
  let far = direction * Math.sqrt(distance);
  while (reached(far).seconds * direction < wanted * direction) {
    near = far;
    far *= 2;
  }
  let chi = (near + far) / 2;
  for (let step = 0; step < KEPLER_STEPS; step++) {
    const { seconds: at, radius } = reached(chi);
    const miss = at - wanted;
    if (Math.abs(miss) < KEPLER_CLOSE_ENOUGH * Math.max(1, Math.abs(wanted))) break;
    if (miss * direction > 0) far = chi;
    else near = chi;
    const next = chi - (miss * rootMu) / radius;
    chi = (next - near) * direction > 0 && (far - next) * direction > 0 ? next : (near + far) / 2;
  }
  const z = alpha * chi * chi;
  const { c, s } = stumpff(z);
  const { radius } = reached(chi);
  return {
    position: add(scale(position, 1 - (chi * chi * c) / distance), scale(velocity, wanted - (chi ** 3 * s) / rootMu)),
    velocity: add(scale(position, (rootMu / (radius * distance)) * chi * (z * s - 1)), scale(velocity, 1 - (chi * chi * c) / radius)),
  };
}

export const coasted = (state, mu, seconds) => coastedState(state, mu, seconds).position;

export function elementsOf({ position, velocity }, mu) {
  const distance = Math.hypot(...position);
  const momentum = cross(position, velocity);
  const h = Math.hypot(...momentum);
  const node = Math.atan2(momentum[0], -momentum[1]);
  const nodeward = [Math.cos(node), Math.sin(node), 0];
  const ahead = scale(cross(momentum, nodeward), 1 / h);
  const toPeriapsis = subtract(scale(cross(velocity, momentum), 1 / mu), scale(position, 1 / distance));
  const e = Math.hypot(...toPeriapsis);
  const periapsisArgument = Math.atan2(dot(toPeriapsis, ahead), dot(toPeriapsis, nodeward));
  const trueAnomaly = Math.atan2(dot(position, ahead), dot(position, nodeward)) - periapsisArgument;
  const eccentric = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2));
  return {
    a: 1 / (2 / distance - dot(velocity, velocity) / mu),
    e,
    inclination: Math.acos(momentum[2] / h),
    node,
    periapsisArgument,
    meanAnomaly: eccentric - e * Math.sin(eccentric),
  };
}

export function solveKepler(meanAnomaly, e) {
  let E = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let step = 0; step < 12; step++) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

export function orbitAxes({ a, e, inclination, node, periapsisArgument }) {
  const [cw, sw, cn, sn, ci, si] = [Math.cos(periapsisArgument), Math.sin(periapsisArgument), Math.cos(node), Math.sin(node), Math.cos(inclination), Math.sin(inclination)];
  return {
    along: scale([cw * cn - sw * sn * ci, cw * sn + sw * cn * ci, sw * si], a),
    across: scale([-sw * cn - cw * sn * ci, -sw * sn + cw * cn * ci, cw * si], a * Math.sqrt(1 - e * e)),
  };
}

export const pointAtEccentricAnomaly = ({ along, across }, e, E) => add(scale(along, Math.cos(E) - e), scale(across, Math.sin(E)));

export const orbitPoint = (elements) => pointAtEccentricAnomaly(orbitAxes(elements), elements.e, solveKepler(elements.meanAnomaly, elements.e));
