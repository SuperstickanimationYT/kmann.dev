import { contextsLearned, createSampler, NEIGHBORS, trainModel } from './model.js';
import { learnPalette, quantize } from './palette.js';
import { findCutOff } from './paths.js';
import { loadCredits, loadPyramids, loadTrainingSet, PLANET_SIZE, pyramidDownTo, SEED_SIZE, TRAINING_SETS } from './training-set.js';
import { createUpscaleSampler, trainUpscaler } from './upscaler.js';

const BASE_ROWS_PER_FRAME = 3;
const CUT_OFF_COLOR = [224, 72, 58];

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
const setCaption = document.querySelector('[data-set-caption]');
const roundControls = document.querySelector('[data-round-controls]');
const pathControls = document.querySelector('[data-path-controls]');
const cutOffReadout = document.querySelector('[data-cut-off]');
const realLabel = document.querySelector('[data-real-label]');
const realCredit = document.querySelector('[data-real-credit]');
const creditList = document.querySelector('[data-credit-list]');

const groups = new Map();
for (const [value, { group, label }] of Object.entries(TRAINING_SETS)) {
  if (!groups.has(group)) groups.set(group, form.elements.set.appendChild(Object.assign(document.createElement('optgroup'), { label: group })));
  groups.get(group).append(new Option(label, value));
}

const loadedSets = new Map();
const loadedPyramids = new Map();
const loadedCredits = new Map();
let pictures = [];
let seedPyramids = [];
let pyramids = [];
let credits = null;
let palette = [];
let quantized = [];
let quantizedSeedPyramids = [];
let quantizedPyramids = [];
let model = null;
let seedUpscalers = [];
let upscalers = [];
let realIndex = 0;
let generation = 0;
let finished = null;

const settings = () => ({
  set: form.elements.set.value,
  colors: Number(form.elements.colors.value),
  neighbors: Number(form.elements.neighbors.value),
  ringsOn: form.elements.ringsOn.checked,
  rings: Number(form.elements.rings.value),
  start: form.elements.start.value,
  forceDisk: form.elements.forceDisk.checked,
  checkPaths: form.elements.checkPaths.checked,
  resolution: Number(form.elements.resolution.value),
  modelView: form.elements.modelView.checked,
});

const currentSet = () => TRAINING_SETS[settings().set];

function activeRings() {
  const { ringsOn, rings } = settings();
  return ringsOn ? rings : 0;
}

const showingPaths = () => currentSet().pathCheck && settings().checkPaths;

const stagesFor = (resolution) => Math.log2(resolution / PLANET_SIZE);

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    range.closest('label').querySelector('output').value = range.value;
  }
  const { neighbors, ringsOn, start } = settings();
  const set = currentSet();
  painterControls.classList.toggle('pm-off', start === 'seed');
  neighborList.textContent = neighbors ? NEIGHBORS.slice(0, neighbors).map(({ name }) => name).join(', ') : 'none: colors drawn by overall frequency';
  form.elements.rings.closest('label').classList.toggle('pm-off', !ringsOn);
  roundControls.hidden = !set.round;
  pathControls.hidden = !set.pathCheck;
  setCaption.textContent = set.caption ?? '';
  realLabel.textContent = `Real ${set.noun}`;
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

function paintWithPaths(canvas, indices, size) {
  const { cutOff, share } = findCutOff(indices, size, palette);
  paint(canvas, size, (i) => (cutOff[i] ? CUT_OFF_COLOR : palette[indices[i]]));
  return share;
}

const percent = (share) => `${Math.round(share * 100)}%`;

function showCutOff(realShare, imitationShare) {
  cutOffReadout.textContent = `Cut off from the main maze: real ${percent(realShare)}, imitation ${imitationShare === null ? '…' : percent(imitationShare)}`;
}

function realPictureShown() {
  const { resolution } = settings();
  if (resolution === PLANET_SIZE) return { picture: pictures[realIndex], indices: quantized[realIndex], credit: credits?.[realIndex] };
  const pick = realIndex % pyramids.length;
  return {
    picture: pyramids[pick][stagesFor(resolution)],
    indices: quantizedPyramids[pick][stagesFor(resolution)],
    credit: credits?.find((entry) => entry.hires === `hires-${pick}.png`),
  };
}

