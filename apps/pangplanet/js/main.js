import { createDrill, deployDrill, drillAwaitingClick, drillBusy, startDrilling, stopDrill, updateDrill } from './drill.js';
import { createHud } from './hud.js';
import { advance, altitude, bearingBetween, createRocket, forecast, placeOnSurface, wrapAngle } from './physics.js';
import { createRenderer } from './render.js';
import { loadSprites } from './sprites.js';
import { BODIES, FUEL_PACK, HOME_BODY, MARKET, MAX_FUEL, STARTING_GALACTOKENS, TICKS_PER_SECOND } from './world.js';

const STEP_TICKS = 0.5;
const STEP_SECONDS = STEP_TICKS / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 8;
const THROTTLE_PER_TICK = 5;
const TURN_PER_TICK = (3 * Math.PI) / 180;
const CAMERA_EASE_PER_TICK = 1 / 20;
const ZOOM_STEP = 1.1;
const ZOOM_LIMITS = { min: 0.0003, max: 8 };
const TIMEWARP_LIMITS = { min: 1, max: 100 };
const FORECAST_STEPS = 1500;
const FORECAST_STEP_TICKS = 3;
const EXPLOSION_TICKS = 35;

const SOUNDS = { machine: 'sfx/machine.wav', blender: 'sfx/blender.mp3', buzzWhir: 'sfx/buzz-whir.wav' };
const audio = Object.fromEntries(Object.entries(SOUNDS).map(([name, src]) => [name, new Audio(src)]));

function play(name) {
  const voice = audio[name].cloneNode();
  voice.play().catch(() => {});
}

const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

const stage = document.querySelector('[data-stage]');
const canvas = stage.querySelector('canvas');

const game = {
  rocket: createRocket(),
  drill: createDrill(),
  camera: { x: 0, y: 0, angle: 0, zoom: 1 },
  galactokens: STARTING_GALACTOKENS,
  timewarp: 1,
  explosion: null,
  panel: 'help',
  forecast: null,
};

const held = new Set();
const isHeld = (...keys) => keys.some((key) => held.has(key));

function landedBody() {
  const { rocket } = game;
  return rocket.landed && rocket.soi >= 0 ? BODIES[rocket.soi] : null;
}

function canDock() {
  const { rocket } = game;
  return !rocket.destroyed && game.panel !== 'market' && Math.hypot(rocket.x - MARKET.x, rocket.y - MARKET.y) < MARKET.dockingRange;
}

function openPanel(name) {
  game.panel = name;
  hud.showPanel(name);
}

const actions = {
  closePanels: () => openPanel(null),
  toggleHelp: () => openPanel(game.panel === 'help' ? null : 'help'),
  mine: () => {
    if (landedBody()?.kind !== 'planemo') return;
    deployDrill(game.drill, play);
    openPanel(null);
  },
  stopDrill: () => stopDrill(game.drill, play),
  buyFuel: () => {
    const { rocket } = game;
    if (game.galactokens < FUEL_PACK.cost || rocket.fuel > MAX_FUEL - FUEL_PACK.amount) return;
    rocket.fuel += FUEL_PACK.amount;
    game.galactokens -= FUEL_PACK.cost;
  },
};

const hud = createHud(stage, actions);

function dock() {
  if (!canDock()) return;
  Object.assign(game.rocket, { vx: 0, vy: 0, engineOn: false });
  openPanel('market');
}

function respawn() {
  const { rocket } = game;
  if (!rocket.destroyed) return;
  const crashedInto = BODIES[rocket.soi];
  const survivable = crashedInto?.kind === 'planemo';
  const body = survivable ? crashedInto : BODIES[HOME_BODY];
  placeOnSurface(rocket, body, survivable ? bearingBetween(body.x, body.y, rocket.x, rocket.y) : 0);
  rocket.destroyed = false;
  game.explosion = null;
}

function changeTimewarp(change) {
  game.timewarp = clamp(game.timewarp + change, TIMEWARP_LIMITS);
}

function changeZoom(factor) {
  game.camera.zoom = clamp(game.camera.zoom * factor, ZOOM_LIMITS);
}

const KEY_ACTIONS = {
  ' ': () => {
    const { rocket } = game;
    if (!rocket.destroyed && rocket.fuel > 0) rocket.engineOn = !rocket.engineOn;
  },
  f: dock,
  g: actions.stopDrill,
  c: respawn,
  h: actions.toggleHelp,
  '?': actions.toggleHelp,
  Escape: actions.closePanels,
  ',': () => changeTimewarp(-1),
  '.': () => changeTimewarp(1),
  '<': () => changeTimewarp(-1),
  '>': () => changeTimewarp(1),
  '=': () => changeZoom(ZOOM_STEP),
  '+': () => changeZoom(ZOOM_STEP),
  '-': () => changeZoom(1 / ZOOM_STEP),
};

const GAME_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (GAME_KEYS.has(key)) event.preventDefault();
  held.add(key);
  if (event.repeat && key === ' ') return;
  KEY_ACTIONS[key]?.();
});

