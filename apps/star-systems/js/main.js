import { SYSTEMS, AU_KM, SUN_KM, EARTH_KM } from './systems.js';
import { positions, daysSinceJ2000, J2000_MS, DAY_MS } from './kepler.js';
import { createCamera, updateCamera, zoomAt, panBy, flyTo, scaleToFit, clampScale } from './camera.js';
import { render, formatNumber } from './render.js';

const canvas = document.querySelector('[data-stage]');
const context = canvas.getContext('2d');
const controls = document.querySelector('[data-controls]');
const systemButtons = document.querySelector('[data-systems]');
const bodyButtons = document.querySelector('[data-bodies]');
const systemName = document.querySelector('[data-system-name]');
const systemDistance = document.querySelector('[data-system-distance]');
const systemBlurb = document.querySelector('[data-system-blurb]');
const selectedCard = document.querySelector('[data-selected]');
const selectedName = document.querySelector('[data-selected-name]');
const selectedKind = document.querySelector('[data-selected-kind]');
const selectedFacts = document.querySelector('[data-selected-facts]');
const selectedNote = document.querySelector('[data-selected-note]');
const pauseButton = document.querySelector('[data-pause]');
const speedLabel = document.querySelector('[data-speed-label]');
const dateLabel = document.querySelector('[data-date]');

const CLICK_SLOP_PX = 5;
const HIT_PADDING_PX = 8;

const camera = createCamera();
const state = {
  system: SYSTEMS[0],
  days: daysSinceJ2000(Date.now()),
  daysPerSecond: 10,
  paused: false,
  selected: null,
  placed: new Map(),
  drawn: [],
  layers: { orbits: true, habitable: true, labels: true },
};

function findBody(name) {
  return state.system.bodies.find((body) => body.name === name);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  camera.width = box.width;
  camera.height = box.height;
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function focusRadiusAU(body) {
  let reach = 0;
  for (const other of state.system.bodies) {
    if (other.parent === body.name) reach = Math.max(reach, other.orbit.a * (1 + other.orbit.e));
  }
  for (const zone of state.system.zones) {
    if (zone.around === body.name && zone.kind !== 'habitable') reach = Math.max(reach, zone.outer);
  }
  if (reach > 0) return reach * 1.15;
  return (body.radiusKm / AU_KM) * 6;
}

function showSystemView() {
  camera.follow = null;
  camera.flight = null;
  camera.x = 0;
  camera.y = 0;
  camera.scale = scaleToFit(camera, state.system.homeAU);
}

function speedFromSlider() {
  return 10 ** Number(controls.elements.speed.value);
}

function formatDuration(days) {
  const seconds = days * 86400;
  if (seconds < 90) return `${formatNumber(seconds)} s`;
  if (seconds < 5400) return `${formatNumber(seconds / 60)} min`;
  if (days < 2) return `${formatNumber(days * 24)} hours`;
  if (days < 730) return `${formatNumber(days)} days`;
  return `${formatNumber(days / 365.25)} years`;
}

function updateSpeedLabel() {
  speedLabel.textContent = `1 s = ${formatDuration(state.daysPerSecond)}`;
}

function formatDate(days) {
  const date = new Date(J2000_MS + days * DAY_MS);
  if (Number.isNaN(date.getTime())) return `year ≈ ${Math.round(2000 + days / 365.25)}`;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRadius(body) {
  const approx = body.radiusEstimated ? '≈ ' : '';
  const km = `${formatNumber(body.radiusKm)} km`;
  if (body.radiusKm > 0.05 * SUN_KM) return `${approx}${formatNumber(body.radiusKm / SUN_KM)} R☉ (${km})`;
  return `${approx}${formatNumber(body.radiusKm / EARTH_KM)} R⊕ (${km})`;
}

function formatMass(body) {
  if (body.massSun) return `${formatNumber(body.massSun)} M☉`;
  const floor = body.minimumMass ? 'at least ' : '';
  return `${floor}${formatNumber(body.massEarth)} M⊕`;
}

function formatOrbit(body) {
  const around = body.parent ?? 'the centre of mass';
  const distance = body.orbit.a < 0.01
    ? `${formatNumber(body.orbit.a * AU_KM)} km`
    : `${formatNumber(body.orbit.a)} AU`;
  return `${distance} from ${around}, every ${formatDuration(body.orbit.periodDays)}`;
}

function describeKind(body) {
  const parts = [];
  if (body.spectral) parts.push(body.spectral);
  parts.push(body.kind === 'remnant' ? 'white dwarf' : body.kind);
  if (body.candidate) parts.push('unconfirmed candidate');
  return parts.join(' · ');
}

function addFact(term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  selectedFacts.append(dt, dd);
}

function showSelected() {
  const body = state.selected && findBody(state.selected);
  selectedCard.hidden = !body;
  for (const button of bodyButtons.children) {
    button.setAttribute('aria-pressed', String(button.dataset.body === state.selected));
  }
  if (!body) return;
  selectedName.textContent = body.name;
  selectedKind.textContent = describeKind(body);
  selectedFacts.replaceChildren();
  addFact('Radius', formatRadius(body));
  addFact('Mass', formatMass(body));
  if (body.temperatureK) addFact('Surface', `${formatNumber(body.temperatureK)} K`);
  if (body.orbit) addFact('Orbit', formatOrbit(body));
  selectedNote.textContent = body.note;
}

function select(name, fly) {
  state.selected = name;
  showSelected();
  if (name && fly) {
    flyTo(camera, name, scaleToFit(camera, focusRadiusAU(findBody(name))), performance.now());
  }
}

function makeButton(label, dataset) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.dataset, dataset);
  return button;
}

