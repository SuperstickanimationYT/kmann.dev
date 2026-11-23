import { drawAtlas } from './atlas.js';
import { CAMERA, imageFromRows, levelsFor, measureSignal, skyFillsPixels } from './camera.js';
import { createCutscene } from './cutscene.js';
import { listDestinations } from './destinations.js';
import { GALAXIES, placeGalaxies } from './galaxies.js';
import { AU_PER_LY, buildArmMap, DEGREES, LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { MODES, modeFromName } from './modes.js';
import { KOTO_GARDEN } from './music/koto-garden.js';
import { createMusicPlayer } from './music/player.js';
import { NEBULAE } from './nebulae.js';
import { describeStar, drawGuides } from './practice.js';
import { createRandom, randomSeed } from './random.js';
import { adaptEyes, glareForRow, loadWarpOptics, rowForSpeed, WARP_SECONDS, warpStage } from './warp.js';
import { createRenderer } from './renderer.js';
import { holdingBody, KM_PER_PC, loadBodyMaps, LOWEST_ALTITUDE_KM, placeBodies } from './solar-system.js';
import { EYE_HEIGHT_METRES, groundFrame, groundHeightMetres } from './terrain.js';
import { createGroundPatches } from './ground-patches.js';
import { cockpitUniforms, OVERSHOOT_LY, SHIP, throughWindow, viewBasis } from './ship.js';
import { gatherStars, KIND, loadNearbyStars, placeNebulae } from './stars.js';
import { add, dot, normalize, orthonormal, rotateAbout, scale, subtract } from './vectors.js';

const EYE_FIELD_HEIGHT = 50 * DEGREES;
const MAX_PIXEL_RATIO = 1.25;
const EYE_LIMIT = 6.5;
const SKY_RESOLUTION_MOVING = 0.25;
const SKY_RESOLUTION_STILL = 0.5;
const SKY_RESOLUTION_PHOTO = 1;
const EYE_BUDGET = 60000;
const REGATHER_DISTANCE = 0.3;
const REGATHER_INTERVAL = 150;
const REGATHER_SHARE_OF_NEAREST_STAR = 0.5;
const STAR_STRIDE = 6;
const STAR_DISTANCE_SLOT = 5;
const LOOK_RATE = 0.9;
const ROLL_RATE = 0.9;
const SOLAR_REACH_PC = 0.05;
const CO_ROTATION_RADII = 3;
const GROUND_CHECK_KM = 60;
const GROUND_VIEW_SHARE_OF_RADIUS = 0.12;
const GROUND_VIEW_HIGHEST_KM = 400;
const GROUND_VIEW_FULL_SHARE_OF_HIGHEST = 0.5;
const COLLISION_FOOTPRINT_METRES = 0.05;
const KM_PER_LY = KM_PER_PC / LY_PER_PC;
const START_LATITUDE = [15, 70];
const START_CLEARANCE = 15000;

const WRONG_CLAIM_SECONDS = 3600;
const PICK_RADIUS_PX = 10;
const TAP_DISTANCE = 6;
const ARCSEC_PER_RADIAN = 206264.8;
const GUIDE_FONT = 13;
const MUSIC_STORAGE_KEY = 'find-home-music';
const MUSIC_FADE_SECONDS = 1.5;
const MUSIC_TEMPO = { from: 72, to: 200 };

const $ = (selector) => document.querySelector(selector);
const view = $('[data-view]');
const stage = $('[data-stage]');
const photoFrame = $('[data-photo-frame]');
const photoCanvas = $('[data-photo]');
const photoCaption = $('[data-photo-caption]');
const atlasFrame = $('[data-atlas-frame]');
const status = $('[data-status]');
const ending = $('[data-ending]');
const exposureSelect = $('[data-exposure]');
const stretchInput = $('[data-stretch]');
const exposeButton = $('[data-expose]');
const jumpInput = $('[data-jump-distance]');
const guides = $('[data-guides]');
const modeSelect = $('[data-mode]');
const clockLabel = $('[data-clock-label]');
const giveUpButton = $('[data-give-up]');
const labelsToggle = $('[data-labels]');
const labelsField = $('[data-labels-field]');
const introFrame = $('[data-intro]');
const introText = $('[data-intro-text]');
const musicToggle = $('[data-music]');
const restartButton = $('[data-restart]');
const goToField = $('[data-go-to-field]');
const longExposureField = $('[data-long-exposure-field]');
const longExposureToggle = $('[data-long-exposure]');
const goToInput = $('[data-go-to]');
const goToList = $('[data-go-to-list]');
const solarNote = $('[data-solar-note]');

const armMap = buildArmMap();
const galaxies = placeGalaxies(GALAXIES);
let renderer = null;
let rendererProblem = 'This game needs WebGL 2 with float render targets.';
try {
  renderer = createRenderer(view, armMap, galaxies);
} catch (error) {
  rendererProblem = `Your graphics chip could not run the sky shader: ${String(error.message).split('\n')[0]}`;
}
const nebulae = placeNebulae(NEBULAE);
let nearby = [];

function turn(basis, axisName, angle) {
  const axis = basis[axisName];
  const next = { ...basis };
  for (const name of ['forward', 'right', 'up']) if (name !== axisName) next[name] = rotateAbout(basis[name], axis, angle);
  return orthonormal(next.forward, next.up);
}

let game;
let eyeStars = null;
let eyeAnchor = null;
let eyeNearestStarPc = Infinity;
let eyeGatheredAt = 0;
let eyeStarsChanged = false;
let photo = null;
let statusTimer = 0;
let frameSeed = 1;

function startingPoint(random) {
  const distance = OVERSHOOT_LY / LY_PER_PC;
  const latitude = random.between(...START_LATITUDE) * DEGREES * (random.next() < 0.5 ? -1 : 1);
  const azimuth = random.between(0, 2 * Math.PI);
  const away = [Math.cos(latitude) * Math.sin(azimuth), Math.cos(latitude) * Math.cos(azimuth), Math.sin(latitude)];
  return add(SUN_POSITION, scale(away, distance));
}

function newGame(seed = randomSeed(), modeName = modeSelect.value) {
  endIntro();
  warp = null;
  const random = createRandom(seed);
  let camera = startingPoint(random);
  while (galaxies.some((galaxy) => Math.hypot(...subtract(galaxy.centre, camera)) < START_CLEARANCE)) camera = startingPoint(random);
  const ship = orthonormal(scale(camera, -1), [0, 0, 1]);
  const head = { yaw: 0, pitch: 0 };
  const energy = SHIP.energyBudgetShare * Math.hypot(...subtract(SUN_POSITION, camera)) * LY_PER_PC;
  game = {
    seed,
    camera,
    ship,
    head,
    basis: viewBasis(ship, head),
    speed: 1,
    energy,
    clock: 0,
    wrongClaims: 0,
    exposures: 0,
    jumps: 0,
    over: false,
    mode: MODES.mission,
    helpUsed: false,
  };
  eyeStars = null;
  closePhoto();
  skyStale = true;
  ending.hidden = true;
  setMode(modeName);
  if (game.mode === MODES.mission) playIntro();
}

let intro = null;
const music = createMusicPlayer();

function musicWanted() {
  try {
    return localStorage.getItem(MUSIC_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function unlockMusic() {
  if (musicToggle.checked) music.unlock();
}

function showCaption(text, black) {
  introFrame.classList.toggle('fh-revealed', !black);
  introText.textContent = text;
  introText.classList.remove('fh-fade');
  void introText.offsetWidth;
  introText.classList.add('fh-fade');
}

function playIntro() {
  const waiting = musicToggle.checked && !navigator.userActivation?.hasBeenActive;
  intro = { home: { camera: game.camera, ship: game.ship }, cutscene: null, startedAt: 0, caption: null, planet: null, music: null, waiting };
  introFrame.classList.remove('fh-revealed');
  introText.textContent = '';
  introFrame.hidden = false;
  if (waiting) showCaption('Tap or press any key to begin, with sound.', true);
}

function beginIntro() {
  unlockMusic();
  intro.waiting = false;
  showCaption('', true);
}

function startCutscene(now) {
  const alphaCentauri = nearby.find((star) => star.name === 'Alpha Centauri A').position;
  const distance = Math.hypot(...subtract(SUN_POSITION, intro.home.camera)) * LY_PER_PC;
  const cutscene = createCutscene({
    home: intro.home,
    alphaCentauri,
    odometer: formatLightYears(Math.round(distance / 1000) * 1000),
    warpLeft: formatWarpTime(game.energy),
  });
  intro.cutscene = cutscene;
  intro.startedAt = now;
  if (musicToggle.checked && music.unlocked) {
    const rise = MUSIC_TEMPO.to / MUSIC_TEMPO.from;
    intro.music = music.play(KOTO_GARDEN, { loops: Infinity, tempoAt: (seconds) => MUSIC_TEMPO.from * rise ** Math.min(1, seconds / cutscene.duration) });
  }
}

function advanceIntro(now) {
  if (!nearby.length || intro.waiting) return;
  if (!intro.cutscene) startCutscene(now);
  const elapsed = (now - intro.startedAt) / 1000;
  if (elapsed >= intro.cutscene.duration) {
    endIntro();
    return;
  }
  const { camera, ship, head, planet } = intro.cutscene.at(elapsed);
  game.camera = camera;
  game.ship = ship;
  game.head = head;
  intro.planet = planet;
  aimView();
  const caption = intro.cutscene.captionAt(elapsed);
  if (caption === intro.caption) return;
  intro.caption = caption;
  showCaption(caption.text, caption.black);
}

function endIntro() {
  if (!intro) return;
  intro.music?.fadeOut(MUSIC_FADE_SECONDS);
  game.camera = intro.home.camera;
  game.ship = intro.home.ship;
  game.head = { yaw: 0, pitch: 0 };
  intro = null;
  eyeStars = null;
  aimView();
  introFrame.hidden = true;
  view.focus();
}

function setMusic(wanted) {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, wanted ? 'on' : 'off');
  } catch {}
  if (wanted) unlockMusic();
  else if (intro?.music) {
    intro.music.fadeOut(MUSIC_FADE_SECONDS);
    intro.music = null;
  }
}

const labelsShown = () => game.mode.labels && labelsToggle.checked;
const outOfPlay = () => game.over && game.mode.scored;

function setMode(name) {
  const mode = MODES[modeFromName(name)];
  game.mode = mode;
  if (!mode.scored) {
    endIntro();
    game.helpUsed = true;
    ending.hidden = true;
  }
  game.speed = Math.min(Math.max(game.speed, mode.slowestSpeed), mode.topSpeed);
  modeSelect.value = modeFromName(name);
  labelsField.hidden = !mode.labels;
  goToField.hidden = !mode.goTo;
  longExposureField.hidden = !mode.longExposure;
  solarNote.hidden = !mode.solarSystem;
  clockLabel.textContent = mode.clockLabel;
  giveUpButton.textContent = mode.sunButton;
  restartButton.textContent = mode.restartButton;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', game.seed);
  if (mode === MODES.mission) url.searchParams.delete('mode');
  else url.searchParams.set('mode', modeSelect.value);
  window.history.replaceState(null, '', url);
  clearGuides();
  if (photo) developPhoto();
  const greeting = mode.greeting(labelsShown());
  if (greeting) showStatus(greeting, 6);
}

function setLabels(shown) {
  labelsToggle.checked = shown;
  clearGuides();
  if (photo) developPhoto();
}

function hideStatus() {
  clearTimeout(statusTimer);
  status.hidden = true;
}

function showStatus(message, seconds = 4) {
  status.textContent = message;
  status.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (status.hidden = true), seconds * 1000);
}

function formatClock(seconds) {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function formatLightYears(lightYears) {
  if (lightYears >= 1000) return `${Math.round(lightYears).toLocaleString('en')} ly`;
  if (lightYears >= 1) return `${lightYears.toFixed(1)} ly`;
  if (lightYears * AU_PER_LY >= 0.1) return `${(lightYears * AU_PER_LY).toFixed(lightYears * AU_PER_LY < 10 ? 1 : 0)} AU`;
  const km = lightYears * KM_PER_LY;
  if (km >= 1) return `${Math.round(km).toLocaleString('en')} km`;
  return `${Math.round(km * 1000).toLocaleString('en')} m`;
}

function formatWarpTime(lightYears) {
  const seconds = Math.max(0, Math.round(lightYears / SHIP.warpLightYearsPerSecond));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const count = (amount, noun) => `${amount} ${noun}${amount === 1 ? '' : 's'}`;

const formatSpeed = (lightYearsPerSecond) => `${formatLightYears(lightYearsPerSecond)}/s`;

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  view.width = Math.max(1, Math.round(stage.clientWidth * ratio));
  view.height = Math.max(1, Math.round(stage.clientHeight * ratio));
  skyStale = true;
}

function eyeTanHalf() {
  const tanY = Math.tan(EYE_FIELD_HEIGHT / 2);
  return [tanY * (view.width / view.height), tanY];
}

const held = new Set();

function aimView() {
  game.basis = viewBasis(game.ship, game.head);
  viewChanged();
}

function faceDirection(direction, up = game.ship.up) {
  game.ship = orthonormal(direction, up);
  game.head = { yaw: 0, pitch: 0 };
  aimView();
}

function turnHead(yaw, pitch) {
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  game.head = { yaw: clamp(game.head.yaw + yaw, SHIP.headYawLimit), pitch: clamp(game.head.pitch + pitch, SHIP.headPitchLimit) };
  aimView();
}

let warp = null;
let warpOptics = null;
let adaptation = 0;
const CRUISE_TIMES_LIGHT = SHIP.warpLightYearsPerSecond * 365.25 * 86400;

function jump() {
  if (!warpReady()) return;
  const lightYears = Number(jumpInput.value);
  if (!(lightYears > 0)) return;
  if (game.mode.scored && lightYears > game.energy) {
    showStatus(`Not enough warp: ${formatWarpTime(game.energy)} left, enough for ${formatLightYears(game.energy)}.`);
    return;
  }
  startWarp(lightYears, null);
}

const warpReady = () => !intro && !photo?.running && !warp && warpOptics && eyeStars && !outOfPlay();

function startWarp(lightYears, destination) {
  renderer.captureSkyCube({ camera: game.camera, nebulae, stars: eyeStars });
  warp = { axis: [...game.ship.forward], lightYears, destination, startedAt: performance.now(), arrived: false };
  clearGuides();
}

function goTo(name) {
  const destination = destinations().find((place) => place.name.toLowerCase() === name.trim().toLowerCase());
  if (!destination) {
    showStatus(`Nowhere called "${name}" on the list.`);
    return;
  }
  if (!warpReady()) return;
  const arrival = destination.arrival(game.camera);
  faceDirection(subtract(arrival, game.camera));
  startWarp(Math.hypot(...subtract(arrival, game.camera)) * LY_PER_PC, destination);
}

let destinationList = null;
function destinations() {
  if (!destinationList && nearby.length) {
    destinationList = listDestinations({ nearby, nebulae, galaxies });
    goToList.replaceChildren(...destinationList.map((place) => new Option(place.group, place.name)));
  }
  return destinationList ?? [];
}

const timesLight = (speed) => (speed < 10 ? speed.toFixed(2) : Math.round(speed).toLocaleString('en'));

function warpCaption(stage) {
  if (stage.shutter >= 1) return `Shutters closed. Cruising at ${Math.round(CRUISE_TIMES_LIGHT / 1e9)} billion times light speed.`;
  if (stage.shutter > 0) return 'Blast shutters closing against the glare.';
  return `${warp.arrived ? 'Dropping out' : 'Bubble forming'}: ${timesLight(stage.speed)} times light speed.`;
}

function advanceWarp(now) {
  const elapsed = (now - warp.startedAt) / 1000;
  if (elapsed >= WARP_SECONDS) {
    showStatus(warp.destination ? `Arrived at ${warp.destination.name}.` : `Dropped out of warp after ${formatLightYears(warp.lightYears)}.`);
    warp = null;
    viewChanged();
    return null;
  }
  const stage = warpStage(elapsed);
  if (stage.arrived && !warp.arrived) {
    warp.arrived = true;
    if (warp.destination) arrive(warp.destination);
    else land(warp.lightYears);
    refreshEyeStars(now);
    renderer.captureSkyCube({ camera: game.camera, nebulae, stars: eyeStars });
  }
  status.textContent = warpCaption(stage);
  status.hidden = false;
  clearTimeout(statusTimer);
  const row = rowForSpeed(warpOptics, stage.speed);
  return { axis: warp.axis, row, shutter: stage.shutter, glareLux: glareForRow(warpOptics, row) * (1 - stage.shutter) };
}

function land(lightYears) {
  const miss = (SHIP.jumpScatter * lightYears) / LY_PER_PC;
  const scatter = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]).map((value) => value * miss * Math.cbrt(Math.random()));
  game.camera = add(add(game.camera, scale(game.ship.forward, lightYears / LY_PER_PC)), scatter);
  if (game.mode.scored && !game.over) {
    game.energy -= lightYears;
    game.clock += lightYears / SHIP.warpLightYearsPerSecond;
  }
  game.jumps += 1;
  eyeStars = null;
}

