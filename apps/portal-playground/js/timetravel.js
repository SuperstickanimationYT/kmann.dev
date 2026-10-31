import { V, wrapAngle, poseTransform, apply, applyLinear, applyLinearInverse, invertRigid, compose } from './geom.js';
import { poseAt, crossesLocal, gluing } from './portals.js';
import { step, allEnds, sameSpec, makeFromSpec } from './physics.js';
import { fromData, bodyState, placeBody } from './snapshot.js';

export const STEP = 1 / 120;
const FRAME_EVERY = 2;
const CLEARANCE = 1e-4;
const TOLERANCE = 0.02;
const SAME_HISTORY = 0.15;
const MAX_HISTORIES = 8;
const REFINE_STEPS = 25;
const EVOLVE_GENERATIONS = 20;
const DRAWS = 120;
const STARTS = 4;
const SCALE = [1, 1, 0.3, 0.3, 0.3, 0.05];
const DIFF = [1e-3, 1e-3, 1e-3, 1e-3, 1e-3, 1e-2];
const SPREAD = [0.3, 0.3, 0.6, 0.6, 0.4, 1.5];
const IMPACT_DIFF = [1e-3, 1e-3, 1e-3, 1e-3, 1e-2];
const IMPACT_SPREAD = [0.15, 0.15, 0.4, 0.4, 1.5];
const BACKTRACK = 6;
const BACK_STEP = 1 / 60;
const HEADINGS = 48;

const byTime = (a, b) => a.time - b.time;
const random = (lo, hi) => lo + Math.random() * (hi - lo);

function drift(arrival, time, gravity) {
  const dt = time - arrival.time;
  return {
    ...arrival,
    time,
    x: arrival.x + arrival.vx * dt,
    y: arrival.y + arrival.vy * dt - 0.5 * gravity * dt * dt,
    vy: arrival.vy - gravity * dt,
    angle: arrival.angle + arrival.w * dt,
  };
}

function captureFrame(world) {
  return {
    t: world.time,
    bodies: world.bodies.map((b) => ({ key: b.id, ...bodyState(b) })),
    ends: allEnds(world).map((e) => ({ ...e.pose })),
  };
}

export function runHistory(data, arrivals, duration, { record = false, expect = Infinity } = {}) {
  const world = fromData(data);
  const queue = arrivals.map((a) => ({ ...a })).sort(byTime);
  const departures = [];
  const frames = [];
  world.onTimeJump = (body, time) => {
    const exit = body.timeJump.exit;
    const traveller = {
      ...bodyState(body),
      time,
      generation: (body.generation ?? 0) + 1,
      pair: world.pairs.indexOf(exit.pair),
      end: exit.index,
    };
    if (time < world.time) departures.push(traveller);
    else { queue.push(traveller); queue.sort(byTime); }
  };
  const steps = Math.round(duration / STEP);
  for (let k = 0; k < steps && departures.length < expect; k++) {
    while (queue.length && queue[0].time <= world.time + 1e-9) {
      const arrival = queue.shift();
      placeBody(world, drift(arrival, Math.max(world.time, arrival.time + CLEARANCE), world.gravity));
    }
    if (record && k % FRAME_EVERY === 0) frames.push(captureFrame(world));
    step(world, STEP, 1);
  }
  return { departures: departures.sort(byTime), frames };
}

function exitPose(ref, pair, end, t) {
  return poseAt(ref.pairs[pair].ends[end], t, 0);
}

function toSurface(ref, trav) {
  const pose = exitPose(ref, trav.pair, trav.end, trav.time);
  const frame = poseTransform(pose.x, pose.y, pose.angle);
  const p = apply(invertRigid(frame), V(trav.x, trav.y));
  const v = applyLinearInverse(frame, V(trav.vx, trav.vy));
  const lag = Math.abs(v.y) > 1e-6 ? p.y / v.y : 0;
  return {
    ...trav,
    u: [trav.time - lag, p.x - v.x * lag, v.x, v.y, wrapAngle(trav.angle - pose.angle - trav.w * lag), trav.w],
  };
}

function fromSurface(ref, s) {
  const [time, along, vx, vy, angle, w] = s.u;
  const pose = exitPose(ref, s.pair, s.end, time);
  const frame = poseTransform(pose.x, pose.y, pose.angle);
  const p = apply(frame, V(along, 0));
  const v = applyLinear(frame, V(vx, vy));
  return { ...s, time, x: p.x, y: p.y, vx: v.x, vy: v.y, angle: pose.angle + angle, w };
}

function symmetry(spec) {
  if (spec.kind === 'ball') return { turn: 0, chiral: false };
  if (spec.kind === 'box') return { turn: spec.w === spec.h ? Math.PI / 2 : Math.PI, chiral: false };
  return { turn: 2 * Math.PI, chiral: true };
}

