import { drawAtlas } from './atlas.js';
import { nameButton, showTipsAbove } from './dock-buttons.js';
import { CAMERA, imageFromRows, levelsFor, measureSignal, skyFillsPixels } from './camera.js';
import { createCutscene } from './cutscene.js';
import { bodyDestination, craftDestination, craftNow, galaxyDestination, isSpeculative, listDestinations, nebulaDestination, placedNow, plainStarDestination, speculativeBodiesNow, starDestination, SUN_DESTINATION } from './destinations.js';
import { GALAXIES, placeGalaxies } from './galaxies.js';
import { AU_PER_LY, buildArmMap, DEGREES, equatorialToFrame, LY_PER_PC, positionSeenAt, SUN_POSITION } from './milky-way.js';
import { describePick } from './picking.js';
import { menuScene, turnedApart } from './menu-scene.js';
import { DEFAULT_MODE, MENU_SCENE, MODES, modeFromName } from './modes.js';
import { KOTO_GARDEN } from './music/koto-garden.js';
import { createMusicPlayer } from './music/player.js';
import { NEBULAE } from './nebulae.js';
import { describeStar, drawEdgeArrow, drawGuides, formatDistance } from './practice.js';
import { eased, planGlide } from './glide-path.js';
import { createRandom, randomSeed } from './random.js';
import { adaptEyes, glareForRow, loadWarpOptics, rowForSpeed, WARP_SECONDS, warpStage } from './warp.js';
import { hideLoading, showShadersReady } from './loading-screen.js';
import { createRenderer } from './renderer.js';
import { segmentPath } from './rocket-path.js';
import { coast, createMotions, forecastPath, rangeOf } from './rocket-forecast.js';
import { burnKmS, closestApproach, cutAtBurn, secondsToApsis, stateOnPath } from './rocket-burn.js';
import { cameraBasis, cameraPole, swungAround } from './rocket-camera.js';
import { modelNamed } from './spacecraft-models.js';
import { CANOPY_STEPS, canopyModel, canopyTopZ, FEET_BELOW_ORIGIN_M, modelOfParts, nozzlesOf, podsOf } from './rocket-model.js';
import { dropAway, FARTHEST_DROPPED_KM, MOST_DROPPED, stepDropped } from './dropped-stages.js';
import { exhaustOf } from './rocket-exhaust.js';
import { airAround, airVelocityKmS, dynamicPressurePa, fallThroughAir, insideAir, seaLevelsOfPressure } from './air-drag.js';
import { assemble, attachedEntries, burn, deltaVLeftMS, DEFAULT_DESIGN, designFrom, firingEngines, lowestOf, massKg, PARTS, refuel, separate, shapeOf, stagesLeft, thrustOf } from './rocket-stages.js';
import { createRocketEditor } from './rocket-editor.js';
import { circularOrbit, FASTEST_BURN_RATE, flown, gravityWells, orbitalPlanePole, pullKmS2, relativeMotions, wellAround } from './rocket.js';
import { studioPanelOpen, toggleStudioPanel } from '../../../assets/js/studio.js';
import { loadCloudMapsOf } from './clouds.js';
import { CLOUD_MAP_SIZE, SIMULATED_CLOUD_SIZE } from './shaders.js';
import { holdingBody, KM_PER_AU, KM_PER_PC, loadBodyMaps, loadCityLights, loadCloudMap, lowestAltitudeKm, placeBodies, radiusBelowKm, sunShareVisible } from './solar-system.js';
import { showSpeculation, speculationShown } from './speculation.js';
import { blackHolesWithin, KNOWN_BLACK_HOLES, nearestBlackHole } from './black-holes.js';
import { PULSAR_HOSTS, withExoplanetHosts } from './exoplanets.js';
import { beamReaches } from './pulsars.js';
import { knowStarsNearSun, nearestCivilization, otherSystems, SOLAR_SYSTEM, SYSTEM_REACH_PC, systemAround, systemNamed, systemNear, systemOf, withinSystem } from './planetary-systems.js';
import { drawCraftMarks, drawCraftPath, drawOrbits, drawRocketPath, rocketPathColour } from './orbits.js';
import { cruiseOf, cruisePoint, flightDates, isOut, loadSpacecraft, placeSpacecraft } from './spacecraft.js';
import { createPathTracer } from './craft-path-line.js';
import { offsetInStretch } from './spacecraft-paths.js';
import { backToNow, capRate, capRateWithin, describeRate, EARLIEST_MS, faster, hitTimeLimit, jumpTo, LATEST_MS, paused, playFrom, simNow, slower, togglePause } from './sim-clock.js';
import { EYE_HEIGHT_METRES, groundFrame, groundHeightMetres } from './terrain.js';
import { createGroundPatches } from './ground-patches.js';
import { createSpeedDial, createThumbStick, createTwoFingerGesture, touchScreen } from './touch-controls.js';
import { drainageOf } from './river-ribbons.js';
import { riversNear } from './rivers.js';
import { cockpitUniforms, OVERSHOOT_LY, SHIP, throughWindow, viewBasis } from './ship.js';
import { fieldStarSeenAt, gatherStars, KIND, loadNearbyStars, placeNebulae, starsOfBoth, starsWithin, SUN_ABSOLUTE } from './stars.js';
import { add, cross, dot, normalize, orthonormal, rotateAbout, rotateBasis, scale, subtract } from './vectors.js';
import { otherEnd, spokenHost, throughThroat, travel } from './wormholes.js';

const EYE_FIELD_HEIGHT = 50 * DEGREES;
const WIDEST_FIELD_HEIGHT = 90 * DEGREES;
const NARROWEST_FIELD_HEIGHT = 0.05 * DEGREES;
const ZOOM_STEP = 1.25;
const ZOOM_PER_WHEEL_PIXEL = 0.01;
const MOST_WHEEL_PIXELS_PER_EVENT = 25;
const MAX_PIXEL_RATIO = 1.25;
const EYE_LIMIT = 6.5;
const SKY_RESOLUTION_MOVING = 0.25;
const SKY_RESOLUTION_STILL = 0.5;
const SKY_RESOLUTION_PHOTO = 1;
const EYE_BUDGET = 60000;
const REGATHER_DISTANCE = 0.3;
const REGATHER_INTERVAL = 150;
const REGATHER_SHARE_OF_NEAREST_STAR = 0.5;
const SHORTEST_REGATHER_DISTANCE = 1e-9;
const STAR_STRIDE = 6;
const STAR_DISTANCE_SLOT = 5;
const LOOK_RATE = 0.9;
const ROLL_RATE = 0.9;
const LANDING_REARM_KM = 1;
const SPIN_SEEN_PIXELS = 1;
const SPIN_FRAMES_TO_SHARPEN = 30;
const GROUND_CHECK_KM = 60;
const GROUND_VIEW_SHARE_OF_RADIUS = 0.12;
const GROUND_VIEW_HIGHEST_KM = 400;
const GROUND_VIEW_FULL_SHARE_OF_HIGHEST = 0.8;
const COLLISION_FOOTPRINT_METRES = 0.05;
const KM_PER_LY = KM_PER_PC / LY_PER_PC;
const EARTH_VIEW_RADII = 4;
const EARTH_VIEW_SUN_ANGLE = 60 * DEGREES;
const EARTH_VIEW_SPEED_KM_S = 1000;
const START_LATITUDE = [15, 70];
const START_CLEARANCE = 15000;

const WRONG_CLAIM_SECONDS = 3600;
const PICK_RADIUS_PX = { mouse: 10, touch: 22 };
const MOON_PICKABLE_ORBIT_PX = 30;
const TAP_DISTANCE = { mouse: 6, touch: 12 };
const ARCSEC_PER_RADIAN = 206264.8;
const GUIDE_FONT = 13;
const MOTION_BLUR_STORAGE_KEY = 'sail-the-stars-motion-blur';
const UNLIMITED_FUEL_STORAGE_KEY = 'sail-the-stars-unlimited-fuel';
const ROCKET_DESIGN_STORAGE_KEY = 'sail-the-stars-rocket-design';
const TRUE_SIZE_STORAGE_KEY = 'sail-the-stars-true-size';
const MUSIC_STORAGE_KEY = 'find-home-music';
const MENU_STEADY_PIXELS = 0.5;
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
const crosshair = $('[data-crosshair]');
const modeSelect = $('[data-mode]');
const clockLabel = $('[data-clock-label]');
const giveUpButton = $('[data-give-up]');
const alignButton = $('.fh-dock [data-align]');
const energyField = $('[data-energy-field]');
const labelsToggle = $('[data-labels]');
const labelsField = $('[data-labels-field]');
const introFrame = $('[data-intro]');
const introText = $('[data-intro-text]');
const musicToggle = $('[data-music]');
const restartButton = $('[data-restart]');
const selectField = $('[data-select-field]');
const longExposureField = $('[data-long-exposure-field]');
const rocketField = $('[data-rocket-field]');
const unlimitedFuelField = $('[data-unlimited-fuel-field]');
const unlimitedFuelToggle = $('[data-unlimited-fuel]');
const rocketToggle = $('[data-rocket]');
const motionBlurToggle = $('[data-motion-blur]');
const trueSizeToggle = $('[data-true-size]');
const screenWidthInput = $('[data-screen-width]');
const eyeDistanceInput = $('[data-eye-distance]');
const trueSizeUnitSelect = $('[data-true-size-unit]');
const speculationToggle = $('[data-speculation]');
const longExposureToggle = $('[data-long-exposure]');
const selectInput = $('[data-select]');
const selectList = $('[data-select-list]');
const solarNote = $('[data-solar-note]');
const exploreBrief = $('[data-explore-brief]');
const missionBrief = $('[data-mission-brief]');
const menuFrame = $('[data-menu]');
const menuResume = $('[data-menu-resume]');

const armMap = buildArmMap();
const galaxies = placeGalaxies(GALAXIES);
let renderer = null;
let rendererProblem = 'This game needs WebGL 2 with float render targets.';
try {
  renderer = await createRenderer(view, armMap, galaxies, showShadersReady);
} catch (error) {
  rendererProblem = `Your graphics chip could not run the sky shader: ${String(error.message).split('\n')[0]}`;
}
const nebulae = placeNebulae(NEBULAE);
let catalogue = [];
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

function startNearEarth() {
  const earth = placeBodies(simNow()).find((body) => body.name === 'Earth');
  const acrossSun = cross(earth.north, earth.sunward);
  const outward = add(scale(earth.sunward, Math.cos(EARTH_VIEW_SUN_ANGLE)), scale(acrossSun, Math.sin(EARTH_VIEW_SUN_ANGLE) / Math.hypot(...acrossSun)));
  const fromSunKm = add(earth.fromSunKm, scale(outward, EARTH_VIEW_RADII * earth.radiusKm));
  game.startedNearEarth = true;
  game.camera = add(SUN_POSITION, scale(fromSunKm, 1 / KM_PER_PC));
  game.speed = EARTH_VIEW_SPEED_KM_S / KM_PER_LY;
  faceDirection(scale(outward, -1), earth.north);
  setMode('explore');
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
  setField(normalFieldHeight());
  ending.hidden = true;
  setMode(modeName);
  if (game.mode === MODES.mission) playIntro();
}

let menu = null;

const menuView = () => menuScene(placeBodies(simNow()), view.width / view.height);

function parkedGame() {
  return { game, system, solarFrame, fieldHeight, following, rotatingWith, modeLabel: menuFrame.querySelector(`[data-menu-mode="${modeSelect.value}"] strong`).textContent };
}

function openMenu() {
  if (menu) return;
  if (warp) {
    showStatus('Wait until you drop out of warp.');
    return;
  }
  endIntro();
  closePhoto();
  atlasFrame.hidden = true;
  timePanel.hidden = true;
  timeButton.setAttribute('aria-pressed', 'false');
  aim = null;
  glide = null;
  letGo();
  clearSelection();
  hideStatus();
  menu = { parked: game ? parkedGame() : null };
  const { earth, offsetKm, ship } = menuView();
  const head = { yaw: 0, pitch: 0 };
  game = { camera: add(SUN_POSITION, scale(add(earth.fromSunKm, offsetKm), 1 / KM_PER_PC)), ship, head, basis: viewBasis(ship, head), speed: 0, energy: 0, clock: 0, over: false, mode: MENU_SCENE };
  following = true;
  rotatingWith = null;
  holdMenuView();
  eyeStars = null;
  viewChanged();
  menuResume.hidden = !menu.parked;
  if (menu.parked) menuResume.firstElementChild.textContent = `Continue ${menu.parked.modeLabel}`;
  menuFrame.hidden = false;
  document.body.classList.add('fh-menu-open');
}

function holdMenuView() {
  const { earth, offsetKm, ship, fieldHeight: field } = menuView();
  if (system !== SOLAR_SYSTEM) enterSystem(SOLAR_SYSTEM);
  solarFrame = { holder: earth.name, offsetKm, coRotating: false, localKm: null, camera: game.camera, landed: false, landingArmed: true, body: earth };
  if (field !== fieldHeight) setField(field);
  if (turnedApart(ship, game.ship) < MENU_STEADY_PIXELS * (fieldHeight / view.height)) return;
  game.ship = ship;
  aimView();
}

function closeMenu() {
  menu = null;
  menuFrame.hidden = true;
  document.body.classList.remove('fh-menu-open');
  solarFrame = null;
  setFollowing(true);
  view.focus({ preventScroll: true });
}

function resumeFromMenu() {
  const { parked } = menu;
  closeMenu();
  ({ game, solarFrame, following, rotatingWith } = parked);
  enterSystem(parked.system);
  eyeStars = null;
  setField(parked.fieldHeight);
  aimView();
}

function startFromMenu(modeName) {
  closeMenu();
  newGame(randomSeed(), modeName);
  if (game.mode === MODES.explore) startNearEarth();
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

function recallDesign() {
  try {
    return designFrom(JSON.parse(localStorage.getItem(ROCKET_DESIGN_STORAGE_KEY))) ?? DEFAULT_DESIGN;
  } catch {
    return DEFAULT_DESIGN;
  }
}

let rocketDesign = recallDesign();

function useDesign(design) {
  rocketDesign = design;
  try {
    localStorage.setItem(ROCKET_DESIGN_STORAGE_KEY, JSON.stringify(design));
  } catch {}
  if (!rocket?.vehicle) return;
  rebuildRocket(design);
  rocket.warnedDry = false;
  showStatus('New rocket built, tanks full.');
}

function recallUnlimitedFuel() {
  try {
    unlimitedFuelToggle.checked = localStorage.getItem(UNLIMITED_FUEL_STORAGE_KEY) === 'on';
  } catch {}
}

function unlimitedFuelChanged() {
  if (unlimitedFuelToggle.checked && rocket?.vehicle) refuel(rocket.vehicle);
  try {
    localStorage.setItem(UNLIMITED_FUEL_STORAGE_KEY, unlimitedFuelToggle.checked ? 'on' : 'off');
  } catch {}
}

function motionBlurWanted() {
  try {
    const saved = localStorage.getItem(MOTION_BLUR_STORAGE_KEY);
    if (saved) return saved === 'on';
  } catch {}
  return !prefersStillness.matches;
}

function rememberMotionBlur() {
  try {
    localStorage.setItem(MOTION_BLUR_STORAGE_KEY, motionBlurToggle.checked ? 'on' : 'off');
  } catch {}
}

function recallTrueSize() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRUE_SIZE_STORAGE_KEY));
    if (!saved) return;
    trueSizeToggle.checked = saved.on;
    trueSizeUnitSelect.value = saved.centimetresPerUnit;
    screenWidthInput.value = saved.screenWidth;
    eyeDistanceInput.value = saved.eyeDistance;
  } catch {}
}

function rememberTrueSize() {
  try {
    localStorage.setItem(TRUE_SIZE_STORAGE_KEY, JSON.stringify({ on: trueSizeToggle.checked, centimetresPerUnit: trueSizeUnitSelect.value, screenWidth: screenWidthInput.value, eyeDistance: eyeDistanceInput.value }));
  } catch {}
}

function trueSizeChanged() {
  rememberTrueSize();
  showTrueSizeField();
  if (trueSizeToggle.checked || fieldFollowsTrueSize) resetZoom();
}

let centimetresPerUnitShown = 1;

