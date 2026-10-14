import { CPU_CLOCKS, addBeam, addLayer, addMotor, addNode, beamMap, cloneDesign, isDesign, motorLayer, motorPivot, mountCpu, nodeLayers, nodeMap, removeBeam, removeMotor, removeNode, separatorGroupCount, sharedNode, toggleAngleSensor, toggleEngine, toggleGyro, togglePen, toggleRange, toggleSensor, toggleSeparator, toggleTank, toggleWheel, withDefaults } from './design.js';
import { BUILTINS, CPU_READINGS, DEVICES, compile } from './cpu.js';
import { PRESETS } from './presets.js';
import { LIBRARY } from './programs.js';
import { rocketFromText, rocketToText } from './share.js';
import { predictPath } from './orbit.js';
import { BODIES, EARTH, bodyState, dominantBody } from './planets.js';
import { ENGINE_FIRING, Simulation, TANK, WORLD } from './sim.js';

const NEW_PROGRAM_INTRO = `# This program runs over and over while the rocket flies.
# Read sensors, then set engine throttles from 0 to 1 and
# motor powers from -1 to 1.
# Open "What the program can use" below for every name.

`;
const WATCH_INTERVAL_MS = 150;
const PEN_STEP_METERS = 0.5;
const PEN_MAX_POINTS = 20000;
const WARP_SPEEDS = [1, 2, 5, 10, 100, 1000, 10000, 100000];
const FULL_PHYSICS_WARP = 10;
const PREDICT_INTERVAL_MS = 200;
const PATH_MIN_SPEED = 2;
const SEPARATOR_GROUPS = 4;
const SKY_GROUND = [40, 92, 150];
const SKY_SPACE = [5, 13, 24];

const SENSOR_HINTS = {
  touch: 'Tap a joint to give it a touch sensor. It reads 1 while that joint touches the ground.',
  gyro: 'Tap a beam to give it a gyro. It reads that beam\'s tilt and spin against the world.',
  angle: 'Tap a beam, then a beam joined to it. The angle sensor reads how far the first turns against the second.',
  range: 'Tap a beam near one end. A rangefinder there looks outward along the beam and reads the distance to the ground.',
};

const STORAGE_KEY = 'rocket-workshop:v1';
const GRID_METERS = 0.5;
const MIN_BEAM_METERS = 0.2;
const HIT_PX = 14;
const TAP_SLOP_PX = 6;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 40;
const UNDO_LIMIT = 100;
const MIN_SCALE = 0.00001;
const MAX_SCALE = 300;
const LABEL_MIN_SCALE = 8;
const MAP_SCALE = 0.3;
const GRID_MIN_SCALE = 2;

const TOOL_HINTS = {
  beam: 'Drag from one point to another to add a beam. Start or end on a joint to connect to it.',
  motor: 'Tap the beam the motor should turn.',
  engine: 'Tap a beam near the end where the nozzle goes. The engine pushes toward the other end. Tap the same end again to remove it.',
  tank: 'Tap a beam to turn it into a fuel tank, or tap a tank to turn it back into a beam.',
  wheel: 'Tap a beam to mount a reaction wheel on it. A and D twist the rocket, and it holds still when you let go.',
  separator: 'Pick a group above the board, then tap the beams that hold two stages together. Firing a group lets go of all its beams at once.',
  sensor: 'Pick a sensor kind above the board, then tap to add it. Tap it again to remove it.',
  cpu: 'Tap a beam to mount the CPU on it. Build it upright, and its gyro measures that beam.',
  pen: 'Tap a joint, or the middle of a beam, to give it a pen. While the rocket flies, the pen draws its path.',
  move: 'Drag a joint to move it. Drag empty space to pan.',
  erase: 'Tap a joint or a beam to remove it.',
};

const MOTOR_FIELDS = [
  { key: 'power', label: 'Power', modes: ['spin'], min: -100, max: 100, step: 5, toSlider: (v) => v * 100, fromSlider: (v) => v / 100, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'amplitude', label: 'Swing', modes: ['swing'], min: 0, max: 90, step: 1, format: (v) => `±${v}°` },
  { key: 'frequency', label: 'Swings per second', modes: ['swing'], min: 0.1, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'phase', label: 'Phase', modes: ['swing'], min: 0, max: 345, step: 15, format: (v) => `${v}°` },
  { key: 'steerRange', label: 'Steering range (negative turns the other way)', modes: ['steer'], min: -45, max: 45, step: 1, format: (v) => `${v}°` },
  { key: 'stallTorque', label: 'Stall torque', min: 100, max: 50000, step: 100, format: (v) => `${v} N·m` },
  { key: 'freeRpm', label: 'Top speed', min: 5, max: 120, step: 5, format: (v) => `${v} rpm` },
];

const ENGINE_FIELDS = {
  thrust: { key: 'thrust', label: 'Full thrust', min: 5, max: 500, step: 5, format: (v) => `${v} kN` },
  gimbal: { key: 'gimbal', label: 'Gimbal range (A and D tilt the thrust)', min: 0, max: 20, step: 1, format: (v) => `±${v}°` },
  limit: { key: 'limit', label: 'Thrust limit', min: 0, max: 100, step: 5, toSlider: (v) => v * 100, fromSlider: (v) => v / 100, format: (v) => `${Math.round(v * 100)}%` },
};

const WHEEL_FIELDS = [
  { key: 'torque', label: 'Most torque', min: 1, max: 200, step: 1, format: (v) => `${v} kN·m` },
];

const LAYER_COLORS = ['#9fd0ff', '#ffd36e', '#c4a8ff', '#7dffa8', '#ff9fc6', '#6fe8e0'];

const COLORS = {
  sky: '#050d18',
  gridMinor: 'rgba(61, 143, 224, 0.08)',
  gridMajor: 'rgba(61, 143, 224, 0.2)',
  ground: '#0a1a2c',
  groundEdge: '#3d8fdd',
  label: '#6f9dc9',
  ghost: 'rgba(159, 208, 255, 0.12)',
  link: '#ffffff',
  beamShadow: 'rgba(3, 8, 15, 0.7)',
  joint: '#e2effd',
  hover: '#5fe3ff',
  erase: '#ff8a9a',
  motor: '#ffb454',
  pad: '#4b5a6a',
  tank: '#d5dee8',
  fuel: '#ff9f43',
  engine: '#9aa5b1',
  flame: '#ffcf5c',
  separator: '#ffd36e',
  range: '#ff6b6b',
  wheel: '#c4a8ff',
  path: 'rgba(95, 227, 255, 0.75)',
  apsis: '#5fe3ff',
  impact: '#ff6b6b',
  chip: '#123d2c',
  chipEdge: '#7dffa8',
  sensor: '#ff9fc6',
};

const $ = (selector) => document.querySelector(selector);
const canvas = $('[data-stage]');
const context = canvas.getContext('2d');
const statusLine = $('[data-status]');
const runButton = $('[data-run]');
const undoButton = $('[data-undo]');
const redoButton = $('[data-redo]');
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const layerBar = $('[data-layers]');
const sensorKindBar = $('[data-sensor-kinds]');
const sensorKindButtons = [...document.querySelectorAll('[data-sensor-kind]')];
const separatorGroupBar = $('[data-separator-groups]');
const separatorGroupButtons = [...document.querySelectorAll('[data-separator-group]')];
const engineList = $('[data-engines]');
const wheelList = $('[data-wheels]');
const noWheels = $('[data-no-wheels]');
const noEngines = $('[data-no-engines]');
const stageList = $('[data-stages]');
const warpSelect = $('[data-warp]');
const hud = $('[data-hud]');
const flightControls = $('[data-flight]');
const throttleLever = $('[data-throttle]');
const throttleReadout = $('[data-throttle-readout]');
const assistButton = $('[data-assist]');
const motorList = $('[data-motors]');
const noMotors = $('[data-no-motors]');
const presetSelect = $('[data-preset]');
const snapBox = $('[data-snap]');
const followBox = $('[data-follow]');
const pathBox = $('[data-path]');
const cpuEmpty = $('[data-no-cpu]');
const cpuBody = $('[data-cpu-body]');
const codeBox = $('[data-code]');
const codeError = $('[data-code-error]');
const clockSelect = $('[data-clock]');
const cpuUsage = $('[data-cpu-usage]');
const watchList = $('[data-watch]');
const reference = $('[data-reference]');
const librarySelect = $('[data-library]');
const libraryNeeds = $('[data-library-needs]');
const stats = Object.fromEntries([...document.querySelectorAll('[data-stat]')].map((el) => [el.dataset.stat, el]));

let design = loadDesign();
let committed = cloneDesign(design);
const undoStack = [];
const redoStack = [];
let tool = 'beam';
let sensorKind = 'touch';
let activeLayer = 0;
let focused = false;
let separatorGroup = 1;
const pilot = { throttle: 0, left: false, right: false, assist: true };
let sim = null;
let camera = { x: 0, y: 6, scale: 20, rotation: 0 };
let view = { width: 0, height: 0 };
let hover = null;
let pendingBeam = null;
let highlightedMotor = null;
let gesture = null;
const pointers = new Map();
let lastFrame = performance.now();
let accumulator = 0;
let fittedOnce = false;
let compiled = null;
let trails = [];
let prediction = null;
let lastPrediction = 0;
let drivenKey = '';
let lastWatch = 0;

