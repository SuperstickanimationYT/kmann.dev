import { derivePlanet } from './physics.js';
import { renderPlanet } from './planet.js';
import { PRESETS, randomPlanet, randomSeed } from './presets.js';

const PREVIEW_SIZE = 720;
const DRAFT_SIZE = 240;
const SETTLE_MS = 200;
const COPIED_LABEL_MS = 1500;
const TEXT_FIELDS = ['baseColor', 'landColor', 'hazeColor', 'kind'];
const FLAG_FIELDS = ['land'];
const PHYSICAL_FIELDS = ['kind', 'temperature', 'water', 'atmosphere'];

const form = document.querySelector('[data-controls]');
const presetPicker = document.querySelector('[data-preset]');
const sizePicker = document.querySelector('[data-size]');
const preview = document.querySelector('[data-preview]');
const skyDownload = document.querySelector('[data-download="sky"]');
const undoButton = document.querySelector('[data-undo]');
const redoButton = document.querySelector('[data-redo]');
const copyLinkButton = document.querySelector('[data-copy-link]');
const landFieldset = form.elements.land.closest('fieldset');
const rockyOnlyFields = form.querySelectorAll('[data-rocky-only]');

preview.width = PREVIEW_SIZE;
preview.height = PREVIEW_SIZE;

const planetFields = () => [...form.elements].filter((field) => field.name);

function readPlanet() {
  const planet = {};
  for (const field of planetFields()) {
    if (FLAG_FIELDS.includes(field.name)) planet[field.name] = field.checked;
    else if (TEXT_FIELDS.includes(field.name)) planet[field.name] = field.value;
    else planet[field.name] = Number(field.value);
  }
  return planet;
}

function writePlanet(planet) {
  for (const [name, value] of Object.entries(planet)) {
    const field = form.elements[name];
    if (!field) continue;
    if (FLAG_FIELDS.includes(name)) field.checked = value;
    else field.value = value;
  }
}

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  landFieldset.classList.toggle('ptg-off', !form.elements.land.checked);
  const giant = form.elements.kind.value === 'giant';
  for (const field of rockyOnlyFields) field.classList.toggle('ptg-off', giant);
}

function toLink(planet) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(planet)) params.set(name, FLAG_FIELDS.includes(name) ? Number(value) : value);
  return `#${params}`;
}

function fromLink(hash) {
  const params = new URLSearchParams(hash.slice(1));
  const planet = {};
  for (const field of planetFields()) {
    if (!params.has(field.name)) continue;
    const value = params.get(field.name);
    if (FLAG_FIELDS.includes(field.name)) planet[field.name] = value === '1';
    else if (TEXT_FIELDS.includes(field.name)) planet[field.name] = value;
    else if (Number.isFinite(Number(value))) planet[field.name] = Number(value);
  }
  return Object.keys(planet).length ? planet : null;
}

function flatten({ surface, sky }, canvas) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(surface, 0, 0, canvas.width, canvas.height);
  context.drawImage(sky, 0, 0, canvas.width, canvas.height);
  return canvas;
}

let pendingFrame = 0;
let settleTimer = 0;

function drawAt(size) {
  flatten(renderPlanet(readPlanet(), size), preview);
}

function draw() {
  pendingFrame = 0;
  const planet = readPlanet();
  drawAt(DRAFT_SIZE);
  skyDownload.disabled = planet.clouds === 0 && planet.haze === 0;
  history.replaceState(null, '', toLink(planet));
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => drawAt(PREVIEW_SIZE), SETTLE_MS);
}

function update() {
  showValues();
  if (!pendingFrame) pendingFrame = requestAnimationFrame(draw);
}

function load(planet) {
  writePlanet(planet);
  update();
}

const past = [];
let cursor = -1;

const samePlanet = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function showHistory() {
  undoButton.disabled = cursor <= 0;
  redoButton.disabled = cursor >= past.length - 1;
}

function remember() {
  const snapshot = readPlanet();
  if (cursor >= 0 && samePlanet(past[cursor], snapshot)) return;
  past.splice(cursor + 1, Infinity, snapshot);
  cursor = past.length - 1;
  showHistory();
}

function travel(step) {
  const target = cursor + step;
  if (target < 0 || target >= past.length) return;
  cursor = target;
  presetPicker.value = '';
  load(past[cursor]);
  showHistory();
}

function applyPhysics() {
  const planet = readPlanet();
  const physical = { seed: planet.seed };
  for (const name of PHYSICAL_FIELDS) physical[name] = planet[name];
  writePlanet(derivePlanet(physical));
}

function renderInBackground(planet, size, layer) {
  const worker = new Worker(new URL('./download-worker.js', import.meta.url), { type: 'module' });
  return new Promise((resolve) => {
    worker.onmessage = ({ data }) => {
      worker.terminate();
      resolve(data);
    };
    worker.postMessage({ planet, size, layer });
  });
}

async function download(button) {
  const layer = button.dataset.download;
  const label = button.textContent;
  const planet = readPlanet();
  button.textContent = 'Rendering…';
  button.disabled = true;
  const blob = await renderInBackground(planet, Number(sizePicker.value), layer);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `planet-${planet.seed}-${layer}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href));
  button.textContent = label;
  button.disabled = false;
}

async function copyLink() {
  const label = copyLinkButton.textContent;
  copyLinkButton.textContent = await navigator.clipboard.writeText(location.href).then(
    () => 'Link copied',
    () => 'Copy blocked: use the address bar',
  );
  setTimeout(() => (copyLinkButton.textContent = label), COPIED_LABEL_MS);
}

const typingIn = (target) => target instanceof HTMLInputElement && (target.type === 'number' || target.type === 'text');

PRESETS.forEach((preset, index) => presetPicker.add(new Option(preset.name, index)));

presetPicker.addEventListener('change', () => {
  if (presetPicker.value) load(PRESETS[presetPicker.value].planet);
});

form.addEventListener('input', (event) => {
  if (event.target === presetPicker) return;
  presetPicker.value = '';
  if (PHYSICAL_FIELDS.includes(event.target.name)) applyPhysics();
  update();
});

form.addEventListener('change', remember);
form.addEventListener('submit', (event) => event.preventDefault());

document.querySelector('[data-randomize]').addEventListener('click', () => {
  presetPicker.value = '';
  load(randomPlanet());
  remember();
});

document.querySelector('[data-reroll]').addEventListener('click', () => {
  load({ seed: randomSeed() });
  remember();
});

undoButton.addEventListener('click', () => travel(-1));
redoButton.addEventListener('click', () => travel(1));
copyLinkButton.addEventListener('click', copyLink);

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (!(event.ctrlKey || event.metaKey) || (key !== 'z' && key !== 'y') || typingIn(event.target)) return;
  event.preventDefault();
  travel(key === 'y' || event.shiftKey ? 1 : -1);
});

for (const button of document.querySelectorAll('[data-download]')) {
  button.addEventListener('click', () => download(button));
}

const linked = fromLink(location.hash);
presetPicker.value = linked ? '' : '0';
load({ seed: randomSeed(), ...PRESETS[0].planet, ...linked });
remember();
