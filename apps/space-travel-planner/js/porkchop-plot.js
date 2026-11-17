import { departAt, flightAt, lowestIndex } from './porkchop.js';
import { DAYS_PER_YEAR, utcMsFromJulian } from './time.js';

const MARGIN = { left: 44, right: 8, top: 8, bottom: 26 };
const RAMP = [
  [0, [232, 251, 255]],
  [0.2, [95, 227, 255]],
  [0.45, [42, 143, 214]],
  [0.75, [27, 74, 138]],
  [1, [9, 22, 44]],
];
const UNSOLVED = [0, 0, 0];
const WORST_OVER_BEST = { c3: 8, arrivalSpeed: 3, totalDeltaV: 1.6 };
const CONTOUR_STEPS = 6;
const TICK_FONT = '11px "Trebuchet MS", system-ui, sans-serif';
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 48];
const DAY_STEPS = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
const YEAR_STEPS = [1, 2, 5, 10];
const MAX_TICKS = 5;

function rampColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const upper = RAMP.findIndex(([stop]) => stop >= clamped);
  if (upper <= 0) return RAMP[0][1];
  const [lowStop, low] = RAMP[upper - 1];
  const [highStop, high] = RAMP[upper];
  const mix = (clamped - lowStop) / (highStop - lowStop);
  return low.map((channel, index) => channel + (high[index] - channel) * mix);
}

function niceStep(span, steps) {
  return steps.find((step) => span / step <= MAX_TICKS) ?? steps.at(-1);
}

