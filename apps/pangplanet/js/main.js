import { goodwillFor, mood, priceFromAliens, shiftRelation, speciesByKey, startingRelations, tipPrice } from './aliens.js';
import { createDrill, deployDrill, drillAwaitingClick, drillBusy, startDrilling, stopDrill, updateDrill } from './drill.js';
import { abbreviate, createHud } from './hud.js';
import { advance, altitude, bearingBetween, createRocket, forecast, placeOnSurface, sphereOfInfluence, wrapAngle } from './physics.js';
import { createRenderer } from './render.js';
import {
  brightestStar,
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
  canRescue,
  createDrone,
  dockFlight,
  dronePose,
  flyRescue,
  finishRecording,
  flyDrone,
  inSignal,
  launchDrone,
  launchRescue,
  noteControls,
  noteEvent,
  noteStep,
  parkDrone,
  poseOf,
  refuelCost,
  routeProgress,
  startRecording,
  stowDrone,
  rehearseRoute,
  replayFlight,
} from './drones.js';
import { createGalaxyMap } from './galaxy-map.js';
import { flyShip, launchShip, nextShipDelayTicks, relativeSpeed, shipGone } from './ships.js';
import { createHauler, haulerPose, passTime, removeStop, secondsUntilDue, settleHauler } from './haulers.js';
import { blast, createParticles, drift, exhaust, flash } from './particles.js';
import { applyUpgrades, bodyKey, bountyWaiting, canAfford, claimBounty, createUpgrades, nextUpgrade, risingPrice, upgradeValue } from './progression.js';
import {
  createStudies,
  cruiseSpeed,
  flybyScience,
  flySail,
  launchSail,
  sailDead,
  sailFromOldSave,
  sailPose,
  sailReach,
  sampleScience,
  starAhead,
  study,
  systemsPassed,
} from './science.js';
import { deleteSave, findWorld, markPlayed, readSave, writeSave } from './save.js';
import { showWorldMenu } from './menu.js';
import { VISIT_RANGE, chartVisitsNear, createStarChart, isCharted, scanFrom, stardustTip, starKey } from './starchart.js';
import { loadSprites } from './sprites.js';
import { bakeNextTexture } from './textures.js';
import { bindHoldButtons, bindPinchZoom, bindTapButtons, bindVerticalSlider } from './touch.js';
import { createTour } from './tour.js';
import {
  DEFAULT_GALAXY_SEED,
  SECTOR_SIZE,
  coreGate,
  crystalWorlds,
  homeworldNear,
  homeworldSpecies,
  openGateway,
  outsideGalaxy,
  setBuiltMouths,
  setGalaxySeed,
  stardustWorlds,
  starsWithin,
  streamSectors,
  systemAt,
  systemsWithin,
} from './universe.js';
import { canWarpFrom, jumpTo, totalCharge, warpDestinations } from './warp.js';
import {
  ageWormholes,
  fareFor,
  farEnoughFromPending,
  haulerLinks,
  isLinked,
  mouthBodies,
  mouthSpot,
  pendingWormhole,
  placeMouth,
  secondsUntilCollapse,
} from './wormholes.js';
import {
  ALIENS,
  ANTENNA,
  BATTERY,
  BATTERY_BANK,
  BUILDER,
  BUILT_WORMHOLE,
  CRASH_SPEED,
  CRYSTALS,
  DRONE,
  DRONE_SCALE,
  FUEL_PACK,
  FUEL_PER_PUMP,
  GOLD,
  HAULER,
  HOME_BODY,
  MARKET,
  MINING_RIG,
  OFFLINE_CATCH_UP_SECONDS,
  RESCUE,
  SATELLITE,
  SCIENCE,
  SOLAR_PANELS,
  SOLAR_SAIL,
  STARDUST,
  STARTING_GALACTOKENS,
  TELESCOPE,
  TICKS_PER_SECOND,
  UPGRADES,
  WARP_DRIVE,
  WORMHOLE_MOUTH,
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
const CHEAT_SHIP_GAP = 800;
const CHART_EVERY_TICKS = 30;

const SOUNDS = { machine: 'sfx/machine.wav', blender: 'sfx/blender.mp3', buzzWhir: 'sfx/buzz-whir.wav' };
const audio = Object.fromEntries(Object.entries(SOUNDS).map(([name, src]) => [name, new Audio(src)]));

function play(name) {
  const voice = audio[name].cloneNode();
  voice.play().catch(() => {});
}

const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

const world = findWorld(new URLSearchParams(window.location.search).get('world'));
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
  particles: createParticles(),
  clock: 0,
  warp: null,
  ownsWarpDrive: false,
  ownsRescueModule: false,
  satellites: [],
  rig: null,
  banks: [],
  antennas: [],
  antennasInHold: 0,
  drones: [],
  haulers: [],
  haulerIndex: 0,
  recording: null,
  docked: null,
  gold: 0,
  crystals: 0,
  science: 0,
  studies: createStudies(),
  sails: [],
  sailsInHold: 0,
  stardust: 0,
  upgrades: createUpgrades(),
  claimedBounties: new Set(),
  starChart: createStarChart(),
  ownsTelescope: false,
  relations: startingRelations(),
  hostileHere: null,
  tollDue: null,
  tollSettledAt: null,
  ship: null,
  shipClock: nextShipDelayTicks(),
  gatewayOpen: false,
  wormholeLinks: new Map(),
  mined: new Map(),
  samplePermits: new Map(),
  builtWormholes: [],
  wormholesInHold: 0,
  mapSelection: null,
  mapPlanet: null,
  panel: null,
  tourSeen: false,
  forecast: null,
};

applyUpgrades(game.upgrades, game.rocket, game.power);

const held = new Set();
const isHeld = (...keys) => keys.some((key) => held.has(key));

function landedBody() {
  const { rocket } = game;
  return rocket.landed ? rocket.soi : null;
}

function nearestWithin(items, spot, range) {
  let nearest = null;
  let nearestDistance = range;
  for (const item of items) {
    const distance = Math.hypot(item.x - spot.x, item.y - spot.y);
    if (distance < nearestDistance) {
      nearest = item;
      nearestDistance = distance;
    }
  }
  return nearest;
}

const deployed = (items) => items.filter((item) => item.deployed);
const inHold = (items) => items.filter((item) => !item.deployed);

function targetInReach() {
  const { rocket } = game;
  if (rocket.destroyed || game.warp) return null;
  if (Math.hypot(rocket.x - MARKET.x, rocket.y - MARKET.y) < MARKET.dockingRange) return { kind: 'market' };
  if (shipInReach()) return { kind: 'aliens', item: game.ship };
  const satellite = nearestWithin(deployed(game.satellites), rocket, SATELLITE.dockingRange);
  if (satellite) return { kind: 'satellite', item: satellite };
  const bank = nearestWithin(deployed(game.banks), rocket, BATTERY_BANK.dockingRange);
  if (bank) return { kind: 'bank', item: bank };
  if (rocket.landed && withinReach(rocket, game.rig, MINING_RIG.reach)) return { kind: 'rig' };
  if (rocket.landed && rocket.soi?.species) return { kind: 'aliens', item: rocket.soi };
  const drone = nearDrone();
  if (drone) return { kind: 'drone', item: drone };
  return null;
}

function closingSpeed(target) {
  const { rocket } = game;
  return target.item === game.ship ? relativeSpeed(game.ship, rocket) : Math.hypot(rocket.vx, rocket.vy);
}

function dockTarget() {
  const target = targetInReach();
  return target && closingSpeed(target) < CRASH_SPEED ? target : null;
}

const distanceFromRocket = (spot) => Math.hypot(game.rocket.x - spot.x, game.rocket.y - spot.y);
const nearestAntenna = () => (game.rocket.landed ? nearestWithin(game.antennas, game.rocket, ANTENNA.reach) : null);

function nearDrone() {
  if (game.recording) return null;
  const reachable = (drone) => {
    if (drone.lost) return distanceFromRocket(drone.flight) < DRONE.padReach;
    return Boolean(drone.pad) && game.rocket.landed && distanceFromRocket(drone.pad) < DRONE.padReach;
  };
  return game.drones.find(reachable) ?? null;
}

function canDock() {
  const target = dockTarget();
  return Boolean(target) && game.panel !== target.kind;
}

function tooFastToDock() {
  const target = targetInReach();
  return Boolean(target) && !dockTarget() && game.panel !== target.kind;
}

const dockedOf = (kind) => (game.panel === kind ? game.docked : null);
const inOpenSpace = () => !game.rocket.soi && !game.rocket.destroyed;
const onGround = () => landedBody()?.kind === 'planemo';
const parkedDrones = () => game.drones.filter((drone) => drone.pad);
const droneInHold = () => game.drones.find((drone) => !drone.pad);
const outpostsWelcome = () => !game.hostileHere;
const canDeploySatellite = () => inHold(game.satellites).length > 0 && inOpenSpace() && outpostsWelcome();
const canDeployRig = () => game.rig && !game.rig.deployed && onGround() && outpostsWelcome();
const canDeployAntenna = () => game.antennasInHold > 0 && onGround() && outpostsWelcome();
const canDeployDrone = () => Boolean(droneInHold()) && onGround() && inSignal(game.antennas, game.rocket.x, game.rocket.y) && outpostsWelcome();
const canDeployBank = () => inHold(game.banks).length > 0 && inOpenSpace() && outpostsWelcome();
const hasMouthToPlace = () => game.wormholesInHold > 0 || Boolean(pendingWormhole(game.builtWormholes));

function mouthPlacement() {
  if (!hasMouthToPlace() || !inOpenSpace() || !outpostsWelcome()) return null;
  const spot = mouthSpot(game.rocket);
  if (!farEnoughFromPending(game.builtWormholes, spot)) return { blocker: 'Too close to the first mouth. Fly farther away.' };
  if (sphereOfInfluence(spot.x, spot.y)) return { blocker: 'Too close to another body. Move into open space.' };
  return { blocker: null };
}

