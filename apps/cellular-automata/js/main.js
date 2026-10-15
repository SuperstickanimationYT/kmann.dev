import { emptyLineBackground, emptyPlaneBackground } from './background.js';
import { LineWorld } from './line.js';
import { PlaneWorld } from './plane.js';
import {
  LINE_PRESETS, PLANE_PRESETS, formatPlaneRule, lineRuleTable, parseLineRule, parsePlaneRule, planeRuleTable,
} from './rules.js';
import { View } from './view.js';

const LIMITS = { 1: { width: 20000 }, 2: { width: 2000, height: 2000 } };
const DEFAULT_SIZES = { 1: { width: 400, patch: 40 }, 2: { width: 200, height: 150, patch: 24 } };
const MAX_SPEED = 2000;
const FRAME_BUDGET_MS = 14;
const READOUT_EVERY_MS = 200;

const form = document.querySelector('[data-controls]');
const presets = document.querySelector('[data-presets]');
const etherSelect = document.querySelector('[data-ether]');
const etherHint = document.querySelector('[data-ether-hint]');
const ruleHint = document.querySelector('[data-rule-hint]');
const readout = document.querySelector('[data-readout]');
const runButton = document.querySelector('[data-run]');
const toolButtons = document.querySelectorAll('[data-tool]');
const field = (name) => form.elements[name];

const view = new View(document.querySelector('[data-board]'), {
  onDraw: drawCell,
  onCameraMove: () => { needsRender = true; },
});

const etherCache = new Map();
const searching = new Set();
const worker = new Worker(new URL('./ether-worker.js', import.meta.url), { type: 'module' });

let world = null;
let running = false;
let needsRender = true;
let stepDebt = 0;
let lastFrame = performance.now();
let lastReadout = 0;
let paintValue = 1;
let lastPainted = null;

const dimensions = () => Number(form.elements.dimensions.value);

function currentRule() {
  if (dimensions() === 1) {
    const rule = parseLineRule(field('lineRule').value);
    return rule === null ? null : { key: `1:${rule}`, label: `Rule ${rule}`, number: rule, table: lineRuleTable(rule) };
  }
  const rule = parsePlaneRule(field('planeRule').value);
  return rule && { key: `2:${formatPlaneRule(rule)}`, label: formatPlaneRule(rule), table: planeRuleTable(rule) };
}

function showFor(attribute, value) {
  for (const element of document.querySelectorAll(`[data-for-${attribute}]`)) {
    element.hidden = element.dataset[`for${attribute[0].toUpperCase()}${attribute.slice(1)}`] !== value;
  }
}

function syncVisibility() {
  showFor('dimensions', String(dimensions()));
  showFor('size', form.elements.size.value);
  showFor('start', field('start').value);
}

function fillPresets() {
  const list = dimensions() === 1 ? LINE_PRESETS : PLANE_PRESETS;
  presets.replaceChildren(new Option('Pick a preset…', ''), ...list.map(({ rule, name }) => new Option(dimensions() === 1 ? name : `${name} (${rule})`, rule)));
}

function speed() {
  return Math.round(MAX_SPEED ** Number(field('speed').value));
}

function ethersFor(rule) {
  return etherCache.get(rule.key);
}

function requestEthers(rule) {
  if (etherCache.has(rule.key) || searching.has(rule.key)) return;
  searching.add(rule.key);
  worker.postMessage({ key: rule.key, dimensions: dimensions(), table: rule.table });
}

worker.addEventListener('message', ({ data: { key, ethers } }) => {
  searching.delete(key);
  etherCache.set(key, ethers);
  if (currentRule()?.key === key) fillEthers();
});

function etherPeriod({ time, dx, dy, width, height }) {
  let repeats = 1;
  while ((repeats * dx) % width || (repeats * dy) % height) repeats += 1;
  return time * repeats;
}

function etherLabel(ether) {
  const size = dimensions() === 1 ? `${ether.width} cells` : `${ether.width}×${ether.height} tile`;
  const share = ether.share >= 0.005 ? ` · ${Math.round(ether.share * 100)}% of random starts` : '';
  return `${size}, period ${etherPeriod(ether)}${share}`;
}

function fillEthers() {
  const rule = currentRule();
  const previous = etherSelect.value;
  const options = [new Option('Empty (all cells off)', '0')];
  const ethers = rule && ethersFor(rule);
  if (rule && !ethers) {
    const searching = new Option('Searching for ethers…', '');
    searching.disabled = true;
    options.push(searching);
  }
  ethers?.forEach((ether, index) => options.push(new Option(etherLabel(ether), String(index + 1))));
  etherSelect.replaceChildren(...options);
  etherSelect.value = options.some((option) => option.value === previous && !option.disabled) ? previous : '0';
  describeEther();
}