function convertTrueSizeUnits() {
  const centimetresPerUnit = Number(trueSizeUnitSelect.value);
  for (const input of [screenWidthInput, eyeDistanceInput]) {
    if (input.value) input.value = Number((Number(input.value) * centimetresPerUnitShown / centimetresPerUnit).toFixed(1));
  }
  centimetresPerUnitShown = centimetresPerUnit;
  trueSizeChanged();
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
const timeButton = $('[data-time-open]');
const timePanel = $('[data-time]');
const simDateField = $('[data-sim-date-field]');
const simDateInput = $('[data-sim-date-input]');
const SIM_TIME_REFRESH_MS = 250;
let simTimeShownAt = -Infinity;

const utcMinute = (ms) => new Date(ms).toISOString().slice(0, 16);
const formatSimDate = (ms) => `${utcMinute(ms).replace('T', ' ')} UTC`;

function showSimTime(now) {
  if (hitTimeLimit()) showStatus(`Time only runs from ${new Date(EARLIEST_MS).getUTCFullYear()} to ${new Date(LATEST_MS).getUTCFullYear()}, so it stopped there.`);
  if (now - simTimeShownAt < SIM_TIME_REFRESH_MS) return;
  simTimeShownAt = now;
  const shown = formatSimDate(simNow());
  $('[data-sim-date]').textContent = describeRate() === 'real time' ? shown : `${shown} · ${describeRate()}`;
  $('[data-time-rate]').textContent = describeRate();
  $('[data-time-pause]').textContent = paused() ? 'Play' : 'Pause';
  if (document.activeElement !== simDateInput) simDateInput.value = utcMinute(simNow());
}

function changeTime(change) {
  change();
  simTimeShownAt = -Infinity;
}
const orbitsButton = $('[data-orbits]');
const orbitsShown = () => game.mode.solarSystem && orbitsButton.getAttribute('aria-pressed') === 'true';

function setOrbits(shown) {
  orbitsButton.setAttribute('aria-pressed', String(shown));
  clearGuides();
}

function guideScene(width, height) {
  const seen = bodiesInView();
  if (!seen) return null;
  const offsets = new Map(seen.map(({ body, offsetKm }) => [body.name, offsetKm]));
  return { offsetOf: (name) => offsets.get(name), bodies: seen.map(({ body, offsetKm }) => ({ ...body, offsetKm })), basis: game.basis, tanHalf: eyeTanHalf(), width, height };
}

function drawOrbitLines(context, width, height) {
  const scene = guideScene(width, height);
  if (!scene) return;
  drawOrbits(context, { ...scene, paths: system.paths(simNow()) });
  drawCraftMarks(context, { ...scene, craft: craftInView().filter(({ body, offsetKm }) => craftMarked(body, offsetKm)).map(raisedAboveGround) });
}

const LANDER_MARK_RAISED_RADII = 0.01;

function raisedAboveGround({ body, offsetKm }) {
  if (!body.landed) return { body, offsetKm };
  const parent = bodyNamed(body.parent);
  return { body, offsetKm: add(offsetKm, scale(subtract(body.fromSunKm, parent.fromSunKm), LANDER_MARK_RAISED_RADII)) };
}

const LANDERS_MARKED_WITHIN_RADII = 4;
const CRAFT_MARKED_WITHIN_ORBITS = 40;

function craftMarked(craft, offsetKm) {
  if (!orbitsShown()) return false;
  const distanceKm = Math.hypot(...offsetKm);
  const parent = bodyNamed(craft.parent);
  if (craft.landed) return distanceKm < LANDERS_MARKED_WITHIN_RADII * parent.radiusKm;
  return distanceKm < CRAFT_MARKED_WITHIN_ORBITS * Math.hypot(...subtract(craft.fromSunKm, parent.fromSunKm));
}

const tracePath = createPathTracer();
const PATH_HIDDEN_WITHIN_HALF_SIZES = 60;

function drawSelectedPath(context, width, height) {
  const scene = guideScene(width, height);
  if (!scene || system !== SOLAR_SYSTEM) return;
  const now = simNow();
  const craft = craftAt(selection.destination);
  if (craft?.landed) return;
  if (craft && Math.hypot(...seenFromCamera([craft])[0].offsetKm) < PATH_HIDDEN_WITHIN_HALF_SIZES * craft.radiusKm) return;
  const cruise = cruiseOf(selection.destination);
  for (const stretch of new Set([cruise, craft?.stretch])) {
    if (!stretch) continue;
    const centre = scene.offsetOf(stretch.centre);
    const pointAt = (when) => (stretch === cruise ? cruisePoint(selection.destination, when) : equatorialToFrame(offsetInStretch(stretch, when)));
    const line = tracePath(stretch, now, pointAt, stretch === craft?.stretch);
    drawCraftPath(context, { ...scene, past: line.past.map((point) => add(centre, point)), future: line.future.map((point) => add(centre, point)) });
  }
}
const followButton = $('[data-follow]');
const rocketViewButton = $('[data-rocket-view]');
const stageButton = $('[data-drop-stage]');
const buildButton = $('[data-build]');
const editorPanel = $('[data-editor]');
const editor = createRocketEditor(editorPanel, { onDone: useDesign });
const enginesField = $('[data-engines-field]');
const enginesReadout = $('[data-engines]');
const rocketTurnButton = $('[data-rocket-turn]');
const burnButton = $('[data-burn-open]');
const burnPanel = $('[data-burn]');
const burnPointButton = $('[data-burn-point]');
const burnAutopilotButton = $('[data-burn-autopilot]');
const rotateButton = $('[data-rotate-with]');
let following = true;
let rotatingWith = null;

function setFollowing(on) {
  following = on;
  if (!on) rotatingWith = null;
}

function setRotatingWith(name) {
  rotatingWith = name;
  if (name) following = true;
}

function showCompanionButtons() {
  const holder = solarFrame ? bodyNamed(solarFrame.holder) : null;
  const near = Boolean(holder) && holder.kind !== 'star';
  followButton.hidden = !near || rocketAboard();
  rocketViewButton.hidden = !rocketAboard();
  stageButton.hidden = !rocketAboard() || !rocket.vehicle || !(stagesLeft(rocket.vehicle) || parachutePacked());
  buildButton.hidden = !rocketAboard();
  rocketTurnButton.hidden = !rocketOutside();
  burnButton.hidden = !rocketAboard();
  if (burnButton.hidden && !burnPanel.hidden) showBurnPanel(false);
  rotateButton.hidden = !near || holder.kind === 'wormhole';
  if (!near) return;
  const name = spokenName(holder);
  const label = (button, text, on) => {
    nameButton(button, text);
    if (button.getAttribute('aria-pressed') !== String(on)) button.setAttribute('aria-pressed', String(on));
  };
  label(followButton, `Follow ${name}`, following);
  label(rotateButton, `Rotate with ${name}`, rotatingWith === holder.name);
}

const outOfPlay = () => game.over && game.mode.scored;

const leavingExplore = () => game.mode === MODES.explore && modeSelect.value !== 'explore';

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
  selectField.hidden = !mode.selecting;
  orbitsButton.hidden = !mode.solarSystem;
  timeButton.hidden = !mode.solarSystem;
  simDateField.hidden = !mode.solarSystem;
  if (!mode.solarSystem) timePanel.hidden = true;
  longExposureField.hidden = !mode.longExposure;
  rocketField.hidden = mode !== MODES.explore;
  unlimitedFuelField.hidden = rocketField.hidden;
  if (rocketField.hidden && rocket) setRocket(false);
  solarNote.hidden = !mode.solarSystem;
  exploreBrief.hidden = mode !== MODES.explore;
  missionBrief.hidden = mode === MODES.explore;
  clockLabel.textContent = mode.clockLabel;
  alignButton.hidden = !mode.cockpit;
  energyField.hidden = touchScreen.matches && !mode.scored;
  nameButton(giveUpButton, mode.sunButton, mode.sunIcon);
  giveUpButton.setAttribute('aria-description', mode.sunHint);
  restartButton.textContent = mode.restartButton;
  const url = new URL(window.location.href);
  if (game.startedNearEarth) url.searchParams.delete('seed');
  else url.searchParams.set('seed', game.seed);
  if (mode === MODES[DEFAULT_MODE]) url.searchParams.delete('mode');
  else url.searchParams.set('mode', modeSelect.value);
  window.history.replaceState(null, '', url);
  clearSelection();
  aim = null;
  glide = null;
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
  showTrueSizeField();
  if (fieldFollowsTrueSize) setField(trueFieldHeight());
}

let fieldHeight = EYE_FIELD_HEIGHT;
let fieldFollowsTrueSize = false;

function trueFieldHeight() {
  const centimetresPerUnit = Number(trueSizeUnitSelect.value);
  const screenWidthCm = Number(screenWidthInput.value) * centimetresPerUnit;
  const eyeDistanceCm = Number(eyeDistanceInput.value) * centimetresPerUnit;
  if (!(screenWidthCm > 0 && eyeDistanceCm > 0 && screen.width > 0)) return null;
  const viewHeightCm = stage.clientHeight * (screenWidthCm / screen.width);
  return 2 * Math.atan(viewHeightCm / 2 / eyeDistanceCm);
}

const normalFieldHeight = () => (trueSizeToggle.checked && trueFieldHeight()) || EYE_FIELD_HEIGHT;

function showTrueSizeField() {
  const height = trueFieldHeight();
  $('[data-true-size-field]').textContent = height ? formatField(height) : '—';
}

function formatField(radians) {
  const degrees = radians / DEGREES;
  if (degrees >= 10) return `${Math.round(degrees)}°`;
  if (degrees >= 1) return `${degrees.toFixed(1)}°`;
  return `${(degrees * 60).toFixed(degrees * 60 >= 10 ? 0 : 1)}′`;
}

function setField(height) {
  fieldHeight = Math.min(WIDEST_FIELD_HEIGHT, Math.max(NARROWEST_FIELD_HEIGHT, height));
  fieldFollowsTrueSize = trueSizeToggle.checked && height === trueFieldHeight();
  $('[data-zoom-reset]').textContent = formatField(fieldHeight);
  viewChanged();
}

function zoomTo(height) {
  if (!intro && !photo?.running) setField(height);
}

const zoomBy = (factor) => zoomTo(fieldHeight / factor);
const resetZoom = () => zoomTo(normalFieldHeight());

function eyeTanHalf() {
  const tanY = Math.tan(fieldHeight / 2);
  return [tanY * (view.width / view.height), tanY];
}

const held = new Set();
const stick = createThumbStick($('[data-stick]'));

function letGo() {
  held.clear();
  stick.release();
}

function aimView() {
  game.basis = rocketOutside() ? cameraBasis(rocket.away, rocketCameraPole()) : viewBasis(game.ship, game.head);
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
  if (game.mode.glideWarp) {
    const end = jumpLanding(lightYears);
    glideTo({ target: add(end, scale(game.ship.forward, lightYears / LY_PER_PC)), arrival: () => end }, `Jumped ${formatLightYears(lightYears)}.`);
    return;
  }
  startWarp(lightYears, null);
}

const warpReady = () => !intro && !photo?.running && !warp && !aim && !glide && warpOptics && eyeStars && !outOfPlay();

const AIM_SECONDS_PER_HALF_TURN = 0.8;
const QUICKEST_AIM_SECONDS = 0.2;
const ALREADY_AIMED_RADIANS = 1e-4;
let aim = null;

function aimThen(direction, done) {
  const target = normalize(direction);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(game.ship.forward, target))));
  game.head = { yaw: 0, pitch: 0 };
  if (angle < ALREADY_AIMED_RADIANS) {
    done();
    return;
  }
  const sideways = Math.abs(angle - Math.PI) < ALREADY_AIMED_RADIANS ? game.ship.up : normalize(cross(game.ship.forward, target));
  const seconds = Math.max(QUICKEST_AIM_SECONDS, (AIM_SECONDS_PER_HALF_TURN * angle) / Math.PI);
  aim = { from: game.ship, axis: sideways, angle, seconds, startedAt: performance.now(), done };
}

function advanceAim(now) {
  const progress = Math.min(1, (now - aim.startedAt) / 1000 / aim.seconds);
  game.ship = rotateBasis(aim.from, aim.axis, aim.angle * eased(progress));
  aimView();
  if (progress < 1) return;
  const { done } = aim;
  aim = null;
  done();
}

const GLIDE_SWING_FROM = 0.37;
const GLIDE_CLEARANCE = 0.3;
const GLIDE_DEPARTURE_RADII = 1000;
const LONGEST_GLIDE_STEP_SECONDS = 1 / 30;
const STEEPEST_ROLL_SHARE = 1e-3;
let glide = null;

function departureRoomPc() {
  return solarFrame ? Math.hypot(...solarFrame.offsetKm) / KM_PER_PC : eyeNearestStarPc * REGATHER_SHARE_OF_NEAREST_STAR;
}

const craftAt = ({ craft }) => (craft && solarBodies && system === SOLAR_SYSTEM ? solarCraft.find(({ name }) => name === craft.name) ?? null : null);

function cameraFromSunKm() {
  const holder = bodyNamed(solarFrame.holder) ?? solarFrame.body;
  return add(holder.fromSunKm, frameOffsetKm(holder, solarFrame));
}

function awayFrom(destination) {
  const craft = solarFrame && craftAt(destination);
  return craft ? scale(subtract(cameraFromSunKm(), craft.fromSunKm), 1 / KM_PER_PC) : subtract(game.camera, destination.target);
}

function towardMiddle(destination) {
  const craft = craftAt(destination);
  const away = scale(awayFrom(destination), -1);
  return craft ? add(away, destination.middle(craft, bodyNamed(craft.parent))) : away;
}

function standoffAt(destination) {
  if (destination.beside) return destination.beside(game.camera);
  if (!destination.craft) return subtract(destination.arrival(game.camera), destination.target);
  const craft = craftAt(destination) ?? craftNow(destination.craft);
  const parent = craft.parent === 'Sun' ? SUN_AS_PARENT : placedNow({ name: craft.parent });
  return destination.standoff({ craft, parent });
}

function departureFor(destination) {
  if (!solarFrame) return null;
  const left = bodyNamed(solarFrame.holder);
  const holder = left.kind === 'craft' ? bodyNamed(left.parent) : left;
  if (holder.kind === 'star' || holder.name === craftAt(destination)?.parent) return null;
  return { holder: holder.name, offsetKm: subtract(cameraFromSunKm(), holder.fromSunKm) };
}

function glideTo(destination, announcement = `Arrived at ${destination.name}.`) {
  if (!warpReady() || absent(destination)) return;
  aimThen(towardMiddle(destination), () => {
    if (absent(destination)) return;
    const from = [...game.camera];
    const { target } = destination;
    if (destination.beside) starsBeyond(beyondMouth(destination.subject.body));
    const away = awayFrom(destination);
    const standoff = standoffAt(destination);
    const path = planGlide({
      distance: Math.hypot(...away),
      finalDistance: Math.hypot(...standoff),
      departureRoom: departureRoomPc(),
    });
    const departed = departureFor(destination);
    const stars = starsAlongGlide(from, add(target, standoff));
    if (stars) showStars(stars.departing);
    glide = { destination, announcement, from, away, standoff, path, departed, stars, pastHalfway: false, up: game.ship.up, roll: 0, seconds: 0, steppedAt: performance.now() };
  });
}

function starsAlongGlide(from, end) {
  if (Math.hypot(...subtract(from, end)) < regatherDistancePc()) return null;
  return starsOfBoth({ stars: eyeStars, anchor: eyeAnchor }, { stars: gatherEyeStars(end), anchor: end });
}

function showStars({ stars, anchor }) {
  eyeStars = stars;
  eyeAnchor = anchor;
  eyeStarsChanged = true;
}

function rollTo(up, level) {
  const sideways = dot(up, level.right);
  const upright = dot(up, level.up);
  if (Math.hypot(sideways, upright) < STEEPEST_ROLL_SHARE) return glide.roll;
  const roll = Math.atan2(sideways, upright);
  return roll + 2 * Math.PI * Math.round((glide.roll - roll) / (2 * Math.PI));
}

function upAt(destination) {
  const craft = craftAt(destination);
  return craft ? destination.upNear(craft, bodyNamed(craft.parent)) : destination.up;
}

function faceWhileRolling(direction, share) {
  const level = orthonormal(direction, glide.up);
  glide.up = level.up;
  const up = upAt(glide.destination);
  if (up) glide.roll = rollTo(up, level);
  const roll = glide.roll * share;
  faceDirection(direction, add(scale(level.up, Math.cos(roll)), scale(level.right, Math.sin(roll))));
}

function offsetFromTarget(progress) {
  const away = glide.destination.craft ? glide.away : subtract(glide.from, glide.destination.target);
  const [start, finish] = [normalize(away), normalize(glide.standoff)];
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(start, finish))));
  const axis = angle < ALREADY_AIMED_RADIANS || Math.PI - angle < ALREADY_AIMED_RADIANS ? glide.up : normalize(cross(start, finish));
  const swing = eased(Math.max(0, (progress - GLIDE_SWING_FROM) / (1 - GLIDE_SWING_FROM)));
  return scale(rotateAbout(start, axis, angle * swing), glide.path.distanceAt(progress));
}

function clearOfDeparted(holder, offsetKm, travelledKm) {
  const distance = Math.hypot(...offsetKm);
  const clearance = holder.radiusKm * (1 + GLIDE_CLEARANCE * Math.min(1, travelledKm / holder.radiusKm));
  return distance < clearance ? scale(offsetKm, clearance / distance) : offsetKm;
}

function frameAround(holder, offsetKm) {
  game.camera = add(system.position, scale(add(holder.fromSunKm, offsetKm), 1 / KM_PER_PC));
  solarFrame = { holder: holder.name, offsetKm, coRotating: false, localKm: null, camera: game.camera, landed: false, landingArmed: true, body: holder };
}

const CRAFT_CLEARANCE = 1.005;
const CRAFT_CLIMB_SHARE = 0.2;

function frameAroundCraft(craft, offsetKm) {
  const parent = bodyNamed(craft.parent);
  if (parent.kind === 'star') {
    frameAround(craft, offsetKm);
    return;
  }
  const fromParentKm = subtract(craft.fromSunKm, parent.fromSunKm);
  const lowest = craft.landed ? Math.hypot(...fromParentKm) : CRAFT_CLEARANCE * parent.radiusKm;
  const floor = lowest + CRAFT_CLIMB_SHARE * Math.min(Math.hypot(...offsetKm), parent.radiusKm);
  const placeKm = add(fromParentKm, offsetKm);
  const height = Math.hypot(...placeKm);
  const clearKm = height < floor ? scale(placeKm, floor / height) : placeKm;
  if (craft.landed) {
    const aboveGroundKm = scale(clearKm, Math.max(1, lowestDistanceKm(parent, clearKm) / Math.hypot(...clearKm)));
    frameAround(parent, aboveGroundKm);
    solarFrame = { ...solarFrame, coRotating: true, localKm: toBodyLocal(parent, aboveGroundKm) };
  } else frameAround(craft, subtract(clearKm, fromParentKm));
}

function moveCameraAlongGlide(offset) {
  const { destination, departed, from, path } = glide;
  game.camera = add(destination.target, offset);
  if (!solarBodies || !withinSystem(system, game.camera)) return;
  const travelledKm = (path.distanceAt(0) - Math.hypot(...offset)) * KM_PER_PC;
  const holder = departed && bodyNamed(departed.holder);
  if (holder && travelledKm < GLIDE_DEPARTURE_RADII * holder.radiusKm && !glide.pastHalfway) {
    const heading = normalize(subtract(destination.target, from));
    frameAround(holder, clearOfDeparted(holder, add(departed.offsetKm, scale(heading, travelledKm)), travelledKm));
    return;
  }
  const craft = craftAt(destination);
  if (craft) {
    frameAroundCraft(craft, scale(offset, KM_PER_PC));
    return;
  }
  const body = destination.subject?.body;
  const targetBody = body && systemOf(body) === system && bodyNamed(body.name);
  if (targetBody) frameAround(targetBody, scale(offset, KM_PER_PC));
}

