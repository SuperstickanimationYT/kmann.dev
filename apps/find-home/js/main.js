import { drawAtlas } from './atlas.js';
import { CAMERA, imageFromRows, levelsFor, measureSignal, skyFillsPixels } from './camera.js';
import { createCutscene } from './cutscene.js';
import { GALAXIES, placeGalaxies } from './galaxies.js';
import { buildArmMap, DEGREES, LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { NEBULAE } from './nebulae.js';
import { describeStar, drawGuides } from './practice.js';
import { createRandom, randomSeed } from './random.js';
import { createRenderer } from './renderer.js';
import { cockpitUniforms, SHIP, throughWindow, viewBasis } from './ship.js';
import { gatherStars, KIND, loadNearbyStars, placeNebulae } from './stars.js';
import { add, dot, normalize, orthonormal, rotateAbout, scale, subtract } from './vectors.js';

const EYE_FIELD_HEIGHT = 50 * DEGREES;
const MAX_PIXEL_RATIO = 1.25;
const EYE_LIMIT = 6.5;
const SKY_RESOLUTION_MOVING = 0.25;
const SKY_RESOLUTION_STILL = 0.5;
const EYE_BUDGET = 60000;
const REGATHER_DISTANCE = 0.3;
const REGATHER_INTERVAL = 150;
const LOOK_RATE = 0.9;
const ROLL_RATE = 0.9;
const SPEED_RANGE = [0.001, SHIP.thrusterTopSpeed];
const START_DISTANCE_KLY = [130, 220];
const START_LATITUDE = [15, 70];
const START_CLEARANCE = 15000;

const WRONG_CLAIM_SECONDS = 3600;
const PICK_RADIUS_PX = 10;
const TAP_DISTANCE = 6;
const AU_PER_LY = 63241;
const ARCSEC_PER_RADIAN = 206264.8;
const GUIDE_FONT = 13;

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
const warpVeil = $('[data-warp]');
const guides = $('[data-guides]');
const modeSelect = $('[data-mode]');
const clockLabel = $('[data-clock-label]');
const giveUpButton = $('[data-give-up]');
const labelsToggle = $('[data-labels]');
const labelsField = $('[data-labels-field]');
const introFrame = $('[data-intro]');
const introText = $('[data-intro-text]');

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
let eyeGatheredAt = 0;
let eyeStarsChanged = false;
let photo = null;
let statusTimer = 0;
let frameSeed = 1;

function startingPoint(random) {
  const distance = (random.between(...START_DISTANCE_KLY) * 1000) / LY_PER_PC;
  const latitude = random.between(...START_LATITUDE) * DEGREES * (random.next() < 0.5 ? -1 : 1);
  const azimuth = random.between(0, 2 * Math.PI);
  return [distance * Math.cos(latitude) * Math.sin(azimuth), distance * Math.cos(latitude) * Math.cos(azimuth), distance * Math.sin(latitude)];
}

function newGame(seed = randomSeed(), practice = modeSelect.value === 'practice') {
  endIntro();
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
    practice: false,
    practiceUsed: false,
  };
  eyeStars = null;
  closePhoto();
  skyStale = true;
  ending.hidden = true;
  setMode(practice);
  if (!practice) playIntro();
}

let intro = null;

function playIntro() {
  intro = { home: { camera: game.camera, ship: game.ship }, cutscene: null, startedAt: 0, caption: null, planet: null };
  introFrame.classList.remove('fh-revealed');
  introText.textContent = '';
  introFrame.hidden = false;
}

function startCutscene(now) {
  const alphaCentauri = nearby.find((star) => star.name === 'Alpha Centauri').position;
  const distance = Math.hypot(...subtract(SUN_POSITION, intro.home.camera)) * LY_PER_PC;
  intro.cutscene = createCutscene({
    home: intro.home,
    alphaCentauri,
    odometer: formatLightYears(Math.round(distance / 1000) * 1000),
    energy: formatLightYears(game.energy),
  });
  intro.startedAt = now;
}

function advanceIntro(now) {
  if (!nearby.length) return;
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
  introFrame.classList.toggle('fh-revealed', !caption.black);
  introText.textContent = caption.text;
  introText.classList.remove('fh-fade');
  void introText.offsetWidth;
  introText.classList.add('fh-fade');
}

function endIntro() {
  if (!intro) return;
  game.camera = intro.home.camera;
  game.ship = intro.home.ship;
  game.head = { yaw: 0, pitch: 0 };
  intro = null;
  eyeStars = null;
  aimView();
  introFrame.hidden = true;
  view.focus();
}

