import {
  V, ZERO, add, sub, mul, dot, cross, len, perp, normalize, wrapAngle, spinVelocity,
  apply, applyLinear, applyLinearInverse, det, invertRigid,
} from './geom.js';
import {
  POST_RADIUS, partner, isPassable, refreshTransform, poseAt, pairTransform, frameVelocity,
  query, queryLocal, crossesLocal, postPoints,
} from './portals.js';

const ITERATIONS = 10;
const BAUMGARTE = 0.2;
const SLOP = 0.005;
const SURFACE_EPS = 0.01;
const MAX_SPEED = 45;
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 };

let nextId = 1;

export function createWorld() {
  return { bodies: [], walls: [], pairs: [], lasers: [], time: 0, gravity: 9.8, grab: null };
}

export function allEnds(world) {
  return world.pairs.flatMap((p) => p.ends);
}

function polygonFrom(verts) {
  const normals = verts.map((v, i) => {
    const w = verts[(i + 1) % verts.length];
    return normalize(V(w.y - v.y, -(w.x - v.x)));
  });
  return { type: 'poly', v: verts, n: normals };
}

function boxVerts(w, h) {
  return [V(-w / 2, -h / 2), V(w / 2, -h / 2), V(w / 2, h / 2), V(-w / 2, h / 2)];
}

function polygonMass(verts, density) {
  let area = 0, inertia = 0, cx = 0, cy = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const c = cross(a, b);
    area += c / 2;
    cx += ((a.x + b.x) * c) / 6;
    cy += ((a.y + b.y) * c) / 6;
    inertia += (c * (dot(a, a) + dot(a, b) + dot(b, b))) / 12;
  }
  const centroid = V(cx / area, cy / area);
  const mass = density * area;
  return { mass, centroid, inertia: density * inertia - mass * dot(centroid, centroid) };
}

function makeBody(fields) {
  const body = {
    id: nextId++, x: 0, y: 0, angle: 0, flip: false, vx: 0, vy: 0, w: 0,
    friction: 0.5, restitution: 0.15, ...fields,
  };
  body.invMass = 1 / body.mass;
  body.invInertia = 1 / body.inertia;
  return body;
}

export function makeBox(x, y, w, h, color = '#d9a35b') {
  const verts = boxVerts(w, h);
  const { mass, inertia } = polygonMass(verts, 1);
  return makeBody({ kind: 'box', size: Math.max(w, h), x, y, verts, r: Math.hypot(w, h) / 2, mass, inertia, color });
}

export function makeBall(x, y, r, color = '#7fc8ff') {
  const mass = Math.PI * r * r;
  return makeBody({ kind: 'ball', size: r * 2, x, y, radius: r, r, mass, inertia: (mass * r * r) / 2, color, restitution: 0.45 });
}

export function makeWedge(x, y, size, color = '#c98bff') {
  const raw = [V(0, 0), V(size, 0), V(0, size * 0.75)];
  const { mass, inertia, centroid } = polygonMass(raw, 1);
  const verts = raw.map((v) => sub(v, centroid));
  return makeBody({ kind: 'wedge', size, x, y, verts, r: Math.max(...verts.map(len)), mass, inertia, color });
}

export function makeWall(x, y, length, thickness, angle = 0) {
  const wall = { id: nextId++, x, y, length, thickness, angle };
  refreshWall(wall);
  return wall;
}

export function refreshWall(wall) {
  const c = Math.cos(wall.angle), s = Math.sin(wall.angle);
  const verts = boxVerts(wall.length, wall.thickness).map((v) => V(wall.x + v.x * c - v.y * s, wall.y + v.x * s + v.y * c));
  wall.shape = polygonFrom(verts);
  wall.box = boundsOf(verts, 0);
}

export function makeLaser(x, y, angle, color = '#ff4d4d') {
  return { id: nextId++, x, y, angle, color };
}