function creditLink({ name, credit, source }) {
  const link = Object.assign(document.createElement('a'), { href: source, textContent: name, target: '_blank', rel: 'noopener' });
  return [link, `: ${credit}`];
}

function showReal() {
  const { picture, indices, credit } = realPictureShown();
  if (showingPaths()) showCutOff(paintWithPaths(realCanvas, indices, picture.size), finished?.share ?? null);
  else if (settings().modelView) paint(realCanvas, picture.size, (i) => palette[indices[i]]);
  else paint(realCanvas, picture.size, (i) => picture.rgb.subarray(i * 3, i * 3 + 3));
  realCredit.hidden = !credit;
  if (credit) realCredit.replaceChildren(...creditLink(credit));
}

function showCredits() {
  creditList.closest('details').hidden = !credits;
  if (!credits) return;
  creditList.replaceChildren(...credits.map((entry) => {
    const item = document.createElement('li');
    item.append(...creditLink(entry));
    return item;
  }));
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

function showFinished() {
  if (!showingPaths()) {
    paint(imitationCanvas, finished.size, (i) => palette[finished.indices[i]]);
    return;
  }
  finished.share = paintWithPaths(imitationCanvas, finished.indices, finished.size);
  showReal();
}

function generate() {
  const run = ++generation;
  const { start, resolution, forceDisk } = settings();
  const random = Math.random;
  const fromSeed = start === 'seed';
  const roundOutline = forceDisk && currentSet().round;
  const chain = [...(fromSeed ? seedUpscalers : []), ...upscalers.slice(0, stagesFor(resolution))];
  let sampler = fromSeed ? seedSampler(random) : createSampler(model, random, roundOutline);
  let image = startCanvas(sampler.size);
  let stage = 0;
  finished = null;
  if (showingPaths()) showReal();
  statusLine.textContent = describeStage(sampler, false);

  const step = () => {
    if (run !== generation) return;
    const from = sampler.cursor;
    const done = sampler.sampleRows(BASE_ROWS_PER_FRAME * (sampler.size / PLANET_SIZE));
    paintRows(image, sampler, from);
    fallbackReadout.value = `${Math.round(sampler.fallbackShare() * 100)}%`;
    if (done && stage < chain.length) {
      const parent = sampler;
      sampler = createUpscaleSampler(chain[stage++], parent.indices, parent.size, random, roundOutline);
      image = startCanvas(sampler.size, parent);
      statusLine.textContent = describeStage(sampler, true);
    } else if (done) {
      finished = { indices: sampler.indices, size: sampler.size };
      showFinished();
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
  const quantizedLevels = levelSets.map((levels) => levels.map((picture) => quantize(picture, palette)));
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
  palette = learnPalette(pictures, settings().colors, Math.random);
  quantized = pictures.map((picture) => quantize(picture, palette));
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
  statusLine.textContent = 'Loading pictures…';
  const wantsPyramids = resolution > PLANET_SIZE;
  const [base, hires, setCredits] = await Promise.all([
    loadCached(loadedSets, set, loadTrainingSet),
    wantsPyramids ? loadCached(loadedPyramids, set, loadPyramids) : [],
    loadCached(loadedCredits, set, loadCredits),
  ]);
  if (set !== settings().set || resolution !== settings().resolution) return;
  pictures = base;
  seedPyramids = base.map((picture) => pyramidDownTo(picture, SEED_SIZE));
  pyramids = hires;
  credits = setCredits;
  realIndex = Math.floor(Math.random() * pictures.length);
  showCredits();
  learnColors();
}

function applySuggestedSettings() {
  const { colors, suggested = {} } = currentSet();
  form.elements.colors.value = colors;
  if (suggested.start) form.elements.start.value = suggested.start;
  if (suggested.ringsOn !== undefined) form.elements.ringsOn.checked = suggested.ringsOn;
}

form.addEventListener('input', (event) => {
  const { name } = event.target;
  if (name === 'set') applySuggestedSettings();
  showValues();
  if (name === 'set') switchSet();
  else if (name === 'forceDisk') generate();
  else if (name === 'checkPaths') {
    showReal();
    if (finished) showFinished();
  } else if (name === 'resolution' || name === 'start') {
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
  const shownCount = settings().resolution > PLANET_SIZE ? pyramids.length : pictures.length;
  realIndex = (realIndex + 1) % shownCount;
  showReal();
});

showValues();
switchSet();
