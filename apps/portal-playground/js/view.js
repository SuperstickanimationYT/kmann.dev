import { add, sub, mul, normalize, apply, compose, invert, scaleOf, wrapAngle, pointInPolygon, IDENTITY } from './geom.js';
import { partner, pairTransform, query, worldCurve, isPassable, crossesLocal } from './portals.js';
import { allEnds, isOpen } from './physics.js';

export const MAX_DEPTH = 4;
const MAX_LAYERS = 40;
const FAR = 400;
const SMALLEST = 0.02;

export function shadow(end, eye) {
  const curve = worldCurve(end);
  if (end.closed) return pointInPolygon(eye, curve) ? null : curve;
  const away = (p) => add(p, mul(normalize(sub(p, eye)), FAR));
  return [...curve, away(curve[curve.length - 1]), away(curve[0])];
}

export function windowsFrom(world, eye, level, cameFrom) {
  const out = [];
  for (const end of allEnds(world)) {
    if (end.level !== level || end === cameFrom || end.pair.delay > 0 || !isOpen(end, world.time)) continue;
    const q = query(end, eye);
    if (q.dist < 1e-3 || !isPassable(end, q.side)) continue;
    const region = shadow(end, eye);
    const to = partner(end);
    if (region) out.push({ end, region, level: to.level, through: pairTransform(to), eye: apply(pairTransform(end), eye), cameFrom: to });
  }
  return out;
}

export function eachLayer(world, eye, level, visit) {
  let layers = 0;
  const walk = (eyeHere, levelHere, cameFrom, map, depth, clips) => {
    if (layers++ >= MAX_LAYERS) return;
    visit({ map, depth, clips, level: levelHere, cameFrom });
    if (depth >= MAX_DEPTH || scaleOf(map) < SMALLEST) return;
    for (const w of windowsFrom(world, eyeHere, levelHere, cameFrom)) {
      walk(w.eye, w.level, w.cameFrom, compose(map, w.through), depth + 1, [...clips, { map, region: w.region }]);
    }
  };
  walk(eye, level, null, IDENTITY, 0, []);
}

export function seenAt(world, eye, level, p) {
  let map = IDENTITY, here = p, eyeHere = eye, cameFrom = null;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const w = windowsFrom(world, eyeHere, level, cameFrom).find((x) => pointInPolygon(here, x.region));
    if (!w) break;
    const into = pairTransform(w.end);
    map = compose(into, map);
    here = apply(into, here);
    eyeHere = w.eye;
    level = w.level;
    cameFrom = w.cameFrom;
  }
  return { map, level };
}

export function moveEye(world, eye, level, target, framesBefore = null) {
  for (const end of allEnds(world)) {
    if (end.level !== level || end.pair.delay > 0 || !isOpen(end, world.time)) continue;
    const l0 = apply(framesBefore?.get(end) ?? end.Tinv, eye), l1 = apply(end.Tinv, target);
    if (!crossesLocal(end, l0, l1) || !isPassable(end, query(end, eye).side)) continue;
    const T = pairTransform(end);
    return { eye: apply(T, target), level: partner(end).level, back: pairTransform(partner(end)) };
  }
  return { eye: target, level, back: null };
}

export function easeCamera(camera, rate, pivot, target) {
  const flip = Math.sign(camera.a * camera.d - camera.b * camera.c);
  const s = scaleOf(camera);
  const angle = Math.atan2(camera.c, camera.a);
  const keep = Math.exp(-rate);
  const s2 = Math.exp(Math.log(s) * keep);
  const a2 = wrapAngle(angle) * keep;
  const c = Math.cos(a2) * s2, sn = Math.sin(a2) * s2;
  const linear = { a: c, b: -sn * flip, c: sn, d: c * flip, x: 0, y: 0 };
  const shown = apply(camera, pivot);
  const goal = add(target, mul(sub(shown, target), keep));
  const moved = sub(goal, apply(linear, pivot));
  return { ...linear, x: moved.x, y: moved.y };
}

export function toEyeSpace(camera, p) {
  return apply(invert(camera), p);
}