export function bodyMatrix(body) {
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  const f = body.flip ? -1 : 1;
  return { a: c, b: -s * f, c: s, d: c * f, x: body.x, y: body.y };
}

export function bodyShape(body, t = IDENTITY) {
  const m = bodyMatrix(body);
  if (body.kind === 'ball') return { type: 'circle', c: apply(t, V(body.x, body.y)), r: body.radius };
  let verts = body.verts.map((v) => apply(t, apply(m, v)));
  if ((det(m) < 0) !== (det(t) < 0)) verts = verts.reverse();
  return polygonFrom(verts);
}

function boundsOf(points, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}

function shapeBounds(shape) {
  return shape.type === 'circle'
    ? { x0: shape.c.x - shape.r, y0: shape.c.y - shape.r, x1: shape.c.x + shape.r, y1: shape.c.y + shape.r }
    : boundsOf(shape.v, 0.02);
}

const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

export function buildCopies(world, body, h = 0) {
  const c = V(body.x, body.y);
  const reach = body.r + 2 * h * Math.hypot(body.vx, body.vy) + 0.05;
  const home = { body, T: IDENTITY, from: null, to: null, straddles: [] };
  const copies = [home];
  for (const pair of world.pairs) {
    for (const end of pair.ends) {
      const q = query(end, c);
      if (q.dist >= reach || !q.interior || !isPassable(end, q.side)) continue;
      const T = pairTransform(end);
      const to = partner(end);
      home.straddles.push({ end, side: q.side });
      copies.push({ body, T, from: end, to, homeSide: q.side, exitSide: -query(to, apply(T, c)).side, straddles: [] });
    }
  }
  for (const copy of copies) {
    copy.shape = bodyShape(body, copy.T);
    copy.box = shapeBounds(copy.shape);
  }
  return copies;
}

export function isValidPoint(copy, q) {
  if (!copy || !copy.body) return true;
  if (copy.to) {
    const s = query(copy.to, q);
    return (s.interior || s.dist < 2 * POST_RADIUS) && s.d * copy.exitSide > SURFACE_EPS;
  }
  for (const { end, side } of copy.straddles) {
    const s = query(end, q);
    if (s.interior && s.d * side < SURFACE_EPS && s.dist < copy.body.r * 2 + 1) return false;
  }
  return true;
}

function clipSegment(points, normal, offset) {
  const out = [];
  const d0 = dot(normal, points[0]) - offset;
  const d1 = dot(normal, points[1]) - offset;
  if (d0 <= 0) out.push(points[0]);
  if (d1 <= 0) out.push(points[1]);
  if (d0 * d1 < 0) out.push(add(points[0], mul(sub(points[1], points[0]), d0 / (d0 - d1))));
  return out;
}

function maxSeparation(a, b) {
  let best = -Infinity, index = 0;
  for (let i = 0; i < a.v.length; i++) {
    const n = a.n[i], v = a.v[i];
    let s = Infinity;
    for (const w of b.v) s = Math.min(s, dot(n, sub(w, v)));
    if (s > best) { best = s; index = i; }
  }
  return { sep: best, index };
}

function collidePolygons(a, b) {
  const sa = maxSeparation(a, b);
  if (sa.sep > 0) return [];
  const sb = maxSeparation(b, a);
  if (sb.sep > 0) return [];
  const flipped = sb.sep > sa.sep + 0.0005;
  const ref = flipped ? b : a;
  const inc = flipped ? a : b;
  const index = flipped ? sb.index : sa.index;
  const n = ref.n[index];
  let j = 0, least = Infinity;
  for (let i = 0; i < inc.n.length; i++) {
    const d = dot(n, inc.n[i]);
    if (d < least) { least = d; j = i; }
  }
  const r1 = ref.v[index], r2 = ref.v[(index + 1) % ref.v.length];
  const tangent = normalize(sub(r2, r1));
  let pts = [inc.v[j], inc.v[(j + 1) % inc.v.length]];
  pts = clipSegment(pts, mul(tangent, -1), -dot(tangent, r1));
  if (pts.length < 2) return [];
  pts = clipSegment(pts, tangent, dot(tangent, r2));
  if (pts.length < 2) return [];
  const normal = flipped ? mul(n, -1) : n;
  const out = [];
  for (const p of pts) {
    const sep = dot(n, sub(p, r1));
    if (sep <= 0) out.push({ p: add(p, mul(n, -sep / 2)), n: normal, depth: -sep });
  }
  return out;
}