function arrive(destination) {
  game.camera = destination.arrival(game.camera);
  faceDirection(subtract(destination.target, game.camera), destination.up);
  if (destination.speed) game.speed = Math.max(game.mode.slowestSpeed, destination.speed);
  warp.axis = [...game.ship.forward];
  game.jumps += 1;
  eyeStars = null;
}

function flightStep(seconds) {
  if (intro || photo?.running || warp) return;
  const move = [
    (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
    (held.has('KeyR') ? 1 : 0) - (held.has('KeyF') ? 1 : 0),
    (held.has('KeyW') || held.has('thrust+') ? 1 : 0) - (held.has('KeyS') || held.has('thrust-') ? 1 : 0),
  ];
  let moved = false;
  if (move.some(Boolean)) {
    const pcPerSecond = game.speed / LY_PER_PC;
    const step = add(add(scale(game.ship.right, move[0]), scale(game.ship.up, move[1])), scale(game.ship.forward, move[2]));
    const shift = scale(step, pcPerSecond * seconds);
    if (solarFrame) moveInSolarFrame(scale(shift, KM_PER_PC));
    else game.camera = add(game.camera, shift);
    moved = true;
  }
  const yaw = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const pitch = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
  const roll = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
  if (yaw) game.ship = turn(game.ship, 'up', -yaw * LOOK_RATE * seconds);
  if (pitch) game.ship = turn(game.ship, 'right', pitch * LOOK_RATE * seconds);
  if (roll) game.ship = turn(game.ship, 'forward', roll * ROLL_RATE * seconds);
  if (yaw || pitch || roll) aimView();
  else if (moved) viewChanged();
}

let solarBodies = null;
let solarFrame = null;

const groundMaps = [];

const bodyNamed = (name) => solarBodies.find((body) => body.name === name);
const bodyEast = (body) => [
  body.north[1] * body.meridian[2] - body.north[2] * body.meridian[1],
  body.north[2] * body.meridian[0] - body.north[0] * body.meridian[2],
  body.north[0] * body.meridian[1] - body.north[1] * body.meridian[0],
];
const toBodyLocal = (body, vector) => [dot(vector, body.meridian), dot(vector, bodyEast(body)), dot(vector, body.north)];
const fromBodyLocal = (body, [x, y, z]) => add(add(scale(body.meridian, x), scale(bodyEast(body), y)), scale(body.north, z));
const groundFor = (body) => (body.ground && body.mapLayer >= 0 ? groundMaps[body.mapLayer] ?? null : null);
const frameOffsetKm = (body, frame) => (frame.coRotating ? fromBodyLocal(body, frame.localKm) : frame.offsetKm);

function enterSolarFrame() {
  if (Math.hypot(...subtract(game.camera, SUN_POSITION)) > SOLAR_REACH_PC) return null;
  const fromSunKm = scale(subtract(game.camera, SUN_POSITION), KM_PER_PC);
  const holder = holdingBody(solarBodies, fromSunKm);
  return { holder: holder.name, offsetKm: subtract(fromSunKm, holder.fromSunKm), coRotating: false, localKm: null, camera: null, landed: false };
}

function moveInSolarFrame(shiftKm) {
  const holder = bodyNamed(solarFrame.holder);
  if (solarFrame.coRotating) solarFrame.localKm = add(solarFrame.localKm, toBodyLocal(holder, shiftKm));
  else solarFrame.offsetKm = add(solarFrame.offsetKm, shiftKm);
}

function lowestDistanceKm(holder, offsetKm) {
  const ground = groundFor(holder);
  if (!ground) return holder.radiusKm + LOWEST_ALTITUDE_KM;
  const frame = groundFrame(toBodyLocal(holder, offsetKm), holder.radiusKm);
  if (frame.altitudeKm > GROUND_CHECK_KM) return holder.radiusKm;
  const { height, seaLevel } = groundHeightMetres(ground, frame.up, frame.anchor, frame.surfaceOffset, COLLISION_FOOTPRINT_METRES);
  return holder.radiusKm + (Math.max(height, seaLevel) + EYE_HEIGHT_METRES) / 1000;
}

function followSolarSystem() {
  if (!game.mode.solarSystem) {
    solarBodies = null;
    solarFrame = null;
    return;
  }
  solarBodies = placeBodies(Date.now());
  if (solarFrame && game.camera !== solarFrame.camera) solarFrame = null;
  solarFrame ??= enterSolarFrame();
  if (!solarFrame) return;
  const previous = bodyNamed(solarFrame.holder);
  const fromSunKm = add(previous.fromSunKm, frameOffsetKm(previous, solarFrame));
  const holder = holdingBody(solarBodies, fromSunKm);
  let offsetKm = subtract(fromSunKm, holder.fromSunKm);
  const lowest = lowestDistanceKm(holder, offsetKm);
  const distance = Math.hypot(...offsetKm);
  const landed = distance <= lowest;
  if (landed) offsetKm = scale(offsetKm, lowest / distance);
  if (landed && !solarFrame.landed) showStatus(`Touched down on ${holder.name === 'Moon' ? 'the Moon' : holder.name}.`);
  game.camera = add(SUN_POSITION, scale(add(holder.fromSunKm, offsetKm), 1 / KM_PER_PC));
  const coRotating = holder.kind !== 'star' && Math.hypot(...offsetKm) < CO_ROTATION_RADII * holder.radiusKm;
  solarFrame = { holder: holder.name, offsetKm, coRotating, localKm: coRotating ? toBodyLocal(holder, offsetKm) : null, camera: game.camera, landed };
  if (Math.hypot(...subtract(game.camera, SUN_POSITION)) > SOLAR_REACH_PC) solarFrame = null;
}

let groundPatches = null;

function groundInView() {
  if (!solarFrame) return null;
  const body = bodyNamed(solarFrame.holder);
  const settings = groundFor(body);
  if (!settings) return null;
  const cameraLocalKm = solarFrame.coRotating ? solarFrame.localKm : toBodyLocal(body, solarFrame.offsetKm);
  const frame = groundFrame(cameraLocalKm, body.radiusKm);
  const highest = settings.viewFromKm ?? Math.min(GROUND_VIEW_SHARE_OF_RADIUS * body.radiusKm, GROUND_VIEW_HIGHEST_KM);
  if (frame.altitudeKm > highest) return null;
  const fullyGround = highest * GROUND_VIEW_FULL_SHARE_OF_HIGHEST;
  const blend = Math.min(1, Math.max(0, (highest - frame.altitudeKm) / (highest - fullyGround)));
  const aboveGroundKm = Math.max(0, Math.hypot(...cameraLocalKm) - lowestDistanceKm(body, fromBodyLocal(body, cameraLocalKm)));
  const seen = { body, settings, cameraLocalKm, frame, aboveGroundKm, blend: blend * blend * (3 - 2 * blend) };
  const { tanHalf, pixelAngle } = eyeView();
  return { ...seen, ...groundPatches.visible(seen, { basis: { right: toBodyLocal(body, game.basis.right), up: toBodyLocal(body, game.basis.up), forward: toBodyLocal(body, game.basis.forward) }, tanHalf, pixelAngle, sun: toBodyLocal(body, body.sunward) }) };
}

function bodiesInView() {
  if (!solarFrame) return null;
  const cameraFromSunKm = add(bodyNamed(solarFrame.holder).fromSunKm, solarFrame.offsetKm);
  return solarBodies
    .map((body) => ({ body, offsetKm: subtract(body.fromSunKm, cameraFromSunKm) }))
    .sort((a, b) => Math.hypot(...a.offsetKm) - Math.hypot(...b.offsetKm));
}

let skyStale = true;
let skySharp = false;
function viewChanged() {
  skyStale = true;
  skySharp = false;
  if (photo && !photo.running) closePhoto();
}

const longExposureShown = () => game.mode.longExposure && longExposureToggle.checked;

function setLongExposure(shown) {
  longExposureToggle.checked = shown;
  skySharp = false;
}

function nextSkyResolution() {
  if (skyStale) {
    skyStale = false;
    return SKY_RESOLUTION_MOVING;
  }
  if (!skySharp) {
    skySharp = true;
    return longExposureShown() ? SKY_RESOLUTION_PHOTO : SKY_RESOLUTION_STILL;
  }
  return 0;
}

function nearestStarPc(stars) {
  let nearest = Infinity;
  for (let i = STAR_DISTANCE_SLOT; i < stars.precise.length; i += STAR_STRIDE) nearest = Math.min(nearest, stars.precise[i]);
  return nearest;
}

function refreshEyeStars(now) {
  if (!nearby.length) return;
  const drift = eyeAnchor ? Math.hypot(...subtract(game.camera, eyeAnchor)) : Infinity;
  const regatherAfter = eyeStars ? Math.min(REGATHER_DISTANCE, REGATHER_SHARE_OF_NEAREST_STAR * eyeNearestStarPc) : 0;
  if (eyeStars && (drift < regatherAfter || now - eyeGatheredAt < REGATHER_INTERVAL)) return;
  eyeAnchor = [...game.camera];
  eyeStars = gatherStars({ camera: eyeAnchor, limit: EYE_LIMIT, budget: EYE_BUDGET, armMap, nebulae, nearby });
  eyeNearestStarPc = nearestStarPc(eyeStars);
  eyeGatheredAt = now;
  eyeStarsChanged = true;
}

function eyeView() {
  return {
    camera: game.camera,
    basis: game.basis,
    tanHalf: eyeTanHalf(),
    pixelAngle: EYE_FIELD_HEIGHT / view.height,
    anchorShift: subtract(game.camera, eyeAnchor),
  };
}

let lastFrame = performance.now();
function frame(now) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!intro && !game.over && game.mode.scored && !photo?.running && !warp && document.visibilityState === 'visible') game.clock += seconds;
  if (intro) advanceIntro(now);
  const warpView = warp ? advanceWarp(now) : null;
  adaptation = adaptEyes(adaptation, warpView?.glareLux ?? 0, seconds);
  flightStep(seconds);
  followSolarSystem();
  refreshEyeStars(now);
  if (eyeStars) {
    frameSeed = (frameSeed + 1) >>> 0;
    const ground = groundInView();
    renderer.renderEye({
      view: eyeView(),
      nebulae,
      stars: eyeStars,
      starsChanged: eyeStarsChanged,
      seed: frameSeed,
      skyResolution: nextSkyResolution(),
      cockpit: { ...cockpitUniforms(game.ship), enabled: true },
      planet: intro?.planet ?? null,
      bodies: bodiesInView(),
      ground,
      warp: warpView,
      adaptation,
      longExposure: longExposureShown(),
    });
    eyeStarsChanged = false;
  }
  if (labelsShown()) refreshGuides();
  $('[data-clock]').textContent = game.mode.scored ? formatClock(game.clock) : '';
  $('[data-speed]').textContent = formatSpeed(game.speed);
  $('[data-energy]').textContent = !game.mode.scored ? 'unlimited' : `${formatWarpTime(game.energy)} (${formatLightYears(Math.max(0, game.energy))})`;
  requestAnimationFrame(frame);
}

