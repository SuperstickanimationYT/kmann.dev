import { buildTree, pullOn, touchingPairs } from './tree.js';

export const REFERENCE_DISTANCE = 200;
const PULL_AT_REFERENCE = 3125 / REFERENCE_DISTANCE ** 2;
const INVERSE_SQUARE_STRENGTH = PULL_AT_REFERENCE * REFERENCE_DISTANCE ** 2;
const RADIUS_PER_CUBE_ROOT_MASS = 4;
export const STEP_SECONDS = 1 / 240;
const EXACT_PULLS_UP_TO_BODIES = 64;
const MOND_ACCELERATION = 300;

export const radiusOf = (mass) => RADIUS_PER_CUBE_ROOT_MASS * Math.cbrt(mass);

let nextId = 1;

export const KINDS = { solid: 'solid', star: 'star', darkMatter: 'darkMatter' };

const SOFTENING = { [KINDS.star]: 24, [KINDS.darkMatter]: 60 };

export const isCollisionless = (body) => body.kind === KINDS.star || body.kind === KINDS.darkMatter;

const softeningOf = (body) => SOFTENING[body.kind] ?? radiusOf(body.mass);

export function createBody({ x, y, vx = 0, vy = 0, mass, pinned = false, test = false, kind = KINDS.solid }) {
  return { id: nextId++, x, y, vx, vy, mass, pinned, test, kind, trail: [] };
}

export const cloneBodies = (bodies) => bodies.map((body) => ({ ...body, trail: [] }));

const pullAt = (mass, distance, exponent) => PULL_AT_REFERENCE * mass * (REFERENCE_DISTANCE / distance) ** exponent;

function pullPerDistance(distance, surface, exponent) {
  const reach = Math.max(distance, surface);
  if (exponent === 2) return INVERSE_SQUARE_STRENGTH / (reach * reach * reach);
  return pullAt(1, reach, exponent) / reach;
}

const world = { xs: new Float64Array(0), ys: new Float64Array(0), ms: new Float64Array(0), softenings: new Float64Array(0), solid: new Uint8Array(0), count: 0 };

function snapshot(bodies) {
  if (world.xs.length < bodies.length) {
    const size = bodies.length * 2;
    Object.assign(world, { xs: new Float64Array(size), ys: new Float64Array(size), ms: new Float64Array(size), softenings: new Float64Array(size), solid: new Uint8Array(size) });
  }
  world.count = bodies.length;
  bodies.forEach((body, index) => {
    world.xs[index] = body.x;
    world.ys[index] = body.y;
    world.ms[index] = body.mass;
    world.softenings[index] = softeningOf(body);
    world.solid[index] = isCollisionless(body) ? 0 : 1;
  });
}

function exactPulls(bodies, exponent, touching) {
  const { xs, ys, ms, softenings, solid, count } = world;
  for (const body of bodies) body.ax = body.ay = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const surface = Math.max(softenings[i], softenings[j]);
      if (distance <= surface && solid[i] && solid[j]) touching.push(i, j);
      const perMass = pullPerDistance(distance, surface, exponent);
      bodies[i].ax += dx * perMass * ms[j];
      bodies[i].ay += dy * perMass * ms[j];
      bodies[j].ax -= dx * perMass * ms[i];
      bodies[j].ay -= dy * perMass * ms[i];
    }
  }
}

function treePulls(bodies, exponent, touching) {
  buildTree(world);
  const pull = { ax: 0, ay: 0, touching };
  bodies.forEach((body, index) => {
    pullOn(index, exponent, pullPerDistance, pull);
    body.ax = pull.ax;
    body.ay = pull.ay;
  });
}

function strengthenWeakPulls(bodies) {
  for (const body of bodies) {
    const pull = Math.hypot(body.ax, body.ay);
    if (pull === 0) continue;
    const boost = 0.5 + Math.sqrt(0.25 + MOND_ACCELERATION / pull);
    body.ax *= boost;
    body.ay *= boost;
  }
}

const pullsAreFor = new WeakMap();

function pullsStillHold(bodies, { exponent, mond }) {
  const stamp = pullsAreFor.get(bodies);
  if (!stamp || stamp.exponent !== exponent || stamp.mond !== mond || stamp.count !== bodies.length) return false;
  return bodies.every((body) => body.pulledX === body.x && body.pulledY === body.y && body.pulledMass === body.mass);
}

