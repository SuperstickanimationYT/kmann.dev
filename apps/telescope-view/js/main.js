import { TARGETS } from './targets.js';

const PRESETS = {
  'achromat-70': { label: '70 mm f/10 achromat', correction: 'achromat', apertureMm: 70, focalLengthMm: 700, obstructionPct: 0, vanes: 0 },
  'achromat-102-short': { label: '102 mm f/6.5 short-tube achromat', correction: 'achromat', apertureMm: 102, focalLengthMm: 660, obstructionPct: 0, vanes: 0 },
  'achromat-102': { label: '102 mm f/10 achromat', correction: 'achromat', apertureMm: 102, focalLengthMm: 1000, obstructionPct: 0, vanes: 0 },
  'ed-80': { label: '80 mm f/7 ED doublet', correction: 'ed', apertureMm: 80, focalLengthMm: 560, obstructionPct: 0, vanes: 0 },
  'apo-130': { label: '130 mm f/7 apo triplet', correction: 'apo', apertureMm: 130, focalLengthMm: 910, obstructionPct: 0, vanes: 0 },
  'newt-114': { label: '114 mm f/7.9 Newtonian', correction: 'none', apertureMm: 114, focalLengthMm: 900, obstructionPct: 26, vanes: 4, vaneWidthMm: 0.8 },
  'dob-200': { label: '8" f/6 Dobsonian', correction: 'none', apertureMm: 203, focalLengthMm: 1200, obstructionPct: 23, vanes: 4, vaneWidthMm: 1.2 },
  'dob-300': { label: '12" f/5 Dobsonian', correction: 'none', apertureMm: 305, focalLengthMm: 1525, obstructionPct: 21, vanes: 4, vaneWidthMm: 1.5 },
  'sct-200': { label: '8" f/10 Schmidt-Cassegrain', correction: 'none', apertureMm: 203, focalLengthMm: 2032, obstructionPct: 34, vanes: 0 },
  'mak-127': { label: '127 mm f/12 Maksutov', correction: 'none', apertureMm: 127, focalLengthMm: 1500, obstructionPct: 30, vanes: 0 },
};
const PRESET_DEFAULTS = { vaneWidthMm: 1, sphericalWaves: 0.04, comaWaves: 0, astigWaves: 0 };

const canvas = document.querySelector('[data-view]');
const context = canvas.getContext('2d');
const form = document.querySelector('[data-controls]');
const presetSelect = document.querySelector('[data-preset]');
const readout = document.querySelector('[data-readout]');
const status = document.querySelector('[data-status]');
const frameCanvas = document.createElement('canvas');
const frameContext = frameCanvas.getContext('2d');

const WORKER_COUNT = Math.min(Math.max((navigator.hardwareConcurrency || 2) - 1, 1), 3);
const idleWorkers = Array.from({ length: WORKER_COUNT }, () => {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => receiveFrame(worker, data);
  return worker;
});
let latestFrame = null;
let dirty = true;
let strehl = null;
let requestId = 0;
let shownRequestId = 0;
const startedAt = performance.now();

for (const [id, target] of Object.entries(TARGETS)) form.targetId.add(new Option(target.name, id));
for (const [id, preset] of Object.entries(PRESETS)) presetSelect.add(new Option(preset.label, id));
presetSelect.add(new Option('Custom', 'custom'));

function applyPreset(id) {
  const preset = { ...PRESET_DEFAULTS, ...PRESETS[id] };
  for (const [name, value] of Object.entries(preset)) {
    if (form.elements[name]) form.elements[name].value = value;
  }
}

function readSettings() {
  const number = (name) => Number(form.elements[name].value);
  return {
    targetId: form.targetId.value,
    separationArcsec: number('separationArcsec'),
    ringTiltDeg: number('ringTiltDeg'),
    venusPhase: number('venusPhase'),
    scope: {
      correction: form.correction.value,
      apertureMm: Math.min(Math.max(number('apertureMm') || 100, 40), 500),
      focalLengthMm: Math.min(Math.max(number('focalLengthMm') || 1000, 200), 5000),
      obstruction: number('obstructionPct') / 100,
      vanes: number('vanes'),
      vaneWidthMm: number('vaneWidthMm') || 1,
      sphericalWaves: number('sphericalWaves'),
      comaWaves: number('comaWaves'),
      astigWaves: number('astigWaves'),
    },
    eyepieceMm: Math.max(number('eyepieceMm') || 10, 2),
    afovDeg: number('afovDeg'),
    focusWaves: number('focusWaves'),
    seeingArcsec: number('seeingArcsec'),
    altitudeDeg: number('altitudeDeg'),
    live: form.live.checked,
    zoom: number('zoom'),
  };
}