function clearGuides() {
  guides.getContext('2d').clearRect(0, 0, guides.width, guides.height);
}

function refreshGuides() {
  const ratio = window.devicePixelRatio || 1;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (guides.width !== Math.round(width * ratio) || guides.height !== Math.round(height * ratio)) {
    guides.width = Math.round(width * ratio);
    guides.height = Math.round(height * ratio);
  }
  const context = guides.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  if (photo || warp || !atlasFrame.hidden) return;
  drawGuides(context, { camera: game.camera, basis: game.basis, tanHalf: eyeTanHalf(), width, height, nebulae, galaxies });
}

function photoSize() {
  const width = Math.min(view.width, CAMERA.maxWidth);
  return { width, height: Math.round((width * view.height) / view.width) };
}

function toggleExposure() {
  if (photo?.running) {
    stopExposure();
    return;
  }
  if (intro || warp || outOfPlay() || !eyeStars) return;
  const { width, height } = photoSize();
  const pixelAngle = EYE_FIELD_HEIGHT / height;
  const electronsPerUnit = CAMERA.electronsPerNanomaggy * (pixelAngle * ARCSEC_PER_RADIAN) ** 2;
  const pointing = { camera: [...game.camera], basis: { ...game.basis }, tanHalf: eyeTanHalf() };
  const samples = renderer.exposeCamera({
    view: { ...pointing, pixelAngle, anchorShift: subtract(pointing.camera, eyeAnchor) },
    nebulae,
    stars: eyeStars,
    width,
    height,
    electronsPerNanomaggy: CAMERA.electronsPerNanomaggy,
    electronsPerUnit,
    psfPixels: CAMERA.psfPixels,
  });
  photo = {
    pointing,
    width,
    height,
    signal: measureSignal(samples),
    electronsPerUnit,
    frames: 0,
    target: Number(exposureSelect.value) / CAMERA.frameSeconds,
    running: true,
    timer: setInterval(exposeFrame, CAMERA.realSecondsPerFrame * 1000),
  };
  game.exposures += 1;
  exposeButton.textContent = 'Stop exposure';
  atlasFrame.hidden = true;
  clearGuides();
  exposeFrame();
  if (skyFillsPixels(photo)) showStatus('Even a 10 s frame fills the pixels here. The bright parts will show as white.', 6);
}

