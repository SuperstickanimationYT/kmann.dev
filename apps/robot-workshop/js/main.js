import { CPU_CLOCKS, addBeam, addLayer, addMotor, addNode, beamMap, cloneDesign, isDesign, motorLayer, motorPivot, mountCpu, nodeLayers, nodeMap, removeBeam, removeMotor, removeNode, sharedNode, toggleAngleSensor, toggleGyro, toggleSensor, withDefaults } from './design.js';
import { BUILTINS, CPU_READINGS, DEVICES, compile } from './cpu.js';
import { PRESETS } from './presets.js';
import { robotFromText, robotToText } from './share.js';
import { Simulation, WORLD } from './sim.js';

const NEW_PROGRAM_INTRO = `# This program runs over and over while the robot moves.
# Read sensors, then set each motor's power from -1 to 1.
# Open "What the program can use" below for every name.

`;
const WATCH_INTERVAL_MS = 150;

const SENSOR_HINTS = {
  touch: 'Tap a joint to give it a touch sensor. It reads 1 while that joint touches the ground.',
  gyro: 'Tap a beam to give it a gyro. It reads that beam\'s tilt and spin against the world.',
  angle: 'Tap a beam, then a beam joined to it. The angle sensor reads how far the first turns against the second.',
};

const STORAGE_KEY = 'robot-workshop:v1';
const GOAL_METERS = 10;
const GRID_METERS = 0.05;
const MIN_BEAM_METERS = 0.03;
const HIT_PX = 14;
const TAP_SLOP_PX = 6;
const STEP_SECONDS = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const UNDO_LIMIT = 100;
const MIN_SCALE = 20;
const MAX_SCALE = 2000;

const TOOL_HINTS = {
  beam: 'Drag from one point to another to add a beam. Start or end on a joint to connect to it.',
  motor: 'Tap the beam the motor should turn.',
  sensor: 'Pick a sensor kind above the board, then tap to add it. Tap it again to remove it.',
  cpu: 'Tap a beam to mount the CPU on it. Its tilt sensor measures that beam.',
  move: 'Drag a joint to move it. Drag empty space to pan.',
  erase: 'Tap a joint or a beam to remove it.',
};

const MOTOR_FIELDS = [
  { key: 'power', label: 'Power', modes: ['spin'], min: -100, max: 100, step: 5, toSlider: (v) => v * 100, fromSlider: (v) => v / 100, format: (v) => `${Math.round(v * 100)}%` },
  { key: 'amplitude', label: 'Swing', modes: ['swing'], min: 0, max: 90, step: 1, format: (v) => `±${v}°` },
  { key: 'frequency', label: 'Swings per second', modes: ['swing'], min: 0.1, max: 3, step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'phase', label: 'Phase', modes: ['swing'], min: 0, max: 345, step: 15, format: (v) => `${v}°` },
  { key: 'stallTorque', label: 'Stall torque', min: 5, max: 150, step: 5, format: (v) => `${v} N·m` },
  { key: 'freeRpm', label: 'Top speed', min: 5, max: 120, step: 5, format: (v) => `${v} rpm` },
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
  finish: '#7dffa8',
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
const motorList = $('[data-motors]');
const noMotors = $('[data-no-motors]');
const presetSelect = $('[data-preset]');
const snapBox = $('[data-snap]');
const followBox = $('[data-follow]');
const cpuEmpty = $('[data-no-cpu]');
const cpuBody = $('[data-cpu-body]');
const codeBox = $('[data-code]');
const codeError = $('[data-code-error]');
const clockSelect = $('[data-clock]');
const cpuUsage = $('[data-cpu-usage]');
const watchList = $('[data-watch]');
const reference = $('[data-reference]');
const stats = Object.fromEntries([...document.querySelectorAll('[data-stat]')].map((el) => [el.dataset.stat, el]));

let design = loadDesign();
let committed = cloneDesign(design);
const undoStack = [];
const redoStack = [];
let tool = 'beam';
let sensorKind = 'touch';
let activeLayer = 0;
let focused = false;
let sim = null;
let finishTime = null;
let warnedBackwards = false;
let bestTime = null;
let camera = { x: 0, y: 0.6, scale: 300 };
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
let drivenKey = '';
let lastWatch = 0;

function loadDesign() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isDesign(stored)) return withDefaults(stored);
  } catch {}
  return PRESETS.strandbeest.build();
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
  bestTime = null;
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
  bestTime = null;
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

