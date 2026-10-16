const CELL_STROKES = ['rgba(90, 230, 140, 0.55)', 'rgba(255, 110, 90, 0.8)', 'rgba(255, 70, 70, 1)', 'rgba(90, 255, 140, 1)'];
const CELL_FILLS = ['rgba(0, 0, 0, 0)', 'rgba(255, 90, 70, 0.14)', 'rgba(255, 50, 50, 0.3)', 'rgba(90, 255, 140, 0.22)'];
const CELL_EXCLUDED = 2;
const SETTING_FORMATS = {
  evenColour: (value) => `${Math.round(value * 100)}%`,
  degree: (value) => ['flat', 'tilted', 'curved', 'wavy', 'complex'][value - 1],
  background: (value) => `${Math.round(value * 100)}%`,
  blackPoint: (value) => value.toFixed(1),
  boost: (value) => `${Math.round(value * 100)}%`,
  saturation: (value) => `${Math.round(value * 100)}%`,
  noise: (value) => `${Math.round(value * 100)}%`,
};

const stage = document.querySelector('[data-stage]');
const view = document.querySelector('[data-view]');
const viewContext = view.getContext('2d');
const cellLayer = document.querySelector('[data-cells]');
const cellContext = cellLayer.getContext('2d');
const empty = document.querySelector('[data-empty]');
const status = document.querySelector('[data-status]');
const info = document.querySelector('[data-info]');
const form = document.querySelector('[data-controls]');
const exportButton = document.querySelector('[data-export]');
const compareButton = document.querySelector('[data-compare]');
const resetButton = document.querySelector('[data-reset]');
const cellsHint = document.querySelector('[data-cells-hint]');

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let fileName = 'astrophoto';
let loaded = false;
let editedFrame = null;
let cells = [];
let comparing = false;
let busy = false;

function readSettings() {
  const number = (name) => Number(form.elements[name].value);
  return {
    removeBackground: form.elements.removeBackground.checked,
    flattenVignetting: form.elements.flattenVignetting.checked,
    evenColour: number('evenColour'),
    degree: number('degree'),
    background: number('background'),
    blackPoint: number('blackPoint'),
    boost: number('boost'),
    saturation: number('saturation'),
    noise: number('noise'),
  };
}

function showOutputs() {
  for (const [name, format] of Object.entries(SETTING_FORMATS)) {
    const input = form.elements[name];
    input.closest('label').querySelector('output').textContent = format(Number(input.value));
  }
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('ae-error', isError);
}

function requestRender(compare = false) {
  if (!loaded) return;
  worker.postMessage({ type: 'render', settings: readSettings(), compare });
}

function drawCells() {
  const visible = form.elements.showCells.checked && !comparing && cells.length > 0;
  cellLayer.hidden = !visible;
  cellsHint.hidden = !form.elements.showCells.checked;
  if (!visible) return;
  cellContext.clearRect(0, 0, cellLayer.width, cellLayer.height);
  cellContext.lineWidth = Math.max(1, cellLayer.width / 800);
  for (const cell of cells) {
    cellContext.strokeStyle = CELL_STROKES[cell.state];
    cellContext.fillStyle = CELL_FILLS[cell.state];
    const inset = cellContext.lineWidth * 2;
    cellContext.fillRect(cell.x0 + inset, cell.y0 + inset, cell.x1 - cell.x0 - 2 * inset, cell.y1 - cell.y0 - 2 * inset);
    cellContext.strokeRect(cell.x0 + inset, cell.y0 + inset, cell.x1 - cell.x0 - 2 * inset, cell.y1 - cell.y0 - 2 * inset);
    if (cell.state === CELL_EXCLUDED) {
      cellContext.beginPath();
      cellContext.moveTo(cell.x0 + inset, cell.y0 + inset);
      cellContext.lineTo(cell.x1 - inset, cell.y1 - inset);
      cellContext.moveTo(cell.x1 - inset, cell.y0 + inset);
      cellContext.lineTo(cell.x0 + inset, cell.y1 - inset);
      cellContext.stroke();
    }
  }
}