function exposeFrame() {
  photo.frames += 1;
  if (game.mode.scored && !game.over) game.clock += CAMERA.frameSeconds;
  developPhoto();
  photoFrame.hidden = false;
  if (photo.frames >= photo.target) stopExposure();
}

function stopExposure() {
  clearInterval(photo.timer);
  photo.running = false;
  exposeButton.textContent = 'Start exposure';
  developPhoto();
}

function closePhoto() {
  if (photo) clearInterval(photo.timer);
  photo = null;
  photoFrame.hidden = true;
  exposeButton.textContent = 'Start exposure';
}

function developPhoto() {
  const { width, height, frames, signal, electronsPerUnit } = photo;
  const seconds = frames * CAMERA.frameSeconds;
  const pixels = renderer.developCamera({
    electronsPerUnit,
    seconds,
    frames,
    seed: (game.seed * 7919 + frames * 104729 + game.exposures) >>> 0,
    ...levelsFor({ signal, seconds, frames, electronsPerUnit }),
    stretch: Number(stretchInput.value),
    readNoise: CAMERA.readNoise,
    dark: CAMERA.dark,
    fullWell: CAMERA.fullWell,
  });
  photoCanvas.width = width;
  photoCanvas.height = height;
  const context = photoCanvas.getContext('2d');
  context.putImageData(imageFromRows(pixels, width, height), 0, 0);
  if (labelsShown()) {
    drawGuides(context, { ...photo.pointing, width, height, nebulae, galaxies, fontSize: (GUIDE_FONT * width) / stage.clientWidth });
  }
  const progress = `${count(frames, 'frame')} × ${CAMERA.frameSeconds} s = ${formatClock(seconds)}`;
  photoCaption.textContent = photo.running ? `Exposing… ${progress}. Ship frozen until it ends.` : `${progress}. Move or look to return to your eyes.`;
  $('[data-stretch-value]').textContent = stretchInput.value;
}

