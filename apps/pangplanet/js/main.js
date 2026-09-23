import { createDrill, deployDrill, drillAwaitingClick, drillBusy, startDrilling, stopDrill, updateDrill } from './drill.js';
import { createHud } from './hud.js';
import { advance, altitude, bearingBetween, createRocket, forecast, placeOnSurface, wrapAngle } from './physics.js';
import { createRenderer } from './render.js';
import { chargeBatteries, chargedBatteries, createPower, freeBatterySlots, losePowerCargo, sunlight, togglePanels } from './solar.js';
import { loadSprites } from './sprites.js';
import { bakeNextTexture, loadTextureStamps } from './textures.js';
import { streamSectors } from './universe.js';
import { canWarpFrom, jumpTo, totalCharge, warpDestinations } from './warp.js';
import {
  BATTERY,
  FUEL_PACK,
  HOME_BODY,
  MARKET,
  MAX_FUEL,
  SOLAR_PANELS,
  STARTING_GALACTOKENS,
  TICKS_PER_SECOND,
  WARP_DRIVE,
} from './world.js';

const STEP_TICKS = 0.5;
const STEP_SECONDS = STEP_TICKS / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 8;
const THROTTLE_PER_TICK = 5;
const TURN_PER_TICK = (3 * Math.PI) / 180;
const CAMERA_EASE_PER_TICK = 1 / 20;
const ZOOM_STEP = 1.1;
const ZOOM_LIMITS = { min: 0.00002, max: 8 };
const TIMEWARP_LIMITS = { min: 1, max: 100 };
const FORECAST_STEPS = 1500;
const FORECAST_STEP_TICKS = 3;
const EXPLOSION_TICKS = 35;
const WARP_TICKS = 60;
const ARRIVAL_VIEW_IN_STANDOFFS = 3;
const CHEAT_GALACTOKENS = 10000;

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
  power: createPower(),
  camera: { x: 0, y: 0, angle: 0, zoom: 1 },
  galactokens: STARTING_GALACTOKENS,
  timewarp: 1,
  explosion: null,
  warp: null,
  ownsWarpDrive: false,
  panel: 'help',
  forecast: null,
};

const held = new Set();
const isHeld = (...keys) => keys.some((key) => held.has(key));

function landedBody() {
  const { rocket } = game;
  return rocket.landed ? rocket.soi : null;
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
  togglePanels: () => togglePanels(game.power, game.rocket),
  buyPanels: () => {
    if (game.power.ownsPanels || game.galactokens < SOLAR_PANELS.cost) return;
    game.power.ownsPanels = true;
    game.galactokens -= SOLAR_PANELS.cost;
  },
  buyBattery: () => {
    if (freeBatterySlots(game.power) < 1 || game.galactokens < BATTERY.cost) return;
    game.power.batteries.push(0);
    game.galactokens -= BATTERY.cost;
  },
  buyWarpDrive: () => {
    if (game.ownsWarpDrive || game.galactokens < WARP_DRIVE.cost) return;
    game.ownsWarpDrive = true;
    game.galactokens -= WARP_DRIVE.cost;
  },
  openWarp: () => openPanel(game.panel === 'warp' ? null : 'warp'),
  warpTo: (starName) => {
    const { rocket, power } = game;
    if (!game.ownsWarpDrive || game.warp || !canWarpFrom(rocket)) return;
    const destination = warpDestinations(rocket, power).find(({ star, affordable }) => star.name === starName && affordable);
    if (!destination) return;
    game.warp = { destination, progress: 0, jumped: false };
    rocket.engineOn = false;
    openPanel(null);
  },
  toggleCheats: () => openPanel(game.panel === 'cheats' ? null : 'cheats'),
  cheat: (name) => CHEATS[name]?.(),
  sellBatteries: () => {
    const { power } = game;
    game.galactokens += chargedBatteries(power) * BATTERY.sellPrice;
    power.batteries = power.batteries.filter((charge) => charge < 1);
  },
};

