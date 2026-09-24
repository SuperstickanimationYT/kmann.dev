import { createDrill, deployDrill, drillAwaitingClick, drillBusy, startDrilling, stopDrill, updateDrill } from './drill.js';
import { abbreviate, createHud } from './hud.js';
import { advance, altitude, bearingBetween, createRocket, forecast, placeOnSurface, sphereOfInfluence, wrapAngle } from './physics.js';
import { createRenderer } from './render.js';
import {
  chargeBatteries,
  chargedBatteries,
  createPower,
  freeBatterySlots,
  losePowerCargo,
  roomToCharge,
  storedCharge,
  sunlight,
  togglePanels,
  transferCharge,
} from './solar.js';
import {
  chargeSatellite,
  collectGold,
  createBank,
  createRig,
  createSatellite,
  deployBank,
  deployRig,
  deploySatellite,
  loadRig,
  rigSecondsLeft,
  runRig,
  takeSatelliteCharge,
  withinReach,
} from './outposts.js';
import {
  createDrone,
  dockFlight,
  finishRecording,
  flyDrone,
  inSignal,
  launchDrone,
  noteControls,
  noteEvent,
  noteStep,
  parkDrone,
  poseOf,
  refuelCost,
  routeProgress,
  startRecording,
  stowDrone,
  traceRoute,
} from './drones.js';
import { createGalaxyMap } from './galaxy-map.js';
import { applyUpgrades, bountyWaiting, claimBounty, createUpgrades, nextUpgrade, upgradeValue } from './progression.js';
import { deleteSave, readSave, writeSave } from './save.js';
import { chartVisitsNear, createStarChart, isCharted, scanFrom } from './starchart.js';
import { loadSprites } from './sprites.js';
import { bakeNextTexture, loadTextureStamps } from './textures.js';
import { bindHoldButtons, bindPinchZoom, bindTapButtons, bindVerticalSlider } from './touch.js';
import { outsideGalaxy, starsWithin, streamSectors, systemAt } from './universe.js';
import { canWarpFrom, jumpTo, totalCharge, warpDestinations } from './warp.js';
import {
  ANTENNA,
  BATTERY,
  BATTERY_BANK,
  DRONE,
  FUEL_PACK,
  GOLD,
  HOME_BODY,
  HOME_SYSTEM,
  MARKET,
  MINING_RIG,
  SATELLITE,
  SOLAR_PANELS,
  STARTING_GALACTOKENS,
  TELESCOPE,
  TICKS_PER_SECOND,
  UPGRADES,
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
const FORECAST_STEPS = 1500;
const FORECAST_STEP_TICKS = 3;
const EXPLOSION_TICKS = 35;
const WARP_TICKS = 60;
const AUTOSAVE_MS = 5000;
const SAVED_ROCKET_FIELDS = ['x', 'y', 'vx', 'vy', 'heading', 'throttle', 'fuel', 'destroyed'];
const ARRIVAL_VIEW_IN_STANDOFFS = 3;
const CHEAT_GALACTOKENS = 10000;
const CHEAT_SKIP_SECONDS = 600;
const CHEAT_REVEAL_RANGE = 1.5e8;
const CHART_EVERY_TICKS = 30;

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
  satellite: null,
  rig: null,
  bank: null,
  antennas: [],
  antennasInHold: 0,
  drone: null,
  recording: null,
  gold: 0,
  upgrades: createUpgrades(),
  claimedBounties: new Set(),
  starChart: createStarChart(),
  ownsTelescope: false,
  mapSelection: null,
  mapPlanet: null,
  panel: 'help',
  forecast: null,
};

applyUpgrades(game.upgrades, game.rocket, game.power);

const held = new Set();
const isHeld = (...keys) => keys.some((key) => held.has(key));

function landedBody() {
  const { rocket } = game;
  return rocket.landed ? rocket.soi : null;
}

function dockTarget() {
  const { rocket } = game;
  if (rocket.destroyed || game.warp) return null;
  if (Math.hypot(rocket.x - MARKET.x, rocket.y - MARKET.y) < MARKET.dockingRange) return 'market';
  if (withinReach(rocket, game.satellite, SATELLITE.dockingRange)) return 'satellite';
  if (withinReach(rocket, game.bank, BATTERY_BANK.dockingRange)) return 'bank';
  if (rocket.landed && withinReach(rocket, game.rig, MINING_RIG.reach)) return 'rig';
  if (nearDrone()) return 'drone';
  return null;
}

