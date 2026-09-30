export const REFERENCE_DISTANCE = 200;
const PULL_AT_REFERENCE = 3125 / REFERENCE_DISTANCE ** 2;
const RADIUS_PER_CUBE_ROOT_MASS = 4;
export const STEP_SECONDS = 1 / 240;

export const radiusOf = (mass) => RADIUS_PER_CUBE_ROOT_MASS * Math.cbrt(mass);

let nextId = 1;

export function createBody({ x, y, vx = 0, vy = 0, mass, pinned = false }) {
  return { id: nextId++, x, y, vx, vy, mass, pinned, trail: [] };
}

export const cloneBodies = (bodies) => bodies.map((body) => ({ ...body, trail: [] }));

const pullAt = (mass, distance, exponent) => PULL_AT_REFERENCE * mass * (REFERENCE_DISTANCE / distance) ** exponent;

function pullBetween(a, b, distance, exponent) {
  const surface = Math.max(radiusOf(a.mass), radiusOf(b.mass));
  if (distance >= surface) return pullAt(1, distance, exponent);
  return pullAt(1, surface, exponent) * (distance / surface);
}

function accelerations(bodies, exponent) {
  const pulls = bodies.map(() => ({ ax: 0, ay: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) continue;
      const perMass = pullBetween(a, b, distance, exponent) / distance;
      pulls[i].ax += dx * perMass * b.mass;
      pulls[i].ay += dy * perMass * b.mass;
      pulls[j].ax -= dx * perMass * a.mass;
      pulls[j].ay -= dy * perMass * a.mass;
    }
  }
  return pulls;
}

function kick(bodies, pulls, seconds) {
  bodies.forEach((body, index) => {
    if (body.pinned) return;
    body.vx += pulls[index].ax * seconds;
    body.vy += pulls[index].ay * seconds;
  });
}

function drift(bodies, seconds) {
  for (const body of bodies) {
    if (body.pinned) continue;
    body.x += body.vx * seconds;
    body.y += body.vy * seconds;
  }
}

function mergeTouching(bodies) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      if (Math.hypot(b.x - a.x, b.y - a.y) > Math.max(radiusOf(a.mass), radiusOf(b.mass))) continue;
      const [big, small] = a.mass >= b.mass ? [a, b] : [b, a];
      const mass = big.mass + small.mass;
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
      bodies.splice(bodies.indexOf(small), 1);
      return true;
    }
  }
  return false;
}

export function leapfrogStep(bodies, { exponent, merge }) {
  kick(bodies, accelerations(bodies, exponent), STEP_SECONDS / 2);
  drift(bodies, STEP_SECONDS);
  kick(bodies, accelerations(bodies, exponent), STEP_SECONDS / 2);
  let merged = false;
  if (merge) while (mergeTouching(bodies)) merged = true;
  return merged;
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
