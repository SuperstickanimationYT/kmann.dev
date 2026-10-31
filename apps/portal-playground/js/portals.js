import {
  V, add, sub, mul, dot, len, perp, normalize, lerp, wrapAngle, spinVelocity,
  poseTransform, diagonal, compose, invertRigid, apply, closestOnSegment, segmentsCross, pointInPolygon,
} from './geom.js';

export const POST_RADIUS = 0.07;
const END_MARGIN = POST_RADIUS + 0.03;

function arcPoints(w, sag) {
  const half = w / 2;
  const r = (sag * sag + half * half) / (2 * sag);
  const reach = Math.asin(half / r);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const phi = lerp(-reach, reach, i / 16);
    pts.push(V(r * Math.sin(phi), sag - r + r * Math.cos(phi)));
  }
  return pts;
}

export const SHAPES = {
  straight: { label: 'Straight', closed: false, points: (w) => [V(-w / 2, 0), V(w / 2, 0)] },
  arc: { label: 'Curved', closed: false, points: (w) => arcPoints(w, 0.28 * w) },
  chevron: { label: 'Bent', closed: false, points: (w) => [V(-w / 2, 0), V(0, 0.32 * w), V(w / 2, 0)] },
  wave: {
    label: 'Wavy',
    closed: false,
    points: (w) => Array.from({ length: 25 }, (_, i) => {
      const x = lerp(-w / 2, w / 2, i / 24);
      return V(x, 0.1 * w * Math.cos((3 * Math.PI * x) / w));
    }),
  },
  ring: {
    label: 'Ring',
    closed: true,
    points: (w) => Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * 2 * Math.PI;
      return V((w / 2) * Math.cos(a), (w / 2) * Math.sin(a));
    }),
  },
  square: {
    label: 'Square frame',
    closed: true,
    points: (w) => {
      const h = w * 0.4;
      return [V(-h, -h), V(h, -h), V(h, h), V(-h, h)];
    },
  },
};

export const MOTIONS = {
  none: 'Still',
  slide: 'Slide back and forth',
  swing: 'Swing',
  spin: 'Spin',
  orbit: 'Circle around',
};

export const PAIR_COLORS = [
  ['#ff9f43', '#38b6ff'],
  ['#7bed6a', '#e46aff'],
  ['#ffe066', '#8c7bff'],
  ['#ff6b8b', '#4ff0d0'],
];

let nextPairId = 1;

export function defaultMotion() {
  return { type: 'none', distance: 1.5, swing: 45, period: 4, direction: 90, phase: 0 };
}

export function makePair({ shape = 'straight', width = 2, kind = 'open', mirror = false, delay = 0, colorIndex, colors, a, b }) {
  const id = nextPairId++;
  const pair = {
    id,
    shape,
    width,
    kind,
    mirror,
    delay,
    colors: colors ?? PAIR_COLORS[(colorIndex ?? id - 1) % PAIR_COLORS.length],
    ends: [],
  };
  pair.ends = [a, b].map((spec, index) => {
    const base = { x: spec.x, y: spec.y, angle: spec.angle ?? 0 };
    return {
      pair,
      index,
      base,
      pose: { ...base },
      vel: { x: 0, y: 0, w: 0 },
      motion: { ...defaultMotion(), ...spec.motion },
      dragTo: null,
    };
  });
  rebuildPair(pair);
  for (const end of pair.ends) {
    Object.assign(end.pose, poseAt(end, 0, 0));
    refreshTransform(end);
  }
  return pair;
}

export function gluing(pair) {
  const wall = pair.kind === 'wall' && !SHAPES[pair.shape].closed;
  return diagonal((wall ? -1 : 1) * (pair.mirror ? -1 : 1), wall ? -1 : 1);
}

export function rebuildPair(pair) {
  const shape = SHAPES[pair.shape];
  if (shape.closed && pair.kind === 'wall') pair.kind = 'open';
  const pts = shape.points(pair.width);
  const g = gluing(pair);
  pair.ends[0].curve = pts;
  pair.ends[1].curve = pts.map((p) => V(g.a * p.x, g.d * p.y));
  for (const end of pair.ends) {
    end.closed = shape.closed;
    const segCount = end.closed ? end.curve.length : end.curve.length - 1;
    end.normals = [];
    end.cum = [0];
    for (let i = 0; i < segCount; i++) {
      const d = sub(end.curve[(i + 1) % end.curve.length], end.curve[i]);
      end.normals.push(normalize(perp(d)));
      end.cum.push(end.cum[i] + len(d));
    }
    end.length = end.cum[segCount];
    const top = Math.max(...end.curve.map((p) => p.y));
    end.plusYSide = end.closed ? 1 : queryLocal(end, V(0, top + 5)).side;
    end.reach = Math.max(...end.curve.map((p) => len(p)));
  }
}

