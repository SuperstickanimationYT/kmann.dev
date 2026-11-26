import { coastedState, elementsOf } from './kepler.js';
import { add, subtract } from './vectors.js';

const MOST_SEGMENTS = 6;
const MOST_STEPS = 4000;
const SHORTEST_STEP_SECONDS = 1;
const MARGIN_SHARE_PER_STEP = 0.5;
const CROSSING_BISECTIONS = 40;
const LONGEST_FORECAST_SECONDS = 200 * 365.25 * 86400;

const coast = (state, gm, seconds) => {
  if (!seconds) return state;
  const { position, velocity } = coastedState({ position: state.positionKm, velocity: state.velocityKmS }, gm, seconds);
  return { positionKm: position, velocityKmS: velocity };
};

function rangeOf(state, gm) {
  const { a, e } = elementsOf({ position: state.positionKm, velocity: state.velocityKmS }, gm);
  const lowest = a * (1 - e);
  return { lowest: Number.isFinite(lowest) ? lowest : 0, highest: e < 1 && a > 0 ? a * (1 + e) : Infinity, periodSeconds: e < 1 && a > 0 ? 2 * Math.PI * Math.sqrt(a ** 3 / gm) : Infinity };
}

export function createMotions(wells, relativeNow, fromMs) {
  const stateAt = (name, ms) => {
    const well = wells.get(name);
    return coast(relativeNow.get(name), wells.get(well.parent).gm, (ms - fromMs) / 1000);
  };
  return { stateAt };
}

function watchedChildren(wells, holderName, range, motions, ms) {
  return [...wells.values()]
    .filter(({ parent }) => parent === holderName)
    .filter((child) => {
      const apart = Math.hypot(...motions.stateAt(child.body.name, ms).positionKm);
      return range.highest > apart - child.reachKm && range.lowest < apart + child.reachKm;
    });
}

function firstEvent(start, holder, children, { motions, fromMs, untilMs, groundKm, edgeKm }) {
  const reachKm = Math.min(holder.reachKm, edgeKm);
  const at = (seconds) => coast(start, holder.gm, seconds);
  const childFrom = (child, state, ms) => subtract(state.positionKm, motions.stateAt(child.body.name, ms).positionKm);
  const happening = (state, ms) => {
    const distance = Math.hypot(...state.positionKm);
    if (distance < groundKm) return { end: 'ground' };
    if (distance > reachKm) return { end: holder.reachKm <= edgeKm ? 'leaves' : 'edge' };
    const entered = children.find((child) => Math.hypot(...childFrom(child, state, ms)) < child.reachKm);
    return entered ? { end: 'enters', next: entered.body.name } : null;
  };
  const marginSeconds = (state, ms) => {
    const distance = Math.hypot(...state.positionKm);
    const speed = Math.hypot(...state.velocityKmS);
    const margins = [];
    if (groundKm > 0) margins.push((distance - groundKm) / speed);
    if (Number.isFinite(reachKm)) margins.push((reachKm - distance) / speed);
    for (const child of children) {
      const motion = motions.stateAt(child.body.name, ms);
      const closing = Math.hypot(...subtract(state.velocityKmS, motion.velocityKmS));
      margins.push((Math.hypot(...subtract(state.positionKm, motion.positionKm)) - child.reachKm) / closing);
    }
    return margins.length ? MARGIN_SHARE_PER_STEP * Math.min(...margins) : Infinity;
  };
  let seconds = 0;
  let state = start;
  const limit = (untilMs - fromMs) / 1000;
  for (let step = 0; step < MOST_STEPS && seconds < limit; step++) {
    const next = Math.min(limit, seconds + Math.max(SHORTEST_STEP_SECONDS, marginSeconds(state, fromMs + seconds * 1000)));
    const nextState = at(next);
    const event = happening(nextState, fromMs + next * 1000);
    if (!event) {
      seconds = next;
      state = nextState;
      continue;
    }
    let [before, after] = [seconds, next];
    for (let k = 0; k < CROSSING_BISECTIONS; k++) {
      const middle = (before + after) / 2;
      if (happening(at(middle), fromMs + middle * 1000)) after = middle;
      else before = middle;
    }
    const found = happening(at(after), fromMs + after * 1000);
    return { ...found, seconds: after, state: at(after) };
  }
  const bound = rangeOf(start, holder.gm).periodSeconds <= limit + SHORTEST_STEP_SECONDS;
  return { end: seconds < limit ? 'unfinished' : bound ? 'orbit' : 'horizon', seconds, state };
}

export function forecastPath(state, { wells, motions, fromMs, groundKm, edgeKm }) {
  const met = new Map();
  const segments = [];
  let current = { holder: state.holder, positionKm: state.positionKm, velocityKmS: state.velocityKmS };
  let ms = fromMs;
  const lastMs = fromMs + LONGEST_FORECAST_SECONDS * 1000;
  while (segments.length < MOST_SEGMENTS) {
    const holder = wells.get(current.holder);
    const range = rangeOf(current, holder.gm);
    const untilMs = Math.min(lastMs, ms + range.periodSeconds * 1000);
    const children = watchedChildren(wells, current.holder, range, motions, ms);
    const ground = segments.length ? groundKm(holder.body) : Math.min(groundKm(holder.body), Math.hypot(...current.positionKm));
    const event = firstEvent(current, holder, children, { motions, fromMs: ms, untilMs, groundKm: ground, edgeKm });
    const toMs = ms + event.seconds * 1000;
    segments.push({ holder: current.holder, fromMs: ms, toMs, start: current, finish: event.state, end: event.end, next: event.next ?? holder.parent, met: met.get(current.holder) ?? null, gm: holder.gm, groundKm: ground, wholeTurn: event.end === 'orbit' && Number.isFinite(range.periodSeconds) });
    if (event.end === 'enters') {
      const motion = motions.stateAt(event.next, toMs);
      met.set(event.next, { parent: current.holder, offsetKm: motion.positionKm });
      current = { holder: event.next, positionKm: subtract(event.state.positionKm, motion.positionKm), velocityKmS: subtract(event.state.velocityKmS, motion.velocityKmS) };
    } else if (event.end === 'leaves') {
      const motion = motions.stateAt(current.holder, toMs);
      current = { holder: holder.parent, positionKm: add(event.state.positionKm, motion.positionKm), velocityKmS: add(event.state.velocityKmS, motion.velocityKmS) };
    } else break;
    ms = toMs;
  }
  return segments;
}