const distanceFromRocket = (spot) => Math.hypot(game.rocket.x - spot.x, game.rocket.y - spot.y);
const nearestAntenna = () => (game.rocket.landed ? game.antennas.find((antenna) => distanceFromRocket(antenna) < ANTENNA.reach) : null);

function nearDrone() {
  const { rocket, drone } = game;
  if (!drone?.pad || game.recording) return false;
  if (drone.lost) return distanceFromRocket(drone.flight) < DRONE.padReach;
  return rocket.landed && distanceFromRocket(drone.pad) < DRONE.padReach;
}

function canDock() {
  const target = dockTarget();
  return Boolean(target) && game.panel !== target;
}

const canDeploySatellite = () => game.satellite && !game.satellite.deployed && !game.rocket.soi && !game.rocket.destroyed;
const canDeployRig = () => game.rig && !game.rig.deployed && landedBody()?.kind === 'planemo';
const onHomeGround = () => landedBody()?.kind === 'planemo' && HOME_SYSTEM.includes(landedBody());
const canDeployAntenna = () => game.antennasInHold > 0 && onHomeGround();
const canDeployDrone = () => game.drone && !game.drone.pad && onHomeGround() && inSignal(game.antennas, game.rocket.x, game.rocket.y);
const canDeployBank = () => game.bank && !game.bank.deployed && !game.rocket.soi && !game.rocket.destroyed;

function noteRecording(name) {
  if (game.recording) noteEvent(game.recording, name);
}

function stopRecording(message) {
  if (!game.recording) return;
  game.recording = null;
  game.drone.running = Boolean(game.drone.route);
  hud.toast(message);
}