function loadDesign() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isDesign(stored)) return withDefaults(stored);
  } catch {}
  return PRESETS.hopper.build();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(design));
  } catch {}
}

function say(text) {
  statusLine.textContent = text;
}

function commit() {
  undoStack.push(committed);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
  committed = cloneDesign(design);
  if (!sim) trails = [];
  save();
  refreshProgram();
  renderControls();
}

function restore(from, to) {
  if (sim || !from.length) return;
  to.push(committed);
  design = from.pop();
  committed = cloneDesign(design);
  pendingBeam = null;
  activeLayer = Math.min(activeLayer, design.layers.length - 1);
  save();
  refreshProgram();
  renderCpu();
  renderMotors();
  renderControls();
  renderLayers();
}

function layerColor(layer) {
  return LAYER_COLORS[layer % LAYER_COLORS.length];
}

function beamEditable(beam) {
  if (!focused || beam.layer === activeLayer) return true;
  const pending = pendingBeam !== null && beamMap(design).get(pendingBeam);
  return Boolean(pending) && sharedNode(pending, beam) !== null;
}

function nodeEditable(layers) {
  return !focused || layers.size === 0 || layers.has(activeLayer);
}

function screenDeltaToWorld(dx, dy) {
  const right = dx / camera.scale;
  const up = -dy / camera.scale;
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  return { x: right * cos - up * sin, y: right * sin + up * cos };
}

function toWorld(point) {
  const offset = screenDeltaToWorld(point.x - view.width / 2, point.y - view.height / 2);
  return { x: camera.x + offset.x, y: camera.y + offset.y };
}

function toScreen(x, y) {
  const dx = x - camera.x;
  const dy = y - camera.y;
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  return { x: view.width / 2 + (dx * cos + dy * sin) * camera.scale, y: view.height / 2 - (-dx * sin + dy * cos) * camera.scale };
}

function px(meters, minimum) {
  return Math.max(minimum, camera.scale * meters);
}

function panBy(dx, dy) {
  const offset = screenDeltaToWorld(dx, dy);
  camera.x -= offset.x;
  camera.y -= offset.y;
}

function snapped(world) {
  const snap = (v) => (snapBox.checked ? Math.round(v / GRID_METERS) * GRID_METERS : v);
  return { x: snap(world.x), y: Math.max(0, snap(world.y)) };
}

function positions() {
  if (!sim) return nodeMap(design);
  return new Map(sim.ids.map((id, i) => [id, { x: sim.x[i], y: sim.y[i] }]));
}

function hitNode(point) {
  let best = null;
  let bestDistance = HIT_PX;
  const layers = nodeLayers(design);
  for (const node of design.nodes) {
    if (!nodeEditable(layers.get(node.id))) continue;
    const s = toScreen(node.x, node.y);
    const distance = Math.hypot(s.x - point.x, s.y - point.y);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }
  return best;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function hitBeam(point) {
  const nodes = nodeMap(design);
  let best = null;
  let bestDistance = HIT_PX * 0.7;
  for (const beam of design.beams) {
    if (!beamEditable(beam)) continue;
    const a = nodes.get(beam.a);
    const b = nodes.get(beam.b);
    const distance = distanceToSegment(point, toScreen(a.x, a.y), toScreen(b.x, b.y));
    if (distance < bestDistance) {
      best = beam;
      bestDistance = distance;
    }
  }
  return best;
}

function beamEndAt(point) {
  const node = hitNode(point);
  return node ? { nodeId: node.id, x: node.x, y: node.y } : snapped(toWorld(point));
}

function finishBeam({ from, to }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < MIN_BEAM_METERS) return;
  const a = from.nodeId ?? addNode(design, from.x, from.y).id;
  const b = to.nodeId ?? addNode(design, to.x, to.y).id;
  if (a === b) return;
  addBeam(design, a, b, activeLayer);
  commit();
}

function tapMotor(point) {
  const beam = hitBeam(point);
  if (!beam) {
    pendingBeam = null;
    say(TOOL_HINTS.motor);
    return;
  }
  if (pendingBeam === null || pendingBeam === beam.id) {
    pendingBeam = pendingBeam === beam.id ? null : beam.id;
    say(pendingBeam === null ? TOOL_HINTS.motor : 'Now tap a beam joined to it at the same joint. The motor pushes against that one.');
    return;
  }
  const driven = beamMap(design).get(pendingBeam);
  pendingBeam = null;
  if (sharedNode(driven, beam) === null) {
    say("Those two beams don't meet at a joint. Tap the beam to turn again.");
    return;
  }
  if (design.motors.some((m) => (m.driven === driven.id && m.base === beam.id) || (m.driven === beam.id && m.base === driven.id))) {
    say('Those two beams already have a motor.');
    return;
  }
  addMotor(design, driven, beam);
  commit();
  renderMotors();
  say('Motor added. Set its power in the panel, then press Run.');
}

function tapErase(point) {
  const node = hitNode(point);
  const beam = node ? null : hitBeam(point);
  if (node && focused) {
    for (const own of design.beams.filter((b) => b.layer === activeLayer && (b.a === node.id || b.b === node.id))) removeBeam(design, own.id);
  } else if (node) removeNode(design, node.id);
  else if (beam) removeBeam(design, beam.id);
  else return;
  commit();
  renderMotors();
}

function tapSensor(point) {
  if (sensorKind === 'touch') {
    const node = hitNode(point);
    if (!node) return;
    const added = toggleSensor(design, node.id);
    commit();
    renderCpu();
    say(added ? `Touch sensor touch${design.sensors.length} added. It reads 1 while the joint touches the ground.` : 'Touch sensor removed. The ones after it moved up a number.');
    return;
  }
  const beam = hitBeam(point);
  if (sensorKind === 'range') {
    if (!beam) return;
    const added = toggleRange(design, beam.id, nearerEnd(beam, point));
    commit();
    renderCpu();
    say(added ? `range${design.ranges.length} added. It reads the distance to the ground along the beam, outward from this end.` : 'Rangefinder removed. The ones after it moved up a number.');
    return;
  }
  if (sensorKind === 'gyro') {
    if (!beam) return;
    const added = toggleGyro(design, beam.id);
    commit();
    renderCpu();
    say(added ? `gyro${design.gyros.length} added. It reads this beam's tilt and spin.` : 'Gyro removed. The ones after it moved up a number.');
    return;
  }
  if (!beam || pendingBeam === null || pendingBeam === beam.id) {
    pendingBeam = beam && pendingBeam !== beam.id ? beam.id : null;
    say(pendingBeam === null ? SENSOR_HINTS.angle : 'Now tap a beam joined to it at the same joint.');
    return;
  }
  const measured = beamMap(design).get(pendingBeam);
  pendingBeam = null;
  if (sharedNode(measured, beam) === null) {
    say("Those two beams don't meet at a joint. Tap the first beam again.");
    return;
  }
  const added = toggleAngleSensor(design, measured, beam);
  commit();
  renderCpu();
  say(added ? `angle${design.angles.length} added. It reads how far the first beam turns against the second.` : 'Angle sensor removed. The ones after it moved up a number.');
}

function tapPen(point) {
  const node = hitNode(point);
  const beam = node ? null : hitBeam(point);
  if (!node && !beam) return;
  const added = togglePen(design, node ? { node: node.id } : { beam: beam.id });
  commit();
  renderCpu();
  say(added ? `pen${design.pens.length} added. Press Run to see its path.` : 'Pen removed. The ones after it moved up a number.');
}

function nearerEnd(beam, point) {
  const nodes = nodeMap(design);
  const a = nodes.get(beam.a);
  const b = nodes.get(beam.b);
  const sa = toScreen(a.x, a.y);
  const sb = toScreen(b.x, b.y);
  return Math.hypot(sa.x - point.x, sa.y - point.y) <= Math.hypot(sb.x - point.x, sb.y - point.y) ? beam.a : beam.b;
}

function tapEngine(point) {
  const beam = hitBeam(point);
  if (!beam) return;
  const added = toggleEngine(design, beam.id, nearerEnd(beam, point));
  commit();
  renderEngines();
  renderCpu();
  say(added ? `engine${design.engines.length} added. It pushes from the nozzle toward the other end of the beam.` : 'Engine removed. The ones after it moved up a number.');
}

function tapTank(point) {
  const beam = hitBeam(point);
  if (!beam) return;
  const added = toggleTank(design, beam.id);
  commit();
  say(added ? 'Fuel tank made. Longer tanks hold more fuel. Engines burn from the nearest tank they are still attached to.' : 'Tank turned back into a plain beam.');
}

