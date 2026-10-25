import { createCamera, fit, followTarget, panBy, toWorld, zoomAt } from './camera.js';
import { checkSystem, worstLevelByBody } from './checks.js';
import { apoapsis, orbitalPeriod, periapsis } from './orbits.js';
import { PRESETS } from './presets.js';
import { bodyAt, drawSystem } from './render.js';
import { exportProblems, sfsPack, STOCK_SCALE } from './sfs.js';
import {
  addBody, bodyById, childrenOf, density, descendantsOf, gravitationalParameter, hasSurface,
  hillRadius, parseSystem, placeAt, removeBody, rootOf, surfaceGravity, treeOrder,
} from './system.js';
import { DAY, KINDS, UNITS, distance, duration, significant } from './units.js';
import { storedZip } from './zip.js';

const STORAGE_KEY = 'system-builder:system';
const DEFAULT_PRESET = 'solar';
const CLICK_SLOP_PX = 5;
const WHEEL_ZOOM = 1.0015;
const FOLLOW_ZOOM_RADII = 40;
const MOST_FRAME_SECONDS = 0.1;

const canvas = document.querySelector('[data-stage]');
const context = canvas.getContext('2d');
const clock = document.querySelector('[data-clock]');
const presetPicker = document.querySelector('[data-preset]');
const tree = document.querySelector('[data-tree]');
const addHint = document.querySelector('[data-add-hint]');
const editor = document.querySelector('[data-editor]');
const facts = document.querySelector('[data-facts]');
const checksList = document.querySelector('[data-checks]');
const playButton = document.querySelector('[data-play]');
const speedInput = document.querySelector('[data-speed]');
const speedLabel = document.querySelector('[data-speed-label]');
const homePicker = document.querySelector('[data-home]');
const scaleInput = document.querySelector('[data-scale]');
const problemsList = document.querySelector('[data-problems]');
const exportButton = document.querySelector('[data-export-sfs]');
const fileStatus = document.querySelector('[data-file-status]');
const bodyField = (name) => editor.querySelector(`[data-body-field="${name}"]`);

const camera = createCamera();
let system = loadSaved() ?? PRESETS[DEFAULT_PRESET].build();
let selectedId = null;
let seconds = 0;
let playing = false;
let statusByBody = new Map();

function loadSaved() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? parseSystem(saved) : null;
  } catch {
    return null;
  }
}

function save() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(system));
  } catch {}
}

const selected = () => bodyById(system, selectedId);

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function element(tag, properties = {}, children = []) {
  const node = Object.assign(document.createElement(tag), properties);
  node.append(...children);
  return node;
}

function option(value, label, isSelected = false) {
  return element('option', { value, textContent: label, selected: isSelected });
}

function renderTree() {
  const worst = statusByBody;
  tree.replaceChildren(...treeOrder(system).map(({ body, depth }) => {
    const badge = element('span', { className: 'sb-badge' });
    const level = worst.get(body.id);
    if (level === 'fail' || level === 'warn') {
      badge.dataset.level = level;
      badge.textContent = level === 'fail' ? '✕' : '!';
    }
    const button = element('button', { type: 'button' }, [
      element('span', { className: 'sb-swatch', style: `background:${body.color}` }),
      element('span', { textContent: body.name || '(no name)' }),
      badge,
    ]);
    button.style.setProperty('--depth', depth);
    button.dataset.id = body.id;
    button.setAttribute('aria-current', String(body.id === selectedId));
    return element('li', {}, [button]);
  }));
}

function renderChecks(findings) {
  if (!findings.length) {
    checksList.replaceChildren(element('li', { textContent: 'No problems found.' }));
    checksList.firstChild.dataset.level = 'ok';
    return;
  }
  checksList.replaceChildren(...findings.map((finding) => {
    const item = element('li', { textContent: finding.text });
    item.dataset.level = finding.level;
    item.dataset.id = finding.bodies[0];
    return item;
  }));
}

function renderExport() {
  homePicker.replaceChildren(
    option('', 'Choose…', !system.home),
    ...system.bodies.filter(hasSurface).map((body) => option(body.id, body.name, body.id === system.home)),
  );
  const problems = exportProblems(system, Number(scaleInput.value));
  problemsList.replaceChildren(...problems.map((text) => element('li', { textContent: text })));
  exportButton.disabled = problems.length > 0;
}

