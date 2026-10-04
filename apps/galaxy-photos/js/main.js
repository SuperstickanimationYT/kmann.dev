import { createRenderer } from './renderer.js';
import { PRESETS, presetSettings, randomGalaxy } from './presets.js';
import { randomSeed } from './random.js';

const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 768;
const COPIED_LABEL_MS = 1500;
const TEXT_FIELDS = ['telescope'];
const CAMERA_FIELDS = ['telescope', 'exposure', 'stretch', 'noise', 'saturation', 'stars', 'background', 'resolved'];

const form = document.querySelector('[data-controls]');
const presetPicker = document.querySelector('[data-preset]');
const sizePicker = document.querySelector('[data-size]');
const preview = document.querySelector('[data-preview]');
const status = document.querySelector('[data-status]');
const downloadButton = document.querySelector('[data-download]');
const copyLinkButton = document.querySelector('[data-copy-link]');

preview.width = PREVIEW_WIDTH;
preview.height = PREVIEW_HEIGHT;

const settingFields = () => [...form.elements].filter((field) => field.name);
const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

function readSettings() {
  const settings = {};
  for (const field of settingFields()) {
    settings[field.name] = TEXT_FIELDS.includes(field.name) ? field.value : Number(field.value);
  }
  return settings;
}

function writeSettings(settings) {
  for (const [name, value] of Object.entries(settings)) {
    const field = form.elements[name];
    if (field) field.value = value;
  }
}

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
}

function toLink(settings) {
  return `#${new URLSearchParams(Object.entries(settings))}`;
}

function fromLink(hash) {
  const params = new URLSearchParams(hash.slice(1));
  const settings = {};
  for (const field of settingFields()) {
    if (!params.has(field.name)) continue;
    const value = params.get(field.name);
    if (TEXT_FIELDS.includes(field.name)) settings[field.name] = value;
    else if (Number.isFinite(Number(value))) settings[field.name] = Number(value);
  }
  return Object.keys(settings).length ? settings : null;
}

function cameraOf(settings) {
  return Object.fromEntries(CAMERA_FIELDS.map((name) => [name, settings[name]]));
}

function showStatus(message) {
  status.hidden = !message;
  status.textContent = message ?? '';
}

const renderer = createRenderer(preview);
let job = null;
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  while (job) {
    const current = job;
    const { done } = current.next();
    if (done && job === current) job = null;
    await nextFrame();
  }
  pumping = false;
}

function redraw() {
  const settings = readSettings();
  showValues();
  window.history.replaceState(null, '', toLink(settings));
  if (!renderer) return;
  job = renderer.render(settings, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  pump();
}

function apply(settings) {
  writeSettings(settings);
  redraw();
}

function choosePreset(name) {
  presetPicker.value = name;
  apply({ ...presetSettings(name, readSettings().seed), ...cameraOf(readSettings()) });
}

for (const [name, { label }] of Object.entries(PRESETS)) {
  presetPicker.add(new Option(label, name));
}

presetPicker.addEventListener('change', () => {
  if (presetPicker.value) choosePreset(presetPicker.value);
});

form.addEventListener('input', (event) => {
  if (!CAMERA_FIELDS.includes(event.target.name) && event.target.name !== 'seed') presetPicker.value = '';
  redraw();
});

document.querySelector('[data-randomize]').addEventListener('click', () => {
  presetPicker.value = '';
  apply(randomGalaxy(randomSeed(), cameraOf(readSettings())));
});

document.querySelector('[data-reroll]').addEventListener('click', () => {
  apply({ ...readSettings(), seed: randomSeed() });
});

downloadButton.addEventListener('click', async () => {
  if (!renderer) return;
  const width = Number(sizePicker.value);
  const height = (width * 3) / 4;
  const settings = readSettings();
  downloadButton.disabled = true;
  form.inert = true;
  job = null;
  showStatus(`Rendering ${width} × ${height}…`);
  try {
    const blob = await renderer.renderToBlob(settings, width, height, nextFrame);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `galaxy-${settings.seed}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    downloadButton.disabled = false;
    form.inert = false;
    showStatus(null);
    redraw();
  }
});

copyLinkButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(window.location.href);
  const label = copyLinkButton.textContent;
  copyLinkButton.textContent = 'Copied';
  window.setTimeout(() => {
    copyLinkButton.textContent = label;
  }, COPIED_LABEL_MS);
});

if (!renderer) {
  showStatus('This page needs WebGL2 with float render targets, which this browser does not offer.');
  downloadButton.disabled = true;
}

const linked = fromLink(window.location.hash);
if (linked) {
  writeSettings({ ...presetSettings('grand', 1), ...linked });
  redraw();
} else {
  presetPicker.value = 'grand';
  apply(presetSettings('grand', 1));
}