function advanceGlide(now) {
  glide.seconds += Math.min(LONGEST_GLIDE_STEP_SECONDS, Math.max(0, (now - glide.steppedAt) / 1000));
  glide.steppedAt = now;
  const progress = Math.min(1, glide.seconds / glide.path.seconds);
  const { destination, announcement, stars } = glide;
  if (progress >= GLIDE_SWING_FROM && !glide.pastHalfway) {
    glide.pastHalfway = true;
    if (stars) showStars(stars.arriving);
  }
  const offset = offsetFromTarget(progress);
  moveCameraAlongGlide(offset);
  faceWhileRolling(glide.pastHalfway && !destination.craft ? scale(offset, -1) : towardMiddle(destination), eased(progress));
  if (progress < 1) return;
  glide = null;
  settleAt(destination);
  if (stars) {
    showStars(stars.landed);
    eyeNearestStarPc = nearestStarPc(eyeStars);
  }
  showStatus(announcement);
  viewChanged();
}

function startWarp(lightYears, destination) {
  renderer.captureSkyCube({ camera: game.camera, nebulae, stars: eyeStars });
  warp = { axis: [...game.ship.forward], lightYears, destination, startedAt: performance.now(), arrived: false };
  clearGuides();
}

function destinationNamed(name) {
  const place = destinations().find((listed) => listed.name.toLowerCase() === name.trim().toLowerCase());
  return place?.now ? place.now() : place;
}

function selectNamed(name) {
  const destination = destinationNamed(name);
  if (!destination) {
    showStatus(`Nowhere called "${name}" on the list.`);
    return false;
  }
  selection = pickFor(destination);
  selectionShownAt = -Infinity;
  return true;
}

const shortDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const isAbsent = ({ craft }) => Boolean(craft) && !isOut(craft, simNow());

function absent({ craft, name }) {
  if (!isAbsent({ craft })) return false;
  const dates = flightDates(craft);
  if (!dates) showStatus('Spacecraft paths are still loading.');
  else if (simNow() < dates.from) showStatus(`${name} had not ${craft.stops ? 'landed' : 'left Earth'} yet: that was on ${shortDate(dates.from)}.`);
  else showStatus(`${craft.ended ? `${name} is gone: it flew` : `The game shows ${name} only`} from ${shortDate(dates.from)} to ${shortDate(dates.to)}.`);
  return true;
}

function warpToSelection() {
  if (!selection && !(selectInput.value.trim() && selectNamed(selectInput.value))) {
    showStatus('Select something first: click it, or type its name under Select.');
    return;
  }
  glideTo(selection.destination);
}

let destinationList = null;
let listedSpeculative = '';
let listedSystems = 0;
let listedWithSpeculation = false;
function destinations() {
  const speculative = speculativeBodiesNow();
  const speculativeNames = speculative.map(({ name }) => name).join();
  if (nearby.length && (!destinationList || speculativeNames !== listedSpeculative || otherSystems().length !== listedSystems || speculationShown() !== listedWithSpeculation)) {
    listedSpeculative = speculativeNames;
    listedWithSpeculation = speculationShown();
    destinationList = listDestinations({
      nearby,
      nebulae,
      galaxies,
      speculative,
      nearestHole: (wanted) => nearestBlackHole(game.camera, armMap, (star) => !withinSystem(star, game.camera) && wanted(star)),
      nearestCivilization: () => nearestCivilization(game.camera, (reachPc) => starsWithin(game.camera, reachPc, { armMap, nearby })),
    });
    listedSystems = otherSystems().length;
    selectList.replaceChildren(...destinationList.map((place) => new Option(place.group, place.name)));
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
    if (warp.destination) {
      arrive(warp.destination);
      warp.axis = [...game.ship.forward];
    } else land(warp.lightYears);
    refreshEyeStars(now);
    renderer.captureSkyCube({ camera: game.camera, nebulae, stars: eyeStars });
  }
  status.textContent = warpCaption(stage);
  status.hidden = false;
  clearTimeout(statusTimer);
  const row = rowForSpeed(warpOptics, stage.speed);
  return { axis: warp.axis, row, shutter: stage.shutter, glareLux: glareForRow(warpOptics, row) * (1 - stage.shutter) };
}

function jumpLanding(lightYears) {
  const miss = (SHIP.jumpScatter * lightYears) / LY_PER_PC;
  const scatter = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]).map((value) => value * miss * Math.cbrt(Math.random()));
  return add(add(game.camera, scale(game.ship.forward, lightYears / LY_PER_PC)), scatter);
}

function land(lightYears) {
  game.camera = jumpLanding(lightYears);
  if (game.mode.scored && !game.over) {
    game.energy -= lightYears;
    game.clock += lightYears / SHIP.warpLightYearsPerSecond;
  }
  game.jumps += 1;
  eyeStars = null;
}

function arrive(destination) {
  const craft = craftAt(destination);
  if (craft) {
    const standoff = standoffAt(destination);
    frameAroundCraft(craft, scale(standoff, KM_PER_PC));
    faceDirection(towardMiddle(destination), upAt(destination) ?? undefined);
  } else if (destination.beside) {
    const { body } = destination.subject;
    const standoff = destination.beside(game.camera);
    enterSystem(systemOf(body));
    frameAround(placedNow(body), scale(standoff, KM_PER_PC));
    faceDirection(scale(standoff, -1), destination.up);
  } else {
    game.camera = destination.arrival(game.camera);
    faceDirection(subtract(destination.target, game.camera), destination.up);
  }
  eyeStars = null;
  settleAt(destination);
}

function settleAt(destination) {
  if (destination.speed) game.speed = Math.max(game.mode.slowestSpeed, destination.speed);
  game.jumps += 1;
  if (game.mode.solarSystem) setFollowing(true);
  const craft = craftAt(destination);
  if (craft?.landed) setRotatingWith(craft.parent);
}

let thrusting = false;

function flightStep(seconds) {
  thrusting = false;
  if (rocket) idleEngines();
  if (menu || intro || photo?.running || warp || aim || glide) return;
  const stickTurns = rocketOutside() && rocket.turning;
  const thrustStick = stickTurns ? { across: 0, along: 0 } : stick.push;
  const turnStick = stickTurns ? stick.push : { across: 0, along: 0 };
  const move = [
    (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0) + thrustStick.across,
    (held.has('KeyR') ? 1 : 0) - (held.has('KeyF') ? 1 : 0),
    (held.has('KeyW') ? 1 : 0) - (held.has('KeyS') ? 1 : 0) + thrustStick.along,
  ];
  let moved = false;
  thrusting = move.some(Boolean);
  if (rocketAboard() && solarFrame) {
    aimRocket(move);
  } else if (thrusting) {
    const pcPerSecond = game.speed / LY_PER_PC;
    const step = add(add(scale(game.ship.right, move[0]), scale(game.ship.up, move[1])), scale(game.ship.forward, move[2]));
    const shift = scale(step, pcPerSecond * seconds);
    if (solarFrame) moveInSolarFrame(scale(shift, KM_PER_PC));
    else game.camera = add(game.camera, shift);
    moved = true;
  }
  const yaw = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0) + turnStick.across;
  const pitch = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0) + turnStick.along;
  const roll = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
  const lookRate = LOOK_RATE * Math.min(1, fieldHeight / EYE_FIELD_HEIGHT);
  if (yaw) game.ship = turn(game.ship, 'up', -yaw * lookRate * seconds);
  if (pitch) game.ship = turn(game.ship, 'right', pitch * lookRate * seconds);
  if (roll) game.ship = turn(game.ship, 'forward', roll * ROLL_RATE * seconds);
  if (yaw || pitch || roll) aimView();
  else if (moved) viewChanged();
  if (rocket?.plan && rocketAboard() && solarFrame) steerToBurn(seconds, thrusting, Boolean(yaw || pitch || roll));
  else if (rocket?.trail && rocketAboard() && !(yaw || pitch || roll)) turnToward(rocket.trail, seconds);
}

let system = SOLAR_SYSTEM;
let solarBodies = null;
let solarCraft = [];
let solarFrame = null;

const SUN_AS_PARENT = { name: 'Sun', kind: 'star', fromSunKm: [0, 0, 0] };
const groundMaps = [];

const bodyNamed = (name) => solarBodies.find((body) => body.name === name) ?? solarCraft.find((craft) => craft.name === name);
const bodyEast = (body) => [
  body.north[1] * body.meridian[2] - body.north[2] * body.meridian[1],
  body.north[2] * body.meridian[0] - body.north[0] * body.meridian[2],
  body.north[0] * body.meridian[1] - body.north[1] * body.meridian[0],
];
const toBodyLocal = (body, vector) => [dot(vector, body.meridian), dot(vector, bodyEast(body)), dot(vector, body.north)];
const fromBodyLocal = (body, [x, y, z]) => add(add(scale(body.meridian, x), scale(bodyEast(body), y)), scale(body.north, z));
const INVENT_GROUND_WITHIN_RADII = 8;
let inventedGround = null;

function groundFor(body) {
  if (body.invented) return inventedGround?.name === body.name ? inventedGround.settings : null;
  return body.ground && body.mapLayer >= 0 ? groundMaps[body.mapLayer] ?? null : null;
}

let drained = null;

function withRivers(body, { runny, ...settings }) {
  if (!runny) return settings;
  const key = `${body.name} ${body.invented.shapeVersion}`;
  if (drained?.key !== key) {
    const asked = { key, rivers: null };
    drained = asked;
    const { heights, land, lowKm, rangeKm, molten } = settings;
    drainageOf({ heights, land, runny, lowKm, rangeKm, molten }).then((rivers) => {
      asked.rivers = rivers;
    });
  }
  return drained.rivers && { ...settings, rivers: drained.rivers };
}

function inventGroundBelow() {
  const body = solarFrame && bodyNamed(solarFrame.holder);
  if (!body?.invented || body.flattening || (inventedGround?.name === body.name && inventedGround.version === body.invented.version)) return;
  if (!body.invented.terrain && Math.hypot(...solarFrame.offsetKm) > INVENT_GROUND_WITHIN_RADII * body.radiusKm) return;
  const painted = renderer.inventGround(body, toBodyLocal(body, body.sunward));
  const settings = painted && withRivers(body, painted);
  if (settings || inventedGround?.name !== body.name) inventedGround = settings && { name: body.name, version: settings.version, settings };
}

const spokenName = (body) => (body.name === 'Moon' ? 'the Moon' : body.name);
const frameOffsetKm = (body, frame) => (frame.coRotating ? fromBodyLocal(body, frame.localKm) : frame.offsetKm);

function enterSystem(entered) {
  system = entered;
  solarBodies = system.place(simNow());
  solarCraft = system === SOLAR_SYSTEM ? placeSpacecraft(simNow(), solarBodies) : [];
  loadCloudMapsOf(solarBodies, SIMULATED_CLOUD_SIZE, renderer.loadSimulatedClouds, () => showStatus('A cloud map failed to load; some planets show no clouds.'));
}

const holders = () => [...solarBodies, ...solarCraft.filter(({ landed }) => !landed)];

function enterSolarFrame() {
  if (!withinSystem(system, game.camera)) return null;
  const fromSunKm = scale(subtract(game.camera, system.position), KM_PER_PC);
  const holder = holdingBody(holders(), fromSunKm);
  return { holder: holder.name, offsetKm: subtract(fromSunKm, holder.fromSunKm), coRotating: false, localKm: null, camera: null, landed: false, landingArmed: true, body: holder };
}

const beyondMouth = (mouth) => otherEnd(mouth, systemNamed(mouth.leadsTo), simNow());

let farSide = null;

function starsBeyond(partner) {
  if (farSide?.host !== partner.host) farSide = { host: partner.host, stars: gatherEyeStars(partner.centre), anchor: partner.centre };
  return farSide;
}

const FRAME_AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function seenThroughMouth() {
  const mouth = solarFrame && bodyNamed(solarFrame.holder);
  if (mouth?.kind !== 'wormhole') return null;
  const partner = beyondMouth(mouth);
  const { stars, anchor } = starsBeyond(partner);
  const seen = systemOf(partner).place(simNow()).filter(({ kind }) => kind !== 'wormhole').map((body) => ({ body, offsetKm: subtract(body.fromSunKm, partner.fromSunKm) }));
  const star = seen.find(({ body }) => body.kind === 'star');
  const starDistanceKm = Math.hypot(...star.offsetKm);
  return {
    mouth,
    camera: partner.centre,
    anchorShift: subtract(partner.centre, anchor),
    stars,
    planets: seen.filter((place) => place !== star),
    sun: { direction: scale(star.offsetKm, 1 / starDistanceKm), angularRadius: Math.asin(star.body.radiusKm / starDistanceKm), light: star.body.tint },
    nearToFar: FRAME_AXES.flatMap(throughThroat(mouth, partner)),
    farToNear: FRAME_AXES.flatMap(throughThroat(partner, mouth)),
  };
}

let wentThrough = false;

function turnShip(turned) {
  game.ship = orthonormal(turned(game.ship.forward), turned(game.ship.up));
  game.basis = viewBasis(game.ship, game.head);
}

function comeOutBeside(partner, offsetKm) {
  const left = { host: system.name, stars: eyeStars, anchor: eyeAnchor };
  const beyond = starsBeyond(partner);
  enterSystem(systemOf(partner));
  frameAround(partner, offsetKm);
  showStars(beyond);
  eyeNearestStarPc = nearestStarPc(eyeStars);
  farSide = left;
  wentThrough = true;
  showStatus(`Went through to ${spokenHost(partner.host)}.`);
}

function moveBesideMouth(mouth, shiftKm) {
  const partner = beyondMouth(mouth);
  const reached = travel({ mouth, partner, offsetKm: solarFrame.offsetKm, shiftKm });
  turnShip(reached.turn);
  if (reached.mouth === mouth) solarFrame.offsetKm = reached.offsetKm;
  else comeOutBeside(partner, reached.offsetKm);
}

function moveInSolarFrame(shiftKm) {
  const holder = bodyNamed(solarFrame.holder);
  if (holder.kind === 'wormhole') {
    moveBesideMouth(holder, shiftKm);
    return;
  }
  if (solarFrame.coRotating) solarFrame.localKm = add(solarFrame.localKm, toBodyLocal(holder, shiftKm));
  else solarFrame.offsetKm = add(solarFrame.offsetKm, shiftKm);
}

const RIVERS_KEPT_WITHIN_METRES = 400;
let riversBelow = null;

function riversUnder(holder, ground, up) {
  const radiusMetres = holder.radiusKm * 1000;
  if (riversBelow?.ground !== ground || Math.hypot(...subtract(up, riversBelow.up)) * radiusMetres > RIVERS_KEPT_WITHIN_METRES) {
    riversBelow = { ground, up, near: riversNear(ground.rivers, radiusMetres, up, RIVERS_KEPT_WITHIN_METRES, COLLISION_FOOTPRINT_METRES) };
  }
  return riversBelow.near;
}

const CRAFT_SOLID_SHARE = 0.05;
const CLOSEST_HORIZON_RADII = 1.2;
const CLOSEST_NEUTRON_STAR_RADII = 2;

function stopNews(holder) {
  if (holder.hole) return 'The ship goes no closer to the event horizon.';
  if (holder.pulsar) return 'The ship goes no closer to the neutron star.';
  return `Touched down on ${spokenName(holder)}.`;
}

function lowestDistanceKm(holder, offsetKm) {
  if (holder.kind === 'craft') return CRAFT_SOLID_SHARE * holder.radiusKm;
  if (holder.kind === 'wormhole') return 0;
  if (holder.hole) return CLOSEST_HORIZON_RADII * holder.radiusKm;
  if (holder.pulsar) return CLOSEST_NEUTRON_STAR_RADII * holder.radiusKm;
  const ground = groundFor(holder);
  if (!ground) return radiusBelowKm(holder, offsetKm) + lowestAltitudeKm(holder);
  const frame = groundFrame(toBodyLocal(holder, offsetKm), holder.radiusKm);
  if (frame.altitudeKm > GROUND_CHECK_KM) return holder.radiusKm;
  const { height, waterLevel } = groundHeightMetres(ground, frame.up, frame.anchor, frame.surfaceOffset, COLLISION_FOOTPRINT_METRES, riversUnder(holder, ground, frame.up));
  return holder.radiusKm + (Math.max(height, waterLevel) + EYE_HEIGHT_METRES) / 1000;
}

const groundUnderKm = (body, offsetKm) => (groundFor(body) ? lowestDistanceKm(body, offsetKm) : body.radiusKm);

function followSolarSystem() {
  if (!game.mode.solarSystem) {
    solarBodies = null;
    solarFrame = null;
    return;
  }
  if (solarFrame && game.camera !== solarFrame.camera) solarFrame = null;
  if (rocket && rocket.view !== 'inside' && !rocketAboard()) backInsideRocket();
  const bodiesBefore = solarBodies;
  enterSystem((!solarFrame && systemNear(game.camera)) || system);
  solarFrame ??= enterSolarFrame();
  if (!solarFrame) return;
  const previous = bodyNamed(solarFrame.holder) ?? solarFrame.body;
  const carriedFrom = following ? previous.fromSunKm : solarFrame.body.fromSunKm;
  const framedFromSunKm = add(carriedFrom, frameOffsetKm(previous, solarFrame));
  const shipFromSunKm = rocketAboard() ? flyRocket(bodiesBefore, framedFromSunKm) : framedFromSunKm;
  if (rocketAboard()) rocket.outward = normalize(subtract(shipFromSunKm, bodyNamed(rocket.state.holder).fromSunKm));
  if (rocketAboard() && rocket.view === 'inside') showRocketView('chase');
  const fromSunKm = rocketOutside() ? rocketEyeFromSunKm(shipFromSunKm) : shipFromSunKm;
  const holder = holdingBody(holders(), fromSunKm);
  if (rotatingWith && rotatingWith !== holder.name) setRotatingWith(null);
  let offsetKm = subtract(fromSunKm, holder.fromSunKm);
  const lowest = lowestDistanceKm(holder, offsetKm);
  const distance = Math.hypot(...offsetKm);
  const landed = distance <= lowest;
  if (landed) offsetKm = scale(offsetKm, lowest / distance);
  const landingArmed = solarFrame.landingArmed || distance - lowest > LANDING_REARM_KM;
  const touchedDown = landed && landingArmed && thrusting && holder.kind !== 'craft' && !rocketAboard();
  if (touchedDown) {
    showStatus(stopNews(holder));
    if (holder.kind !== 'star') setRotatingWith(holder.name);
  }
  game.camera = add(system.position, scale(add(holder.fromSunKm, offsetKm), 1 / KM_PER_PC));
  const coRotating = rotatingWith === holder.name;
  if (coRotating && solarFrame.coRotating && solarFrame.holder === holder.name) turnWithSpin(solarFrame.body, holder);
  solarFrame = { holder: holder.name, offsetKm, coRotating, localKm: coRotating ? toBodyLocal(holder, offsetKm) : null, camera: game.camera, landed, landingArmed: landingArmed && !touchedDown, body: holder };
  if (rocket) rocket.camera = rocketAboard() ? game.camera : null;
  if (rocket) rocket.shipFromEyeKm = subtract(shipFromSunKm, add(holder.fromSunKm, offsetKm));
  if (rocket) rocket.shipFromSunKm = shipFromSunKm;
  if (rocketOutside()) game.basis = cameraBasis(rocket.away, rocketCameraPole());
  if (!withinSystem(system, game.camera)) solarFrame = null;
}

