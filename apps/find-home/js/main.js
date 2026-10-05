import { drawAtlas } from './atlas.js';
import { GALAXIES, placeGalaxies } from './galaxies.js';
import { buildArmMap, DEGREES, LY_PER_PC, SUN_POSITION } from './milky-way.js';
import { NEBULAE } from './nebulae.js';
import { WHITE_BALANCE } from './population.js';
import { createRandom, randomSeed } from './random.js';
import { createRenderer } from './renderer.js';
import { gatherStars, KIND, loadNearbyStars, placeNebulae } from './stars.js';

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
const SPEED_RANGE = [0.001, 2e6];
const START_DISTANCE_KLY = [130, 220];
const START_LATITUDE = [15, 70];
const START_CLEARANCE = 15000;

const SENSOR = { width: 1024, height: 768, electronsPerNanomaggy: 3.9, readNoise: 4, dark: 0.002, fullWell: 90000, psfArcsec: 0.058 };
const SCOPE_BUDGET = (SENSOR.width * SENSOR.height) / 40;
const SCOPE_DEPTH_SECONDS = 600;
const SATURATED_BLACK_SHARE = 0.5;
const SIGNAL_REFERENCE_PIXEL_ARCSEC = 3.5;
const ELECTRONS_PER_UNIT_AT_REFERENCE = 1000;
const WRONG_CLAIM_SECONDS = 3600;
const PICK_RADIUS_PX = 10;
const TAP_DISTANCE = 6;
const AU_PER_LY = 63241;

const $ = (selector) => document.querySelector(selector);
const view = $('[data-view]');
const stage = $('[data-stage]');
const scopeFrame = $('[data-scope-frame]');
const scopeCanvas = $('[data-scope]');
const scopeCaption = $('[data-scope-caption]');
const atlasFrame = $('[data-atlas-frame]');
const reticle = $('[data-reticle]');
const status = $('[data-status]');
const ending = $('[data-ending]');
const fieldSelect = $('[data-field]');
const exposureSelect = $('[data-exposure]');
const stretchInput = $('[data-stretch]');
const stackButton = $('[data-stack]');

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

const add = (a, b) => a.map((value, i) => value + b[i]);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const scale = (a, factor) => a.map((value) => value * factor);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => scale(a, 1 / Math.hypot(...a));

function rotateAbout(vector, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(vector, cos), scale(cross(axis, vector), sin)), scale(axis, dot(axis, vector) * (1 - cos)));
}

function orthonormal(forward, upHint) {
  const f = normalize(forward);
  const right = normalize(cross(f, upHint));
  return { forward: f, right, up: cross(right, f) };
}

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
let scope = null;
let statusTimer = 0;
let frameSeed = 1;

function startingPoint(random) {
  const distance = (random.between(...START_DISTANCE_KLY) * 1000) / LY_PER_PC;
  const latitude = random.between(...START_LATITUDE) * DEGREES * (random.next() < 0.5 ? -1 : 1);
  const azimuth = random.between(0, 2 * Math.PI);
  return [distance * Math.cos(latitude) * Math.sin(azimuth), distance * Math.cos(latitude) * Math.cos(azimuth), distance * Math.sin(latitude)];
}

function newGame(seed = randomSeed()) {
  const random = createRandom(seed);
  let camera = startingPoint(random);
  while (galaxies.some((galaxy) => Math.hypot(...subtract(galaxy.centre, camera)) < START_CLEARANCE)) camera = startingPoint(random);
  game = {
    seed,
    camera,
    basis: orthonormal(scale(camera, -1), [0, 0, 1]),
    speed: 1000,
    clock: 0,
    wrongClaims: 0,
    exposures: 0,
    over: false,
  };
  eyeStars = null;
  scope = null;
  skyStale = true;
  scopeFrame.hidden = true;
  ending.hidden = true;
  stackButton.disabled = true;
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
  showStatus('Somewhere out there is home.');
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
  placeReticle();
}

function eyeTanHalf() {
  const tanY = Math.tan(EYE_FIELD_HEIGHT / 2);
  return [tanY * (view.width / view.height), tanY];
}

