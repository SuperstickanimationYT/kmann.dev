import { demoGalaxy } from './demo.js';
import { faceOnSpan, fitOutline, ratioFromTilt, refineOutline, renderFaceOn, tiltFromRatio } from './geometry.js';

const WORK_SIZE = 2048;
const FULL_SIZE = 2048;
const QUICK_SIZE = 640;
const INSET_SIZE = 200;
const HANDLE_RADIUS = 7;
const HANDLE_REACH = 18;
const STEEP_TILT = 70;

const KNOWN_GALAXIES = [
  ['M33, Triangulum', 55],
  ['NGC 6744', 50],
  ['M31, Andromeda', 77],
  ['M81, Bode\'s', 59],
  ['M83, Southern Pinwheel', 24],
  ['M101, Pinwheel', 18],
  ['M51, Whirlpool', 22],
  ['M74, Phantom', 7],
  ['M63, Sunflower', 56],
  ['M106', 64],
  ['NGC 253, Sculptor', 76],
  ['NGC 2403', 62],
  ['NGC 300', 42],
];

const stage = document.querySelector('[data-stage]');
const canvas = document.querySelector('[data-view]');
const context = canvas.getContext('2d');
const form = document.querySelector('[data-controls]');
const fileInput = document.querySelector('[data-file]');
const status = document.querySelector('[data-status]');
const empty = document.querySelector('[data-empty]');
const viewBar = document.querySelector('[data-views]');
const starCount = document.querySelector('[data-star-count]');
const warning = document.querySelector('[data-warning]');
const presetSelect = document.querySelector('[data-preset]');
const downloadButtons = document.querySelectorAll('[data-download]');

const state = {
  source: null,
  image: null,
  layers: null,
  outline: null,
  mode: 'photo',
  canvases: {},
  faceOn: null,
  dirtyFaceOn: true,
};

function setting(name) {
  const field = form.elements[name];
  return field.type === 'checkbox' ? field.checked : Number(field.value);
}

function thickness() {
  return setting('thickness') / 100;
}

function tilt() {
  return tiltFromRatio(state.outline.ratio, thickness());
}

function viewSettings() {
  return {
    tilt: tilt(),
    field: setting('field') / 100,
    spin: setting('spin'),
    mirror: setting('mirror'),
    bulge: setting('bulge') / 100,
    stars: setting('starsBack') / 100,
  };
}

function showStatus(text) {
  status.hidden = !text;
  status.textContent = text ?? '';
}

function nextPaint() {
  return new Promise((resolve) => window.setTimeout(resolve, 30));
}

function toFloat(imageData) {
  const { width, height, data } = imageData;
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);
  for (let i = 0; i < r.length; i += 1) {
    r[i] = data[i * 4] / 255;
    g[i] = data[i * 4 + 1] / 255;
    b[i] = data[i * 4 + 2] / 255;
  }
  return { width, height, r, g, b };
}

function layerCanvas(layer, gain = 1) {
  const { width, height, r, g, b } = layer;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < r.length; i += 1) {
    pixels[i * 4] = 255 * r[i] * gain;
    pixels[i * 4 + 1] = 255 * g[i] * gain;
    pixels[i * 4 + 2] = 255 * b[i] * gain;
    pixels[i * 4 + 3] = 255;
  }
  return imageCanvas(new ImageData(pixels, width, height));
}

function imageCanvas(imageData) {
  const out = document.createElement('canvas');
  out.width = imageData.width;
  out.height = imageData.height;
  out.getContext('2d').putImageData(imageData, 0, 0);
  return out;
}

function sourceFromBitmap(bitmap) {
  const scale = Math.min(1, WORK_SIZE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const work = document.createElement('canvas');
  work.width = width;
  work.height = height;
  const workContext = work.getContext('2d', { willReadFrequently: true });
  workContext.drawImage(bitmap, 0, 0, width, height);
  return workContext.getImageData(0, 0, width, height);
}

async function load(imageData) {
  state.source = imageData;
  state.image = toFloat(imageData);
  state.canvases = { photo: imageCanvas(imageData) };
  state.outline = null;
  setMode('photo');
  empty.hidden = true;
  viewBar.hidden = false;
  downloadButtons.forEach((button) => { button.disabled = false; });
  state.starWidth = null;
  if (!(await findStars({ measure: true }))) return;
  fit();
  presetSelect.value = '';
  setMode('photo');
}

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    showStatus('That file isn\'t an image this browser can open. Try JPEG, PNG or WebP.');
    return;
  }
  showStatus('Opening photo…');
  await nextPaint();
  try {
    const bitmap = await createImageBitmap(file);
    await load(sourceFromBitmap(bitmap));
    bitmap.close();
  } catch {
    showStatus('This browser couldn\'t read that image. Try JPEG, PNG or WebP.');
  }
}