function canFinishRecording() {
  const { recording, rocket, drone } = game;
  return Boolean(recording) && recording.steps > 0 && rocket.landed && distanceFromRocket(drone.pad) < DRONE.padReach;
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
    if (game.galactokens < FUEL_PACK.cost || rocket.fuel > rocket.fuelCapacity - FUEL_PACK.amount) return;
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
  buyUpgrade: (key) => {
    const upgrade = nextUpgrade(key, game.upgrades[key]);
    if (!upgrade || game.galactokens < upgrade.cost) return;
    game.galactokens -= upgrade.cost;
    game.upgrades[key] += 1;
    applyUpgrades(game.upgrades, game.rocket, game.power);
  },
  buyTelescope: () => {
    if (game.ownsTelescope || game.galactokens < TELESCOPE.cost) return;
    game.ownsTelescope = true;
    game.galactokens -= TELESCOPE.cost;
  },
  scan: () => {
    const { rocket } = game;
    if (!game.ownsTelescope || rocket.destroyed) return;
    const found = scanFrom(game.starChart, rocket.x, rocket.y, telescopeRange());
    hud.toast(found ? `Telescope found ${found} new star${found === 1 ? '' : 's'}.` : 'No new stars in telescope range.');
  },
  toggleMap: () => openPanel(game.panel === 'map' ? null : 'map'),
  mapView: (mode) => {
    galaxyMap.showView(mode);
    game.mapPlanet = null;
  },
  mapCloseUp: () => {
    const system = closeUpSystem();
    if (!system) return;
    galaxyMap.showSystem(system);
    game.mapPlanet = null;
  },
  mapZoom: (direction) => galaxyMap.zoom(direction),
  pickOnMap: (clientX, clientY) => {
    const picked = galaxyMap.pick(game.starChart, clientX, clientY);
    if (galaxyMap.showingSystem()) game.mapPlanet = picked;
    else game.mapSelection = picked;
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
    const destination = chartedDestinations().find(({ star, affordable }) => star.name === starName && affordable);
    if (!destination) return;
    stopRecording("Warp jumps can't be part of a drone route. Recording stopped.");
    game.warp = { destination, progress: 0, jumped: false };
    rocket.engineOn = false;
    openPanel(null);
  },
  restart: () => {
    if (!window.confirm('Start over from the beginning? Your saved progress will be deleted.')) return;
    restarting = true;
    deleteSave();
    window.location.reload();
  },
  toggleCheats: () => openPanel(game.panel === 'cheats' ? null : 'cheats'),
  cheat: (name) => CHEATS[name]?.(),
  buySatellite: () => {
    if (game.satellite || game.galactokens < SATELLITE.cost) return;
    game.satellite = createSatellite();
    game.galactokens -= SATELLITE.cost;
  },
  deploySatellite: () => {
    if (!canDeploySatellite()) return;
    deploySatellite(game.satellite, game.rocket);
    openPanel(null);
  },
  takeSatelliteCharge: () => {
    if (!game.satellite) return;
    takeSatelliteCharge(game.satellite, game.power);
    noteRecording('takeSatellite');
  },
  pickUpSatellite: () => {
    if (!game.satellite) return;
    game.satellite.deployed = false;
    openPanel(null);
  },
  buyRig: () => {
    if (game.rig || game.galactokens < MINING_RIG.cost) return;
    game.rig = createRig();
    game.galactokens -= MINING_RIG.cost;
  },
  deployRig: () => {
    if (!canDeployRig()) return;
    deployRig(game.rig, game.rocket);
    openPanel(null);
  },
  loadRig: () => {
    if (!game.rig) return;
    loadRig(game.rig, game.power);
    noteRecording('loadRig');
  },
  collectGold: () => {
    if (game.rig) game.gold += collectGold(game.rig);
  },
  pickUpRig: () => {
    if (!game.rig) return;
    game.gold += collectGold(game.rig);
    game.rig.deployed = false;
    openPanel(null);
  },
  sellGold: () => {
    game.galactokens += game.gold * GOLD.sellPrice;
    game.gold = 0;
  },
  buyBank: () => {
    if (game.bank || game.galactokens < BATTERY_BANK.cost) return;
    game.bank = createBank();
    game.galactokens -= BATTERY_BANK.cost;
  },
  deployBank: () => {
    if (!canDeployBank()) return;
    deployBank(game.bank, game.rocket);
    openPanel(null);
  },
  depositInBank: () => {
    if (!game.bank) return;
    transferCharge(game.power.batteries, game.bank.batteries);
    noteRecording('depositInBank');
  },
  takeFromBank: () => {
    if (!game.bank) return;
    transferCharge(game.bank.batteries, game.power.batteries);
    noteRecording('takeFromBank');
  },
  pickUpBank: () => {
    if (!game.bank) return;
    game.bank.deployed = false;
    openPanel(null);
  },
  buyAntenna: () => {
    if (game.galactokens < ANTENNA.cost) return;
    game.antennasInHold += 1;
    game.galactokens -= ANTENNA.cost;
  },
  deployAntenna: () => {
    if (!canDeployAntenna()) return;
    game.antennas.push(poseOf(game.rocket));
    game.antennasInHold -= 1;
    openPanel(null);
  },
  pickUpAntenna: () => {
    const antenna = nearestAntenna();
    if (!antenna) return;
    game.antennas.splice(game.antennas.indexOf(antenna), 1);
    game.antennasInHold += 1;
    openPanel(null);
  },
  buyDrone: () => {
    if (game.drone || game.galactokens < DRONE.cost) return;
    game.drone = createDrone();
    game.galactokens -= DRONE.cost;
  },
  deployDrone: () => {
    if (!canDeployDrone()) return;
    parkDrone(game.drone, game.rocket);
    openPanel(null);
  },
  recordRoute: () => {
    const { drone, rocket } = game;
    if (!drone?.pad || drone.flight || !rocket.landed) return;
    game.recording = startRecording(drone, rocket);
    openPanel(null);
  },
  finishRecording: () => {
    if (!canFinishRecording()) return;
    finishRecording(game.drone, game.recording);
    game.recording = null;
    hud.toast('Route saved. The drone flies it on repeat.');
  },
  cancelRecording: () => stopRecording('Recording cancelled.'),
  openDrone: () => {
    if (nearDrone()) openPanel('drone');
  },
  toggleDroneRuns: () => {
    const { drone } = game;
    if (drone?.route && !drone.lost) drone.running = !drone.running;
  },
  pickUpDrone: () => {
    const { drone } = game;
    if (!drone || (drone.flight && !drone.lost)) return;
    stowDrone(drone);
    openPanel(null);
  },
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
    game.rocket.fuel = game.rocket.fuelCapacity;
  },
  unlockAll: () => {
    game.power.ownsPanels = true;
    game.ownsWarpDrive = true;
  },
  chargeBatteries: () => {
    game.power.batteries = Array(game.power.slots).fill(1);
  },
  skipTenMinutes: () => {
    advanceOutposts(CHEAT_SKIP_SECONDS);
    catchUpDrone(CHEAT_SKIP_SECONDS);
  },
  revealNearby: () => scanFrom(game.starChart, game.rocket.x, game.rocket.y, CHEAT_REVEAL_RANGE),
  goHome: () => {
    const { rocket, drill } = game;
    stopRecording('Teleported. Recording stopped.');
    stopDrill(drill, play);
    placeOnSurface(rocket, HOME_BODY, 0);
    Object.assign(rocket, { soi: HOME_BODY, destroyed: false, engineOn: false });
    game.explosion = null;
    streamSectors(rocket.x, rocket.y);
  },
};

