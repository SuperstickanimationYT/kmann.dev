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

export function windowsFrom(world, eye, cameFrom) {
  const out = [];
  for (const end of allEnds(world)) {
    if (end === cameFrom || end.pair.delay > 0 || !isOpen(end, world.time)) continue;
    const q = query(end, eye);
    if (q.dist < 1e-3 || !isPassable(end, q.side)) continue;
    const region = shadow(end, eye);
    if (region) out.push({ end, region, through: pairTransform(partner(end)), eye: apply(pairTransform(end), eye), cameFrom: partner(end) });
  }
  return out;
}

export function eachLayer(world, eye, visit) {
  let layers = 0;
  const walk = (eyeHere, cameFrom, map, depth, clips) => {
    if (layers++ >= MAX_LAYERS) return;
    visit({ map, depth, clips });
    if (depth >= MAX_DEPTH || scaleOf(map) < SMALLEST) return;
    for (const w of windowsFrom(world, eyeHere, cameFrom)) {
      walk(w.eye, w.cameFrom, compose(map, w.through), depth + 1, [...clips, { map, region: w.region }]);
    }
  };
  walk(eye, null, IDENTITY, 0, []);
}

export function seenAt(world, eye, p) {
  let map = IDENTITY, here = p, eyeHere = eye, cameFrom = null;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const w = windowsFrom(world, eyeHere, cameFrom).find((x) => pointInPolygon(here, x.region));
    if (!w) break;
    const into = pairTransform(w.end);
    map = compose(into, map);
    here = apply(into, here);
    eyeHere = w.eye;
    cameFrom = w.cameFrom;
  }
  return map;
}

export function moveEye(world, eye, target, framesBefore = null) {
  for (const end of allEnds(world)) {
    if (end.pair.delay > 0 || !isOpen(end, world.time)) continue;
    const l0 = apply(framesBefore?.get(end) ?? end.Tinv, eye), l1 = apply(end.Tinv, target);
    if (!crossesLocal(end, l0, l1) || !isPassable(end, query(end, eye).side)) continue;
    const T = pairTransform(end);
    return { eye: apply(T, target), back: pairTransform(partner(end)) };
  }
  return { eye: target, back: null };
}

export function easeCamera(camera, rate) {
  const flip = Math.sign(camera.a * camera.d - camera.b * camera.c);
  const s = scaleOf(camera);
  const angle = Math.atan2(camera.c, camera.a);
  const keep = Math.exp(-rate);
  const s2 = Math.exp(Math.log(s) * keep);
  const a2 = wrapAngle(angle) * keep;
  const x = camera.x * keep, y = camera.y * keep;
  const c = Math.cos(a2) * s2, sn = Math.sin(a2) * s2;
  return { a: c, b: -sn * flip, c: sn, d: c * flip, x, y };
}

export function toEyeSpace(camera, p) {
  return apply(invert(camera), p);
}
