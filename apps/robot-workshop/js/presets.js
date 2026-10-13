import { addBeam, addMotor, addNode, emptyDesign, liftOntoGround } from './design.js';

const JANSEN = { a: 38, l: 7.8, m: 15, b: 41.5, c: 39.3, d: 40.1, e: 55.8, f: 39.4, g: 36.7, h: 65.7, i: 49, j: 50, k: 61.9 };
const JANSEN_METERS_PER_UNIT = 0.01;

function circleIntersections(p, r0, q, r1) {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const distance = Math.hypot(dx, dy);
  const along = (r0 * r0 - r1 * r1 + distance * distance) / (2 * distance);
  const across = Math.sqrt(Math.max(0, r0 * r0 - along * along));
  const mx = p.x + (dx * along) / distance;
  const my = p.y + (dy * along) / distance;
  return [
    { x: mx - (dy * across) / distance, y: my + (dx * across) / distance },
    { x: mx + (dy * across) / distance, y: my - (dx * across) / distance },
  ];
}

function highest(points) {
  return points[0].y > points[1].y ? points[0] : points[1];
}

function lowest(points) {
  return points[0].y < points[1].y ? points[0] : points[1];
}

function outermost(points, side) {
  return points[0].x * side > points[1].x * side ? points[0] : points[1];
}

function jansenLeg(crankPin, side) {
  const { a, l, b, c, d, e, f, g, h, i, j, k } = JANSEN;
  const pivot = { x: side * a, y: -l };
  const upper = highest(circleIntersections(crankPin, j, pivot, b));
  const lower = lowest(circleIntersections(crankPin, k, pivot, c));
  const elbow = outermost(circleIntersections(pivot, d, upper, e), side);
  const knee = outermost(circleIntersections(elbow, f, lower, g), side);
  const foot = lowest(circleIntersections(lower, i, knee, h));
  return { pivot, upper, lower, elbow, knee, foot };
}

function strandbeest() {
  const design = emptyDesign();
  const scale = JANSEN_METERS_PER_UNIT;
  const place = (point) => addNode(design, point.x * scale, point.y * scale);
  const link = (p, q, layer = 0) => addBeam(design, p.id, q.id, layer);
  design.layers = ['Frame and crank', ...[0, 120, 240].map((degrees) => `Legs on the ${degrees}° crank pin`)];

  const axle = place({ x: 0, y: 0 });
  const top = place({ x: 0, y: 30 });
  const pivots = {};
  for (const side of [-1, 1]) pivots[side] = place({ x: side * JANSEN.a, y: -JANSEN.l });
  for (const [p, q] of [[axle, pivots[-1]], [axle, pivots[1]], [pivots[-1], pivots[1]], [top, pivots[-1]], [top, pivots[1]], [top, axle]]) link(p, q);

  const crankPhases = [0, 120, 240];
  const crankPins = crankPhases.map((degrees) => {
    const angle = (degrees * Math.PI) / 180 + 0.3;
    return { at: { x: JANSEN.m * Math.cos(angle), y: JANSEN.m * Math.sin(angle) } };
  });
  for (const pin of crankPins) pin.node = place(pin.at);
  const cranks = crankPins.map((pin) => link(axle, pin.node));
  for (let n = 0; n < crankPins.length; n += 1) link(crankPins[n].node, crankPins[(n + 1) % crankPins.length].node);

  crankPins.forEach((pin, pinIndex) => {
    const layer = pinIndex + 1;
    for (const side of [-1, 1]) {
      const leg = jansenLeg(pin.at, side);
      const upper = place(leg.upper);
      const lower = place(leg.lower);
      const elbow = place(leg.elbow);
      const knee = place(leg.knee);
      const foot = place(leg.foot);
      const pivot = pivots[side];
      for (const [p, q] of [[pin.node, upper], [pivot, upper], [pin.node, lower], [pivot, lower], [pivot, elbow], [upper, elbow], [elbow, knee], [lower, knee], [lower, foot], [knee, foot]]) link(p, q, layer);
    }
  });

  const frameBeam = design.beams.find((beam) => beam.a === axle.id && beam.b === pivots[1].id);
  addMotor(design, cranks[0], frameBeam, { mode: 'spin', power: -1, stallTorque: 40, freeRpm: 40 });
  liftOntoGround(design);
  return design;
}

function rower() {
  const design = emptyDesign();
  const corners = [[0, 0], [0.7, 0], [0.7, 0.18], [0, 0.18]].map(([x, y]) => addNode(design, x, y));
  for (let n = 0; n < 4; n += 1) addBeam(design, corners[n].id, corners[(n + 1) % 4].id);
  addBeam(design, corners[0].id, corners[2].id);
  const bodyTop = addBeam(design, corners[2].id, corners[3].id);
  const elbow = addNode(design, 0.95, 0.3);
  const hand = addNode(design, 1.25, 0);
  design.layers = ['Body', 'Arm'];
  const upperArm = addBeam(design, corners[2].id, elbow.id, 1);
  const forearm = addBeam(design, elbow.id, hand.id, 1);
  addMotor(design, upperArm, bodyTop, { mode: 'swing', amplitude: 45, frequency: 1.5, phase: 0, stallTorque: 30 });
  addMotor(design, forearm, upperArm, { mode: 'swing', amplitude: 35, frequency: 1.5, phase: -45, stallTorque: 20 });
  liftOntoGround(design);
  return design;
}

export const PRESETS = {
  strandbeest: { name: 'Strandbeest', build: strandbeest },
  rower: { name: 'Arm crawler', build: rower },
  empty: { name: 'Empty', build: emptyDesign },
};