function collidePolygonCircle(poly, c, r) {
  let best = -Infinity, index = 0;
  for (let i = 0; i < poly.v.length; i++) {
    const s = dot(poly.n[i], sub(c, poly.v[i]));
    if (s > r) return [];
    if (s > best) { best = s; index = i; }
  }
  const v1 = poly.v[index], v2 = poly.v[(index + 1) % poly.v.length];
  const face = () => [{ p: sub(c, mul(poly.n[index], (r + best) / 2)), n: poly.n[index], depth: r - best }];
  if (best < 1e-6) return face();
  const corner = (v) => {
    const d = sub(c, v);
    const dist = len(d);
    if (dist > r) return [];
    const n = normalize(d);
    return [{ p: sub(v, mul(n, (r - dist) / 2)), n, depth: r - dist }];
  };
  if (dot(sub(c, v1), sub(v2, v1)) <= 0) return corner(v1);
  if (dot(sub(c, v2), sub(v1, v2)) <= 0) return corner(v2);
  return face();
}

function collideShapes(a, b) {
  if (a.type === 'circle' && b.type === 'circle') {
    const d = sub(b.c, a.c);
    const dist = len(d);
    if (dist > a.r + b.r) return [];
    const n = dist > 1e-9 ? mul(d, 1 / dist) : V(0, 1);
    return [{ p: add(a.c, mul(n, (a.r + dist - b.r) / 2)), n, depth: a.r + b.r - dist }];
  }
  if (a.type === 'poly' && b.type === 'circle') return collidePolygonCircle(a, b.c, b.r);
  if (a.type === 'circle' && b.type === 'poly') {
    return collidePolygonCircle(b, a.c, a.r).map((k) => ({ p: k.p, n: mul(k.n, -1), depth: k.depth }));
  }
  return collidePolygons(a, b);
}

function contactSide(copy, kinematic, q, n) {
  if (!copy) return { body: null, r: ZERO, n, t: perp(n), k: kinematic ? kinematic(q) : ZERO };
  const body = copy.body;
  const p = apply(invertRigid(copy.T), q);
  const k = copy.from ? sub(frameVelocity(copy.to, q), applyLinear(copy.T, frameVelocity(copy.from, p))) : ZERO;
  return {
    body,
    r: sub(p, V(body.x, body.y)),
    n: applyLinearInverse(copy.T, n),
    t: applyLinearInverse(copy.T, perp(n)),
    k,
  };
}

const velocityAt = (s) => (s.body ? add(V(s.body.vx, s.body.vy), spinVelocity(s.body.w, s.r)) : ZERO);

function relative(c, which) {
  const key = which === 'n' ? 'n' : 't';
  const dir = which === 'n' ? c.n : perp(c.n);
  return dot(velocityAt(c.b), c.b[key]) - dot(velocityAt(c.a), c.a[key]) + dot(sub(c.b.k, c.a.k), dir);
}

function effectiveMass(c, key) {
  let k = 0;
  for (const s of [c.a, c.b]) {
    if (!s.body) continue;
    const rn = cross(s.r, s[key]);
    k += s.body.invMass + s.body.invInertia * rn * rn;
  }
  return k > 0 ? 1 / k : 0;
}

function applyImpulse(c, key, amount) {
  if (c.b.body) push(c.b.body, c.b.r, mul(c.b[key], amount));
  if (c.a.body) push(c.a.body, c.a.r, mul(c.a[key], -amount));
}

