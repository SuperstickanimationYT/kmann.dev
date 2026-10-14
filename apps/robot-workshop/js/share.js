import { CPU_CLOCKS, MOTOR_DEFAULTS, sharedNode } from './design.js';

const FORMAT = 'robot-workshop';
const VERSION = 1;
const MOTOR_MODES = ['spin', 'swing'];

class RobotTextError extends Error {}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function robotToText(design) {
  const nodes = design.nodes.map(({ id, x, y }) => ({ id, x: roundTo(x, 4), y: roundTo(y, 4) }));
  return JSON.stringify({ format: FORMAT, version: VERSION, ...design, nodes });
}

function list(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new RobotTextError(`"${name}" should be a list.`);
  return value;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function uniqueIds(items, name) {
  const ids = new Set();
  for (const item of items) {
    if (!Number.isInteger(item?.id) || ids.has(item.id)) throw new RobotTextError(`Every item in "${name}" needs its own whole-number id.`);
    ids.add(item.id);
  }
  return ids;
}

function parseRobot(text) {
  let data;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new RobotTextError("That isn't robot text. Copy a robot with Copy robot and paste all of it.");
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.nodes) || (data.format !== undefined && data.format !== FORMAT)) throw new RobotTextError("That text isn't a Robot Workshop robot.");
  if (data.version > VERSION) throw new RobotTextError('That robot comes from a newer version of Robot Workshop. Reload the page and try again.');

  const nodes = list(data.nodes, 'nodes');
  const nodeIds = uniqueIds(nodes, 'nodes');
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new RobotTextError(`Joint ${node.id} has no position.`);
  }

  const layers = list(data.layers, 'layers').filter((name) => typeof name === 'string');
  if (!layers.length) layers.push('Layer 1');

  const beams = list(data.beams, 'beams');
  const beamIds = uniqueIds(beams, 'beams');
  for (const beam of beams) {
    if (!nodeIds.has(beam.a) || !nodeIds.has(beam.b) || beam.a === beam.b) throw new RobotTextError(`Beam ${beam.id} doesn't join two joints of this robot.`);
    beam.layer = Number.isInteger(beam.layer) && beam.layer >= 0 && beam.layer < layers.length ? beam.layer : 0;
  }
  const beamById = new Map(beams.map((beam) => [beam.id, beam]));
  const joinedPair = (driven, base) => beamIds.has(driven) && beamIds.has(base) && driven !== base && sharedNode(beamById.get(driven), beamById.get(base)) !== null;

  const motors = list(data.motors, 'motors');
  uniqueIds(motors, 'motors');
  const keptMotors = motors.filter((motor) => joinedPair(motor.driven, motor.base)).map((motor) => ({
    id: motor.id,
    driven: motor.driven,
    base: motor.base,
    mode: MOTOR_MODES.includes(motor.mode) ? motor.mode : MOTOR_DEFAULTS.mode,
    ...Object.fromEntries(['power', 'amplitude', 'frequency', 'phase', 'stallTorque', 'freeRpm'].map((key) => [key, finite(motor[key], MOTOR_DEFAULTS[key])])),
  }));

  const cpu = data.cpu && beamIds.has(data.cpu.beam) ? { beam: data.cpu.beam, clock: CPU_CLOCKS.includes(data.cpu.clock) ? data.cpu.clock : 5000 } : null;
  const allIds = [...nodeIds, ...beamIds, ...keptMotors.map((motor) => motor.id)];

  return {
    nodes: nodes.map(({ id, x, y }) => ({ id, x, y })),
    beams: beams.map(({ id, a, b, layer }) => ({ id, a, b, layer })),
    motors: keptMotors,
    layers,
    sensors: list(data.sensors, 'sensors').filter((id) => nodeIds.has(id)),
    gyros: list(data.gyros, 'gyros').filter((id) => beamIds.has(id)),
    angles: list(data.angles, 'angles').filter((pair) => joinedPair(pair?.driven, pair?.base)).map(({ driven, base }) => ({ driven, base })),
    cpu,
    program: typeof data.program === 'string' ? data.program : '',
    nextId: Math.max(0, ...allIds) + 1,
  };
}

export function robotFromText(text) {
  try {
    return { design: parseRobot(text) };
  } catch (error) {
    if (!(error instanceof RobotTextError)) throw error;
    return { error: error.message };
  }
}
