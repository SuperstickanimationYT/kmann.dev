import { circularVelocity, cloneBodies, createBody, leapfrogStep, STEP_SECONDS, strongestPullOn } from './physics.js';
import { SCENES } from './scenes.js';
import { createView, noteTrails } from './view.js';

const MASS_RANGE = { min: 0.1, max: 3000, sliderSteps: 1000 };
const DEFAULT_NEW_MASS = 1;
const TAP_MAX_PX = 6;
const TAP_MAX_MS = 400;
const GRAB_SLACK_PX = 10;
const LAUNCH_SPEED_PER_UNIT = 1.2;
const MAX_STEPS_PER_FRAME = 400;
const PREDICTION_SECONDS = 4;
const PREDICTION_PAIR_BUDGET = 400000;
const THROW_SMOOTHING = 0.5;
const WHEEL_ZOOM = 1.0015;
const EXPONENT_SUPERSCRIPTS = { '-': '⁻', '.': '·', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const canvas = document.querySelector('[data-stage]');
const form = document.querySelector('[data-controls]');
const view = createView(canvas);
const find = (selector) => document.querySelector(selector);

const settings = { exponent: 2, merge: true, trails: true, speed: 1, autoOrbit: true, newMass: DEFAULT_NEW_MASS, newPinned: false, paused: false };
let bodies = [];
let selected = null;
let launch = null;
let grab = null;
let pan = null;
let pinch = null;
const pointers = new Map();

const massFromSlider = (value) => Number((MASS_RANGE.min * (MASS_RANGE.max / MASS_RANGE.min) ** (value / MASS_RANGE.sliderSteps)).toPrecision(2));
const sliderFromMass = (mass) => Math.round((Math.log(mass / MASS_RANGE.min) / Math.log(MASS_RANGE.max / MASS_RANGE.min)) * MASS_RANGE.sliderSteps);

function lawLabel(exponent) {
  if (exponent === 0) return 'constant';
  if (exponent === -1) return 'r';
  if (exponent < 0) return `r${[...String(-exponent)].map((character) => EXPONENT_SUPERSCRIPTS[character]).join('')}`;
  if (exponent === 1) return '1/r';
  return `1/r${[...String(exponent)].map((character) => EXPONENT_SUPERSCRIPTS[character]).join('')}`;
}

function loadScene(key) {
  bodies = SCENES[key].build(settings.exponent);
  selected = null;
  view.resize();
  view.frame(bodies);
  if (!bodies.length) Object.assign(view.camera, { x: 0, y: 0, zoom: 1 });
}

function select(body) {
  selected = body;
  showSelected();
}

function showSelected() {
  find('[data-selected]').hidden = !selected;
  if (!selected) return;
  form.selectedMass.value = sliderFromMass(selected.mass);
  form.selectedPinned.checked = selected.pinned;
  find('[data-selected-mass-label]').textContent = selected.mass.toLocaleString();
}

function removeBody(body) {
  bodies = bodies.filter((candidate) => candidate !== body);
  if (selected === body) select(null);
}

function showSettings() {
  find('[data-law-label]').textContent = lawLabel(settings.exponent);
  document.querySelectorAll('[data-law]').forEach((button) => button.setAttribute('aria-pressed', String(Number(button.dataset.law) === settings.exponent)));
  find('[data-new-mass-label]').textContent = settings.newMass.toLocaleString();
  find('[data-speed-label]').textContent = `${settings.speed}×`;
  find('[data-pause]').textContent = settings.paused ? 'Play' : 'Pause';
}

function togglePause() {
  settings.paused = !settings.paused;
  showSettings();
}

function newBodyAt(x, y, velocity) {
  return createBody({ x, y, mass: settings.newMass, pinned: settings.newPinned, ...(settings.newPinned ? {} : velocity) });
}

function tapVelocity(x, y) {
  if (!settings.autoOrbit) return { vx: 0, vy: 0 };
  return circularVelocity(strongestPullOn(bodies, x, y, settings.exponent), x, y, settings.exponent);
}

function launchVelocity() {
  return { vx: (launch.aimX - launch.body.x) * LAUNCH_SPEED_PER_UNIT, vy: (launch.aimY - launch.body.y) * LAUNCH_SPEED_PER_UNIT };
}

function predictPath() {
  const world = [...cloneBodies(bodies), { ...launch.body, ...launchVelocity(), trail: [] }];
  const ghost = world.at(-1);
  const steps = Math.min(PREDICTION_SECONDS / STEP_SECONDS, PREDICTION_PAIR_BUDGET / Math.max(1, world.length ** 2));
  const path = [[ghost.x, ghost.y]];
  for (let i = 0; i < steps && world.includes(ghost); i++) {
    leapfrogStep(world, settings);
    if (i % 4 === 0) path.push([ghost.x, ghost.y]);
  }
  launch.path = path;
}

function pointerDown(event) {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    cancelSingleGestures();
    pinch = pinchState();
    return;
  }
  if (pointers.size > 2) return;
  const start = { x: event.clientX, y: event.clientY, time: performance.now() };
  if (event.pointerType === 'mouse' && event.button !== 0) {
    pan = { ...start, lastX: event.clientX, lastY: event.clientY, button: event.button };
    return;
  }
  const body = view.bodyAt(bodies, event.clientX, event.clientY, GRAB_SLACK_PX);
  const [x, y] = view.toWorld(event.clientX, event.clientY);
  if (body) {
    grab = { ...start, body, wasPinned: body.pinned, lastX: x, lastY: y, lastTime: start.time, vx: 0, vy: 0, offsetX: body.x - x, offsetY: body.y - y };
    body.pinned = true;
    return;
  }
  launch = { ...start, body: newBodyAt(x, y, {}), aimX: x, aimY: y, path: [] };
}

