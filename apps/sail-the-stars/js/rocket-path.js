import { add, cross, dot, normalize, scale } from './vectors.js';

const PATH_POINTS = 256;
const CROSSING_SEARCH_POINTS = 2048;
const CROSSING_BISECTIONS = 40;
const ROUND_ENOUGH = 1e-6;
const ESCAPE_ANGLE_MARGIN = 1e-6;
const STRAIGHT_UP_OR_DOWN = 1e-9;

function conicOf({ positionKm, velocityKmS }, gm) {
  const distance = Math.hypot(...positionKm);
  const momentum = cross(positionKm, velocityKmS);
  const toPeriapsisVector = add(scale(cross(velocityKmS, momentum), 1 / gm), scale(positionKm, -1 / distance));
  const e = Math.hypot(...toPeriapsisVector);
  const toPeriapsis = e > ROUND_ENOUGH ? scale(toPeriapsisVector, 1 / e) : scale(positionKm, 1 / distance);
  const ahead = cross(normalize(momentum), toPeriapsis);
  const semiLatus = dot(momentum, momentum) / gm;
  const startAngle = Math.atan2(dot(positionKm, ahead), dot(positionKm, toPeriapsis));
  const radiusAt = (angle) => semiLatus / (1 + e * Math.cos(angle));
  const pointAt = (angle) => scale(add(scale(toPeriapsis, Math.cos(angle)), scale(ahead, Math.sin(angle))), radiusAt(angle));
  return { e, semiLatus, startAngle, radiusAt, pointAt };
}

function sweepBeforeLeaving({ e, startAngle }) {
  if (e < 1) return 2 * Math.PI;
  return Math.acos(-1 / e) - ESCAPE_ANGLE_MARGIN - startAngle;
}

function firstCrossing(conic, sweep, outside) {
  const outsideAfter = (turned) => outside(conic.radiusAt(conic.startAngle + turned));
  let before = 0;
  for (let k = 1; k <= CROSSING_SEARCH_POINTS; k++) {
    const turned = (sweep * k) / CROSSING_SEARCH_POINTS;
    if (!outsideAfter(turned)) {
      before = turned;
      continue;
    }
    let after = turned;
    for (let step = 0; step < CROSSING_BISECTIONS; step++) {
      const middle = (before + after) / 2;
      if (outsideAfter(middle)) after = middle;
      else before = middle;
    }
    return after;
  }
  return null;
}

const denserAtBothEnds = (share) => (1 - Math.cos(Math.PI * share)) / 2;

function straightUpOrDown({ positionKm, velocityKmS }, { gm, groundKm, reachKm }) {
  const distance = Math.hypot(...positionKm);
  const outward = scale(positionKm, 1 / distance);
  const energy = dot(velocityKmS, velocityKmS) / 2 - gm / distance;
  const highestKm = energy < 0 ? -gm / energy : Infinity;
  const rising = dot(velocityKmS, outward) > 0;
  const turnsBack = rising && highestKm < reachKm;
  const farthest = rising ? Math.min(highestKm, reachKm) : distance;
  const line = (from, to) => Array.from({ length: PATH_POINTS + 1 }, (_, k) => scale(outward, from + (to - from) * denserAtBothEnds(k / PATH_POINTS)));
  const pointsKm = [...line(distance, farthest), ...(rising && !turnsBack ? [] : line(farthest, groundKm))];
  const marks = turnsBack ? [{ kind: 'highest', pointKm: scale(outward, highestKm), distanceKm: highestKm }] : [];
  return { pointsKm, marks, end: rising && !turnsBack ? 'leaves' : 'ground', lowestKm: 0, highestKm };
}

export function predictedPath(state, { gm, groundKm, reachKm }) {
  const momentum = Math.hypot(...cross(state.positionKm, state.velocityKmS));
  if (momentum <= STRAIGHT_UP_OR_DOWN * Math.hypot(...state.positionKm) * Math.hypot(...state.velocityKmS)) return straightUpOrDown(state, { gm, groundKm, reachKm });
  const conic = conicOf(state, gm);
  const sweep = sweepBeforeLeaving(conic);
  const hitsGround = firstCrossing(conic, sweep, (radius) => radius < groundKm);
  const leaves = firstCrossing(conic, sweep, (radius) => radius > reachKm);
  const ends = [
    { turned: hitsGround, end: 'ground' },
    { turned: leaves, end: 'leaves' },
  ].filter(({ turned }) => turned !== null);
  const { turned: shownSweep, end } = ends.length ? ends.reduce((first, next) => (next.turned < first.turned ? next : first)) : { turned: sweep, end: 'orbit' };
  const pointsKm = Array.from({ length: PATH_POINTS + 1 }, (_, k) => conic.pointAt(conic.startAngle + shownSweep * denserAtBothEnds(k / PATH_POINTS)));
  const passes = (angle) => ((angle - conic.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < shownSweep;
  const marks = [];
  if (conic.e > ROUND_ENOUGH && passes(0) && conic.radiusAt(0) >= groundKm) marks.push({ kind: 'lowest', pointKm: conic.pointAt(0), distanceKm: conic.radiusAt(0) });
  if (conic.e > ROUND_ENOUGH && conic.e < 1 && passes(Math.PI)) marks.push({ kind: 'highest', pointKm: conic.pointAt(Math.PI), distanceKm: conic.radiusAt(Math.PI) });
  return { pointsKm, marks, end, lowestKm: conic.radiusAt(0), highestKm: conic.e < 1 ? conic.radiusAt(Math.PI) : Infinity };
}
