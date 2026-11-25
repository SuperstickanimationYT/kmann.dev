import { GRAVITY, within } from './spacecraft-paths.js';
import { add, scale, subtract } from './vectors.js';

const POINTS_PER_TURN = 180;
const DEEPEST_SPLIT = 6;
const STRAIGHT_ENOUGH = 0.006;
const ROWS_AROUND_PLANET = { past: 24, future: 10 };
const ROWS_AROUND_SUN = { past: 500, future: 500 };

function bent(from, middle, to) {
  const chord = Math.hypot(...subtract(to, from));
  return Math.hypot(...subtract(middle, scale(add(from, to), 0.5))) > STRAIGHT_ENOUGH * chord;
}

function splitWhereBent(from, to, pointAt, depth = 0) {
  const when = (from.when + to.when) / 2;
  const middle = { when, point: pointAt(when) };
  if (depth >= DEEPEST_SPLIT || (depth > 0 && !bent(from.point, middle.point, to.point))) return [from];
  return [...splitWhereBent(from, middle, pointAt, depth + 1), ...splitWhereBent(middle, to, pointAt, depth + 1)];
}

function samplesAlong({ centre, kind, rows }, ms, pointAt) {
  const sample = (when) => ({ when, point: pointAt(when) });
  if (kind === 'orbits') {
    const { a } = rows[0];
    const periodMs = 2 * Math.PI * Math.sqrt(a ** 3 / GRAVITY[centre]) * 1000;
    return Array.from({ length: POINTS_PER_TURN }, (_, k) => sample(ms + periodMs * (k / POINTS_PER_TURN - 0.5)));
  }
  const now = Math.max(0, rows.findLastIndex((row) => row.ms <= ms));
  const reach = centre === 'Sun' ? ROWS_AROUND_SUN : ROWS_AROUND_PLANET;
  const shown = rows.slice(Math.max(0, now - reach.past), now + reach.future).map((row) => sample(row.ms));
  return [...shown.slice(0, -1).flatMap((from, k) => splitWhereBent(from, shown[k + 1], pointAt)), shown.at(-1)];
}

export function createPathTracer() {
  const traced = new WeakMap();

  return function trace(stretch, ms, pointAt, isCurrent) {
    const row = stretch.kind === 'orbits' ? ms : stretch.rows.findLastIndex((candidate) => candidate.ms <= ms);
    if (traced.get(stretch)?.row !== row) traced.set(stretch, { row, samples: samplesAlong(stretch, ms, pointAt) });
    const { samples } = traced.get(stretch);
    const here = isCurrent || within(stretch, ms) ? [pointAt(ms)] : [];
    const past = samples.filter(({ when }) => when < ms).map(({ point }) => point);
    const future = samples.filter(({ when }) => when > ms).map(({ point }) => point);
    return { past: [...past, ...here], future: [...here, ...future] };
  };
}
