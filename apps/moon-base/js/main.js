import { STEP, click, createGame, cycleMode, findPad, setPointer, step } from './base.js';
import { MODE_BADGE, drawBase } from './base-view.js';
import {
  WARPS, createFlight, deltaVLeft, describeTime, readout, refreshPrediction, setThrottle, setWarp, updateFlight,
} from './flight.js';
import { ZOOM_RANGE, createCamera, drawFlight } from './flight-view.js';
import { handleMenuAction, menuTitle, renderGoals, renderInventory, renderMenu } from './menus.js';
import { CORRIDOR, judgeEntry } from './orbit.js';
import { practiceRocket } from './rocket.js';
import { loadCostumes } from './sprites.js';
import { playSound, setWalking } from './sounds.js';

const $ = (selector) => document.querySelector(selector);
const stage = $('.mb-stage');
const baseCanvas = $('[data-base]');
const baseContext = baseCanvas.getContext('2d');
const flightCanvas = $('[data-flight]');
const flightContext = flightCanvas.getContext('2d');
const menu = $('[data-menu]');
const menuBody = $('[data-menu-body]');
const dialog = $('[data-dialog]');
const flightHud = $('[data-flight-hud]');
const flightControls = $('[data-flight-controls]');

let game = createGame();
let menuTarget = null;
let flight = null;
let camera = createCamera();
let accumulator = 0;
let lastFrame = 0;
let lastMenuHtml = '';
let lastPanelHtml = '';
const flightKeys = new Set();

function fitCanvas(canvas, context, logicalWidth) {
  const ratio = window.devicePixelRatio || 1;
  const box = stage.getBoundingClientRect();
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  const scale = (box.width * ratio) / (logicalWidth || box.width);
  context.setTransform(scale, 0, 0, scale, 0, 0);
}

function resize() {
  fitCanvas(baseCanvas, baseContext, 480);
  fitCanvas(flightCanvas, flightContext);
}

function stagePoint(event) {
  const box = baseCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - box.left) / box.width) * 480 - 240,
    y: 180 - ((event.clientY - box.top) / box.height) * 360,
  };
}

function openMenu(target) {
  menuTarget = target;
  lastMenuHtml = '';
  menu.hidden = false;
  $('[data-menu-title]').textContent = menuTitle(target);
}

function closeMenu() {
  menuTarget = null;
  menu.hidden = true;
}

function showDialog(title, text, actions) {
  $('[data-dialog-title]').textContent = title;
  $('[data-dialog-text]').textContent = text;
  const holder = $('[data-dialog-actions]');
  holder.replaceChildren(...actions.map(([label, run]) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', () => {
      dialog.hidden = true;
      run();
    });
    return element;
  }));
  dialog.hidden = false;
}

function restart() {
  game = createGame();
  closeMenu();
  leaveFlight();
  dialog.hidden = true;
}

function enterFlight(rocket, practice) {
  if (!practice && !window.confirm('Launch for real? There is no coming back to the base.')) return;
  closeMenu();
  if (!practice) game.milestones.add('launched');
  flight = createFlight(rocket, practice);
  refreshPrediction(flight);
  camera = createCamera();
  baseCanvas.hidden = true;
  flightCanvas.hidden = false;
  flightHud.hidden = false;
  flightControls.hidden = false;
  $('[data-focus]').value = camera.focus;
  $('[data-flight-tag]').textContent = practice ? 'Simulation' : 'Flight home';
  $('[data-quit]').textContent = practice ? 'End simulation' : 'Give up';
  setWalking(false);
  resize();
}

function leaveFlight() {
  flight = null;
  baseCanvas.hidden = false;
  flightCanvas.hidden = true;
  flightHud.hidden = true;
  flightControls.hidden = true;
}