function tapWheel(point) {
  const beam = hitBeam(point);
  if (!beam) return;
  const added = toggleWheel(design, beam.id);
  commit();
  renderWheels();
  renderCpu();
  say(added ? `wheel${design.wheels.length} added. While flying, A and D twist the rocket with it.` : 'Reaction wheel removed. The ones after it moved up a number.');
}

function tapSeparator(point) {
  const beam = hitBeam(point);
  if (!beam) return;
  const added = toggleSeparator(design, beam.id, separatorGroup);
  commit();
  renderStages();
  renderCpu();
  say(added ? `Beam added to separator group ${separatorGroup}. Fire it with sep${separatorGroup}.fire = 1, the Stages buttons, or key ${separatorGroup} while flying.` : 'Separator removed.');
}

function setSeparatorGroup(group) {
  separatorGroup = group;
  say(TOOL_HINTS.separator);
  renderControls();
}

function recordTrails() {
  sim.pens.forEach((pen, i) => {
    const lines = trails[i];
    const line = lines[lines.length - 1];
    if (!pen.down) {
      if (line.length) lines.push([]);
      return;
    }
    const point = sim.penPoint(pen);
    const last = line[line.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < PEN_STEP_METERS) return;
    line.push(point);
    let total = lines.reduce((sum, l) => sum + l.length, 0);
    while (total > PEN_MAX_POINTS) {
      lines[0].shift();
      if (!lines[0].length && lines.length > 1) lines.shift();
      total -= 1;
    }
  });
}

function setSensorKind(kind) {
  sensorKind = kind;
  pendingBeam = null;
  hover = null;
  say(SENSOR_HINTS[kind]);
  renderControls();
}

function tapCpu(point) {
  const beam = hitBeam(point);
  if (!beam) return;
  mountCpu(design, beam.id);
  if (!design.program.trim()) design.program = NEW_PROGRAM_INTRO + (design.motors.length ? 'motor1.power = 1\n' : '# Add a motor, then drive it here with motor1.power = 1\n');
  commit();
  renderCpu();
  say('CPU mounted. Write its program in the panel.');
}

function zoomAt(point, factor) {
  const before = toWorld(point);
  camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, camera.scale * factor));
  const after = toWorld(point);
  camera.x += before.x - after.x;
  camera.y += before.y - after.y;
}

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, spread: Math.hypot(a.x - b.x, a.y - b.y) };
}

function localPoint(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size === 2) {
    if (gesture?.kind === 'move') commit();
    gesture = { kind: 'pinch', ...pinchState() };
    return;
  }
  if (pointers.size > 2) return;
  if (event.button === 1 || event.button === 2 || sim) {
    gesture = { kind: 'pan', last: point };
  } else if (tool === 'beam') {
    const end = beamEndAt(point);
    gesture = { kind: 'beam', from: end, to: end };
  } else if (tool === 'move') {
    const node = hitNode(point);
    gesture = node ? { kind: 'move', node, moved: false } : { kind: 'pan', last: point };
  } else {
    gesture = { kind: 'tap', start: point, last: point };
  }
});

canvas.addEventListener('pointermove', (event) => {
  const point = localPoint(event);
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, point);
  if (!gesture) {
    hover = sim ? null : hoverAt(point);
    return;
  }
  if (gesture.kind === 'pinch' && pointers.size === 2) {
    const next = pinchState();
    panBy(next.center.x - gesture.center.x, next.center.y - gesture.center.y);
    if (gesture.spread > 0) zoomAt(next.center, next.spread / gesture.spread);
    Object.assign(gesture, next);
  } else if (gesture.kind === 'pan') {
    panBy(point.x - gesture.last.x, point.y - gesture.last.y);
    gesture.last = point;
  } else if (gesture.kind === 'beam') {
    gesture.to = beamEndAt(point);
  } else if (gesture.kind === 'move') {
    Object.assign(gesture.node, snapped(toWorld(point)));
    gesture.moved = true;
  } else if (gesture.kind === 'tap' && Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) > TAP_SLOP_PX) {
    gesture = { kind: 'pan', last: point };
  }
});

function endGesture(event) {
  pointers.delete(event.pointerId);
  if (!gesture) return;
  const point = localPoint(event);
  if (gesture.kind === 'beam') finishBeam(gesture);
  if (gesture.kind === 'move' && gesture.moved) commit();
  if (gesture.kind === 'tap' && tool === 'motor') tapMotor(point);
  if (gesture.kind === 'tap' && tool === 'erase') tapErase(point);
  if (gesture.kind === 'tap' && tool === 'sensor') tapSensor(point);
  if (gesture.kind === 'tap' && tool === 'cpu') tapCpu(point);
  if (gesture.kind === 'tap' && tool === 'pen') tapPen(point);
  if (gesture.kind === 'tap' && tool === 'engine') tapEngine(point);
  if (gesture.kind === 'tap' && tool === 'tank') tapTank(point);
  if (gesture.kind === 'tap' && tool === 'wheel') tapWheel(point);
  if (gesture.kind === 'tap' && tool === 'separator') tapSeparator(point);
  if (gesture.kind !== 'pinch' || pointers.size === 0) gesture = null;
}

canvas.addEventListener('pointerup', endGesture);
canvas.addEventListener('pointercancel', endGesture);
canvas.addEventListener('pointerleave', () => {
  if (!gesture) hover = null;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(localPoint(event), Math.exp(-event.deltaY * 0.0015));
}, { passive: false });

function hoverAt(point) {
  if (['motor', 'cpu', 'engine', 'tank', 'separator', 'wheel'].includes(tool) || (tool === 'sensor' && sensorKind !== 'touch')) {
    const beam = hitBeam(point);
    return beam && { kind: 'beam', id: beam.id };
  }
  const node = hitNode(point);
  if (node) return { kind: 'node', id: node.id };
  if (tool !== 'erase' && tool !== 'pen') return null;
  const beam = hitBeam(point);
  return beam && { kind: 'beam', id: beam.id };
}

function setTool(next) {
  tool = next;
  pendingBeam = null;
  hover = null;
  say(tool === 'sensor' ? SENSOR_HINTS[sensorKind] : TOOL_HINTS[tool]);
  renderControls();
}

function startRun() {
  if (!design.nodes.length) {
    say('Build something first. Drag on the board with the Beam tool.');
    return;
  }
  const program = design.cpu && compiled.ok ? compiled.program : null;
  sim = new Simulation(design, program);
  trails = sim.pens.map(() => [[]]);
  prediction = null;
  setThrottle(0);
  pilot.left = false;
  pilot.right = false;
  accumulator = 0;
  gesture = null;
  hover = null;
  pendingBeam = null;
  if (design.cpu && !compiled.ok) say(`Running with the CPU off, because line ${compiled.error.line} of the program has an error.`);
  else say(design.engines.length ? 'Flying. Z full throttle, X cut, W and S change it, A and D steer, T toggles stability assist, number keys fire separators.' : 'Flying, but with no engine. Add one with the Engine tool.');
  renderControls();
  renderMotors();
  renderEngines();
  renderWheels();
  renderStages();
  renderCpu();
}

function stopRun() {
  sim = null;
  camera.rotation = 0;
  say(TOOL_HINTS[tool]);
  fit();
  renderControls();
  renderMotors();
  renderEngines();
  renderWheels();
  renderStages();
  renderCpu();
}

function hardware() {
  return { motor: design.motors.length, touch: design.sensors.length, gyro: design.gyros.length, angle: design.angles.length, pen: design.pens.length, engine: design.engines.length, sep: separatorGroupCount(design), range: design.ranges.length, wheel: design.wheels.length };
}

function drivenByProgram(kind = 'motor') {
  return design.cpu && compiled?.ok ? compiled.program.drives[kind] : new Set();
}

function refreshProgram() {
  compiled = compile(design.program, hardware());
  codeError.textContent = compiled.ok ? '' : `Line ${compiled.error.line}: ${compiled.error.message}`;
  const key = ['motor', 'engine', 'wheel', 'gimbal'].map((kind) => [...drivenByProgram(kind)].join(',')).join('|');
  if (key !== drivenKey) {
    drivenKey = key;
    renderMotors();
    renderEngines();
    renderWheels();
  }
}

function referenceRow(name, help) {
  const row = document.createElement('div');
  const term = document.createElement('dt');
  term.textContent = name;
  const text = document.createElement('dd');
  text.textContent = help;
  row.append(term, text);
  return row;
}

function renderReference() {
  const rows = [];
  const counts = hardware();
  for (const [kind, device] of Object.entries(DEVICES)) {
    for (let i = 1; i <= counts[kind]; i += 1) {
      for (const [port, spec] of Object.entries(device.ports)) rows.push(referenceRow(`${kind}${i}.${port}`, spec.help));
    }
  }
  design.sensors.forEach((_, i) => rows.push(referenceRow(`touch${i + 1}`, '1 while this joint touches the ground, otherwise 0')));
  for (const [name, help] of Object.entries(CPU_READINGS)) rows.push(referenceRow(name, help));
  for (const builtin of Object.values(BUILTINS)) {
    const [call, ...words] = builtin.help.split(' ');
    rows.push(referenceRow(call, words.join(' ')));
  }
  reference.replaceChildren(...rows);
}