function trustPulls(bodies, { exponent, mond }) {
  for (const body of bodies) {
    body.pulledX = body.x;
    body.pulledY = body.y;
    body.pulledMass = body.mass;
  }
  pullsAreFor.set(bodies, { exponent, mond, count: bodies.length });
}

export function updatePulls(bodies, law) {
  const touching = [];
  snapshot(bodies);
  if (bodies.length <= EXACT_PULLS_UP_TO_BODIES) exactPulls(bodies, law.exponent, touching);
  else treePulls(bodies, law.exponent, touching);
  if (law.mond) strengthenWeakPulls(bodies);
  trustPulls(bodies, law);
  return touching;
}

function kick(bodies, seconds) {
  for (const body of bodies) {
    if (body.pinned) continue;
    body.vx += body.ax * seconds;
    body.vy += body.ay * seconds;
  }
}

function drift(bodies, seconds) {
  for (const body of bodies) {
    if (body.pinned) continue;
    body.x += body.vx * seconds;
    body.y += body.vy * seconds;
  }
}

const areTouching = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) <= Math.max(radiusOf(a.mass), radiusOf(b.mass));

function absorb(big, small) {
  const mass = big.mass + small.mass;
  big.ax = (big.ax * big.mass + small.ax * small.mass) / mass;
  big.ay = (big.ay * big.mass + small.ay * small.mass) / mass;
  if (!big.pinned) {
    big.vx = small.pinned ? 0 : (big.vx * big.mass + small.vx * small.mass) / mass;
    big.vy = small.pinned ? 0 : (big.vy * big.mass + small.vy * small.mass) / mass;
    if (!small.pinned) {
      big.x = (big.x * big.mass + small.x * small.mass) / mass;
      big.y = (big.y * big.mass + small.y * small.mass) / mass;
    } else {
      Object.assign(big, { x: small.x, y: small.y, pinned: true });
    }
  }
  big.mass = mass;
}

function touchingNow(bodies) {
  const touching = [];
  snapshot(bodies);
  buildTree(world);
  touchingPairs(touching);
  return touching;
}

function mergeTouching(bodies, touching) {
  let mergedAny = false;
  while (touching.length) {
    const gone = new Set();
    for (let k = 0; k < touching.length; k += 2) {
      const [a, b] = [bodies[touching[k]], bodies[touching[k + 1]]];
      if (gone.has(a) || gone.has(b) || !areTouching(a, b)) continue;
      const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
      absorb(big, small);
      gone.add(small);
    }
    if (!gone.size) break;
    mergedAny = true;
    let kept = 0;
    for (const body of bodies) if (!gone.has(body)) bodies[kept++] = body;
    bodies.length = kept;
    touching = touchingNow(bodies);
  }
  return mergedAny;
}

export function leapfrogStep(bodies, { exponent, mond = false, merge }) {
  const law = { exponent, mond };
  if (!bodies.length) return false;
  if (!pullsStillHold(bodies, law)) updatePulls(bodies, law);
  kick(bodies, STEP_SECONDS / 2);
  drift(bodies, STEP_SECONDS);
  const touching = updatePulls(bodies, law);
  kick(bodies, STEP_SECONDS / 2);
  if (!merge || !mergeTouching(bodies, touching)) return false;
  trustPulls(bodies, law);
  return true;
}

export function strongestPullOn(bodies, x, y, exponent) {
  let strongest = null;
  let strongestPull = 0;
  for (const body of bodies) {
    const distance = Math.hypot(body.x - x, body.y - y);
    if (distance === 0) continue;
    const pull = pullAt(body.mass, distance, exponent);
    if (pull > strongestPull) {
      strongest = body;
      strongestPull = pull;
    }
  }
  return strongest;
}

export function circularVelocity(centre, x, y, exponent, clockwise = false) {
  if (!centre) return { vx: 0, vy: 0 };
  const dx = x - centre.x;
  const dy = y - centre.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.sqrt(pullAt(centre.mass, distance, exponent) * distance);
  const turn = clockwise ? -1 : 1;
  return { vx: centre.vx - (turn * dy * speed) / distance, vy: centre.vy + (turn * dx * speed) / distance };
}