function pinchState() {
  const [a, b] = [...pointers.values()];
  return { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
}

function cancelSingleGestures() {
  if (grab) releaseGrab(false);
  launch = null;
  pan = null;
}

function releaseGrab(throwIt) {
  const { body, wasPinned, vx, vy } = grab;
  body.pinned = wasPinned;
  if (!wasPinned) Object.assign(body, throwIt ? { vx, vy } : { vx: 0, vy: 0 });
  grab = null;
}

function pointerMove(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch && pointers.size === 2) {
    const next = pinchState();
    view.panBy(next.midX - pinch.midX, next.midY - pinch.midY);
    view.zoomAround(next.distance / pinch.distance, next.midX, next.midY);
    pinch = next;
    return;
  }
  if (pan) {
    view.panBy(event.clientX - pan.lastX, event.clientY - pan.lastY);
    Object.assign(pan, { lastX: event.clientX, lastY: event.clientY });
    return;
  }
  const [x, y] = view.toWorld(event.clientX, event.clientY);
  if (grab) {
    const now = performance.now();
    const seconds = Math.max(0.001, (now - grab.lastTime) / 1000);
    grab.vx = grab.vx * THROW_SMOOTHING + ((x - grab.lastX) / seconds) * (1 - THROW_SMOOTHING);
    grab.vy = grab.vy * THROW_SMOOTHING + ((y - grab.lastY) / seconds) * (1 - THROW_SMOOTHING);
    Object.assign(grab, { lastX: x, lastY: y, lastTime: now });
    Object.assign(grab.body, { x: x + grab.offsetX, y: y + grab.offsetY, vx: 0, vy: 0 });
    return;
  }
  if (launch) {
    Object.assign(launch, { aimX: x, aimY: y });
    predictPath();
  }
}

const wasTap = (gesture, event) => Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < TAP_MAX_PX && performance.now() - gesture.time < TAP_MAX_MS;

function pointerUp(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  if (pan) {
    const body = pan.button === 2 && wasTap(pan, event) ? view.bodyAt(bodies, event.clientX, event.clientY, GRAB_SLACK_PX) : null;
    if (body) removeBody(body);
    pan = null;
    return;
  }
  if (grab) {
    const tapped = wasTap(grab, event);
    const { body } = grab;
    const stillMoving = performance.now() - grab.lastTime < 80;
    releaseGrab(!tapped && stillMoving);
    if (tapped) select(body);
    return;
  }
  if (launch) {
    const dragged = Math.hypot(event.clientX - launch.x, event.clientY - launch.y) >= TAP_MAX_PX;
    const { body } = launch;
    if (!settings.newPinned) Object.assign(body, dragged ? launchVelocity() : tapVelocity(body.x, body.y));
    bodies.push(body);
    launch = null;
  }
}

function pointerCancel(event) {
  pointers.delete(event.pointerId);
  pinch = null;
  cancelSingleGestures();
}