const GROUND_SPIN_SAMPLE_MS = 1000;
const LOW_START_SHARE_OF_RADIUS = 1.1;
const ROCKET_AU_FROM_KM = 1e7;
let rocket = null;

const rocketAboard = () => Boolean(rocket) && game.mode.solarSystem && !(menu || intro || photo?.running || warp || aim || glide);
const rocketOutside = () => rocketAboard() && rocket.view !== 'inside';

function setRocket(on) {
  if (rocket && rocket.view !== 'inside') backInsideRocket();
  editorPanel.hidden = true;
  rocket = on ? { state: null, ms: simNow(), stepSeconds: 0, camera: null, system: null, push: [0, 0, 0], firing: 0, jets: null, vehicle: null, model: null, bottomM: 0, lengthM: 0, pods: [0, 0], dropped: [], parachutes: [], hasLegs: false, chute: { state: 'packed', openedMs: 0 }, trail: null, launch: null, throttle: 1, seaLevels: 0, warnedDry: false, readout: '', engines: '', path: null, plan: null, pointing: false, burnLeftKmS: null, view: 'inside', away: [0, 0, 1], outward: [0, 0, 1], zoom: 1, turning: false, shipFromEyeKm: [0, 0, 0], shipFromSunKm: null } : null;
  showBurnPanel(false);
  rocketToggle.checked = on;
  rocketViewButton.setAttribute('aria-pressed', 'false');
  document.body.classList.toggle('fh-rocket', on);
  clearGuides();
  showStatus(on ? `Rocket on: gravity is real now. ${ROCKET_VIEW_NEWS[touchScreen.matches ? 'chaseByTouch' : 'chase']}` : 'Rocket off: thrusters fly at a set speed again.');
}

const SIDE_THRUSTERS_N = 6400;
const THROTTLE_RANGE = [0.1, 1];
const THROTTLE_STEP = 0.1;

function idleEngines() {
  rocket.push = [0, 0, 0];
  rocket.firing = 0;
  rocket.jets = null;
}

const kmS2From = (newtons) => newtons / massKg(rocket.vehicle) / 1000;

function fire(throttle, jets) {
  const engines = thrustOf(rocket.vehicle, rocket.seaLevels);
  rocket.firing = engines.thrustN ? throttle : 0;
  rocket.jets = jets;
  rocket.push = add(scale(game.ship.forward, kmS2From(engines.thrustN * rocket.firing)), jets ? scale(jets, kmS2From(SIDE_THRUSTERS_N)) : [0, 0, 0]);
  if (throttle && !rocket.firing && !rocket.warnedDry) showStatus(whyEnginesCannotFire(engines), 6);
  rocket.warnedDry = throttle > 0 && !rocket.firing;
}

function whyEnginesCannotFire({ engines }) {
  if (engines) return 'The air is too thick here for the engines to fire.';
  return stagesLeft(rocket.vehicle) ? 'No engine can fire: tanks empty or a part under the nozzle. Space drops a stage.' : 'Out of fuel.';
}

function aimRocket(move) {
  if (!rocket.vehicle) return;
  const main = Math.min(1, Math.max(0, move[2]));
  const sideways = add(add(scale(game.ship.right, move[0]), scale(game.ship.up, move[1])), scale(game.ship.forward, Math.min(0, move[2])));
  if (!main && !sideways.some(Boolean)) return;
  if (capRate(FASTEST_BURN_RATE)) {
    showStatus(`Time slowed to ${FASTEST_BURN_RATE}× while the engine fires.`);
    return;
  }
  fire(main * rocket.throttle, sideways.some(Boolean) ? normalize(sideways) : null);
}

function setThrottle(throttle) {
  rocket.throttle = Math.min(THROTTLE_RANGE[1], Math.max(THROTTLE_RANGE[0], throttle));
}

function stepThrottle(steps) {
  setThrottle(Math.round(rocket.throttle / THROTTLE_STEP + steps) * THROTTLE_STEP);
}

function rebuildRocket(design) {
  rocket.vehicle = assemble(design);
  rocket.chute = { state: 'packed', openedMs: 0 };
  rocket.trail = null;
  refreshRocketLook();
}

function refreshRocketLook() {
  const parts = attachedEntries(rocket.vehicle);
  rocket.bottomM = lowestOf(parts);
  rocket.model = modelOfParts(parts, rocket.bottomM);
  rocket.pods = podsOf(rocket.vehicle.entries[rocket.vehicle.root], rocket.bottomM);
  rocket.lengthM = shapeOf(rocket.vehicle).lengthM;
  rocket.parachutes = parts.filter(({ type }) => type === 'parachute');
  rocket.hasLegs = parts.some(({ type }) => type === 'legs');
}

const CANOPY_OPENING_SECONDS = 8;
const TRAIL_SLOWEST_KM_S = 0.002;
const SAFE_LANDING_KM_S = { legs: 0.008, parachute: 0.01, bare: 0.003 };
const canopies = () => rocket.parachutes.reduce((sum, { copies }) => sum + copies, 0);
const parachutePacked = () => rocket.chute.state === 'packed' && rocket.parachutes.length > 0;
const canopyShare = () => (rocket.chute.state === 'open' ? Math.min(1, Math.max(0, (rocket.ms - rocket.chute.openedMs) / 1000 / CANOPY_OPENING_SECONDS)) : 0);
const tearingKPa = () => PARTS.parachute.tearsAtPa / 1000;

function openParachute() {
  if (rocket.state.landedKm) {
    showStatus('The parachute needs to be falling through air to open.');
    return;
  }
  rocket.chute = { state: 'open', openedMs: rocket.ms };
  const air = rocketAir(bodyNamed(rocket.state.holder));
  showStatus(insideAir(air, rocket.state.positionKm) ? 'Parachute opening.' : 'Parachute out, but there is no air here for it to catch.');
}

function watchParachute(body) {
  if (rocket.chute.state !== 'open') return;
  if (rocket.state.landedKm) {
    rocket.chute.state = 'spent';
    rocket.trail = null;
    return;
  }
  const air = rocketAir(body);
  const throughAirKmS = airVelocityKmS(air, rocket.state);
  const speedKmS = Math.hypot(...throughAirKmS);
  rocket.trail = speedKmS > TRAIL_SLOWEST_KM_S && insideAir(air, rocket.state.positionKm) ? scale(throughAirKmS, -1 / speedKmS) : null;
  const pushPa = dynamicPressurePa(air, rocket.state);
  if (pushPa <= PARTS.parachute.tearsAtPa) return;
  rocket.chute.state = 'torn';
  rocket.trail = null;
  showStatus(`Parachute torn away: the air pushed on it at ${Math.round(pushPa / 1000)} kPa. It holds ${tearingKPa()} kPa, about 130 m/s at sea level.`, 8);
}

function safeLanding() {
  if (rocket.hasLegs) return { kmS: SAFE_LANDING_KM_S.legs, what: 'landing legs' };
  if (canopyShare() >= 1) return { kmS: SAFE_LANDING_KM_S.parachute, what: 'a capsule under its parachute' };
  return { kmS: SAFE_LANDING_KM_S.bare, what: 'a rocket without legs' };
}

function dropStage() {
  if (!rocketAboard() || !rocket.vehicle) return;
  const before = massKg(rocket.vehicle);
  const bottomM = rocket.bottomM;
  const dropped = separate(rocket.vehicle);
  if (!dropped.length) {
    if (parachutePacked()) openParachute();
    else showStatus('Nothing left to drop or open.');
    return;
  }
  rocket.warnedDry = false;
  refreshRocketLook();
  rocket.dropped = [...rocket.dropped, dropAway(dropped, { state: rocket.state, basis: game.ship, model: modelOfParts(dropped, bottomM) })].slice(-MOST_DROPPED);
  if (rocket.state.positionKm) rocket.state = { ...rocket.state, positionKm: add(rocket.state.positionKm, scale(game.ship.forward, (rocket.bottomM - bottomM) / 1000)) };
  const left = stagesLeft(rocket.vehicle);
  showStatus(`Stage dropped: ${Math.round((before - massKg(rocket.vehicle)) / 1000)} t gone, ${left ? `${left} more to drop` : 'last stage now'}.`);
}

const rocketCraft = () => ({ noseward: game.ship.forward, ...shapeOf(rocket.vehicle), canopyDragAreaM2: canopyShare() * canopies() * PARTS.parachute.canopyDragAreaM2 });

function describeEngines() {
  const throttle = `${Math.round(rocket.throttle * 100)}%`;
  return unlimitedFuelToggle.checked ? `${throttle}, fuel unlimited` : `${throttle}, Δv ${formatRocketSpeed(deltaVLeftMS(rocket.vehicle) / 1000)}`;
}

function groundVelocityKmS(body, offsetKm, ms) {
  const [then, later] = [ms, ms + GROUND_SPIN_SAMPLE_MS].map((when) => system.place(when).find(({ name }) => name === body.name));
  return scale(subtract(fromBodyLocal(later, toBodyLocal(then, offsetKm)), offsetKm), 1000 / GROUND_SPIN_SAMPLE_MS);
}

const spinRates = new WeakMap();

function spinRadiansPerSecond(body) {
  if (!spinRates.has(system)) spinRates.set(system, new Map());
  const known = spinRates.get(system);
  if (!known.has(body.name)) {
    const east = cross(body.north, body.meridian);
    known.set(body.name, dot(groundVelocityKmS(body, scale(body.meridian, body.radiusKm), simNow()), east) / body.radiusKm);
  }
  return known.get(body.name);
}

const rocketAir = (body) => airAround(body, spinRadiansPerSecond);

function rocketStart(well, offsetKm, ms, wells) {
  const distance = Math.hypot(...offsetKm);
  const ground = lowestDistanceKm(well.body, offsetKm);
  if (distance <= ground) return { holder: well.body.name, landedKm: toBodyLocal(well.body, scale(offsetKm, ground / distance)) };
  if (distance > LOW_START_SHARE_OF_RADIUS * well.body.radiusKm) return circularOrbit(well, offsetKm, orbitalPlanePole(wells, well.body.name, system.place, ms));
  return { holder: well.body.name, positionKm: offsetKm, velocityKmS: groundVelocityKmS(well.body, offsetKm, ms) };
}

const LAUNCH_PAD = { world: 'Earth', name: 'Launch Complex 39A at Kennedy Space Center, Florida', latitude: 28.6083 * DEGREES, longitude: -80.6041 * DEGREES };

function padStart(wells, startWell, ms) {
  const earth = wells.get(LAUNCH_PAD.world);
  if (!earth || ![earth, wells.get(earth.parent)].includes(startWell)) return null;
  const { latitude, longitude } = LAUNCH_PAD;
  const up = fromBodyLocal(earth.body, [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)]);
  faceDirection(up, earth.body.north);
  setRotatingWith(LAUNCH_PAD.world);
  showStatus(`Rocket on, standing on ${LAUNCH_PAD.name}: gravity is real now. ${ROCKET_VIEW_NEWS[touchScreen.matches ? 'chaseByTouch' : 'chase']}`);
  return rocketStart(earth, up, ms, wells);
}

function liftOff(well, ms, seconds) {
  const offsetKm = fromBodyLocal(well.body, rocket.state.landedKm);
  const up = normalize(offsetKm);
  if (seconds <= 0 || dot(rocket.push, up) <= pullKmS2(well, Math.hypot(...offsetKm))) return;
  rocket.state = { holder: well.body.name, positionKm: offsetKm, velocityKmS: add(groundVelocityKmS(well.body, offsetKm, ms), scale(rocket.push, seconds)) };
  setRotatingWith(null);
}

function touchDown(well, ms) {
  const { positionKm, velocityKmS } = rocket.state;
  const offsetKm = scale(positionKm, lowestDistanceKm(well.body, positionKm) / Math.hypot(...positionKm));
  const hitKmS = Math.hypot(...subtract(velocityKmS, groundVelocityKmS(well.body, offsetKm, ms)));
  rocket.state = { holder: well.body.name, landedKm: toBodyLocal(well.body, offsetKm) };
  const name = spokenName(well.body);
  const safe = safeLanding();
  showStatus(hitKmS <= safe.kmS ? `Touched down on ${name} at ${Math.round(hitKmS * 1000)} m/s.` : `Hit ${name} at ${formatRocketSpeed(hitKmS)}. A real ship would not survive that: ${safe.what} can take about ${Math.round(safe.kmS * 1000)} m/s.`, 6);
  if (well.body.kind !== 'star') setRotatingWith(well.body.name);
}

function flyRocket(bodiesBefore, framedFromSunKm) {
  const ms = simNow();
  const { star, wells } = gravityWells(solarBodies);
  const fresh = !rocket.state || rocket.camera !== game.camera || rocket.system !== system || !wells.has(rocket.state.holder);
  if (fresh) {
    if (rocket.plan) endPlan();
    const firstStart = !rocket.state;
    rebuildRocket(rocketDesign);
    rocket.dropped = [];
    const well = wellAround(wells, star, framedFromSunKm);
    rocket.state = (firstStart && padStart(wells, well, ms)) || rocketStart(well, subtract(framedFromSunKm, well.body.fromSunKm), ms, wells);
    if (rocket.view === 'orbit') rocket.away = awayAboveOrbit() ?? rocket.away;
    rocket.launch = { state: rocket.state, ship: game.ship };
  } else if (rocket.state.landedKm) {
    liftOff(wells.get(rocket.state.holder), ms, (ms - rocket.ms) / 1000);
  } else {
    const flight = flown(rocket.state, { wells, before: bodiesBefore ?? solarBodies, now: solarBodies, fromMs: rocket.ms, toMs: ms, pushKmS2: rocket.push, placeAt: system.place, groundKm: lowestDistanceKm, drag: { airOf: rocketAir, craft: rocketCraft() } });
    rocket.state = flight.state;
    if (flight.landed) touchDown(wells.get(flight.state.holder), flight.ms);
  }
  if (!fresh) stepDroppedStages(wells, bodiesBefore, ms);
  if (!fresh) watchParachute(wells.get(rocket.state.holder).body);
  rocket.stepSeconds = fresh ? 0 : (ms - rocket.ms) / 1000;
  if (rocket.firing && rocket.stepSeconds > 0 && !unlimitedFuelToggle.checked) burn(rocket.vehicle, rocket.stepSeconds, rocket.firing);
  rocket.ms = ms;
  rocket.system = system;
  const well = wells.get(rocket.state.holder);
  const offsetKm = rocket.state.landedKm ? fromBodyLocal(well.body, rocket.state.landedKm) : rocket.state.positionKm;
  rocket.path = rocket.state.landedKm ? null : rocketForecast(wells, ms);
  if (rocket.plan) followPlan(wells, ms);
  rocket.readout = rocketReadout(well, offsetKm);
  rocket.seaLevels = seaLevelsOfPressure(rocketAir(well.body), offsetKm);
  rocket.engines = describeEngines();
  return add(well.body.fromSunKm, offsetKm);
}

function relaunch() {
  if (!rocketAboard() || !rocket.launch) return;
  if (rocket.plan) endPlan();
  idleEngines();
  rebuildRocket(rocketDesign);
  rocket.dropped = [];
  rocket.warnedDry = false;
  rocket.state = rocket.launch.state;
  game.ship = rocket.launch.ship;
  const { holder, landedKm } = rocket.state;
  if (landedKm) {
    faceDirection(fromBodyLocal(bodyNamed(holder), landedKm), bodyNamed(holder).north);
    setRotatingWith(holder);
  }
  showStatus('Relaunched: the whole rocket again, tanks full, back where it started.');
}

function offsetOf(state) {
  return state.landedKm ? fromBodyLocal(bodyNamed(state.holder), state.landedKm) : state.positionKm;
}

function stepDroppedStages(wells, bodiesBefore, ms) {
  const settle = (state) => {
    const { body } = wells.get(state.holder);
    return { holder: state.holder, landedKm: toBodyLocal(body, scale(state.positionKm, lowestDistanceKm(body, state.positionKm) / Math.hypot(...state.positionKm))) };
  };
  const flight = { wells, before: bodiesBefore ?? solarBodies, now: solarBodies, fromMs: rocket.ms, toMs: ms, placeAt: system.place, groundKm: lowestDistanceKm, airOf: rocketAir, settle };
  const rocketKm = offsetOf(rocket.state);
  rocket.dropped = rocket.dropped
    .map((stage) => stepDropped(stage, flight))
    .filter(({ state }) => state.holder === rocket.state.holder && Math.hypot(...subtract(offsetOf(state), rocketKm)) < FARTHEST_DROPPED_KM);
}

const systemEdgeKm = () => SYSTEM_REACH_PC * KM_PER_PC;
const OUTSIDE_VIEW_PATH_SHARE = 3;
const OUTSIDE_VIEW_NEAREST_RADII = 1;
const OUTSIDE_VIEW_SYSTEM_SHARE = 0.3;
const OUTSIDE_VIEW_TILT_RADIANS = (20 * Math.PI) / 180;
const ROCKET_NAME = 'Your rocket';
const DROPPED_NAME = 'Dropped stage';