function flightOver() {
  const { kind, title, detail } = flight.outcome;
  if (flight.practice) {
    const rocket = flight.rocket;
    showDialog(`Simulation: ${title}`, detail, [
      ['Fly again', () => enterFlight(rocket, true)],
      ['Back to base', leaveFlight],
    ]);
  } else if (kind === 'win') {
    showDialog(title, `${detail} From a crash-landed lander to a ride home.`, [['Play again', restart]]);
  } else {
    showDialog(title, `${detail} The crew did not make it.`, [['Play again', restart]]);
  }
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return 'escape';
  if (Math.abs(meters) >= 1e6) return `${(meters / 1000).toLocaleString('en', { maximumFractionDigits: 0 })} km`;
  if (Math.abs(meters) >= 1e4) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function forecast() {
  const prediction = flight.prediction;
  if (flight.landed) return 'On the ground. Throttle up to lift off.';
  if (!prediction || !prediction.event) return 'Coasting: no impact in the next 15 days.';
  const event = prediction.event;
  const wait = describeTime(event.t - flight.s.t);
  if (event.kind === 'moon') return `Hits the Moon in ${wait}.`;
  if (event.kind === 'lost') return `Leaves the Earth–Moon system in ${wait}.`;
  const verdict = judgeEntry(event.angle);
  const note = verdict === 'good' ? 'inside the corridor ✔' : verdict === 'shallow' ? 'too shallow, would skip off' : 'too steep, would burn up';
  return `Earth entry in ${wait} at ${event.angle.toFixed(1)}°: ${note} (aim ${CORRIDOR.shallow}° to ${CORRIDOR.steep}°).`;
}

function updateFlightHud() {
  const r = readout(flight);
  const rows = [
    ['Near', r.body === 'moon' ? 'Moon' : 'Earth'],
    ['Altitude', formatDistance(r.altitude)],
    ['Speed', `${Math.round(r.body === 'moon' ? r.surfaceSpeed : r.speed)} m/s`],
    ['Vertical', `${Math.round(r.verticalSpeed)} m/s`],
    ['Nose from up', `${Math.round(r.pitchFromVertical)}°`],
    ['Lowest point', flight.landed ? '—' : formatDistance(r.periapsis)],
    ['Highest point', flight.landed ? '—' : formatDistance(r.apoapsis)],
    ['Δv left', `${Math.round(deltaVLeft(flight))} m/s`],
    ['Propellant', `${(flight.propellant / 1000).toFixed(2)} t`],
    ['Clock', r.time],
  ];
  $('[data-flight-readout]').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('[data-forecast]').textContent = forecast();
  $('[data-throttle-label]').textContent = `${Math.round(flight.throttle * 100)}%`;
  $('[data-warp-label]').textContent = `${WARPS[flight.warpIndex].toLocaleString('en')}×`;
  for (const holdButton of document.querySelectorAll('[data-hold]')) {
    holdButton.setAttribute('aria-pressed', String(holdButton.dataset.hold === flight.hold));
  }
}

function flightTurn() {
  return (flightKeys.has('a') || flightKeys.has('arrowleft') || flightKeys.has('turn-left') ? 1 : 0)
    - (flightKeys.has('d') || flightKeys.has('arrowright') || flightKeys.has('turn-right') ? 1 : 0);
}

function frameFlight(dt) {
  const throttleChange = (flightKeys.has('w') || flightKeys.has('arrowup') ? 1 : 0) - (flightKeys.has('s') || flightKeys.has('arrowdown') ? 1 : 0);
  if (throttleChange) setThrottle(flight, flight.throttle + throttleChange * dt * 0.8);
  updateFlight(flight, dt, flightTurn());
  const box = stage.getBoundingClientRect();
  drawFlight(flightContext, flight, camera, box.width, box.height);
  updateFlightHud();
  if (flight.outcome && dialog.hidden) flightOver();
}

function renderPanels() {
  const html = renderGoals(game) + renderInventory(game);
  if (html === lastPanelHtml) return;
  lastPanelHtml = html;
  $('[data-goals]').innerHTML = renderGoals(game);
  $('[data-inventory]').innerHTML = renderInventory(game);
}

function frameBase(dt) {
  accumulator = Math.min(accumulator + dt, 0.25);
  const wasPlaying = game.phase === 'playing';
  while (accumulator >= STEP) {
    step(game);
    accumulator -= STEP;
  }
  for (const name of game.events.splice(0)) playSound(name);
  setWalking(game.phase === 'playing' && game.player.walking);
  drawBase(baseContext, game);
  if (menuTarget) {
    const html = renderMenu(game, menuTarget);
    if (html !== lastMenuHtml) {
      menuBody.innerHTML = html;
      lastMenuHtml = html;
    }
  }
  renderPanels();
  if (wasPlaying && game.phase === 'dead') {
    closeMenu();
    setWalking(false);
    showDialog(game.cause, deathText(game.cause), [['Try again', restart]]);
  }
}

function deathText(cause) {
  if (cause === 'Hypercapnia') return 'Carbon dioxide built up past 10. Keep the Air Generator running with a charged battery and water.';
  if (cause === 'Hypoxia') return 'Oxygen fell below 80. Leaks from the vacuum and breathing both use it up.';
  return 'Oxygen rose past 120. Turn the Air Generator down to 2 once the CO₂ is cleared.';
}

function frame(now) {
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (flight) frameFlight(dt);
  else frameBase(dt);
  requestAnimationFrame(frame);
}

baseCanvas.addEventListener('pointermove', (event) => {
  const point = stagePoint(event);
  setPointer(game, point.x, point.y);
});

baseCanvas.addEventListener('pointerdown', async (event) => {
  const point = stagePoint(event);
  setPointer(game, point.x, point.y);
  if (game.phase === 'playing' && point.x >= MODE_BADGE.left && point.x <= MODE_BADGE.right && point.y >= MODE_BADGE.bottom && point.y <= MODE_BADGE.top) {
    cycleMode(game);
    return;
  }
  const opened = click(game, point.x, point.y);
  if (!opened) return;
  closeMenu();
  const target = await opened;
  if (target && !flight && game.phase === 'playing') openMenu(target);
});

menu.addEventListener('click', (event) => {
  const element = event.target.closest('[data-action]');
  if (!element || !menuTarget) return;
  handleMenuAction(game, menuTarget, element, enterFlight);
  lastMenuHtml = '';
});

$('[data-menu-close]').addEventListener('click', closeMenu);

$('[data-practice]').addEventListener('click', () => {
  const pad = findPad(game);
  const rocket = pad && pad.rocket.capsule && pad.rocket.engine && pad.rocket.tanks > 0 && pad.rocket.propellant > 0 ? pad.rocket : practiceRocket();
  enterFlight(rocket, true);
});

function onFlightKey(key) {
  if (key === 'z') setThrottle(flight, 1);
  if (key === 'x') setThrottle(flight, 0);
  if (key === ',') setWarp(flight, flight.warpIndex - 1);
  if (key === '.') setWarp(flight, flight.warpIndex + 1);
  if (key === 'p') flight.hold = flight.hold === 'prograde' ? 'off' : 'prograde';
  if (key === 'r') flight.hold = flight.hold === 'retrograde' ? 'off' : 'retrograde';
  if (key === '+' || key === '=') zoom(0.5);
  if (key === '-') zoom(2);
}

function zoom(factor) {
  camera.metersPerPixel = Math.max(ZOOM_RANGE.min, Math.min(ZOOM_RANGE.max, camera.metersPerPixel * factor));
}

function typing(event) {
  return event.target instanceof Element && event.target.closest('input, select, textarea');
}

window.addEventListener('keydown', (event) => {
  if (typing(event) || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (flight) {
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
    flightKeys.add(key);
    if (!event.repeat && !flight.outcome) onFlightKey(key);
    return;
  }
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  if (key === 'escape') closeMenu();
  if (event.repeat) return;
  if (key === ' ' && game.phase === 'playing') cycleMode(game);
  else if (key === 'i') game.showHud = !game.showHud;
  else game.keys.add(key);
});

window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  game.keys.delete(key);
  flightKeys.delete(key);
});