function claim(star) {
  if (outOfPlay()) return;
  if (!star) {
    showStatus('No star there.');
    return;
  }
  if (labelsShown()) {
    showStatus(describeStar(star), 8);
    return;
  }
  if (!game.mode.scored) {
    showStatus(star.kind === KIND.sun ? 'Yes, that is the Sun.' : 'Not the Sun. Show labels to see what it is.', 6);
    return;
  }
  if (star.kind === KIND.sun) {
    finish(true);
    return;
  }
  game.wrongClaims += 1;
  game.clock += WRONG_CLAIM_SECONDS;
  showStatus('Not the Sun. One hour added to the clock.');
}

function claimInView(clientX, clientY) {
  if (!eyeStars) return;
  const box = view.getBoundingClientRect();
  const [tanX, tanY] = eyeTanHalf();
  const shift = subtract(game.camera, eyeAnchor);
  let nearest = null;
  for (let i = 0; i < eyeStars.count; i++) {
    const offset = subtract(eyeStars.precise.slice(i * 6, i * 6 + 3), shift);
    const depth = dot(offset, game.basis.forward);
    if (depth <= 0) continue;
    const distance = Math.hypot(...offset);
    if (!throughWindow(game.ship, scale(offset, 1 / distance))) continue;
    if (eyeStars.precise[i * 6 + 3] + 5 * Math.log10(distance / 10) > EYE_LIMIT) continue;
    const x = box.left + ((dot(offset, game.basis.right) / depth / tanX) * 0.5 + 0.5) * box.width;
    const y = box.top + (0.5 - (dot(offset, game.basis.up) / depth / tanY) * 0.5) * box.height;
    const miss = Math.hypot(x - clientX, y - clientY);
    if (miss <= PICK_RADIUS_PX && (!nearest || miss < nearest.miss)) {
      nearest = { kind: eyeStars.kinds[i], name: eyeStars.names[i], absolute: eyeStars.precise[i * 6 + 3], distance, miss };
    }
  }
  claim(nearest);
}