function rocketInView() {
  if (!rocketOutside() || !rocket.shipFromSunKm) return [];
  const here = rocket.shipFromSunKm;
  const eyeFromSunKm = subtract(here, rocket.shipFromEyeKm);
  const star = solarBodies.find(({ kind }) => kind === 'star');
  const craftBody = (name, model, fromSunKm, state, basis) => ({
    name,
    kind: 'craft',
    model,
    radiusKm: modelNamed(model).radiusMetres / 1000,
    parent: state.holder,
    landed: Boolean(state.landedKm),
    fromSunKm,
    north: basis.forward,
    meridian: basis.up,
    sunward: normalize(subtract(star.fromSunKm, fromSunKm)),
    sunlitShare: sunShareVisible(solarBodies.map((other) => ({ body: other, offsetKm: subtract(other.fromSunKm, fromSunKm) })), name),
  });
  const body = craftBody(ROCKET_NAME, rocket.model, here, rocket.state, game.ship);
  body.exhaust = rocketExhaust(body);
  const dropped = rocket.dropped.map((stage, k) => {
    const fromSunKm = add(bodyNamed(stage.state.holder).fromSunKm, offsetOf(stage.state));
    return { body: craftBody(`${DROPPED_NAME} ${k + 1}`, stage.model, fromSunKm, stage.state, stage.basis), offsetKm: subtract(fromSunKm, eyeFromSunKm) };
  });
  return [{ body, offsetKm: rocket.shipFromEyeKm }, ...canopyInView(here, craftBody), ...dropped];
}

const CANOPY_NAME = 'Parachute';

function canopyInView(here, craftBody) {
  if (rocket.chute.state !== 'open' || rocket.state.landedKm) return [];
  const trail = rocket.trail ?? game.ship.forward;
  const basis = orthonormal(trail, Math.abs(dot(trail, game.ship.up)) < 0.95 ? game.ship.up : game.ship.right);
  const attachKm = scale(game.ship.forward, canopyTopZ(rocket.parachutes, rocket.bottomM) / 1000);
  const model = canopyModel(canopies(), Math.max(1, Math.ceil(canopyShare() * CANOPY_STEPS)));
  return [{ body: craftBody(CANOPY_NAME, model, add(here, attachKm), rocket.state, basis), offsetKm: add(rocket.shipFromEyeKm, attachKm) }];
}

const EXHAUST_GROUND_CHECK_METRES = 60;

function rocketExhaust(body) {
  if (!rocket.firing && !rocket.jets) return null;
  const axes = [body.meridian, cross(body.north, body.meridian), body.north];
  const inModel = (vector) => axes.map((axis) => dot(axis, vector));
  const holder = bodyNamed(rocket.state.holder);
  const offsetKm = offsetOf(rocket.state);
  const distanceKm = Math.hypot(...offsetKm);
  const nearGround = holder.kind !== 'craft' && distanceKm - holder.radiusKm < EXHAUST_GROUND_CHECK_METRES / 1000 + GROUND_CHECK_KM;
  const groundMetres = nearGround ? (distanceKm - lowestDistanceKm(holder, offsetKm)) * 1000 + EYE_HEIGHT_METRES : Infinity;
  const touching = groundMetres < EXHAUST_GROUND_CHECK_METRES;
  return exhaustOf({
    pushInModel: inModel(add(scale(game.ship.forward, rocket.firing), rocket.jets ?? [0, 0, 0])),
    groundUpInModel: touching ? inModel(normalize(offsetKm)) : null,
    groundMetres,
    nozzles: rocket.firing ? nozzlesOf(firingEngines(rocket.vehicle), rocket.bottomM) : [],
    pods: rocket.pods,
  });
}

function pathFramingKm() {
  const { state, path } = rocket;
  const nearestKm = OUTSIDE_VIEW_NEAREST_RADII * bodyNamed(state.holder).radiusKm;
  const farthestKm = path ? Math.max(...path.segments[0].pointsKm.map((pointKm) => Math.hypot(...subtract(pointKm, state.positionKm)))) : 0;
  return Math.min(Math.max(OUTSIDE_VIEW_PATH_SHARE * farthestKm, nearestKm), OUTSIDE_VIEW_SYSTEM_SHARE * systemEdgeKm());
}

const CHASE_VIEW_KM = 0.045;
const CHASE_VIEW_LENGTHS = 2.2;
const CHASE_VIEW_RISE_RADIANS = (25 * Math.PI) / 180;
const LEVEL_ENOUGH = 0.3;
const chaseViewKm = () => Math.max(CHASE_VIEW_KM, (CHASE_VIEW_LENGTHS * rocket.lengthM) / 1000);
const rocketMiddleKm = () => (rocket.lengthM / 2 - FEET_BELOW_ORIGIN_M) / 1000;
const CAMERA_ZOOM_RANGE = [0.2, 500];
const NEXT_ROCKET_VIEW = { chase: 'orbit', orbit: 'chase' };
const ROCKET_VIEW_NEWS = {
  chase: 'Chase view: drag to swing the camera, the arrows and Q/E turn the rocket, the wheel zooms. W fires the engines, the other flight keys small side thrusters; Z and X set the throttle, Space drops a stage or opens the parachute, G builds a new rocket, N relaunches it whole.',
  chaseByTouch: 'Chase view: drag to swing the camera, pinch to zoom. Tap Turn to steer the rocket with the stick.',
  orbit: 'Orbit view: the whole path, from above the orbit. Zoom stays fixed as the path changes; the wheel or a pinch changes it.',
};

function awayAboveOrbit() {
  const { positionKm, velocityKmS } = rocket.state;
  if (!velocityKmS) return null;
  const momentum = cross(positionKm, velocityKmS);
  if (!Math.hypot(...momentum)) return null;
  return add(scale(normalize(momentum), Math.cos(OUTSIDE_VIEW_TILT_RADIANS)), scale(normalize(positionKm), Math.sin(OUTSIDE_VIEW_TILT_RADIANS)));
}

function awayBehindRocket() {
  const level = (direction) => subtract(direction, scale(rocket.outward, dot(direction, rocket.outward)));
  const behind = level(scale(game.ship.forward, -1));
  const across = Math.hypot(...behind) > LEVEL_ENOUGH ? behind : level(scale(game.ship.up, -1));
  return add(scale(normalize(across), Math.cos(CHASE_VIEW_RISE_RADIANS)), scale(rocket.outward, Math.sin(CHASE_VIEW_RISE_RADIANS)));
}

function rocketEyeFromSunKm(shipFromSunKm) {
  const chasing = rocket.view === 'chase';
  const aimedAt = chasing ? add(shipFromSunKm, scale(game.ship.forward, rocketMiddleKm())) : shipFromSunKm;
  const distanceKm = Math.min((chasing ? chaseViewKm() : rocket.orbitViewKm) * rocket.zoom, OUTSIDE_VIEW_SYSTEM_SHARE * systemEdgeKm());
  return add(aimedAt, scale(rocket.away, distanceKm));
}

function rocketCameraPole() {
  const { state } = rocket;
  if (!state || state.landedKm) return rocket.outward;
  const holder = bodyNamed(state.holder);
  return cameraPole(rocket.outward, state, Math.hypot(...state.positionKm) - holder.radiusKm, holder.north ?? [0, 0, 1]);
}

function zoomRocketCamera(factor) {
  rocket.zoom = Math.min(CAMERA_ZOOM_RANGE[1], Math.max(CAMERA_ZOOM_RANGE[0], rocket.zoom * factor));
}

function swingRocketCamera(across, down) {
  rocket.away = swungAround(rocket.away, rocketCameraPole(), across, down);
  aimView();
}

function backInsideRocket() {
  if (solarFrame) {
    const body = bodyNamed(solarFrame.holder) ?? solarFrame.body;
    const offsetKm = add(frameOffsetKm(body, solarFrame), rocket.shipFromEyeKm);
    solarFrame = { ...solarFrame, offsetKm, localKm: solarFrame.coRotating ? toBodyLocal(body, offsetKm) : null };
  }
  rocket.view = 'inside';
  setRocketTurning(false);
  rocketViewButton.setAttribute('aria-pressed', 'false');
  aimView();
  clearGuides();
}

function setRocketTurning(on) {
  rocket.turning = on;
  rocketTurnButton.setAttribute('aria-pressed', String(on));
}

function showRocketView(view) {
  rocket.away = view === 'chase' ? awayBehindRocket() : awayAboveOrbit() ?? rocket.away;
  rocket.zoom = 1;
  rocket.orbitViewKm = pathFramingKm();
  rocket.view = view;
  rocketViewButton.setAttribute('aria-pressed', String(view === 'orbit'));
  aimView();
  clearGuides();
}

function nextRocketView() {
  if (!rocketAboard()) return;
  const view = NEXT_ROCKET_VIEW[rocket.view] ?? 'chase';
  showRocketView(view);
  showStatus(ROCKET_VIEW_NEWS[view === 'chase' && touchScreen.matches ? 'chaseByTouch' : view], 6);
}

const FORECAST_EVERY_MS = { burning: 200, coasting: 2000 };
const MOTIONS_LAST_SIM_MS = 86400000;

function rocketTarget(wells) {
  const subject = selection?.destination?.subject;
  const name = subject?.kind === 'body' ? subject.body.name : null;
  return name && wells.get(name)?.parent ? name : null;
}

const latestBurnMs = (segments) => (['orbit', 'horizon'].includes(segments.at(-1).end) ? Infinity : segments.at(-1).toMs - 1000);
const withPaths = (segments) => segments.map((segment) => (segment.pointsKm ? segment : { ...segment, ...segmentPath(segment, segment.groundKm) }));
const MOST_PATH_LEGS = 6;

function airTopKm(body) {
  const air = rocketAir(body);
  return air ? air.radiusKm + air.topKm : 0;
}

function forecastFromAir(state, fromMs, met, options) {
  const legs = [];
  let current = state;
  let ms = fromMs;
  let currentMet = met;
  while (legs.length < MOST_PATH_LEGS) {
    const holder = options.wells.get(current.holder);
    const groundKm = Math.min(lowestDistanceKm(holder.body, current.positionKm), Math.hypot(...current.positionKm));
    const fall = fallThroughAir(current, { air: rocketAir(holder.body), gm: holder.gm, craft: rocketCraft(), groundKm });
    const toMs = ms + fall.seconds * 1000;
    legs.push({ holder: current.holder, fromMs: ms, toMs, start: current, finish: fall.state, end: fall.end, next: null, met: currentMet, gm: holder.gm, groundKm, wholeTurn: false, pointsKm: fall.pointsKm, marks: [] });
    if (fall.end !== 'out of air') break;
    const onward = forecastPath(fall.state, { ...options, fromMs: toMs });
    legs.push(...onward);
    const last = onward.at(-1);
    if (last.end !== 'air') break;
    current = { holder: last.holder, positionKm: last.finish.positionKm, velocityKmS: last.finish.velocityKmS };
    ms = last.toMs;
    currentMet = last.met;
  }
  return legs;
}

function throughAir(segments, options) {
  const last = segments.at(-1);
  if (last?.end !== 'air') return segments;
  return [...segments, ...forecastFromAir({ holder: last.holder, positionKm: last.finish.positionKm, velocityKmS: last.finish.velocityKmS }, last.toMs, last.met, options)];
}

function rocketForecast(wells, ms) {
  const now = performance.now();
  const kept = rocket.path;
  const { plan } = rocket;
  const target = rocketTarget(wells);
  const inAir = insideAir(rocketAir(wells.get(rocket.state.holder).body), rocket.state.positionKm);
  const everyMs = rocket.push.some(Boolean) || inAir ? FORECAST_EVERY_MS.burning : FORECAST_EVERY_MS.coasting;
  const same = kept && kept.holder === rocket.state.holder && kept.system === system && kept.planVersion === plan?.version && kept.target === target;
  if (same && ms >= kept.fromMs && ms < kept.staleMs && now - kept.madeAt < everyMs) return kept;
  if (rocket.motions?.system !== system || Math.abs(ms - rocket.motions.ms) > MOTIONS_LAST_SIM_MS) rocket.motions = { system, ms, motions: createMotions(wells, relativeMotions(system.place, ms, wells), ms) };
  const { motions } = rocket.motions;
  const options = { wells, motions, groundKm: (body) => body.radiusKm, airKm: airTopKm, edgeKm: systemEdgeKm() };
  const ahead = !inAir && Boolean(plan) && plan.ms > ms;
  const forecast = forecastPath(rocket.state, { ...options, fromMs: ms, atLeastMs: ahead ? plan.ms : ms });
  let segments = forecast;
  let planned = [];
  let burn = null;
  if (ahead) {
    plan.ms = Math.min(plan.ms, latestBurnMs(forecast));
    const node = stateOnPath(forecast, plan.ms);
    if (!plan.started) {
      plan.holder = node.holder;
      plan.kickKmS = burnKmS(node.state, plan.dvKmS);
      plan.targetKmS = add(node.state.velocityKmS, plan.kickKmS);
    }
    const afterKmS = plan.holder === node.holder ? plan.targetKmS : add(node.state.velocityKmS, plan.kickKmS);
    segments = cutAtBurn(forecast, node, plan.ms);
    planned = forecastPath({ holder: node.holder, positionKm: node.state.positionKm, velocityKmS: afterKmS }, { ...options, fromMs: plan.ms });
    burn = { index: node.index, pointKm: node.state.positionKm };
  }
  const approach = target && !inAir ? closestApproach([...segments, ...planned], target, motions) : null;
  const shown = inAir ? forecastFromAir(rocket.state, ms, null, options) : throughAir(segments, options);
  return { madeAt: now, holder: rocket.state.holder, system, fromMs: ms, staleMs: shown[0].toMs, planVersion: plan?.version, target, segments: withPaths(shown), planned: withPaths(throughAir(planned, options)), burn, approach };
}

const BURN_AXES = ['prograde', 'normal', 'radial'];
const BURN_DV_STEP_KMS = 0.001;
const BURN_DV_STEP_MOST_KMS = 0.2;
const BURN_TIME_STEP_SHARE = 1 / 720;
const BURN_TIME_STEP_MOST_SHARE = 1 / 12;
const NUDGE_GROWTH = 1.12;
const NUDGE_REPEAT_MS = { first: 350, then: 60 };
const FIRST_BURN_SECONDS = 600;
const BURN_WINDOW_PAD_SECONDS = 60;
const BURN_DONE_KMS = 0.0005;
const BURN_CLOSE_ENOUGH_KMS = 0.001;
const BURN_TURN_RADIANS_PER_S = 0.6;
const AUTOPILOT_ALIGNED_RADIANS = (2 * Math.PI) / 180;
const AUTOPILOT_LEAD_REAL_SECONDS = 4;
const BURN_RGB = '120, 200, 255';
const BURN_MARKER_PX = 9;
const BURN_KEYS = new Map([
  ['BracketLeft', ['time', -1]],
  ['BracketRight', ['time', 1]],
  ['Digit1', ['prograde', -1]],
  ['Digit2', ['prograde', 1]],
  ['Digit3', ['normal', -1]],
  ['Digit4', ['normal', 1]],
  ['Digit5', ['radial', -1]],
  ['Digit6', ['radial', 1]],
]);
let burnKeyStreak = 0;

function burnSeconds(plan) {
  const { thrustN, flowKgS } = thrustOf(rocket.vehicle, rocket.seaLevels);
  if (!flowKgS) return 0;
  const exhaustKmS = thrustN / flowKgS / 1000;
  return (massKg(rocket.vehicle) * -Math.expm1(-Math.hypot(...plan.kickKmS) / exhaustKmS)) / flowKgS;
}

const burnWindowSeconds = (plan) => burnSeconds(plan) + BURN_WINDOW_PAD_SECONDS;

function planBurn() {
  const first = rocket.path?.segments[0];
  if (!first) {
    showStatus('Take off first: a burn needs a path to sit on.');
    return false;
  }
  const lowest = secondsToApsis(rocket.state, first.gm, 'lowest');
  const quarter = rangeOf(rocket.state, first.gm).periodSeconds / 4;
  const pathSeconds = first.end === 'orbit' ? Infinity : (first.toMs - rocket.ms) / 2000;
  const seconds = Math.min(lowest ?? (Number.isFinite(quarter) ? quarter : FIRST_BURN_SECONDS), pathSeconds);
  rocket.plan = { ms: rocket.ms + Math.max(1, seconds) * 1000, dvKmS: [0, 0, 0], version: 0, holder: first.holder, kickKmS: [0, 0, 0], targetKmS: null, started: false, autopilot: false };
  return true;
}

function replanBurn() {
  rocket.plan.version += 1;
  rocket.plan.started = false;
}

function nudgeBurn(what, sign, streak) {
  const plan = rocket?.plan;
  if (!plan || !rocketAboard()) return;
  const growth = NUDGE_GROWTH ** streak;
  if (what === 'time') {
    const leg = rocket.path?.segments.at(-1);
    const periodSeconds = leg ? rangeOf(leg.start, leg.gm).periodSeconds : Infinity;
    const spanSeconds = Number.isFinite(periodSeconds) ? periodSeconds : Math.max(leg ? (leg.toMs - leg.fromMs) / 1000 : 0, FIRST_BURN_SECONDS);
    const stepSeconds = Math.min(spanSeconds * BURN_TIME_STEP_MOST_SHARE, Math.max(1, spanSeconds * BURN_TIME_STEP_SHARE * growth));
    plan.ms = Math.max(rocket.ms + 1000, plan.ms + sign * stepSeconds * 1000);
  } else {
    const axis = BURN_AXES.indexOf(what);
    const stepKmS = Math.min(BURN_DV_STEP_MOST_KMS, BURN_DV_STEP_KMS * growth);
    plan.dvKmS = plan.dvKmS.map((value, k) => (k === axis ? Math.round((value + sign * stepKmS) / BURN_DV_STEP_KMS) * BURN_DV_STEP_KMS : value));
  }
  replanBurn();
}

function burnAtApsis(kind) {
  const { plan, path } = rocket;
  const leg = path?.burn ? path.segments.at(-1) : null;
  const seconds = leg ? secondsToApsis(leg.finish, leg.gm, kind) : null;
  if (!(seconds >= 1)) {
    showStatus(kind === 'lowest' ? 'No lowest point ahead on this part of the path.' : 'No highest point: this part of the path never comes back.');
    return;
  }
  plan.ms += seconds * 1000;
  replanBurn();
}

function followPlan(wells, ms) {
  const { plan, state } = rocket;
  if (state.landedKm) {
    endPlan();
    return;
  }
  if (!plan.targetKmS) return;
  const left = plan.started && state.holder === plan.holder ? subtract(plan.targetKmS, coast(state, wells.get(plan.holder).gm, (plan.ms - ms) / 1000).velocityKmS) : plan.kickKmS;
  const leftKmS = Math.hypot(...left);
  rocket.burnLeftKmS = left;
  if (plan.started && (leftKmS < BURN_DONE_KMS || dot(left, plan.kickKmS) <= 0)) endPlan(leftKmS < BURN_CLOSE_ENOUGH_KMS ? 'Burn done.' : `Burn done, ${formatRocketSpeed(leftKmS)} off the plan.`);
  else if (!plan.started && (ms - plan.ms) / 1000 > burnWindowSeconds(plan)) endPlan('Missed the planned burn.');
}