const CHEATS = {
  galactokens: () => {
    game.galactokens += CHEAT_GALACTOKENS;
  },
  fuel: () => {
    game.rocket.fuel = MAX_FUEL;
  },
  unlockAll: () => {
    game.power.ownsPanels = true;
    game.ownsWarpDrive = true;
  },
  chargeBatteries: () => {
    game.power.batteries = Array(BATTERY.slots).fill(1);
  },
  goHome: () => {
    const { rocket, drill } = game;
    stopDrill(drill, play);
    placeOnSurface(rocket, HOME_BODY, 0);
    Object.assign(rocket, { soi: HOME_BODY, destroyed: false, engineOn: false });
    game.explosion = null;
    streamSectors(rocket.x, rocket.y);
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
  const crashedInto = rocket.soi;
  const survivable = crashedInto?.kind === 'planemo';
  const body = survivable ? crashedInto : HOME_BODY;
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
  p: actions.togglePanels,
  w: actions.openWarp,
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

const PHYSICAL_KEY_ACTIONS = {
  Backquote: actions.toggleCheats,
};

const GAME_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (GAME_KEYS.has(key)) event.preventDefault();
  held.add(key);
  if (event.repeat && key === ' ') return;
  (KEY_ACTIONS[key] ?? PHYSICAL_KEY_ACTIONS[event.code])?.();
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
  losePowerCargo(game.power);
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
  const body = rocket.soi;
  if (!body) return 0;
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

function advanceWarp() {
  const { warp, rocket, power } = game;
  warp.progress = Math.min(1, warp.progress + STEP_TICKS / WARP_TICKS);
  if (!warp.jumped && warp.progress >= 0.5) {
    jumpTo(rocket, power, warp.destination);
    streamSectors(rocket.x, rocket.y);
    const { star } = warp.destination;
    const standoff = Math.hypot(rocket.x - star.x, rocket.y - star.y);
    game.camera.zoom = clamp(renderer.zoomShowing(standoff * ARRIVAL_VIEW_IN_STANDOFFS), ZOOM_LIMITS);
    followRocket();
    warp.jumped = true;
  }
  if (warp.progress >= 1) game.warp = null;
}

function tick() {
  if (game.warp) {
    advanceWarp();
    return;
  }
  steer();
  const simTicks = simulate();
  const { rocket, drill, power } = game;
  streamSectors(rocket.x, rocket.y);
  if (!rocket.landed && drillBusy(drill)) stopDrill(drill, play);
  updateDrill(drill, rocket, STEP_TICKS, simTicks, play);
  if (rocket.engineOn) power.panelsDeployed = false;
  chargeBatteries(power, rocket, STEP_TICKS);
  followRocket();
  animateExplosion();
}

function marketNote() {
  const { rocket, power, galactokens } = game;
  if (galactokens < Math.min(FUEL_PACK.cost, BATTERY.cost) && chargedBatteries(power) === 0) return 'Not enough galactokens.';
  if (!power.ownsPanels) return 'Solar panels charge batteries near a star.';
  if (power.batteries.length === 0) return 'Charge empty batteries near the Sun, then sell them back here.';
  if (rocket.fuel > MAX_FUEL - FUEL_PACK.amount) return 'Tank is full.';
  return '';
}

function warpNote(destinations) {
  const { rocket, power } = game;
  if (!game.ownsWarpDrive) return `Buy the warp drive at the market for ${WARP_DRIVE.cost.toLocaleString()} galactokens.`;
  if (!canWarpFrom(rocket)) return "Leave this body's gravity before warping.";
  if (destinations.length === 0) return 'No stars in range.';
  return `Charge on board: ${totalCharge(power).toFixed(2)} batteries.`;
}

function status() {
  const { rocket, drill, power } = game;
  const body = rocket.soi;
  const fuelFull = rocket.fuel > MAX_FUEL - FUEL_PACK.amount;
  const destinations = game.panel === 'warp' && game.ownsWarpDrive && canWarpFrom(rocket) ? warpDestinations(rocket, power) : [];
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
    canBuy: game.galactokens >= FUEL_PACK.cost && !fuelFull,
    sunlight: sunlight(rocket.x, rocket.y),
    batteries: power.batteries,
    ownsPanels: power.ownsPanels,
    panelsDeployed: power.panelsDeployed,
    canBuyPanels: !power.ownsPanels && game.galactokens >= SOLAR_PANELS.cost,
    canBuyBattery: freeBatterySlots(power) > 0 && game.galactokens >= BATTERY.cost,
    canSellBatteries: chargedBatteries(power) > 0,
    marketNote: marketNote(),
    ownsWarpDrive: game.ownsWarpDrive,
    canBuyWarpDrive: !game.ownsWarpDrive && game.galactokens >= WARP_DRIVE.cost,
    warpDestinations: destinations,
    warpNote: warpNote(destinations),
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
  bakeNextTexture();
  hud.update(status());
  window.requestAnimationFrame(frame);
}

async function start() {
  const [sprites] = await Promise.all([loadSprites(), loadTextureStamps()]);
  renderer = createRenderer(canvas, sprites);
  streamSectors(game.rocket.x, game.rocket.y);
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  hud.showPanel(game.panel);
  window.requestAnimationFrame((time) => {
    lastTime = time;
    frame(time);
  });
}

start();
