const OPENING_ANGLE = 0.9;
const SMALLEST_HALF_WIDTH = 1e-4;
const NO_CHILDREN = -1;
const NO_BODY = -1;
const STACK_DEPTH = 1024;

let capacity = 0;
let centreX, centreY, halfWidth, mass, massCentreX, massCentreY, softening, solidReach, firstChild, firstBody;
let nodeCount = 0;
let nextBody = new Int32Array(0);
const stack = new Int32Array(STACK_DEPTH);

let xs, ys, ms, softenings, solid, bodyCount;

function grow(needed) {
  if (needed <= capacity) return;
  const size = Math.max(needed, capacity * 2, 256);
  const widen = (old, Type) => {
    const next = new Type(size);
    if (old) next.set(old.subarray(0, nodeCount));
    return next;
  };
  [centreX, centreY, halfWidth, mass, massCentreX, massCentreY, softening, solidReach] = [centreX, centreY, halfWidth, mass, massCentreX, massCentreY, softening, solidReach].map((old) => widen(old, Float64Array));
  [firstChild, firstBody] = [firstChild, firstBody].map((old) => widen(old, Int32Array));
  capacity = size;
}

function addNode(x, y, half) {
  grow(nodeCount + 1);
  const node = nodeCount++;
  centreX[node] = x;
  centreY[node] = y;
  halfWidth[node] = half;
  mass[node] = massCentreX[node] = massCentreY[node] = softening[node] = solidReach[node] = 0;
  firstChild[node] = NO_CHILDREN;
  firstBody[node] = NO_BODY;
  return node;
}

function weigh(node, body) {
  mass[node] += ms[body];
  massCentreX[node] += ms[body] * xs[body];
  massCentreY[node] += ms[body] * ys[body];
  softening[node] += ms[body] * softenings[body];
  if (solid[body]) solidReach[node] = Math.max(solidReach[node], softenings[body]);
}

function split(node) {
  const quarter = halfWidth[node] / 2;
  const first = addNode(centreX[node] - quarter, centreY[node] - quarter, quarter);
  addNode(centreX[node] + quarter, centreY[node] - quarter, quarter);
  addNode(centreX[node] - quarter, centreY[node] + quarter, quarter);
  addNode(centreX[node] + quarter, centreY[node] + quarter, quarter);
  firstChild[node] = first;
}

const quadrantOf = (node, x, y) => firstChild[node] + (x >= centreX[node] ? 1 : 0) + (y >= centreY[node] ? 2 : 0);

function insert(body) {
  let node = 0;
  for (;;) {
    weigh(node, body);
    if (firstChild[node] === NO_CHILDREN) {
      const resident = firstBody[node];
      if (resident === NO_BODY || halfWidth[node] < SMALLEST_HALF_WIDTH) {
        nextBody[body] = resident;
        firstBody[node] = body;
        return;
      }
      split(node);
      firstBody[node] = NO_BODY;
      const home = quadrantOf(node, xs[resident], ys[resident]);
      weigh(home, resident);
      firstBody[home] = resident;
      nextBody[resident] = NO_BODY;
    }
    node = quadrantOf(node, xs[body], ys[body]);
  }
}

export function buildTree(world) {
  ({ xs, ys, ms, softenings, solid, count: bodyCount } = world);
  if (nextBody.length < bodyCount) nextBody = new Int32Array(bodyCount * 2);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < bodyCount; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]);
    maxY = Math.max(maxY, ys[i]);
  }
  nodeCount = 0;
  addNode((minX + maxX) / 2, (minY + maxY) / 2, Math.max(maxX - minX, maxY - minY) / 2 + 1);
  for (let i = 0; i < bodyCount; i++) insert(i);
  for (let node = 0; node < nodeCount; node++) {
    if (mass[node] === 0) continue;
    massCentreX[node] /= mass[node];
    massCentreY[node] /= mass[node];
    softening[node] /= mass[node];
  }
}

function farFromBox(node, x, y, gap) {
  const outsideX = Math.max(0, Math.abs(x - centreX[node]) - halfWidth[node]);
  const outsideY = Math.max(0, Math.abs(y - centreY[node]) - halfWidth[node]);
  return outsideX * outsideX + outsideY * outsideY > gap * gap;
}

function pushChildren(node, top) {
  const first = firstChild[node];
  stack[top] = first;
  stack[top + 1] = first + 1;
  stack[top + 2] = first + 2;
  stack[top + 3] = first + 3;
  return top + 4;
}

export function pullOn(body, exponent, pullPerDistance, out) {
  const x = xs[body];
  const y = ys[body];
  const radius = softenings[body];
  const openingSquared = OPENING_ANGLE * OPENING_ANGLE;
  let ax = 0;
  let ay = 0;
  let top = 0;
  stack[top++] = 0;
  while (top > 0) {
    const node = stack[--top];
    if (mass[node] === 0) continue;
    if (firstChild[node] === NO_CHILDREN) {
      for (let other = firstBody[node]; other !== NO_BODY; other = nextBody[other]) {
        if (other === body) continue;
        const dx = xs[other] - x;
        const dy = ys[other] - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const surface = Math.max(radius, softenings[other]);
        if (other > body && distance <= surface && solid[body] && solid[other]) out.touching.push(body, other);
        const perMass = pullPerDistance(distance, surface, exponent) * ms[other];
        ax += dx * perMass;
        ay += dy * perMass;
      }
      continue;
    }
    const dx = massCentreX[node] - x;
    const dy = massCentreY[node] - y;
    const squared = dx * dx + dy * dy;
    const width = 2 * halfWidth[node];
    const mightTouch = solid[body] && !farFromBox(node, x, y, Math.max(radius, solidReach[node]));
    const farEnough = width * width < openingSquared * squared && !mightTouch;
    if (!farEnough) {
      top = pushChildren(node, top);
      continue;
    }
    const perMass = pullPerDistance(Math.sqrt(squared), Math.max(radius, softening[node]), exponent) * mass[node];
    ax += dx * perMass;
    ay += dy * perMass;
  }
  out.ax = ax;
  out.ay = ay;
}

export function touchingPairs(touching) {
  for (let body = 0; body < bodyCount; body++) {
    if (!solid[body]) continue;
    const x = xs[body];
    const y = ys[body];
    const radius = softenings[body];
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top];
      if (solidReach[node] === 0 || farFromBox(node, x, y, Math.max(radius, solidReach[node]))) continue;
      if (firstChild[node] !== NO_CHILDREN) {
        top = pushChildren(node, top);
        continue;
      }
      for (let other = firstBody[node]; other !== NO_BODY; other = nextBody[other]) {
        if (other > body && solid[other] && Math.hypot(xs[other] - x, ys[other] - y) <= Math.max(radius, softenings[other])) touching.push(body, other);
      }
    }
  }
}