function renderCpu() {
  cpuEmpty.hidden = Boolean(design.cpu);
  cpuBody.hidden = !design.cpu;
  if (!design.cpu) return;
  if (codeBox.value !== design.program) codeBox.value = design.program;
  codeBox.readOnly = Boolean(sim);
  clockSelect.value = String(design.cpu.clock);
  clockSelect.disabled = Boolean(sim);
  watchList.hidden = !sim?.processor;
  cpuUsage.textContent = sim ? '' : 'Every operation in the program costs one tick of the clock. A faster clock repeats the program more times a second.';
  renderReference();
}

function renderWatch(now) {
  const processor = sim?.processor;
  if (!processor || now - lastWatch < WATCH_INTERVAL_MS) return;
  lastWatch = now;
  const rate = processor.dt > 0 ? Math.round(1 / processor.dt) : 0;
  cpuUsage.textContent = `The program repeats about ${rate} times a second.`;
  const variables = processor.program.variables.map((name, i) => referenceRow(name, String(Math.round(processor.values[i] * 1000) / 1000)));
  const powers = sim.motors.flatMap((motor, i) => (motor.cpuControlled ? [referenceRow(`motor${i + 1}.power`, motor.cpuPower.toFixed(2))] : []));
  const throttles = sim.engines.flatMap((engine, i) => [
    ...(engine.cpuControlled ? [referenceRow(`engine${i + 1}.throttle`, engine.cpuThrottle.toFixed(2))] : []),
    ...(engine.cpuSteers ? [referenceRow(`engine${i + 1}.gimbal`, engine.cpuGimbal.toFixed(2))] : []),
  ]);
  const twists = sim.wheels.flatMap((wheel, i) => (wheel.cpuControlled ? [referenceRow(`wheel${i + 1}.torque`, wheel.cpuTorque.toFixed(2))] : []));
  watchList.replaceChildren(...variables, ...powers, ...throttles, ...twists);
}

function fit() {
  const points = [...positions().values()];
  if (!points.length) {
    camera = { x: 0, y: 6, scale: 20, rotation: camera.rotation };
    return;
  }
  const xs = points.map((p) => p.x);
  const ys = [0, ...points.map((p) => p.y)];
  const width = Math.max(5, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(5, Math.max(...ys) - Math.min(...ys));
  const toolbarRoom = 60;
  camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(view.width / (width * 1.4), (view.height - toolbarRoom) / (height * 1.6))));
  camera.x = (Math.max(...xs) + Math.min(...xs)) / 2;
  camera.y = (Math.max(...ys) + Math.min(...ys)) / 2 + toolbarRoom / 2 / camera.scale;
}

function showLayer(layer) {
  focused = layer !== null;
  if (focused) activeLayer = layer;
  pendingBeam = null;
  hover = null;
  const name = design.layers[activeLayer];
  say(focused ? `Layer ${activeLayer + 1}: ${name}. Other layers are faded and locked. Rings mark joints shared with another layer.` : `All layers. New beams go on layer ${activeLayer + 1}: ${name}.`);
  renderLayers();
}

function renderLayers() {
  const chip = (text, title, pressed, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = title;
    button.setAttribute('aria-pressed', String(pressed));
    button.addEventListener('click', onClick);
    return button;
  };
  const all = chip('All', 'Show every layer', !focused, () => showLayer(null));
  const layers = design.layers.map((name, layer) => {
    const button = chip(String(layer + 1), `Layer ${layer + 1}: ${name}`, focused && layer === activeLayer, () => showLayer(layer));
    button.style.setProperty('--layer', layerColor(layer));
    button.classList.toggle('rw-target', layer === activeLayer);
    return button;
  });
  const add = chip('+', 'Add a layer', false, () => {
    showLayer(addLayer(design));
    commit();
  });
  add.disabled = Boolean(sim);
  layerBar.replaceChildren(all, ...layers, add);
}

function renderControls() {
  for (const button of toolButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.tool === tool && !sim));
    button.disabled = Boolean(sim);
  }
  undoButton.disabled = Boolean(sim) || !undoStack.length;
  redoButton.disabled = Boolean(sim) || !redoStack.length;
  runButton.textContent = sim ? 'Stop' : 'Run';
  runButton.setAttribute('aria-pressed', String(Boolean(sim)));
  flightControls.hidden = !sim;
  sensorKindBar.hidden = tool !== 'sensor' || Boolean(sim);
  separatorGroupBar.hidden = tool !== 'separator' || Boolean(sim);
  for (const button of separatorGroupButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.separatorGroup) === separatorGroup));
  for (const button of sensorKindButtons) button.setAttribute('aria-pressed', String(button.dataset.sensorKind === sensorKind));
  renderLayers();
  stats.mass.textContent = design.nodes.length ? `${Math.round(new Simulation(design).totalMass).toLocaleString('en')} kg` : '–';
}

function slider(motor, field) {
  const label = document.createElement('label');
  label.className = 'rw-slider';
  const name = document.createElement('span');
  name.textContent = field.label;
  const output = document.createElement('output');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = field.min;
  input.max = field.max;
  input.step = field.step;
  input.value = field.toSlider ? field.toSlider(motor[field.key]) : motor[field.key];
  output.textContent = field.format(motor[field.key]);
  input.addEventListener('input', () => {
    motor[field.key] = field.fromSlider ? field.fromSlider(Number(input.value)) : Number(input.value);
    output.textContent = field.format(motor[field.key]);
  });
  input.addEventListener('change', commit);
  label.append(name, output, input);
  return label;
}