function endPlan(news) {
  rocket.plan = null;
  rocket.burnLeftKmS = null;
  setBurnPointing(false);
  showBurnPanel(false);
  if (news) showStatus(news, 6);
}

function setBurnPointing(on) {
  if (rocket) rocket.pointing = on;
  burnPointButton.setAttribute('aria-pressed', String(on));
}

function setAutopilot(on, news) {
  rocket.plan.autopilot = on;
  burnAutopilotButton.setAttribute('aria-pressed', String(on));
  showStatus(news, 6);
}

function turnToward(direction, seconds) {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(game.ship.forward, direction))));
  if (!angle) return 0;
  const across = cross(game.ship.forward, direction);
  const axis = Math.hypot(...across) > Number.EPSILON ? normalize(across) : game.ship.up;
  const turned = Math.min(angle, BURN_TURN_RADIANS_PER_S * seconds);
  const basis = rotateBasis(game.ship, axis, turned);
  game.ship = orthonormal(basis.forward, basis.up);
  aimView();
  return angle - turned;
}

function steerToBurn(seconds, thrusted, turned) {
  const { plan } = rocket;
  if ((thrusted || turned) && plan.autopilot) setAutopilot(false, 'Autopilot off: you have the controls.');
  if (turned && rocket.pointing) setBurnPointing(false);
  const left = rocket.burnLeftKmS;
  const leftKmS = left ? Math.hypot(...left) : 0;
  if (leftKmS && (plan.autopilot || rocket.pointing)) {
    const angleLeft = turnToward(scale(left, 1 / leftKmS), seconds);
    if (plan.autopilot) flyBurn(leftKmS, angleLeft);
  }
  if (!plan.started && rocket.push.some(Boolean) && Math.hypot(...plan.kickKmS) && Math.abs(rocket.ms - plan.ms) / 1000 < burnWindowSeconds(plan)) plan.started = true;
}

function flyBurn(leftKmS, angleLeft) {
  const { plan } = rocket;
  const startSeconds = (plan.ms - rocket.ms) / 1000 - burnSeconds(plan) / 2;
  if (startSeconds > 0) {
    if (capRateWithin(startSeconds, AUTOPILOT_LEAD_REAL_SECONDS, FASTEST_BURN_RATE)) showStatus('Autopilot slowed time for the burn.');
    return;
  }
  if (angleLeft > AUTOPILOT_ALIGNED_RADIANS) return;
  if (capRate(FASTEST_BURN_RATE)) {
    showStatus(`Time slowed to ${FASTEST_BURN_RATE}× while the engine fires.`);
    return;
  }
  const fullStepKmS = kmS2From(thrustOf(rocket.vehicle, rocket.seaLevels).thrustN) * Math.max(rocket.stepSeconds, Number.EPSILON);
  fire(fullStepKmS ? Math.min(1, leftKmS / fullStepKmS) : 1, null);
}

function showBurnPanel(open) {
  burnPanel.hidden = !open;
  burnButton.setAttribute('aria-pressed', String(open));
  if (open) refreshBurnPanel();
}

function toggleBurnPanel() {
  if (!rocketAboard()) return;
  setTray(false);
  if (!burnPanel.hidden) {
    showBurnPanel(false);
    return;
  }
  if (!rocket.plan && !planBurn()) return;
  timePanel.hidden = true;
  timeButton.setAttribute('aria-pressed', 'false');
  showBurnPanel(true);
}

const writeText = (element, text) => element.textContent !== text && (element.textContent = text);
const formatBurnSpeed = (kmS) => (kmS ? `${kmS > 0 ? '+' : '−'}${formatRocketSpeed(Math.abs(kmS))}` : '0 m/s');

function approachNews(path) {
  if (!path?.target) return 'Select a planet or moon to see how close the path comes to it.';
  const { approach } = path;
  if (!approach) return '';
  const body = bodyNamed(path.target);
  const name = nameOfWell(body);
  const wait = formatWait(approach.ms - rocket.ms);
  const heightKm = approach.apartKm - body.radiusKm;
  if (heightKm <= 0) return `Hits ${name} in ${wait}.`;
  return `Closest to ${name}: ${formatRocketDistance(heightKm)} up, in ${wait}, passing at ${formatRocketSpeed(approach.speedKmS)}.`;
}

function refreshBurnPanel() {
  const { plan } = rocket;
  if (!plan) return;
  const untilMs = plan.ms - rocket.ms;
  writeText(burnPanel.querySelector('[data-burn-value="time"]'), untilMs > 0 ? formatWait(untilMs) : 'now');
  BURN_AXES.forEach((axis, k) => writeText(burnPanel.querySelector(`[data-burn-value="${axis}"]`), formatBurnSpeed(plan.dvKmS[k])));
  const plannedKmS = Math.hypot(...plan.kickKmS);
  const total = plan.started ? `Left to burn: ${formatRocketSpeed(Math.hypot(...(rocket.burnLeftKmS ?? plan.kickKmS)))}` : plannedKmS ? `Total ${formatRocketSpeed(plannedKmS)}: ${formatWait(burnSeconds(plan) * 1000)} of engine.` : 'Add speed with + and − to shape the path after the burn.';
  writeText(burnPanel.querySelector('[data-burn-total]'), total);
  writeText(burnPanel.querySelector('[data-burn-closest]'), approachNews(rocket.path));
  burnAutopilotButton.setAttribute('aria-pressed', String(plan.autopilot));
}

const aboveDock = (height) => height - dock.offsetHeight;

function drawBurnMarker(context, width, height) {
  const left = rocket.burnLeftKmS;
  const leftKmS = left ? Math.hypot(...left) : 0;
  if (!leftKmS) return;
  const direction = scale(left, 1 / leftKmS);
  const label = `Burn ${formatRocketSpeed(leftKmS)}`;
  const spot = spotOnStage(direction);
  context.save();
  context.strokeStyle = `rgb(${BURN_RGB})`;
  context.fillStyle = `rgb(${BURN_RGB})`;
  context.font = SELECTION_FONT;
  context.lineWidth = 1.5;
  const bottom = aboveDock(height);
  if (!spot || spot.x < 0 || spot.x > width || spot.y < 0 || spot.y > bottom) drawEdgeArrow(context, { direction: edgeDirection(direction) }, width, height, label, bottom);
  else {
    context.beginPath();
    context.arc(spot.x, spot.y, BURN_MARKER_PX, 0, 2 * Math.PI);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      context.moveTo(spot.x + dx * BURN_MARKER_PX, spot.y + dy * BURN_MARKER_PX);
      context.lineTo(spot.x + dx * (BURN_MARKER_PX + 5), spot.y + dy * (BURN_MARKER_PX + 5));
    }
    context.stroke();
    context.textBaseline = 'middle';
    context.fillText(label, spot.x + BURN_MARKER_PX + 8, spot.y);
  }
  context.restore();
}

const HEADING_RGB = '235, 215, 90';
const HEADING_MARKER_PX = 8;
const SURFACE_SPEED_BELOW_RADII = 0.05;

function headingOverGround() {
  const { state } = rocket;
  if (!state.velocityKmS) return null;
  const body = bodyNamed(state.holder);
  const altitudeKm = Math.hypot(...state.positionKm) - body.radiusKm;
  const surface = body.kind !== 'star' && altitudeKm < Math.max(airTopKm(body) - body.radiusKm, SURFACE_SPEED_BELOW_RADII * body.radiusKm);
  const velocityKmS = surface ? subtract(state.velocityKmS, cross(scale(body.north, spinRadiansPerSecond(body)), state.positionKm)) : state.velocityKmS;
  const speedKmS = Math.hypot(...velocityKmS);
  return speedKmS ? { direction: scale(velocityKmS, 1 / speedKmS), speedKmS, surface } : null;
}

function drawHeadingMarker(context, spot, label, crossed) {
  const r = HEADING_MARKER_PX;
  context.beginPath();
  context.arc(spot.x, spot.y, r, 0, 2 * Math.PI);
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) {
    context.moveTo(spot.x + dx * r, spot.y + dy * r);
    context.lineTo(spot.x + dx * (r + 6), spot.y + dy * (r + 6));
  }
  if (crossed) {
    const d = r * 0.6;
    context.moveTo(spot.x - d, spot.y - d);
    context.lineTo(spot.x + d, spot.y + d);
    context.moveTo(spot.x + d, spot.y - d);
    context.lineTo(spot.x - d, spot.y + d);
  }
  context.stroke();
  if (!crossed) {
    context.beginPath();
    context.arc(spot.x, spot.y, 1.8, 0, 2 * Math.PI);
    context.fill();
  }
  context.fillText(label, spot.x + r + 10, spot.y);
}

function drawHeadingMarkers(context, width, height) {
  const heading = headingOverGround();
  if (!heading) return;
  const bottom = aboveDock(height);
  context.save();
  context.strokeStyle = `rgb(${HEADING_RGB})`;
  context.fillStyle = `rgb(${HEADING_RGB})`;
  context.font = SELECTION_FONT;
  context.lineWidth = 1.5;
  context.shadowColor = 'rgba(0, 0, 0, 0.9)';
  context.shadowBlur = 4;
  context.textBaseline = 'middle';
  const frame = heading.surface ? 'over the ground' : 'in orbit';
  for (const [sign, label, crossed] of [[1, `Prograde ${formatRocketSpeed(heading.speedKmS)} ${frame}`, false], [-1, 'Retrograde', true]]) {
    const spot = spotOnStage(scale(heading.direction, sign));
    if (spot && spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= bottom) drawHeadingMarker(context, spot, label, crossed);
  }
  context.restore();
}

function formatWait(ms) {
  const seconds = ms / 1000;
  if (seconds < 90) return `${Math.max(1, Math.round(seconds))} s`;
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  const days = hours / 24;
  if (days < 730) return `${days < 10 ? days.toFixed(1) : Math.round(days)} days`;
  return `${Math.round(days / 365.25)} years`;
}

function pathMarkLabel(body, groundKm, { kind, distanceKm }, aside) {
  const over = aside ? ` over ${nameOfWell(body)}` : '';
  if (body.kind === 'star') return `${kind === 'lowest' ? 'Closest' : 'Farthest'} ${formatRocketDistance(distanceKm)}${aside ? ` from ${nameOfWell(body)}` : ''}`;
  return `${kind === 'lowest' ? 'Lowest' : 'Highest'} ${formatRocketDistance(Math.max(0, distanceKm - groundKm))}${over}`;
}

function segmentEndLabel({ end, holder, next, toMs }) {
  const wait = formatWait(toMs - rocket.ms);
  if (end === 'enters') return `Into ${nameOfWell(bodyNamed(next))}'s pull in ${wait}`;
  if (end === 'leaves') return `Out of ${nameOfWell(bodyNamed(holder))}'s pull in ${wait}`;
  if (end === 'ground') return `Hits ${nameOfWell(bodyNamed(holder))} in ${wait}`;
  if (end === 'air') return `Into ${nameOfWell(bodyNamed(holder))}'s air in ${wait}`;
  if (end === 'out of air') return `Out of ${nameOfWell(bodyNamed(holder))}'s air in ${wait}`;
  return null;
}

function drawRocketLine(context, width, height) {
  const scene = guideScene(width, height);
  if (!scene) return;
  const body = bodyNamed(rocket.state.holder);
  const up = normalize(subtract(rocket.shipFromEyeKm, scene.offsetOf(body.name)));
  const raisedKm = rocket.state.landedKm ? LANDER_MARK_RAISED_RADII * body.radiusKm : 0;
  const ships = rocket.view === 'orbit' ? [{ pointKm: add(rocket.shipFromEyeKm, scale(up, raisedKm)), label: 'Rocket', side: 'left', rgb: rocketPathColour(0) }] : [];
  if (!rocket.path) {
    drawRocketPath(context, { ...scene, lines: [], marks: ships });
    return;
  }
  const { segments, planned, burn, approach, target } = rocket.path;
  const takeoffGroundKm = segments[0]?.groundKm ?? body.radiusKm;
  const hiders = scene.bodies.map((seen) => (seen.name === body.name ? { ...seen, radiusKm: Math.min(seen.radiusKm, takeoffGroundKm) } : seen));
  const anchors = new Map([[rocket.state.holder, subtract(rocket.shipFromEyeKm, rocket.state.positionKm)]]);
  const legAnchors = [];
  const lines = [];
  const marks = [...ships];
  const drawLegs = (legs, plannedLegs) => legs.forEach((segment) => {
    const index = legAnchors.length;
    const anchorOf = (name) => anchors.get(name) ?? scene.offsetOf(name);
    const anchor = segment.met ? add(anchorOf(segment.met.parent), segment.met.offsetKm) : anchorOf(segment.holder);
    anchors.set(segment.holder, anchor);
    legAnchors.push(anchor);
    const rgb = rocketPathColour(index);
    const holder = bodyNamed(segment.holder);
    const fromEye = (pointKm) => add(anchor, pointKm);
    lines.push({ pointsKm: segment.pointsKm.map(fromEye), rgb, planned: plannedLegs });
    for (const mark of segment.marks) marks.push({ pointKm: fromEye(mark.pointKm), label: pathMarkLabel(holder, groundUnderKm(holder, mark.pointKm), mark, index > 0), rgb });
    if (segment.met) marks.push({ pointKm: anchor, label: `${holder.name} then`, rgb, hollow: true, side: 'left' });
    const label = segmentEndLabel(segment);
    if (label) marks.push({ pointKm: fromEye(segment.finish.positionKm), label, rgb });
  });
  drawLegs(segments, false);
  if (burn) marks.push({ pointKm: add(legAnchors[burn.index], burn.pointKm), label: rocket.plan && rocket.plan.ms > rocket.ms ? `Burn in ${formatWait(rocket.plan.ms - rocket.ms)}` : 'Burn now', rgb: BURN_RGB, hollow: true });
  drawLegs(planned, true);
  if (approach && approach.holder !== target) {
    const anchor = legAnchors[approach.index];
    const body = bodyNamed(target);
    const heightKm = approach.apartKm - body.radiusKm;
    const rgb = rocketPathColour(approach.index);
    marks.push({ pointKm: add(anchor, approach.pointKm), label: heightKm > 0 ? `Closest to ${nameOfWell(body)}: ${formatRocketDistance(heightKm)}` : `Hits ${nameOfWell(body)}`, rgb });
    marks.push({ pointKm: add(anchor, approach.targetKm), label: `${body.name} then`, rgb, hollow: true, side: 'left' });
  }
  drawRocketPath(context, { ...scene, bodies: hiders, lines, marks });
}

const nameOfWell = (body) => (body.kind === 'star' && body.name === 'Sun' ? 'the Sun' : spokenName(body));

function formatRocketSpeed(kmS) {
  if (kmS < 1) return `${Math.round(kmS * 1000).toLocaleString('en')} m/s`;
  return `${kmS.toFixed(kmS < 100 ? 2 : 0)} km/s`;
}

function formatRocketDistance(km) {
  if (km < 1) return `${Math.round(km * 1000).toLocaleString('en')} m`;
  return km < ROCKET_AU_FROM_KM ? `${Math.round(km).toLocaleString('en')} km` : `${(km / KM_PER_AU).toFixed(2)} AU`;
}

function rocketReadout(well, offsetKm) {
  const name = nameOfWell(well.body);
  if (rocket.state.landedKm) return `landed on ${name}`;
  const heading = headingOverGround();
  const speed = formatRocketSpeed(heading?.speedKmS ?? 0);
  const motion = heading?.surface ? 'over' : 'around';
  const { plan } = rocket;
  const burnNews = !plan ? '' : plan.ms > rocket.ms ? `, burn in ${formatWait(plan.ms - rocket.ms)}` : ', burn now';
  if (well.body.kind === 'star') return `${speed} around ${name}, ${formatRocketDistance(Math.hypot(...offsetKm))} out${burnNews}`;
  return `${speed} ${motion} ${name}, ${formatRocketDistance(Math.max(0, Math.hypot(...offsetKm) - groundUnderKm(well.body, offsetKm)))} up${burnNews}`;
}

let spinSinceSharpSky = 0;

function turnWithSpin(before, after) {
  if (aim || glide || warp || photo?.running) return;
  const carried = (vector) => fromBodyLocal(after, toBodyLocal(before, vector));
  const spin = Math.hypot(...subtract(after.meridian, before.meridian));
  if (!spin) return;
  game.ship = orthonormal(carried(game.ship.forward), carried(game.ship.up));
  game.basis = viewBasis(game.ship, game.head);
  spinSinceSharpSky += spin;
  const seenSpin = SPIN_SEEN_PIXELS * (fieldHeight / view.height);
  if (spin * SPIN_FRAMES_TO_SHARPEN > seenSpin) viewChanged();
  else if (spinSinceSharpSky > seenSpin) {
    skySharp = false;
    spinSinceSharpSky = 0;
  }
}

let groundPatches = null;
const STANDING_SHADOWS_WITHIN_KM = 0.5;

function groundInView() {
  if (!solarFrame) return null;
  const holder = bodyNamed(solarFrame.holder);
  const body = holder.kind === 'craft' ? bodyNamed(holder.parent) : holder;
  const settings = groundFor(body);
  if (!settings) return null;
  const cameraLocalKm = solarFrame.coRotating && body === holder ? solarFrame.localKm : toBodyLocal(body, subtract(cameraFromSunKm(), body.fromSunKm));
  const frame = groundFrame(cameraLocalKm, body.radiusKm);
  const highest = settings.viewFromKm ?? Math.min(GROUND_VIEW_SHARE_OF_RADIUS * body.radiusKm, GROUND_VIEW_HIGHEST_KM);
  if (frame.altitudeKm > highest) return null;
  const fullyGround = highest * GROUND_VIEW_FULL_SHARE_OF_HIGHEST;
  const blend = Math.min(1, Math.max(0, (highest - frame.altitudeKm) / (highest - fullyGround)));
  const aboveGroundKm = Math.max(0, Math.hypot(...cameraLocalKm) - lowestDistanceKm(body, fromBodyLocal(body, cameraLocalKm)));
  const seen = { body, settings, cameraLocalKm, frame, aboveGroundKm, blend: blend * blend * (3 - 2 * blend) };
  const { tanHalf, pixelAngle } = eyeView();
  const standing = solarCraft.filter((craft) => craft.landed && craft.parent === body.name && Math.hypot(...subtract(craft.localKm, cameraLocalKm)) < STANDING_SHADOWS_WITHIN_KM);
  return { ...seen, standing, ...groundPatches.visible(seen, { basis: { right: toBodyLocal(body, game.basis.right), up: toBodyLocal(body, game.basis.up), forward: toBodyLocal(body, game.basis.forward) }, tanHalf, pixelAngle, sun: toBodyLocal(body, body.sunward) }) };
}