function formatOutputs() {
  for (const input of form.querySelectorAll('input[type="range"]')) {
    const output = input.closest('label').querySelector('output');
    if (!output) continue;
    const value = Number(input.value);
    output.textContent = input.name === 'zoom' ? `${value}×` : input.name === 'venusPhase' ? `${Math.round(value * 100)}%` : String(value);
  }
  const targetId = form.targetId.value;
  for (const element of form.querySelectorAll('[data-show-for]')) element.hidden = element.dataset.showFor !== targetId;
}

function describe(settings) {
  const { scope } = settings;
  const magnification = scope.focalLengthMm / settings.eyepieceMm;
  const exitPupil = scope.apertureMm / magnification;
  const focalRatio = scope.focalLengthMm / scope.apertureMm;
  const rows = [
    ['Magnification', `${magnification.toFixed(0)}×`, magnification > scope.apertureMm * 2],
    ['Exit pupil', `${exitPupil.toFixed(2)} mm`, exitPupil > 7 || exitPupil < 0.5],
    ['True field', `${((settings.afovDeg / magnification) * 60).toFixed(1)}′`],
    ['Focal ratio', `f/${focalRatio.toFixed(1)}`],
    ['Dawes limit', `${(116 / scope.apertureMm).toFixed(2)}″`],
    ['Max useful power', `${(scope.apertureMm * 2).toFixed(0)}×`],
  ];
  if (scope.correction !== 'none') {
    const colourIndex = focalRatio / (scope.apertureMm / 25.4);
    const label = scope.correction === 'achromat' ? colourIndex.toFixed(1) : 'corrected';
    rows.push(['False colour index', label, scope.correction === 'achromat' && colourIndex < 3]);
  }
  if (strehl !== null) rows.push(['Strehl (no air)', strehl.toFixed(2), strehl < 0.8]);
  readout.replaceChildren(
    ...rows.flatMap(([term, value, warn]) => {
      const dt = document.createElement('dt');
      dt.textContent = term;
      const dd = document.createElement('dd');
      dd.textContent = value;
      if (warn) dd.className = 'tv-warn';
      return [dt, dd];
    }),
  );
}

function requestFrames() {
  while (idleWorkers.length > 0) {
    const settings = readSettings();
    if (!dirty && !(settings.live && settings.seeingArcsec > 0)) return;
    const wantStrehl = dirty;
    dirty = false;
    requestId += 1;
    idleWorkers.pop().postMessage({ ...settings, timeS: (performance.now() - startedAt) / 1000, wantStrehl, requestId });
  }
}

function receiveFrame(worker, data) {
  idleWorkers.push(worker);
  if (data.error) {
    status.textContent = data.error;
    return;
  }
  if (data.requestId < shownRequestId) {
    requestFrames();
    return;
  }
  shownRequestId = data.requestId;
  latestFrame = data;
  if (data.strehl !== null) strehl = data.strehl;
  frameCanvas.width = data.n;
  frameCanvas.height = data.n;
  frameContext.putImageData(new ImageData(data.pixels, data.n, data.n), 0, 0);
  status.textContent = `${data.n}×${data.n} grid at ${data.pixelArcsec.toFixed(2)}″ per pixel · ${data.renderMs.toFixed(0)} ms`;
  describe(readSettings());
  draw();
  requestFrames();
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  draw();
}

function draw() {
  const settings = readSettings();
  const { width, height } = canvas;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  const fieldRadius = Math.min(width, height) * 0.46 * settings.zoom;
  const cx = width / 2;
  const cy = height / 2;
  context.save();
  context.beginPath();
  context.arc(cx, cy, fieldRadius, 0, Math.PI * 2);
  context.fillStyle = '#05070b';
  context.fill();
  context.clip();
  if (latestFrame) {
    const magnification = settings.scope.focalLengthMm / settings.eyepieceMm;
    const apparentArcsecPerScreenPixel = (settings.afovDeg * 3600) / (2 * fieldRadius);
    const scale = (latestFrame.pixelArcsec * magnification) / apparentArcsecPerScreenPixel;
    const size = latestFrame.n * scale;
    context.globalCompositeOperation = 'lighter';
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(frameCanvas, cx - size / 2, cy - size / 2, size, size);
    context.globalCompositeOperation = 'source-over';
  }
  context.restore();
}

presetSelect.addEventListener('change', () => {
  if (presetSelect.value !== 'custom') applyPreset(presetSelect.value);
  formatOutputs();
  dirty = true;
  requestFrames();
});

form.addEventListener('input', (event) => {
  const scopeFields = ['correction', 'apertureMm', 'focalLengthMm', 'obstructionPct', 'vanes', 'vaneWidthMm'];
  if (scopeFields.includes(event.target.name)) presetSelect.value = 'custom';
  formatOutputs();
  if (event.target.name === 'zoom') {
    draw();
    return;
  }
  dirty = true;
  describe(readSettings());
  requestFrames();
});

form.addEventListener('submit', (event) => event.preventDefault());
window.addEventListener('resize', resize);

presetSelect.value = 'dob-200';
applyPreset('dob-200');
formatOutputs();
describe(readSettings());
resize();
requestFrames();
