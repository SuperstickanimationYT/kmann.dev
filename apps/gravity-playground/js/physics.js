import { addGasPressure } from './gas.js';
import { buildTree, forEachWithin, pullOn, touchingPairs } from './tree.js';

export const REFERENCE_DISTANCE = 200;
const PULL_AT_REFERENCE = 3125 / REFERENCE_DISTANCE ** 2;
export const INVERSE_SQUARE_STRENGTH = PULL_AT_REFERENCE * REFERENCE_DISTANCE ** 2;
const RADIUS_PER_CUBE_ROOT_MASS = 4;
export const STEP_SECONDS = 1 / 240;
const STEP_SHARE_OF_PAIR_TIME = 0.03;
const MOST_SUBSTEPS = 20000;
const EXACT_PULLS_UP_TO_BODIES = 64;
const MOND_ACCELERATION = 300;
const STAR_BIRTH = { density: 0.1, radius: 6 };
const CONDENSING = { seconds: 1.5, roundestOrbit: 0.3 };
const CORE_MASS_THAT_HOLDS_GAS = 5;

export const radiusOf = (mass) => RADIUS_PER_CUBE_ROOT_MASS * Math.cbrt(mass);

export const sizeOf = (body) => body.radius ?? radiusOf(body.mass);

let nextId = 1;

export const KINDS = { solid: 'solid', star: 'star', darkMatter: 'darkMatter', gas: 'gas' };

export const isGas = (body) => body.kind === KINDS.gas;

export const isBlackHole = (body) => body.look === 'blackHole';

export const isCollisionless = (body) => body.kind === KINDS.star || body.kind === KINDS.darkMatter || isGas(body);

const softeningOf = (body) => body.softening ?? sizeOf(body);

export function createBody({ x, y, vx = 0, vy = 0, mass, pinned = false, test = false, kind = KINDS.solid, softening }) {
  return { id: nextId++, x, y, vx, vy, mass, pinned, test, kind, softening, trail: [] };
}

export const cloneBodies = (bodies) => bodies.map((body) => ({ ...body, trail: [] }));

export const pullAt = (mass, distance, exponent) => PULL_AT_REFERENCE * mass * (REFERENCE_DISTANCE / distance) ** exponent;

function pullPerDistance(distance, surface, exponent) {
  const reach = Math.max(distance, surface);
  if (exponent === 2) return INVERSE_SQUARE_STRENGTH / (reach * reach * reach);
  return pullAt(1, reach, exponent) / reach;
}

const world = { xs: new Float64Array(0), ys: new Float64Array(0), ms: new Float64Array(0), softenings: new Float64Array(0), solid: new Uint8Array(0), count: 0 };
let shortestPairTime = Infinity;

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
  let fastestPairRateSquared = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = xs[j] - xs[i];
      const dy = ys[j] - ys[i];
      const distance = Math.sqrt(dx * dx + dy * dy);
      const surface = Math.max(softenings[i], softenings[j]);
      if (distance <= surface && solid[i] && solid[j]) touching.push(i, j);
      const perMass = pullPerDistance(distance, surface, exponent);
      const reach = Math.max(distance, surface);
      const closing = ((bodies[j].vx - bodies[i].vx) ** 2 + (bodies[j].vy - bodies[i].vy) ** 2) / (reach * reach);
      fastestPairRateSquared = Math.max(fastestPairRateSquared, Math.abs(perMass) * (ms[i] + ms[j]), closing);
      bodies[i].ax += dx * perMass * ms[j];
      bodies[i].ay += dy * perMass * ms[j];
      bodies[j].ax -= dx * perMass * ms[i];
      bodies[j].ay -= dy * perMass * ms[i];
    }
  }
  shortestPairTime = 1 / Math.sqrt(fastestPairRateSquared);
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

function pushApart(bodies, darkEnergy) {
  const mass = bodies.reduce((sum, body) => sum + body.mass, 0);
  const centreX = bodies.reduce((sum, body) => sum + body.x * body.mass, 0) / mass;
  const centreY = bodies.reduce((sum, body) => sum + body.y * body.mass, 0) / mass;
  for (const body of bodies) {
    body.ax += darkEnergy * (body.x - centreX);
    body.ay += darkEnergy * (body.y - centreY);
  }
}

const pullsAreFor = new WeakMap();

function pullsStillHold(bodies, { exponent, mond, darkEnergy }) {
  const stamp = pullsAreFor.get(bodies);
  if (!stamp || stamp.exponent !== exponent || stamp.mond !== mond || stamp.darkEnergy !== darkEnergy || stamp.count !== bodies.length) return false;
  return bodies.every((body) => body.pulledX === body.x && body.pulledY === body.y && body.pulledMass === body.mass);
}

function trustPulls(bodies, { exponent, mond, darkEnergy }) {
  for (const body of bodies) {
    body.pulledX = body.x;
    body.pulledY = body.y;
    body.pulledMass = body.mass;
  }
  pullsAreFor.set(bodies, { exponent, mond, darkEnergy, count: bodies.length, shortestPairTime });
}