function push(body, r, impulse) {
  body.vx += impulse.x * body.invMass;
  body.vy += impulse.y * body.invMass;
  body.w += body.invInertia * cross(r, impulse);
}

function addContacts(out, copyA, kinA, shapeA, copyB, kinB, shapeB, h) {
  for (const raw of collideShapes(shapeA, shapeB)) {
    if (!isValidPoint(copyA, raw.p) || !isValidPoint(copyB, raw.p)) continue;
    const a = contactSide(copyA, kinA, raw.p, raw.n);
    const b = contactSide(copyB, kinB, raw.p, raw.n);
    const bodies = [copyA?.body, copyB?.body].filter(Boolean);
    const c = {
      a, b, n: raw.n, depth: raw.depth, Pn: 0, Pt: 0,
      friction: Math.sqrt(bodies.reduce((f, body) => f * body.friction, 1)),
      restitution: Math.max(...bodies.map((body) => body.restitution)),
    };
    c.massN = effectiveMass(c, 'n');
    c.massT = effectiveMass(c, 't');
    const vn = relative(c, 'n');
    c.bias = Math.max((BAUMGARTE / h) * Math.max(0, c.depth - SLOP), vn < -1 ? -c.restitution * vn : 0);
    out.push(c);
  }
}

function kinematicColliders(world) {
  const out = [];
  for (const end of allEnds(world)) {
    const velocity = (q) => frameVelocity(end, q);
    for (const c of postPoints(end)) {
      const shape = { type: 'circle', c, r: POST_RADIUS };
      out.push({ shape, box: shapeBounds(shape), velocity, end: null });
    }
    if (end.closed || end.pair.kind !== 'wall') continue;
    for (let i = 0; i < end.curve.length - 1; i++) {
      const p = apply(end.T, end.curve[i]);
      const q = apply(end.T, end.curve[i + 1]);
      const shape = polygonFrom([p, q]);
      out.push({ shape, box: boundsOf([p, q], 0.02), velocity, end });
    }
  }
  return out;
}

function passesThrough(home, copy, end) {
  return copy.to === end || copy.from === end || home.straddles.some((st) => st.end === end);
}

function gatherContacts(world, h) {
  const contacts = [];
  const kinematics = kinematicColliders(world);
  const copiesOf = world.bodies.map((b) => buildCopies(world, b, h));
  for (let i = 0; i < world.bodies.length; i++) {
    for (const copy of copiesOf[i]) {
      for (const wall of world.walls) {
        if (overlaps(copy.box, wall.box)) addContacts(contacts, null, null, wall.shape, copy, null, copy.shape, h);
      }
      for (const kin of kinematics) {
        if (kin.end && passesThrough(copiesOf[i][0], copy, kin.end)) continue;
        if (overlaps(copy.box, kin.box)) addContacts(contacts, null, kin.velocity, kin.shape, copy, null, copy.shape, h);
      }
      for (let j = 0; j < world.bodies.length; j++) {
        if (j === i || (!copy.from && j < i)) continue;
        const other = copiesOf[j][0];
        if (overlaps(copy.box, other.box)) addContacts(contacts, copy, null, copy.shape, other, null, other.shape, h);
      }
    }
  }
  return contacts;
}

function bodyPoint(body, local) {
  return apply(bodyMatrix(body), local);
}

export function grabLocal(body, worldPoint) {
  return apply(invertRigid(bodyMatrix(body)), worldPoint);
}

function pullGrab(world, h) {
  const grab = world.grab;
  if (!grab) return;
  const body = grab.body;
  const gp = bodyPoint(body, grab.local);
  const r = sub(gp, V(body.x, body.y));
  const vp = add(V(body.vx, body.vy), spinVelocity(body.w, r));
  let want = mul(sub(grab.target, gp), 14);
  const speed = len(want);
  if (speed > 30) want = mul(want, 30 / speed);
  push(body, r, mul(sub(want, vp), body.mass * 0.3));
  body.w *= 0.97;
  body.vy += world.gravity * h;
}