function addTarget(kind) {
  const body = selected();
  const root = rootOf(system);
  if (kind === 'star') return root;
  if (kind === 'moon') {
    if (!body || body.kind === 'star') return null;
    return body.kind === 'moon' ? bodyById(system, body.parent) : body;
  }
  let host = body ?? root;
  while (host.kind !== 'star' && host.parent) host = bodyById(system, host.parent);
  return host;
}

function renderAddButtons() {
  const moonHost = addTarget('moon');
  document.querySelector('[data-add="moon"]').disabled = !moonHost;
  addHint.textContent = moonHost ? '' : 'Select a planet to give it a moon.';
}

function renderFacts(body) {
  const rows = [];
  if (body.parent) {
    const period = orbitalPeriod(body.orbit.a, gravitationalParameter(system, body));
    rows.push(['One orbit', duration(period)], ['Closest – farthest', `${distance(periapsis(body.orbit))} – ${distance(apoapsis(body.orbit))}`]);
    rows.push(['Hill sphere', distance(hillRadius(system, body))]);
  }
  const gravity = surfaceGravity(body);
  rows.push(['Surface gravity', `${significant(gravity)} m/s² (${significant(gravity / 9.80665)} g)`]);
  rows.push(['Density', `${significant(density(body) / 1000)} g/cm³`]);
  rows.push(['Surface', body.kind === 'star' ? 'none, it is a star' : hasSurface(body) ? 'solid' : 'none, a gas giant or mini-Neptune']);
  facts.replaceChildren(...rows.flatMap(([term, value]) => [element('dt', { textContent: term }), element('dd', { textContent: value })]));
}

const shown = (value) => String(Number(value.toPrecision(6)));

function renderEditor() {
  const body = selected();
  editor.hidden = !body;
  if (!body) return;
  const units = UNITS[body.kind];
  bodyField('name').value = body.name;
  bodyField('color').value = body.color;
  bodyField('kind').replaceChildren(...Object.entries(KINDS).map(([value, label]) => option(value, label, value === body.kind)));
  for (const node of editor.querySelectorAll('[data-orbit-only]')) node.hidden = !body.parent;
  for (const [field, unit] of Object.entries(units)) editor.querySelector(`[data-unit="${field}"]`).textContent = unit.label;
  bodyField('mass').value = shown(body.massKg / units.mass.si);
  bodyField('radius').value = shown(body.radiusM / units.radius.si);
  if (body.parent) {
    const excluded = new Set([body.id, ...descendantsOf(system, body.id).map((other) => other.id)]);
    bodyField('parent').replaceChildren(...system.bodies
      .filter((other) => !excluded.has(other.id))
      .map((other) => option(other.id, other.name, other.id === body.parent)));
    bodyField('a').value = shown(body.orbit.a / units.distance.si);
    for (const field of ['e', 'i', 'node', 'peri', 'meanAnomaly']) bodyField(field).value = shown(body.orbit[field]);
  }
  editor.querySelector('[data-remove]').disabled = !body.parent;
  renderFacts(body);
}

function refresh({ editor: withEditor = false } = {}) {
  const findings = checkSystem(system);
  statusByBody = worstLevelByBody(findings);
  renderTree();
  renderChecks(findings);
  renderExport();
  renderAddButtons();
  if (withEditor) renderEditor();
  else if (selected()) renderFacts(selected());
  save();
}

function select(id) {
  selectedId = id;
  for (const button of tree.querySelectorAll('button[data-id]')) button.setAttribute('aria-current', String(button.dataset.id === id));
  renderAddButtons();
  renderEditor();
}

function overview() {
  const root = rootOf(system);
  const reach = Math.max(root.radiusM * 20, ...childrenOf(system, root.id).map((body) => apoapsis(body.orbit)));
  camera.follow = null;
  fit(camera, placeAt(system, seconds).get(root.id), reach * 1.05);
}

