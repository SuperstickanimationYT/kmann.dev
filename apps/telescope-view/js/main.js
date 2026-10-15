import { TARGETS, TARGET_GROUPS, hasDetailLayer } from './targets.js';

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
const SKY_NAMES = [
  [17.5, 'city'],
  [19, 'suburb'],
  [20.4, 'outer suburb'],
  [21.3, 'rural'],
  [99, 'very dark'],
];
const GRAIN_TILE = 128;
const GRAIN_FPS = 18;

const canvas = document.querySelector('[data-view]');
const context = canvas.getContext('2d');
const form = document.querySelector('[data-controls]');
const presetSelect = document.querySelector('[data-preset]');
const readout = document.querySelector('[data-readout]');
const status = document.querySelector('[data-status]');

function makeCanvas() {
  const element = document.createElement('canvas');
  return { element, context: element.getContext('2d') };
}

const layers = { wide: makeCanvas(), detail: makeCanvas() };
const grain = makeCanvas();
grain.element.width = GRAIN_TILE;
grain.element.height = GRAIN_TILE;

function moduleWorker() {
  return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
}

const wideWorker = moduleWorker();
const idleDetailWorkers = [moduleWorker(), moduleWorker()];
let wideBusy = false;
let wideDirty = true;
let detailDirty = true;
let requestId = 0;
let shownDetailId = 0;
const frames = { wide: null, detail: null };
let strehl = null;
const pageOpenedAt = Date.now();
const startedAt = performance.now();

for (const [label, ids] of TARGET_GROUPS) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const id of ids) group.append(new Option(TARGETS[id].name, id));
  form.targetId.append(group);
}
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
    moonAgeDays: number('moonAgeDays'),
    epochMs: pageOpenedAt + number('hoursFromNow') * 3600000,
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
    sqm: number('sqm'),
    eyePupilMm: number('eyePupilMm'),
    averted: form.averted.checked,
    live: form.live.checked,
    zoom: number('zoom'),
  };
}

function skyName(sqm) {
  return SKY_NAMES.find(([limit]) => sqm < limit)[1];
}

function formatOutput(input) {
  const value = Number(input.value);
  if (input.name === 'zoom') return `${value}×`;
  if (input.name === 'venusPhase') return `${Math.round(value * 100)}%`;
  if (input.name === 'sqm') return `${value.toFixed(1)} (${skyName(value)})`;
  if (input.name === 'hoursFromNow') {
    const when = new Date(pageOpenedAt + value * 3600000);
    return when.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  }
  return String(value);
}

function formatOutputs() {
  for (const input of form.querySelectorAll('input[type="range"]')) {
    const output = input.closest('label').querySelector('output');
    if (output) output.textContent = formatOutput(input);
  }
  const targetId = form.targetId.value;
  for (const element of form.querySelectorAll('[data-show-for]')) element.hidden = !element.dataset.showFor.split(' ').includes(targetId);
  form.querySelector('[data-live-only]').hidden = !hasDetailLayer(targetId);
}