function loadSystem(system) {
  state.system = system;
  state.selected = null;
  state.daysPerSecond = system.speed;
  controls.elements.speed.value = Math.log10(system.speed);
  updateSpeedLabel();
  systemName.textContent = system.name;
  systemDistance.textContent = system.distance;
  systemBlurb.textContent = system.blurb;
  for (const button of systemButtons.children) {
    button.setAttribute('aria-pressed', String(button.dataset.system === system.id));
  }
  bodyButtons.replaceChildren(...system.bodies.map((body) => makeButton(body.candidate ? `${body.name}?` : body.name, { body: body.name })));
  showSelected();
  state.placed = positions(system, state.days);
  showSystemView();
  if (window.location.hash.slice(1) !== system.id) history.replaceState(null, '', `#${system.id}`);
}

function bodyAt(x, y) {
  let best = null;
  let bestDistance = Infinity;
  for (const item of state.drawn) {
    const distance = Math.hypot(item.center.x - x, item.center.y - y);
    if (distance <= item.radius + HIT_PADDING_PX && distance - item.radius < bestDistance) {
      best = item.body;
      bestDistance = distance - item.radius;
    }
  }
  return best;
}

const pointers = new Map();
let gesture = null;

function pointerPair() {
  const [a, b] = [...pointers.values()];
  return { midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, spread: Math.hypot(a.x - b.x, a.y - b.y) };
}

function localPoint(event) {
  const box = canvas.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

canvas.addEventListener('pointerdown', (event) => {
  canvas.setPointerCapture(event.pointerId);
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size === 1) gesture = { startX: point.x, startY: point.y, moved: false };
  if (pointers.size === 2) gesture = { pinch: pointerPair(), moved: true };
});

canvas.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  const previous = pointers.get(event.pointerId);
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size === 2 && gesture?.pinch) {
    const pair = pointerPair();
    if (!camera.follow) panBy(camera, pair.midX - gesture.pinch.midX, pair.midY - gesture.pinch.midY);
    zoomAt(camera, pair.midX, pair.midY, pair.spread / Math.max(gesture.pinch.spread, 1));
    gesture.pinch = pair;
    return;
  }
  if (pointers.size !== 1 || !gesture) return;
  if (!gesture.moved && Math.hypot(point.x - gesture.startX, point.y - gesture.startY) < CLICK_SLOP_PX) return;
  gesture.moved = true;
  panBy(camera, point.x - previous.x, point.y - previous.y);
});

function endPointer(event) {
  if (!pointers.has(event.pointerId)) return;
  pointers.delete(event.pointerId);
  if (pointers.size > 0) return;
  if (gesture && !gesture.moved && event.type === 'pointerup') {
    const point = localPoint(event);
    const body = bodyAt(point.x, point.y);
    select(body ? body.name : null, false);
  }
  gesture = null;
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('dblclick', (event) => {
  const point = localPoint(event);
  const body = bodyAt(point.x, point.y);
  if (body) select(body.name, true);
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const point = localPoint(event);
  zoomAt(camera, point.x, point.y, Math.exp(-event.deltaY * 0.0015));
}, { passive: false });

systemButtons.replaceChildren(...SYSTEMS.map((system) => makeButton(system.name, { system: system.id })));
systemButtons.addEventListener('click', (event) => {
  const id = event.target.closest('button')?.dataset.system;
  if (id) loadSystem(SYSTEMS.find((system) => system.id === id));
});

bodyButtons.addEventListener('click', (event) => {
  const name = event.target.closest('button')?.dataset.body;
  if (name) select(name, true);
});

function togglePause() {
  state.paused = !state.paused;
  pauseButton.textContent = state.paused ? 'Play' : 'Pause';
}

pauseButton.addEventListener('click', togglePause);
document.querySelector('[data-now]').addEventListener('click', () => {
  state.days = daysSinceJ2000(Date.now());
});
document.querySelector('[data-overview]').addEventListener('click', showSystemView);
document.querySelector('[data-focus]').addEventListener('click', () => select(state.selected, true));
document.querySelector('[data-deselect]').addEventListener('click', () => select(null, false));

controls.addEventListener('input', (event) => {
  const field = event.target.name;
  if (field === 'speed') {
    state.daysPerSecond = speedFromSlider();
    updateSpeedLabel();
  } else if (field in state.layers) {
    state.layers[field] = event.target.checked;
  }
});
controls.addEventListener('submit', (event) => event.preventDefault());

window.addEventListener('keydown', (event) => {
  if (event.target.closest('input, select, textarea')) return;
  if (event.key === ' ') {
    event.preventDefault();
    togglePause();
  } else if (event.key === 'Escape') {
    select(null, false);
  } else if (event.key === 'f' || event.key === 'F') {
    showSystemView();
  } else if (event.key === '+' || event.key === '=') {
    camera.scale = clampScale(camera.scale * 1.5);
  } else if (event.key === '-') {
    camera.scale = clampScale(camera.scale / 1.5);
  }
});

let lastFrame = performance.now();

function frame(now) {
  const elapsed = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!state.paused) state.days += state.daysPerSecond * elapsed;
  state.placed = positions(state.system, state.days);
  updateCamera(camera, state.placed, now);
  state.drawn = render(context, {
    system: state.system,
    placed: state.placed,
    camera,
    layers: state.layers,
    selectedName: state.selected,
  });
  dateLabel.textContent = formatDate(state.days);
  window.requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
loadSystem(SYSTEMS.find((system) => system.id === window.location.hash.slice(1)) ?? SYSTEMS[0]);
window.requestAnimationFrame(frame);