window.addEventListener('keyup', (event) => held.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
window.addEventListener('blur', () => held.clear());

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    const outward = delta > 0;
    if (event.shiftKey) changeTimewarp(outward ? -1 : 1);
    else changeZoom(outward ? 1 / ZOOM_STEP : ZOOM_STEP);
  },
  { passive: false },
);

canvas.addEventListener('pointerdown', (event) => {
  const { rocket, drill } = game;
  if (drillAwaitingClick(drill) && renderer.hitsDrill(rocket, drill, event.clientX, event.clientY)) {
    startDrilling(drill, play);
    return;
  }
  if (!rocket.destroyed && renderer.hitsRocket(rocket, event.clientX, event.clientY)) openPanel('rocket');
});

function steer() {
  const { rocket } = game;
  const throttleChange = THROTTLE_PER_TICK * STEP_TICKS;
  if (isHeld('Shift', 'ArrowUp')) rocket.throttle += throttleChange;
  if (isHeld('Control', 'ArrowDown')) rocket.throttle -= throttleChange;
  rocket.throttle = clamp(rocket.throttle, { min: 0, max: 100 });
  const turn = TURN_PER_TICK * STEP_TICKS;
  if (isHeld('q', 'ArrowLeft')) rocket.heading -= turn;
  if (isHeld('e', 'ArrowRight')) rocket.heading += turn;
}

function explode() {
  const { rocket, drill } = game;
  game.explosion = { x: rocket.x, y: rocket.y, size: 1, ghost: 0, ticks: 0 };
  stopDrill(drill, play);
  if (game.panel === 'rocket') openPanel(null);
}

function simulate() {
  const { rocket } = game;
  let simTicks = 0;
  for (let i = 0; i < game.timewarp && !rocket.destroyed; i++) {
    if (advance(rocket, STEP_TICKS) === 'crash') explode();
    simTicks += STEP_TICKS;
  }
  return simTicks;
}

function cameraTarget() {
  const { rocket } = game;
  if (rocket.soi < 0) return 0;
  const body = BODIES[rocket.soi];
  return bearingBetween(body.x, body.y, rocket.x + rocket.vx, rocket.y + rocket.vy);
}

function followRocket() {
  const { camera, rocket } = game;
  const ease = 1 - (1 - CAMERA_EASE_PER_TICK) ** STEP_TICKS;
  camera.angle = wrapAngle(camera.angle + wrapAngle(cameraTarget() - camera.angle) * ease);
  camera.x = rocket.x;
  camera.y = rocket.y;
}

function animateExplosion() {
  const { explosion } = game;
  if (!explosion || explosion.ticks >= EXPLOSION_TICKS) return;
  const growth = 1 - 0.75 ** STEP_TICKS;
  explosion.size += (5 - explosion.size) * growth;
  explosion.ghost += STEP_TICKS / EXPLOSION_TICKS;
  explosion.ticks += STEP_TICKS;
}

function tick() {
  steer();
  const simTicks = simulate();
  const { rocket, drill } = game;
  if (!rocket.landed && drillBusy(drill)) stopDrill(drill, play);
  updateDrill(drill, rocket, STEP_TICKS, simTicks, play);
  followRocket();
  animateExplosion();
}

function status() {
  const { rocket, drill } = game;
  const body = rocket.soi >= 0 ? BODIES[rocket.soi] : null;
  const fuelFull = rocket.fuel > MAX_FUEL - FUEL_PACK.amount;
  const broke = game.galactokens < FUEL_PACK.cost;
  return {
    galactokens: game.galactokens,
    fuel: rocket.fuel,
    timewarp: game.timewarp,
    location: body ? body.name : 'Deep space',
    altitude: altitude(rocket),
    speed: Math.hypot(rocket.vx, rocket.vy),
    throttle: rocket.throttle,
    engineOn: rocket.engineOn,
    canDock: canDock(),
    destroyed: rocket.destroyed,
    canMine: landedBody()?.kind === 'planemo' && !drillBusy(drill),
    drillBusy: drillBusy(drill),
    drillAwaitingClick: drillAwaitingClick(drill),
    canBuy: !broke && !fuelFull,
    marketNote: broke ? 'Not enough galactokens.' : fuelFull ? 'Tank is full.' : '',
  };
}

let renderer;
let lastTime = 0;
let backlog = 0;

function frame(time) {
  backlog += Math.min((time - lastTime) / 1000, STEP_SECONDS * MAX_STEPS_PER_FRAME);
  lastTime = time;
  while (backlog >= STEP_SECONDS) {
    tick();
    backlog -= STEP_SECONDS;
  }
  const { rocket } = game;
  game.forecast = rocket.landed || rocket.destroyed ? null : forecast(rocket, FORECAST_STEPS, FORECAST_STEP_TICKS);
  renderer.draw(game);
  hud.update(status());
  window.requestAnimationFrame(frame);
}

async function start() {
  renderer = createRenderer(canvas, await loadSprites());
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  hud.showPanel(game.panel);
  window.requestAnimationFrame((time) => {
    lastTime = time;
    frame(time);
  });
}

start();
