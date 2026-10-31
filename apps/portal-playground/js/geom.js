export const V = (x, y) => ({ x, y });
export const ZERO = V(0, 0);
export const add = (a, b) => V(a.x + b.x, a.y + b.y);
export const sub = (a, b) => V(a.x - b.x, a.y - b.y);
export const mul = (a, s) => V(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const perp = (a) => V(-a.y, a.x);
export const spinVelocity = (w, r) => V(-w * r.y, w * r.x);
export const lerp = (a, b, t) => a + (b - a) * t;

export function normalize(a) {
  const l = len(a);
  return l > 1e-12 ? V(a.x / l, a.y / l) : V(0, 0);
}

export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function poseTransform(x, y, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { a: c, b: -s, c: s, d: c, x, y };
}

export function diagonal(gx, gy) {
  return { a: gx, b: 0, c: 0, d: gy, x: 0, y: 0 };
}

export function compose(p, q) {
  return {
    a: p.a * q.a + p.b * q.c,
    b: p.a * q.b + p.b * q.d,
    c: p.c * q.a + p.d * q.c,
    d: p.c * q.b + p.d * q.d,
    x: p.a * q.x + p.b * q.y + p.x,
    y: p.c * q.x + p.d * q.y + p.y,
  };
}

export function invertRigid(t) {
  const a = t.a, b = t.c, c = t.b, d = t.d;
  return { a, b, c, d, x: -(a * t.x + b * t.y), y: -(c * t.x + d * t.y) };
}

export const apply = (t, p) => V(t.a * p.x + t.b * p.y + t.x, t.c * p.x + t.d * p.y + t.y);
export const applyLinear = (t, v) => V(t.a * v.x + t.b * v.y, t.c * v.x + t.d * v.y);
export const applyLinearInverse = (t, v) => V(t.a * v.x + t.c * v.y, t.b * v.x + t.d * v.y);
export const det = (t) => t.a * t.d - t.b * t.c;

export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  return { point: add(a, mul(ab, t)), t };
}

export function segmentsCross(p, q, a, b) {
  const r = sub(q, p);
  const s = sub(b, a);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const ap = sub(a, p);
  const t = cross(ap, s) / denom;
  const u = cross(ap, r) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u < 1 ? t : null;
}

export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
