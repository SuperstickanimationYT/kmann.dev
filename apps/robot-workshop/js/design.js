export const MOTOR_DEFAULTS = {
  mode: 'spin',
  power: 1,
  amplitude: 30,
  frequency: 0.5,
  phase: 0,
  stallTorque: 40,
  freeRpm: 40,
};

export function emptyDesign() {
  return { nodes: [], beams: [], motors: [], nextId: 1 };
}

export function cloneDesign(design) {
  return JSON.parse(JSON.stringify(design));
}

export function isDesign(value) {
  return Boolean(value) && Array.isArray(value.nodes) && Array.isArray(value.beams) && Array.isArray(value.motors);
}

function takeId(design) {
  return design.nextId++;
}

export function addNode(design, x, y) {
  const node = { id: takeId(design), x, y };
  design.nodes.push(node);
  return node;
}

export function findBeam(design, a, b) {
  return design.beams.find((beam) => (beam.a === a && beam.b === b) || (beam.a === b && beam.b === a));
}

export function addBeam(design, a, b) {
  if (a === b) return null;
  const existing = findBeam(design, a, b);
  if (existing) return existing;
  const beam = { id: takeId(design), a, b };
  design.beams.push(beam);
  return beam;
}

export function sharedNode(beamA, beamB) {
  if (beamA.a === beamB.a || beamA.a === beamB.b) return beamA.a;
  if (beamA.b === beamB.a || beamA.b === beamB.b) return beamA.b;
  return null;
}

export function addMotor(design, driven, base, settings = {}) {
  const pivot = sharedNode(driven, base);
  if (pivot === null || driven.id === base.id) return null;
  const motor = { id: takeId(design), driven: driven.id, base: base.id, ...MOTOR_DEFAULTS, ...settings };
  design.motors.push(motor);
  return motor;
}

export function removeBeam(design, beamId) {
  design.beams = design.beams.filter((beam) => beam.id !== beamId);
  design.motors = design.motors.filter((motor) => motor.driven !== beamId && motor.base !== beamId);
  const used = new Set(design.beams.flatMap((beam) => [beam.a, beam.b]));
  design.nodes = design.nodes.filter((node) => used.has(node.id));
}

export function removeNode(design, nodeId) {
  for (const beam of design.beams.filter((b) => b.a === nodeId || b.b === nodeId)) removeBeam(design, beam.id);
  design.nodes = design.nodes.filter((node) => node.id !== nodeId);
}

export function removeMotor(design, motorId) {
  design.motors = design.motors.filter((motor) => motor.id !== motorId);
}

export function nodeMap(design) {
  return new Map(design.nodes.map((node) => [node.id, node]));
}

export function beamMap(design) {
  return new Map(design.beams.map((beam) => [beam.id, beam]));
}

export function motorPivot(design, motor) {
  const beams = beamMap(design);
  return sharedNode(beams.get(motor.driven), beams.get(motor.base));
}

export function bounds(design) {
  if (!design.nodes.length) return null;
  const xs = design.nodes.map((n) => n.x);
  const ys = design.nodes.map((n) => n.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function liftOntoGround(design, clearance = 0.02) {
  const box = bounds(design);
  if (!box) return;
  for (const node of design.nodes) node.y += clearance - box.minY;
}