const starWorker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let latestJob = 0;

function starsInWorker(image, options) {
  latestJob += 1;
  const job = latestJob;
  return new Promise((resolve) => {
    const listen = ({ data }) => {
      if (data.job !== job) return;
      starWorker.removeEventListener('message', listen);
      resolve(job === latestJob ? data : null);
    };
    starWorker.addEventListener('message', listen);
    starWorker.postMessage({ job, image, options });
  });
}

function describeStars(layers) {
  if (!setting('removeStars')) return 'Stars stay in the disk and get stretched with it.';
  const found = `Found ${layers.count.toLocaleString()} stars.`;
  if (state.starWidth === null) return found;
  return `${found} The widest stars are about ${state.starWidth.toFixed(1)} px across at half brightness, so the largest size was set to ${layers.radius}.`;
}

async function findStars({ measure = false } = {}) {
  showStatus(setting('removeStars') ? 'Removing stars…' : 'Preparing…');
  const layers = await starsInWorker(state.image, {
    remove: setting('removeStars'),
    measure,
    radius: setting('starSize'),
    sensitivity: setting('sensitivity'),
  });
  if (!layers) return false;
  state.layers = layers;
  if (measure) {
    state.starWidth = layers.starWidth;
    form.elements.starSize.value = String(layers.radius);
    refreshOutputs();
  }
  state.canvases.starless = layerCanvas(state.layers.starless);
  state.canvases.stars = layerCanvas(state.layers.stars, 1.6);
  starCount.textContent = describeStars(layers);
  showStatus('');
  invalidateFaceOn();
  return true;
}

function fit() {
  const result = fitOutline(state.layers.starless, setting('reach') / 100);
  state.outline = refineOutline(state.layers.starless, result.outline, thickness());
  state.fitNote = result.tooSmall
    ? 'The fit found almost nothing. Raise "Trace out to" or drag the outline by hand.'
    : result.touchesEdge
      ? 'The glow runs off the edge of the photo, so the fit may be off. Lower "Trace out to" or drag the outline.'
      : '';
  syncOutlineFields();
  invalidateFaceOn();
}

function normalisedAngle(angle) {
  let a = angle % Math.PI;
  if (a < 0) a += Math.PI;
  return a;
}

function syncOutlineFields() {
  const { outline } = state;
  form.elements.tilt.value = tilt().toFixed(1);
  form.elements.angle.value = ((normalisedAngle(outline.angle) * 180) / Math.PI).toFixed(1);
  refreshOutputs();
  const steep = tilt() > STEEP_TILT
    ? `Above about ${STEEP_TILT}° the far side of the disk is hidden, so the face-on view is mostly guesswork.`
    : '';
  const note = [state.fitNote, steep].filter(Boolean).join(' ');
  warning.hidden = !note;
  warning.textContent = note;
}