export function updatePulls(bodies, law) {
  const touching = [];
  snapshot(bodies);
  shortestPairTime = Infinity;
  if (bodies.length <= EXACT_PULLS_UP_TO_BODIES) exactPulls(bodies, law.exponent, touching);
  else treePulls(bodies, law.exponent, touching);
  if (law.mond) strengthenWeakPulls(bodies);
  if (law.darkEnergy) pushApart(bodies, law.darkEnergy);
  if (bodies.some(isGas)) {
    if (bodies.length <= EXACT_PULLS_UP_TO_BODIES) buildTree(world);
    addGasPressure(bodies, isGas);
  }
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

const areTouching = (a, b) => Math.hypot(b.x - a.x, b.y - a.y) <= Math.max(sizeOf(a), sizeOf(b));

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
    removeGone(bodies, gone);
    touching = touchingNow(bodies);
  }
  return mergedAny;
}

function removeGone(bodies, gone) {
  let kept = 0;
  for (const body of bodies) if (!gone.has(body)) bodies[kept++] = body;
  bodies.length = kept;
}

const tidalReach = (hole, body) => Math.max(sizeOf(hole), sizeOf(body) * Math.cbrt(hole.mass / body.mass));

function swallowTornApart(bodies) {
  const holes = bodies.filter(isBlackHole);
  if (!holes.length) return false;
  const gone = new Set();
  for (const hole of holes) {
    if (gone.has(hole)) continue;
    for (const body of bodies) {
      if (body === hole || gone.has(body) || isCollisionless(body) || (isBlackHole(body) && body.mass > hole.mass)) continue;
      if (Math.hypot(body.x - hole.x, body.y - hole.y) > tidalReach(hole, body)) continue;
      const before = hole.mass;
      absorb(hole, body);
      hole.radius *= hole.mass / before;
      gone.add(body);
    }
  }
  if (gone.size) removeGone(bodies, gone);
  return gone.size > 0;
}

function gatherIntoStars(bodies) {
  if (!bodies.some(isGas)) return false;
  snapshot(bodies);
  buildTree(world);
  let changed = false;
  for (const body of bodies) {
    if (!isGas(body) || body.density < (body.starBirthDensity ?? STAR_BIRTH.density)) continue;
    if (body.formsGalacticStars) {
      Object.assign(body, { kind: KINDS.star });
      changed = true;
      continue;
    }
    let starNearby = false;
    forEachWithin(body.x, body.y, STAR_BIRTH.radius * 2, (other) => (starNearby ||= bodies[other].kind === KINDS.solid));
    if (starNearby) continue;
    Object.assign(body, { kind: KINDS.solid, softening: undefined, radius: STAR_BIRTH.radius, protostar: true });
    changed = true;
  }
  const gone = new Set();
  bodies.forEach((swallower, index) => {
    if (swallower.kind !== KINDS.solid || (!swallower.protostar && swallower.mass < CORE_MASS_THAT_HOLDS_GAS)) return;
    forEachWithin(world.xs[index], world.ys[index], sizeOf(swallower), (other) => {
      const gas = bodies[other];
      if (!isGas(gas) || gone.has(gas)) return;
      absorb(swallower, gas);
      gone.add(gas);
    });
  });
  if (gone.size) removeGone(bodies, gone);
  return changed || gone.size > 0;
}

function heaviestStar(bodies) {
  let heaviest = null;
  for (const body of bodies) if (body.kind === KINDS.solid && (!heaviest || body.mass > heaviest.mass)) heaviest = body;
  return heaviest;
}

function eccentricityAround(star, body) {
  const [dx, dy, dvx, dvy] = [body.x - star.x, body.y - star.y, body.vx - star.vx, body.vy - star.vy];
  const pull = INVERSE_SQUARE_STRENGTH * star.mass;
  const energy = (dvx * dvx + dvy * dvy) / 2 - pull / Math.hypot(dx, dy);
  if (energy >= 0) return Infinity;
  const spin = dx * dvy - dy * dvx;
  return Math.sqrt(Math.max(0, 1 + (2 * energy * spin * spin) / (pull * pull)));
}

function condenseSettledGas(bodies, seconds) {
  const star = heaviestStar(bodies);
  if (!star) return;
  for (const gas of bodies) {
    if (!isGas(gas)) continue;
    gas.settledFor = eccentricityAround(star, gas) < CONDENSING.roundestOrbit ? (gas.settledFor ?? 0) + seconds : 0;
    if (gas.settledFor >= CONDENSING.seconds) Object.assign(gas, { kind: KINDS.solid, softening: undefined });
  }
}

function substep(bodies, law, merge, seconds) {
  kick(bodies, seconds / 2);
  drift(bodies, seconds);
  const touching = updatePulls(bodies, law);
  kick(bodies, seconds / 2);
  const merged = merge && mergeTouching(bodies, touching);
  const swallowed = merge && swallowTornApart(bodies);
  const gathered = gatherIntoStars(bodies);
  condenseSettledGas(bodies, seconds);
  if (!merged && !swallowed && !gathered) return false;
  trustPulls(bodies, law);
  return true;
}

export function leapfrogStep(bodies, { exponent, mond = false, darkEnergy = 0, merge }, seconds = STEP_SECONDS, mostSubsteps = MOST_SUBSTEPS) {
  const law = { exponent, mond, darkEnergy };
  const shortestStep = seconds / mostSubsteps;
  let changed = false;
  let left = seconds;
  while (left > 0 && bodies.length) {
    if (!pullsStillHold(bodies, law)) updatePulls(bodies, law);
    const step = Math.min(left, Math.max(shortestStep, STEP_SHARE_OF_PAIR_TIME * pullsAreFor.get(bodies).shortestPairTime));
    changed = substep(bodies, law, merge, step) || changed;
    left -= step;
  }
  return changed;
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
