import { contextsLearned, createSampler, NEIGHBORS, trainModel } from './model.js';
import { learnPalette, quantize } from './palette.js';
import { loadTrainingSet, PLANET_SIZE, TRAINING_SETS } from './training-set.js';

const ROWS_PER_FRAME = 3;

const form = document.querySelector('[data-controls]');
const realCanvas = document.querySelector('[data-real]');
const imitationCanvas = document.querySelector('[data-imitation]');
const swatches = document.querySelector('[data-palette]');
const neighborList = document.querySelector('[data-neighbor-list]');
const contextsReadout = document.querySelector('[data-contexts]');
const fallbackReadout = document.querySelector('[data-fallback]');
const statusLine = document.querySelector('[data-status]');

for (const canvas of [realCanvas, imitationCanvas]) {
  canvas.width = PLANET_SIZE;
  canvas.height = PLANET_SIZE;
}

for (const [value, label] of Object.entries(TRAINING_SETS)) form.elements.set.add(new Option(label, value));

const loadedSets = new Map();
let planets = [];
let palette = [];
let quantized = [];
let model = null;
let realIndex = 0;
let generation = 0;

const settings = () => ({
  set: form.elements.set.value,
  colors: Number(form.elements.colors.value),
  neighbors: Number(form.elements.neighbors.value),
  ringsOn: form.elements.ringsOn.checked,
  rings: Number(form.elements.rings.value),
  modelView: form.elements.modelView.checked,
});

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  const { neighbors, ringsOn } = settings();
  neighborList.textContent = neighbors ? NEIGHBORS.slice(0, neighbors).map(({ name }) => name).join(', ') : 'none: colors drawn by overall frequency';
  form.elements.rings.closest('label').classList.toggle('pm-off', !ringsOn);
}

function paint(canvas, colorAt) {
  const context = canvas.getContext('2d');
  const image = context.createImageData(PLANET_SIZE, PLANET_SIZE);
  for (let i = 0; i < PLANET_SIZE * PLANET_SIZE; i++) {
    image.data.set(colorAt(i), i * 4);
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function showReal() {
  const planet = planets[realIndex];
  const indices = quantized[realIndex];
  if (settings().modelView) paint(realCanvas, (i) => palette[indices[i]]);
  else paint(realCanvas, (i) => planet.rgb.subarray(i * 3, i * 3 + 3));
}

function showPalette() {
  swatches.replaceChildren(...palette.slice(1).map(([r, g, b]) => {
    const swatch = document.createElement('span');
    swatch.style.background = `rgb(${r}, ${g}, ${b})`;
    return swatch;
  }));
}

function generate() {
  const run = ++generation;
  const sampler = createSampler(model, Math.random);
  const step = () => {
    if (run !== generation) return;
    const done = sampler.sampleRows(ROWS_PER_FRAME);
    paint(imitationCanvas, (i) => palette[sampler.indices[i]]);
    fallbackReadout.value = `${Math.round(sampler.fallbackShare() * 100)}%`;
    if (!done) requestAnimationFrame(step);
  };
  step();
}

function train() {
  const { colors, neighbors, ringsOn, rings } = settings();
  model = trainModel(quantized, { colorCount: palette.length, neighborCount: neighbors, rings: ringsOn ? rings : 0 });
  contextsReadout.value = contextsLearned(model).toLocaleString();
  statusLine.textContent = `Trained on ${planets.length} planets, ${colors} colors.`;
  generate();
}

function learnColors() {
  palette = learnPalette(planets, settings().colors, Math.random);
  quantized = planets.map((planet) => quantize(planet, palette));
  showPalette();
  showReal();
  train();
}

async function switchSet() {
  const { set } = settings();
  statusLine.textContent = 'Loading planets…';
  if (!loadedSets.has(set)) loadedSets.set(set, await loadTrainingSet(set));
  if (set !== settings().set) return;
  planets = loadedSets.get(set);
  realIndex = Math.floor(Math.random() * planets.length);
  learnColors();
}

form.addEventListener('input', (event) => {
  showValues();
  const { name } = event.target;
  if (name === 'set') switchSet();
  else if (name === 'colors') learnColors();
  else train();
});

form.elements.modelView.addEventListener('input', showReal);

form.addEventListener('submit', (event) => event.preventDefault());

document.querySelector('[data-generate]').addEventListener('click', generate);
document.querySelector('[data-next-real]').addEventListener('click', () => {
  realIndex = (realIndex + 1) % planets.length;
  showReal();
});

showValues();
switchSet();