const dimsOf = (s) => (symmetry(s.spec).turn ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 5]);
const wrapTurn = (d, turn) => d - turn * Math.round(d / turn);

function sameShape(a, b) {
  return a.length === b.length && a.every((s, i) => {
    const t = b[i];
    const flipMatters = symmetry(s.spec).chiral;
    return s.pair === t.pair && s.end === t.end && sameSpec(s.spec, t.spec) && (!flipMatters || s.flip === t.flip);
  });
}

function residual(guess, result) {
  const r = [];
  guess.forEach((s, i) => {
    const { turn } = symmetry(s.spec);
    for (const k of dimsOf(s)) {
      const d = result[i].u[k] - s.u[k];
      r.push((k === 4 ? wrapTurn(d, turn) : d) * SCALE[k]);
    }
  });
  return r;
}

const norm = (r) => r.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

function evaluate(ctx, guess) {
  const surface = guess.map((s) => surfaceOf(ctx, s));
  if (surface.some((s) => !s)) return { out: [], r: null };
  const arrivals = surface.map((s) => fromSurface(ctx.ref, s));
  const out = runHistory(ctx.data, arrivals, ctx.duration, { expect: ctx.quick ? guess.length : guess.length + 1 }).departures.map((d) => toSurface(ctx.ref, d));
  ctx.runs++;
  if (!sameShape(surface, out)) return { out, r: null };
  return { out, surface, r: residual(surface, out) };
}

const varsOf = (s) => (s.target ? [0, 1, 2, 3, 4] : dimsOf(s));
const diffsOf = (guess) => guess.flatMap((s) => varsOf(s).map((k) => (s.target ? IMPACT_DIFF : DIFF)[k]));
const spreadsOf = (guess) => guess.flatMap((s) => varsOf(s).map((k) => (s.target ? IMPACT_SPREAD : SPREAD)[k]));

function flatten(guess) {
  return guess.flatMap((s) => varsOf(s).map((k) => s.u[k]));
}

function withU(guess, u) {
  let i = 0;
  return guess.map((s) => {
    const next = [...s.u];
    for (const k of varsOf(s)) next[k] = u[i++];
    return { ...s, u: next };
  });
}

function solveLinear(a, b) {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

function jacobian(ctx, guess, r) {
  const u = flatten(guess);
  const diffs = diffsOf(guess);
  const jac = r.map(() => []);
  for (let k = 0; k < u.length; k++) {
    let h = diffs[k];
    let nudged = evaluate(ctx, withU(guess, u.map((x, i) => (i === k ? x + h : x)))).r;
    if (!nudged) {
      h = -h;
      nudged = evaluate(ctx, withU(guess, u.map((x, i) => (i === k ? x + h : x)))).r;
    }
    if (!nudged) return null;
    nudged.forEach((x, i) => { jac[i][k] = (x - r[i]) / h; });
  }
  return jac;
}

const squared = (r) => r.reduce((sum, x) => sum + x * x, 0);

function refine(ctx, start) {
  let guess = start;
  let { r } = evaluate(ctx, guess);
  if (!r) return null;
  let damping = 1e-2;
  let jac = null;
  for (let it = 0; it < REFINE_STEPS; it++) {
    if (norm(r) < TOLERANCE) return guess;
    jac ??= jacobian(ctx, guess, r);
    if (!jac) return null;
    const n = jac[0].length;
    const jtj = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => jac.reduce((sum, row) => sum + row[a] * row[b], 0)));
    const jtr = Array.from({ length: n }, (_, a) => -jac.reduce((sum, row, i) => sum + row[a] * r[i], 0));
    const step = solveLinear(jtj.map((row, a) => row.map((x, b) => (a === b ? x * (1 + damping) + 1e-9 : x))), jtr);
    const u = flatten(guess);
    const next = step && withU(guess, u.map((x, i) => x + step[i]));
    const tried = next && evaluate(ctx, next).r;
    if (tried && squared(tried) < squared(r)) {
      guess = next;
      r = tried;
      jac = null;
      damping = Math.max(1e-6, damping / 3);
    } else {
      damping *= 4;
      if (damping > 1e3) return null;
    }
  }
  return norm(r) < TOLERANCE ? guess : null;
}

const gaussian = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

