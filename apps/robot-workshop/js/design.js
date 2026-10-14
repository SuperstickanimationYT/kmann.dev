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
  return { nodes: [], beams: [], motors: [], layers: ['Layer 1'], sensors: [], gyros: [], angles: [], pens: [], cpu: null, program: '', nextId: 1 };
}

export const CPU_CLOCKS = [1000, 2000, 5000, 10000, 20000, 50000];

export function withDefaults(design) {
  design.layers ??= ['Layer 1'];
  for (const beam of design.beams) beam.layer ??= 0;
  design.sensors ??= [];
  design.gyros ??= [];
  design.angles ??= [];
  design.pens ??= [];
  design.cpu ??= null;
  design.program ??= '';
  return design;
}

export function toggleSensor(design, nodeId) {
  const before = design.sensors.length;
  design.sensors = design.sensors.filter((id) => id !== nodeId);
  if (design.sensors.length === before) design.sensors.push(nodeId);
  return design.sensors.length > before;
}

export const PEN_COLORS = ['#ff6b6b', '#ffd36e', '#7dffa8', '#5fe3ff', '#c4a8ff', '#ff9fc6'];

export function togglePen(design, target) {
  const before = design.pens.length;
  design.pens = design.pens.filter((pen) => pen.node !== target.node || pen.beam !== target.beam);
  if (design.pens.length === before) design.pens.push({ ...target, color: PEN_COLORS[before % PEN_COLORS.length] });
  return design.pens.length > before;
}

export function toggleGyro(design, beamId) {
  const before = design.gyros.length;
  design.gyros = design.gyros.filter((id) => id !== beamId);
  if (design.gyros.length === before) design.gyros.push(beamId);
  return design.gyros.length > before;
}

export function toggleAngleSensor(design, driven, base) {
  const before = design.angles.length;
  const samePair = (pair) => (pair.driven === driven.id && pair.base === base.id) || (pair.driven === base.id && pair.base === driven.id);
  design.angles = design.angles.filter((pair) => !samePair(pair));
  if (design.angles.length === before) design.angles.push({ driven: driven.id, base: base.id });
  return design.angles.length > before;
}

export function mountCpu(design, beamId) {
  design.cpu = { beam: beamId, clock: design.cpu?.clock ?? 5000 };
}

export function addLayer(design) {
  design.layers.push(`Layer ${design.layers.length + 1}`);
  return design.layers.length - 1;
}

export function nodeLayers(design) {
  const layers = new Map(design.nodes.map((node) => [node.id, new Set()]));
  for (const beam of design.beams) {
    layers.get(beam.a).add(beam.layer);
    layers.get(beam.b).add(beam.layer);
  }
  return layers;
}

export function motorLayer(design, motor) {
  return design.beams.find((beam) => beam.id === motor.driven)?.layer ?? 0;
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

export function addBeam(design, a, b, layer = 0) {
  if (a === b) return null;
  const existing = findBeam(design, a, b);
  if (existing) return existing;
  const beam = { id: takeId(design), a, b, layer };
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
  if (design.cpu?.beam === beamId) design.cpu = null;
  design.gyros = design.gyros.filter((id) => id !== beamId);
  design.angles = design.angles.filter((pair) => pair.driven !== beamId && pair.base !== beamId);
  const used = new Set(design.beams.flatMap((beam) => [beam.a, beam.b]));
  design.nodes = design.nodes.filter((node) => used.has(node.id));
  design.sensors = design.sensors.filter((id) => used.has(id));
  design.pens = design.pens.filter((pen) => pen.beam !== beamId && (pen.node === undefined || used.has(pen.node)));
}

export function removeNode(design, nodeId) {
  for (const beam of design.beams.filter((b) => b.a === nodeId || b.b === nodeId)) removeBeam(design, beam.id);
  design.nodes = design.nodes.filter((node) => node.id !== nodeId);
  design.sensors = design.sensors.filter((id) => id !== nodeId);
  design.pens = design.pens.filter((pen) => pen.node !== nodeId);
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
