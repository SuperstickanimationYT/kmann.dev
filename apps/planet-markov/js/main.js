import { contextsLearned, createSampler, NEIGHBORS, trainModel } from './model.js';
import { learnPalette, quantize } from './palette.js';
import { loadPyramids, loadTrainingSet, PLANET_SIZE, TRAINING_SETS } from './training-set.js';
import { createUpscaleSampler, trainUpscaler } from './upscaler.js';

const BASE_ROWS_PER_FRAME = 3;

const form = document.querySelector('[data-controls]');
const realCanvas = document.querySelector('[data-real]');
const imitationCanvas = document.querySelector('[data-imitation]');
const swatches = document.querySelector('[data-palette]');
const neighborList = document.querySelector('[data-neighbor-list]');
const contextsReadout = document.querySelector('[data-contexts]');
const upscalerReadout = document.querySelector('[data-upscaler-contexts]');
const fallbackReadout = document.querySelector('[data-fallback]');
const statusLine = document.querySelector('[data-status]');

for (const [value, label] of Object.entries(TRAINING_SETS)) form.elements.set.add(new Option(label, value));

const loadedSets = new Map();
const loadedPyramids = new Map();
let planets = [];
let pyramids = [];
let palette = [];
let quantized = [];
let quantizedPyramids = [];
let model = null;
let upscalers = [];
let realIndex = 0;
let generation = 0;

const settings = () => ({
  set: form.elements.set.value,
  colors: Number(form.elements.colors.value),
  neighbors: Number(form.elements.neighbors.value),
  ringsOn: form.elements.ringsOn.checked,
  rings: Number(form.elements.rings.value),
  resolution: Number(form.elements.resolution.value),
  modelView: form.elements.modelView.checked,
});

const stagesFor = (resolution) => Math.log2(resolution / PLANET_SIZE);

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  const { neighbors, ringsOn } = settings();
  neighborList.textContent = neighbors ? NEIGHBORS.slice(0, neighbors).map(({ name }) => name).join(', ') : 'none: colors drawn by overall frequency';
  form.elements.rings.closest('label').classList.toggle('pm-off', !ringsOn);
}

function resizeCanvas(canvas, size) {
  canvas.width = size;
  canvas.height = size;
  canvas.classList.toggle('pm-blocky', size < canvas.clientWidth);
}

function paint(canvas, size, colorAt) {
  resizeCanvas(canvas, size);
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    image.data.set(colorAt(i), i * 4);
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function realPlanetShown() {
  const { resolution } = settings();
  if (resolution === PLANET_SIZE) return { planet: planets[realIndex], indices: quantized[realIndex] };
  const pick = realIndex % pyramids.length;
  const level = stagesFor(resolution);
  return { planet: pyramids[pick][level], indices: quantizedPyramids[pick][level] };
}

function showReal() {
  const { planet, indices } = realPlanetShown();
  if (settings().modelView) paint(realCanvas, planet.size, (i) => palette[indices[i]]);
  else paint(realCanvas, planet.size, (i) => planet.rgb.subarray(i * 3, i * 3 + 3));
}

function showPalette() {
  swatches.replaceChildren(...palette.slice(1).map(([r, g, b]) => {
    const swatch = document.createElement('span');
    swatch.style.background = `rgb(${r}, ${g}, ${b})`;
    return swatch;
  }));
}

function startCanvas(size, parent) {
  resizeCanvas(imitationCanvas, size);
  const image = imitationCanvas.getContext('2d').createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const color = parent ? palette[parent.indices[((Math.floor(i / size) >> 1) * parent.size) + ((i % size) >> 1)]] : palette[0];
    image.data.set(color, i * 4);
    image.data[i * 4 + 3] = 255;
  }
  return image;
}

function paintRows(image, sampler, from) {
  for (let i = from; i < sampler.cursor; i++) image.data.set(palette[sampler.indices[i]], i * 4);
  imitationCanvas.getContext('2d').putImageData(image, 0, 0);
}