function placeReticle() {
  const fieldArcsec = Number(fieldSelect.value);
  const tanX = Math.tan((fieldArcsec / 3600) * DEGREES * 0.5);
  const [eyeX] = eyeTanHalf();
  const width = Math.max(6, (tanX / eyeX) * stage.clientWidth);
  reticle.style.width = `${width}px`;
  reticle.style.height = `${width * (SENSOR.height / SENSOR.width)}px`;
  reticle.hidden = false;
}

const held = new Set();

function flightStep(seconds) {
  const move = [
    (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0),
    (held.has('KeyR') ? 1 : 0) - (held.has('KeyF') ? 1 : 0),
    (held.has('KeyW') || held.has('thrust+') ? 1 : 0) - (held.has('KeyS') || held.has('thrust-') ? 1 : 0),
  ];
  let moved = false;
  if (move.some(Boolean)) {
    const pcPerSecond = game.speed / LY_PER_PC;
    const step = add(add(scale(game.basis.right, move[0]), scale(game.basis.up, move[1])), scale(game.basis.forward, move[2]));
    game.camera = add(game.camera, scale(step, pcPerSecond * seconds));
    moved = true;
  }
  const yaw = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  const pitch = (held.has('ArrowUp') ? 1 : 0) - (held.has('ArrowDown') ? 1 : 0);
  const roll = (held.has('KeyE') ? 1 : 0) - (held.has('KeyQ') ? 1 : 0);
  if (yaw) game.basis = turn(game.basis, 'up', -yaw * LOOK_RATE * seconds);
  if (pitch) game.basis = turn(game.basis, 'right', pitch * LOOK_RATE * seconds);
  if (roll) game.basis = turn(game.basis, 'forward', roll * ROLL_RATE * seconds);
  if (moved || yaw || pitch || roll) viewChanged();
}

let skyStale = true;
let skySharp = false;
function viewChanged() {
  skyStale = true;
  skySharp = false;
  markScopeStale();
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

function markScopeStale() {
  if (scope && !scope.stale) {
    scope.stale = true;
    stackButton.disabled = true;
  }
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
  if (!game.over && document.visibilityState === 'visible') game.clock += seconds;
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
    });
    eyeStarsChanged = false;
  }
  $('[data-clock]').textContent = formatClock(game.clock);
  $('[data-speed]').textContent = formatSpeed(game.speed);
  requestAnimationFrame(frame);
}