window.addEventListener('blur', () => {
  game.keys.clear();
  flightKeys.clear();
});

flightCanvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  zoom(event.deltaY > 0 ? 1.25 : 0.8);
}, { passive: false });

flightControls.addEventListener('pointerdown', (event) => {
  const turn = event.target.closest('[data-turn]');
  if (!turn) return;
  const key = turn.dataset.turn === '1' ? 'turn-left' : 'turn-right';
  flightKeys.add(key);
  const release = () => flightKeys.delete(key);
  window.addEventListener('pointerup', release, { once: true });
  window.addEventListener('pointercancel', release, { once: true });
});

flightControls.addEventListener('click', (event) => {
  const element = event.target.closest('button');
  if (!element || !flight || flight.outcome) return;
  const { hold, throttle, throttleStep, warpStep } = element.dataset;
  if (hold) flight.hold = hold;
  if (throttle !== undefined) setThrottle(flight, Number(throttle));
  if (throttleStep) setThrottle(flight, Math.round((flight.throttle + Number(throttleStep)) * 10) / 10);
  if (warpStep) setWarp(flight, flight.warpIndex + Number(warpStep));
  if (element.dataset.zoom) zoom(Number(element.dataset.zoom));
  if (element.hasAttribute('data-quit')) {
    if (flight.practice) leaveFlight();
    else if (window.confirm('Give up? The mission ends here.')) {
      flight.outcome = { kind: 'lost', title: 'Mission abandoned', detail: 'You stopped flying.' };
    }
  }
});

$('[data-focus]').addEventListener('change', (event) => {
  camera.focus = event.target.value;
});

window.addEventListener('resize', resize);
resize();
await loadCostumes();
requestAnimationFrame(frame);