function bodiesInView() {
  if (!solarFrame) return null;
  return seenFromCamera(solarBodies).sort((a, b) => Math.hypot(...a.offsetKm) - Math.hypot(...b.offsetKm));
}

function seenFromCamera(bodies) {
  const here = add(bodyNamed(solarFrame.holder).fromSunKm, solarFrame.offsetKm);
  return bodies.map((body) => ({ body, offsetKm: subtract(body.fromSunKm, here) }));
}

const craftInView = () => (solarFrame ? seenFromCamera(solarCraft) : []);

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

function nextSkyRedraw() {
  if (skyStale) {
    skyStale = false;
    return { skyResolution: SKY_RESOLUTION_MOVING, skySharpening: false };
  }
  if (!skySharp) {
    skySharp = true;
    return { skyResolution: longExposureShown() ? SKY_RESOLUTION_PHOTO : SKY_RESOLUTION_STILL, skySharpening: true };
  }
  return { skyResolution: 0, skySharpening: false };
}

function nearestStarPc(stars) {
  let nearest = Infinity;
  for (let i = STAR_DISTANCE_SLOT; i < stars.precise.length; i += STAR_STRIDE) nearest = Math.min(nearest, stars.precise[i]);
  return nearest;
}

const gatherEyeStars = (camera) => gatherStars({ camera, limit: EYE_LIMIT, budget: EYE_BUDGET, armMap, nebulae, nearby });
const regatherDistancePc = () => Math.min(REGATHER_DISTANCE, Math.max(SHORTEST_REGATHER_DISTANCE, REGATHER_SHARE_OF_NEAREST_STAR * eyeNearestStarPc));

function starFrom({ kind, key, position, absolute }) {
  if (kind === KIND.catalogue) return { ...key, kind };
  const star = kind === KIND.field && fieldStarSeenAt(position, absolute, armMap);
  return star ? { ...star, kind } : null;
}

function meetStarsWithin(reachPc) {
  if (eyeNearestStarPc > reachPc) return;
  const { count, precise, kinds, keys } = eyeStars;
  for (let i = 0; i < count; i++) {
    const at = i * STAR_STRIDE;
    if (precise[at + STAR_DISTANCE_SLOT] > reachPc) continue;
    const star = starFrom({ kind: kinds[i], key: keys[i], position: add(eyeAnchor, precise.slice(at, at + 3)), absolute: precise[at + 3] });
    if (star) systemAround(star);
  }
}

function refreshEyeStars(now) {
  if (!nearby.length || glide) return;
  const drift = eyeAnchor ? Math.hypot(...subtract(game.camera, eyeAnchor)) : Infinity;
  if (eyeStars && (drift < regatherDistancePc() || now - eyeGatheredAt < REGATHER_INTERVAL)) return;
  eyeAnchor = [...game.camera];
  eyeStars = gatherEyeStars(eyeAnchor);
  eyeNearestStarPc = nearestStarPc(eyeStars);
  if (game.mode.solarSystem) {
    meetStarsWithin(SYSTEM_REACH_PC + regatherDistancePc());
    blackHolesWithin(game.camera, SYSTEM_REACH_PC + regatherDistancePc(), armMap).forEach(systemAround);
  }
  eyeGatheredAt = now;
  eyeStarsChanged = true;
}

function eyeView() {
  return {
    camera: game.camera,
    basis: game.basis,
    tanHalf: eyeTanHalf(),
    pixelAngle: fieldHeight / view.height,
    anchorShift: subtract(game.camera, eyeAnchor),
  };
}

const prefersStillness = matchMedia('(prefers-reduced-motion: reduce)');
let lastFrame = performance.now();
function frame(now) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!intro && !game.over && game.mode.scored && !photo?.running && !warp && document.visibilityState === 'visible') game.clock += seconds;
  if (intro) advanceIntro(now);
  const warpView = warp ? advanceWarp(now) : null;
  if (aim) advanceAim(now);
  if (glide) advanceGlide(now);
  adaptation = adaptEyes(adaptation, warpView?.glareLux ?? 0, seconds);
  flightStep(seconds);
  if (menu) holdMenuView();
  followSolarSystem();
  inventGroundBelow();
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
      ...nextSkyRedraw(),
      cockpit: { ...cockpitUniforms(game.ship), enabled: game.mode.cockpit && !rocketOutside() },
      planet: intro?.planet ?? null,
      bodies: bodiesInView(),
      beyond: seenThroughMouth(),
      craft: [...craftInView(), ...rocketInView()],
      starlight: system.light,
      cloudSeconds: paused() || prefersStillness.matches ? 0 : seconds,
      ground,
      warp: warpView,
      adaptation,
      longExposure: longExposureShown(),
      blurMotion: motionBlurToggle.checked && !warpView && !intro && !photo && !menu && !wentThrough,
    });
    eyeStarsChanged = false;
    wentThrough = false;
  }
  if (labelsShown() || selection || orbitsShown() || rocket) refreshGuides(now);
  placeCrosshair();
  $('[data-clock]').textContent = game.mode.scored ? formatClock(game.clock) : '';
  const flyingRocket = rocketAboard() && solarFrame;
  $('[data-speed-label]').textContent = flyingRocket ? 'Rocket' : 'Thrusters';
  $('[data-speed]').textContent = flyingRocket ? rocket.readout : formatSpeed(game.speed);
  enginesField.hidden = !flyingRocket;
  if (flyingRocket) enginesReadout.textContent = rocket.engines;
  if (touchScreen.matches && flyingRocket) showSpeedOnDial(rocket.throttle, { slowest: THROTTLE_RANGE[0], top: THROTTLE_RANGE[1], label: `${Math.round(rocket.throttle * 100)}% thrust` });
  else if (touchScreen.matches) showSpeedOnDial(game.speed, { slowest: game.mode.slowestSpeed, top: game.mode.topSpeed, label: formatSpeed(game.speed) });
  if (game.mode.solarSystem) showSimTime(now);
  showCompanionButtons();
  if (rocket?.plan && !burnPanel.hidden) refreshBurnPanel();
  $('[data-energy]').textContent = !game.mode.scored ? 'unlimited' : `${formatWarpTime(game.energy)} (${formatLightYears(Math.max(0, game.energy))})`;
  requestAnimationFrame(frame);
}

function placeCrosshair() {
  const cannotFly = menu || intro || photo || warp || game.over || !atlasFrame.hidden || !editorPanel.hidden;
  const spot = cannotFly ? null : spotOnStage(game.ship.forward);
  crosshair.hidden = !spot;
  if (spot) crosshair.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
}

function clearGuides() {
  guides.getContext('2d').clearRect(0, 0, guides.width, guides.height);
}

function refreshGuides(now) {
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
  if (orbitsShown()) drawOrbitLines(context, width, height);
  if (labelsShown()) drawGuides(context, { camera: game.camera, basis: game.basis, tanHalf: eyeTanHalf(), width, height, bottom: aboveDock(height), nebulae, galaxies });
  if (selection) followSelection(context, now);
  if (selection?.destination?.craft) drawSelectedPath(context, width, height);
  if (rocketOutside() && rocket.view === 'orbit' && solarFrame) drawRocketLine(context, width, height);
  if (rocket?.plan && rocketAboard() && solarFrame) drawBurnMarker(context, width, height);
  if (rocketOutside() && rocket.view === 'chase' && solarFrame) drawHeadingMarkers(context, width, height);
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
  const pixelAngle = fieldHeight / height;
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
  nameButton(exposeButton, 'Stop photo', 'stop');
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
  nameButton(exposeButton, 'Photo', 'photo');
  developPhoto();
}

function closePhoto() {
  if (photo) clearInterval(photo.timer);
  photo = null;
  photoFrame.hidden = true;
  nameButton(exposeButton, 'Photo', 'photo');
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

function spotOnStage(offset) {
  const [tanX, tanY] = eyeTanHalf();
  const depth = dot(offset, game.basis.forward);
  if (depth <= 0) return null;
  return {
    x: ((dot(offset, game.basis.right) / depth / tanX) * 0.5 + 0.5) * stage.clientWidth,
    y: (0.5 - (dot(offset, game.basis.up) / depth / tanY) * 0.5) * stage.clientHeight,
  };
}

function nearestStarAt([x, y], reachPx) {
  if (!eyeStars) return null;
  const shift = subtract(game.camera, eyeAnchor);
  let nearest = null;
  for (let i = 0; i < eyeStars.count; i++) {
    const offset = subtract(eyeStars.precise.slice(i * 6, i * 6 + 3), shift);
    const spot = spotOnStage(offset);
    if (!spot) continue;
    const distance = Math.hypot(...offset);
    if (game.mode.cockpit && !throughWindow(game.ship, scale(offset, 1 / distance))) continue;
    if (eyeStars.precise[i * 6 + 3] + 5 * Math.log10(distance / 10) > EYE_LIMIT) continue;
    const miss = Math.hypot(spot.x - x, spot.y - y);
    if (miss <= reachPx && (!nearest || miss < nearest.miss)) {
      nearest = { kind: eyeStars.kinds[i], key: eyeStars.keys[i], name: eyeStars.names[i], absolute: eyeStars.precise[i * 6 + 3], colour: eyeStars.precise[i * 6 + 4], distance, miss, offset };
    }
  }
  return nearest;
}

function stagePoint(clientX, clientY) {
  const box = view.getBoundingClientRect();
  return [clientX - box.left, clientY - box.top];
}

function claimInView(clientX, clientY, reachPx) {
  claim(nearestStarAt(stagePoint(clientX, clientY), reachPx));
}

const SELECTION_RING_PX = 12;
const SELECTION_COLOUR = '#9fd4ff';
const SELECTION_REFRESH_MS = 250;
const SELECTION_FONT = '13px "Trebuchet MS", sans-serif';
const SUN_COLOUR_INDEX = 0.65;
const pickPanel = $('[data-pick]');
let selection = null;
let selectionShownAt = -Infinity;

function discPixels(pick, offset) {
  if (pick.kind !== 'body') return 0;
  return (pick.body.radiusKm / KM_PER_PC / Math.hypot(...offset)) * (stage.clientHeight / 2 / eyeTanHalf()[1]);
}

function bodyOffsetPc(wanted) {
  const seen = [...(bodiesInView() ?? []), ...craftInView()].find(({ body }) => body.name === wanted.name);
  if (seen) return scale(seen.offsetKm, 1 / KM_PER_PC);
  if (!game.mode.solarSystem) return null;
  const { centre } = (wanted.kind === 'craft' ? craftNow(wanted) : placedNow(wanted)) ?? {};
  return centre ? subtract(centre, game.camera) : null;
}

const nebulaOffsetPc = (nebula) => {
  const delay = Math.hypot(...subtract(nebula.present, game.camera)) * LY_PER_PC;
  return subtract(positionSeenAt(nebula.present, [0, 0, 0], delay), game.camera);
};

const placedAt = (position) => () => subtract(position, game.camera);

function bodyPick(body) {
  return {
    kind: 'body',
    get body() {
      return (solarBodies && bodyNamed(body.name)) ?? placedNow(body);
    },
    locate: () => bodyOffsetPc(body),
    beamHere: body.pulsar && beamHereFor(body.pulsar, systemOf(body), () => bodyOffsetPc(body)),
    destination: bodyDestination(body),
  };
}

const beamHereFor = (pulsar, { star, position }, offsetPc) => () => beamReaches(pulsar, star.north, normalize(subtract(SUN_POSITION, position)), scale(offsetPc(), -1), simNow());

const nebulaPick = (nebula) => ({ kind: 'nebula', name: nebula.name, locate: () => nebulaOffsetPc(nebula), destination: nebulaDestination(nebula) });
const galaxyPick = (galaxy) => ({ kind: 'galaxy', name: galaxy.name, locate: placedAt(galaxy.centre), destination: galaxyDestination(galaxy) });
const sunPick = () => ({ kind: KIND.sun, name: 'Sun', absolute: SUN_ABSOLUTE, colour: SUN_COLOUR_INDEX, locate: placedAt(SUN_POSITION), destination: SUN_DESTINATION });

function craftPick(listed) {
  return {
    kind: 'body',
    get body() {
      return (solarBodies && bodyNamed(listed.name)) ?? craftNow(listed) ?? { ...listed, kind: 'craft' };
    },
    locate: () => bodyOffsetPc({ ...listed, kind: 'craft' }),
    destination: craftDestination(listed),
  };
}

function pickFor(destination) {
  const { subject } = destination;
  if (destination.craft) return craftPick(destination.craft);
  if (subject.kind === 'body') return bodyPick(subject.body);
  if (subject.kind === 'nebula') return { ...nebulaPick(subject.nebula), destination };
  if (subject.kind === 'galaxy') return { ...galaxyPick(subject.galaxy), destination };
  return subject.star.sun ? sunPick() : hostPick(subject.star.host);
}

function hostPick(name) {
  const system = systemNamed(name);
  const { catalogueStar, data, star } = system;
  const locate = placedAt(catalogueStar.position);
  return {
    ...catalogueStar,
    kind: catalogueStar.kind ?? KIND.catalogue,
    hostData: data,
    radiusKm: star.radiusKm,
    locate,
    beamHere: data.pulsar && beamHereFor(data.pulsar, system, locate),
    destination: starDestination(catalogueStar),
  };
}

const starBodyPick = (body) => (body.orbit ? bodyPick(body) : body.host ? hostPick(body.host) : sunPick());

function clickedStarPick(star) {
  if (star.kind === KIND.sun) return sunPick();
  const position = add(game.camera, star.offset);
  const found = starFrom({ ...star, position });
  if (found) return hostPick(systemAround(found).name);
  return { ...star, locate: placedAt(position), destination: plainStarDestination({ name: 'an unnamed star', position }) };
}

function planetStandingInFor(body, pixelsPerKm) {
  const planet = body.parent && bodyNamed(body.parent);
  if (!planet) return body;
  const orbitPx = Math.hypot(...subtract(body.fromSunKm, planet.fromSunKm)) * pixelsPerKm;
  return orbitPx < MOON_PICKABLE_ORBIT_PX ? planet : body;
}

const SMALLEST_PICKABLE_CRAFT_PX = 2;
const listedCraft = ({ name }) => destinations().find((place) => place.craft?.name === name).craft;

function pickableAt([x, y], reachPx) {
  const star = nearestStarAt([x, y], reachPx);
  const picks = [];
  if (star) picks.push({ ...clickedStarPick(star), miss: star.miss });
  const pixelsPerTan = stage.clientHeight / 2 / eyeTanHalf()[1];
  for (const { body, offsetKm } of bodiesInView() ?? []) {
    const offset = scale(offsetKm, 1 / KM_PER_PC);
    const spot = spotOnStage(offset);
    if (!spot) continue;
    const distanceKm = Math.hypot(...offsetKm);
    const pixelsPerKm = pixelsPerTan / distanceKm;
    const discPx = body.radiusKm * pixelsPerKm;
    const miss = Math.max(0, Math.hypot(spot.x - x, spot.y - y) - discPx);
    if (miss <= reachPx) picks.push(Object.assign(body.kind === 'star' ? starBodyPick(body) : bodyPick(planetStandingInFor(body, pixelsPerKm)), { miss }));
  }
  for (const { body, offsetKm } of craftInView()) {
    const spot = spotOnStage(scale(offsetKm, 1 / KM_PER_PC));
    const discPx = (body.radiusKm * pixelsPerTan) / Math.hypot(...offsetKm);
    if (!spot || (discPx < SMALLEST_PICKABLE_CRAFT_PX && !craftMarked(body, offsetKm))) continue;
    const miss = Math.max(0, Math.hypot(spot.x - x, spot.y - y) - discPx);
    if (miss <= reachPx) picks.push({ ...craftPick(listedCraft(body)), miss });
  }
  const deepSky = [
    ...nebulae.map(nebulaPick),
    ...galaxies.map(galaxyPick),
  ];
  for (const place of deepSky) {
    const spot = spotOnStage(place.locate());
    if (!spot) continue;
    const miss = Math.hypot(spot.x - x, spot.y - y);
    if (miss <= reachPx) picks.push({ ...place, miss });
  }
  return picks.sort((a, b) => a.miss - b.miss)[0] ?? null;
}

function selectInView(clientX, clientY, reachPx) {
  selection = pickableAt(stagePoint(clientX, clientY), reachPx);
  selectionShownAt = -Infinity;
  if (!selection) clearSelection();
}

function clearSelection() {
  selection = null;
  pickPanel.hidden = true;
  clearGuides();
}

function togglePickDetails({ currentTarget }) {
  currentTarget.setAttribute('aria-expanded', currentTarget.getAttribute('aria-expanded') !== 'true');
}

function showSelectionFacts() {
  const { title, kind, facts, note } = describePick(selection);
  $('[data-pick-title]').textContent = title;
  $('[data-pick-kind]').textContent = kind;
  $('[data-pick-facts]').replaceChildren(
    ...facts.flatMap(([label, value]) => [Object.assign(document.createElement('dt'), { textContent: label }), Object.assign(document.createElement('dd'), { textContent: value })]),
  );
  $('[data-pick-note]').textContent = note ?? '';
  showMissionStart(selection.destination);
  pickPanel.hidden = false;
}

const missionStartButton = $('[data-pick-mission-start]');

function showMissionStart(destination) {
  const { craft } = destination;
  missionStartButton.hidden = !craft || !flightDates(craft);
  missionStartButton.textContent = craft?.on ? 'Timewarp to landing' : 'Timewarp to start of mission';
  $('[data-pick-warp]').disabled = isAbsent(destination);
}

function timewarpToMissionStart() {
  changeTime(() => playFrom(flightDates(selection.destination.craft).from));
  selectionShownAt = -Infinity;
}

const stillShown = (body, name) => (body.speculative ? speculationShown() : speculativeBodiesNow().some((other) => other.name === name));
const dismantled = ({ kind, destination }) => kind === 'body' && isSpeculative(destination.subject.body) && !stillShown(destination.subject.body, destination.name);

function followSelection(context, now) {
  if (dismantled(selection)) {
    clearSelection();
    return;
  }
  const offset = selection.locate();
  if (offset) {
    selection.distance = Math.hypot(...offset);
    selection.distanceKm = selection.distance * KM_PER_PC;
  }
  if (now - selectionShownAt >= SELECTION_REFRESH_MS) {
    showSelectionFacts();
    selectionShownAt = now;
  }
  if (!offset) return;
  const spot = spotOnStage(offset);
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const bottom = aboveDock(height);
  context.strokeStyle = SELECTION_COLOUR;
  context.fillStyle = SELECTION_COLOUR;
  if (!spot || spot.x < 0 || spot.x > width || spot.y < 0 || spot.y > bottom) {
    context.font = SELECTION_FONT;
    drawEdgeArrow(context, { direction: edgeDirection(offset) }, width, height, `${describePick(selection).title} · ${formatDistance(Math.hypot(...offset))}`, bottom);
    return;
  }
  if (discPixels(selection, offset) > SELECTION_RING_PX) return;
  context.beginPath();
  context.arc(spot.x, spot.y, SELECTION_RING_PX, 0, 2 * Math.PI);
  context.stroke();
}

function edgeDirection(offset) {
  const [tanX, tanY] = eyeTanHalf();
  const depth = dot(offset, game.basis.forward);
  const away = Math.max(Math.abs(depth), Number.EPSILON);
  const side = Math.sign(depth) || 1;
  return [(dot(offset, game.basis.right) / away / tanX) * side, (-dot(offset, game.basis.up) / away / tanY) * side];
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

const fingers = createTwoFingerGesture({
  zoomBy(factor) {
    if (rocketOutside()) zoomRocketCamera(1 / factor);
    else zoomBy(factor);
  },
  rollBy(angle) {
    if (warp || aim || glide || intro || menu) return;
    game.ship = turn(game.ship, 'forward', -angle);
    aimView();
  },
});
const handOf = ({ pointerType }) => (pointerType === 'touch' ? 'touch' : 'mouse');

let drag = null;
view.addEventListener('pointerdown', (event) => {
  if (photo?.running) return;
  view.focus();
  view.setPointerCapture(event.pointerId);
  if (fingers.put(event) > 1) {
    drag = null;
    return;
  }
  drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, tap: !closeTouchPanels() };
});
view.addEventListener('pointermove', (event) => {
  fingers.move(event);
  if (!drag) return;
  const perPixel = fieldHeight / stage.clientHeight;
  const across = (event.clientX - drag.x) * perPixel;
  const down = (event.clientY - drag.y) * perPixel;
  if (rocketOutside()) swingRocketCamera(across, down);
  else if (game.mode.dragSteersShip && !aim && !glide) {
    game.ship = turn(turn(game.ship, 'up', across), 'right', down);
    aimView();
  } else turnHead(-across, down);
  drag.x = event.clientX;
  drag.y = event.clientY;
});
view.addEventListener('pointerup', (event) => {
  const staying = fingers.lift(event);
  const tapped = drag?.tap && !warp && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < TAP_DISTANCE[handOf(event)];
  if (tapped && game.mode.picking) selectInView(event.clientX, event.clientY, PICK_RADIUS_PX[handOf(event)]);
  else if (tapped) claimInView(event.clientX, event.clientY, PICK_RADIUS_PX[handOf(event)]);
  drag = staying && { x: staying.x, y: staying.y, tap: false };
});
view.addEventListener('pointercancel', (event) => {
  fingers.lift(event);
  drag = null;
});
view.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    if (event.ctrlKey) {
      const pixels = Math.max(-MOST_WHEEL_PIXELS_PER_EVENT, Math.min(MOST_WHEEL_PIXELS_PER_EVENT, event.deltaY));
      zoomBy(Math.exp(-pixels * ZOOM_PER_WHEEL_PIXEL));
    } else if (rocketOutside()) zoomRocketCamera(event.deltaY < 0 ? 0.8 : 1.25);
    else changeSpeed(event.deltaY < 0 ? 1.25 : 0.8);
  },
  { passive: false },
);