function prepareEnds(world, t1, frac, h) {
  for (const end of allEnds(world)) {
    const next = poseAt(end, t1, frac);
    end.vel.x = (next.x - end.pose.x) / h;
    end.vel.y = (next.y - end.pose.y) / h;
    end.vel.w = wrapAngle(next.angle - end.pose.angle) / h;
    end.next = next;
  }
}

function teleport(world, body, before, after) {
  const c0 = before.center, c1 = V(body.x, body.y);
  for (const end of allEnds(world)) {
    if (end.pair.ends.length < 2) continue;
    const l0 = apply(before.ends.get(end), c0);
    const l1 = apply(end.Tinv, c1);
    if (!crossesLocal(end, l0, l1)) continue;
    if (!isPassable(end, queryLocal(end, l0).side)) continue;
    const T = pairTransform(end);
    const to = partner(end);
    const v = sub(V(body.vx, body.vy), frameVelocity(end, c1));
    const c2 = apply(T, c1);
    const vOut = add(frameVelocity(to, c2), applyLinear(T, v));
    const mirrored = det(T) < 0;
    const m = bodyMatrix(body);
    const turned = { a: T.a * m.a + T.b * m.c, c: T.c * m.a + T.d * m.c };
    body.x = c2.x; body.y = c2.y;
    body.vx = vOut.x; body.vy = vOut.y;
    body.w = to.vel.w + (mirrored ? -1 : 1) * (body.w - end.vel.w);
    body.flip = body.flip !== mirrored;
    body.angle = Math.atan2(turned.c, turned.a);
    if (world.grab && world.grab.body === body) world.grab = null;
    after?.(body, end, to);
    return;
  }
}

export function step(world, dt, substeps, onTeleport) {
  const h = dt / substeps;
  for (let k = 1; k <= substeps; k++) {
    const t1 = world.time + h;
    prepareEnds(world, t1, k / substeps, h);
    const contacts = gatherContacts(world, h);

    for (const body of world.bodies) {
      if (world.grab?.body === body) pullGrab(world, h);
      body.vy -= world.gravity * h;
    }

    for (let it = 0; it < ITERATIONS; it++) {
      for (const c of contacts) {
        const vn = relative(c, 'n');
        let dPn = c.massN * (c.bias - vn);
        const Pn = Math.max(c.Pn + dPn, 0);
        dPn = Pn - c.Pn;
        c.Pn = Pn;
        applyImpulse(c, 'n', dPn);

        const vt = relative(c, 't');
        const limit = c.friction * c.Pn;
        const Pt = Math.max(-limit, Math.min(limit, c.Pt - c.massT * vt));
        applyImpulse(c, 't', Pt - c.Pt);
        c.Pt = Pt;
      }
    }

    const before = new Map();
    const oldEnds = new Map(allEnds(world).map((e) => [e, e.Tinv]));
    for (const body of world.bodies) {
      const speed = Math.hypot(body.vx, body.vy);
      if (speed > MAX_SPEED) { body.vx *= MAX_SPEED / speed; body.vy *= MAX_SPEED / speed; }
      before.set(body, { center: V(body.x, body.y), ends: oldEnds });
      body.x += body.vx * h;
      body.y += body.vy * h;
      body.angle += body.w * h;
    }

    for (const end of allEnds(world)) {
      Object.assign(end.pose, end.next);
      refreshTransform(end);
    }
    for (const body of world.bodies) teleport(world, body, before.get(body), onTeleport);
    world.time = t1;
  }
  for (const end of allEnds(world)) {
    if (end.dragTo) { Object.assign(end.base, end.dragTo); end.dragTo = null; }
  }
}