function finish(found) {
  warp = null;
  game.over = true;
  const distance = Math.hypot(...subtract(SUN_POSITION, game.camera)) * LY_PER_PC;
  if (!found) faceDirection(subtract(SUN_POSITION, game.camera));
  $('[data-ending-title]').textContent = found ? 'Home found' : 'Lost in space';
  $('[data-ending-text]').textContent = found
    ? `You found the Sun from ${formatLightYears(distance)} away in ${formatClock(game.clock)}, with ${count(game.jumps, 'jump')}, ${count(game.exposures, 'exposure')} and ${count(game.wrongClaims, 'wrong claim')}.`
    : `The Sun was ${formatLightYears(distance)} away, at the centre of your view now.`;
  if (game.helpUsed) $('[data-ending-text]').textContent += ' Practice or Explore mode was used during this mission.';
  ending.hidden = false;
}

let drag = null;
view.addEventListener('pointerdown', (event) => {
  if (photo?.running) return;
  view.focus();
  view.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
});
view.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const perPixel = EYE_FIELD_HEIGHT / stage.clientHeight;
  turnHead(-(event.clientX - drag.x) * perPixel, (event.clientY - drag.y) * perPixel);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
view.addEventListener('pointerup', (event) => {
  if (drag && !warp && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < TAP_DISTANCE) claimInView(event.clientX, event.clientY);
  drag = null;
});
view.addEventListener('pointercancel', () => (drag = null));
view.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    changeSpeed(event.deltaY < 0 ? 1.25 : 0.8);
  },
  { passive: false },
);

