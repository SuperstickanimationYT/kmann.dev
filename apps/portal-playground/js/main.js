import { V, sub, len } from './geom.js';
import { SHAPES, MOTIONS, makePair, rebuildPair, refreshTransform, poseAt, query, handlePoint } from './portals.js';
import {
  step, allEnds, makeBox, makeBall, makeWedge, makeWall, makeLaser, refreshWall,
  pointInBody, pointInWall, grabLocal,
} from './physics.js';
import { SCENES, loadScene } from './scenes.js';
import { fitView, toWorld, render } from './render.js';
import { toData, fromData, placeBody } from './snapshot.js';

const canvas = document.querySelector('[data-stage]');
const ctx = canvas.getContext('2d');
const form = document.querySelector('[data-controls]');
const portalPanel = document.querySelector('[data-portal-panel]');
const objectPanel = document.querySelector('[data-object-panel]');
const statusLine = document.querySelector('[data-status]');
const sceneSelect = document.querySelector('[data-scene]');
const pauseButton = document.querySelector('[data-pause]');
const speedButton = document.querySelector('[data-speed]');
const timePanel = document.querySelector('[data-time-panel]');
const solveButton = document.querySelector('[data-solve]');
const editSetupButton = document.querySelector('[data-edit-setup]');
const solveStatus = document.querySelector('[data-solve-status]');
const historyList = document.querySelector('[data-histories]');
const scrubField = document.querySelector('[data-scrub-field]');

const SPEEDS = [
  [1, '1×'],
  [0.5, '½×'],
  [0.25, '¼×'],
  [0.1, '⅒×'],
];
const MAX_SUBSTEP = 1 / 240;
const SOLVE_ATTEMPTS = 16;
const SETUP_HINT = 'Time travel setup: nothing moves until you Solve. Drag objects to place them.';
const PLAYBACK_HINT = 'Watching a history. Press Edit setup to change things.';
const FACING_RIGHT = -Math.PI / 2;
const TOOL_HINTS = {
  grab: 'Drag objects to throw them. Drag a portal end to move it, or tap it to edit it.',
  box: 'Tap to drop a box. Drag to throw one.',
  ball: 'Tap to drop a ball. Drag to throw one.',
  wedge: 'Tap to drop a wedge. Drag to throw one.',
  portal: 'Drag from where end A goes to where end B goes. Tap for a pair side by side.',
  wall: 'Drag to draw a wall.',
  laser: 'Tap to place a laser. Drag to aim it.',
};
const SPAWNERS = {
  box: (p) => makeBox(p.x, p.y, 0.7, 0.7),
  ball: (p) => makeBall(p.x, p.y, 0.3),
  wedge: (p) => makeWedge(p.x, p.y, 0.9),
};

let world;
let sceneId = SCENES[0].id;
let tool = 'grab';
let paused = false;
let speedIndex = 0;
let selected = null;
let drag = null;
let view = fitView(canvas);
let solver = null;
let playback = null;

for (const scene of SCENES) sceneSelect.add(new Option(scene.title, scene.id));
for (const [id, shape] of Object.entries(SHAPES)) form.shape.add(new Option(shape.label, id));
for (const [id, label] of Object.entries(MOTIONS)) form.motion.add(new Option(label, id));

function setScene(id) {
  const scene = SCENES.find((s) => s.id === id);
  sceneId = id;
  world = loadScene(id);
  form.gravity.value = scene.gravity ?? form.gravity.defaultValue;
  world.gravity = Number(form.gravity.value);
  sceneSelect.value = id;
  document.querySelector('[data-scene-note]').textContent = scene.note;
  syncLabels();
  select(null);
  drag = null;
  solveStatus.textContent = '';
  editSetup();
}

const timeTravelling = () => world.pairs.some((p) => p.delay > 0);

function syncTimePanel() {
  const active = timeTravelling();
  timePanel.hidden = !active;
  if (!active) {
    stopSolving();
    playback = null;
  }
  statusLine.textContent = !active ? TOOL_HINTS[tool] : playback ? PLAYBACK_HINT : SETUP_HINT;
}

function rewindSetup() {
  world.time = 0;
  for (const pair of world.pairs) refreshEnds(pair);
}

function stopSolving() {
  solver?.terminate();
  solver = null;
  solveButton.textContent = 'Solve';
}