function toWorld(point) {
  return { x: camera.x + (point.x - view.width / 2) / camera.scale, y: camera.y - (point.y - view.height / 2) / camera.scale };
}

function toScreen(x, y) {
  return { x: view.width / 2 + (x - camera.x) * camera.scale, y: view.height / 2 - (y - camera.y) * camera.scale };
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
    camera.x -= (next.center.x - gesture.center.x) / camera.scale;
    camera.y += (next.center.y - gesture.center.y) / camera.scale;
    if (gesture.spread > 0) zoomAt(next.center, next.spread / gesture.spread);
    Object.assign(gesture, next);
  } else if (gesture.kind === 'pan') {
    camera.x -= (point.x - gesture.last.x) / camera.scale;
    camera.y += (point.y - gesture.last.y) / camera.scale;
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
  if (tool === 'motor' || tool === 'cpu' || (tool === 'sensor' && sensorKind !== 'touch')) {
    const beam = hitBeam(point);
    return beam && { kind: 'beam', id: beam.id };
  }
  const node = hitNode(point);
  if (node) return { kind: 'node', id: node.id };
  if (tool !== 'erase') return null;
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
  finishTime = null;
  warnedBackwards = false;
  accumulator = 0;
  gesture = null;
  hover = null;
  pendingBeam = null;
  if (design.cpu && !compiled.ok) say(`Running with the CPU off, because line ${compiled.error.line} of the program has an error.`);
  else say(design.motors.length ? 'Running. Motor sliders work live.' : 'Running. Without a motor it can only fall over. Add one with the Motor tool.');
  renderControls();
  renderMotors();
  renderCpu();
}

function stopRun() {
  sim = null;
  say(TOOL_HINTS[tool]);
  renderControls();
  renderMotors();
  renderCpu();
}

function hardware() {
  return { motor: design.motors.length, touch: design.sensors.length, gyro: design.gyros.length, angle: design.angles.length };
}

function drivenByProgram() {
  return design.cpu && compiled?.ok ? compiled.program.drives : new Set();
}

