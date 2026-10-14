import { createPopulationChart } from './chart.js';
import { TRAITS } from './genome.js';
import { createPondRenderer } from './render.js';
import { divisionMassOf, World } from './world.js';

const TICKS_PER_FRAME = [1, 2, 5, 10, 20, 50];
const DEFAULT_SPEED = 2;
const FRAME_BUDGET_MS = 14;
const CHART_EVERY_TICKS = 50;
const PANEL_REFRESH_MS = 250;

const find = (selector) => document.querySelector(selector);
const settings = find('[data-settings]');
const renderer = createPondRenderer(find('[data-pond]'));
const chart = createPopulationChart(find('[data-population-chart]'), find('[data-chart-tip]'));
const cellCard = find('[data-cell-card]');
const state = { world: null, paused: false, speed: DEFAULT_SPEED, colourMode: 'diet', selectedId: null, lastPanelRefresh: 0 };

const traitRows = TRAITS.map((trait) => {
  const row = document.createElement('div');
  row.className = 'ep-trait';
  row.innerHTML = `<span>${trait.label}</span><span class="ep-trait-track${trait.min < 0 ? ' ep-signed' : ''}"><span class="ep-trait-fill"></span></span>`;
  find('[data-trait-bars]').append(row);
  return { trait, fill: row.querySelector('.ep-trait-fill') };
});

function startPond() {
  const values = new FormData(settings);
  state.world = new World({
    seed: Number(values.get('seed')) || 1,
    matter: Number(values.get('matter')),
    ancestors: Number(values.get('ancestors')),
    light: Number(values.get('light')),
  });
  state.selectedId = null;
  cellCard.hidden = true;
  chart.clear();
  chart.record(0, state.world.cells.length);
  refreshPanel();
}

function refreshSettingLabels() {
  const values = new FormData(settings);
  find('[data-light-label]').textContent = `${Math.round(Number(values.get('light')) * 100)}%`;
  find('[data-matter-label]').textContent = Number(values.get('matter')).toLocaleString();
  find('[data-ancestors-label]').textContent = values.get('ancestors');
}

function refreshPanel() {
  const { world } = state;
  const { cells } = world;
  find('[data-stat="tick"]').textContent = `${world.tick.toLocaleString()} ticks`;
  find('[data-stat="count"]').textContent = cells.length.toLocaleString();
  find('[data-stat="generation"]').textContent = cells.reduce((most, cell) => Math.max(most, cell.generation), 0).toLocaleString();
  for (const { trait, fill } of traitRows) {
    const mean = cells.reduce((sum, cell) => sum + cell.genome[trait.key], 0) / Math.max(1, cells.length);
    if (trait.min < 0) {
      fill.style.left = `${50 + Math.min(0, mean) * 50}%`;
      fill.style.width = `${Math.abs(mean) * 50}%`;
    } else {
      fill.style.left = '0';
      fill.style.width = `${mean * 100}%`;
    }
  }
  chart.draw();
  refreshCellCard();
}

function fact(label, value) {
  return `<dt>${label}</dt><dd>${value}</dd>`;
}

function refreshCellCard() {
  if (state.selectedId === null) return;
  const cell = state.world.findCell(state.selectedId);
  const name = find('[data-cell-name]');
  if (!cell) {
    name.textContent = `Cell ${state.selectedId} has died`;
    return;
  }
  const { genome } = cell;
  name.textContent = `Cell ${cell.id}`;
  const signed = (value) => (value >= 0 ? '+' : '') + value.toFixed(2);
  find('[data-cell-facts]').innerHTML = [
    fact('Generation', cell.generation),
    fact('Age', `${cell.age} / ${Math.round(cell.maxAge)} ticks`),
    fact('Size', `${cell.mass.toFixed(2)} / ${divisionMassOf(genome).toFixed(1)}`),
    fact('Energy', cell.energy.toFixed(2)),
    ...TRAITS.filter((trait) => trait.key !== 'divisionSize' && trait.key !== 'lifespan').map((trait) => fact(trait.label, trait.min < 0 ? signed(genome[trait.key]) : genome[trait.key].toFixed(2))),
    fact('Mutation rate', genome.mutationRate.toFixed(3)),
  ].join('');
}

function refreshSpeedLabel() {
  find('[data-speed-label]').textContent = `${TICKS_PER_FRAME[state.speed]}×`;
}

function frame(now) {
  if (!state.paused) {
    const started = performance.now();
    for (let done = 0; done < TICKS_PER_FRAME[state.speed] && performance.now() - started < FRAME_BUDGET_MS; done++) {
      state.world.step();
      if (state.world.tick % CHART_EVERY_TICKS === 0) chart.record(state.world.tick, state.world.cells.length);
    }
  }
  renderer.draw(state.world, state);
  if (now - state.lastPanelRefresh > PANEL_REFRESH_MS) {
    state.lastPanelRefresh = now;
    refreshPanel();
  }
  window.requestAnimationFrame(frame);
}

find('[data-pause]').addEventListener('click', (event) => {
  state.paused = !state.paused;
  event.currentTarget.textContent = state.paused ? 'Play' : 'Pause';
});

for (const button of document.querySelectorAll('[data-speed-step]')) {
  button.addEventListener('click', () => {
    state.speed = Math.min(TICKS_PER_FRAME.length - 1, Math.max(0, state.speed + Number(button.dataset.speedStep)));
    refreshSpeedLabel();
  });
}

find('[data-colour]').addEventListener('change', (event) => {
  state.colourMode = event.target.value;
});

find('[data-pond]').addEventListener('click', (event) => {
  const point = renderer.toWorld(event.clientX, event.clientY);
  const cell = state.world.cellAt(point.x, point.y, point.reach);
  state.selectedId = cell ? cell.id : null;
  cellCard.hidden = !cell;
  refreshCellCard();
});

find('[data-cell-close]').addEventListener('click', () => {
  state.selectedId = null;
  cellCard.hidden = true;
});

settings.addEventListener('input', (event) => {
  refreshSettingLabels();
  if (event.target.name === 'light') state.world.light = Number(event.target.value);
});

settings.addEventListener('submit', (event) => {
  event.preventDefault();
  startPond();
});

find('[data-new-seed]').addEventListener('click', () => {
  settings.elements.seed.value = 1 + Math.floor(Math.random() * 999999);
  startPond();
});

new ResizeObserver(() => renderer.resize()).observe(find('[data-pond]'));
new ResizeObserver(() => chart.resize()).observe(find('[data-population-chart]'));

refreshSettingLabels();
refreshSpeedLabel();
startPond();
window.requestAnimationFrame(frame);
