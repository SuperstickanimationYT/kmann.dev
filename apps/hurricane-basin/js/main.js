import { DX, DY, lonAt, latAt, NX, NY } from './grid.js';
import { createRenderer } from './render.js';

const HOUR = 3600;
const DAY = 24 * HOUR;
const SEASON_START = Date.UTC(2026, 7, 20);
const HOURS_PER_SECOND = [1, 2, 3, 6, 12];
const DEFAULT_SPEED = 2;
const LONGEST_FRAME_SECONDS = 0.1;
const PICK_RADIUS_PX = 28;
const MOTION_WINDOW_SECONDS = 12 * HOUR;
const SLOWED_BELOW = 0.85;
const DEPTH = 1000;
const TOOLBAR_GAP_PX = 8;

const find = (selector) => document.querySelector(selector);
const canvas = find('[data-map]');
const form = find('[data-controls]');
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

const view = {
  land: new Uint8Array(NX * NY),
  seaTemperature: new Float32Array(NX * NY),
  h: new Float32Array(NX * NY).fill(DEPTH),
  q: new Float32Array(NX * NY),
  speed: new Float32Array(NX * NY),
  warming: 0,
  pressureAt: (cell) => 1012 + 0.11 * (view.h[cell] - DEPTH),
};
const renderer = createRenderer(canvas, view);
const state = { tool: 'watch', paused: false, speed: DEFAULT_SPEED, layer: 'satellite', tracks: true, seconds: 0, storms: [], selectedId: null, waiting: false, owed: 0, achieved: HOURS_PER_SECOND[DEFAULT_SPEED] };
const pace = { simulated: 0, since: performance.now() };

const send = (type, details = {}) => worker.postMessage({ type, ...details });
const showing = () => state.storms.filter((storm) => storm.showing);
const selectedStorm = () => state.storms.find((storm) => storm.id === state.selectedId) ?? null;
const speedText = (metresPerSecond) => `${Math.round(metresPerSecond * 2.237)} mph · ${Math.round(metresPerSecond * 3.6)} km/h`;
const compass = (degrees) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((degrees % 360) + 360) % 360) / 45) % 8];

function motionOf(storm) {
  const since = storm.track.findLast((point) => storm.seen - point.seconds >= MOTION_WINDOW_SECONDS) ?? storm.track[0];
  const hours = (storm.seen - since.seconds) / HOUR;
  if (!hours) return 'just formed';
  const across = storm.i - since.i;
  const east = (Math.abs(across) > NX / 2 ? across - Math.sign(across) * NX : across) * DX;
  const north = (storm.j - since.j) * DY;
  const kmPerHour = Math.hypot(east, north) / 1000 / hours;
  if (kmPerHour < 2) return 'stationary';
  return `${compass((Math.atan2(east, north) * 180) / Math.PI)} at ${Math.round(kmPerHour)} km/h`;
}

function showCard() {
  const storm = selectedStorm();
  const card = find('[data-storm-card]');
  card.hidden = !storm;
  if (!storm) return;
  const gone = !storm.showing;
  find('[data-storm-name]').textContent = storm.name ?? 'Unnamed depression';
  find('[data-storm-category]').textContent = gone ? 'Dissipated' : storm.category.label;
  find('[data-storm-category]').style.color = gone ? '' : storm.category.colour;
  const facts = gone
    ? [
        ['Peak wind', speedText(storm.peakWind)],
        ['Lowest pressure', `${Math.round(storm.lowestPressure)} hPa`],
        ['Lasted', `${((storm.seen - storm.born) / DAY).toFixed(1)} days`],
      ]
    : [
        ['Wind', speedText(storm.wind)],
        ['Pressure', `${Math.round(storm.pressure)} hPa`],
        ['Moving', motionOf(storm)],
        ['Position', `${latAt(storm.j).toFixed(1)}°N ${(-lonAt(storm.i)).toFixed(1)}°W`],
        ['Peak so far', speedText(storm.peakWind)],
      ];
  find('[data-storm-facts]').replaceChildren(...facts.flatMap(([term, value]) => [Object.assign(document.createElement('dt'), { textContent: term }), Object.assign(document.createElement('dd'), { textContent: value })]));
}