function changeSpeed(factor) {
  game.speed = Math.min(game.mode.topSpeed, Math.max(game.mode.slowestSpeed, game.speed * factor));
}

const FLIGHT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('select, input, textarea')) return;
  if (intro) {
    event.preventDefault();
    if (intro.waiting) beginIntro();
    else endIntro();
    return;
  }
  if (FLIGHT_KEYS.has(event.code)) {
    held.add(event.code);
    event.preventDefault();
  } else if (event.code === 'KeyZ') changeSpeed(0.5);
  else if (event.code === 'KeyX') changeSpeed(2);
  else if (event.code === 'KeyT') toggleExposure();
  else if (event.code === 'KeyJ') jump();
  else if (event.code === 'KeyC') faceDirection(game.basis.forward);
  else if (event.code === 'KeyM') toggleAtlas();
  else if (event.code === 'KeyL' && game.mode.labels) setLabels(!labelsToggle.checked);
  else if (event.code === 'KeyP' && game.mode.longExposure) setLongExposure(!longExposureToggle.checked);
  else if (event.code === 'Escape') {
    closePhoto();
    atlasFrame.hidden = true;
  }
});
window.addEventListener('keyup', (event) => held.delete(event.code));
window.addEventListener('blur', () => held.clear());

document.querySelectorAll('[data-thrust]').forEach((button) => {
  const key = button.dataset.thrust === '1' ? 'thrust+' : 'thrust-';
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held.add(key);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => held.delete(key));
});
document.querySelectorAll('[data-speed-change]').forEach((button) => {
  button.addEventListener('click', () => changeSpeed(Number(button.dataset.speedChange)));
});
document.querySelector('[data-touch]').addEventListener('contextmenu', (event) => event.preventDefault());