const PRICES = {
  satellite: () => risingPrice(SATELLITE.cost, game.satellites.length),
  bank: () => risingPrice(BATTERY_BANK.cost, game.banks.length),
  antenna: () => risingPrice(ANTENNA.cost, game.antennas.length + game.antennasInHold),
  drone: () => risingPrice(DRONE.cost, game.drones.length),
  hauler: () => risingPrice(HAULER.cost, game.haulers.filter((hauler) => !hauler.builds).length),
  builder: () => risingPrice(BUILDER.cost, game.haulers.filter((hauler) => hauler.builds).length),
  wormhole: () => risingPrice(BUILT_WORMHOLE.cost, game.builtWormholes.length + game.wormholesInHold),
};

const TRADE_GOODS = {
  gold: {
    label: 'gold',
    icon: 'img/gold.svg',
    marketPrice: GOLD.sellPrice,
    count: () => game.gold,
    handOver: () => (game.gold = 0),
  },
  crystals: {
    label: 'crystals',
    icon: 'img/crystal.svg',
    marketPrice: CRYSTALS.sellPrice,
    count: () => game.crystals,
    handOver: () => (game.crystals = 0),
  },
  batteries: {
    label: 'charged batteries',
    icon: 'img/battery.svg',
    marketPrice: BATTERY.sellPrice,
    count: () => chargedBatteries(game.power),
    handOver: () => (game.power.batteries = game.power.batteries.filter((charge) => charge < 1)),
  },
  stardust: {
    label: 'stardust',
    icon: 'img/stardust.svg',
    marketPrice: STARDUST.sellPrice,
    count: () => game.stardust,
    handOver: () => (game.stardust = 0),
  },
  science: {
    label: 'science',
    icon: 'img/science.svg',
    marketPrice: SCIENCE.sellPrice,
    count: () => game.science,
    handOver: () => (game.science = 0),
  },
};

const deployedOrNull = (outpost) => (outpost?.deployed ? outpost : null);

function nearStar(outpost) {
  if (!outpost?.deployed) return '';
  let nearest = null;
  for (const entry of game.starChart.values()) {
    if (!nearest || Math.hypot(entry.x - outpost.x, entry.y - outpost.y) < Math.hypot(nearest.x - outpost.x, nearest.y - outpost.y)) nearest = entry;
  }
  return nearest ? ` near ${nearest.name}` : '';
}

const STOP_KINDS = {
  satellite: {
    locate: ({ index }) => deployedOrNull(game.satellites[index]),
    act: ({ index }, hauler) => transferCharge(game.satellites[index].batteries, hauler.batteries),
    describe: ({ index }) => `Satellite ${index + 1}${nearStar(game.satellites[index])}: take charge`,
  },
  bankTake: {
    locate: ({ index }) => deployedOrNull(game.banks[index]),
    act: ({ index }, hauler) => transferCharge(game.banks[index].batteries, hauler.batteries),
    describe: ({ index }) => `Battery bank ${index + 1}${nearStar(game.banks[index])}: take charge`,
  },
  bankDeposit: {
    locate: ({ index }) => deployedOrNull(game.banks[index]),
    act: ({ index }, hauler, keep) => transferCharge(hauler.batteries, game.banks[index].batteries, keep),
    describe: ({ index }) => `Battery bank ${index + 1}${nearStar(game.banks[index])}: deposit charge`,
  },
  rig: {
    locate: () => deployedOrNull(game.rig),
    act: (stop, hauler, keep) => {
      loadRig(game.rig, hauler, keep);
      hauler.gold += collectGold(game.rig);
    },
    describe: () => `Mining rig on ${game.rig?.site || 'nowhere'}: load batteries, collect gold`,
  },
  buildSatellite: {
    locate: (stop) => stop,
    act: (stop) => buildFromHold(stop, game.satellites, deploySatellite),
    describe: (stop) => `Build a satellite near ${stop.starName}`,
    missing: 'satellite',
  },
  buildBank: {
    locate: (stop) => stop,
    act: (stop) => buildFromHold(stop, game.banks, deployBank),
    describe: (stop) => `Build a battery bank near ${stop.starName}`,
    missing: 'battery bank',
  },
  market: {
    locate: () => MARKET,
    act: (stop, hauler) => {
      game.galactokens += hauler.gold * GOLD.sellPrice;
      hauler.gold = 0;
    },
    describe: () => 'Market: sell gold',
  },
};

const describeStop = (stop) => STOP_KINDS[stop.kind].describe(stop);

const stopValue = ({ kind, index }) => `${kind}:${index ?? ''}`;

function stopFromValue(value) {
  const [kind, index] = value.split(':');
  return index === '' ? { kind } : { kind, index: Number(index) };
}

function remoteStops() {
  const stops = [];
  game.satellites.forEach((satellite, index) => satellite.deployed && stops.push({ kind: 'satellite', index }));
  game.banks.forEach((bank, index) => bank.deployed && stops.push({ kind: 'bankTake', index }, { kind: 'bankDeposit', index }));
  if (game.rig?.deployed) stops.push({ kind: 'rig' });
  stops.push({ kind: 'market' });
  return stops;
}

const nearbyOutposts = (star, range) => [...deployed(game.satellites), ...deployed(game.banks)].filter((item) => Math.hypot(item.x - star.x, item.y - star.y) < range);
const pendingBuildsAt = (key) => game.haulers.flatMap((hauler) => hauler.stops).filter((stop) => stop.star === key).length;

function buildSite(key) {
  const entry = game.starChart.get(key);
  const system = entry && systemAt(entry.x, entry.y);
  if (!system) return null;
  const { star, planets } = system;
  const reach = Math.max(star.radius * BUILDER.siteInStarRadii, star.soi + BUILDER.siteSpacing);
  const clear = (x, y) => planets.every((planet) => Math.hypot(x - planet.x, y - planet.y) > planet.soi) && !sphereOfInfluence(x, y);
  const taken = nearbyOutposts(star, reach * 2).length + pendingBuildsAt(key);
  for (let slot = taken; slot < taken + BUILDER.siteTries; slot++) {
    const bearing = (slot * BUILDER.siteSpacing) / reach;
    const x = star.x + Math.sin(bearing) * reach;
    const y = star.y + Math.cos(bearing) * reach;
    if (clear(x, y)) return { star: key, starName: entry.name, x, y, light: Math.min(1, (star.radius / reach) ** 2) };
  }
  return null;
}

function buildFromHold(stop, items, deploy) {
  const item = inHold(items)[0];
  if (!item) return false;
  deploy(item, stop);
  if ('light' in item) item.light = stop.light;
  return true;
}

const haulerWorld = {
  locate: (stop) => STOP_KINDS[stop.kind].locate(stop),
  act: (stop, hauler, keep) => STOP_KINDS[stop.kind].act(stop, hauler, keep),
  spend: (tokens) => {
    if (game.galactokens < tokens) return false;
    game.galactokens -= tokens;
    return true;
  },
  raid: (spot, hauler) => {
    const hostile = hostileNear(spot);
    if (!hostile || Math.random() >= ALIENS.raid.chance) return null;
    const kept = 1 - ALIENS.raid.share;
    hauler.gold = Math.floor(hauler.gold * kept);
    hauler.batteries = hauler.batteries.map((charge) => charge * kept);
    hud.toast(`The ${speciesByKey[hostile.species].name} raided hauler ${game.haulers.indexOf(hauler) + 1} and took half its cargo.`);
    return hostile.species;
  },
  wormholes: () => haulerLinks(game.builtWormholes),
};

function hostileNear(spot) {
  const home = homeworldNear(spot.x, spot.y, VISIT_RANGE);
  return home && mood(game.relations[home.species]) === 'hostile' ? home : null;
}

const selectedHauler = () => game.haulers[game.haulerIndex] ?? null;

function stopHere(kind) {
  if (kind === 'satellite') return dockedOf('satellite') && { kind, index: game.satellites.indexOf(dockedOf('satellite')) };
  if (kind === 'bankTake' || kind === 'bankDeposit') return dockedOf('bank') && { kind, index: game.banks.indexOf(dockedOf('bank')) };
  if (kind === 'rig') return game.panel === 'rig' && game.rig ? { kind } : null;
  if (kind === 'market') return game.panel === 'market' ? { kind } : null;
  return null;
}

function pay(kind) {
  const price = PRICES[kind]();
  if (game.galactokens < price) return false;
  game.galactokens -= price;
  return true;
}

function noteRecording(name) {
  if (game.recording) noteEvent(game.recording, name);
}

function stopRecording(message) {
  const { recording } = game;
  if (!recording) return;
  game.recording = null;
  recording.drone.running = Boolean(recording.drone.route);
  hud.toast(message);
}

function canFinishRecording() {
  const { recording, rocket } = game;
  return Boolean(recording) && recording.steps > 0 && rocket.landed && distanceFromRocket(recording.drone.pad) < DRONE.padReach;
}

const fuelPrice = (amount) => Math.ceil(amount * (FUEL_PACK.cost / FUEL_PACK.amount));
const fillTankCost = () => fuelPrice(game.rocket.fuelCapacity - game.rocket.fuel);

function openPanel(name) {
  game.panel = name;
  hud.showPanel(name);
}

function startTour() {
  openPanel(null);
  tour.start();
}

