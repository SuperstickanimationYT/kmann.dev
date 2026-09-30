import { driftThroughCones, isCone, outOfMissingSpace, wedgeAngleOf } from './cones.js';
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
const TEST_BALL_MASS = 0.1;
const TEST_BALL_RANGE = 30000;
const DEGREES = Math.PI / 180;
const SMALLEST_WEDGE = 1 * DEGREES;
const BEAM = { balls: 15, halfWidth: 260, startBehind: 420, speed: 160 };
const FLASH = { rays: 96, distance: 260, speed: 160 };
const EXPONENT_SUPERSCRIPTS = { '-': '⁻', '.': '·', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

const canvas = document.querySelector('[data-stage]');
const form = document.querySelector('[data-controls]');
const view = createView(canvas);
const find = (selector) => document.querySelector(selector);

const settings = { spacetime: 'newton', cutAngle: 0, newCone: false, exponent: 2, merge: true, trails: true, speed: 1, autoOrbit: true, newMass: DEFAULT_NEW_MASS, newPinned: false, paused: false };
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

const inCones = () => settings.spacetime === 'cones';

function stepWorld(world, { trails }) {
  if (inCones()) driftThroughCones(world, settings.cutAngle, STEP_SECONDS, { trails });
  else leapfrogStep(world, settings);
}

function intoConesAndBalls() {
  for (const body of bodies) {
    if (body.test) continue;
    if (wedgeAngleOf(body.mass) < SMALLEST_WEDGE) Object.assign(body, { test: true, pinned: false });
    else Object.assign(body, { vx: 0, vy: 0 });
  }
}

function setSpacetime(spacetime) {
  settings.spacetime = spacetime;
  if (inCones()) intoConesAndBalls();
  else bodies = bodies.filter(isCone);
  bodies.forEach((body) => (body.trail = []));
  if (selected && !bodies.includes(selected)) select(null);
  document.querySelectorAll('[data-newton-only]').forEach((element) => (element.hidden = inCones()));
  document.querySelectorAll('[data-cones-only]').forEach((element) => (element.hidden = !inCones()));
  showSelected();
  showSettings();
}

function heaviestCone() {
  return bodies.filter(isCone).reduce((heaviest, body) => (!heaviest || body.mass > heaviest.mass ? body : heaviest), null) ?? { x: view.camera.x, y: view.camera.y };
}

function addTestBall(x, y, vx, vy) {
  const [freeX, freeY] = outOfMissingSpace(bodies, settings.cutAngle, [x, y]);
  bodies.push(createBody({ x: freeX, y: freeY, vx, vy, mass: TEST_BALL_MASS, test: true }));
}

function dropFarTestBalls() {
  const { x, y } = view.camera;
  bodies = bodies.filter((body) => !body.test || Math.hypot(body.x - x, body.y - y) < TEST_BALL_RANGE);
}

const acrossTheCut = () => [Math.cos(settings.cutAngle + Math.PI / 2), Math.sin(settings.cutAngle + Math.PI / 2)];

function fireBeam() {
  const target = heaviestCone();
  const [alongX, alongY] = acrossTheCut();
  for (let i = 0; i < BEAM.balls; i++) {
    const across = -BEAM.halfWidth + (2 * BEAM.halfWidth * i) / (BEAM.balls - 1);
    const x = target.x - alongX * BEAM.startBehind - alongY * across;
    const y = target.y - alongY * BEAM.startBehind + alongX * across;
    addTestBall(x, y, alongX * BEAM.speed, alongY * BEAM.speed);
  }
}

function fireFlash() {
  const target = heaviestCone();
  const [alongX, alongY] = acrossTheCut();
  const [x, y] = [target.x - alongX * FLASH.distance, target.y - alongY * FLASH.distance];
  for (let i = 0; i < FLASH.rays; i++) {
    const bearing = (i / FLASH.rays) * Math.PI * 2;
    addTestBall(x, y, Math.cos(bearing) * FLASH.speed, Math.sin(bearing) * FLASH.speed);
  }
}

function loadScene(key) {
  bodies = SCENES[key].build(settings.exponent);
  if (inCones()) intoConesAndBalls();
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
  const wedge = inCones() && isCone(selected) ? ` · ${Math.round(wedgeAngleOf(selected.mass) / DEGREES)}° wedge` : '';
  find('[data-selected-mass-label]').textContent = `${selected.mass.toLocaleString()}${wedge}`;
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
  document.querySelectorAll('[data-spacetime]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.spacetime === settings.spacetime)));
  find('[data-cut-label]').textContent = `${Math.round(settings.cutAngle / DEGREES)}°`;
}

function togglePause() {
  settings.paused = !settings.paused;
  showSettings();
}

function newBodyAt(x, y, velocity) {
  if (inCones() && !settings.newCone) return createBody({ x, y, mass: TEST_BALL_MASS, test: true, ...velocity });
  if (inCones()) return createBody({ x, y, mass: settings.newMass });
  return createBody({ x, y, mass: settings.newMass, pinned: settings.newPinned, ...(settings.newPinned ? {} : velocity) });
}

function tapVelocity(x, y) {
  if (inCones() || !settings.autoOrbit) return { vx: 0, vy: 0 };
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
    const [beforeX, beforeY] = [ghost.x, ghost.y];
    stepWorld(world, { trails: false });
    if (Math.hypot(ghost.x - beforeX, ghost.y - beforeY) > Math.hypot(ghost.vx, ghost.vy) * STEP_SECONDS * 2) path.push(null);
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
  if (!wasPinned) Object.assign(body, throwIt && !(inCones() && isCone(body)) ? { vx, vy } : { vx: 0, vy: 0 });
  if (inCones() && body.test) [body.x, body.y] = outOfMissingSpace(bodies, settings.cutAngle, [body.x, body.y]);
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
    if (body.test || (!inCones() && !settings.newPinned)) Object.assign(body, dragged ? launchVelocity() : tapVelocity(body.x, body.y));
    if (body.test) [body.x, body.y] = outOfMissingSpace(bodies, settings.cutAngle, [body.x, body.y]);
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
  document.querySelectorAll('[data-spacetime]').forEach((button) => button.addEventListener('click', () => setSpacetime(button.dataset.spacetime)));
  form.cutAngle.addEventListener('input', () => {
    settings.cutAngle = Number(form.cutAngle.value) * DEGREES;
    showSettings();
  });
  form.newCone.addEventListener('change', () => (settings.newCone = form.newCone.checked));
  find('[data-beam]').addEventListener('click', fireBeam);
  find('[data-flash]').addEventListener('click', fireFlash);
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
    if (!selected || selected.pinned || inCones()) return;
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

const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;

function showStatus() {
  const paused = settings.paused ? ' · paused' : '';
  const cones = bodies.filter(isCone).length;
  const description = inCones()
    ? `${counted(cones, 'mass', 'masses')} · ${counted(bodies.length - cones, 'ball', 'balls')} · 2+1 relativity`
    : `${counted(bodies.length, 'body', 'bodies')} · force ∝ ${lawLabel(settings.exponent)}`;
  find('[data-status]').textContent = description + paused;
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
      stepWorld(bodies, settings);
      backlog -= STEP_SECONDS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) backlog = 0;
    if (inCones()) dropFarTestBalls();
    if (selected && !bodies.includes(selected)) select(null);
    if (grab && !bodies.includes(grab.body)) grab = null;
    if (settings.trails) noteTrails(bodies);
    if (launch) predictPath();
  }
  view.draw({ bodies, selected, launch, trails: settings.trails, cutAngle: inCones() ? settings.cutAngle : null });
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
