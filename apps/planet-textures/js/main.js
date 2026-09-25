import { loadSprites, renderPlanet } from './planet.js';
import { PRESETS, randomPlanet, randomSeed } from './presets.js';

const PREVIEW_SIZE = 720;
const TEXT_FIELDS = ['baseColor', 'landColor'];
const FLAG_FIELDS = ['land'];

const form = document.querySelector('[data-controls]');
const presetPicker = document.querySelector('[data-preset]');
const sizePicker = document.querySelector('[data-size]');
const preview = document.querySelector('[data-preview]');
const cloudsDownload = document.querySelector('[data-download="clouds"]');
const landFieldset = form.elements.land.closest('fieldset');

preview.width = PREVIEW_SIZE;
preview.height = PREVIEW_SIZE;

function readPlanet() {
  const planet = {};
  for (const field of form.elements) {
    if (!field.name) continue;
    if (FLAG_FIELDS.includes(field.name)) planet[field.name] = field.checked;
    else if (TEXT_FIELDS.includes(field.name)) planet[field.name] = field.value;
    else planet[field.name] = Number(field.value);
  }
  return planet;
}

function writePlanet(planet) {
  for (const [name, value] of Object.entries(planet)) {
    const field = form.elements[name];
    if (FLAG_FIELDS.includes(name)) field.checked = value;
    else field.value = value;
  }
}

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  landFieldset.classList.toggle('ptg-off', !form.elements.land.checked);
}

function flatten({ surface, clouds }, canvas) {
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(surface, 0, 0, canvas.width, canvas.height);
  context.drawImage(clouds, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function planetCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

const sprites = await loadSprites();
let pendingFrame = 0;

function draw() {
  pendingFrame = 0;
  const planet = readPlanet();
  flatten(renderPlanet(planet, PREVIEW_SIZE, sprites), preview);
  cloudsDownload.disabled = planet.clouds === 0;
}

function update() {
  showValues();
  if (!pendingFrame) pendingFrame = requestAnimationFrame(draw);
}

function load(planet) {
  writePlanet(planet);
  update();
}

const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

async function download(button) {
  const layer = button.dataset.download;
  const label = button.textContent;
  button.textContent = 'Rendering…';
  await nextPaint();
  const planet = readPlanet();
  const size = Number(sizePicker.value);
  const layers = renderPlanet(planet, size, sprites);
  const canvas = layer === 'planet' ? flatten(layers, planetCanvas(size)) : layers[layer];
  canvas.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `planet-${planet.seed}-${layer}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href));
    button.textContent = label;
  }, 'image/png');
}

PRESETS.forEach((preset, index) => presetPicker.add(new Option(preset.name, index)));

presetPicker.addEventListener('change', () => {
  if (presetPicker.value) load(PRESETS[presetPicker.value].planet);
});

form.addEventListener('input', (event) => {
  if (event.target === presetPicker) return;
  presetPicker.value = '';
  update();
});

form.addEventListener('submit', (event) => event.preventDefault());

document.querySelector('[data-randomize]').addEventListener('click', () => {
  presetPicker.value = '';
  load(randomPlanet());
});

document.querySelector('[data-reroll]').addEventListener('click', () => load({ seed: randomSeed() }));

for (const button of document.querySelectorAll('[data-download]')) {
  button.addEventListener('click', () => download(button));
}

presetPicker.value = '0';
load({ seed: randomSeed(), ...PRESETS[0].planet });
