const WEDGE_PER_MASS = Math.PI / 3 / 1000;
const EDGE_EPSILON = 1e-9;
const MAX_CROSSINGS_PER_STEP = 6;

export const wedgeAngleOf = (mass) => Math.min(mass * WEDGE_PER_MASS, Math.PI * 2 * 0.98);

export const isCone = (body) => !body.test;

export function wedgeOf(cone, cutAngle) {
  const angle = wedgeAngleOf(cone.mass);
  return { x: cone.x, y: cone.y, angle, from: cutAngle - angle / 2, to: cutAngle + angle / 2 };
}

const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function rotateAbout(wedge, [x, y], turn) {
  const [dx, dy] = [x - wedge.x, y - wedge.y];
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  return [wedge.x + dx * cos - dy * sin, wedge.y + dx * sin + dy * cos];
}

function rotateVelocity(body, turn) {
  const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
  Object.assign(body, { vx: body.vx * cos - body.vy * sin, vy: body.vx * sin + body.vy * cos });
}

function edgeCrossing(wedge, bearing, entersFromBelow, start, end) {
  const [ux, uy] = [Math.cos(bearing), Math.sin(bearing)];
  const [dx, dy] = [end[0] - start[0], end[1] - start[1]];
  const denominator = cross(dx, dy, ux, uy);
  if (Math.abs(denominator) < EDGE_EPSILON) return null;
  const [ax, ay] = [wedge.x - start[0], wedge.y - start[1]];
  const along = cross(ax, ay, ux, uy) / denominator;
  const outward = cross(ax, ay, dx, dy) / denominator;
  if (along <= EDGE_EPSILON || along > 1 || outward <= 0) return null;
  const side = cross(ux, uy, start[0] - wedge.x, start[1] - wedge.y);
  if (entersFromBelow ? side >= 0 : side <= 0) return null;
  return { along, point: [start[0] + dx * along, start[1] + dy * along] };
}

function firstCrossing(wedges, start, end) {
  let first = null;
  for (const wedge of wedges) {
    const candidates = [
      { hit: edgeCrossing(wedge, wedge.from, true, start, end), turn: wedge.angle },
      { hit: edgeCrossing(wedge, wedge.to, false, start, end), turn: -wedge.angle },
    ];
    for (const { hit, turn } of candidates) {
      if (hit && (!first || hit.along < first.hit.along)) first = { wedge, hit, turn };
    }
  }
  return first;
}

export function driftThroughCones(bodies, cutAngle, seconds, { trails }) {
  const wedges = bodies.filter(isCone).map((cone) => wedgeOf(cone, cutAngle));
  for (const body of bodies) {
    if (isCone(body) || body.pinned) continue;
    let start = [body.x, body.y];
    let end = [body.x + body.vx * seconds, body.y + body.vy * seconds];
    for (let crossings = 0; crossings < MAX_CROSSINGS_PER_STEP; crossings++) {
      const crossing = firstCrossing(wedges, start, end);
      if (!crossing) break;
      const { wedge, hit, turn } = crossing;
      const glued = rotateAbout(wedge, hit.point, turn);
      if (trails) body.trail.push(hit.point, null, glued);
      end = rotateAbout(wedge, end, turn);
      rotateVelocity(body, turn);
      start = glued;
    }
    [body.x, body.y] = end;
  }
}

function insideWedge(wedge, x, y) {
  const bearing = Math.atan2(y - wedge.y, x - wedge.x);
  const past = (((bearing - wedge.from) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return past > 0 && past < wedge.angle;
}

export function outOfMissingSpace(bodies, cutAngle, [x, y]) {
  for (const cone of bodies.filter(isCone)) {
    const wedge = wedgeOf(cone, cutAngle);
    if (insideWedge(wedge, x, y)) return rotateAbout(wedge, [x, y], wedge.angle);
  }
  return [x, y];
}