function evolve(ctx, start) {
  let mean = flatten(start);
  let sigma = spreadsOf(start);
  const first = evaluate(ctx, start).r;
  let best = { u: mean, score: first ? squared(first) : Infinity };
  for (let gen = 0; gen < EVOLVE_GENERATIONS && Math.sqrt(best.score) > TOLERANCE; gen++) {
    const brood = [];
    for (let i = 0; i < 10; i++) {
      const u = mean.map((x, k) => x + sigma[k] * gaussian());
      const r = evaluate(ctx, withU(start, u)).r;
      if (r) brood.push({ u, score: squared(r) });
    }
    brood.sort((a, b) => a.score - b.score);
    if (brood.length && brood[0].score < best.score) {
      best = brood[0];
      sigma = sigma.map((x) => x * 1.15);
    } else {
      sigma = sigma.map((x) => x * 0.7);
    }
    const elite = [best, ...brood.slice(0, 2)];
    mean = mean.map((_, k) => elite.reduce((sum, e) => sum + e.u[k], 0) / elite.length);
  }
  return best.score < Infinity ? withU(start, best.u) : null;
}

function jitter(seed, spread) {
  return seed.map((s) => ({
    ...s,
    u: s.u.map((x, k) => x + (k === 0 ? random(-0.7, 0.7) : k === 1 ? random(-1, 1) : random(-1, 1) * Math.max(0.3, Math.abs(x)) * 0.3) * spread),
  }));
}

function stranger(ctx) {
  const timePairs = ctx.data.pairs.map((p, i) => [p, i]).filter(([p]) => p.delay > 0);
  const [pair, index] = timePairs[Math.floor(Math.random() * timePairs.length)];
  const specs = ctx.data.bodies.length ? ctx.data.bodies.map((b) => b.spec) : [{ kind: 'ball', r: 0.3, color: '#7fc8ff' }];
  const outward = (pair.kind === 'wall' || Math.random() < 0.5) ? 1 : -1;
  const heading = random(-1.2, 1.2);
  const speed = random(1, 6);
  return [{
    spec: specs[Math.floor(Math.random() * specs.length)],
    flip: false,
    generation: 1,
    pair: index,
    end: 1,
    u: [
      random(0, Math.max(0, ctx.duration - pair.delay)),
      random(-0.4, 0.4) * pair.width,
      speed * Math.sin(heading),
      outward * speed * Math.cos(heading),
      0,
      0,
    ],
  }];
}

function targetAt(ctx, key, t) {
  const k = Math.min(ctx.plain.length - 2, Math.max(0, Math.floor(t / (STEP * FRAME_EVERY))));
  const [a, b] = [ctx.plain[k], ctx.plain[k + 1]];
  const p = a.bodies.find((x) => x.key === key), q = b.bodies.find((x) => x.key === key);
  if (!p || !q) return null;
  const f = (t - a.t) / (b.t - a.t);
  return { ...p, x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, vx: p.vx + (q.vx - p.vx) * f, vy: p.vy + (q.vy - p.vy) * f };
}

function exitLocal(ctx, s, t, x, y) {
  const pose = exitPose(ctx.ref, s.pair, s.end, t);
  return apply(invertRigid(poseTransform(pose.x, pose.y, pose.angle)), V(x, y));
}

function surfaceOf(ctx, s) {
  if (!s.target) return s;
  const [tc, heading, vx, vy, w] = s.u;
  const target = targetAt(ctx, s.target, tc);
  if (!target) return null;
  const hx = target.x - Math.cos(heading) * s.reach, hy = target.y - Math.sin(heading) * s.reach;
  const g = ctx.data.gravity;
  const at = (dt) => V(hx - vx * dt, hy - vy * dt - 0.5 * g * dt * dt);
  const end = ctx.ref.pairs[s.pair].ends[s.end];
  const crosses = (a, b) => crossesLocal(end, exitLocal(ctx, s, tc - b, at(a).x, at(a).y), exitLocal(ctx, s, tc - b, at(b).x, at(b).y));
  for (let dt = BACK_STEP; dt <= Math.min(BACKTRACK, tc); dt += BACK_STEP) {
    if (!crosses(dt - BACK_STEP, dt)) continue;
    let lo = dt - BACK_STEP, hi = dt;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (crosses(lo, mid)) hi = mid; else lo = mid;
    }
    const back = (lo + hi) / 2;
    const p = at(back);
    const trav = { spec: s.spec, flip: s.flip, generation: s.generation, pair: s.pair, end: s.end, time: tc - back, x: p.x, y: p.y, vx, vy: vy + g * back, angle: -w * back, w };
    return toSurface(ctx.ref, trav);
  }
  return null;
}

function poseFrame(end, t) {
  const pose = poseAt(end, t, 0);
  return poseTransform(pose.x, pose.y, pose.angle);
}

