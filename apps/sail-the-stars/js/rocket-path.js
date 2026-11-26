import { coastedState } from './kepler.js';
import { add, cross, dot, normalize, scale } from './vectors.js';

const PATH_POINTS = 256;
const ROUND_ENOUGH = 1e-6;
const STRAIGHT_UP_OR_DOWN = 1e-9;
const WHOLE_TURN = 2 * Math.PI;

function conicOf({ positionKm, velocityKmS }, gm) {
  const distance = Math.hypot(...positionKm);
  const momentum = cross(positionKm, velocityKmS);
  const toPeriapsisVector = add(scale(cross(velocityKmS, momentum), 1 / gm), scale(positionKm, -1 / distance));
  const e = Math.hypot(...toPeriapsisVector);
  const toPeriapsis = e > ROUND_ENOUGH ? scale(toPeriapsisVector, 1 / e) : scale(positionKm, 1 / distance);
  const ahead = cross(normalize(momentum), toPeriapsis);
  const semiLatus = dot(momentum, momentum) / gm;
  const angleOf = (pointKm) => Math.atan2(dot(pointKm, ahead), dot(pointKm, toPeriapsis));
  const radiusAt = (angle) => semiLatus / (1 + e * Math.cos(angle));
  const pointAt = (angle) => scale(add(scale(toPeriapsis, Math.cos(angle)), scale(ahead, Math.sin(angle))), radiusAt(angle));
  return { e, startAngle: angleOf(positionKm), angleOf, radiusAt, pointAt };
}

const denserAtBothEnds = (share) => (1 - Math.cos(Math.PI * share)) / 2;
const turnedForward = (angle) => ((angle % WHOLE_TURN) + WHOLE_TURN) % WHOLE_TURN;

function straightUpOrDown({ start, finish, fromMs, toMs, gm }) {
  const seconds = (toMs - fromMs) / 1000;
  const pointsKm = Array.from({ length: PATH_POINTS + 1 }, (_, k) => {
    const { position } = coastedState({ position: start.positionKm, velocity: start.velocityKmS }, gm, seconds * denserAtBothEnds(k / PATH_POINTS));
    return position;
  });
  const distances = pointsKm.map((pointKm) => Math.hypot(...pointKm));
  const highest = distances.indexOf(Math.max(...distances));
  const turnsBack = highest > 0 && highest < PATH_POINTS && Math.hypot(...finish.positionKm) < distances[highest];
  return { pointsKm, marks: turnsBack ? [{ kind: 'highest', pointKm: pointsKm[highest], distanceKm: distances[highest] }] : [] };
}

export function segmentPath(segment, groundKm) {
  const { start, finish, gm, wholeTurn } = segment;
  const momentum = Math.hypot(...cross(start.positionKm, start.velocityKmS));
  if (momentum <= STRAIGHT_UP_OR_DOWN * Math.hypot(...start.positionKm) * Math.hypot(...start.velocityKmS)) return straightUpOrDown(segment);
  const conic = conicOf(start, gm);
  const sweep = wholeTurn ? WHOLE_TURN : turnedForward(conic.angleOf(finish.positionKm) - conic.startAngle);
  const pointsKm = Array.from({ length: PATH_POINTS + 1 }, (_, k) => conic.pointAt(conic.startAngle + sweep * denserAtBothEnds(k / PATH_POINTS)));
  const passes = (angle) => turnedForward(angle - conic.startAngle) < sweep;
  const marks = [];
  if (conic.e > ROUND_ENOUGH && passes(0) && conic.radiusAt(0) >= groundKm) marks.push({ kind: 'lowest', pointKm: conic.pointAt(0), distanceKm: conic.radiusAt(0) });
  if (conic.e > ROUND_ENOUGH && conic.e < 1 && passes(Math.PI)) marks.push({ kind: 'highest', pointKm: conic.pointAt(Math.PI), distanceKm: conic.radiusAt(Math.PI) });
  return { pointsKm, marks };
}