const hud = createHud(stage, actions);
const galaxyMap = createGalaxyMap(stage.querySelector('[data-map]'));

function dock() {
  if (!canDock()) return;
  if (!game.rocket.landed) {
    Object.assign(game.rocket, { vx: 0, vy: 0, engineOn: false });
    noteRecording('dock');
  }
  openPanel(dockTarget());
}

function advanceOutposts(seconds) {
  chargeSatellite(game.satellite, seconds);
  runRig(game.rig, seconds);
}

let outpostClock = Date.now();

function catchUpOutposts() {
  const now = Date.now();
  advanceOutposts((now - outpostClock) / 1000);
  outpostClock = now;
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
  game.timewarp = clamp(game.timewarp + change, { min: 1, max: timewarpCap() });
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
  m: actions.toggleMap,
  t: actions.scan,
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

bindHoldButtons(stage, { hold: (key) => held.add(key), release: (key) => held.delete(key) });
bindTapButtons(stage, (key) => KEY_ACTIONS[key]?.());
bindPinchZoom(canvas, changeZoom);
bindVerticalSlider(stage.querySelector('[data-warp-slider]'), stage.querySelector('[data-warp-track]'), (fraction) => {
  game.timewarp = Math.min(timewarpCap(), Math.round(1 + fraction * (timewarpBought() - 1)));
});

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
  stopRecording('Crashed. Recording stopped.');
  losePowerCargo(game.power);
  if (game.panel === 'rocket') openPanel(null);
}

const telescopeRange = () => upgradeValue('telescope', game.upgrades.telescope);
const timewarpBought = () => upgradeValue('timewarp', game.upgrades.timewarp);
const inGravityWell = () => Boolean(game.rocket.soi);
const timewarpCap = () => (inGravityWell() ? 1 : timewarpBought());

const chartedDestinations = () => warpDestinations(game.rocket, game.power).filter(({ star }) => isCharted(game.starChart, star));

let ticksSinceCharting = CHART_EVERY_TICKS;

function chartVisits() {
  ticksSinceCharting += STEP_TICKS;
  if (ticksSinceCharting < CHART_EVERY_TICKS) return;
  ticksSinceCharting = 0;
  const { rocket } = game;
  if (chartVisitsNear(game.starChart, rocket.x, rocket.y)) hud.toast('New star system added to your galaxy map.');
}

const closeUpSystem = () => (game.mapSelection?.visited ? systemAt(game.mapSelection.x, game.mapSelection.y) : null);

function planetInfo(planet) {
  const waiting = bountyWaiting(game.claimedBounties, planet);
  const details = [
    planet.name,
    `${abbreviate(planet.radius)} radius`,
    waiting ? `${waiting} bounty waiting` : null,
    planet.bounty && !waiting ? 'bounty claimed' : null,
    `${abbreviate(Math.hypot(planet.x - game.rocket.x, planet.y - game.rocket.y))} away`,
  ];
  return details.filter(Boolean).join(' · ');
}

function mapInfo() {
  if (galaxyMap.showingSystem()) return game.mapPlanet ? planetInfo(game.mapPlanet) : `${game.mapSelection.name} system. Tap a planet for details.`;
  const entry = game.mapSelection;
  if (!entry) return 'Tap a star for details.';
  const { rocket } = game;
  const distance = Math.hypot(entry.x - rocket.x, entry.y - rocket.y);
  const details = [
    entry.name,
    `${entry.planets} planet${entry.planets === 1 ? '' : 's'}`,
    entry.bounty ? `up to ${entry.bounty} in bounties` : null,
    entry.visited ? 'visited' : 'seen through telescope',
    `${abbreviate(distance)} away`,
    game.ownsWarpDrive && distance <= WARP_DRIVE.range ? 'in warp range' : null,
  ];
  return details.filter(Boolean).join(' · ');
}