export function partner(end) {
  return end.pair.ends[1 - end.index];
}

export function isPassable(end, side) {
  return end.closed || end.pair.kind === 'open' || side === end.plusYSide;
}

export function refreshTransform(end) {
  end.T = poseTransform(end.pose.x, end.pose.y, end.pose.angle);
  end.Tinv = invertRigid(end.T);
}

export function motionOffset(motion, t) {
  const phase = (2 * Math.PI * t) / motion.period + motion.phase;
  switch (motion.type) {
    case 'slide': {
      const s = motion.distance * Math.sin(phase);
      const dir = (motion.direction * Math.PI) / 180;
      return { x: s * Math.cos(dir), y: s * Math.sin(dir), angle: 0 };
    }
    case 'swing':
      return { x: 0, y: 0, angle: ((motion.swing * Math.PI) / 180) * Math.sin(phase) };
    case 'spin':
      return { x: 0, y: 0, angle: phase };
    case 'orbit':
      return { x: motion.distance * Math.cos(phase), y: motion.distance * Math.sin(phase), angle: 0 };
    default:
      return { x: 0, y: 0, angle: 0 };
  }
}

export function poseAt(end, t, frac) {
  let base = end.base;
  if (end.dragTo) {
    base = {
      x: lerp(end.base.x, end.dragTo.x, frac),
      y: lerp(end.base.y, end.dragTo.y, frac),
      angle: end.base.angle + wrapAngle(end.dragTo.angle - end.base.angle) * frac,
    };
  }
  const off = motionOffset(end.motion, t);
  return { x: base.x + off.x, y: base.y + off.y, angle: base.angle + off.angle };
}

export function pairTransform(end) {
  const to = partner(end);
  return compose(to.T, compose(gluing(end.pair), end.Tinv));
}

export function frameVelocity(end, q) {
  return add(V(end.vel.x, end.vel.y), spinVelocity(end.vel.w, sub(q, V(end.pose.x, end.pose.y))));
}

export function queryLocal(end, q) {
  const pts = end.curve;
  const n = pts.length;
  const segCount = end.normals.length;
  let best = Infinity, bi = 0, bt = 0, bp = pts[0];
  for (let i = 0; i < segCount; i++) {
    const { point, t } = closestOnSegment(q, pts[i], pts[(i + 1) % n]);
    const dx = q.x - point.x, dy = q.y - point.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < best) { best = d2; bi = i; bt = t; bp = point; }
  }
  const dist = Math.sqrt(best);
  if (end.closed) {
    const side = pointInPolygon(q, pts) ? -1 : 1;
    return { dist, side, d: side * dist, interior: true };
  }
  const along = end.cum[bi] + bt * (end.cum[bi + 1] - end.cum[bi]);
  let nrm = end.normals[bi];
  if (bt <= 1e-9 && bi > 0) nrm = add(end.normals[bi - 1], nrm);
  else if (bt >= 1 - 1e-9 && bi < segCount - 1) nrm = add(nrm, end.normals[bi + 1]);
  const side = dot(sub(q, bp), nrm) >= 0 ? 1 : -1;
  return { dist, side, d: side * dist, interior: along > END_MARGIN && along < end.length - END_MARGIN };
}

export function query(end, worldPoint) {
  return queryLocal(end, apply(end.Tinv, worldPoint));
}

export function crossesLocal(end, p, q) {
  const pts = end.curve;
  let count = 0;
  for (let i = 0; i < end.normals.length; i++) {
    if (segmentsCross(p, q, pts[i], pts[(i + 1) % pts.length]) !== null) count++;
  }
  return count % 2 === 1;
}

export function worldCurve(end) {
  return end.curve.map((p) => apply(end.T, p));
}

export function postPoints(end) {
  if (end.closed) return [];
  return [apply(end.T, end.curve[0]), apply(end.T, end.curve[end.curve.length - 1])];
}

export function regionPath(end, side, depth) {
  if (end.closed) return { points: worldCurve(end), complement: side > 0 };
  const ySign = side * end.plusYSide;
  const pts = end.curve;
  const first = pts[0], last = pts[pts.length - 1];
  const local = [...pts, add(last, V(0, ySign * depth)), add(first, V(0, ySign * depth))];
  return { points: local.map((p) => apply(end.T, p)), complement: false };
}

export function frontNormal(end) {
  const a = end.pose.angle;
  return V(-Math.sin(a), Math.cos(a));
}

export function handlePoint(end) {
  const top = end.closed ? end.reach : Math.max(...end.curve.map((p) => p.y));
  return add(V(end.pose.x, end.pose.y), mul(frontNormal(end), top + 0.7));
}