function renderMotors() {
  motorList.replaceChildren(...design.motors.map((motor, index) => {
    const item = document.createElement('li');
    item.className = 'rw-motor';
    item.addEventListener('pointerenter', () => { highlightedMotor = motor.id; });
    item.addEventListener('pointerleave', () => { highlightedMotor = null; });

    const head = document.createElement('div');
    head.className = 'rw-motor-head';
    const title = document.createElement('strong');
    title.textContent = `Motor ${index + 1} `;
    const codeName = document.createElement('code');
    codeName.textContent = `motor${index + 1}`;
    title.append(codeName);
    const programmed = drivenByProgram().has(index);
    const mode = document.createElement('select');
    mode.setAttribute('aria-label', `Motor ${index + 1} mode`);
    for (const [value, text] of [['spin', 'Spin'], ['swing', 'Swing back and forth'], ['steer', 'Steer with A and D']]) mode.add(new Option(text, value, false, motor.mode === value));
    mode.addEventListener('change', () => {
      motor.mode = mode.value;
      commit();
      renderMotors();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'rw-remove';
    remove.textContent = 'Remove';
    remove.disabled = Boolean(sim);
    remove.addEventListener('click', () => {
      removeMotor(design, motor.id);
      highlightedMotor = null;
      commit();
      renderMotors();
    });
    if (programmed) {
      const note = document.createElement('span');
      note.className = 'rw-driven';
      note.textContent = 'Driven by the CPU';
      head.append(title, note, remove);
    } else {
      head.append(title, mode, remove);
    }
    item.append(head, ...MOTOR_FIELDS.filter((field) => !field.modes || (!programmed && field.modes.includes(motor.mode))).map((field) => slider(motor, field)));
    return item;
  }));
  noMotors.hidden = design.motors.length > 0;
}

function renderEngines() {
  const programmed = drivenByProgram('engine');
  engineList.replaceChildren(...design.engines.map((engine, index) => {
    const item = document.createElement('li');
    item.className = 'rw-motor rw-engine';
    const head = document.createElement('div');
    head.className = 'rw-motor-head';
    const title = document.createElement('strong');
    title.textContent = `Engine ${index + 1} `;
    const codeName = document.createElement('code');
    codeName.textContent = `engine${index + 1}`;
    title.append(codeName);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'rw-remove';
    remove.textContent = 'Remove';
    remove.disabled = Boolean(sim);
    remove.addEventListener('click', () => {
      design.engines = design.engines.filter((other) => other !== engine);
      commit();
      renderEngines();
      renderCpu();
    });
    head.append(title);
    if (programmed.has(index)) {
      const note = document.createElement('span');
      note.className = 'rw-driven';
      note.textContent = 'Driven by the CPU';
      head.append(note);
    }
    head.append(remove);
    const fields = [ENGINE_FIELDS.thrust, ENGINE_FIELDS.gimbal, ...(programmed.has(index) ? [] : [ENGINE_FIELDS.limit])];
    item.append(head, ...fields.map((field) => slider(engine, field)));
    return item;
  }));
  noEngines.hidden = design.engines.length > 0;
}

function renderWheels() {
  const programmed = drivenByProgram('wheel');
  wheelList.replaceChildren(...design.wheels.map((wheel, index) => {
    const item = document.createElement('li');
    item.className = 'rw-motor rw-wheel';
    const head = document.createElement('div');
    head.className = 'rw-motor-head';
    const title = document.createElement('strong');
    title.textContent = `Wheel ${index + 1} `;
    const codeName = document.createElement('code');
    codeName.textContent = `wheel${index + 1}`;
    title.append(codeName);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'rw-remove';
    remove.textContent = 'Remove';
    remove.disabled = Boolean(sim);
    remove.addEventListener('click', () => {
      design.wheels = design.wheels.filter((other) => other !== wheel);
      commit();
      renderWheels();
      renderCpu();
    });
    head.append(title);
    if (programmed.has(index)) {
      const note = document.createElement('span');
      note.className = 'rw-driven';
      note.textContent = 'Driven by the CPU';
      head.append(note);
    }
    head.append(remove);
    item.append(head, ...WHEEL_FIELDS.map((field) => slider(wheel, field)));
    return item;
  }));
  noWheels.hidden = design.wheels.length > 0;
}

function renderStages() {
  const groups = separatorGroupCount(design);
  stageList.replaceChildren(...Array.from({ length: groups }, (_, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stage = String(i + 1);
    button.textContent = `Fire separators ${i + 1}`;
    button.addEventListener('click', () => sim?.fireSeparators(i + 1));
    return button;
  }));
  stageList.hidden = groups === 0;
}

function formatDistance(meters) {
  return Math.abs(meters) >= 10000 ? `${(meters / 1000).toFixed(1)} km` : `${meters.toFixed(1)} m`;
}

function renderStats() {
  const flight = sim?.telemetry();
  const piece = sim?.cpuGyro ? sim.pieceStats(sim.cpuGyro.a) : null;
  stats.altitude.textContent = flight ? formatDistance(flight.altitude) : '–';
  stats.speed.textContent = flight ? `${flight.speed.toFixed(1)} m/s` : '–';
  stats.vspeed.textContent = flight ? `${flight.vspeed.toFixed(1)} m/s` : '–';
  stats.fuel.textContent = sim ? `${Math.round(piece ? piece.fuel : sim.tanks.reduce((sum, tank) => sum + tank.fuel, 0))} kg` : '–';
  stats.time.textContent = sim ? `${sim.time.toFixed(1)} s` : '–';
  stats.apoapsis.textContent = prediction ? (prediction.apoapsis ? formatDistance(prediction.apoapsis.altitude) : 'Escaping') : '–';
  stats.periapsis.textContent = prediction ? (prediction.periapsis.altitude > 0 ? formatDistance(prediction.periapsis.altitude) : 'Below ground') : '–';
  if (piece) stats.mass.textContent = `${Math.round(piece.mass).toLocaleString('en')} kg`;
  hud.hidden = !flight;
  if (flight) hud.textContent = `${flight.body.name} · ${formatDistance(flight.altitude)} up · ${flight.speed.toFixed(0)} m/s`;
  for (const button of stageList.children) button.disabled = !sim || Boolean(sim.separatorGroups.get(Number(button.dataset.stage))?.fired);
}

function setAssist(on) {
  pilot.assist = on;
  assistButton.setAttribute('aria-pressed', String(on));
  if (sim?.programSteers && on) say('Stability assist is on, but it waits while the program steers.');
}

function setThrottle(value) {
  pilot.throttle = Math.round(Math.max(0, Math.min(1, value)) * 20) / 20;
  throttleLever.value = String(pilot.throttle * 100);
  throttleReadout.textContent = `${Math.round(pilot.throttle * 100)}%`;
}

function advance(seconds) {
  sim.input.throttle = pilot.throttle;
  sim.input.steer = (pilot.right ? 1 : 0) - (pilot.left ? 1 : 0);
  sim.input.assist = pilot.assist;
  const warp = Number(warpSelect.value);
  if (warp > FULL_PHYSICS_WARP) {
    const blocker = sim.railsBlocker();
    if (blocker) {
      const fallback = blocker === ENGINE_FIRING ? 1 : FULL_PHYSICS_WARP;
      setWarp(fallback);
      say(`Fast warp needs every engine off and the rocket above the air, but ${blocker}. Back to ${fallback}×.`);
    } else {
      const stopped = sim.coast(seconds * warp);
      recordTrails();
      if (stopped) {
        setWarp(1);
        say(`Warp stopped because ${stopped}.`);
      }
      followCamera(seconds);
      return;
    }
  }
  accumulator += seconds * Number(warpSelect.value);
  let steps = 0;
  while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
    sim.step(STEP_SECONDS);
    recordTrails();
    accumulator -= STEP_SECONDS;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  if (sim.broken) {
    stopRun();
    say('The simulation blew up. Check for joints stacked on top of each other or beams of almost zero length.');
    return;
  }
  followCamera(seconds);
}

function setWarp(warp) {
  warpSelect.value = String(warp);
  accumulator = 0;
}

function stepWarp(direction) {
  const index = WARP_SPEEDS.indexOf(Number(warpSelect.value)) + direction;
  setWarp(WARP_SPEEDS[Math.max(0, Math.min(WARP_SPEEDS.length - 1, index))]);
}

function followCamera(seconds) {
  const ease = Math.min(1, seconds * 3);
  if (followBox.checked) {
    const target = sim.cpuGyro ? sim.centerOf(sim.cpuGyro) : sim.centerOfMass();
    camera.x = target.x;
    camera.y = target.y;
  }
  const body = dominantBody(camera.x, camera.y, sim.time);
  const center = bodyState(body, sim.time);
  const upright = Math.atan2(camera.y - center.y, camera.x - center.x) - Math.PI / 2;
  camera.rotation += wrapToSigned(upright - camera.rotation) * ease;
}

function drawGrid() {
  const topLeft = toWorld({ x: 0, y: 0 });
  const bottomRight = toWorld({ x: view.width, y: view.height });
  const step = camera.scale > 15 ? 0.5 : 5;
  context.lineWidth = 1;
  for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
    const sx = Math.round(toScreen(x, 0).x) + 0.5;
    context.strokeStyle = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6 ? COLORS.gridMajor : COLORS.gridMinor;
    context.beginPath();
    context.moveTo(sx, 0);
    context.lineTo(sx, view.height);
    context.stroke();
  }
  for (let y = Math.max(0, Math.floor(bottomRight.y / step) * step); y <= topLeft.y; y += step) {
    const sy = Math.round(toScreen(0, y).y) + 0.5;
    context.strokeStyle = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6 ? COLORS.gridMajor : COLORS.gridMinor;
    context.beginPath();
    context.moveTo(0, sy);
    context.lineTo(view.width, sy);
    context.stroke();
  }
}

function skyColor() {
  const earth = bodyState(EARTH, sim?.time ?? 0);
  const altitude = Math.hypot(camera.x - earth.x, camera.y - earth.y) - EARTH.radius;
  const t = Math.max(0, Math.min(1, altitude / EARTH.atmosphere.top));
  const mix = SKY_GROUND.map((ground, i) => Math.round(ground + (SKY_SPACE[i] - ground) * t));
  return `rgb(${mix.join(', ')})`;
}

function drawBody(body, time) {
  const center = bodyState(body, time);
  const diagonal = Math.hypot(view.width, view.height) / camera.scale;
  const toCamera = Math.atan2(camera.y - center.y, camera.x - center.x);
  const span = Math.min(Math.PI, (diagonal / body.radius) * 1.5 + 0.001);
  const inner = Math.max(0, body.radius - diagonal * 2);
  const steps = 240;
  context.beginPath();
  for (let k = 0; k <= steps; k += 1) {
    const angle = toCamera - span + (2 * span * k) / steps;
    const p = toScreen(center.x + body.radius * Math.cos(angle), center.y + body.radius * Math.sin(angle));
    if (k === 0) context.moveTo(p.x, p.y);
    else context.lineTo(p.x, p.y);
  }
  for (let k = steps; k >= 0; k -= 1) {
    const angle = toCamera - span + (2 * span * k) / steps;
    const p = toScreen(center.x + inner * Math.cos(angle), center.y + inner * Math.sin(angle));
    context.lineTo(p.x, p.y);
  }
  context.closePath();
  context.fillStyle = body.color;
  context.fill();
  if (camera.scale * body.radius < 3) {
    const dot = toScreen(center.x, center.y);
    context.beginPath();
    context.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    context.fill();
  }
}

function drawBodies() {
  const time = sim?.time ?? 0;
  for (const body of BODIES) drawBody(body, time);
  const a = toScreen(-6, -0.6);
  const b = toScreen(6, 0);
  if (camera.scale > 0.5) {
    context.strokeStyle = COLORS.pad;
    context.lineWidth = px(0.6, 2);
    context.beginPath();
    context.moveTo(a.x, (a.y + b.y) / 2);
    context.lineTo(b.x, (a.y + b.y) / 2);
    context.stroke();
  }
}

function drawSegment(a, b, color, width) {
  const p = toScreen(a.x, a.y);
  const q = toScreen(b.x, b.y);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(p.x, p.y);
  context.lineTo(q.x, q.y);
  context.stroke();
}

function drawMotor(center, motor, live) {
  const s = toScreen(center.x, center.y);
  const radius = px(0.5, 10);
  if (live) {
    context.fillStyle = `rgba(255, 180, 84, ${Math.min(1, Math.abs(live.torque) / motor.stallTorque) * 0.7})`;
    context.beginPath();
    context.arc(s.x, s.y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.strokeStyle = COLORS.motor;
  context.lineWidth = highlightedMotor === motor.id ? 5 : 3;
  context.beginPath();
  context.arc(s.x, s.y, radius, 0.25 * Math.PI, 1.75 * Math.PI);
  context.stroke();
  const tip = { x: s.x + radius * Math.cos(1.75 * Math.PI), y: s.y + radius * Math.sin(1.75 * Math.PI) };
  context.fillStyle = COLORS.motor;
  context.beginPath();
  context.moveTo(tip.x + 6, tip.y + 1);
  context.lineTo(tip.x - 3, tip.y - 6);
  context.lineTo(tip.x - 2, tip.y + 6);
  context.closePath();
  context.fill();
}

function drawStructure() {
  const nodes = positions();
  const beams = beamMap(design);
  const beamWidth = px(WORLD.beamWidth, 3);
  const tankIds = new Set(design.tanks);
  const beamIndex = new Map(design.beams.map((beam, i) => [beam.id, i]));
  const segment = (beam, color, width) => drawSegment(nodes.get(beam.a), nodes.get(beam.b), color, width);
  context.lineCap = 'round';

  const present = design.beams.filter((beam) => !beamGone(beamIndex.get(beam.id)));
  const inFront = present.filter((beam) => (!focused || beam.layer === activeLayer) && !tankIds.has(beam.id));
  if (focused) for (const beam of present) if (beam.layer !== activeLayer) segment(beam, COLORS.ghost, beamWidth * 0.6);
  for (const beam of inFront) segment(beam, COLORS.beamShadow, beamWidth + 3);
  for (const beam of inFront) segment(beam, layerColor(beam.layer), beamWidth);

  const marked = new Map();
  if (pendingBeam !== null) marked.set(pendingBeam, COLORS.motor);
  const shown = design.motors.find((m) => m.id === highlightedMotor);
  if (shown) {
    marked.set(shown.driven, COLORS.motor);
    marked.set(shown.base, 'rgba(255, 180, 84, 0.45)');
  }
  if (hover?.kind === 'beam') marked.set(hover.id, tool === 'erase' ? COLORS.erase : COLORS.hover);
  for (const [id, color] of marked) {
    const beam = beams.get(id);
    if (beam) segment(beam, color, beamWidth + 2);
  }

  design.motors.forEach((motor, index) => {
    const pivot = nodes.get(motorPivot(design, motor));
    if (!pivot) return;
    context.globalAlpha = !focused || motorLayer(design, motor) === activeLayer || highlightedMotor === motor.id ? 1 : 0.2;
    drawMotor(pivot, motor, sim?.motors[index]);
    context.globalAlpha = 1;
  });

  const jointRadius = px(0.15, 3);
  const layers = nodeLayers(design);
  for (const node of design.nodes) {
    const own = layers.get(node.id);
    if (!nodeEditable(own)) continue;
    const p = nodes.get(node.id);
    const s = toScreen(p.x, p.y);
    const hovered = hover?.kind === 'node' && hover.id === node.id;
    const color = hovered ? (tool === 'erase' ? COLORS.erase : COLORS.hover) : COLORS.joint;
    const radius = hovered ? jointRadius + 3 : jointRadius;
    if (own.size > 1) {
      context.fillStyle = COLORS.sky;
      context.strokeStyle = hovered ? color : COLORS.link;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(s.x, s.y, radius + 2, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else {
      context.fillStyle = color;
      context.beginPath();
      context.arc(s.x, s.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawCpu(nodes) {
  const beam = design.cpu && beamMap(design).get(design.cpu.beam);
  if (!beam) return;
  const a = toScreen(nodes.get(beam.a).x, nodes.get(beam.a).y);
  const b = toScreen(nodes.get(beam.b).x, nodes.get(beam.b).y);
  const width = px(1.2, 26);
  const height = px(0.7, 16);
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  if (Math.abs(angle) > Math.PI / 2) angle += Math.PI;
  context.save();
  context.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
  context.rotate(angle);
  context.fillStyle = COLORS.chip;
  context.strokeStyle = COLORS.chipEdge;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(-width / 2, -height / 2, width, height, 3);
  context.fill();
  context.stroke();
  context.fillStyle = COLORS.chipEdge;
  context.font = `700 ${Math.round(height * 0.55)}px "Trebuchet MS", system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CPU', 0, 1);
  context.restore();
}

function drawTrails() {
  context.lineWidth = 2;
  context.lineJoin = 'round';
  trails.forEach((lines, i) => {
    context.strokeStyle = design.pens[i]?.color ?? COLORS.hover;
    for (const line of lines) {
      if (line.length < 2) continue;
      context.beginPath();
      line.forEach((point, k) => {
        const s = toScreen(point.x, point.y);
        if (k === 0) context.moveTo(s.x, s.y);
        else context.lineTo(s.x, s.y);
      });
      context.stroke();
    }
  });
}

function drawPens(nodes) {
  const beams = beamMap(design);
  const radius = px(0.15, 4);
  design.pens.forEach((pen, i) => {
    const beam = pen.beam !== undefined && beams.get(pen.beam);
    const a = nodes.get(beam ? beam.a : pen.node);
    const b = nodes.get(beam ? beam.b : pen.node);
    if (!a || !b) return;
    const s = toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
    context.fillStyle = sim && !sim.pens[i].down ? COLORS.sky : pen.color;
    context.strokeStyle = pen.color;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(s.x, s.y, radius + 2, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (camera.scale < LABEL_MIN_SCALE) return;
    context.fillStyle = pen.color;
    context.font = '12px "Trebuchet MS", system-ui, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'alphabetic';
    context.fillText(`pen${i + 1}`, s.x - radius - 6, s.y - radius - 2);
  });
}

function drawLabel(text, x, y, color = COLORS.sensor) {
  if (camera.scale < LABEL_MIN_SCALE) return;
  context.fillStyle = color;
  context.font = '12px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(text, x, y);
}

function drawMotionSensors(nodes) {
  const beams = beamMap(design);
  const radius = px(0.25, 6);
  context.strokeStyle = COLORS.sensor;
  context.lineWidth = 2;
  design.gyros.forEach((beamId, i) => {
    const beam = beams.get(beamId);
    if (!beam) return;
    const a = nodes.get(beam.a);
    const b = nodes.get(beam.b);
    const s = toScreen(a.x + (b.x - a.x) * 0.3, a.y + (b.y - a.y) * 0.3);
    context.fillStyle = COLORS.sky;
    context.beginPath();
    context.arc(s.x, s.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(s.x - radius, s.y);
    context.lineTo(s.x + radius, s.y);
    context.moveTo(s.x, s.y - radius);
    context.lineTo(s.x, s.y + radius);
    context.stroke();
    drawLabel(`gyro${i + 1}`, s.x + radius + 4, s.y - radius);
  });
  design.angles.forEach((pair, i) => {
    const measured = beams.get(pair.driven);
    const base = beams.get(pair.base);
    const pivotId = measured && base && sharedNode(measured, base);
    if (pivotId === null || pivotId === undefined) return;
    const p = nodes.get(pivotId);
    const s = toScreen(p.x, p.y);
    const end = (beam) => nodes.get(beam.a === pivotId ? beam.b : beam.a);
    const angleTo = (q) => Math.atan2(-(q.y - p.y), q.x - p.x);
    const from = angleTo(end(base));
    const to = angleTo(end(measured));
    context.strokeStyle = COLORS.sensor;
    context.beginPath();
    context.arc(s.x, s.y, radius * 3.4, from, to, wrapToSigned(to - from) < 0);
    context.stroke();
    drawLabel(`angle${i + 1}`, s.x + radius * 3.4 + 4, s.y + radius * 3.4);
  });
}

function wrapToSigned(angle) {
  return angle - Math.PI * 2 * Math.round(angle / (Math.PI * 2));
}

function drawSensors(nodes) {
  const size = px(0.25, 6);
  const touching = new Set(sim ? sim.sensors.filter((i) => sim.touching(i)).map((i) => sim.ids[i]) : []);
  design.sensors.forEach((id, i) => {
    const p = nodes.get(id);
    if (!p) return;
    const s = toScreen(p.x, p.y);
    context.strokeStyle = COLORS.sensor;
    context.fillStyle = touching.has(id) ? COLORS.sensor : COLORS.sky;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(s.x, s.y - size);
    context.lineTo(s.x + size, s.y);
    context.lineTo(s.x, s.y + size);
    context.lineTo(s.x - size, s.y);
    context.closePath();
    context.fill();
    context.stroke();
    drawLabel(`touch${i + 1}`, s.x + size + 4, s.y - size);
  });
}

function drawApsis(point, label, color) {
  const s = toScreen(point.x, point.y);
  context.fillStyle = color;
  context.strokeStyle = COLORS.beamShadow;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(s.x, s.y, 5, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.font = '12px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.lineWidth = 3;
  context.strokeText(label, s.x + 9, s.y);
  context.fillText(label, s.x + 9, s.y);
}

function drawPrediction() {
  if (!prediction) return;
  context.strokeStyle = COLORS.path;
  context.lineWidth = 2;
  context.lineJoin = 'round';
  context.setLineDash([10, 6]);
  context.beginPath();
  prediction.points.forEach((point, k) => {
    const s = toScreen(point.x, point.y);
    if (k === 0) context.moveTo(s.x, s.y);
    else context.lineTo(s.x, s.y);
  });
  context.stroke();
  context.setLineDash([]);
  const { apoapsis, periapsis, impact } = prediction;
  if (apoapsis) drawApsis(apoapsis.at, `Ap ${formatDistance(apoapsis.altitude)}`, COLORS.apsis);
  if (periapsis.altitude > 0) drawApsis(periapsis.at, `Pe ${formatDistance(periapsis.altitude)}`, COLORS.apsis);
  if (impact) drawApsis(impact, 'Impact', COLORS.impact);
}

function drawMapMarker() {
  const center = sim ? (sim.cpuGyro ? sim.centerOf(sim.cpuGyro) : sim.centerOfMass()) : { x: 0, y: 0 };
  const s = toScreen(center.x, center.y);
  context.fillStyle = COLORS.hover;
  context.strokeStyle = COLORS.beamShadow;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(s.x, s.y - 9);
  context.lineTo(s.x + 6, s.y + 6);
  context.lineTo(s.x - 6, s.y + 6);
  context.closePath();
  context.fill();
  context.stroke();
}

function beamGone(index) {
  return Boolean(sim) && !sim.beams[index].active;
}

function drawTanks(nodes) {
  const tankIds = new Set(design.tanks);
  const width = px(TANK.width, 8);
  context.lineCap = 'butt';
  design.beams.forEach((beam, index) => {
    if (!tankIds.has(beam.id) || beamGone(index)) return;
    const a = nodes.get(beam.a);
    const b = nodes.get(beam.b);
    drawSegment(a, b, COLORS.beamShadow, width + 3);
    drawSegment(a, b, COLORS.tank, width);
    const tank = sim?.tanks[design.tanks.indexOf(beam.id)];
    const full = tank ? tank.fuel / tank.capacity : 1;
    if (full <= 0) return;
    drawSegment(a, { x: a.x + (b.x - a.x) * full, y: a.y + (b.y - a.y) * full }, COLORS.fuel, width * 0.55);
  });
  context.lineCap = 'round';
}

function drawEngines(nodes) {
  const beams = beamMap(design);
  design.engines.forEach((engine, i) => {
    const beam = beams.get(engine.beam);
    if (!beam) return;
    const nozzle = toScreen(nodes.get(engine.nozzle).x, nodes.get(engine.nozzle).y);
    const backNode = nodes.get(beam.a === engine.nozzle ? beam.b : beam.a);
    const back = toScreen(backNode.x, backNode.y);
    const length = Math.hypot(back.x - nozzle.x, back.y - nozzle.y) || 1;
    const ux = (nozzle.x - back.x) / length;
    const uy = (nozzle.y - back.y) / length;
    const bell = px(0.9, 7);
    const throat = bell * 0.45;
    const firing = sim?.engines[i].firing ?? 0;
    if (firing > 0) {
      const flame = bell * (2 + 4 * firing) * (0.9 + 0.2 * Math.random());
      context.fillStyle = COLORS.flame;
      context.beginPath();
      context.moveTo(nozzle.x + uy * bell * 0.8 + ux * bell, nozzle.y - ux * bell * 0.8 + uy * bell);
      context.lineTo(nozzle.x - uy * bell * 0.8 + ux * bell, nozzle.y + ux * bell * 0.8 + uy * bell);
      context.lineTo(nozzle.x + ux * (bell + flame), nozzle.y + uy * (bell + flame));
      context.closePath();
      context.fill();
    }
    context.fillStyle = COLORS.engine;
    context.strokeStyle = COLORS.beamShadow;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(nozzle.x + uy * throat, nozzle.y - ux * throat);
    context.lineTo(nozzle.x - uy * throat, nozzle.y + ux * throat);
    context.lineTo(nozzle.x - uy * bell + ux * bell, nozzle.y + ux * bell + uy * bell);
    context.lineTo(nozzle.x + uy * bell + ux * bell, nozzle.y - ux * bell + uy * bell);
    context.closePath();
    context.fill();
    context.stroke();
    if (camera.scale >= LABEL_MIN_SCALE) drawLabel(`engine${i + 1}`, nozzle.x + bell + 4, nozzle.y, COLORS.engine);
  });
}

function drawWheels(nodes) {
  const beams = beamMap(design);
  const radius = px(0.6, 8);
  design.wheels.forEach((wheel, i) => {
    const beam = beams.get(wheel.beam);
    if (!beam) return;
    const a = nodes.get(beam.a);
    const b = nodes.get(beam.b);
    const s = toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
    const live = sim?.wheels[i];
    const fill = live ? Math.max(-1, Math.min(1, sim.wheelFill(live))) : 0;
    context.fillStyle = COLORS.beamShadow;
    context.strokeStyle = COLORS.wheel;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(s.x, s.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    if (fill !== 0) {
      context.fillStyle = COLORS.wheel;
      context.beginPath();
      context.moveTo(s.x, s.y);
      context.arc(s.x, s.y, radius * 0.75, -Math.PI / 2, -Math.PI / 2 - fill * Math.PI * 2, fill > 0);
      context.closePath();
      context.fill();
    }
    drawLabel(`wheel${i + 1}`, s.x + radius + 4, s.y - radius, COLORS.wheel);
  });
}

function drawSeparators(nodes) {
  const index = new Map(design.beams.map((beam, i) => [beam.id, i]));
  const beams = beamMap(design);
  context.setLineDash([6, 5]);
  for (const { beam: beamId, group } of design.separators) {
    const beam = beams.get(beamId);
    if (!beam || beamGone(index.get(beamId))) continue;
    const a = nodes.get(beam.a);
    const b = nodes.get(beam.b);
    drawSegment(a, b, COLORS.separator, px(0.35, 4));
    const mid = toScreen((a.x + b.x) / 2, (a.y + b.y) / 2);
    drawLabel(`sep${group}`, mid.x + 6, mid.y - 6, COLORS.separator);
  }
  context.setLineDash([]);
}

function drawRanges(nodes) {
  const beams = beamMap(design);
  design.ranges.forEach((range, i) => {
    const beam = beams.get(range.beam);
    if (!beam) return;
    const tip = nodes.get(range.tip);
    const back = nodes.get(beam.a === range.tip ? beam.b : beam.a);
    const length = Math.hypot(tip.x - back.x, tip.y - back.y) || 1;
    const ux = (tip.x - back.x) / length;
    const uy = (tip.y - back.y) / length;
    const s = toScreen(tip.x, tip.y);
    if (sim) {
      const reach = Math.min(sim.ranges[i].distance, 4000 / camera.scale);
      const end = toScreen(tip.x + ux * reach, tip.y + uy * reach);
      context.strokeStyle = 'rgba(255, 107, 107, 0.6)';
      context.lineWidth = 1.5;
      context.setLineDash([4, 6]);
      context.beginPath();
      context.moveTo(s.x, s.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      context.setLineDash([]);
    }
    context.fillStyle = COLORS.range;
    context.beginPath();
    context.arc(s.x, s.y, px(0.2, 4), 0, Math.PI * 2);
    context.fill();
    drawLabel(`range${i + 1}`, s.x + 8, s.y + 14, COLORS.range);
  });
}

function drawBeamPreview() {
  if (gesture?.kind !== 'beam') return;
  const { from, to } = gesture;
  context.setLineDash([8, 6]);
  drawSegment(from, to, COLORS.hover, px(0.2, 2));
  context.setLineDash([]);
  const s = toScreen((from.x + to.x) / 2, (from.y + to.y) / 2);
  context.fillStyle = COLORS.hover;
  context.font = '13px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(`${Math.hypot(to.x - from.x, to.y - from.y).toFixed(1)} m`, s.x, s.y - 12);
}

function draw() {
  context.fillStyle = skyColor();
  context.fillRect(0, 0, view.width, view.height);
  if (!sim && camera.scale >= GRID_MIN_SCALE) drawGrid();
  drawBodies();
  drawTrails();
  drawPrediction();
  if (camera.scale < MAP_SCALE) {
    drawMapMarker();
    return;
  }
  const nodes = positions();
  drawTanks(nodes);
  drawStructure();
  drawEngines(nodes);
  drawWheels(nodes);
  drawSeparators(nodes);
  drawRanges(nodes);
  drawCpu(nodes);
  drawSensors(nodes);
  drawMotionSensors(nodes);
  drawPens(nodes);
  drawBeamPreview();
}

function updatePrediction(now) {
  if (!sim || !pathBox.checked || sim.telemetry().speed < PATH_MIN_SPEED) {
    prediction = null;
    return;
  }
  if (now - lastPrediction < PREDICT_INTERVAL_MS) return;
  lastPrediction = now;
  const point = sim.cpuGyro ?? sim.heaviestNode();
  prediction = predictPath(sim.centerOf(point), sim.velocityOf(point), sim.time);
}

function frame(now) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (sim) advance(seconds);
  if (sim) updatePrediction(now);
  renderStats();
  renderWatch(now);
  draw();
  requestAnimationFrame(frame);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  view = { width: box.width, height: box.height };
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!fittedOnce && view.width && view.height) {
    fit();
    fittedOnce = true;
  }
}

for (const button of toolButtons) button.addEventListener('click', () => setTool(button.dataset.tool));
for (const button of sensorKindButtons) button.addEventListener('click', () => setSensorKind(button.dataset.sensorKind));
for (const button of separatorGroupButtons) button.addEventListener('click', () => setSeparatorGroup(Number(button.dataset.separatorGroup)));
for (const warp of WARP_SPEEDS) warpSelect.add(new Option(`${warp.toLocaleString('en')}× speed${warp > FULL_PHYSICS_WARP ? ' (coasting only)' : ''}`, String(warp)));
undoButton.addEventListener('click', () => restore(undoStack, redoStack));
redoButton.addEventListener('click', () => restore(redoStack, undoStack));
$('[data-fit]').addEventListener('click', fit);
runButton.addEventListener('click', () => (sim ? stopRun() : startRun()));

for (const [key, preset] of Object.entries(PRESETS)) presetSelect.add(new Option(preset.name, key));
function replaceDesign(next) {
  if (sim) stopRun();
  design = next;
  activeLayer = 0;
  focused = false;
  pendingBeam = null;
  commit();
  renderLayers();
  renderCpu();
  renderMotors();
  renderEngines();
  renderWheels();
  renderStages();
  fit();
}

$('[data-clear-trails]').addEventListener('click', () => {
  trails = trails.map(() => [[]]);
});

$('[data-load]').addEventListener('click', () => replaceDesign(PRESETS[presetSelect.value].build()));

const shareDialog = $('[data-share-dialog]');
const shareText = $('[data-share-text]');
const shareError = $('[data-share-error]');
const SHARE_MODES = {
  copy: { title: 'Copy this rocket', note: "Your browser didn't allow copying, so select all of this text and copy it yourself." },
  paste: { title: 'Paste a rocket', note: 'Paste text made with Copy rocket. It replaces the rocket on the board, and Undo brings the old one back.' },
};

function openShare(mode, text) {
  $('[data-share-title]').textContent = SHARE_MODES[mode].title;
  $('[data-share-note]').textContent = SHARE_MODES[mode].note;
  $('[data-share-load]').hidden = mode !== 'paste';
  shareText.readOnly = mode !== 'paste';
  shareText.value = text;
  shareError.textContent = '';
  shareDialog.showModal();
  shareText.focus();
  shareText.select();
}

$('[data-copy-rocket]').addEventListener('click', async () => {
  const text = rocketToText(design);
  try {
    await navigator.clipboard.writeText(text);
    say('Rocket copied as text. Paste it anywhere to keep it, and use Paste rocket to load it again.');
  } catch {
    openShare('copy', text);
  }
});
$('[data-paste-rocket]').addEventListener('click', () => openShare('paste', ''));
$('[data-share-close]').addEventListener('click', () => shareDialog.close());
$('[data-share-load]').addEventListener('click', () => {
  const result = rocketFromText(shareText.value);
  if (result.error) {
    shareError.textContent = result.error;
    return;
  }
  shareDialog.close();
  replaceDesign(result.design);
  say('Rocket loaded. Undo brings back the one you had before.');
});

const THROTTLE_KEYS = {
  z: () => 1,
  x: () => 0,
  w: (value) => value + 0.1,
  arrowup: (value) => value + 0.1,
  s: (value) => value - 0.1,
  arrowdown: (value) => value - 0.1,
};
const STEER_KEYS = { a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };

window.addEventListener('keyup', (event) => {
  const side = STEER_KEYS[event.key.toLowerCase()];
  if (side) pilot[side] = false;
});
window.addEventListener('blur', () => {
  pilot.left = false;
  pilot.right = false;
});
throttleLever.addEventListener('input', () => setThrottle(Number(throttleLever.value) / 100));
throttleLever.addEventListener('change', () => throttleLever.blur());
assistButton.addEventListener('click', () => setAssist(!pilot.assist));
for (const button of document.querySelectorAll('[data-steer]')) {
  const side = button.dataset.steer;
  const hold = (held) => (event) => {
    event.preventDefault();
    pilot[side] = held;
  };
  button.addEventListener('pointerdown', hold(true));
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, hold(false));
}

window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('input, select, textarea, button')) return;
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) restore(redoStack, undoStack);
    else restore(undoStack, redoStack);
  } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
    event.preventDefault();
    restore(redoStack, undoStack);
  } else if (event.ctrlKey || event.metaKey || event.altKey) {
    return;
  } else if (key === ' ') {
    event.preventDefault();
    if (sim) stopRun();
    else startRun();
  } else if (key === 'f') {
    fit();
  } else if (key === 'escape') {
    pendingBeam = null;
    gesture = null;
  } else if (key === '.' || key === ',') {
    stepWarp(key === '.' ? 1 : -1);
  } else if (sim && key >= '1' && key <= '9') {
    sim.fireSeparators(Number(key));
  } else if (sim && THROTTLE_KEYS[key] !== undefined) {
    event.preventDefault();
    setThrottle(THROTTLE_KEYS[key](pilot.throttle));
  } else if (sim && key === 't') {
    setAssist(!pilot.assist);
  } else if (sim && STEER_KEYS[key]) {
    event.preventDefault();
    pilot[STEER_KEYS[key]] = true;
  } else if (!sim && key >= '1' && key <= String(Math.min(9, toolButtons.length))) {
    setTool(toolButtons[Number(key) - 1].dataset.tool);
  }
});

for (const clock of CPU_CLOCKS) clockSelect.add(new Option(`${clock.toLocaleString('en')} ops a second`, String(clock)));
clockSelect.addEventListener('change', () => {
  design.cpu.clock = Number(clockSelect.value);
  commit();
});

let compileTimer = 0;
codeBox.addEventListener('input', () => {
  design.program = codeBox.value;
  clearTimeout(compileTimer);
  compileTimer = setTimeout(() => {
    refreshProgram();
    save();
  }, 250);
});
codeBox.addEventListener('change', () => {
  clearTimeout(compileTimer);
  commit();
});
codeBox.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab' || event.shiftKey || codeBox.readOnly) return;
  event.preventDefault();
  codeBox.setRangeText('  ', codeBox.selectionStart, codeBox.selectionEnd, 'end');
  codeBox.dispatchEvent(new Event('input'));
});
const codeDialog = $('[data-code-dialog]');
const cpuBodyHome = cpuBody.parentElement;
$('[data-code-open]').addEventListener('click', () => {
  $('[data-code-slot]').append(cpuBody);
  codeDialog.showModal();
  codeBox.focus();
});
$('[data-code-close]').addEventListener('click', () => codeDialog.close());
codeDialog.addEventListener('close', () => cpuBodyHome.append(cpuBody));

function showLibraryNeeds() {
  const entry = LIBRARY.find((program) => program.id === librarySelect.value);
  libraryNeeds.textContent = `Needs ${entry.needs}. Read the notes at the top of the program for what it does and the numbers to change.`;
}

for (const program of LIBRARY) librarySelect.add(new Option(program.name, program.id));
librarySelect.addEventListener('change', showLibraryNeeds);
showLibraryNeeds();
$('[data-library-load]').addEventListener('click', () => {
  const entry = LIBRARY.find((program) => program.id === librarySelect.value);
  design.program = entry.code;
  commit();
  renderCpu();
  say(compiled.ok ? `Loaded "${entry.name}". Undo brings your old program back.` : `Loaded "${entry.name}", but line ${compiled.error.line} needs a part this rocket doesn't have: ${compiled.error.message}`);
});

$('[data-remove-cpu]').addEventListener('click', () => {
  if (codeDialog.open) codeDialog.close();
  design.cpu = null;
  commit();
  renderCpu();
});

new ResizeObserver(resize).observe(canvas);
resize();
refreshProgram();
renderLayers();
renderMotors();
renderEngines();
renderStages();
renderCpu();
renderControls();
say(TOOL_HINTS[tool]);
requestAnimationFrame(frame);
