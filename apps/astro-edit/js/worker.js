import { CELL_EXCLUDED, CELL_FORCED, CELL_REJECTED, CELL_USED, LOCAL_COLUMNS, PLAIN_STRETCH, fitBackground, fitLocalBackground, measureCells, render, workingCopy } from './pipeline.js';
import { decodeTiff, isTiff } from './tiff.js';

const PREVIEW_EDGE = 1600;
const CELL_COLUMNS = 24;
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

let source = null;
let preview = null;
let cells = [];
let cellColumns = 0;
let overrides = new Map();
let model = null;
let modelKey = '';
let latestRequest = null;
let renderScheduled = false;

function status(text) {
  postMessage({ type: 'status', text });
}

function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

async function decodeRaster(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const toLinear = Float32Array.from({ length: 256 }, (_, value) => srgbToLinear(value / 255));
  const rgb = new Float32Array(bitmap.width * bitmap.height * 3);
  for (let pixel = 0; pixel < rgb.length / 3; pixel++) {
    rgb[pixel * 3] = toLinear[data[pixel * 4]];
    rgb[pixel * 3 + 1] = toLinear[data[pixel * 4 + 1]];
    rgb[pixel * 3 + 2] = toLinear[data[pixel * 4 + 2]];
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    rgb,
    toLinearSrgb: IDENTITY,
    description: `8-bit image · ${bitmap.width}×${bitmap.height} · already stretched, so faint detail is limited`,
  };
}

function columnsFor(settings) {
  return settings.skyModel === 'local' ? LOCAL_COLUMNS : CELL_COLUMNS;
}

function currentModel(settings) {
  const columns = columnsFor(settings);
  if (columns !== cellColumns) {
    cells = measureCells(preview, columns);
    cellColumns = columns;
    overrides = new Map();
    model = null;
  }
  const key = settings.skyModel === 'local' ? `local|${settings.blurSize}` : `smooth|${settings.degree}`;
  if (!model || modelKey !== key) {
    model = settings.skyModel === 'local' ? fitLocalBackground(cells, overrides, settings.blurSize) : fitBackground(cells, settings.degree, overrides);
    modelKey = key;
  }
  return model;
}

function renderLatest() {
  renderScheduled = false;
  const request = latestRequest;
  latestRequest = null;
  if (!request || !preview) return;
  const background = currentModel(request.settings);
  const settings = request.compare ? { ...request.settings, ...PLAIN_STRETCH } : request.settings;
  const frame = render(preview, background, settings);
  postMessage({
    type: 'frame',
    compare: request.compare,
    width: frame.width,
    height: frame.height,
    rgba: frame.rgba,
    cells: cells.map((cell, index) => ({ x0: cell.x0, y0: cell.y0, x1: cell.x1, y1: cell.y1, state: background.states[index] })),
  }, [frame.rgba.buffer]);
}

function toggleCell(index, settings) {
  const state = currentModel(settings).states[index];
  if (state === CELL_USED) overrides.set(index, CELL_EXCLUDED);
  else if (state === CELL_REJECTED) overrides.set(index, CELL_FORCED);
  else overrides.delete(index);
}

function queueRender(request) {
  latestRequest = request;
  if (renderScheduled) return;
  renderScheduled = true;
  setTimeout(renderLatest, 0);
}

async function open(file) {
  status(`Reading ${file.name}…`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  source = isTiff(bytes) ? await decodeTiff(bytes, status) : await decodeRaster(file);
  status('Measuring the sky…');
  preview = workingCopy(source, PREVIEW_EDGE);
  cellColumns = 0;
  overrides = new Map();
  model = null;
  postMessage({ type: 'opened', description: source.description });
}

async function exportFullSize(settings) {
  status('Rendering at full size…');
  const frame = render(workingCopy(source, Infinity), currentModel(settings), settings);
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  canvas.getContext('2d').putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0);
  status('Encoding PNG…');
  postMessage({ type: 'exported', blob: await canvas.convertToBlob({ type: 'image/png' }) });
}

onmessage = async ({ data }) => {
  try {
    if (data.type === 'open') {
      await open(data.file);
    } else if (data.type === 'render') {
      queueRender(data);
    } else if (data.type === 'toggleCell') {
      toggleCell(data.index, data.settings);
      model = null;
      queueRender({ settings: data.settings, compare: false });
    } else if (data.type === 'resetCells') {
      overrides = new Map();
      model = null;
    } else if (data.type === 'export') {
      await exportFullSize(data.settings);
    }
  } catch (error) {
    postMessage({ type: 'error', message: error.message || String(error) });
  }
};