function percentile(sorted, share) {
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

function measureSignal(bands) {
  return bands.map((values) => {
    values.sort();
    return { median: percentile(values, 0.5), bright: percentile(values, 0.9995) };
  });
}

const DETECTION_ELECTRONS = 25;
const detectionLimit = (seconds) => 22.5 + 2.5 * Math.log10((SENSOR.electronsPerNanomaggy * seconds) / DETECTION_ELECTRONS);

function projectScopeStars(stars, basis, tanHalf) {
  const positions = new Float32Array(stars.count * 2);
  for (let i = 0; i < stars.count; i++) {
    const offset = stars.precise.slice(i * 6, i * 6 + 3);
    const depth = dot(offset, basis.forward);
    const x = dot(offset, basis.right) / depth / tanHalf[0];
    const y = dot(offset, basis.up) / depth / tanHalf[1];
    positions[i * 2] = (x * 0.5 + 0.5) * SENSOR.width;
    positions[i * 2 + 1] = (0.5 - y * 0.5) * SENSOR.height;
  }
  return positions;
}

function expose() {
  if (game.over || !nearby.length) return;
  showStatus('Exposing…');
  setTimeout(exposeNow, 30);
}

function exposeNow() {
  const fieldArcsec = Number(fieldSelect.value);
  const seconds = Number(exposureSelect.value);
  const tanX = Math.tan((fieldArcsec / 3600) * DEGREES * 0.5);
  const tanHalf = [tanX, tanX * (SENSOR.height / SENSOR.width)];
  const pixelArcsec = fieldArcsec / SENSOR.width;
  const electronsPerUnit = ELECTRONS_PER_UNIT_AT_REFERENCE * (pixelArcsec / SIGNAL_REFERENCE_PIXEL_ARCSEC) ** 2;
  const limit = detectionLimit(Math.max(seconds * 4, SCOPE_DEPTH_SECONDS));
  const basis = { ...game.basis };
  const camera = [...game.camera];
  const stars = gatherStars({ camera, axis: basis.forward, tanHalf: Math.hypot(...tanHalf), limit, budget: SCOPE_BUDGET, armMap, nebulae, nearby });
  const samples = renderer.exposeScope({
    view: { camera, basis, tanHalf, pixelAngle: (pixelArcsec / 206264.8) },
    nebulae,
    stars,
    width: SENSOR.width,
    height: SENSOR.height,
    electronsPerNanomaggy: SENSOR.electronsPerNanomaggy,
    electronsPerUnit,
    psfPixels: Math.max(0.55, SENSOR.psfArcsec / pixelArcsec),
  });
  scope = {
    stars,
    positions: projectScopeStars(stars, basis, tanHalf),
    psfPixels: Math.max(0.55, SENSOR.psfArcsec / pixelArcsec),
    signal: measureSignal(samples),
    electronsPerUnit,
    seconds: 0,
    frames: 0,
    exposure: seconds,
    fieldArcsec,
    stale: false,
  };
  stack();
}

function stack() {
  if (!scope || scope.stale || game.over) return;
  scope.seconds += scope.exposure;
  scope.frames += 1;
  game.clock += scope.exposure;
  game.exposures += 1;
  develop();
  scopeFrame.hidden = false;
  atlasFrame.hidden = true;
  stackButton.disabled = false;
  const skyPerFrame = scope.signal[1].median * scope.electronsPerUnit * scope.exposure;
  if (skyPerFrame > SATURATED_BLACK_SHARE * SENSOR.fullWell) showStatus('The sky alone filled the pixels. Take shorter exposures and stack them.', 6);
  else hideStatus();
}

function develop() {
  const { seconds, frames, signal, electronsPerUnit } = scope;
  const noiseOf = (electrons) => Math.sqrt(electrons + SENSOR.dark * seconds + frames * SENSOR.readNoise ** 2);
  const visual = signal[1];
  const skyV = visual.median * electronsPerUnit * seconds;
  const span = Math.max(200 * noiseOf(skyV), (visual.bright - visual.median) * electronsPerUnit * seconds);
  const saturation = SENSOR.fullWell * frames;
  const black = signal.map(({ median }) => {
    const sky = median * electronsPerUnit * seconds;
    return Math.min(sky - 1.5 * noiseOf(sky), SATURATED_BLACK_SHARE * saturation);
  });
  const white = black.map((low, band) => Math.min(low + span * (WHITE_BALANCE[band] / WHITE_BALANCE[1]), saturation));
  const pixels = renderer.developScope({
    electronsPerUnit,
    seconds,
    frames,
    seed: (game.seed * 7919 + scope.frames * 104729 + game.exposures) >>> 0,
    black,
    white,
    stretch: Number(stretchInput.value),
    readNoise: SENSOR.readNoise,
    dark: SENSOR.dark,
    fullWell: SENSOR.fullWell,
  });
  const image = new ImageData(SENSOR.width, SENSOR.height);
  const rowBytes = SENSOR.width * 4;
  for (let row = 0; row < SENSOR.height; row++) {
    image.data.set(pixels.subarray((SENSOR.height - 1 - row) * rowBytes, (SENSOR.height - row) * rowBytes), row * rowBytes);
  }
  scopeCanvas.width = SENSOR.width;
  scopeCanvas.height = SENSOR.height;
  scopeCanvas.getContext('2d').putImageData(image, 0, 0);
  const field = scope.fieldArcsec >= 3600 ? `${scope.fieldArcsec / 3600}°` : `${scope.fieldArcsec / 60}′`;
  scopeCaption.textContent = `${field} field, ${frames} × ${formatClock(scope.exposure)} = ${formatClock(seconds)} total. Click a star to claim it is the Sun.`;
  $('[data-stretch-value]').textContent = stretchInput.value;
}

function claim(star) {
  if (game.over) return;
  if (!star) {
    showStatus('No star there.');
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

function claimInScope(event) {
  if (!scope) return;
  const box = scopeCanvas.getBoundingClientRect();
  const shown = Math.min(box.width / SENSOR.width, box.height / SENSOR.height);
  const x = (event.clientX - box.left - (box.width - SENSOR.width * shown) / 2) / shown;
  const y = (event.clientY - box.top - (box.height - SENSOR.height * shown) / 2) / shown;
  const radius = Math.max(4, 3 * scope.psfPixels, PICK_RADIUS_PX / shown);
  const faintest = detectionLimit(scope.seconds);
  let nearest = null;
  for (let i = 0; i < scope.stars.count; i++) {
    const dx = scope.positions[i * 2] - x;
    const dy = scope.positions[i * 2 + 1] - y;
    const offset2 = dx * dx + dy * dy;
    if (offset2 > radius * radius || (nearest && offset2 >= nearest.offset2)) continue;
    const values = scope.stars.precise;
    if (values[i * 6 + 3] + 5 * Math.log10(values[i * 6 + 5] / 10) > faintest) continue;
    nearest = { kind: scope.stars.kinds[i], offset2 };
  }
  claim(nearest);
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
    if (eyeStars.precise[i * 6 + 3] + 5 * Math.log10(distance / 10) > EYE_LIMIT) continue;
    const x = box.left + ((dot(offset, game.basis.right) / depth / tanX) * 0.5 + 0.5) * box.width;
    const y = box.top + (0.5 - (dot(offset, game.basis.up) / depth / tanY) * 0.5) * box.height;
    const miss = Math.hypot(x - clientX, y - clientY);
    if (miss <= PICK_RADIUS_PX && (!nearest || miss < nearest.miss)) nearest = { kind: eyeStars.kinds[i], miss };
  }
  claim(nearest);
}

function finish(found) {
  game.over = true;
  const distance = Math.hypot(...subtract(SUN_POSITION, game.camera)) * LY_PER_PC;
  if (!found) {
    game.basis = orthonormal(subtract(SUN_POSITION, game.camera), game.basis.up);
    viewChanged();
  }
  $('[data-ending-title]').textContent = found ? 'Home found' : 'Lost in space';
  $('[data-ending-text]').textContent = found
    ? `You found the Sun from ${formatLightYears(distance)} away in ${formatClock(game.clock)}, with ${count(game.exposures, 'exposure')} and ${count(game.wrongClaims, 'wrong claim')}.`
    : `The Sun was ${formatLightYears(distance)} away, at the centre of your view now.`;
  ending.hidden = false;
}

let drag = null;
view.addEventListener('pointerdown', (event) => {
  view.focus();
  view.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY };
});
view.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const perPixel = EYE_FIELD_HEIGHT / stage.clientHeight;
  game.basis = turn(game.basis, 'up', (event.clientX - drag.x) * perPixel);
  game.basis = turn(game.basis, 'right', (event.clientY - drag.y) * perPixel);
  drag.x = event.clientX;
  drag.y = event.clientY;
  viewChanged();
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
  if (FLIGHT_KEYS.has(event.code)) {
    held.add(event.code);
    event.preventDefault();
  } else if (event.code === 'KeyZ') changeSpeed(0.5);
  else if (event.code === 'KeyX') changeSpeed(2);
  else if (event.code === 'KeyT') expose();
  else if (event.code === 'KeyM') toggleAtlas();
  else if (event.code === 'Escape') {
    scopeFrame.hidden = true;
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
  if (!atlasFrame.hidden) scopeFrame.hidden = true;
}

scopeCanvas.addEventListener('click', claimInScope);
$('[data-scope-close]').addEventListener('click', () => (scopeFrame.hidden = true));
$('[data-atlas-close]').addEventListener('click', () => (atlasFrame.hidden = true));
$('[data-atlas-open]').addEventListener('click', toggleAtlas);
$('[data-expose]').addEventListener('click', expose);
stackButton.addEventListener('click', stack);
stretchInput.addEventListener('input', () => scope && develop());
fieldSelect.addEventListener('change', placeReticle);
$('[data-give-up]').addEventListener('click', () => !game.over && finish(false));
$('[data-restart]').addEventListener('click', () => newGame());
$('[data-new-game]').addEventListener('click', () => newGame());
new ResizeObserver(resize).observe(stage);

if (!renderer) {
  showStatus(rendererProblem, 3600);
} else {
  const requested = Number(new URL(window.location.href).searchParams.get('seed'));
  newGame(Number.isInteger(requested) && requested > 0 ? requested : randomSeed());
  resize();
  loadNearbyStars('data/nearby-stars.bin', 'data/nearby-star-names.json').then((stars) => {
    nearby = stars;
  });
  requestAnimationFrame(frame);
}
