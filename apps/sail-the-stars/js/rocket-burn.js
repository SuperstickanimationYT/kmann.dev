import { coast, rangeOf } from './rocket-forecast.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';

const ROUND_ENOUGH = 1e-6;
const STRAIGHT_UP_OR_DOWN = 1e-9;
const WHOLE_TURN = 2 * Math.PI;
const APPROACH_SAMPLES = 120;
const APPROACH_REFINEMENTS = 40;
const GOLDEN_SHARE = (Math.sqrt(5) - 1) / 2;

function sidewaysOf(direction) {
  const leastAligned = Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  return normalize(cross(direction, leastAligned));
}

export function burnAxes({ positionKm, velocityKmS }) {
  const prograde = normalize(velocityKmS);
  const momentum = cross(positionKm, velocityKmS);
  const straight = Math.hypot(...momentum) <= STRAIGHT_UP_OR_DOWN * Math.hypot(...positionKm) * Math.hypot(...velocityKmS);
  const normal = straight ? sidewaysOf(prograde) : normalize(momentum);
  return { prograde, normal, radial: cross(prograde, normal) };
}

export function burnKmS(state, [prograde, normal, radial]) {
  const axes = burnAxes(state);
  return add(add(scale(axes.prograde, prograde), scale(axes.normal, normal)), scale(axes.radial, radial));
}

export function stateOnPath(segments, ms) {
  const found = segments.findIndex(({ toMs }) => ms <= toMs);
  const index = found < 0 ? segments.length - 1 : found;
  const { holder, start, gm, fromMs } = segments[index];
  return { index, holder, state: coast(start, gm, (ms - fromMs) / 1000) };
}

export function cutAtBurn(segments, { index, state }, ms) {
  const segment = segments[index];
  const wholeTurn = (ms - segment.fromMs) / 1000 >= rangeOf(segment.start, segment.gm).periodSeconds;
  return [...segments.slice(0, index), { ...segment, toMs: ms, finish: state, end: 'burn', next: null, wholeTurn }];
}

const forwardAngle = (angle) => ((angle % WHOLE_TURN) + WHOLE_TURN) % WHOLE_TURN;

export function secondsToApsis({ positionKm, velocityKmS }, gm, kind) {
  const distance = Math.hypot(...positionKm);
  const momentum = cross(positionKm, velocityKmS);
  const toPeriapsis = subtract(scale(cross(velocityKmS, momentum), 1 / gm), scale(positionKm, 1 / distance));
  const e = Math.hypot(...toPeriapsis);
  if (e < ROUND_ENOUGH || !Math.hypot(...momentum)) return null;
  const periapsisward = scale(toPeriapsis, 1 / e);
  const ahead = cross(normalize(momentum), periapsisward);
  const trueAnomaly = Math.atan2(dot(positionKm, ahead), dot(positionKm, periapsisward));
  const a = 1 / (2 / distance - dot(velocityKmS, velocityKmS) / gm);
  if (e < 1) {
    const eccentric = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(trueAnomaly / 2), Math.sqrt(1 + e) * Math.cos(trueAnomaly / 2));
    const meanAnomaly = eccentric - e * Math.sin(eccentric);
    const wanted = forwardAngle((kind === 'lowest' ? 0 : Math.PI) - meanAnomaly) || WHOLE_TURN;
    return wanted / Math.sqrt(gm / a ** 3);
  }
  if (kind === 'highest' || trueAnomaly >= 0) return null;
  const hyperbolic = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(trueAnomaly / 2));
  return -(e * Math.sinh(hyperbolic) - hyperbolic) / Math.sqrt(gm / (-a) ** 3);
}

function nearestOnLeg(leg, target, motions) {
  const relativeAt = (ms) => {
    const rocket = coast(leg.start, leg.gm, (ms - leg.fromMs) / 1000);
    const aimed = motions.between(leg.holder, target, ms);
    return {
      ms,
      pointKm: rocket.positionKm,
      targetKm: aimed.positionKm,
      apartKm: Math.hypot(...subtract(rocket.positionKm, aimed.positionKm)),
      speedKmS: Math.hypot(...subtract(rocket.velocityKmS, aimed.velocityKmS)),
    };
  };
  const span = leg.toMs - leg.fromMs;
  const samples = Array.from({ length: APPROACH_SAMPLES + 1 }, (_, k) => relativeAt(leg.fromMs + (span * k) / APPROACH_SAMPLES));
  const best = samples.reduce((nearest, sample, k) => (sample.apartKm < samples[nearest].apartKm ? k : nearest), 0);
  let [low, high] = [samples[Math.max(0, best - 1)].ms, samples[Math.min(APPROACH_SAMPLES, best + 1)].ms];
  for (let k = 0; k < APPROACH_REFINEMENTS; k++) {
    const early = high - GOLDEN_SHARE * (high - low);
    const late = low + GOLDEN_SHARE * (high - low);
    if (relativeAt(early).apartKm < relativeAt(late).apartKm) high = late;
    else low = early;
  }
  const refined = relativeAt((low + high) / 2);
  return refined.apartKm < samples[best].apartKm ? refined : samples[best];
}

export function closestApproach(legs, target, motions) {
  let closest = null;
  legs.forEach((leg, index) => {
    if (leg.toMs <= leg.fromMs) return;
    const nearest = nearestOnLeg(leg, target, motions);
    if (!closest || nearest.apartKm < closest.apartKm) closest = { ...nearest, index, holder: leg.holder };
  });
  return closest;
}