function solve() {
  if (solver) {
    stopSolving();
    solveStatus.textContent = 'Stopped.';
    return;
  }
  editSetup();
  const setup = toData(world);
  const duration = Number(form.window.value);
  solver = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  solveButton.textContent = 'Stop';
  solveStatus.textContent = 'Searching…';
  solver.onmessage = ({ data }) => {
    if (data.type === 'progress') solveStatus.textContent = `Searching… try ${data.done + 1} of ${data.total}, ${data.found} found so far.`;
    else if (data.type === 'found') addHistory(data.history, setup, duration);
    else {
      stopSolving();
      solveStatus.textContent = data.found
        ? `Found ${data.found} consistent ${data.found === 1 ? 'history' : 'histories'} in ${data.runs} simulations.`
        : `No consistent history found in ${data.runs} simulations. That doesn't prove there is none: Solve again to keep looking.`;
    }
  };
  solver.postMessage({ world: setup, duration, attempts: SOLVE_ATTEMPTS });
}

function describeHistory(history) {
  const count = history.arrivals.length;
  if (count === 0) return 'Nothing comes back';
  const kinds = new Set(history.arrivals.map((a) => a.spec.kind));
  const noun = kinds.size === 1 ? [...kinds][0] : 'object';
  return `${count} ${noun}${count > 1 ? 's' : ''} from the future`;
}

function addHistory(history, setup, duration) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = describeHistory(history);
  if (history.arrivals.length) button.title = `What arrives matches what leaves to within ${(history.mismatch * 100).toFixed(1)} cm`;
  button.addEventListener('click', () => watch(history, setup, duration, button));
  historyList.append(button);
  if (!playback) watch(history, setup, duration, button);
}

function watch(history, setup, duration, button) {
  for (const b of historyList.children) b.setAttribute('aria-pressed', String(b === button));
  const stage = fromData(setup);
  stage.bodies = [];
  playback = { history, stage, duration, t: 0, bodies: new Map() };
  form.scrub.max = duration;
  scrubField.hidden = false;
  editSetupButton.hidden = false;
  select(null);
  paused = false;
  pauseButton.textContent = 'Pause';
  syncTimePanel();
  showFrame(0);
}

function showFrame(t) {
  playback.t = t;
  const { history, stage, bodies } = playback;
  const frames = history.frames;
  const frame = frames[Math.min(frames.length - 1, Math.round((t / playback.duration) * (frames.length - 1)))];
  stage.time = frame.t;
  stage.bodies = frame.bodies.map((state) => {
    const body = bodies.get(state.key) ?? placeBody({ bodies: [] }, state);
    bodies.set(state.key, body);
    return Object.assign(body, { x: state.x, y: state.y, angle: state.angle, flip: state.flip, generation: state.generation });
  });
  allEnds(stage).forEach((end, i) => {
    Object.assign(end.pose, frame.ends[i]);
    refreshTransform(end);
  });
  form.scrub.value = t;
  document.querySelector('[data-scrub-label]').textContent = `${t.toFixed(2)} s`;
}

function editSetup() {
  stopSolving();
  playback = null;
  historyList.replaceChildren();
  scrubField.hidden = true;
  editSetupButton.hidden = true;
  if (timeTravelling()) rewindSetup();
  syncTimePanel();
}

function setTool(next) {
  tool = next;
  canvas.dataset.tool = next;
  for (const b of document.querySelectorAll('[data-tool]')) {
    if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(b.dataset.tool === next));
  }
  syncTimePanel();
}

function select(thing) {
  selected = thing;
  syncPanel();
}

function syncPanel() {
  const end = selected?.end;
  portalPanel.hidden = !end;
  objectPanel.hidden = !selected || !!end;
  if (end) {
    const pair = end.pair;
    form.shape.value = pair.shape;
    form.width.value = pair.width;
    form.kind.value = pair.kind;
    form.kind.disabled = SHAPES[pair.shape].closed;
    form.mirror.checked = pair.mirror;
    form.delay.value = pair.delay;
    for (const b of portalPanel.querySelectorAll('[data-end]')) {
      const ofEnd = Number(b.dataset.end) === end.index;
      b.setAttribute('aria-pressed', String(ofEnd));
      b.style.boxShadow = `inset 0 -3px 0 ${pair.colors[Number(b.dataset.end)]}`;
    }
    const m = end.motion;
    form.motion.value = m.type;
    form.distance.value = m.distance;
    form.direction.value = m.direction;
    form.swing.value = m.swing;
    form.period.value = m.period;
    for (const field of portalPanel.querySelectorAll('[data-motion-param]')) {
      field.hidden = !field.dataset.motionParam.split(' ').includes(m.type);
    }
    syncLabels();
  } else if (selected) {
    document.querySelector('[data-object-legend]').textContent =
      selected.body ? `Selected ${selected.body.kind}` : selected.wall ? 'Selected wall' : 'Selected laser';
  }
}