function chosenEther() {
  const rule = currentRule();
  const index = Number(etherSelect.value);
  return rule && index ? ethersFor(rule)?.[index - 1] ?? null : null;
}

function describeEther() {
  const ether = chosenEther();
  etherHint.classList.remove('ca-warn');
  if (!ether) {
    const rule = currentRule();
    const ethers = rule && ethersFor(rule);
    etherHint.textContent = !ethers ? 'Looking for repeating backgrounds this rule can hold…'
      : ethers.length ? `Found ${ethers.length} other background${ethers.length > 1 ? 's' : ''} that repeat forever under this rule.`
        : 'No small repeating background survives this rule.';
    return;
  }
  const period = etherPeriod(ether);
  const pattern = dimensions() === 1 ? `a strip of ${ether.width} cells` : `a ${ether.width}×${ether.height} tile`;
  const share = ether.share >= 0.005
    ? `${Math.round(ether.share * 100)}% of a random board settles into it, so gliders on it tend to appear by themselves.`
    : 'Random boards don’t settle into it, so it only shows up when you place it.';
  let text = `It repeats ${pattern} and comes back to the same state every ${period} generation${period > 1 ? 's' : ''}. ${share}`;
  if (form.elements.size.value === 'board' && field('edges').value === 'cut') {
    text += ' Cut-off edges are not part of the pattern, so the background wears away from the edges inward.';
    etherHint.classList.add('ca-warn');
  }
  if (form.elements.size.value === 'board' && field('edges').value === 'wrap') {
    const size = boardSize();
    const fixes = [];
    if (size.width % ether.width) fixes.push(`a width divisible by ${ether.width}`);
    if (dimensions() === 2 && size.height % ether.height) fixes.push(`a height divisible by ${ether.height}`);
    if (fixes.length) {
      text += ` The board isn't a whole number of tiles, so a seam runs along the wrap. Try ${fixes.join(' and ')}.`;
      etherHint.classList.add('ca-warn');
    }
  }
  etherHint.textContent = text;
}

function boardSize() {
  const limits = LIMITS[dimensions()];
  const clampTo = (value, max) => Math.max(4, Math.min(max, Math.round(Number(value) || 4)));
  return { width: clampTo(field('width').value, limits.width), height: clampTo(field('height').value, limits.height ?? 1) };
}

function backgroundFor(rule) {
  const ether = chosenEther();
  if (ether) return { width: ether.width, height: ether.height, phases: ether.phases };
  return dimensions() === 1 ? emptyLineBackground(rule.table) : emptyPlaneBackground(rule.table);
}

function restart() {
  const rule = currentRule();
  if (!rule) return;
  const size = boardSize();
  const board = form.elements.size.value === 'board' ? { ...size, wrap: field('edges').value === 'wrap' } : null;
  const settings = { table: rule.table, board, background: backgroundFor(rule) };
  world = dimensions() === 1 ? new LineWorld(settings) : new PlaneWorld(settings);
  seed(board);
  view.setWorld(world, dimensions());
  view.fit();
  needsRender = true;
  updateReadout(true);
}

function seed(board) {
  const start = field('start').value;
  const density = Number(field('density').value);
  const patch = Math.max(1, Math.round(Number(field('patch').value) || 1));
  const random = () => (Math.random() < density ? 1 : 0);
  if (dimensions() === 1) {
    const middle = board ? Math.floor(board.width / 2) : 0;
    if (start === 'cell') world.toggle(middle);
    if (start === 'patch') world.fill(middle - Math.floor(patch / 2), middle + Math.ceil(patch / 2), random);
    return;
  }
  const middleX = board ? Math.floor(board.width / 2) : 0;
  const middleY = board ? Math.floor(board.height / 2) : 0;
  if (start === 'cell') world.set(middleX, middleY, 1 - world.get(middleX, middleY));
  if (start === 'patch') {
    const from = (middle) => middle - Math.floor(patch / 2);
    for (let y = from(middleY); y < from(middleY) + patch; y += 1) {
      for (let x = from(middleX); x < from(middleX) + patch; x += 1) world.set(x, y, random());
    }
  }
  if (!board) world.dropBackgroundChunks();
}

function drawCell(x, y, first) {
  if (!world) return;
  const cellY = dimensions() === 1 ? 0 : y;
  if (!first && lastPainted && lastPainted.x === x && lastPainted.y === cellY) return;
  lastPainted = { x, y: cellY };
  if (dimensions() === 1) {
    const row = world.latest;
    if (first) paintValue = 1 - (world.valueAt(row, x) & 1);
    world.fill(x, x + 1, () => paintValue);
  } else {
    if (first) paintValue = 1 - (world.get(x, y) & 1);
    world.set(x, y, paintValue);
  }
  needsRender = true;
  updateReadout(true);
}