const labelsShown = () => game.practice && labelsToggle.checked;

function setMode(practice) {
  game.practice = practice;
  if (practice) {
    endIntro();
    game.practiceUsed = true;
    ending.hidden = true;
  }
  modeSelect.value = practice ? 'practice' : 'mission';
  labelsField.hidden = !practice;
  clockLabel.textContent = practice ? 'Practice' : 'Mission clock';
  giveUpButton.textContent = practice ? 'Face the Sun' : 'Give up';
  const url = new URL(window.location.href);
  url.searchParams.set('seed', game.seed);
  if (practice) url.searchParams.set('mode', 'practice');
  else url.searchParams.delete('mode');
  window.history.replaceState(null, '', url);
  clearGuides();
  if (photo) developPhoto();
  if (practice) showStatus(labelsShown() ? 'Practice: labels on. Click any star to identify it.' : 'Practice: labels hidden. Click a star to check whether it is the Sun.', 6);
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
  return `${(lightYears * AU_PER_LY).toFixed(0)} AU`;
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

function faceDirection(direction) {
  game.ship = orthonormal(direction, game.ship.up);
  game.head = { yaw: 0, pitch: 0 };
  aimView();
}

function turnHead(yaw, pitch) {
  const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
  game.head = { yaw: clamp(game.head.yaw + yaw, SHIP.headYawLimit), pitch: clamp(game.head.pitch + pitch, SHIP.headPitchLimit) };
  aimView();
}

let jumping = false;

function jump() {
  if (intro || photo?.running || jumping || (game.over && !game.practice)) return;
  const lightYears = Number(jumpInput.value);
  if (!(lightYears > 0)) return;
  if (!game.practice && lightYears > game.energy) {
    showStatus(`Not enough energy: ${formatLightYears(game.energy)} of jumping left.`);
    return;
  }
  jumping = true;
  warpVeil.hidden = false;
  setTimeout(() => land(lightYears), SHIP.jumpRealSeconds * 1000);
}

function land(lightYears) {
  const miss = (SHIP.jumpScatter * lightYears) / LY_PER_PC;
  const scatter = normalize([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]).map((value) => value * miss * Math.cbrt(Math.random()));
  game.camera = add(add(game.camera, scale(game.ship.forward, lightYears / LY_PER_PC)), scatter);
  if (!game.practice && !game.over) {
    game.energy -= lightYears;
    game.clock += SHIP.jumpClockSeconds;
  }
  game.jumps += 1;
  eyeStars = null;
  jumping = false;
  warpVeil.hidden = true;
  viewChanged();
  showStatus(`Dropped out of warp after ${formatLightYears(lightYears)}.`);
}

function flightStep(seconds) {
  if (intro || photo?.running || jumping) return;
  const move = [
    (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
    (held.has('KeyR') ? 1 : 0) - (held.has('KeyF') ? 1 : 0),
    (held.has('KeyW') || held.has('thrust+') ? 1 : 0) - (held.has('KeyS') || held.has('thrust-') ? 1 : 0),
  ];
  let moved = false;
  if (move.some(Boolean)) {
    const pcPerSecond = game.speed / LY_PER_PC;
    const step = add(add(scale(game.ship.right, move[0]), scale(game.ship.up, move[1])), scale(game.ship.forward, move[2]));
    game.camera = add(game.camera, scale(step, pcPerSecond * seconds));
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

let skyStale = true;
let skySharp = false;
function viewChanged() {
  skyStale = true;
  skySharp = false;
  if (photo && !photo.running) closePhoto();
}

function nextSkyResolution() {
  if (skyStale) {
    skyStale = false;
    return SKY_RESOLUTION_MOVING;
  }
  if (!skySharp) {
    skySharp = true;
    return SKY_RESOLUTION_STILL;
  }
  return 0;
}

function refreshEyeStars(now) {
  if (!nearby.length) return;
  const drift = eyeAnchor ? Math.hypot(...subtract(game.camera, eyeAnchor)) : Infinity;
  if (eyeStars && (drift < REGATHER_DISTANCE || now - eyeGatheredAt < REGATHER_INTERVAL)) return;
  eyeAnchor = [...game.camera];
  eyeStars = gatherStars({ camera: eyeAnchor, limit: EYE_LIMIT, budget: EYE_BUDGET, armMap, nebulae, nearby });
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
  if (!intro && !game.over && !game.practice && !photo?.running && !jumping && document.visibilityState === 'visible') game.clock += seconds;
  if (intro) advanceIntro(now);
  flightStep(seconds);
  refreshEyeStars(now);
  if (eyeStars) {
    frameSeed = (frameSeed + 1) >>> 0;
    renderer.renderEye({
      view: eyeView(),
      nebulae,
      stars: eyeStars,
      starsChanged: eyeStarsChanged,
      seed: frameSeed,
      skyResolution: nextSkyResolution(),
      cockpit: { ...cockpitUniforms(game.ship), enabled: true },
      planet: intro?.planet ?? null,
    });
    eyeStarsChanged = false;
  }
  if (labelsShown()) refreshGuides();
  $('[data-clock]').textContent = game.practice ? '' : formatClock(game.clock);
  $('[data-speed]').textContent = formatSpeed(game.speed);
  $('[data-energy]').textContent = game.practice ? 'unlimited' : formatLightYears(Math.max(0, game.energy));
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
  if (photo || !atlasFrame.hidden) return;
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
  if (intro || (game.over && !game.practice) || !eyeStars) return;
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
  if (!game.practice && !game.over) game.clock += CAMERA.frameSeconds;
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
  if (game.over && !game.practice) return;
  if (!star) {
    showStatus('No star there.');
    return;
  }
  if (labelsShown()) {
    showStatus(describeStar(star), 8);
    return;
  }
  if (game.practice) {
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
  game.over = true;
  const distance = Math.hypot(...subtract(SUN_POSITION, game.camera)) * LY_PER_PC;
  if (!found) faceDirection(subtract(SUN_POSITION, game.camera));
  $('[data-ending-title]').textContent = found ? 'Home found' : 'Lost in space';
  $('[data-ending-text]').textContent = found
    ? `You found the Sun from ${formatLightYears(distance)} away in ${formatClock(game.clock)}, with ${count(game.jumps, 'jump')}, ${count(game.exposures, 'exposure')} and ${count(game.wrongClaims, 'wrong claim')}.`
    : `The Sun was ${formatLightYears(distance)} away, at the centre of your view now.`;
  if (game.practiceUsed) $('[data-ending-text]').textContent += ' Practice mode was used during this mission.';
  ending.hidden = false;
}

let drag = null;
view.addEventListener('pointerdown', (event) => {
  if (photo?.running || jumping) return;
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
  if (drag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < TAP_DISTANCE) claimInView(event.clientX, event.clientY);
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
  game.speed = Math.min(SPEED_RANGE[1], Math.max(SPEED_RANGE[0], game.speed * factor));
}

const FLIGHT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
window.addEventListener('keydown', (event) => {
  if (event.target.closest?.('select, input, textarea')) return;
  if (intro) {
    event.preventDefault();
    endIntro();
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
  else if (event.code === 'KeyL' && game.practice) setLabels(!labelsToggle.checked);
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
$('[data-atlas-close]').addEventListener('click', () => (atlasFrame.hidden = true));
$('[data-atlas-open]').addEventListener('click', toggleAtlas);
exposeButton.addEventListener('click', toggleExposure);
stretchInput.addEventListener('input', () => photo && developPhoto());
giveUpButton.addEventListener('click', () => {
  if (game.over) return;
  endIntro();
  if (!game.practice) {
    finish(false);
    return;
  }
  faceDirection(subtract(SUN_POSITION, game.camera));
});
$('[data-jump]').addEventListener('click', jump);
$('[data-align]').addEventListener('click', () => faceDirection(game.basis.forward));
modeSelect.addEventListener('change', () => setMode(modeSelect.value === 'practice'));
labelsToggle.addEventListener('change', () => setLabels(labelsToggle.checked));
$('[data-restart]').addEventListener('click', () => newGame());
$('[data-new-game]').addEventListener('click', () => newGame());
new ResizeObserver(resize).observe(stage);

if (!renderer) {
  showStatus(rendererProblem, 3600);
} else {
  const requested = Number(new URL(window.location.href).searchParams.get('seed'));
  const practice = new URL(window.location.href).searchParams.get('mode') === 'practice';
  newGame(Number.isInteger(requested) && requested > 0 ? requested : randomSeed(), practice);
  resize();
  loadNearbyStars('data/nearby-stars.bin', 'data/nearby-star-names.json').then((stars) => {
    nearby = stars;
  });
  requestAnimationFrame(frame);
}