function refreshProgram() {
  compiled = compile(design.program, hardware());
  codeError.textContent = compiled.ok ? '' : `Line ${compiled.error.line}: ${compiled.error.message}`;
  const key = [...drivenByProgram()].join(',');
  if (key !== drivenKey) {
    drivenKey = key;
    renderMotors();
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
  watchList.replaceChildren(...variables, ...powers);
}

function fit() {
  const points = [...positions().values()];
  if (!points.length) {
    camera = { x: 0, y: 0.6, scale: 300 };
    return;
  }
  const xs = points.map((p) => p.x);
  const ys = [0, ...points.map((p) => p.y)];
  const width = Math.max(0.5, Math.max(...xs) - Math.min(...xs));
  const height = Math.max(0.5, Math.max(...ys) - Math.min(...ys));
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
  sensorKindBar.hidden = tool !== 'sensor' || Boolean(sim);
  for (const button of sensorKindButtons) button.setAttribute('aria-pressed', String(button.dataset.sensorKind === sensorKind));
  renderLayers();
  stats.mass.textContent = design.nodes.length ? `${new Simulation(design).totalMass.toFixed(1)} kg` : '–';
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
    for (const [value, text] of [['spin', 'Spin'], ['swing', 'Swing back and forth']]) mode.add(new Option(text, value, false, motor.mode === value));
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

function renderStats() {
  stats.distance.textContent = sim ? `${sim.distance().toFixed(2)} m` : '–';
  stats.time.textContent = sim ? `${sim.time.toFixed(1)} s` : '–';
  stats.best.textContent = bestTime === null ? '–' : `${bestTime.toFixed(1)} s`;
}

function advance(seconds) {
  accumulator += seconds;
  let steps = 0;
  while (accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
    sim.step(STEP_SECONDS);
    accumulator -= STEP_SECONDS;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  if (sim.broken) {
    stopRun();
    say('The simulation blew up. Check for joints stacked on top of each other or beams of almost zero length.');
    return;
  }
  const distance = sim.distance();
  if (finishTime === null && distance >= GOAL_METERS) {
    finishTime = sim.time;
    if (bestTime === null || finishTime < bestTime) bestTime = finishTime;
    say(`Reached ${GOAL_METERS} m in ${finishTime.toFixed(1)} s.`);
  }
  if (!warnedBackwards && sim.time > 4 && distance < -0.5) {
    warnedBackwards = true;
    say('Walking backwards. Flip the sign of the motor power.');
  }
  if (followBox.checked) camera.x += (sim.centerOfMass().x - camera.x) * Math.min(1, seconds * 3);
}

function drawGrid() {
  const topLeft = toWorld({ x: 0, y: 0 });
  const bottomRight = toWorld({ x: view.width, y: view.height });
  const step = camera.scale > 150 ? 0.1 : 0.5;
  context.lineWidth = 1;
  for (let x = Math.floor(topLeft.x / step) * step; x <= bottomRight.x; x += step) {
    const sx = Math.round(toScreen(x, 0).x) + 0.5;
    context.strokeStyle = Math.abs(x - Math.round(x)) < 1e-6 ? COLORS.gridMajor : COLORS.gridMinor;
    context.beginPath();
    context.moveTo(sx, 0);
    context.lineTo(sx, view.height);
    context.stroke();
  }
  for (let y = Math.max(0, Math.floor(bottomRight.y / step) * step); y <= topLeft.y; y += step) {
    const sy = Math.round(toScreen(0, y).y) + 0.5;
    context.strokeStyle = Math.abs(y - Math.round(y)) < 1e-6 ? COLORS.gridMajor : COLORS.gridMinor;
    context.beginPath();
    context.moveTo(0, sy);
    context.lineTo(view.width, sy);
    context.stroke();
  }
}

function drawGround() {
  const groundY = toScreen(0, 0).y;
  if (groundY > view.height) return;
  context.fillStyle = COLORS.ground;
  context.fillRect(0, groundY, view.width, view.height - groundY);
  context.strokeStyle = COLORS.groundEdge;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, groundY);
  context.lineTo(view.width, groundY);
  context.stroke();

  const origin = sim ? sim.startX : 0;
  const left = Math.floor(toWorld({ x: 0, y: 0 }).x - origin);
  const right = Math.ceil(toWorld({ x: view.width, y: 0 }).x - origin);
  const every = camera.scale < 40 ? 5 : 1;
  context.font = '12px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = COLORS.label;
  context.strokeStyle = COLORS.label;
  context.lineWidth = 1;
  for (let m = Math.ceil(left / every) * every; m <= right; m += every) {
    const sx = toScreen(origin + m, 0).x;
    context.beginPath();
    context.moveTo(sx, groundY);
    context.lineTo(sx, groundY + 8);
    context.stroke();
    context.fillText(`${m} m`, sx, groundY + 22);
  }

  if (!sim) return;
  const finishX = toScreen(sim.startX + GOAL_METERS, 0).x;
  context.strokeStyle = COLORS.finish;
  context.lineWidth = 3;
  context.setLineDash([10, 8]);
  context.beginPath();
  context.moveTo(finishX, groundY);
  context.lineTo(finishX, 0);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = COLORS.finish;
  context.textAlign = 'left';
  context.fillText('Finish', finishX + 6, groundY - 8);
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
  const radius = Math.max(10, camera.scale * 0.045);
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

function drawRobot() {
  const nodes = positions();
  const beams = beamMap(design);
  const beamWidth = Math.max(3, camera.scale * 0.022);
  const segment = (beam, color, width) => drawSegment(nodes.get(beam.a), nodes.get(beam.b), color, width);
  context.lineCap = 'round';

  const inFront = focused ? design.beams.filter((beam) => beam.layer === activeLayer) : design.beams;
  if (focused) for (const beam of design.beams) if (beam.layer !== activeLayer) segment(beam, COLORS.ghost, beamWidth * 0.6);
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

  const jointRadius = Math.max(3, camera.scale * 0.012);
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
  const width = Math.max(26, camera.scale * 0.12);
  const height = Math.max(16, camera.scale * 0.07);
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

function drawLabel(text, x, y) {
  if (camera.scale < 120) return;
  context.fillStyle = COLORS.sensor;
  context.font = '12px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText(text, x, y);
}

function drawMotionSensors(nodes) {
  const beams = beamMap(design);
  const radius = Math.max(6, camera.scale * 0.02);
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
  const size = Math.max(6, camera.scale * 0.02);
  const touching = new Set(sim ? sim.sensors.filter((i) => sim.y[i] < WORLD.touchMeters).map((i) => sim.ids[i]) : []);
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

function drawBeamPreview() {
  if (gesture?.kind !== 'beam') return;
  const { from, to } = gesture;
  context.setLineDash([8, 6]);
  drawSegment(from, to, COLORS.hover, Math.max(2, camera.scale * 0.015));
  context.setLineDash([]);
  const s = toScreen((from.x + to.x) / 2, (from.y + to.y) / 2);
  context.fillStyle = COLORS.hover;
  context.font = '13px "Trebuchet MS", system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(`${Math.round(Math.hypot(to.x - from.x, to.y - from.y) * 100)} cm`, s.x, s.y - 12);
}

function draw() {
  context.fillStyle = COLORS.sky;
  context.fillRect(0, 0, view.width, view.height);
  if (!sim) drawGrid();
  drawGround();
  drawRobot();
  const nodes = positions();
  drawCpu(nodes);
  drawSensors(nodes);
  drawMotionSensors(nodes);
  drawBeamPreview();
}

function frame(now) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (sim) advance(seconds);
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
  fit();
}

$('[data-load]').addEventListener('click', () => replaceDesign(PRESETS[presetSelect.value].build()));

const shareDialog = $('[data-share-dialog]');
const shareText = $('[data-share-text]');
const shareError = $('[data-share-error]');
const SHARE_MODES = {
  copy: { title: 'Copy this robot', note: "Your browser didn't allow copying, so select all of this text and copy it yourself." },
  paste: { title: 'Paste a robot', note: 'Paste text made with Copy robot. It replaces the robot on the board, and Undo brings the old one back.' },
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

$('[data-copy-robot]').addEventListener('click', async () => {
  const text = robotToText(design);
  try {
    await navigator.clipboard.writeText(text);
    say('Robot copied as text. Paste it anywhere to keep it, and use Paste robot to load it again.');
  } catch {
    openShare('copy', text);
  }
});
$('[data-paste-robot]').addEventListener('click', () => openShare('paste', ''));
$('[data-share-close]').addEventListener('click', () => shareDialog.close());
$('[data-share-load]').addEventListener('click', () => {
  const result = robotFromText(shareText.value);
  if (result.error) {
    shareError.textContent = result.error;
    return;
  }
  shareDialog.close();
  replaceDesign(result.design);
  say('Robot loaded. Undo brings back the one you had before.');
});

window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea, button')) return;
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
  } else if (!sim && key >= '1' && key <= String(toolButtons.length)) {
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
renderCpu();
renderControls();
say(TOOL_HINTS[tool]);
requestAnimationFrame(frame);