function setTool(tool) {
  state.tool = tool;
  canvas.dataset.tool = tool;
  document.querySelectorAll('[data-tool-pick]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.toolPick === tool)));
}

function setSpeed(index) {
  state.speed = Math.max(0, Math.min(HOURS_PER_SECOND.length - 1, index));
  showControls();
}

function showControls() {
  find('[data-speed-label]').textContent = `${HOURS_PER_SECOND[state.speed]} h/s`;
  document.querySelectorAll('[data-speed-step]').forEach((button) => (button.disabled = state.speed === (button.dataset.speedStep > 0 ? HOURS_PER_SECOND.length - 1 : 0)));
  find('[data-pause]').textContent = state.paused ? 'Play' : 'Pause';
  const warming = Number(form.warming.value);
  find('[data-warming-label]').textContent = warming ? `${warming > 0 ? '+' : '−'}${Math.abs(warming)} °C` : 'today';
  find('[data-steering-label]').textContent = `${Math.round(Number(form.steering.value) * 100)}%`;
}

function stormNear(x, y) {
  let nearest = null;
  let nearestDistance = PICK_RADIUS_PX;
  for (const storm of showing()) {
    const [sx, sy] = renderer.toScreen(storm.i, storm.j);
    const distance = Math.hypot(sx - x, sy - y);
    if (distance < nearestDistance) [nearest, nearestDistance] = [storm, distance];
  }
  return nearest;
}

function tap(event) {
  const box = canvas.getBoundingClientRect();
  const [x, y] = [event.clientX - box.left, event.clientY - box.top];
  if (state.tool === 'watch') {
    state.selectedId = stormNear(x, y)?.id ?? null;
    showCard();
    return;
  }
  const [column, row] = renderer.toGrid(x, y);
  if (column < 0 || column >= NX || row < 2 || row >= NY - 2) return;
  send('seed', { kind: state.tool, column, row });
}

function start() {
  send('start', { scenario: form.scenario.value });
  state.selectedId = null;
  showCard();
}

function bind() {
  canvas.addEventListener('click', tap);
  document.querySelectorAll('[data-tool-pick]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.toolPick)));
  document.querySelectorAll('[data-speed-step]').forEach((button) => button.addEventListener('click', () => setSpeed(state.speed + Number(button.dataset.speedStep))));
  find('[data-pause]').addEventListener('click', () => {
    state.paused = !state.paused;
    showControls();
  });
  find('[data-layer]').addEventListener('change', (event) => (state.layer = event.target.value));
  find('[data-storm-close]').addEventListener('click', () => {
    state.selectedId = null;
    showCard();
  });
  form.addEventListener('submit', (event) => event.preventDefault());
  find('[data-start]').addEventListener('click', start);
  form.warming.addEventListener('input', () => {
    view.warming = Number(form.warming.value);
    send('warming', { degrees: view.warming });
    showControls();
  });
  form.steering.addEventListener('input', () => {
    send('steering', { share: Number(form.steering.value) });
    showControls();
  });
  form.waves.addEventListener('change', () => send('waves', { on: form.waves.checked }));
  form.tracks.addEventListener('change', () => (state.tracks = form.tracks.checked));
  find('[data-clear-tracks]').addEventListener('click', () => send('clearGone'));
  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;
    event.preventDefault();
    find('[data-pause]').click();
  });
  worker.addEventListener('message', receive);
  const toolbar = find('.hb-toolbar');
  const fitMap = () => renderer.resize(toolbar.getBoundingClientRect().bottom - canvas.getBoundingClientRect().top + TOOLBAR_GAP_PX);
  const watcher = new ResizeObserver(fitMap);
  watcher.observe(canvas);
  watcher.observe(toolbar);
}

function showStatus() {
  const date = new Date(SEASON_START + state.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', timeZone: 'UTC' });
  const named = showing().filter((storm) => storm.name).length;
  const wanted = HOURS_PER_SECOND[state.speed];
  const slowed = !state.paused && state.achieved < wanted * SLOWED_BELOW ? ` · running at ${state.achieved.toFixed(1)} h/s` : '';
  find('[data-status]').textContent = `${date} · ${named ? `${named} named ${named === 1 ? 'storm' : 'storms'}` : 'no named storms'}${state.paused ? ' · paused' : ''}${slowed}`;
}

function receive({ data }) {
  if (data.type === 'ready') {
    view.land.set(data.land);
    view.seaTemperature.set(data.seaTemperature);
    return;
  }
  Object.assign(view, { h: data.h, q: data.q, speed: data.speed });
  Object.assign(state, { seconds: data.seconds, storms: data.storms, waiting: false });
  state.owed = Math.max(0, state.owed - data.advanced);
  pace.simulated += data.advanced;
  if (state.selectedId !== null) showCard();
}

let lastTime = null;

function frame(time) {
  const seconds = lastTime === null ? 0 : Math.min(LONGEST_FRAME_SECONDS, (time - lastTime) / 1000);
  lastTime = time;
  const wanted = HOURS_PER_SECOND[state.speed] * HOUR;
  if (!state.paused) state.owed = Math.min(state.owed + seconds * wanted, wanted);
  if (!state.waiting) {
    send('advance', { seconds: state.paused ? 0 : state.owed });
    state.waiting = true;
  }
  if (time - pace.since >= 1000) {
    state.achieved = pace.simulated / HOUR / ((time - pace.since) / 1000);
    Object.assign(pace, { simulated: 0, since: time });
  }
  renderer.draw({ layer: state.layer, storms: state.storms, showing: showing(), showTracks: state.tracks, selected: selectedStorm(), time: time / 1000 });
  showStatus();
  requestAnimationFrame(frame);
}

bind();
setSpeed(DEFAULT_SPEED);
requestAnimationFrame(frame);