function syncLabels() {
  const label = (name, text) => { document.querySelector(`[data-${name}-label]`).textContent = text; };
  label('width', `${Number(form.width.value).toFixed(1)} m`);
  label('distance', `${Number(form.distance.value).toFixed(1)} m`);
  label('direction', `${form.direction.value}°`);
  label('swing', `±${form.swing.value}°`);
  label('period', `${Number(form.period.value).toFixed(1)} s`);
  label('gravity', `${Number(form.gravity.value).toFixed(1)} m/s²`);
  const delay = Number(form.delay.value);
  label('delay', delay ? `${delay} s` : 'Off');
  label('window', `${Number(form.window.value).toFixed(1)} s`);
}

function refreshEnds(pair) {
  for (const end of pair.ends) {
    Object.assign(end.pose, poseAt(end, world.time, 0));
    refreshTransform(end);
  }
}

function keepPhase(motion, newPeriod) {
  const angle = (2 * Math.PI * world.time) / motion.period + motion.phase;
  motion.phase = angle - (2 * Math.PI * world.time) / newPeriod;
  motion.period = newPeriod;
}

form.addEventListener('input', (e) => {
  const name = e.target.name;
  syncLabels();
  if (name === 'gravity') { world.gravity = Number(form.gravity.value); return; }
  if (name === 'window') return;
  if (name === 'scrub') {
    if (!playback) return;
    paused = true;
    pauseButton.textContent = 'Play';
    showFrame(Number(form.scrub.value));
    return;
  }
  const end = selected?.end;
  if (!end) return;
  const pair = end.pair;
  const m = end.motion;
  if (name === 'shape' || name === 'width' || name === 'kind' || name === 'mirror') {
    pair.shape = form.shape.value;
    pair.width = Number(form.width.value);
    pair.kind = form.kind.value;
    pair.mirror = form.mirror.checked;
    rebuildPair(pair);
    refreshEnds(pair);
    syncPanel();
  } else if (name === 'motion') {
    m.type = form.motion.value;
    m.phase = (-2 * Math.PI * world.time) / m.period;
    refreshEnds(pair);
    syncPanel();
  } else if (name === 'period') {
    keepPhase(m, Number(form.period.value));
  } else if (name === 'distance' || name === 'direction' || name === 'swing') {
    m[name] = Number(form[name].value);
  } else if (name === 'delay') {
    const wasTimeTravelling = timeTravelling();
    pair.delay = Number(form.delay.value);
    if (!wasTimeTravelling && timeTravelling()) rewindSetup();
    syncTimePanel();
  }
});
form.addEventListener('submit', (e) => e.preventDefault());