export function settleEnds(world) {
  for (const end of allEnds(world)) {
    Object.assign(end.pose, poseAt(end, world.time, 0));
    end.vel.x = end.vel.y = end.vel.w = 0;
    refreshTransform(end);
  }
}

export function pointInBody(body, p) {
  const shape = bodyShape(body);
  if (shape.type === 'circle') return len(sub(p, shape.c)) <= shape.r;
  return shape.v.every((v, i) => dot(shape.n[i], sub(p, v)) <= 0);
}

export function pointInWall(wall, p) {
  return wall.shape.v.every((v, i) => dot(wall.shape.n[i], sub(p, v)) <= 0);
}

function rayShape(origin, dir, shape) {
  if (shape.type === 'circle') {
    const oc = sub(origin, shape.c);
    const b = dot(oc, dir);
    const c = dot(oc, oc) - shape.r * shape.r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 1e-4 ? t : null;
  }
  let tEnter = -Infinity, tExit = Infinity;
  for (let i = 0; i < shape.v.length; i++) {
    const n = shape.n[i];
    const denom = dot(n, dir);
    const num = dot(n, sub(shape.v[i], origin));
    if (Math.abs(denom) < 1e-12) { if (num < 0) return null; continue; }
    const t = num / denom;
    if (denom < 0) tEnter = Math.max(tEnter, t); else tExit = Math.min(tExit, t);
    if (tEnter > tExit) return null;
  }
  return tEnter > 1e-4 ? tEnter : null;
}

function rayEnd(origin, dir, end) {
  const lo = apply(end.Tinv, origin);
  const ld = applyLinearInverse(end.T, dir);
  const far = add(lo, mul(ld, 1000));
  let best = null;
  const pts = end.curve;
  for (let i = 0; i < end.normals.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const r = sub(far, lo), s = sub(b, a);
    const denom = cross(r, s);
    if (Math.abs(denom) < 1e-12) continue;
    const t = cross(sub(a, lo), s) / denom;
    const u = cross(sub(a, lo), r) / denom;
    if (t <= 0 || u < 0 || u > 1) continue;
    const dist = t * 1000;
    if (dist > 1e-3 && (best === null || dist < best)) best = dist;
  }
  return best;
}

export function castLaser(world, laser, maxHops = 16) {
  const path = [];
  let origin = V(laser.x, laser.y);
  let dir = V(Math.cos(laser.angle), Math.sin(laser.angle));
  const bodyCopies = world.bodies.flatMap((b) => buildCopies(world, b));
  for (let hop = 0; hop <= maxHops; hop++) {
    let best = 60, hitEnd = null;
    for (const wall of world.walls) {
      const t = rayShape(origin, dir, wall.shape);
      if (t !== null && t < best) { best = t; hitEnd = null; }
    }
    for (const copy of bodyCopies) {
      const t = rayShape(origin, dir, copy.shape);
      if (t !== null && t < best && isValidPoint(copy, add(origin, mul(dir, t + 1e-3)))) { best = t; hitEnd = null; }
    }
    for (const end of allEnds(world)) {
      for (const c of postPoints(end)) {
        const t = rayShape(origin, dir, { type: 'circle', c, r: POST_RADIUS });
        if (t !== null && t < best) { best = t; hitEnd = null; }
      }
    }
    for (const end of allEnds(world)) {
      const t = rayEnd(origin, dir, end);
      if (t === null || t - 2e-3 >= best) continue;
      const side = query(end, origin).side;
      const hit = add(origin, mul(dir, t));
      if (!query(end, hit).interior && !end.closed) continue;
      best = t;
      hitEnd = isPassable(end, side) ? end : null;
    }
    const hit = add(origin, mul(dir, best));
    path.push([origin, hit]);
    if (!hitEnd) break;
    const T = pairTransform(hitEnd);
    origin = apply(T, hit);
    dir = normalize(applyLinear(T, dir));
  }
  return path;
}