function changeSpeed(factor) {
  if (rocketAboard()) setThrottle(rocket.throttle * factor);
  else game.speed = Math.min(game.mode.topSpeed, Math.max(game.mode.slowestSpeed, game.speed * factor));
}

const ZOOM_IN_KEYS = new Set(['Equal', 'NumpadAdd']);
const ZOOM_OUT_KEYS = new Set(['Minus', 'NumpadSubtract']);
const ZOOM_RESET_KEYS = new Set(['Digit0', 'Numpad0']);

function zoomWithKey(event) {
  if (event.ctrlKey || event.metaKey) return;
  if (ZOOM_IN_KEYS.has(event.code)) zoomBy(ZOOM_STEP);
  else if (ZOOM_OUT_KEYS.has(event.code)) zoomBy(1 / ZOOM_STEP);
  else if (ZOOM_RESET_KEYS.has(event.code)) resetZoom();
}

const FLIGHT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('select, input, textarea')) return;
  if (!editorPanel.hidden) {
    if (event.code === 'Escape') closeEditor();
    return;
  }
  if (menu) {
    if (event.code === 'Escape' && menu.parked) resumeFromMenu();
    return;
  }
  if (intro) {
    event.preventDefault();
    if (intro.waiting) beginIntro();
    else endIntro();
    return;
  }
  if (FLIGHT_KEYS.has(event.code)) {
    held.add(event.code);
    event.preventDefault();
  } else if (event.code === 'KeyZ') {
    if (rocketAboard()) stepThrottle(-1);
    else changeSpeed(0.5);
  } else if (event.code === 'KeyX') {
    if (rocketAboard()) stepThrottle(1);
    else changeSpeed(2);
  } else if (event.code === 'Space' && rocketAboard()) {
    event.preventDefault();
    dropStage();
  }
  else if (event.code === 'KeyT') toggleExposure();
  else if (event.code === 'KeyJ') jump();
  else if (event.code === 'KeyC') faceDirection(game.basis.forward);
  else if (event.code === 'KeyM') toggleAtlas();
  else if (event.code === 'Comma' && game.mode.solarSystem) changeTime(slower);
  else if (event.code === 'Period' && game.mode.solarSystem) changeTime(faster);
  else if (event.code === 'Slash' && game.mode.solarSystem) changeTime(togglePause);
  else if (event.code === 'KeyO' && game.mode.solarSystem) setOrbits(!orbitsShown());
  else if (event.code === 'KeyV' && rocketAboard()) nextRocketView();
  else if (event.code === 'KeyB' && rocketAboard()) toggleBurnPanel();
  else if (event.code === 'KeyG' && rocketAboard()) openEditor();
  else if (event.code === 'KeyN' && rocketAboard()) relaunch();
  else if (BURN_KEYS.has(event.code) && rocket?.plan) {
    burnKeyStreak = event.repeat ? burnKeyStreak + 1 : 0;
    nudgeBurn(...BURN_KEYS.get(event.code), burnKeyStreak);
  }
  else if (event.code === 'KeyL' && game.mode.labels) setLabels(!labelsToggle.checked);
  else if (event.code === 'KeyP' && game.mode.longExposure) setLongExposure(!longExposureToggle.checked);
  else if (event.code === 'Escape') {
    closePhoto();
    atlasFrame.hidden = true;
    clearSelection();
  } else zoomWithKey(event);
});
window.addEventListener('keyup', (event) => held.delete(event.code));
window.addEventListener('blur', letGo);

document.querySelectorAll('[data-hold]').forEach((button) => {
  const key = button.dataset.hold;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    held.add(key);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => held.delete(key));
});
const showSpeedOnDial = createSpeedDial($('[data-speed-dial]'), changeSpeed);
$('[data-zoom-in]').addEventListener('click', () => zoomBy(ZOOM_STEP));
$('[data-zoom-out]').addEventListener('click', () => zoomBy(1 / ZOOM_STEP));
$('[data-zoom-reset]').addEventListener('click', resetZoom);
document.querySelector('[data-touch]').addEventListener('contextmenu', (event) => event.preventDefault());

let atlasDrawn = false;
function toggleAtlas() {
  if (!atlasDrawn && nearby.length) {
    drawAtlas($('[data-atlas]'), nebulae, catalogue, galaxies);
    atlasDrawn = true;
  }
  atlasFrame.hidden = !atlasFrame.hidden;
  if (!atlasFrame.hidden && photo && !photo.running) closePhoto();
  setTray(false);
}

photoCanvas.addEventListener('click', (event) => !photo?.running && claimInView(event.clientX, event.clientY, PICK_RADIUS_PX[handOf(event)]));
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
orbitsButton.addEventListener('click', () => setOrbits(!orbitsShown()));
followButton.addEventListener('click', () => setFollowing(!following));
rocketViewButton.addEventListener('click', nextRocketView);
stageButton.addEventListener('click', dropStage);
buildButton.addEventListener('click', openEditor);
for (const button of editorPanel.querySelectorAll('[data-editor-done], [data-editor-close]')) button.addEventListener('click', closeEditor);
editorPanel.querySelector('[data-editor-relaunch]').addEventListener('click', () => {
  if (!editor.finish()) return;
  view.focus();
  relaunch();
});
rocketTurnButton.addEventListener('click', () => rocket && setRocketTurning(!rocket.turning));
burnButton.addEventListener('click', toggleBurnPanel);
$('[data-burn-close]').addEventListener('click', () => showBurnPanel(false));
$('[data-burn-delete]').addEventListener('click', () => rocket?.plan && endPlan('Burn plan deleted.'));
burnPointButton.addEventListener('click', () => rocket?.plan && setBurnPointing(!rocket.pointing));
burnAutopilotButton.addEventListener('click', () => {
  if (!rocket?.plan) return;
  const on = !rocket.plan.autopilot;
  setAutopilot(on, on ? 'Autopilot on: it turns the rocket, slows time and fires the engine for the planned burn.' : 'Autopilot off.');
});
for (const button of burnPanel.querySelectorAll('[data-burn-apsis]')) button.addEventListener('click', () => rocket?.plan && burnAtApsis(button.dataset.burnApsis));
for (const button of burnPanel.querySelectorAll('[data-burn-nudge]')) {
  const nudge = (streak) => nudgeBurn(button.dataset.burnNudge, Number(button.dataset.sign), streak);
  let repeating = null;
  const stop = () => clearTimeout(repeating);
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    let streak = 0;
    const again = () => {
      nudge(streak);
      repeating = setTimeout(again, streak++ ? NUDGE_REPEAT_MS.then : NUDGE_REPEAT_MS.first);
    };
    again();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, stop);
  button.addEventListener('click', (event) => event.detail === 0 && nudge(0));
}
rotateButton.addEventListener('click', () => setRotatingWith(rotatingWith ? null : solarFrame?.holder ?? null));
timeButton.addEventListener('click', () => {
  setTray(false);
  timePanel.hidden = !timePanel.hidden;
  timeButton.setAttribute('aria-pressed', String(!timePanel.hidden));
  if (!timePanel.hidden) showBurnPanel(false);
});
$('[data-time-close]').addEventListener('click', () => timeButton.click());
$('[data-time-slower]').addEventListener('click', () => changeTime(slower));
$('[data-time-faster]').addEventListener('click', () => changeTime(faster));
$('[data-time-pause]').addEventListener('click', () => changeTime(togglePause));
$('[data-time-now]').addEventListener('click', () => changeTime(backToNow));
simDateInput.addEventListener('change', () => {
  const chosen = Date.parse(`${simDateInput.value}Z`);
  if (Number.isFinite(chosen)) changeTime(() => jumpTo(chosen));
});
const moreButton = $('[data-more]');
const dock = $('[data-dock]');
const trayButton = $('[data-tray]');
const fullscreenButton = $('[data-fullscreen]');
const trayOpen = () => dock.classList.contains('fh-tray-open');
const sheetOpen = () => document.body.classList.contains('fh-sheet-open');
const showPanelState = () => moreButton.setAttribute('aria-expanded', String(touchScreen.matches ? sheetOpen() : studioPanelOpen()));

function openEditor() {
  if (!rocketAboard()) return;
  letGo();
  showBurnPanel(false);
  setTray(false);
  editor.open(rocketDesign);
}

function closeEditor() {
  if (editor.finish()) view.focus();
}

function setTray(open) {
  dock.classList.toggle('fh-tray-open', open);
  trayButton.setAttribute('aria-expanded', String(open));
}

function setSheet(open) {
  document.body.classList.toggle('fh-sheet-open', open);
  showPanelState();
}

function closeTouchPanels() {
  const anyOpen = touchScreen.matches && (trayOpen() || sheetOpen());
  setTray(false);
  setSheet(false);
  return anyOpen;
}

trayButton.addEventListener('click', () => setTray(!trayOpen()));
moreButton.addEventListener('click', () => {
  if (touchScreen.matches) {
    setTray(false);
    setSheet(!sheetOpen());
    return;
  }
  toggleStudioPanel();
  showPanelState();
});
const sheetHandle = document.querySelector('[data-studio-handle]');
for (const type of ['pointerdown', 'click']) {
  sheetHandle.addEventListener(
    type,
    (event) => {
      if (!touchScreen.matches) return;
      event.stopImmediatePropagation();
      if (type === 'click') setSheet(false);
    },
    { capture: true },
  );
}
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
});
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) nameButton(fullscreenButton, 'Exit full screen', 'shrink');
  else nameButton(fullscreenButton, 'Full screen', 'expand');
});
window.addEventListener('resize', showPanelState);
new ResizeObserver(() => stage.style.setProperty('--dock-height', `${dock.offsetHeight}px`)).observe(dock);
showPanelState();
showTipsAbove(dock, $('[data-tip]'));
document.querySelectorAll('[data-align]').forEach((button) => button.addEventListener('click', () => faceDirection(game.basis.forward)));
modeSelect.addEventListener('change', () => (leavingExplore() ? newGame() : setMode(modeSelect.value)));
$('[data-select-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  selectNamed(selectInput.value);
});
selectInput.addEventListener('focus', destinations);
selectInput.addEventListener('input', (event) => {
  const choseFromList = !(event instanceof InputEvent) || event.inputType === 'insertReplacementText';
  if (choseFromList && destinationNamed(selectInput.value)) selectNamed(selectInput.value);
});
$('[data-warp-selection]').addEventListener('click', warpToSelection);
$('[data-pick-warp]').addEventListener('click', warpToSelection);
missionStartButton.addEventListener('click', timewarpToMissionStart);
labelsToggle.addEventListener('change', () => setLabels(labelsToggle.checked));
$('[data-pick-close]').addEventListener('click', clearSelection);
$('[data-pick-fold]').addEventListener('click', togglePickDetails);
motionBlurToggle.checked = motionBlurWanted();
motionBlurToggle.addEventListener('change', rememberMotionBlur);
recallUnlimitedFuel();
unlimitedFuelToggle.addEventListener('change', unlimitedFuelChanged);
recallTrueSize();
centimetresPerUnitShown = Number(trueSizeUnitSelect.value);
trueSizeToggle.addEventListener('change', trueSizeChanged);
for (const input of [screenWidthInput, eyeDistanceInput]) input.addEventListener('input', trueSizeChanged);
trueSizeUnitSelect.addEventListener('change', convertTrueSizeUnits);
rocketToggle.addEventListener('change', () => setRocket(rocketToggle.checked));
speculationToggle.checked = speculationShown();
speculationToggle.addEventListener('change', () => showSpeculation(speculationToggle.checked));
longExposureToggle.addEventListener('change', () => setLongExposure(longExposureToggle.checked));
$('[data-menu-open]').addEventListener('click', openMenu);
menuResume.addEventListener('click', resumeFromMenu);
menuFrame.querySelectorAll('[data-menu-mode]').forEach((button) => button.addEventListener('click', () => startFromMenu(button.dataset.menuMode)));
restartButton.addEventListener('click', () => newGame());
$('[data-new-game]').addEventListener('click', () => newGame());
new ResizeObserver(resize).observe(stage);

if (!renderer) {
  hideLoading();
  showStatus(rendererProblem, 3600);
} else {
  const requested = Number(new URL(window.location.href).searchParams.get('seed'));
  const requestedMode = new URL(window.location.href).searchParams.get('mode');
  const seeded = Number.isInteger(requested) && requested > 0;
  if (seeded || requestedMode) {
    newGame(seeded ? requested : randomSeed(), modeFromName(requestedMode));
    if (!seeded && game.mode === MODES.explore) startNearEarth();
  } else openMenu();
  resize();
  loadWarpOptics('data/warp-optics.bin').then((optics) => {
    warpOptics = optics;
    renderer.loadWarpTable(optics);
  });
  loadSpacecraft(new URL('data/', window.location.href), groundFor).catch(() => showStatus('Spacecraft paths failed to load; only landers and rovers show.'));
  groundPatches = createGroundPatches(renderer.releasePatch, renderer.releaseDetails, renderer.releaseRibbon);
  loadBodyMaps(new URL('data/planets/', window.location.href), (layer, maps) => {
    renderer.loadBodyMap(layer, maps);
    groundMaps[layer] = maps.ground ?? null;
  }).catch(() => showStatus('Planet maps failed to load; planets show placeholder surfaces.'));
  loadCloudMap(new URL('data/planets/', window.location.href), CLOUD_MAP_SIZE)
    .then(renderer.loadCloudMap)
    .catch(() => showStatus("Earth's cloud map failed to load; Earth shows no clouds."));
  loadCityLights(new URL('data/planets/', window.location.href), renderer.widestTexture)
    .then(renderer.loadCityLights)
    .catch(() => showStatus("Earth's city lights failed to load; its night side stays dark."));
  loadNearbyStars('data/nearby-stars.bin', 'data/nearby-star-names.json').then((stars) => {
    catalogue = stars;
    nearby = [...withExoplanetHosts(stars), ...PULSAR_HOSTS.map(({ catalogueStar }) => catalogueStar), ...KNOWN_BLACK_HOLES.map(({ name }) => systemNamed(name).catalogueStar)];
    knowStarsNearSun(nearby);
  }).finally(() => requestAnimationFrame(() => requestAnimationFrame(hideLoading)));
  requestAnimationFrame(frame);
}