function describe(settings) {
  const { scope } = settings;
  const magnification = scope.focalLengthMm / settings.eyepieceMm;
  const exitPupil = scope.apertureMm / magnification;
  const focalRatio = scope.focalLengthMm / scope.apertureMm;
  const rows = [
    ['Magnification', `${magnification.toFixed(0)}×`, magnification > scope.apertureMm * 2],
    ['Exit pupil', `${exitPupil.toFixed(2)} mm`, exitPupil > settings.eyePupilMm || exitPupil < 0.5],
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
  if (frames.wide) {
    rows.push(['Your eye', frames.wide.vision.label]);
    rows.push(['Eye resolution', `${frames.wide.vision.acuityArcmin.toFixed(1)}′`, frames.wide.vision.acuityArcmin > 3]);
  }
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

function liveSeeing(settings) {
  return hasDetailLayer(settings.targetId) && settings.live && settings.seeingArcsec > 0;
}

function requestFrames() {
  const settings = readSettings();
  const timeS = (performance.now() - startedAt) / 1000;
  if (wideDirty && !wideBusy) {
    wideBusy = true;
    wideDirty = false;
    status.textContent = 'Rendering the field…';
    requestId += 1;
    wideWorker.postMessage({ ...settings, layer: 'wide', timeS, wantStrehl: !hasDetailLayer(settings.targetId), requestId });
  }
  if (!hasDetailLayer(settings.targetId)) return;
  while (idleDetailWorkers.length > 0 && (detailDirty || liveSeeing(settings))) {
    const wantStrehl = detailDirty;
    detailDirty = false;
    requestId += 1;
    idleDetailWorkers.pop().postMessage({ ...readSettings(), layer: 'detail', timeS, wantStrehl, requestId });
  }
}

function storeFrame(data) {
  const layer = layers[data.layer];
  layer.element.width = data.n;
  layer.element.height = data.n;
  layer.context.putImageData(new ImageData(data.pixels, data.n, data.n), 0, 0);
  if (data.layer === 'detail') {
    const half = data.n / 2;
    const fade = layer.context.createRadialGradient(half, half, half * 0.7, half, half, half * 0.95);
    fade.addColorStop(0, 'rgba(0,0,0,1)');
    fade.addColorStop(1, 'rgba(0,0,0,0)');
    layer.context.globalCompositeOperation = 'destination-in';
    layer.context.fillStyle = fade;
    layer.context.fillRect(0, 0, data.n, data.n);
    layer.context.globalCompositeOperation = 'source-over';
  }
  frames[data.layer] = data;
  if (data.strehl !== null) strehl = data.strehl;
}

function receive(data, worker) {
  if (data.layer === 'wide') wideBusy = false;
  else idleDetailWorkers.push(worker);
  if (data.error) {
    status.textContent = data.error;
  } else if (data.layer === 'wide' || data.requestId > shownDetailId) {
    if (data.layer === 'detail') shownDetailId = data.requestId;
    if (data.targetId === undefined || data.targetId === form.targetId.value) storeFrame(data);
    const parts = [frames.wide, hasDetailLayer(form.targetId.value) ? frames.detail : null].filter(Boolean);
    status.textContent = parts.map((frame) => `${frame.layer} ${frame.n}² at ${frame.pixelArcsec.toFixed(2)}″/px · ${frame.renderMs.toFixed(0)} ms`).join(' · ');
    describe(readSettings());
    draw();
  }
  requestFrames();
}

wideWorker.onmessage = ({ data }) => receive(data, wideWorker);
for (const worker of idleDetailWorkers) worker.onmessage = ({ data }) => receive(data, worker);

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  draw();
}

function drawLayer(frame, layer, geometry) {
  const scale = (frame.pixelArcsec * geometry.magnification) / geometry.apparentArcsecPerPixel;
  const size = frame.n * scale;
  context.drawImage(layer.element, geometry.cx - size / 2, geometry.cy - size / 2, size, size);
}

function drawGrain(geometry, settings) {
  const amplitude = frames.wide?.vision.noiseAmplitude ?? 0;
  if (amplitude <= 0.001) return;
  const pixels = grain.context.createImageData(GRAIN_TILE, GRAIN_TILE);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = Math.random() * 255;
    pixels.data[i] = v;
    pixels.data[i + 1] = v;
    pixels.data[i + 2] = v * 1.08;
    pixels.data[i + 3] = 255;
  }
  grain.context.putImageData(pixels, 0, 0);
  const grainPx = Math.max(((frames.wide.vision.acuityArcmin * 60) / geometry.apparentArcsecPerPixel) * 0.5, 1);
  const pattern = context.createPattern(grain.element, 'repeat');
  pattern.setTransform(new DOMMatrix().translate(Math.random() * GRAIN_TILE, Math.random() * GRAIN_TILE).scale(grainPx));
  context.globalCompositeOperation = 'lighter';
  context.globalAlpha = Math.min(amplitude * (settings.averted ? 0.8 : 1), 0.2);
  context.fillStyle = pattern;
  context.fillRect(geometry.cx - geometry.fieldRadius, geometry.cy - geometry.fieldRadius, geometry.fieldRadius * 2, geometry.fieldRadius * 2);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
}

function draw() {
  const settings = readSettings();
  const { width, height } = canvas;
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  const fieldRadius = Math.min(width, height) * 0.46 * settings.zoom;
  const geometry = {
    cx: width / 2,
    cy: height / 2,
    fieldRadius,
    magnification: settings.scope.focalLengthMm / settings.eyepieceMm,
    apparentArcsecPerPixel: (settings.afovDeg * 3600) / (2 * fieldRadius),
  };
  context.save();
  context.beginPath();
  context.arc(geometry.cx, geometry.cy, fieldRadius, 0, Math.PI * 2);
  context.fillStyle = '#05070b';
  context.fill();
  context.clip();
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (frames.wide) drawLayer(frames.wide, layers.wide, geometry);
  if (frames.detail && hasDetailLayer(settings.targetId)) drawLayer(frames.detail, layers.detail, geometry);
  drawGrain(geometry, settings);
  context.restore();
}

let lastGrainAt = 0;
function animateGrain(now) {
  if ((frames.wide?.vision.noiseAmplitude ?? 0) > 0.001 && now - lastGrainAt > 1000 / GRAIN_FPS) {
    lastGrainAt = now;
    draw();
  }
  window.requestAnimationFrame(animateGrain);
}

function settingsChanged() {
  formatOutputs();
  wideDirty = true;
  detailDirty = true;
  if (!hasDetailLayer(form.targetId.value)) frames.detail = null;
  describe(readSettings());
  requestFrames();
}

presetSelect.addEventListener('change', () => {
  if (presetSelect.value !== 'custom') applyPreset(presetSelect.value);
  settingsChanged();
});

form.addEventListener('input', (event) => {
  const scopeFields = ['correction', 'apertureMm', 'focalLengthMm', 'obstructionPct', 'vanes', 'vaneWidthMm'];
  if (scopeFields.includes(event.target.name)) presetSelect.value = 'custom';
  if (event.target.name === 'targetId') {
    frames.wide = null;
    frames.detail = null;
  }
  if (event.target.name === 'zoom') {
    formatOutputs();
    draw();
    return;
  }
  if (event.target.name === 'live') {
    requestFrames();
    return;
  }
  settingsChanged();
});

form.addEventListener('submit', (event) => event.preventDefault());
window.addEventListener('resize', resize);

form.targetId.value = 'jupiter';
presetSelect.value = 'dob-200';
applyPreset('dob-200');
formatOutputs();
describe(readSettings());
resize();
requestFrames();
window.requestAnimationFrame(animateGrain);