let atlasDrawn = false;
function toggleAtlas() {
  if (!atlasDrawn && nearby.length) {
    drawAtlas($('[data-atlas]'), nebulae, nearby, galaxies);
    atlasDrawn = true;
  }
  atlasFrame.hidden = !atlasFrame.hidden;
  if (!atlasFrame.hidden && photo && !photo.running) closePhoto();
}

photoCanvas.addEventListener('click', (event) => !photo?.running && claimInView(event.clientX, event.clientY));
$('[data-photo-close]').addEventListener('click', closePhoto);
$('[data-intro-skip]').addEventListener('click', endIntro);
introFrame.addEventListener('pointerdown', (event) => intro?.waiting && !event.target.closest('[data-intro-skip]') && beginIntro());
for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, unlockMusic, { capture: true });
musicToggle.checked = musicWanted();
musicToggle.addEventListener('change', () => setMusic(musicToggle.checked));
$('[data-atlas-close]').addEventListener('click', () => (atlasFrame.hidden = true));
$('[data-atlas-open]').addEventListener('click', toggleAtlas);
exposeButton.addEventListener('click', toggleExposure);
stretchInput.addEventListener('input', () => photo && developPhoto());
giveUpButton.addEventListener('click', () => {
  if (game.over) return;
  endIntro();
  if (game.mode.scored) {
    finish(false);
    return;
  }
  faceDirection(subtract(SUN_POSITION, game.camera));
});
$('[data-jump]').addEventListener('click', jump);
$('[data-align]').addEventListener('click', () => faceDirection(game.basis.forward));
modeSelect.addEventListener('change', () => setMode(modeSelect.value));
$('[data-go-to-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  goTo(goToInput.value);
});
goToInput.addEventListener('focus', destinations);
labelsToggle.addEventListener('change', () => setLabels(labelsToggle.checked));
longExposureToggle.addEventListener('change', () => setLongExposure(longExposureToggle.checked));
restartButton.addEventListener('click', () => newGame());
$('[data-new-game]').addEventListener('click', () => newGame());
new ResizeObserver(resize).observe(stage);

if (!renderer) {
  showStatus(rendererProblem, 3600);
} else {
  const requested = Number(new URL(window.location.href).searchParams.get('seed'));
  const modeName = modeFromName(new URL(window.location.href).searchParams.get('mode'));
  newGame(Number.isInteger(requested) && requested > 0 ? requested : randomSeed(), modeName);
  resize();
  loadWarpOptics('data/warp-optics.bin').then((optics) => {
    warpOptics = optics;
    renderer.loadWarpTable(optics);
  });
  groundPatches = createGroundPatches(renderer.releasePatch);
  loadBodyMaps(new URL('data/planets/', window.location.href), (layer, maps) => {
    renderer.loadBodyMap(layer, maps);
    groundMaps[layer] = maps.ground ?? null;
  }).catch(() => showStatus('Planet maps failed to load; planets show placeholder surfaces.'));
  loadNearbyStars('data/nearby-stars.bin', 'data/nearby-star-names.json').then((stars) => {
    nearby = stars;
  });
  requestAnimationFrame(frame);
}