const actions = {
  closePanels: () => {
    if (game.panel === 'toll') {
      actions.refuseToll();
      return;
    }
    tour.stop();
    openPanel(null);
  },
  toggleHelp: () => {
    if (tour.running()) tour.stop();
    else if (!game.tourSeen) startTour();
    else openPanel(game.panel === 'help' ? null : 'help');
  },
  startTour,
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
  fillTank: () => {
    const cost = fillTankCost();
    if (cost === 0 || game.galactokens < cost) return;
    game.rocket.fuel = game.rocket.fuelCapacity;
    game.galactokens -= cost;
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
    if (!upgrade || !canAfford(upgrade, game)) return;
    game.galactokens -= upgrade.cost;
    game.crystals -= upgrade.crystals ?? 0;
    game.stardust -= upgrade.stardust ?? 0;
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
  buyRescueModule: () => {
    if (game.ownsRescueModule || game.galactokens < RESCUE.cost) return;
    game.ownsRescueModule = true;
    game.galactokens -= RESCUE.cost;
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
    deleteSave(world.id);
    window.location.reload();
  },
  toggleCheats: () => world.cheats && openPanel(game.panel === 'cheats' ? null : 'cheats'),
  cheat: (name) => world.cheats && CHEATS[name]?.(),
  openWorlds: () => {
    save();
    window.location.search = '';
  },
  buySatellite: () => {
    if (pay('satellite')) game.satellites.push(createSatellite());
  },
  deploySatellite: () => {
    if (!canDeploySatellite()) return;
    deploySatellite(inHold(game.satellites)[0], game.rocket);
    openPanel(null);
  },
  takeSatelliteCharge: () => {
    const satellite = dockedOf('satellite');
    if (!satellite) return;
    takeSatelliteCharge(satellite, game.power);
    noteRecording('takeSatellite');
  },
  pickUpSatellite: () => {
    const satellite = dockedOf('satellite');
    if (!satellite) return;
    satellite.deployed = false;
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
    if (pay('bank')) game.banks.push(createBank());
  },
  deployBank: () => {
    if (!canDeployBank()) return;
    deployBank(inHold(game.banks)[0], game.rocket);
    openPanel(null);
  },
  depositInBank: () => {
    const bank = dockedOf('bank');
    if (!bank) return;
    transferCharge(game.power.batteries, bank.batteries);
    noteRecording('depositInBank');
  },
  takeFromBank: () => {
    const bank = dockedOf('bank');
    if (!bank) return;
    transferCharge(bank.batteries, game.power.batteries);
    noteRecording('takeFromBank');
  },
  pickUpBank: () => {
    const bank = dockedOf('bank');
    if (!bank) return;
    bank.deployed = false;
    openPanel(null);
  },
  buyAntenna: () => {
    if (pay('antenna')) game.antennasInHold += 1;
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
    if (pay('drone')) game.drones.push(createDrone());
  },
  deployDrone: () => {
    if (!canDeployDrone()) return;
    parkDrone(droneInHold(), game.rocket);
    openPanel(null);
  },
  recordRoute: () => {
    const drone = dockedOf('drone');
    const { rocket } = game;
    if (!drone?.pad || drone.flight || !rocket.landed) return;
    game.recording = { ...startRecording(drone, rocket), drone };
    openPanel(null);
  },
  finishRecording: () => {
    if (!canFinishRecording()) return;
    finishRecording(game.recording.drone, game.recording);
    game.recording = null;
    hud.toast('Route saved. The drone flies it on repeat.');
  },
  cancelRecording: () => stopRecording('Recording cancelled.'),
  openDrone: () => {
    const drone = nearDrone();
    if (!drone) return;
    game.docked = drone;
    openPanel('drone');
  },
  setDroneWait: (seconds) => {
    const drone = dockedOf('drone');
    if (!drone || !(seconds >= 0)) return;
    drone.waitSeconds = seconds;
    drone.resting = Math.min(drone.resting, seconds);
  },
  toggleDroneRuns: () => {
    const drone = dockedOf('drone');
    if (drone?.route && !drone.lost) drone.running = !drone.running;
  },
  pickUpDrone: () => {
    const drone = dockedOf('drone');
    if (!drone || (drone.flight && !drone.lost)) return;
    stowDrone(drone);
    openPanel(null);
  },
  buyHauler: () => {
    if (!pay('hauler')) return;
    game.haulers.push(createHauler(MARKET));
    game.haulerIndex = game.haulers.length - 1;
    hud.toast('Hauler waiting at the market. Add stops from Rocket → Haulers.');
  },
  buyWormhole: () => {
    if (!pay('wormhole')) return;
    game.wormholesInHold += 1;
    hud.toast('Wormhole pair in the hold. Place the first mouth in open space, then carry the second to where you want the link.');
  },
  placeMouth: () => {
    if (mouthPlacement()?.blocker !== null) return;
    const opening = Boolean(pendingWormhole(game.builtWormholes));
    if (!opening) game.wormholesInHold -= 1;
    placeMouth(game.builtWormholes, mouthSpot(game.rocket));
    syncMouths();
    openPanel(null);
    hud.toast(opening ? 'The wormhole is open. Each trip pays its fare.' : 'First mouth placed. Carry the second one to the other end.');
  },
  buyBuilder: () => {
    if (!pay('builder')) return;
    game.haulers.push(createHauler(MARKET, true));
    game.haulerIndex = game.haulers.length - 1;
    hud.toast('Builder waiting at the market. Give it build stops from Rocket → Haulers.');
  },
  addRemoteStop: (value) => {
    const hauler = selectedHauler();
    if (!hauler || !remoteStops().some((choice) => stopValue(choice) === value)) return;
    hauler.stops.push(stopFromValue(value));
  },
  addBuildStop: (kind, key) => {
    const hauler = selectedHauler();
    if (!hauler?.builds || !['buildSatellite', 'buildBank'].includes(kind)) return;
    const site = buildSite(key);
    if (!site) {
      hud.toast('No clear spot near that star.');
      return;
    }
    const hostile = hostileNear(site);
    if (hostile) {
      hud.toast(`The ${speciesByKey[hostile.species].name} won't allow outposts near ${site.starName}.`);
      return;
    }
    hauler.stops.push({ kind, ...site });
  },
  openHaulers: () => openPanel(game.panel === 'hauler' ? null : 'hauler'),
  cycleHauler: (step) => {
    const count = game.haulers.length;
    if (count > 0) game.haulerIndex = (game.haulerIndex + step + count) % count;
  },
  addHaulerStop: (kind) => {
    const hauler = selectedHauler();
    const stop = stopHere(kind);
    if (!hauler || !stop) return;
    hauler.stops.push(stop);
    hud.toast(`Hauler ${game.haulerIndex + 1}, stop ${hauler.stops.length}: ${describeStop(stop)}.`);
  },
  removeHaulerStop: (index) => {
    const hauler = selectedHauler();
    if (hauler) removeStop(hauler, index);
  },
  toggleHauler: () => {
    const hauler = selectedHauler();
    if (hauler?.stops.length) hauler.running = !hauler.running;
  },
  sellCrystals: () => {
    game.galactokens += game.crystals * CRYSTALS.sellPrice;
    game.crystals = 0;
  },
  sellScience: () => {
    game.galactokens += game.science * SCIENCE.sellPrice;
    game.science = 0;
  },
  buySail: () => {
    if (game.galactokens < SOLAR_SAIL.cost) return;
    game.galactokens -= SOLAR_SAIL.cost;
    game.sailsInHold += 1;
  },
  launchSail: () => {
    const plan = sailPlan();
    if (!canLaunchSail(plan)) return;
    game.sails.push(launchSail(plan.star, game.rocket, starKey(plan.star), plan.target));
    game.sailsInHold -= 1;
    hud.toast(plan.target ? `Solar sail launched toward ${plan.target.name}.` : `Solar sail launched. It will scout ahead for ${formatDuration(SOLAR_SAIL.lifeSeconds)}.`);
  },
  sellStardust: () => {
    game.galactokens += game.stardust * STARDUST.sellPrice;
    game.stardust = 0;
  },
  askForTip: () => {
    const homeworld = dockedOf('aliens');
    const alien = homeworld && alienInfo(homeworld);
    if (!alien?.canAskForTip) return;
    const found = stardustTip(game.starChart, homeworld, ALIENS.tip.rangeInSectors * SECTOR_SIZE);
    if (!found) {
      hud.toast(`The ${alien.name} know of no more stardust nearby.`);
      return;
    }
    game.science -= alien.tipPrice;
    hud.toast(`The ${alien.name} say ${found} has stardust. It's marked on your galaxy map.`);
  },
  askToSample: () => {
    const homeworld = dockedOf('aliens');
    const terms = homeworld && sampleTerms(homeworld);
    if (!terms || terms.answer) return;
    game.samplePermits.set(bodyKey(homeworld), rollSampleAnswer());
  },
  paySampleFee: () => {
    const homeworld = dockedOf('aliens');
    const terms = homeworld && sampleTerms(homeworld);
    if (terms?.answer !== 'fee' || !terms.canPay) return;
    game.galactokens -= terms.fee;
    game.samplePermits.set(bodyKey(homeworld), 'granted');
  },
  raidShip: () => {
    const { ship } = game;
    if (!ship || dockedOf('aliens') !== ship) return;
    const { name, rival } = speciesByKey[ship.species];
    const { galactokens, crystals, stardust } = ship.cargo;
    game.galactokens += galactokens;
    game.crystals += crystals;
    game.stardust += stardust;
    shiftRelation(game.relations, ship.species, -ALIENS.ships.raidAnger);
    shiftRelation(game.relations, rival, ALIENS.ships.rivalGoodwill);
    game.ship = null;
    openPanel(null);
    const loot = [`${galactokens} galactokens`, crystals && `${crystals} crystal${crystals === 1 ? '' : 's'}`, stardust && `${stardust} stardust`].filter(Boolean).join(', ');
    hud.toast(`Raided the ${name} freighter: ${loot}. ${name} -${ALIENS.ships.raidAnger}, ${speciesByKey[rival].name} +${ALIENS.ships.rivalGoodwill}.`);
  },
  payToll: () => {
    const due = game.tollDue;
    if (!due || game.galactokens < ALIENS.toll.galactokens) return;
    game.galactokens -= ALIENS.toll.galactokens;
    settleToll(`Paid the ${speciesByKey[due.species].name} ${ALIENS.toll.galactokens} galactokens to pass.`);
  },
  refuseToll: () => {
    const due = game.tollDue;
    if (!due) return;
    shiftRelation(game.relations, due.species, -ALIENS.toll.refusalAnger);
    settleToll(`Refused the ${speciesByKey[due.species].name} toll. Relations -${ALIENS.toll.refusalAnger}.`);
  },
  alienBuyFuel: () => {
    const market = dockedMarket();
    const { rocket } = game;
    if (!market?.canBuyFuel) return;
    game.galactokens -= market.fuelPackCost;
    rocket.fuel = Math.min(rocket.fuelCapacity, rocket.fuel + FUEL_PACK.amount);
  },
  alienFillTank: () => {
    const market = dockedMarket();
    if (!market?.canFillTank) return;
    game.galactokens -= market.fillTankCost;
    game.rocket.fuel = game.rocket.fuelCapacity;
  },
  alienBuyBattery: () => {
    const market = dockedMarket();
    if (!market?.canBuyBattery) return;
    game.galactokens -= market.batteryCost;
    game.power.batteries.push(0);
  },
  alienSell: (key) => {
    const offer = dockedMarket()?.offers.find((candidate) => candidate.key === key);
    if (!offer?.count) return;
    TRADE_GOODS[key].handOver();
    game.galactokens += offer.count * offer.price;
  },
  sellToAliens: () => {
    const homeworld = dockedOf('aliens');
    const alien = homeworld && alienInfo(homeworld);
    if (!alien?.canSell) return;
    const goods = TRADE_GOODS[alien.wants];
    const count = goods.count();
    goods.handOver();
    game.galactokens += count * alien.sellPrice;
    const goodwill = goodwillFor(count * goods.marketPrice);
    shiftRelation(game.relations, homeworld.species, goodwill);
    hud.toast(`The ${alien.name} took ${count} ${goods.label}. Relations +${goodwill.toFixed(1)}.`);
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
  skipTenMinutes: () => catchUp(CHEAT_SKIP_SECONDS),
  summonShip: () => {
    summonShip();
    const { ship, rocket } = game;
    if (ship) Object.assign(ship, { x: rocket.x + CHEAT_SHIP_GAP, y: rocket.y, vx: rocket.vx, vy: rocket.vy });
  },
  revealNearby: () => scanFrom(game.starChart, game.rocket.x, game.rocket.y, CHEAT_REVEAL_RANGE),
  goHome: () => {
    const { rocket, drill } = game;
    stopRecording('Teleported. Recording stopped.');
    stopDrill(drill, play);
    placeOnSurface(rocket, HOME_BODY, 0);
    Object.assign(rocket, { soi: HOME_BODY, destroyed: false, engineOn: false });
    game.explosion = null;
    streamAround();
  },
};

const hud = createHud(stage, actions, { cheats: Boolean(world?.cheats) });
const tour = createTour(stage, { onEnd: () => (game.tourSeen = true), openGuide: () => openPanel('help') });
const galaxyMap = createGalaxyMap(stage.querySelector('[data-map]'));

function shipInReach() {
  const { ship, rocket } = game;
  return Boolean(ship) && !rocket.landed && distanceFromRocket(ship) < ALIENS.ships.reach;
}

function dock() {
  if (!canDock()) return;
  const target = dockTarget();
  if (!game.rocket.landed) {
    const drift = target.item === game.ship ? { vx: game.ship.vx, vy: game.ship.vy } : { vx: 0, vy: 0 };
    Object.assign(game.rocket, drift, { engineOn: false });
    noteRecording('dock');
  }
  game.docked = target.item ?? null;
  openPanel(target.kind);
  if (target.kind === 'aliens') {
    const { name } = speciesByKey[target.item.species];
    earnScience(`contact:${target.item.species}`, SCIENCE.contact, `first contact with the ${name}`);
  }
}

const alienTitle = (host) => `${speciesByKey[host.species].name}${host === game.ship ? ' freighter' : ''}`;

function alienInfo(homeworld) {
  const { name, wants, rival } = speciesByKey[homeworld.species];
  const relation = game.relations[homeworld.species];
  const friendly = mood(relation) === 'friendly';
  const price = tipPrice(relation);
  const goods = TRADE_GOODS[wants];
  return {
    name,
    mood: mood(relation),
    relation: Math.round(relation),
    friendly,
    tipPrice: price,
    canAskForTip: friendly && game.science >= price,
    wants,
    wantsLabel: goods.label,
    wantsIcon: goods.icon,
    sellPrice: priceFromAliens(relation, goods.marketPrice),
    canSell: goods.count() > 0,
    market: homeworld === game.ship ? null : homeworldMarket(homeworld, wants),
    refusesTrade: homeworld !== game.ship && mood(relation) === 'hostile',
    title: alienTitle(homeworld),
    raidable: homeworld === game.ship,
    raidCost: `${name} -${ALIENS.ships.raidAnger}, ${speciesByKey[rival].name} +${ALIENS.ships.rivalGoodwill}`,
    sample: sampleTerms(homeworld),
  };
}

function homeworldMarket(homeworld, wants) {
  const rates = ALIENS.market[mood(game.relations[homeworld.species])];
  if (!rates) return null;
  const { rocket, power, galactokens } = game;
  const markUp = (price) => Math.ceil(price * rates.buy);
  const fuelPackCost = markUp(FUEL_PACK.cost);
  const fillTankCost = markUp(fuelPrice(rocket.fuelCapacity - rocket.fuel));
  const batteryCost = markUp(BATTERY.cost);
  const offers = Object.entries(TRADE_GOODS)
    .filter(([key]) => key !== wants)
    .map(([key, goods]) => ({ key, label: goods.label, icon: goods.icon, price: Math.round(goods.marketPrice * rates.sell), count: goods.count() }));
  return {
    fuelPackCost,
    fillTankCost,
    batteryCost,
    canBuyFuel: galactokens >= fuelPackCost && rocket.fuel <= rocket.fuelCapacity - FUEL_PACK.amount,
    canFillTank: fillTankCost > 0 && galactokens >= fillTankCost,
    canBuyBattery: freeBatterySlots(power) > 0 && galactokens >= batteryCost,
    offers,
  };
}

const dockedMarket = () => {
  const homeworld = dockedOf('aliens');
  return homeworld && homeworld !== game.ship ? homeworldMarket(homeworld, speciesByKey[homeworld.species].wants) : null;
};

function trespass(body) {
  if (!body.species || game.samplePermits.get(bodyKey(body)) === 'granted') return '';
  const { anger } = ALIENS.sampling;
  shiftRelation(game.relations, body.species, -anger);
  return ` without permission. The ${speciesByKey[body.species].name} noticed: relations -${anger}`;
}

function rollSampleAnswer() {
  const { refuseChance, feeChance } = ALIENS.sampling;
  const roll = Math.random();
  if (roll < refuseChance) return 'refused';
  return roll < refuseChance + feeChance ? 'fee' : 'granted';
}

function sampleTerms(homeworld) {
  const key = bodyKey(homeworld);
  if (homeworld === game.ship || game.studies.has(`sample:${key}`)) return null;
  const { fee, anger } = ALIENS.sampling;
  return { answer: game.samplePermits.get(key) ?? null, fee, anger, canPay: game.galactokens >= fee };
}

function angerOwners(body, resource) {
  const anger = ALIENS.miningAnger[resource];
  if (!body.territory || !anger) return '';
  shiftRelation(game.relations, body.territory, -anger);
  return ` The ${speciesByKey[body.territory].name} noticed: relations -${anger}.`;
}

const streamAround = () => streamSectors([game.rocket, ...parkedDrones().map(dronePose)]);

function advanceOutposts(seconds) {
  for (const satellite of game.satellites) chargeSatellite(satellite, seconds);
  runRig(game.rig, seconds);
}

function advanceUnattended(seconds) {
  advanceOutposts(seconds);
  advanceSailing(seconds);
  for (const hauler of game.haulers) passTime(hauler, seconds);
}

let unattendedClock = Date.now();
const PAUSED_AFTER_SECONDS = 1;

function catchUpToNow() {
  const now = Date.now();
  const seconds = (now - unattendedClock) / 1000;
  unattendedClock = now;
  if (seconds > PAUSED_AFTER_SECONDS) {
    catchUp(seconds);
    return;
  }
  runTimeline(seconds);
  ageBuiltWormholes(seconds);
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
  x: abandonShip,
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
  if (!world || event.target instanceof HTMLInputElement) return;
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
  blast(game.particles, rocket);
  stopDrill(drill, play);
  stopRecording('Crashed. Recording stopped.');
  losePowerCargo(game.power);
  if (game.panel === 'rocket') openPanel(null);
}

const stranded = () => {
  const { rocket } = game;
  return !rocket.destroyed && rocket.fuel <= 0 && !rocket.soi && !canDock();
};

function abandonShip() {
  if (!stranded()) return;
  game.rocket.destroyed = true;
  explode();
}

const telescopeRange = () => upgradeValue('telescope', game.upgrades.telescope);
const warpRange = () => upgradeValue('warpRange', game.upgrades.warpRange);
const timewarpBought = () => upgradeValue('timewarp', game.upgrades.timewarp);
const inGravityWell = () => Boolean(game.rocket.soi);
const timewarpCap = () => (inGravityWell() ? 1 : timewarpBought());

const chartedDestinations = () => warpDestinations(game.rocket, game.power, warpRange()).filter(({ star }) => isCharted(game.starChart, star));

let ticksSinceCharting = CHART_EVERY_TICKS;

function chartVisits() {
  ticksSinceCharting += STEP_TICKS;
  if (ticksSinceCharting < CHART_EVERY_TICKS) return;
  ticksSinceCharting = 0;
  const { rocket } = game;
  if (chartVisitsNear(game.starChart, rocket.x, rocket.y)) hud.toast('New star system added to your galaxy map.');
  studySurroundings();
  surveyTerritory();
}

function surveyTerritory() {
  const { rocket } = game;
  game.hostileHere = rocket.destroyed ? null : hostileNear(rocket);
  if (!game.hostileHere) {
    game.tollSettledAt = null;
    return;
  }
  if (game.warp || game.panel === 'toll' || game.tollSettledAt === starKey(game.hostileHere.star)) return;
  game.tollDue = game.hostileHere;
  openPanel('toll');
}

function settleToll(message) {
  game.tollSettledAt = starKey(game.tollDue.star);
  game.tollDue = null;
  openPanel(null);
  hud.toast(message);
}

const closeUpSystem = () => (game.mapSelection?.visited ? systemAt(game.mapSelection.x, game.mapSelection.y) : null);

function depositNote(planet) {
  const left = findsLeft(planet);
  return left > 0 ? `${planet.resource}: ${left} left` : `${planet.resource}: mined out`;
}

function planetInfo(planet) {
  const waiting = bountyWaiting(game.claimedBounties, planet);
  const details = [
    planet.name,
    `${abbreviate(planet.radius)} radius`,
    DRILL_FINDS[planet.resource] ? depositNote(planet) : null,
    planet.resource === 'gas' ? 'gas giant: double fuel' : null,
    planet.species ? `${speciesByKey[planet.species].name} homeworld` : null,
    planet.territory && !planet.species ? `${speciesByKey[planet.territory].name} territory` : null,
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
    worldsNote(entry),
    bountyNote(entry),
    entry.visited ? 'visited' : 'seen through telescope',
    `${abbreviate(distance)} away`,
    entry.crystals ? `${entry.crystals} crystal world${entry.crystals === 1 ? '' : 's'}` : null,
    entry.stardust ? `${entry.stardust} stardust world${entry.stardust === 1 ? '' : 's'}` : null,
    lifeNote(entry),
    entry.wormhole ? 'wormhole' : null,
    game.ownsWarpDrive && distance <= warpRange() ? 'in warp range' : null,
  ];
  return details.filter(Boolean).join(' · ');
}

function worldsNote(entry) {
  const bodies = systemAt(entry.x, entry.y)?.planets ?? [];
  const moons = bodies.filter((body) => body.moon).length;
  const planets = bodies.length - moons;
  const counted = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  return moons ? `${counted(planets, 'planet')}, ${counted(moons, 'moon')}` : counted(planets, 'planet');
}

function bountyNote(entry) {
  const planets = systemAt(entry.x, entry.y)?.planets ?? [];
  const total = planets.reduce((sum, planet) => sum + (planet.bounty ?? 0), 0);
  const unclaimed = planets.reduce((sum, planet) => sum + bountyWaiting(game.claimedBounties, planet), 0);
  if (!total) return null;
  if (unclaimed === total) return `up to ${total} in bounties`;
  if (unclaimed === 0) return `all ${total} in bounties claimed`;
  return `${unclaimed} of ${total} in bounties unclaimed`;
}

function lifeNote(entry) {
  if (entry.aliens) return `${speciesByKey[entry.aliens].name} homeworld`;
  if (!entry.biosignature) return null;
  return entry.visited ? 'biosignature was a false alarm' : 'possible biosignature';
}

const DRILL_FINDS = {
  crystals: { chancePerPump: CRYSTALS.chancePerPump, found: (count) => `Found a crystal! You have ${count}.` },
  stardust: { chancePerPump: STARDUST.chancePerPump, found: (count) => `Found stardust! You have ${count}.` },
};

const findsLeft = (body) => (DRILL_FINDS[body?.resource] ? body.deposit - (game.mined.get(bodyKey(body)) ?? 0) : 0);

function takeFind(body) {
  const key = bodyKey(body);
  game.mined.set(key, (game.mined.get(key) ?? 0) + 1);
  if (findsLeft(body) > 0) return '';
  recountDeposits(body);
  return ` That was the last of it on ${body.name}.`;
}

function recountDeposits(body) {
  const system = systemAt(body.x, body.y);
  const entry = system && game.starChart.get(starKey(system.star));
  if (!entry) return;
  const withFindsLeft = (resource) => system.planets.filter((planet) => planet.resource === resource && findsLeft(planet) > 0).length;
  Object.assign(entry, { crystals: withFindsLeft('crystals'), stardust: entry.visited ? withFindsLeft('stardust') : entry.stardust });
}

const drillWell = {
  pump: () => {
    const { rocket } = game;
    const body = rocket.soi;
    const { resource } = body;
    rocket.fuel = Math.min(rocket.fuelCapacity, Math.floor(rocket.fuel) + (FUEL_PER_PUMP[resource] ?? FUEL_PER_PUMP.other));
    const sampleKey = `sample:${bodyKey(body)}`;
    if (!game.studies.has(sampleKey)) earnScience(sampleKey, sampleScience(body), `drilled a sample on ${body.name}${trespass(body)}`);
    const find = DRILL_FINDS[resource];
    if (findsLeft(body) <= 0 || Math.random() >= find.chancePerPump) return;
    game[resource] += 1;
    hud.toast(find.found(game[resource]) + takeFind(body) + angerOwners(body, resource));
  },
  exhausted: () => game.rocket.fuel >= game.rocket.fuelCapacity && findsLeft(game.rocket.soi) <= 0,
};

function syncMouths() {
  setBuiltMouths(mouthBodies(game.builtWormholes, (fare) => game.galactokens >= fare));
}

const nearestStarName = ({ x, y }) => starsWithin(x, y, SECTOR_SIZE)[0]?.name ?? 'deep space';

function wormholePlaces({ ends }) {
  const [from, to] = ends.map(nearestStarName);
  return from === to ? `near ${from}` : `between ${from} and ${to}`;
}

function throughBuiltWormhole({ wormhole }) {
  const fare = fareFor(wormhole);
  if (!isLinked(wormhole)) {
    hud.toast('The other mouth is not placed yet, so the wormhole threw you back out.');
    return;
  }
  if (game.galactokens < fare) {
    hud.toast(`The fare is ${fare} galactokens and you can't pay it, so the wormhole threw you back out.`);
    return;
  }
  game.galactokens -= fare;
  wormhole.idleSeconds = 0;
  hud.toast(`Paid a ${fare} galactoken wormhole fare.`);
}

function ageBuiltWormholes(seconds) {
  const collapsed = ageWormholes(game.builtWormholes, seconds);
  if (!collapsed.length) return;
  for (const wormhole of collapsed) {
    for (const end of wormhole.ends) flash(game.particles, end, WORMHOLE_MOUTH.radius);
    hud.toast(`Your wormhole ${wormholePlaces(wormhole)} went unused too long and collapsed in a flash of light.`);
  }
  syncMouths();
}

function wormholeNote() {
  return game.builtWormholes
    .filter(isLinked)
    .map((wormhole) => `Wormhole ${wormholePlaces(wormhole)}: fare ${fareFor(wormhole)}, collapses after ${formatDuration(secondsUntilCollapse(wormhole))} unused.`)
    .join(' ');
}

function throughWormhole(mouth) {
  if (mouth.wormhole) throughBuiltWormhole(mouth);
  if (mouth === coreGate) wakeGateway();
  if (!mouth.partnerSector) return;
  const ends = [mouth.star, mouth.exit.star].sort((a, b) => a.x - b.x || a.y - b.y);
  game.wormholeLinks.set(ends.map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`).join('>'), ends);
  earnScience(`wormhole:${bodyKey(mouth)}`, SCIENCE.wormhole, `went through the ${mouth.name}`);
}

function wakeGateway() {
  if (game.gatewayOpen) return;
  game.gatewayOpen = true;
  openGateway();
  hud.toast('The Core Gateway woke up. It now links the galactic core and the Sun, both ways.');
}

function rewardFirstLanding() {
  const body = game.rocket.soi;
  const bounty = claimBounty(game.claimedBounties, body);
  const science = study(game.studies, `landing:${bodyKey(body)}`, body.landingScience ?? SCIENCE.landing);
  game.galactokens += bounty;
  game.science += science;
  const rewards = [bounty && `+${bounty} galactokens`, science && `+${science} science`].filter(Boolean);
  if (rewards.length) hud.toast(`First landing on ${body.name}! ${rewards.join(', ')}`);
}

function earnScience(key, amount, what) {
  const gained = study(game.studies, key, amount);
  if (!gained) return 0;
  game.science += gained;
  hud.toast(`+${gained} science: ${what}.`);
  return gained;
}

function studySurroundings() {
  const { rocket } = game;
  for (const { star } of systemsWithin(rocket.x, rocket.y, VISIT_RANGE)) earnScience(`visit:${starKey(star)}`, SCIENCE.visit, `surveyed the ${star.name} system`);
  const body = rocket.soi;
  if (body?.kind === 'blackhole') earnScience(`blackhole:${bodyKey(body)}`, body.science ?? SCIENCE.blackHole, `studied ${body.name}`);
}

const sailTargets = () =>
  [...game.starChart.values()].filter((entry) => !game.studies.has(`flyby:${starKey(entry)}`) && !game.sails.some((sail) => sail.target === entry.name));

function sailPlan() {
  const { rocket } = game;
  const star = brightestStar(rocket.x, rocket.y);
  if (!star || sunlight(rocket.x, rocket.y) < SOLAR_SAIL.minLight) return { note: 'Too dark to sail. Get closer to a star.' };
  const target = starAhead(sailTargets(), star, rocket);
  const sectors = sailReach(star, rocket) / SECTOR_SIZE;
  const reach = `From here it reaches about ${sectors < 10 ? sectors.toFixed(1) : Math.round(sectors)} sectors; launching closer to the star goes farther.`;
  if (!target) return { star, note: `Nothing charted ahead. The sail will scout blind, straight out from ${star.name}, for ${formatDuration(SOLAR_SAIL.lifeSeconds)}. ${reach}` };
  const seconds = Math.hypot(target.x - rocket.x, target.y - rocket.y) / cruiseSpeed(star, rocket);
  return { star, target, note: `Ahead: ${target.name}, arriving in ${formatDuration(seconds)}, then it scouts on until its battery dies. ${reach}` };
}

const canLaunchSail = (plan) => game.sailsInHold > 0 && Boolean(plan.star) && !game.rocket.landed && !game.rocket.destroyed;

function scoutWithSail(sail) {
  for (const { star, planets, distance } of systemsPassed(sail)) {
    if (starKey(star) === sail.launchStarKey) continue;
    if (scanFrom(game.starChart, star.x, star.y, 1)) sail.charted += 1;
    const science = distance <= SOLAR_SAIL.flybyRadius && earnScience(`flyby:${starKey(star)}`, flybyScience(planets.length), `solar sail flew past ${star.name}`);
    if (science) sail.flybys += 1;
  }
}

function advanceSailing(seconds) {
  for (const sail of game.sails) {
    flySail(sail, seconds);
    scoutWithSail(sail);
  }
  for (const { charted, flybys } of game.sails.filter(sailDead)) {
    hud.toast(`A solar sail went dark after charting ${charted} new star${charted === 1 ? '' : 's'} and flying past ${flybys}.`);
  }
  game.sails = game.sails.filter((sail) => !sailDead(sail));
}

const satelliteBy = (flight) => nearestWithin(deployed(game.satellites), flight, SATELLITE.dockingRange);
const bankBy = (flight) => nearestWithin(deployed(game.banks), flight, BATTERY_BANK.dockingRange);

const DRONE_ACTIONS = {
  dock: dockFlight,
  takeSatellite: (flight, drone) => {
    const satellite = satelliteBy(flight);
    if (satellite) transferCharge(satellite.batteries, drone.batteries);
  },
  takeFromBank: (flight, drone) => {
    const bank = bankBy(flight);
    if (bank) transferCharge(bank.batteries, drone.batteries);
  },
  depositInBank: (flight, drone) => {
    const bank = bankBy(flight);
    if (bank) transferCharge(drone.batteries, bank.batteries);
  },
  loadRig: (flight, drone) => {
    if (withinReach(flight, game.rig, MINING_RIG.reach)) loadRig(game.rig, drone);
  },
};

const droneAction = (name, flight, drone) => DRONE_ACTIONS[name](flight, drone);

function stepDrone(drone) {
  if (!drone.pad || drone.rescue) return;
  if (!drone.flight) {
    if (drone.resting > 0) {
      drone.resting = Math.max(0, drone.resting - STEP_SECONDS);
      return;
    }
    if (!drone.running || game.galactokens < refuelCost(drone)) return;
    game.galactokens -= refuelCost(drone);
    launchDrone(drone);
  }
  const outcome = flyDrone(drone, game.antennas, droneAction, STEP_TICKS);
  if (outcome === 'done') drone.resting = drone.waitSeconds;
  if (outcome === 'crash') {
    game.drones.splice(game.drones.indexOf(drone), 1);
    hud.toast('A drone crashed and was destroyed.');
  }
  if (outcome === 'lost') hud.toast('A drone lost signal and is drifting. Fly out and pick it up.');
}

function stepDrones() {
  for (const drone of [...game.drones]) stepDrone(drone);
}

const needsRescue = () => game.ownsRescueModule && stranded() && inSignal(game.antennas, game.rocket.x, game.rocket.y);

function dispatchRescue() {
  const { rocket } = game;
  const distanceTo = (drone) => Math.hypot(dronePose(drone).x - rocket.x, dronePose(drone).y - rocket.y);
  const [nearest] = game.drones.filter(canRescue).sort((a, b) => distanceTo(a) - distanceTo(b));
  if (!nearest) return;
  launchRescue(nearest);
  hud.toast('A rescue drone is on its way.');
}

function refuelFromRescue() {
  const { rocket } = game;
  const price = fillTankCost() + RESCUE.fee;
  const paid = Math.min(price, game.galactokens);
  game.galactokens -= paid;
  rocket.fuel = rocket.fuelCapacity;
  hud.toast(`Rescue drone refuelled you for ${paid} galactokens.`);
}

function stepRescue() {
  const { rocket } = game;
  const rescuer = game.drones.find((drone) => drone.rescue);
  if (!rescuer) {
    if (needsRescue()) dispatchRescue();
    return;
  }
  const { rescue } = rescuer;
  if (rescue.returning) {
    if (flyRescue(rescuer, rescuer.pad, RESCUE.speed, STEP_TICKS)) rescuer.rescue = null;
    return;
  }
  if (rocket.fuel > 0 || rocket.destroyed || rocket.landed) rescue.returning = true;
  else if (flyRescue(rescuer, rocket, Math.hypot(rocket.vx, rocket.vy) + RESCUE.speed, STEP_TICKS)) {
    refuelFromRescue();
    rescue.returning = true;
  }
}

const rehearsals = new WeakMap();

function rehearsalOf(drone) {
  const signature = [drone.route.steps, drone.pad.x, drone.pad.y, ...game.antennas.flatMap(({ x, y }) => [x, y])].join();
  const cached = rehearsals.get(drone);
  if (cached?.signature === signature) return cached.rehearsal;
  const rehearsal = rehearseRoute(drone, game.antennas, STEP_TICKS);
  rehearsals.set(drone, { signature, rehearsal });
  return rehearsal;
}

const routePaths = () => game.drones.flatMap((drone) => (drone.route ? rehearsalOf(drone).segments : []));

function nextMoment(run, now) {
  if (run.finished) return null;
  if (run.start === null) return Math.max(now, run.readyAt);
  const { handoffs, steps } = run.rehearsal;
  const step = run.next < handoffs.length ? handoffs[run.next].step : Math.max(1, steps);
  return Math.max(now, run.start + step * STEP_SECONDS);
}

function launchRun(run, now) {
  const { drone } = run;
  if (!drone.running || game.galactokens < refuelCost(drone)) {
    run.finished = true;
    return;
  }
  game.galactokens -= refuelCost(drone);
  drone.fuel = drone.route.fuel;
  Object.assign(run, { start: now, next: 0 });
}

function endRun(run, now) {
  const { drone, rehearsal } = run;
  if (rehearsal.outcome === 'done') {
    Object.assign(drone, { fuel: rehearsal.fuelLeft, flight: null });
    Object.assign(run, { start: null, readyAt: now + drone.waitSeconds });
    return;
  }
  run.finished = true;
  if (rehearsal.outcome === 'crash') {
    game.drones.splice(game.drones.indexOf(drone), 1);
    hud.toast('A drone crashed and was destroyed.');
    return;
  }
  Object.assign(drone, { lost: true, flight: { ...rehearsal.flight, soi: null } });
  hud.toast('A drone lost signal and is drifting. Fly out and pick it up.');
}

function settleRun(run, now) {
  if (run.start === null) launchRun(run, now);
  else if (run.next < run.rehearsal.handoffs.length) {
    const { name, at } = run.rehearsal.handoffs[run.next++];
    droneAction(name, { ...at }, run.drone);
  } else endRun(run, now);
}

function runTimeline(seconds, runs = []) {
  let now = 0;
  for (;;) {
    let settle = null;
    let soonestAt = seconds;
    for (const run of runs) {
      const at = nextMoment(run, now);
      if (at !== null && at <= soonestAt) [settle, soonestAt] = [() => settleRun(run, at), at];
    }
    for (const hauler of game.haulers) {
      const due = secondsUntilDue(hauler);
      if (due !== null && now + due <= soonestAt) [settle, soonestAt] = [() => settleHauler(hauler, haulerWorld), now + due];
    }
    if (!settle) break;
    advanceUnattended(soonestAt - now);
    now = soonestAt;
    settle();
  }
  advanceUnattended(seconds - now);
}

function catchUp(seconds) {
  const busySeconds = Math.min(seconds, OFFLINE_CATCH_UP_SECONDS);
  streamAround();
  const runs = game.drones
    .filter((drone) => drone.pad && drone.route && !drone.lost && !drone.rescue)
    .map((drone) => ({
      drone,
      rehearsal: rehearsalOf(drone),
      start: drone.flight ? -drone.flight.step * STEP_SECONDS : null,
      readyAt: drone.flight ? 0 : drone.resting,
      next: drone.flight?.nextEvent ?? 0,
      finished: false,
    }));
  runTimeline(busySeconds, runs);
  advanceOutposts(seconds - busySeconds);
  for (const run of runs) {
    if (!run.finished && run.start !== null) replayFlight(run.drone, game.antennas, Math.round((busySeconds - run.start) / STEP_SECONDS), STEP_TICKS);
    if (!run.finished && run.start === null) run.drone.resting = Math.max(0, run.readyAt - busySeconds);
  }
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
    if (hit === 'wormhole') throughWormhole(rocket.soi);
    if (game.recording && !inSignal(game.antennas, rocket.x, rocket.y)) stopRecording('Out of antenna range. Recording stopped.');
    stepDrones();
    stepRescue();
    stepShip();
    simTicks += STEP_TICKS;
    game.timewarp = Math.min(game.timewarp, timewarpCap());
  }
  return simTicks;
}

function stepShip() {
  if (game.ship) {
    flyShip(game.ship, STEP_TICKS);
    if (shipGone(game.ship)) shipLeaves();
    return;
  }
  game.shipClock -= STEP_TICKS;
  if (game.shipClock > 0) return;
  game.shipClock = nextShipDelayTicks();
  summonShip();
}

function summonShip() {
  const { rocket } = game;
  const here = systemsWithin(rocket.x, rocket.y, VISIT_RANGE)[0];
  const home = here && homeworldNear(here.star.x, here.star.y, ALIENS.ships.reachInSectors * SECTOR_SIZE);
  if (!home) return;
  game.ship = launchShip(home.species, here.star, VISIT_RANGE);
  hud.toast(`A ${speciesByKey[home.species].name} freighter is passing through the ${here.star.name} system. Match its speed to meet it.`);
}

function shipLeaves() {
  if (dockedOf('aliens') === game.ship) openPanel(null);
  hud.toast(`The ${speciesByKey[game.ship.species].name} freighter left the ${game.ship.starName} system.`);
  game.ship = null;
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

function puffExhaust(ticks) {
  const { particles, rocket } = game;
  game.clock += STEP_TICKS;
  drift(particles, ticks);
  exhaust(particles, rocket, STEP_TICKS);
  for (const drone of game.drones) if (drone.flight) exhaust(particles, drone.flight, STEP_TICKS, DRONE_SCALE);
}

function advanceWarp() {
  const { warp, rocket, power } = game;
  warp.progress = Math.min(1, warp.progress + STEP_TICKS / WARP_TICKS);
  if (!warp.jumped && warp.progress >= 0.5) {
    jumpTo(rocket, power, warp.destination);
    game.particles.length = 0;
    streamAround();
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
  streamAround();
  chartVisits();
  if (!rocket.landed && drillBusy(drill)) stopDrill(drill, play);
  updateDrill(drill, drillWell, STEP_TICKS, simTicks, play);
  if (rocket.engineOn) power.panelsDeployed = false;
  chargeBatteries(power, rocket, STEP_TICKS);
  followRocket();
  animateExplosion();
  puffExhaust(simTicks || STEP_TICKS);
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

const UPGRADE_UNLOCKED_BY = {
  telescope: () => game.ownsTelescope,
  warpRange: () => game.ownsWarpDrive,
};

const upgradeUnlocked = (key) => UPGRADE_UNLOCKED_BY[key]?.() ?? true;

function droneStatus() {
  const drone = dockedOf('drone');
  if (!drone) return '';
  if (drone.lost) return 'No signal. The drone is drifting; fly close and pick it up.';
  if (!drone.route) return 'No route yet. Record one: fly the trip yourself from here, then land back beside the drone.';
  const carrying = `Carrying ${storedCharge(drone.batteries).toFixed(2)} of ${DRONE.batteries} batteries.`;
  const fuel = `Each run burns ${drone.route.fuel.toFixed(1)} fuel, bought for 1 galactoken each.`;
  if (drone.flight) return `Flying its route, ${Math.round(routeProgress(drone) * 100)}% done${drone.running ? '' : ', then parking'}. ${carrying} ${fuel}`;
  if (!drone.running) return `Parked. ${carrying} ${fuel}`;
  if (drone.resting > 0) return `Resting, next run in ${formatDuration(drone.resting)}. ${carrying} ${fuel}`;
  return `Waiting for ${refuelCost(drone)} galactokens to refuel. ${carrying} ${fuel}`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = `${Math.floor(minutes / 60)} h`;
  return minutes % 60 ? `${hours} ${minutes % 60} min` : hours;
}

function haulerStatus(hauler) {
  if (hauler.stops.length === 0) return 'No stops yet. Pick one below, or dock at an outpost and add it from there.';
  const cargo = `Carrying ${storedCharge(hauler.batteries).toFixed(2)} of ${HAULER.batteries} batteries and ${hauler.gold} gold.`;
  const target = describeStop(hauler.stops[hauler.next]);
  const { leg, stalled } = hauler;
  if (!hauler.running) return `Paused. ${cargo}`;
  if (leg) return `${leg.wormhole ? 'Taking a wormhole' : leg.warp ? 'Warping' : 'Flying'} to ${target}, ${formatDuration(leg.left)} left. ${cargo}`;
  if (stalled?.kind === 'tokens') return `Waiting for ${stalled.amount} galactokens of fuel to reach ${target}. ${cargo}`;
  if (stalled?.kind === 'charge') return `Needs ${stalled.amount.toFixed(2)} batteries of charge to warp to ${target}. ${cargo}`;
  const missing = STOP_KINDS[hauler.stops[hauler.next].kind].missing;
  if (stalled?.kind === 'idle' && missing) return `No ${missing} in your hold to build. Buy one at the market; it tries again in ${formatDuration(hauler.wait)}. ${cargo}`;
  if (stalled?.kind === 'idle') return `Nothing to carry on its last loop. Trying again in ${formatDuration(hauler.wait)}. ${cargo}`;
  if (stalled?.kind === 'raided') return `Raided by the ${speciesByKey[stalled.species].name}, who took half its cargo. Moving on in ${formatDuration(hauler.wait)}. ${cargo}`;
  if (stalled?.kind === 'stops') return `None of its stops are set up right now. Redeploy them or change the route. ${cargo}`;
  return `Setting off. ${cargo}`;
}

function buildChoices(builder) {
  const distance = (entry) => Math.hypot(entry.x - builder.x, entry.y - builder.y);
  return [...game.starChart.entries()]
    .sort(([, a], [, b]) => distance(a) - distance(b))
    .slice(0, BUILDER.starChoices)
    .map(([key, entry]) => ({ value: key, label: `${entry.name} · ${abbreviate(distance(entry), 0)} away` }));
}

function haulerInfo() {
  const hauler = selectedHauler();
  if (!hauler) return null;
  return {
    title: `${hauler.builds ? 'Builder' : 'Hauler'} ${game.haulerIndex + 1} of ${game.haulers.length}`,
    builds: hauler.builds,
    count: game.haulers.length,
    status: haulerStatus(hauler),
    running: hauler.running,
    stops: hauler.stops.map((stop, index) => ({ label: describeStop(stop), next: index === hauler.next, missing: !haulerWorld.locate(stop) })),
  };
}

function dockAction() {
  const target = targetInReach();
  if (target?.kind === 'aliens') return `meet the ${alienTitle(target.item)}`;
  return (
    {
      market: 'enter the market',
      satellite: 'dock with the satellite',
      bank: 'use the battery bank',
      rig: 'use the mining rig',
      drone: 'use the drone',
    }[target?.kind] ?? ''
  );
}

function status() {
  const { rocket, drill, power } = game;
  const body = rocket.soi;
  const fuelFull = rocket.fuel > rocket.fuelCapacity - FUEL_PACK.amount;
  const sail = sailPlan();
  const planningWarp = game.panel === 'warp' && game.ownsWarpDrive && canWarpFrom(rocket);
  const destinations = planningWarp ? chartedDestinations() : [];
  const unchartedInRange = planningWarp ? warpDestinations(rocket, power, warpRange()).length - destinations.length : 0;
  return {
    galactokens: game.galactokens,
    fuel: rocket.fuel,
    fuelFraction: rocket.fuel / rocket.fuelCapacity,
    upgrades: Object.keys(UPGRADES).filter(upgradeUnlocked).map((key) => {
      const next = nextUpgrade(key, game.upgrades[key]);
      return { key, current: upgradeValue(key, game.upgrades[key]), next, affordable: Boolean(next) && canAfford(next, game) };
    }),
    crystals: game.crystals,
    stardust: game.stardust,
    science: game.science,
    sailsInHold: game.sailsInHold,
    sailNote: sail.note,
    canLaunchSail: canLaunchSail(sail),
    canBuySail: game.galactokens >= SOLAR_SAIL.cost,
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
    tooFastToDock: tooFastToDock(),
    dockAction: dockAction(),
    alien: dockedOf('aliens') && alienInfo(dockedOf('aliens')),
    toll: game.tollDue && { name: speciesByKey[game.tollDue.species].name, price: ALIENS.toll.galactokens, canPay: game.galactokens >= ALIENS.toll.galactokens },
    outpostBan: game.hostileHere ? `The ${speciesByKey[game.hostileHere.species].name} won't let you build outposts here.` : '',
    gold: game.gold,
    satellite: dockedOf('satellite'),
    prices: Object.fromEntries(Object.entries(PRICES).map(([kind, price]) => [kind, price()])),
    satellitesInHold: inHold(game.satellites).length,
    banksInHold: inHold(game.banks).length,
    rig: game.rig && { ...game.rig, secondsLeft: rigSecondsLeft(game.rig) },
    canBuySatellite: game.galactokens >= PRICES.satellite(),
    canBuyRig: !game.rig && game.galactokens >= MINING_RIG.cost,
    canDeploySatellite: Boolean(canDeploySatellite()),
    canDeployRig: Boolean(canDeployRig()),
    canTakeSatelliteCharge: Boolean(dockedOf('satellite')) && roomToCharge(power.batteries) > 0 && storedCharge(dockedOf('satellite').batteries) > 0,
    canLoadRig: Boolean(game.rig) && game.rig.charge < MINING_RIG.batterySlots && storedCharge(power.batteries) > 0,
    destroyed: rocket.destroyed,
    stranded: stranded(),
    canMine: landedBody()?.kind === 'planemo' && !drillBusy(drill),
    drillBusy: drillBusy(drill),
    drillAwaitingClick: drillAwaitingClick(drill),
    canBuy: game.galactokens >= FUEL_PACK.cost && !fuelFull,
    fillTankCost: fillTankCost(),
    canFillTank: fillTankCost() > 0 && game.galactokens >= fillTankCost(),
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
    offersRescueModule: !game.ownsRescueModule && game.drones.length > 0,
    canBuyRescueModule: !game.ownsRescueModule && game.galactokens >= RESCUE.cost,
    warpDestinations: destinations,
    warpNote: warpNote(destinations, unchartedInRange),
    ownsTelescope: game.ownsTelescope,
    canBuyTelescope: !game.ownsTelescope && game.galactokens >= TELESCOPE.cost,
    mapInfo: mapInfo(),
    canCloseUp: Boolean(game.mapSelection?.visited) && !galaxyMap.showingSystem(),
    bank: dockedOf('bank'),
    canBuyBank: game.galactokens >= PRICES.bank(),
    canDeployBank: Boolean(canDeployBank()),
    canDepositInBank: Boolean(dockedOf('bank')) && storedCharge(power.batteries) > 0 && roomToCharge(dockedOf('bank').batteries) > 0,
    canTakeFromBank: Boolean(dockedOf('bank')) && roomToCharge(power.batteries) > 0 && storedCharge(dockedOf('bank').batteries) > 0,
    canPickUpAntenna: Boolean(nearestAntenna()),
    nearDrone: Boolean(nearDrone()),
    antennasInHold: game.antennasInHold,
    canBuyAntenna: game.galactokens >= PRICES.antenna(),
    canDeployAntenna: Boolean(canDeployAntenna()),
    dronesInHold: game.drones.filter((drone) => !drone.pad).length,
    canBuyDrone: game.galactokens >= PRICES.drone(),
    canDeployDrone: Boolean(canDeployDrone()),
    droneStatus: droneStatus(),
    canRecordRoute: Boolean(dockedOf('drone')?.pad) && !dockedOf('drone').flight && rocket.landed,
    canToggleDroneRuns: Boolean(dockedOf('drone')?.route) && !dockedOf('drone').lost,
    droneRunning: Boolean(dockedOf('drone')?.running),
    droneWaitSeconds: dockedOf('drone')?.waitSeconds ?? null,
    canPickUpDrone: Boolean(dockedOf('drone')) && (!dockedOf('drone').flight || dockedOf('drone').lost),
    recordingSeconds: game.recording ? game.recording.steps * STEP_SECONDS : null,
    canFinishRecording: canFinishRecording(),
    canBuyHauler: game.galactokens >= PRICES.hauler(),
    hauler: haulerInfo(),
    haulerStopsHere: Object.keys(STOP_KINDS).filter((kind) => selectedHauler() && stopHere(kind)),
    canBuyBuilder: game.galactokens >= PRICES.builder(),
    canBuyWormhole: game.galactokens >= PRICES.wormhole(),
    mouthPlacement: mouthPlacement(),
    placingSecondMouth: Boolean(pendingWormhole(game.builtWormholes)),
    wormholesInHold: game.wormholesInHold,
    wormholeNote: wormholeNote(),
    stopChoices: game.panel === 'hauler' ? remoteStops().map((stop) => ({ value: stopValue(stop), label: describeStop(stop) })) : [],
    buildChoices: game.panel === 'hauler' && selectedHauler()?.builds ? buildChoices(selectedHauler()) : [],
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
  catchUpToNow();
  renderer.draw(game, routePaths());
  if (game.panel === 'map') {
    galaxyMap.draw({
      chart: game.starChart,
      rocket,
      warpRange: game.ownsWarpDrive ? warpRange() : 0,
      telescopeRange: game.ownsTelescope ? telescopeRange() : 0,
      bountyWaiting: (planet) => bountyWaiting(game.claimedBounties, planet),
      findsLeft,
      routePath: routePaths(),
      drones: [...parkedDrones().map(dronePose), ...game.haulers.map(haulerPose), ...game.sails.map(sailPose)],
      ship: game.ship && { x: game.ship.x, y: game.ship.y, colour: speciesByKey[game.ship.species].colour },
      wormholeLinks: [...game.wormholeLinks.values(), ...game.builtWormholes.filter(isLinked).map(({ ends }) => ends)],
    });
  }
  bakeNextTexture();
  hud.update(status());
  window.requestAnimationFrame(frame);
}

let restarting = false;

function snapshot() {
  catchUpToNow();
  const { rocket, power, camera } = game;
  return {
    galactokens: game.galactokens,
    ownsWarpDrive: game.ownsWarpDrive,
    ownsRescueModule: game.ownsRescueModule,
    tourSeen: game.tourSeen,
    timewarp: game.timewarp,
    zoom: camera.zoom,
    rocket: Object.fromEntries(SAVED_ROCKET_FIELDS.map((field) => [field, rocket[field]])),
    power: { ownsPanels: power.ownsPanels, panelsDeployed: power.panelsDeployed, batteries: power.batteries },
    satellites: game.satellites,
    rig: game.rig,
    banks: game.banks,
    antennas: game.antennas,
    antennasInHold: game.antennasInHold,
    drones: game.drones.map((drone) => ({ ...drone, flight: drone.flight && { ...drone.flight, soi: null } })),
    haulers: game.haulers,
    gold: game.gold,
    crystals: game.crystals,
    stardust: game.stardust,
    science: game.science,
    studies: [...game.studies],
    sails: game.sails,
    sailsInHold: game.sailsInHold,
    upgrades: game.upgrades,
    claimedBounties: [...game.claimedBounties],
    starChart: [...game.starChart],
    ownsTelescope: game.ownsTelescope,
    relations: game.relations,
    tollSettledAt: game.tollSettledAt,
    gatewayOpen: game.gatewayOpen,
    wormholeLinks: [...game.wormholeLinks],
    mined: [...game.mined],
    samplePermits: [...game.samplePermits],
    builtWormholes: game.builtWormholes,
    wormholesInHold: game.wormholesInHold,
  };
}

function save() {
  if (!restarting) writeSave(world.id, snapshot());
}

function restore(saved) {
  const { rocket, power, camera } = game;
  Object.assign(rocket, saved.rocket, { engineOn: false });
  Object.assign(power, saved.power);
  Object.assign(game, { galactokens: saved.galactokens, ownsWarpDrive: saved.ownsWarpDrive, ownsRescueModule: saved.ownsRescueModule ?? false, tourSeen: saved.tourSeen ?? false, panel: null });
  const listOf = (plural, single) => saved[plural] ?? (saved[single] ? [saved[single]] : []);
  Object.assign(game, { satellites: listOf('satellites', 'satellite'), rig: saved.rig ?? null, gold: saved.gold ?? 0 });
  Object.assign(game, { banks: listOf('banks', 'bank'), antennas: saved.antennas ?? [], antennasInHold: saved.antennasInHold ?? 0, drones: listOf('drones', 'drone').map((drone) => ({ waitSeconds: 0, resting: 0, ...drone })), haulers: saved.haulers ?? [] });
  game.upgrades = { ...createUpgrades(), ...saved.upgrades };
  game.timewarp = Math.min(saved.timewarp, timewarpBought());
  game.claimedBounties = new Set(saved.claimedBounties ?? []);
  game.starChart = new Map(saved.starChart ?? []);
  game.crystals = saved.crystals ?? 0;
  game.stardust = saved.stardust ?? 0;
  Object.assign(game, { science: saved.science ?? 0, studies: new Set(saved.studies ?? []), sails: (saved.sails ?? []).map(sailFromOldSave), sailsInHold: saved.sailsInHold ?? 0 });
  for (const [key, entry] of game.starChart) {
    const system = systemAt(entry.x, entry.y);
    if (!system || starKey(system.star) !== key) {
      game.starChart.delete(key);
      continue;
    }
    const planets = system?.planets ?? [];
    entry.crystals ??= crystalWorlds(planets);
    entry.stardust ??= entry.visited ? stardustWorlds(planets) : 0;
    entry.biosignature ??= Boolean(system?.star.biosignature);
    entry.aliens ??= entry.visited ? homeworldSpecies(planets) : null;
    entry.wormhole ??= entry.visited && system.wormholes.length > 0;
  }
  game.ownsTelescope = saved.ownsTelescope ?? false;
  game.relations = { ...startingRelations(), ...saved.relations };
  game.tollSettledAt = saved.tollSettledAt ?? null;
  game.gatewayOpen = saved.gatewayOpen ?? false;
  game.wormholeLinks = new Map(saved.wormholeLinks ?? []);
  game.mined = new Map(saved.mined ?? []);
  game.samplePermits = new Map(saved.samplePermits ?? []);
  game.builtWormholes = saved.builtWormholes ?? [];
  game.wormholesInHold = saved.wormholesInHold ?? 0;
  syncMouths();
  if (game.gatewayOpen) openGateway();
  applyUpgrades(game.upgrades, rocket, power);
  camera.zoom = saved.zoom;
  streamAround();
  rocket.soi = sphereOfInfluence(rocket.x, rocket.y);
}

function startAutosave() {
  window.setInterval(save, AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
}

function openWorld(chosen) {
  window.location.search = new URLSearchParams({ world: chosen.id }).toString();
}

async function start() {
  if (!world) {
    stage.classList.add('pp-in-menu');
    showWorldMenu(stage, openWorld);
    return;
  }
  setGalaxySeed(world.seed ?? DEFAULT_GALAXY_SEED);
  markPlayed(world.id);
  const saved = readSave(world.id);
  if (saved) {
    restore(saved);
    catchUp((Date.now() - saved.savedAt) / 1000);
  }
  startAutosave();
  const sprites = await loadSprites();
  renderer = createRenderer(canvas, sprites);
  streamAround();
  chartVisitsNear(game.starChart, game.rocket.x, game.rocket.y);
  renderer.resize();
  new ResizeObserver(() => renderer.resize()).observe(canvas);
  hud.showPanel(game.panel);
  if (!game.tourSeen) hud.beckonHelp();
  window.requestAnimationFrame((time) => {
    lastTime = time;
    frame(time);
  });
}

start();