function describeStage(sampler) {
  return sampler.size === PLANET_SIZE ? `Painting ${PLANET_SIZE} px…` : `Upscaling to ${sampler.size} px…`;
}

function generate() {
  const run = ++generation;
  const stages = stagesFor(settings().resolution);
  const random = Math.random;
  let sampler = createSampler(model, random);
  let image = startCanvas(sampler.size);
  let stage = 0;
  statusLine.textContent = describeStage(sampler);

  const step = () => {
    if (run !== generation) return;
    const from = sampler.cursor;
    const done = sampler.sampleRows(BASE_ROWS_PER_FRAME * (sampler.size / PLANET_SIZE));
    paintRows(image, sampler, from);
    fallbackReadout.value = `${Math.round(sampler.fallbackShare() * 100)}%`;
    if (done && stage < stages) {
      const parent = sampler;
      sampler = createUpscaleSampler(upscalers[stage++], parent.indices, parent.size, random);
      image = startCanvas(sampler.size, parent);
      statusLine.textContent = describeStage(sampler);
    } else if (done) {
      statusLine.textContent = `Done: ${sampler.size} × ${sampler.size} px.`;
      return;
    }
    requestAnimationFrame(step);
  };
  step();
}

function train() {
  const { neighbors, ringsOn, rings } = settings();
  model = trainModel(quantized, { colorCount: palette.length, neighborCount: neighbors, rings: ringsOn ? rings : 0 });
  contextsReadout.value = contextsLearned(model).toLocaleString();
  generate();
}

function trainUpscalers() {
  quantizedPyramids = pyramids.map((levels) => levels.map((planet) => quantize(planet, palette)));
  const stageCount = pyramids.length ? pyramids[0].length - 1 : 0;
  upscalers = Array.from({ length: stageCount }, (_, stage) => trainUpscaler(
    quantizedPyramids.map((levels, pick) => ({ low: levels[stage], high: levels[stage + 1], size: pyramids[pick][stage + 1].size })),
    palette.length,
  ));
  upscalerReadout.value = upscalers.reduce((sum, upscaler) => sum + upscaler.levels[0].counts.size, 0).toLocaleString();
}

function learnColors() {
  palette = learnPalette(planets, settings().colors, Math.random);
  quantized = planets.map((planet) => quantize(planet, palette));
  trainUpscalers();
  showPalette();
  showReal();
  train();
}

async function loadCached(cache, key, load) {
  if (!cache.has(key)) cache.set(key, await load(key));
  return cache.get(key);
}

async function switchSet() {
  const { set, resolution } = settings();
  statusLine.textContent = 'Loading planets…';
  const wantsPyramids = resolution > PLANET_SIZE;
  const [base, hires] = await Promise.all([
    loadCached(loadedSets, set, loadTrainingSet),
    wantsPyramids ? loadCached(loadedPyramids, set, loadPyramids) : [],
  ]);
  if (set !== settings().set || resolution !== settings().resolution) return;
  planets = base;
  pyramids = hires;
  realIndex = Math.floor(Math.random() * planets.length);
  learnColors();
}

form.addEventListener('input', (event) => {
  showValues();
  const { name } = event.target;
  if (name === 'set') switchSet();
  else if (name === 'resolution') {
    if (!pyramids.length && settings().resolution > PLANET_SIZE) switchSet();
    else {
      showReal();
      generate();
    }
  } else if (name === 'colors') learnColors();
  else train();
});

form.addEventListener('submit', (event) => event.preventDefault());
form.elements.modelView.addEventListener('input', showReal);

document.querySelector('[data-generate]').addEventListener('click', generate);
document.querySelector('[data-next-real]').addEventListener('click', () => {
  realIndex = (realIndex + 1) % planets.length;
  showReal();
});

showValues();
switchSet();