function showFrame(frame) {
  if (view.width !== frame.width || view.height !== frame.height) {
    view.width = cellLayer.width = frame.width;
    view.height = cellLayer.height = frame.height;
  }
  viewContext.putImageData(frame, 0, 0);
}

function imagePoint(event) {
  const box = cellLayer.getBoundingClientRect();
  const scale = Math.min(box.width / cellLayer.width, box.height / cellLayer.height);
  const offsetX = (box.width - cellLayer.width * scale) / 2;
  const offsetY = (box.height - cellLayer.height * scale) / 2;
  return {
    x: (event.clientX - box.left - offsetX) / scale,
    y: (event.clientY - box.top - offsetY) / scale,
  };
}

function openFile(file) {
  if (!file || busy) return;
  busy = true;
  fileName = file.name.replace(/\.[^.]+$/, '') || 'astrophoto';
  exportButton.disabled = true;
  compareButton.disabled = true;
  info.textContent = '';
  worker.postMessage({ type: 'open', file });
}

function saveBlob(blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}-edited.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

worker.onmessage = ({ data }) => {
  if (data.type === 'status') {
    setStatus(data.text);
  } else if (data.type === 'opened') {
    busy = false;
    loaded = true;
    editedFrame = null;
    info.textContent = data.description;
    setStatus('Processing…');
    requestRender();
  } else if (data.type === 'frame') {
    const frame = new ImageData(data.rgba, data.width, data.height);
    if (!data.compare) {
      editedFrame = frame;
      cells = data.cells;
    }
    if (data.compare === comparing) showFrame(frame);
    empty.hidden = true;
    view.hidden = false;
    exportButton.disabled = false;
    compareButton.disabled = false;
    setStatus(comparing ? 'Before: plain stretch, no sky glow removal or enhancement' : '');
    drawCells();
  } else if (data.type === 'exported') {
    busy = false;
    exportButton.disabled = false;
    setStatus('');
    saveBlob(data.blob);
  } else if (data.type === 'error') {
    busy = false;
    exportButton.disabled = !editedFrame;
    setStatus(data.message, true);
  }
};

form.addEventListener('input', (event) => {
  showOutputs();
  if (event.target.name === 'showCells') drawCells();
  else requestRender();
});

for (const input of document.querySelectorAll('[data-file]')) {
  input.addEventListener('change', () => {
    openFile(input.files[0]);
    input.value = '';
  });
}

stage.addEventListener('dragover', (event) => {
  event.preventDefault();
  stage.classList.add('ae-dragging');
});
stage.addEventListener('dragleave', () => stage.classList.remove('ae-dragging'));
stage.addEventListener('drop', (event) => {
  event.preventDefault();
  stage.classList.remove('ae-dragging');
  openFile(event.dataTransfer.files[0]);
});

cellLayer.addEventListener('click', (event) => {
  const { x, y } = imagePoint(event);
  const index = cells.findIndex((cell) => x >= cell.x0 && x < cell.x1 && y >= cell.y0 && y < cell.y1);
  if (index >= 0) worker.postMessage({ type: 'toggleCell', index, settings: readSettings() });
});

function endCompare() {
  if (!comparing) return;
  comparing = false;
  if (editedFrame) showFrame(editedFrame);
  setStatus('');
  drawCells();
}

compareButton.addEventListener('pointerdown', (event) => {
  compareButton.setPointerCapture(event.pointerId);
  comparing = true;
  drawCells();
  setStatus('Loading before view…');
  requestRender(true);
});
compareButton.addEventListener('pointerup', endCompare);
compareButton.addEventListener('pointercancel', endCompare);

exportButton.addEventListener('click', () => {
  busy = true;
  exportButton.disabled = true;
  worker.postMessage({ type: 'export', settings: readSettings() });
});

resetButton.addEventListener('click', () => {
  for (const input of form.querySelectorAll('input[type="range"]')) input.value = input.defaultValue;
  for (const input of form.querySelectorAll('input[type="checkbox"]')) input.checked = input.defaultChecked;
  worker.postMessage({ type: 'resetCells' });
  showOutputs();
  requestRender();
});

showOutputs();