export function createPorkchopPlot(canvas, { onPick, onHover }) {
  const context = canvas.getContext('2d');
  const heat = document.createElement('canvas');
  let grid = null;
  let values = null;
  let metricKey = 'c3';
  let picked = -1;
  let width = 0;
  let height = 0;

  const plotWidth = () => width - MARGIN.left - MARGIN.right;
  const plotHeight = () => height - MARGIN.top - MARGIN.bottom;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  function shade(level) {
    return Math.log(level) / Math.log(WORST_OVER_BEST[metricKey]);
  }

  function paintHeat() {
    const best = values[lowestIndex(values)];
    heat.width = grid.columns;
    heat.height = grid.rows;
    const heatContext = heat.getContext('2d');
    const image = heatContext.createImageData(grid.columns, grid.rows);
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const value = values[row * grid.columns + column];
        const color = Number.isFinite(value) ? rampColor(shade(value / best)) : UNSOLVED;
        const pixel = ((grid.rows - 1 - row) * grid.columns + column) * 4;
        image.data.set([...color, 255], pixel);
      }
    }
    heatContext.putImageData(image, 0, 0);
  }

  function cellCenter(index) {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    return {
      x: MARGIN.left + ((column + 0.5) / grid.columns) * plotWidth(),
      y: MARGIN.top + (1 - (row + 0.5) / grid.rows) * plotHeight(),
    };
  }

  function drawContours() {
    const best = values[lowestIndex(values)];
    const band = (value) => (Number.isFinite(value) ? Math.min(CONTOUR_STEPS, Math.floor(shade(value / best) * CONTOUR_STEPS)) : -1);
    const cellWidth = plotWidth() / grid.columns;
    const cellHeight = plotHeight() / grid.rows;
    context.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    for (let row = 0; row < grid.rows; row++) {
      for (let column = 0; column < grid.columns; column++) {
        const here = band(values[row * grid.columns + column]);
        const left = MARGIN.left + column * cellWidth;
        const top = MARGIN.top + (grid.rows - 1 - row) * cellHeight;
        if (column + 1 < grid.columns && here !== band(values[row * grid.columns + column + 1])) {
          context.moveTo(left + cellWidth, top);
          context.lineTo(left + cellWidth, top + cellHeight);
        }
        if (row + 1 < grid.rows && here !== band(values[(row + 1) * grid.columns + column])) {
          context.moveTo(left, top);
          context.lineTo(left + cellWidth, top);
        }
      }
    }
    context.stroke();
  }

  function drawAxes() {
    context.fillStyle = '#6f9dc9';
    context.strokeStyle = 'rgba(111, 157, 201, 0.5)';
    context.font = TICK_FONT;
    context.textAlign = 'center';
    context.textBaseline = 'top';
    const firstDate = new Date(utcMsFromJulian(grid.departStart));
    const lastMs = utcMsFromJulian(grid.departStart + grid.departDays);
    const monthStep = niceStep(grid.departDays / 30.44, MONTH_STEPS);
    const tick = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 1));
    while (tick.getUTCMonth() % monthStep !== 0) tick.setUTCMonth(tick.getUTCMonth() + 1);
    for (; tick.getTime() <= lastMs; tick.setUTCMonth(tick.getUTCMonth() + monthStep)) {
      const fraction = (tick.getTime() - firstDate.getTime()) / (lastMs - firstDate.getTime());
      const x = MARGIN.left + fraction * plotWidth();
      const label = tick.getUTCMonth() === 0 ? String(tick.getUTCFullYear()) : tick.toLocaleString('en', { month: 'short', timeZone: 'UTC' });
      context.fillText(label, x, height - MARGIN.bottom + 6);
      context.beginPath();
      context.moveTo(x, height - MARGIN.bottom);
      context.lineTo(x, height - MARGIN.bottom + 4);
      context.stroke();
    }

    context.textAlign = 'right';
    context.textBaseline = 'middle';
    const inYears = grid.flightMax > 3 * DAYS_PER_YEAR;
    const unit = inYears ? DAYS_PER_YEAR : 1;
    const step = niceStep((grid.flightMax - grid.flightMin) / unit, inYears ? YEAR_STEPS : DAY_STEPS) * unit;
    for (let flight = Math.ceil(grid.flightMin / step) * step; flight <= grid.flightMax; flight += step) {
      const y = MARGIN.top + (1 - (flight - grid.flightMin) / (grid.flightMax - grid.flightMin)) * plotHeight();
      context.fillText(inYears ? `${Math.round(flight / unit)} y` : `${Math.round(flight)} d`, MARGIN.left - 6, y);
    }
  }

  function drawMark(index, style, radius) {
    if (index < 0) return;
    const { x, y } = cellCenter(index);
    context.strokeStyle = style;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    if (!grid) return;
    context.imageSmoothingEnabled = true;
    context.drawImage(heat, MARGIN.left, MARGIN.top, plotWidth(), plotHeight());
    drawContours();
    drawAxes();
    drawMark(lowestIndex(values), '#ffd27a', 5);
    drawMark(picked, '#ffffff', 7);
  }

  function indexAt(event) {
    if (!grid) return -1;
    const box = canvas.getBoundingClientRect();
    const fx = (event.clientX - box.left - MARGIN.left) / plotWidth();
    const fy = 1 - (event.clientY - box.top - MARGIN.top) / plotHeight();
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return -1;
    return Math.floor(fy * grid.rows) * grid.columns + Math.floor(fx * grid.columns);
  }

  const cellOf = (index) => ({
    index,
    departJd: departAt(grid, index % grid.columns),
    flightDays: flightAt(grid, Math.floor(index / grid.columns)),
    flybyJd: Number.isFinite(grid.flybyJd[index]) ? grid.flybyJd[index] : null,
  });

  let dragging = false;
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    const index = indexAt(event);
    if (index >= 0) onPick(cellOf(index));
  });
  canvas.addEventListener('pointermove', (event) => {
    const index = indexAt(event);
    if (dragging && index >= 0) onPick(cellOf(index));
    onHover(index >= 0 ? { ...cellOf(index), value: values[index] } : null);
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
  });
  canvas.addEventListener('pointerleave', () => onHover(null));

  new ResizeObserver(resize).observe(canvas);

  return {
    show(nextGrid, metric) {
      grid = nextGrid;
      values = nextGrid[metric];
      metricKey = metric;
      paintHeat();
      draw();
    },
    pick(index) {
      picked = index;
      draw();
    },
    best: () => (values ? lowestIndex(values) : -1),
    cellOf,
  };
}