function aimed(ctx) {
  const timePairs = ctx.data.pairs.map((p, i) => [p, i]).filter(([p]) => p.delay > 0);
  const frame = ctx.plain[Math.floor(Math.random() * ctx.plain.length)];
  if (!timePairs.length || !frame?.bodies.length || !ctx.data.bodies.length) return null;
  const [, index] = timePairs[Math.floor(Math.random() * timePairs.length)];
  const pair = ctx.ref.pairs[index];
  const target = frame.bodies[Math.floor(Math.random() * frame.bodies.length)];
  const spec = ctx.data.bodies[Math.floor(Math.random() * ctx.data.bodies.length)].spec;
  const mover = makeFromSpec(spec, 0, 0), struck = makeFromSpec(target.spec, 0, 0);
  const bounce = (1 + Math.max(mover.restitution, struck.restitution)) * mover.mass / (mover.mass + struck.mass);
  const map = compose(poseFrame(pair.ends[1], frame.t - pair.delay), compose(gluing(pair), invertRigid(poseFrame(pair.ends[0], frame.t))));
  const mapped = (v) => applyLinear(map, v);
  const before = V(target.vx, target.vy);
  const lv = mapped(before);
  const reach = 0.95 * (mover.r + struck.r);
  const found = [];
  const offset = random(0, 2 * Math.PI / HEADINGS);
  for (let i = 0; i < HEADINGS; i++) {
    const heading = offset + (2 * Math.PI * i) / HEADINGS;
    const n = V(Math.cos(heading), Math.sin(heading));
    const ln = mapped(n);
    const k = (bounce * ((lv.x - before.x) * n.x + (lv.y - before.y) * n.y)) / (1 - bounce * (ln.x * n.x + ln.y * n.y));
    if (!(k > 0.2)) continue;
    const out = mapped(V(before.x + k * n.x, before.y + k * n.y));
    const guess = [{ spec, flip: false, generation: 1, pair: index, end: 1, target: target.key, reach, u: [frame.t, heading, out.x, out.y, 0] }];
    if (surfaceOf(ctx, guess[0])) found.push(guess);
  }
  return found.length ? found[Math.floor(Math.random() * found.length)] : null;
}

function seeds(ctx) {
  const out = [];
  let arrivals = [];
  for (let i = 0; i < 6; i++) {
    const departures = runHistory(ctx.data, arrivals, ctx.duration).departures;
    ctx.runs++;
    if (departures.length) out.push(departures.map((d) => toSurface(ctx.ref, d)));
    if (sameShape(arrivals.map((a) => toSurface(ctx.ref, a)), departures.map((d) => toSurface(ctx.ref, d)))) break;
    arrivals = departures;
  }
  return out;
}

export function solve(setup, { duration, attempts, onProgress = () => {}, onFound = () => {} }) {
  const data = { ...setup, idealized: true };
  const ctx = { data, duration, ref: fromData(data), runs: 0, quick: true, plain: runHistory(data, [], duration, { record: true }).frames };
  const histories = [];
  const keep = (guess) => {
    const { r, surface } = guess.length ? evaluate({ ...ctx, quick: false }, guess) : { r: [], surface: [] };
    if (!r) return;
    const twin = histories.some((h) => sameShape(h.surface, surface) && norm(residual(h.surface, surface)) < SAME_HISTORY);
    if (twin || histories.length >= MAX_HISTORIES) return;
    const arrivals = surface.map((s) => fromSurface(ctx.ref, s));
    histories.push({ surface });
    onFound({ arrivals, mismatch: norm(r), frames: runHistory(data, arrivals, duration, { record: true }).frames });
  };

  if (runHistory(data, [], duration).departures.length === 0) keep([]);
  const bases = seeds(ctx);
  const total = attempts;
  for (let i = 0; i < total && ctx.data.pairs.some((p) => p.delay > 0); i++) {
    onProgress({ done: i, total, found: histories.length });
    const reach = [];
    for (let j = 0; j < DRAWS && reach.length < STARTS; j++) {
      const roll = Math.random();
      const base = bases.length && roll < 0.15 ? bases[Math.floor(Math.random() * bases.length)] : null;
      const guess = base ? jitter(base, random(0.2, 1)) : (roll < 0.85 && aimed(ctx)) || stranger(ctx);
      const { r } = evaluate(ctx, guess);
      if (r) reach.push({ guess, score: norm(r) });
    }
    reach.sort((a, b) => a.score - b.score);
    let found = null;
    for (const { guess } of reach) {
      found = refine(ctx, guess);
      if (found) break;
    }
    if (!found && reach.length) {
      const evolved = evolve(ctx, reach[0].guess);
      found = evolved && refine(ctx, evolved);
    }
    if (found) keep(found);
  }
  return { runs: ctx.runs, found: histories.length };
}