function bindCanvas() {
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerCancel);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      view.zoomAround(WHEEL_ZOOM ** -event.deltaY, event.clientX, event.clientY);
    },
    { passive: false },
  );
}

function fillSceneList() {
  const list = find('[data-scene]');
  for (const [key, { name }] of Object.entries(SCENES)) list.append(new Option(name, key));
}

function setExponent(exponent) {
  settings.exponent = Math.round(exponent * 10) / 10;
  form.exponent.value = settings.exponent;
  showSettings();
}

function bindPanel() {
  form.addEventListener('submit', (event) => event.preventDefault());
  form.newMass.value = sliderFromMass(DEFAULT_NEW_MASS);
  form.exponent.addEventListener('input', () => setExponent(Number(form.exponent.value)));
  document.querySelectorAll('[data-law]').forEach((button) => button.addEventListener('click', () => setExponent(Number(button.dataset.law))));
  form.newMass.addEventListener('input', () => {
    settings.newMass = massFromSlider(Number(form.newMass.value));
    showSettings();
  });
  form.autoOrbit.addEventListener('change', () => (settings.autoOrbit = form.autoOrbit.checked));
  form.newPinned.addEventListener('change', () => (settings.newPinned = form.newPinned.checked));
  form.speed.addEventListener('input', () => {
    settings.speed = 2 ** Number(form.speed.value);
    showSettings();
  });
  form.trails.addEventListener('change', () => {
    settings.trails = form.trails.checked;
    bodies.forEach((body) => (body.trail = []));
  });
  form.merge.addEventListener('change', () => (settings.merge = form.merge.checked));
  form.selectedMass.addEventListener('input', () => {
    if (!selected) return;
    selected.mass = massFromSlider(Number(form.selectedMass.value));
    showSelected();
  });
  form.selectedPinned.addEventListener('change', () => {
    if (!selected) return;
    selected.pinned = form.selectedPinned.checked;
    if (selected.pinned) Object.assign(selected, { vx: 0, vy: 0 });
  });
  find('[data-circularize]').addEventListener('click', () => {
    if (!selected || selected.pinned) return;
    const others = bodies.filter((body) => body !== selected);
    Object.assign(selected, circularVelocity(strongestPullOn(others, selected.x, selected.y, settings.exponent), selected.x, selected.y, settings.exponent));
  });
  find('[data-delete]').addEventListener('click', () => selected && removeBody(selected));
  find('[data-deselect]').addEventListener('click', () => select(null));
  find('[data-pause]').addEventListener('click', togglePause);
  find('[data-frame]').addEventListener('click', () => view.frame(bodies));
  find('[data-clear]').addEventListener('click', () => {
    bodies = [];
    select(null);
  });
  find('[data-load-scene]').addEventListener('click', () => loadScene(form.scene.value));
}

const typingIn = (target) => target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement;

const KEYS = {
  ' ': togglePause,
  Delete: () => selected && removeBody(selected),
  Backspace: () => selected && removeBody(selected),
  Escape: () => select(null),
  t: () => {
    form.trails.checked = !form.trails.checked;
    form.trails.dispatchEvent(new Event('change'));
  },
  f: () => view.frame(bodies),
};

function bindKeys() {
  window.addEventListener('keydown', (event) => {
    const action = KEYS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action || typingIn(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    action();
  });
}

function showStatus() {
  const paused = settings.paused ? ' · paused' : '';
  find('[data-status]').textContent = `${bodies.length} bod${bodies.length === 1 ? 'y' : 'ies'} · force ∝ ${lawLabel(settings.exponent)}${paused}`;
}

let lastTime = null;
let backlog = 0;

function frame(time) {
  const seconds = lastTime === null ? 0 : Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  if (!settings.paused) {
    backlog += seconds * settings.speed;
    let steps = 0;
    while (backlog >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
      leapfrogStep(bodies, settings);
      backlog -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) backlog = 0;
    if (selected && !bodies.includes(selected)) select(null);
    if (grab && !bodies.includes(grab.body)) grab = null;
    if (settings.trails) noteTrails(bodies);
    if (launch) predictPath();
  }
  view.draw({ bodies, selected, launch, trails: settings.trails });
  showStatus();
  window.requestAnimationFrame(frame);
}

fillSceneList();
bindPanel();
bindCanvas();
bindKeys();
showSettings();
new ResizeObserver(() => view.resize()).observe(canvas);
loadScene('starAndPlanets');
window.requestAnimationFrame(frame);
