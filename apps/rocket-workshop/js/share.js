import { CPU_CLOCKS, ENGINE_DEFAULTS, MOTOR_DEFAULTS, PEN_COLORS, WHEEL_DEFAULTS, sharedNode } from './design.js';

const FORMAT = 'rocket-workshop';
const VERSION = 1;
const MOTOR_MODES = ['spin', 'swing', 'steer'];

class RocketTextError extends Error {}

function roundTo(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function rocketToText(design) {
  const nodes = design.nodes.map(({ id, x, y }) => ({ id, x: roundTo(x, 4), y: roundTo(y, 4) }));
  return JSON.stringify({ format: FORMAT, version: VERSION, ...design, nodes });
}

function list(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new RocketTextError(`"${name}" should be a list.`);
  return value;
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function uniqueIds(items, name) {
  const ids = new Set();
  for (const item of items) {
    if (!Number.isInteger(item?.id) || ids.has(item.id)) throw new RocketTextError(`Every item in "${name}" needs its own whole-number id.`);
    ids.add(item.id);
  }
  return ids;
}

function parseRocket(text) {
  let data;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new RocketTextError("That isn't rocket text. Copy a rocket with Copy rocket and paste all of it.");
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.nodes) || (data.format !== undefined && data.format !== FORMAT)) throw new RocketTextError("That text isn't a Rocket Workshop rocket.");
  if (data.version > VERSION) throw new RocketTextError('That rocket comes from a newer version of Rocket Workshop. Reload the page and try again.');

  const nodes = list(data.nodes, 'nodes');
  const nodeIds = uniqueIds(nodes, 'nodes');
  for (const node of nodes) {
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new RocketTextError(`Joint ${node.id} has no position.`);
  }

  const layers = list(data.layers, 'layers').filter((name) => typeof name === 'string');
  if (!layers.length) layers.push('Layer 1');

  const beams = list(data.beams, 'beams');
  const beamIds = uniqueIds(beams, 'beams');
  for (const beam of beams) {
    if (!nodeIds.has(beam.a) || !nodeIds.has(beam.b) || beam.a === beam.b) throw new RocketTextError(`Beam ${beam.id} doesn't join two joints of this rocket.`);
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
    ...Object.fromEntries(['power', 'amplitude', 'frequency', 'phase', 'stallTorque', 'freeRpm', 'steerRange'].map((key) => [key, finite(motor[key], MOTOR_DEFAULTS[key])])),
  }));

  const endOf = (beamId, nodeId) => beamIds.has(beamId) && (beamById.get(beamId).a === nodeId || beamById.get(beamId).b === nodeId);
  const onePerBeam = (items) => items.filter((item, i) => items.findIndex((other) => other.beam === item.beam) === i);
  const clamp = (value, low, high, fallback) => Math.max(low, Math.min(high, finite(value, fallback)));

  const cpu = data.cpu && beamIds.has(data.cpu.beam) ? { beam: data.cpu.beam, clock: CPU_CLOCKS.includes(data.cpu.clock) ? data.cpu.clock : 5000 } : null;
  const allIds = [...nodeIds, ...beamIds, ...keptMotors.map((motor) => motor.id)];

  return {
    nodes: nodes.map(({ id, x, y }) => ({ id, x, y })),
    beams: beams.map(({ id, a, b, layer }) => ({ id, a, b, layer })),
    motors: keptMotors,
    layers,
    sensors: list(data.sensors, 'sensors').filter((id) => nodeIds.has(id)),
    gyros: list(data.gyros, 'gyros').filter((id) => beamIds.has(id)),
    pens: list(data.pens, 'pens')
      .filter((pen) => nodeIds.has(pen?.node) || beamIds.has(pen?.beam))
      .map((pen, i) => ({
        ...(nodeIds.has(pen.node) ? { node: pen.node } : { beam: pen.beam }),
        color: /^#[0-9a-f]{6}$/i.test(pen.color) ? pen.color : PEN_COLORS[i % PEN_COLORS.length],
      })),
    angles: list(data.angles, 'angles').filter((pair) => joinedPair(pair?.driven, pair?.base)).map(({ driven, base }) => ({ driven, base })),
    engines: onePerBeam(list(data.engines, 'engines').filter((engine) => endOf(engine?.beam, engine?.nozzle))).map((engine) => ({
      beam: engine.beam,
      nozzle: engine.nozzle,
      thrust: clamp(engine.thrust, 1, 1000, ENGINE_DEFAULTS.thrust),
      limit: clamp(engine.limit, 0, 1, ENGINE_DEFAULTS.limit),
    })),
    tanks: [...new Set(list(data.tanks, 'tanks').filter((id) => beamIds.has(id)))],
    separators: onePerBeam(list(data.separators, 'separators').filter((separator) => beamIds.has(separator?.beam) && Number.isInteger(separator.group) && separator.group >= 1 && separator.group <= 9)).map(({ beam, group }) => ({ beam, group })),
    wheels: onePerBeam(list(data.wheels, 'wheels').filter((wheel) => beamIds.has(wheel?.beam))).map((wheel) => ({
      beam: wheel.beam,
      torque: clamp(wheel.torque, 1, 1000, WHEEL_DEFAULTS.torque),
      hold: typeof wheel.hold === 'boolean' ? wheel.hold : WHEEL_DEFAULTS.hold,
    })),
    ranges: onePerBeam(list(data.ranges, 'ranges').filter((range) => endOf(range?.beam, range?.tip))).map(({ beam, tip }) => ({ beam, tip })),
    cpu,
    program: typeof data.program === 'string' ? data.program : '',
    nextId: Math.max(0, ...allIds) + 1,
  };
}

export function rocketFromText(text) {
  try {
    return { design: parseRocket(text) };
  } catch (error) {
    if (!(error instanceof RocketTextError)) throw error;
    return { error: error.message };
  }
}