function rewardFirstLanding() {
  const body = game.rocket.soi;
  const bounty = claimBounty(game.claimedBounties, body);
  if (!bounty) return;
  game.galactokens += bounty;
  hud.toast(`First landing on ${body.name}! +${bounty} galactokens`);
}

const DRONE_ACTIONS = {
  dock: dockFlight,
  takeSatellite: (flight, drone) => {
    if (withinReach(flight, game.satellite, SATELLITE.dockingRange)) transferCharge(game.satellite.batteries, drone.batteries);
  },
  takeFromBank: (flight, drone) => {
    if (withinReach(flight, game.bank, BATTERY_BANK.dockingRange)) transferCharge(game.bank.batteries, drone.batteries);
  },
  depositInBank: (flight, drone) => {
    if (withinReach(flight, game.bank, BATTERY_BANK.dockingRange)) transferCharge(drone.batteries, game.bank.batteries);
  },
  loadRig: (flight, drone) => {
    if (withinReach(flight, game.rig, MINING_RIG.reach)) loadRig(game.rig, drone);
  },
};

const droneAction = (name, flight, drone) => DRONE_ACTIONS[name](flight, drone);

function stepDrone() {
  const { drone } = game;
  if (!drone?.pad) return;
  if (!drone.flight) {
    if (!drone.running || game.galactokens < refuelCost(drone)) return;
    game.galactokens -= refuelCost(drone);
    launchDrone(drone);
  }
  const outcome = flyDrone(drone, game.antennas, droneAction, STEP_TICKS);
  if (outcome === 'crash') {
    game.drone = null;
    hud.toast('Your drone crashed and was destroyed.');
  }
  if (outcome === 'lost') hud.toast('Your drone lost signal and is drifting. Fly out and pick it up.');
}

let tracedFor = '';
let tracedPath = [];

function routePath() {
  const { drone, antennas } = game;
  if (!drone?.route) return [];
  const signature = [drone.route.steps, drone.pad.x, drone.pad.y, ...antennas.flatMap(({ x, y }) => [x, y])].join();
  if (signature !== tracedFor) {
    tracedFor = signature;
    tracedPath = traceRoute(drone, antennas, STEP_TICKS);
  }
  return tracedPath;
}

function catchUpDrone(seconds) {
  const steps = (Math.min(seconds, DRONE.catchUpSeconds) * TICKS_PER_SECOND) / STEP_TICKS;
  for (let i = 0; i < steps && game.drone; i++) stepDrone();
}

