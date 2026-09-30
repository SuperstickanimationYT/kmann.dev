export const REFERENCE_DISTANCE = 200;
const PULL_AT_REFERENCE = 3125 / REFERENCE_DISTANCE ** 2;
const RADIUS_PER_CUBE_ROOT_MASS = 4;
const SOFTENING_SHARE_OF_RADII = 0.15;
export const STEP_SECONDS = 1 / 240;

export const radiusOf = (mass) => RADIUS_PER_CUBE_ROOT_MASS * Math.cbrt(mass);

let nextId = 1;

export function createBody({ x, y, vx = 0, vy = 0, mass, pinned = false }) {
  return { id: nextId++, x, y, vx, vy, mass, pinned, trail: [] };
}

export const cloneBodies = (bodies) => bodies.map((body) => ({ ...body, trail: [] }));

function pullStrength(mass, distanceSquared, softeningSquared, exponent) {
  const softened = distanceSquared + softeningSquared;
  return PULL_AT_REFERENCE * mass * (REFERENCE_DISTANCE / Math.sqrt(softened)) ** exponent;
}

function accelerations(bodies, exponent) {
  const pulls = bodies.map(() => ({ ax: 0, ay: 0 }));
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;
      const distance = Math.sqrt(distanceSquared);
      if (distance === 0) continue;
      const softeningSquared = ((radiusOf(a.mass) + radiusOf(b.mass)) * SOFTENING_SHARE_OF_RADII) ** 2;
      const perMass = pullStrength(1, distanceSquared, softeningSquared, exponent) / distance;
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
    const distanceSquared = (body.x - x) ** 2 + (body.y - y) ** 2;
    if (distanceSquared === 0) continue;
    const pull = pullStrength(body.mass, distanceSquared, 0, exponent);
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
  const speed = Math.sqrt(pullStrength(centre.mass, distance * distance, 0, exponent) * distance);
  const turn = clockwise ? -1 : 1;
  return { vx: centre.vx - (turn * dy * speed) / distance, vy: centre.vy + (turn * dx * speed) / distance };
}
