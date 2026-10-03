import { contextsLearned, createSampler, NEIGHBORS, trainModel } from './model.js';
import { learnPalette, quantize } from './palette.js';
import { loadPyramids, loadTrainingSet, PLANET_SIZE, pyramidDownTo, SEED_SIZE, TRAINING_SETS } from './training-set.js';
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
const painterControls = document.querySelector('[data-painter-controls]');

for (const [value, label] of Object.entries(TRAINING_SETS)) form.elements.set.add(new Option(label, value));

const loadedSets = new Map();
const loadedPyramids = new Map();
let planets = [];
let seedPyramids = [];
let pyramids = [];
let palette = [];
let quantized = [];
let quantizedSeedPyramids = [];
let quantizedPyramids = [];
let model = null;
let seedUpscalers = [];
let upscalers = [];
let realIndex = 0;
let generation = 0;

const settings = () => ({
  set: form.elements.set.value,
  colors: Number(form.elements.colors.value),
  neighbors: Number(form.elements.neighbors.value),
  ringsOn: form.elements.ringsOn.checked,
  rings: Number(form.elements.rings.value),
  start: form.elements.start.value,
  resolution: Number(form.elements.resolution.value),
  modelView: form.elements.modelView.checked,
});

function activeRings() {
  const { ringsOn, rings } = settings();
  return ringsOn ? rings : 0;
}

const stagesFor = (resolution) => Math.log2(resolution / PLANET_SIZE);

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  const { neighbors, ringsOn, start } = settings();
  painterControls.classList.toggle('pm-off', start === 'seed');
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

function describeStage(sampler, upscaled) {
  return upscaled ? `Upscaling to ${sampler.size} px…` : `Painting ${sampler.size} px…`;
}

function seedSampler(random) {
  const indices = quantizedSeedPyramids[Math.floor(random() * quantizedSeedPyramids.length)][0];
  return { size: SEED_SIZE, indices, cursor: indices.length, sampleRows: () => true, fallbackShare: () => 0 };
}

function generate() {
  const run = ++generation;
  const { start, resolution } = settings();
  const random = Math.random;
  const fromSeed = start === 'seed';
  const chain = [...(fromSeed ? seedUpscalers : []), ...upscalers.slice(0, stagesFor(resolution))];
  let sampler = fromSeed ? seedSampler(random) : createSampler(model, random);
  let image = startCanvas(sampler.size);
  let stage = 0;
  statusLine.textContent = describeStage(sampler, false);

  const step = () => {
    if (run !== generation) return;
    const from = sampler.cursor;
    const done = sampler.sampleRows(BASE_ROWS_PER_FRAME * (sampler.size / PLANET_SIZE));
    paintRows(image, sampler, from);
    fallbackReadout.value = `${Math.round(sampler.fallbackShare() * 100)}%`;
    if (done && stage < chain.length) {
      const parent = sampler;
      sampler = createUpscaleSampler(chain[stage++], parent.indices, parent.size, random);
      image = startCanvas(sampler.size, parent);
      statusLine.textContent = describeStage(sampler, true);
    } else if (done) {
      statusLine.textContent = `Done: ${sampler.size} × ${sampler.size} px.`;
      return;
    }
    requestAnimationFrame(step);
  };
  step();
}

function train() {
  model = trainModel(quantized, { colorCount: palette.length, neighborCount: settings().neighbors, rings: activeRings() });
  contextsReadout.value = contextsLearned(model).toLocaleString();
  generate();
}

function trainStages(levelSets) {
  const quantizedLevels = levelSets.map((levels) => levels.map((planet) => quantize(planet, palette)));
  const stageCount = levelSets.length ? levelSets[0].length - 1 : 0;
  const stages = Array.from({ length: stageCount }, (_, stage) => trainUpscaler(
    quantizedLevels.map((levels, pick) => ({ low: levels[stage], high: levels[stage + 1], size: levelSets[pick][stage + 1].size })),
    palette.length,
    activeRings(),
  ));
  return { quantizedLevels, stages };
}

function trainUpscalers() {
  ({ quantizedLevels: quantizedPyramids, stages: upscalers } = trainStages(pyramids));
  ({ quantizedLevels: quantizedSeedPyramids, stages: seedUpscalers } = trainStages(seedPyramids));
  const contexts = [...seedUpscalers, ...upscalers].reduce((sum, upscaler) => sum + upscaler.levels[0].counts.size, 0);
  upscalerReadout.value = contexts.toLocaleString();
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
  seedPyramids = base.map((planet) => pyramidDownTo(planet, SEED_SIZE));
  pyramids = hires;
  realIndex = Math.floor(Math.random() * planets.length);
  learnColors();
}

form.addEventListener('input', (event) => {
  showValues();
  const { name } = event.target;
  if (name === 'set') switchSet();
  else if (name === 'resolution' || name === 'start') {
    if (!pyramids.length && settings().resolution > PLANET_SIZE) switchSet();
    else {
      showReal();
      generate();
    }
  } else if (name === 'colors') learnColors();
  else if (name === 'ringsOn' || name === 'rings') {
    trainUpscalers();
    train();
  } else train();
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