for (const b of portalPanel.querySelectorAll('[data-end]')) {
  b.addEventListener('click', () => select({ end: selected.end.pair.ends[Number(b.dataset.end)] }));
}
document.querySelector('[data-turn]').addEventListener('click', () => {
  const end = selected.end;
  end.base.angle += Math.PI;
  refreshEnds(end.pair);
});
for (const b of document.querySelectorAll('[data-delete]')) b.addEventListener('click', deleteSelected);
for (const b of document.querySelectorAll('[data-deselect]')) b.addEventListener('click', () => select(null));
document.querySelector('[data-reload]').addEventListener('click', () => setScene(sceneId));
document.querySelector('[data-clear]').addEventListener('click', () => {
  world.bodies = [];
  world.grab = null;
  if (selected?.body) select(null);
});
sceneSelect.addEventListener('change', () => setScene(sceneSelect.value));
solveButton.addEventListener('click', solve);
editSetupButton.addEventListener('click', editSetup);
for (const b of document.querySelectorAll('button[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
pauseButton.addEventListener('click', togglePause);
speedButton.addEventListener('click', () => {
  speedIndex = (speedIndex + 1) % SPEEDS.length;
  speedButton.textContent = SPEEDS[speedIndex][1];
});

function togglePause() {
  paused = !paused;
  pauseButton.textContent = paused ? 'Play' : 'Pause';
}

function deleteSelected() {
  if (!selected) return;
  if (selected.end) {
    world.pairs = world.pairs.filter((p) => p !== selected.end.pair);
    syncTimePanel();
  }
  if (selected.body) {
    world.bodies = world.bodies.filter((b) => b !== selected.body);
    if (world.grab?.body === selected.body) world.grab = null;
  }
  if (selected.wall) world.walls = world.walls.filter((w) => w !== selected.wall);
  if (selected.laser) world.lasers = world.lasers.filter((l) => l !== selected.laser);
  select(null);
}

function pointerWorld(e) {
  const rect = canvas.getBoundingClientRect();
  return toWorld(view, e.clientX - rect.left, e.clientY - rect.top);
}

function hitTest(p) {
  const tol = 14 / view.scale;
  if (selected?.end && len(sub(handlePoint(selected.end), p)) < tol) return { type: 'turn-end', end: selected.end };
  const laser = selected?.laser;
  if (laser && len(sub(V(laser.x - Math.sin(laser.angle) * 0.8, laser.y + Math.cos(laser.angle) * 0.8), p)) < tol) {
    return { type: 'turn-laser', laser };
  }
  let nearest = null;
  for (const end of allEnds(world)) {
    const d = query(end, p).dist;
    if (d < tol && (!nearest || d < nearest.d)) nearest = { d, end };
  }
  if (nearest) return { type: 'end', end: nearest.end };
  for (const l of world.lasers) if (len(sub(V(l.x, l.y), p)) < Math.max(tol, 0.35)) return { type: 'laser', laser: l };
  for (let i = world.bodies.length - 1; i >= 0; i--) {
    if (pointInBody(world.bodies[i], p)) return { type: 'body', body: world.bodies[i] };
  }
  for (const wall of world.walls) if (!wall.fixed && pointInWall(wall, p)) return { type: 'wall', wall };
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (playback) return;
  canvas.setPointerCapture(e.pointerId);
  const p = pointerWorld(e);
  if (tool !== 'grab') {
    drag = { type: 'create', start: p, current: p };
    return;
  }
  const hit = hitTest(p);
  if (!hit) { select(null); drag = null; return; }
  if (hit.type === 'turn-end' || hit.type === 'end') {
    const end = hit.end;
    select({ end });
    drag = { type: hit.type, end, offset: sub(p, V(end.base.x, end.base.y)), target: { ...end.base } };
  } else if (hit.type === 'turn-laser' || hit.type === 'laser') {
    select({ laser: hit.laser });
    drag = { type: hit.type, laser: hit.laser, last: p };
  } else if (hit.type === 'body' && timeTravelling()) {
    select({ body: hit.body });
    drag = { type: 'place', body: hit.body, offset: sub(p, V(hit.body.x, hit.body.y)) };
  } else if (hit.type === 'body') {
    select({ body: hit.body });
    world.grab = { body: hit.body, local: grabLocal(hit.body, p), target: p };
    drag = { type: 'body' };
  } else if (hit.type === 'wall') {
    select({ wall: hit.wall });
    drag = { type: 'wall', wall: hit.wall, last: p };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = pointerWorld(e);
  if (drag.type === 'create') drag.current = p;
  else if (drag.type === 'end') drag.target = { x: p.x - drag.offset.x, y: p.y - drag.offset.y, angle: drag.end.base.angle };
  else if (drag.type === 'turn-end') {
    const c = drag.end.pose;
    drag.target = { ...drag.end.base, angle: Math.atan2(p.y - c.y, p.x - c.x) - Math.PI / 2 - (c.angle - drag.end.base.angle) };
  } else if (drag.type === 'body' && world.grab) world.grab.target = p;
  else if (drag.type === 'place') {
    drag.body.x = p.x - drag.offset.x;
    drag.body.y = p.y - drag.offset.y;
  }
  else if (drag.type === 'wall' || drag.type === 'laser') {
    const thing = drag.wall ?? drag.laser;
    thing.x += p.x - drag.last.x;
    thing.y += p.y - drag.last.y;
    drag.last = p;
    if (drag.wall) refreshWall(drag.wall);
  } else if (drag.type === 'turn-laser') {
    drag.laser.angle = Math.atan2(p.y - drag.laser.y, p.x - drag.laser.x) - Math.PI / 2;
  }
});

function finishCreate(start, end) {
  const d = sub(end, start);
  const tapped = len(d) < 10 / view.scale;
  if (SPAWNERS[tool]) {
    const body = SPAWNERS[tool](start);
    if (!tapped) { body.vx = d.x * 3; body.vy = d.y * 3; }
    world.bodies.push(body);
  } else if (tool === 'portal') {
    const b = tapped ? V(start.x + 4, start.y) : end;
    const pair = makePair({
      colorIndex: world.pairs.length,
      a: { x: start.x, y: start.y, angle: FACING_RIGHT },
      b: { x: b.x, y: b.y, angle: FACING_RIGHT },
    });
    world.pairs.push(pair);
    for (const e of pair.ends) e.motion.phase = (-2 * Math.PI * world.time) / e.motion.period;
    setTool('grab');
    select({ end: pair.ends[0] });
  } else if (tool === 'wall' && !tapped) {
    world.walls.push(makeWall((start.x + end.x) / 2, (start.y + end.y) / 2, len(d), 0.3, Math.atan2(d.y, d.x)));
  } else if (tool === 'laser') {
    const laser = makeLaser(start.x, start.y, tapped ? 0 : Math.atan2(d.y, d.x));
    world.lasers.push(laser);
    setTool('grab');
    select({ laser });
  }
}

function endDrag() {
  if (drag?.type === 'create') finishCreate(drag.start, drag.current);
  world.grab = null;
  drag = null;
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', () => { world.grab = null; drag = null; });

canvas.addEventListener('wheel', (e) => {
  const end = selected?.end;
  if (!end) return;
  e.preventDefault();
  end.base.angle -= Math.sign(e.deltaY) * (Math.PI / 36);
  if (paused || timeTravelling()) refreshEnds(end.pair);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea')) return;
  if (e.key === ' ') { e.preventDefault(); togglePause(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
  else if (e.key === 'Escape') select(null);
  else if (/^[1-7]$/.test(e.key)) setTool(Object.keys(TOOL_HINTS)[Number(e.key) - 1]);
});

function drawArrow(c, from, v, px) {
  const tip = V(from.x + v.x * 0.35, from.y + v.y * 0.35);
  const a = Math.atan2(v.y, v.x);
  c.beginPath();
  c.moveTo(from.x, from.y);
  c.lineTo(tip.x, tip.y);
  c.moveTo(tip.x - Math.cos(a - 0.5) * 8 * px, tip.y - Math.sin(a - 0.5) * 8 * px);
  c.lineTo(tip.x, tip.y);
  c.lineTo(tip.x - Math.cos(a + 0.5) * 8 * px, tip.y - Math.sin(a + 0.5) * 8 * px);
  c.lineWidth = 2 * px;
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.stroke();
}

function previewCreate(c, px) {
  if (timeTravelling()) {
    for (const body of world.bodies) if (Math.hypot(body.vx, body.vy) > 0.05) drawArrow(c, V(body.x, body.y), V(body.vx, body.vy), px);
  }
  if (drag?.type !== 'create') return;
  const { start, current } = drag;
  c.beginPath();
  c.moveTo(start.x, start.y);
  c.lineTo(current.x, current.y);
  c.setLineDash([6 * px, 5 * px]);
  c.lineWidth = (tool === 'wall' ? 0.3 : 2 * px);
  c.strokeStyle = tool === 'wall' ? 'rgba(61,97,135,0.8)' : 'rgba(255,255,255,0.7)';
  c.stroke();
  c.setLineDash([]);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  view = fitView(canvas);
  const dragged = (drag?.type === 'end' || drag?.type === 'turn-end') && drag.target ? drag.end : null;
  if (playback) {
    if (!paused) showFrame((playback.t + dt * SPEEDS[speedIndex][0]) % playback.duration);
    render(ctx, view, playback.stage, { selected: null });
    requestAnimationFrame(frame);
    return;
  }
  if (timeTravelling()) {
    if (dragged) {
      Object.assign(dragged.base, drag.target);
      refreshEnds(dragged.pair);
    }
  } else if (!paused) {
    if (dragged) dragged.dragTo = drag.target;
    const simDt = dt * SPEEDS[speedIndex][0];
    step(world, simDt, Math.max(1, Math.ceil(simDt / MAX_SUBSTEP)));
  } else if (dragged) {
    Object.assign(dragged.base, drag.target);
    refreshEnds(dragged.pair);
  }
  render(ctx, view, world, { selected, preview: previewCreate });
  requestAnimationFrame(frame);
}

setScene(sceneId);
setTool('grab');
syncLabels();
requestAnimationFrame(frame);