function stepOnce() {
  world.step();
  needsRender = true;
}

function setRunning(next) {
  running = next;
  runButton.textContent = running ? 'Pause' : 'Play';
  stepDebt = 0;
}

function updateReadout(force = false) {
  const now = performance.now();
  if (!force && now - lastReadout < READOUT_EVERY_MS) return;
  lastReadout = now;
  const rule = currentRule();
  const emptyBackground = !chosenEther();
  const rows = [
    ['Rule', rule?.label ?? '—'],
    ['Generation', world.generation.toLocaleString()],
    [emptyBackground ? 'Live cells' : 'Off-ether cells', world.offBackground().toLocaleString()],
    ['Speed', `${speed()} gen/s`],
  ];
  readout.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = term;
    dd.textContent = value;
    return [dt, dd];
  }));
}

function frame(now) {
  const elapsed = Math.min(now - lastFrame, 250);
  lastFrame = now;
  if (running && world) {
    stepDebt += (elapsed / 1000) * speed();
    const started = performance.now();
    while (stepDebt >= 1 && performance.now() - started < FRAME_BUDGET_MS) {
      stepOnce();
      stepDebt -= 1;
    }
    stepDebt = Math.min(stepDebt, 1);
    updateReadout();
  }
  if (needsRender && world) {
    view.render();
    needsRender = false;
  }
  requestAnimationFrame(frame);
}

function validateRule() {
  const rule = currentRule();
  const input = field(dimensions() === 1 ? 'lineRule' : 'planeRule');
  input.setAttribute('aria-invalid', String(!rule));
  ruleHint.classList.toggle('ca-warn', !rule);
  ruleHint.textContent = !rule
    ? (dimensions() === 1 ? 'Enter a whole number from 0 to 255.' : 'Write it like B3/S23: digits 0 to 8 after B and after S.')
    : dimensions() === 1 ? `${rule.label} in binary: ${rule.number.toString(2).padStart(8, '0')} (cases 111 to 000).` : '';
  return rule;
}

function ruleChanged() {
  const rule = validateRule();
  if (!rule) return;
  etherSelect.value = '0';
  requestEthers(rule);
  fillEthers();
  restart();
}

function dimensionsChanged() {
  const defaults = DEFAULT_SIZES[dimensions()];
  field('width').value = defaults.width;
  if (defaults.height) field('height').value = defaults.height;
  field('patch').value = defaults.patch;
  syncVisibility();
  fillPresets();
  ruleChanged();
}

form.addEventListener('change', (event) => {
  const name = event.target.name;
  if (name === 'dimensions') dimensionsChanged();
  else if (name === 'lineRule' || name === 'planeRule') ruleChanged();
  else if (name === 'dimEther') {
    view.dimEther = event.target.checked;
    needsRender = true;
  } else if (name === 'speed' || name === 'density') {
    return;
  } else {
    syncVisibility();
    describeEther();
    if (name !== 'patch' && name !== 'start') restart();
  }
});

form.addEventListener('input', (event) => {
  if (event.target.name === 'speed') {
    document.querySelector('[data-speed]').textContent = `${speed()} gen/s`;
    if (world) updateReadout(true);
  }
  if (event.target.name === 'density') document.querySelector('[data-density]').textContent = `${Math.round(Number(event.target.value) * 100)}%`;
  if (event.target.name === 'planeRule' || event.target.name === 'lineRule') validateRule();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  restart();
});

presets.addEventListener('change', () => {
  if (!presets.value) return;
  field(dimensions() === 1 ? 'lineRule' : 'planeRule').value = presets.value;
  presets.value = '';
  ruleChanged();
});

runButton.addEventListener('click', () => setRunning(!running));
document.querySelector('[data-step]').addEventListener('click', () => {
  setRunning(false);
  stepOnce();
  updateReadout(true);
});
document.querySelector('[data-fit]').addEventListener('click', () => {
  view.fit();
  needsRender = true;
});

function setTool(tool) {
  view.tool = tool;
  document.body.classList.toggle('ca-drawing', tool === 'draw');
  toolButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
}
toolButtons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));

document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea') || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === ' ' && !event.target.closest('button')) {
    event.preventDefault();
    setRunning(!running);
  } else if (event.key === 'n' || event.key === 'N') {
    setRunning(false);
    stepOnce();
    updateReadout(true);
  } else if (event.key === 'f' || event.key === 'F') {
    view.fit();
    needsRender = true;
  }
});

window.addEventListener('resize', () => {
  view.resize();
  needsRender = true;
});

view.resize();
document.querySelector('[data-speed]').textContent = `${speed()} gen/s`;
document.querySelector('[data-density]').textContent = `${Math.round(Number(field('density').value) * 100)}%`;
syncVisibility();
fillPresets();
ruleChanged();
requestAnimationFrame(frame);