function simulate() {
  const { rocket } = game;
  let simTicks = 0;
  for (let i = 0; i < game.timewarp && !rocket.destroyed; i++) {
    if (game.recording) noteControls(game.recording, rocket);
    const fuelBefore = rocket.fuel;
    const hit = advance(rocket, STEP_TICKS);
    if (game.recording) noteStep(game.recording, fuelBefore, rocket);
    if (hit === 'crash') explode();
    if (hit === 'land') rewardFirstLanding();
    if (game.recording && !inSignal(game.antennas, rocket.x, rocket.y)) stopRecording('Out of antenna range. Recording stopped.');
    stepDrone();
    simTicks += STEP_TICKS;
    game.timewarp = Math.min(game.timewarp, timewarpCap());
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
  chartVisits();
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
  if (rocket.fuel > rocket.fuelCapacity - FUEL_PACK.amount) return 'Tank is full.';
  return '';
}

function warpNote(destinations, unchartedInRange) {
  const { rocket, power } = game;
  if (!game.ownsWarpDrive) return `Buy the warp drive at the market for ${WARP_DRIVE.cost.toLocaleString()} galactokens.`;
  if (!canWarpFrom(rocket)) return "Leave this body's gravity before warping.";
  if (destinations.length === 0 && unchartedInRange > 0) return `${unchartedInRange} star${unchartedInRange === 1 ? '' : 's'} in range but not on your galaxy map. Scan with a telescope to find ${unchartedInRange === 1 ? 'it' : 'them'}.`;
  if (destinations.length === 0) return 'No known stars in range.';
  return `Charge on board: ${totalCharge(power).toFixed(2)} batteries.`;
}

function droneStatus() {
  const { drone } = game;
  if (!drone) return '';
  if (drone.lost) return 'No signal. The drone is drifting; fly close and pick it up.';
  if (!drone.route) return 'No route yet. Record one: fly the trip yourself from here, then land back beside the drone.';
  const carrying = `Carrying ${storedCharge(drone.batteries).toFixed(2)} of ${DRONE.batteries} batteries.`;
  const fuel = `Each run burns ${drone.route.fuel.toFixed(1)} fuel, bought for 1 galactoken each.`;
  if (drone.flight) return `Flying its route, ${Math.round(routeProgress(drone) * 100)}% done${drone.running ? '' : ', then parking'}. ${carrying} ${fuel}`;
  if (!drone.running) return `Parked. ${carrying} ${fuel}`;
  return `Waiting for ${refuelCost(drone)} galactokens to refuel. ${carrying} ${fuel}`;
}

function status() {
  const { rocket, drill, power } = game;
  const body = rocket.soi;
  const fuelFull = rocket.fuel > rocket.fuelCapacity - FUEL_PACK.amount;
  const planningWarp = game.panel === 'warp' && game.ownsWarpDrive && canWarpFrom(rocket);
  const destinations = planningWarp ? chartedDestinations() : [];
  const unchartedInRange = planningWarp ? warpDestinations(rocket, power).length - destinations.length : 0;
  return {
    galactokens: game.galactokens,
    fuel: rocket.fuel,
    fuelFraction: rocket.fuel / rocket.fuelCapacity,
    upgrades: Object.keys(UPGRADES).filter((key) => key !== 'telescope' || game.ownsTelescope).map((key) => {
      const next = nextUpgrade(key, game.upgrades[key]);
      return { key, current: upgradeValue(key, game.upgrades[key]), next, affordable: Boolean(next) && game.galactokens >= next.cost };
    }),
    bountyHere: body ? bountyWaiting(game.claimedBounties, body) : 0,
    timewarp: game.timewarp,
    timewarpBought: timewarpBought(),
    timewarpHeld: inGravityWell(),
    location: body ? body.name : outsideGalaxy(rocket.x, rocket.y) ? 'Outside the galaxy' : 'Deep space',
    altitude: altitude(rocket),
    speed: Math.hypot(rocket.vx, rocket.vy),
    throttle: rocket.throttle,
    engineOn: rocket.engineOn,
    canDock: canDock(),
    dockAction:
      {
        market: 'enter the market',
        satellite: 'dock with the satellite',
        bank: 'use the battery bank',
        rig: 'use the mining rig',
        drone: 'use the drone',
      }[dockTarget()] ?? '',
    gold: game.gold,
    satellite: game.satellite,
    rig: game.rig && { ...game.rig, secondsLeft: rigSecondsLeft(game.rig) },
    canBuySatellite: !game.satellite && game.galactokens >= SATELLITE.cost,
    canBuyRig: !game.rig && game.galactokens >= MINING_RIG.cost,
    canDeploySatellite: Boolean(canDeploySatellite()),
    canDeployRig: Boolean(canDeployRig()),
    canTakeSatelliteCharge: Boolean(game.satellite) && roomToCharge(power.batteries) > 0 && storedCharge(game.satellite.batteries) > 0,
    canLoadRig: Boolean(game.rig) && game.rig.charge < MINING_RIG.batterySlots && storedCharge(power.batteries) > 0,
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
    warpNote: warpNote(destinations, unchartedInRange),
    ownsTelescope: game.ownsTelescope,
    canBuyTelescope: !game.ownsTelescope && game.galactokens >= TELESCOPE.cost,
    mapInfo: mapInfo(),
    canCloseUp: Boolean(game.mapSelection?.visited) && !galaxyMap.showingSystem(),
    bank: game.bank,
    canBuyBank: !game.bank && game.galactokens >= BATTERY_BANK.cost,
    canDeployBank: Boolean(canDeployBank()),
    canDepositInBank: Boolean(game.bank) && storedCharge(power.batteries) > 0 && roomToCharge(game.bank.batteries) > 0,
    canTakeFromBank: Boolean(game.bank) && roomToCharge(power.batteries) > 0 && storedCharge(game.bank.batteries) > 0,
    canPickUpAntenna: Boolean(nearestAntenna()),
    nearDrone: nearDrone(),
    antennasInHold: game.antennasInHold,
    canBuyAntenna: game.galactokens >= ANTENNA.cost,
    canDeployAntenna: Boolean(canDeployAntenna()),
    ownsDrone: Boolean(game.drone),
    canBuyDrone: !game.drone && game.galactokens >= DRONE.cost,
    canDeployDrone: Boolean(canDeployDrone()),
    droneStatus: droneStatus(),
    canRecordRoute: Boolean(game.drone?.pad) && !game.drone.flight && rocket.landed,
    canToggleDroneRuns: Boolean(game.drone?.route) && !game.drone.lost,
    droneRunning: Boolean(game.drone?.running),
    canPickUpDrone: Boolean(game.drone) && (!game.drone.flight || game.drone.lost),
    recordingSeconds: game.recording ? game.recording.steps * STEP_SECONDS : null,
    canFinishRecording: canFinishRecording(),
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
  catchUpOutposts();
  renderer.draw(game, routePath());
  if (game.panel === 'map') {
    galaxyMap.draw({
      chart: game.starChart,
      rocket,
      warpRange: game.ownsWarpDrive ? WARP_DRIVE.range : 0,
      telescopeRange: game.ownsTelescope ? telescopeRange() : 0,
      bountyWaiting: (planet) => bountyWaiting(game.claimedBounties, planet),
      routePath: routePath(),
      drone: game.drone && (game.drone.flight ?? game.drone.pad),
    });
  }
  bakeNextTexture();
  hud.update(status());
  window.requestAnimationFrame(frame);
}

let restarting = false;

function snapshot() {
  catchUpOutposts();
  const { rocket, power, camera } = game;
  return {
    galactokens: game.galactokens,
    ownsWarpDrive: game.ownsWarpDrive,
    timewarp: game.timewarp,
    zoom: camera.zoom,
    rocket: Object.fromEntries(SAVED_ROCKET_FIELDS.map((field) => [field, rocket[field]])),
    power: { ownsPanels: power.ownsPanels, panelsDeployed: power.panelsDeployed, batteries: power.batteries },
    satellite: game.satellite,
    rig: game.rig,
    bank: game.bank,
    antennas: game.antennas,
    antennasInHold: game.antennasInHold,
    drone: game.drone && { ...game.drone, flight: game.drone.flight && { ...game.drone.flight, soi: null } },
    gold: game.gold,
    upgrades: game.upgrades,
    claimedBounties: [...game.claimedBounties],
    starChart: [...game.starChart],
    ownsTelescope: game.ownsTelescope,
  };
}

function save() {
  if (!restarting) writeSave(snapshot());
}

function restore(saved) {
  const { rocket, power, camera } = game;
  Object.assign(rocket, saved.rocket, { engineOn: false });
  Object.assign(power, saved.power);
  Object.assign(game, { galactokens: saved.galactokens, ownsWarpDrive: saved.ownsWarpDrive, panel: null });
  Object.assign(game, { satellite: saved.satellite ?? null, rig: saved.rig ?? null, gold: saved.gold ?? 0 });
  Object.assign(game, { bank: saved.bank ?? null, antennas: saved.antennas ?? [], antennasInHold: saved.antennasInHold ?? 0, drone: saved.drone ?? null });
  game.upgrades = { ...createUpgrades(), ...saved.upgrades };
  game.timewarp = Math.min(saved.timewarp, timewarpBought());
  game.claimedBounties = new Set(saved.claimedBounties ?? []);
  game.starChart = new Map(saved.starChart ?? []);
  game.ownsTelescope = saved.ownsTelescope ?? false;
  applyUpgrades(game.upgrades, rocket, power);
  outpostClock = saved.savedAt;
  camera.zoom = saved.zoom;
  streamSectors(rocket.x, rocket.y);
  rocket.soi = sphereOfInfluence(rocket.x, rocket.y);
}

function startAutosave() {
  window.setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}

async function start() {
  const saved = readSave();
  if (saved) restore(saved);
  startAutosave();
  const [sprites] = await Promise.all([loadSprites(), loadTextureStamps()]);
  renderer = createRenderer(canvas, sprites);
  streamSectors(game.rocket.x, game.rocket.y);
  if (saved) catchUpDrone((Date.now() - saved.savedAt) / 1000);
  chartVisitsNear(game.starChart, game.rocket.x, game.rocket.y);
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  hud.showPanel(game.panel);
  window.requestAnimationFrame((time) => {
    lastTime = time;
    frame(time);
  });
}

start();
