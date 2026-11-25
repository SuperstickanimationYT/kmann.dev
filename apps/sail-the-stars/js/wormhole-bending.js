import { DEFLECTION_SAMPLES, IMAGE_SAMPLES, skyAngleOfSample } from './light-bending.js';

const LEAST_EXCESS = 1e-5;
const DEEPEST_PASSAGE = 11.5;
const MOST_HALVINGS = 12;
const CONVERGED = 1e-15;
const LEAST_SQUARE = 1e-24;

export const PASSAGES_PER_DEPTH = (IMAGE_SAMPLES - 1) / DEEPEST_PASSAGE;
const passageAngle = (edge, index) => -edge * Math.expm1(-index / PASSAGES_PER_DEPTH);

const halfTurn = (a, b) => {
  let [mean, other] = [a, b];
  for (let halving = 0; halving < MOST_HALVINGS; halving++) [mean, other] = [(mean + other) / 2, Math.sqrt(mean * other)];
  return Math.PI / (2 * mean);
};

function partTurn(a, b, limit) {
  let [mean, other, phase, doubled] = [a, b, limit, 1];
  for (let halving = 0; halving < MOST_HALVINGS && mean - other > CONVERGED * mean; halving++) {
    const wholeTurns = Math.PI * Math.round(phase / Math.PI);
    phase += wholeTurns + Math.atan((other / mean) * Math.tan(phase - wholeTurns));
    [mean, other, doubled] = [(mean + other) / 2, Math.sqrt(mean * other), 2 * doubled];
  }
  return phase / (doubled * mean);
}

const turnFromThroat = (a, b, along, leaving) => halfTurn(a, b) + (leaving ? -1 : 1) * partTurn(a, b, Math.atan(along / b));

const legOf = (hypotenuse, side) => Math.sqrt(Math.max(LEAST_SQUARE, (hypotenuse - side) * (hypotenuse + side)));

function azimuthReturning({ depth, reach, radius }, angle) {
  const impact = reach * Math.sin(angle);
  const leaving = angle > Math.PI / 2;
  if (impact < radius) return impact * turnFromThroat(radius, legOf(radius, impact), depth, leaving);
  return impact * turnFromThroat(impact, legOf(impact, radius), reach * Math.abs(Math.cos(angle)), leaving);
}

function azimuthThrough({ depth, reach, radius }, angle) {
  const impact = reach * Math.sin(angle);
  return impact * turnFromThroat(radius, legOf(radius, impact), depth, false);
}

export function wormholeBendingAt(depth, radius) {
  const place = { depth, radius, reach: Math.hypot(depth, radius) };
  const shadow = Math.atan2(radius, depth);
  const leastLog = Math.log(LEAST_EXCESS * shadow);
  const logSpan = Math.log(0.9999 * (Math.PI - shadow)) - leastLog;
  const angles = Array.from({ length: DEFLECTION_SAMPLES }, (_, k) => shadow + Math.exp(leastLog + (logSpan * k) / (DEFLECTION_SAMPLES - 1)));
  const deflections = Float32Array.from(angles, (angle) => angle - Math.PI + azimuthReturning(place, angle));
  const passages = Float32Array.from({ length: IMAGE_SAMPLES }, (_, k) => azimuthThrough(place, passageAngle(shadow, k)));
  return { depth, reach: place.reach, shadow, leastLog, logSpan, angles, deflections, passages };
}

function lastPassageBefore(passages, azimuth) {
  let low = 0;
  let high = IMAGE_SAMPLES - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (passages[middle] <= azimuth) low = middle;
    else high = middle;
  }
  return low;
}

export function farStarImages({ shadow, passages }) {
  const images = new Float32Array(2 * 2 * IMAGE_SAMPLES);
  for (const second of [0, 1]) {
    for (let k = 0; k < IMAGE_SAMPLES; k++) {
      const skyAngle = skyAngleOfSample(k);
      const azimuth = second ? 2 * Math.PI - skyAngle : skyAngle;
      const low = lastPassageBefore(passages, azimuth);
      const [from, to] = [passageAngle(shadow, low), passageAngle(shadow, low + 1)];
      const slope = (to - from) / (passages[low + 1] - passages[low]);
      const seen = from + slope * (Math.min(azimuth, passages[low + 1]) - passages[low]);
      const at = 2 * (second * IMAGE_SAMPLES + k);
      images[at] = seen;
      images[at + 1] = Math.abs((Math.sin(seen) * slope) / Math.sin(skyAngle));
    }
  }
  return images;
}