function follow(id) {
  const body = bodyById(system, id);
  camera.follow = id;
  const moons = childrenOf(system, id);
  const reach = moons.length ? apoapsis(moons[moons.length - 1].orbit) * 1.1 : body.radiusM * FOLLOW_ZOOM_RADII;
  fit(camera, placeAt(system, seconds).get(id), reach);
}

function replaceSystem(next) {
  system = next;
  selectedId = null;
  seconds = 0;
  refresh({ editor: true });
  renderSystemFields();
  overview();
}

function renderSystemFields() {
  for (const input of document.querySelectorAll('[data-system-field]')) input.value = system[input.dataset.systemField] ?? '';
}

function parsedNumber(input) {
  const value = Number(input.value);
  return input.value.trim() !== '' && Number.isFinite(value) ? value : null;
}

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

const BODY_FIELD_SETTERS = {
  name: (body, input) => { body.name = input.value; },
  color: (body, input) => { body.color = input.value; },
  kind: (body, input) => { body.kind = input.value; return { editor: true }; },
  parent: (body, input) => { body.parent = input.value; },
  mass: (body, input) => {
    const value = parsedNumber(input);
    if (value > 0) body.massKg = value * UNITS[body.kind].mass.si;
  },
  radius: (body, input) => {
    const value = parsedNumber(input);
    if (value > 0) body.radiusM = value * UNITS[body.kind].radius.si;
  },
  a: (body, input) => {
    const value = parsedNumber(input);
    if (value > 0) body.orbit.a = value * UNITS[body.kind].distance.si;
  },
  e: (body, input) => {
    const value = parsedNumber(input);
    if (value !== null) body.orbit.e = clamp(value, 0, 0.99);
  },
  i: (body, input) => {
    const value = parsedNumber(input);
    if (value !== null) body.orbit.i = clamp(value, 0, 180);
  },
  node: (body, input) => { body.orbit.node = parsedNumber(input) ?? body.orbit.node; },
  peri: (body, input) => { body.orbit.peri = parsedNumber(input) ?? body.orbit.peri; },
  meanAnomaly: (body, input) => { body.orbit.meanAnomaly = parsedNumber(input) ?? body.orbit.meanAnomaly; },
};

editor.addEventListener('input', (event) => {
  const field = event.target.dataset.bodyField;
  const body = selected();
  if (!field || !body) return;
  refresh(BODY_FIELD_SETTERS[field](body, event.target) ?? {});
});

editor.addEventListener('change', (event) => {
  if (event.target.dataset.bodyField) renderEditor();
});

document.querySelectorAll('[data-system-field]').forEach((input) => {
  input.addEventListener('input', () => {
    system[input.dataset.systemField] = input.value;
    refresh();
  });
});

tree.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-id]');
  if (button) select(button.dataset.id);
});

tree.addEventListener('dblclick', (event) => {
  const button = event.target.closest('button[data-id]');
  if (button) follow(button.dataset.id);
});

checksList.addEventListener('click', (event) => {
  const item = event.target.closest('li[data-id]');
  if (item) select(item.dataset.id);
});

document.querySelectorAll('[data-add]').forEach((button) => {
  button.addEventListener('click', () => {
    const kind = button.dataset.add;
    const parent = addTarget(kind);
    if (!parent) return;
    selectedId = addBody(system, kind, parent.id).id;
    refresh({ editor: true });
  });
});

editor.querySelector('[data-remove]').addEventListener('click', () => {
  const body = selected();
  if (!body?.parent) return;
  const doomed = descendantsOf(system, body.id).length;
  if (doomed && !window.confirm(`Delete ${body.name} and the ${doomed} bodies orbiting it?`)) return;
  selectedId = body.parent;
  removeBody(system, body.id);
  refresh({ editor: true });
});

editor.querySelector('[data-follow]').addEventListener('click', () => {
  if (selectedId) follow(selectedId);
});

presetPicker.replaceChildren(...Object.entries(PRESETS).map(([key, preset]) => option(key, preset.label, key === DEFAULT_PRESET)));
document.querySelector('[data-load-preset]').addEventListener('click', () => {
  if (!window.confirm('Replace the current system? Save it to a file first if you want to keep it.')) return;
  replaceSystem(PRESETS[presetPicker.value].build());
});