function refreshOutputs() {
  for (const field of form.querySelectorAll('input[type="range"]')) {
    const output = field.closest('label').querySelector('output');
    if (output) output.textContent = Number(field.value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
}

function invalidateFaceOn() {
  state.dirtyFaceOn = true;
  scheduleDraw();
}

function faceOnSize(limit) {
  return Math.max(64, Math.min(limit, Math.round(faceOnSpan(state.outline, setting('field') / 100))));
}

let fullRenderTimer = 0;
function ensureFaceOn() {
  if (!state.dirtyFaceOn) return;
  state.dirtyFaceOn = false;
  state.faceOn = imageCanvas(renderFaceOn(state.layers, state.outline, viewSettings(), faceOnSize(QUICK_SIZE)));
  window.clearTimeout(fullRenderTimer);
  fullRenderTimer = window.setTimeout(() => {
    if (state.dirtyFaceOn || state.mode !== 'face-on') return;
    state.faceOn = imageCanvas(renderFaceOn(state.layers, state.outline, viewSettings(), faceOnSize(FULL_SIZE)));
    draw();
  }, 250);
}

let drawQueued = false;
function scheduleDraw() {
  if (drawQueued) return;
  drawQueued = true;
  window.requestAnimationFrame(() => {
    drawQueued = false;
    draw();
  });
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = stage.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  scheduleDraw();
}

function displayed() {
  if (state.mode === 'face-on') {
    ensureFaceOn();
    return state.faceOn;
  }
  return state.canvases[state.mode];
}

function placement(picture) {
  const box = stage.getBoundingClientRect();
  const margin = state.mode === 'photo' ? 0.92 : 0.86;
  const scale = Math.min(box.width / picture.width, box.height / picture.height) * margin;
  return {
    scale,
    x: (box.width - picture.width * scale) / 2,
    y: (box.height - picture.height * scale) / 2 + (box.height > 300 ? 14 : 0),
  };
}

function handles() {
  const { cx, cy, a, ratio, angle } = state.outline;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const b = a * ratio;
  return [
    { kind: 'center', x: cx, y: cy },
    { kind: 'major', x: cx + a * ux, y: cy + a * uy },
    { kind: 'major', x: cx - a * ux, y: cy - a * uy },
    { kind: 'minor', x: cx - b * uy, y: cy + b * ux },
    { kind: 'minor', x: cx + b * uy, y: cy - b * ux },
  ];
}

function drawOutline(place) {
  const { cx, cy, a, ratio, angle } = state.outline;
  const toScreen = (x, y) => [place.x + x * place.scale, place.y + y * place.scale];
  const [sx, sy] = toScreen(cx, cy);
  context.save();
  context.strokeStyle = 'rgba(95, 227, 255, 0.9)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.ellipse(sx, sy, a * place.scale, a * ratio * place.scale, angle, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([4, 5]);
  context.strokeStyle = 'rgba(95, 227, 255, 0.5)';
  const points = handles();
  for (const [from, to] of [[1, 2], [3, 4]]) {
    context.beginPath();
    context.moveTo(...toScreen(points[from].x, points[from].y));
    context.lineTo(...toScreen(points[to].x, points[to].y));
    context.stroke();
  }
  context.setLineDash([]);
  for (const point of points) {
    const [hx, hy] = toScreen(point.x, point.y);
    context.beginPath();
    context.arc(hx, hy, HANDLE_RADIUS, 0, Math.PI * 2);
    context.fillStyle = point.kind === 'center' ? '#5fe3ff' : point.kind === 'major' ? '#3d8fdd' : '#ffc56b';
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = '#03080f';
    context.stroke();
  }
  context.restore();
}

function drawInset() {
  const box = stage.getBoundingClientRect();
  const size = Math.min(INSET_SIZE, box.width * 0.32, box.height * 0.4);
  if (size < 80) return;
  const inset = imageCanvas(renderFaceOn(state.layers, state.outline, viewSettings(), Math.round(size)));
  const x = 12;
  const y = box.height - size - 12;
  context.drawImage(inset, x, y, size, size);
  context.strokeStyle = 'rgba(95, 227, 255, 0.6)';
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
  context.fillStyle = 'rgba(3, 8, 15, 0.75)';
  context.fillRect(x + 1, y + 1, 62, 18);
  context.fillStyle = '#e2effd';
  context.font = '12px "Trebuchet MS", sans-serif';
  context.fillText('Face-on', x + 7, y + 14);
}

function drawPicture(picture) {
  const place = placement(picture);
  context.imageSmoothingQuality = 'high';
  context.drawImage(picture, place.x, place.y, picture.width * place.scale, picture.height * place.scale);
  return place;
}

function draw() {
  const box = stage.getBoundingClientRect();
  context.clearRect(0, 0, box.width, box.height);
  if (!state.outline) {
    if (state.canvases.photo) drawPicture(state.canvases.photo);
    return;
  }
  const place = drawPicture(displayed());
  if (state.mode === 'photo') {
    drawOutline(place);
    drawInset();
  }
}

function setMode(mode) {
  state.mode = mode;
  for (const button of viewBar.querySelectorAll('[data-view-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.viewMode === mode));
  }
  canvas.style.cursor = '';
  scheduleDraw();
}

function pointerInImage(event) {
  const rect = canvas.getBoundingClientRect();
  const place = placement(state.canvases.photo);
  return {
    x: (event.clientX - rect.left - place.x) / place.scale,
    y: (event.clientY - rect.top - place.y) / place.scale,
    reach: HANDLE_REACH / place.scale,
  };
}

function handleAt(point) {
  let best = null;
  let bestDistance = point.reach;
  for (const handle of handles()) {
    const distance = Math.hypot(handle.x - point.x, handle.y - point.y);
    if (distance < bestDistance) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}

let drag = null;

function dragTo(point) {
  const { outline } = state;
  if (drag.kind === 'center') {
    outline.cx = point.x - drag.offsetX;
    outline.cy = point.y - drag.offsetY;
  } else if (drag.kind === 'major') {
    const dx = point.x - outline.cx;
    const dy = point.y - outline.cy;
    const b = outline.a * outline.ratio;
    outline.a = Math.max(4, Math.hypot(dx, dy));
    outline.angle = Math.atan2(dy, dx);
    outline.ratio = Math.min(1, b / outline.a);
  } else {
    const dx = point.x - outline.cx;
    const dy = point.y - outline.cy;
    const across = Math.abs(-dx * Math.sin(outline.angle) + dy * Math.cos(outline.angle));
    outline.ratio = Math.min(1, Math.max(0.02, across / outline.a));
  }
  presetSelect.value = '';
  state.fitNote = '';
  syncOutlineFields();
  invalidateFaceOn();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.outline || state.mode !== 'photo') return;
  const point = pointerInImage(event);
  const handle = handleAt(point);
  if (!handle) return;
  drag = { kind: handle.kind, offsetX: point.x - state.outline.cx, offsetY: point.y - state.outline.cy };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.outline || state.mode !== 'photo') return;
  const point = pointerInImage(event);
  if (drag) {
    dragTo(point);
    return;
  }
  const handle = handleAt(point);
  canvas.style.cursor = !handle ? '' : handle.kind === 'center' ? 'move' : 'grab';
});

function endDrag() {
  drag = null;
}

canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const STAR_FIELDS = new Set(['removeStars', 'starSize', 'sensitivity']);
const VIEW_FIELDS = new Set(['field', 'spin', 'mirror', 'bulge', 'starsBack']);

form.addEventListener('input', (event) => {
  const { name } = event.target;
  refreshOutputs();
  if (!state.outline) return;
  if (name === 'tilt') {
    state.outline.ratio = ratioFromTilt(Number(event.target.value), thickness());
    presetSelect.value = '';
    syncOutlineFields();
    invalidateFaceOn();
  } else if (name === 'angle') {
    state.outline.angle = (Number(event.target.value) * Math.PI) / 180;
    syncOutlineFields();
    invalidateFaceOn();
  } else if (name === 'thickness') {
    syncOutlineFields();
    invalidateFaceOn();
  } else if (VIEW_FIELDS.has(name)) {
    invalidateFaceOn();
  }
});

form.addEventListener('change', async (event) => {
  const { name } = event.target;
  if (!state.outline) return;
  if (STAR_FIELDS.has(name)) {
    if (name === 'starSize') state.starWidth = null;
    await findStars();
    scheduleDraw();
  } else if (name === 'reach') {
    fit();
  }
});

form.addEventListener('submit', (event) => event.preventDefault());

for (const [label, degrees] of KNOWN_GALAXIES) {
  const option = document.createElement('option');
  option.value = String(degrees);
  option.textContent = `${label} (≈${degrees}°)`;
  presetSelect.append(option);
}

presetSelect.addEventListener('change', () => {
  if (!state.outline) return;
  if (presetSelect.value === '') {
    fit();
    return;
  }
  state.outline.ratio = ratioFromTilt(Number(presetSelect.value), thickness());
  state.fitNote = '';
  syncOutlineFields();
  invalidateFaceOn();
});

document.querySelector('[data-fit]').addEventListener('click', () => {
  if (!state.outline) return;
  presetSelect.value = '';
  fit();
});

for (const button of document.querySelectorAll('[data-open]')) {
  button.addEventListener('click', () => fileInput.click());
}

fileInput.addEventListener('change', () => {
  loadFile(fileInput.files[0]);
  fileInput.value = '';
});

for (const button of document.querySelectorAll('[data-demo]')) {
  button.addEventListener('click', async () => {
    showStatus('Building a tilted galaxy…');
    await nextPaint();
    await load(demoGalaxy());
  });
}

viewBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-view-mode]');
  if (button) setMode(button.dataset.viewMode);
});

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  stage.classList.add('fo-dragging');
});

stage.addEventListener('dragleave', () => stage.classList.remove('fo-dragging'));

stage.addEventListener('drop', (event) => {
  event.preventDefault();
  stage.classList.remove('fo-dragging');
  loadFile(event.dataTransfer.files[0]);
});

window.addEventListener('paste', (event) => {
  const item = [...event.clipboardData.items].find((entry) => entry.type.startsWith('image/'));
  if (item) loadFile(item.getAsFile());
});

function savePng(source, name) {
  source.toBlob((blob) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, 'image/png');
}

for (const button of downloadButtons) {
  button.addEventListener('click', () => {
    if (!state.outline) return;
    if (button.dataset.download === 'starless') {
      savePng(state.canvases.starless, 'starless.png');
      return;
    }
    savePng(imageCanvas(renderFaceOn(state.layers, state.outline, viewSettings(), faceOnSize(FULL_SIZE))), 'face-on.png');
  });
}

window.addEventListener('resize', resize);
refreshOutputs();
resize();