homePicker.addEventListener('change', () => {
  system.home = homePicker.value || null;
  refresh({ editor: true });
});

scaleInput.addEventListener('input', () => renderExport());

exportButton.addEventListener('click', () => {
  const scale = Number(scaleInput.value);
  if (exportProblems(system, scale).length) return;
  const pack = sfsPack(system, scale);
  download(storedZip(pack.files), `${pack.folder}.zip`);
});

document.querySelector('[data-save]').addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(system, null, 2)}\n`], { type: 'application/json' });
  download(blob, `${system.name.trim() || 'system'}.json`);
});

document.querySelector('[data-open]').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    replaceSystem(parseSystem(await file.text()));
    fileStatus.textContent = `Opened ${file.name}.`;
  } catch (error) {
    fileStatus.textContent = `Couldn't open ${file.name}: ${error.message}`;
  }
});

function renderSpeed() {
  speedLabel.textContent = `${significant(10 ** Number(speedInput.value), 2)} days/s`;
}

speedInput.addEventListener('input', renderSpeed);

playButton.addEventListener('click', () => {
  playing = !playing;
  playButton.textContent = playing ? 'Pause' : 'Play';
});

document.querySelector('[data-rewind]').addEventListener('click', () => {
  seconds = 0;
});

document.querySelector('[data-overview]').addEventListener('click', overview);

const pointers = new Map();
let dragDistance = 0;
let pinchGap = null;

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
  dragDistance = 0;
  pinchGap = null;
  canvas.classList.add('sb-dragging');
});

canvas.addEventListener('pointermove', (event) => {
  const last = pointers.get(event.pointerId);
  if (!last) return;
  const current = { x: event.offsetX, y: event.offsetY };
  pointers.set(event.pointerId, current);
  if (pointers.size === 2) {
    const [first, second] = [...pointers.values()];
    const gap = Math.hypot(first.x - second.x, first.y - second.y);
    if (pinchGap) zoomAt(camera, (first.x + second.x) / 2, (first.y + second.y) / 2, gap / pinchGap);
    pinchGap = gap;
    dragDistance = Infinity;
    return;
  }
  dragDistance += Math.hypot(current.x - last.x, current.y - last.y);
  if (dragDistance > CLICK_SLOP_PX) panBy(camera, current.x - last.x, current.y - last.y);
});

function endPointer(event) {
  if (!pointers.delete(event.pointerId)) return;
  if (pointers.size === 0) canvas.classList.remove('sb-dragging');
  if (event.type !== 'pointerup' || dragDistance > CLICK_SLOP_PX) return;
  const body = bodyAt(system, placeAt(system, seconds), camera, selectedId, event.offsetX, event.offsetY);
  select(body ? body.id : null);
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('dblclick', (event) => {
  const body = bodyAt(system, placeAt(system, seconds), camera, selectedId, event.offsetX, event.offsetY);
  if (body) follow(body.id);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoomAt(camera, event.offsetX, event.offsetY, WHEEL_ZOOM ** -event.deltaY);
}, { passive: false });

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  const centre = toWorld(camera, camera.width / 2, camera.height / 2);
  camera.width = Math.max(1, box.width);
  camera.height = Math.max(1, box.height);
  camera.x = centre.x;
  camera.y = centre.y;
  canvas.width = Math.round(camera.width * ratio);
  canvas.height = Math.round(camera.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

new ResizeObserver(resize).observe(canvas);

let lastFrame = performance.now();

function frame(now) {
  const elapsed = Math.min(MOST_FRAME_SECONDS, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing) seconds += elapsed * 10 ** Number(speedInput.value) * DAY;
  const placed = placeAt(system, seconds);
  followTarget(camera, placed);
  drawSystem(context, { system, placed, camera, selectedId, statusByBody });
  clock.textContent = seconds ? `+${duration(seconds)}` : 'Start';
  requestAnimationFrame(frame);
}

scaleInput.value = STOCK_SCALE;
resize();
renderSpeed();
renderSystemFields();
refresh({ editor: true });
overview();
requestAnimationFrame(frame);
