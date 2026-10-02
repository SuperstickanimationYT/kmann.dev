import { ANA, createGame, respawn, RIGHT, stepPhysics, turn, UP, Y } from './world.js';
import { chaseCamera } from './projection.js';
import { createRenderer4D } from './render4d.js';
import { draw3D } from './render3d.js';
import { dot, sub } from './vec.js';

const PHYSICS_STEP_S = 1 / 120;
const MAX_FRAME_S = 0.1;
const AXIS_NAMES = ['x', 'y', 'z', 'w'];
const CAPTURED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
const SHORTCUTS = {
  p: 'outside',
  1: 'wobble',
  2: 'color',
  3: 'brightness',
  4: 'autoContrast',
  5: 'width',
  6: 'frame',
  7: 'labels',
  8: 'floor',
  9: 'dropLine',
  g: 'shadows',
  f: 'fly',
  r: 'reveal',
};

const settings = {
  outside: false,
  wobble: false,
  color: true,
  brightness: true,
  autoContrast: true,
  width: true,
  frame: true,
  labels: true,
  floor: true,
  dropLine: true,
  shadows: true,
  fly: false,
  reveal: false,
};

const canvas = document.querySelector('[data-stage]');
const ctx = canvas.getContext('2d');
const statusOutput = document.querySelector('[data-status]');
const revealOutput = document.querySelector('[data-reveal]');
const respawnButton = document.querySelector('[data-respawn]');
const settingInputs = [...document.querySelectorAll('[data-setting]')];
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const dimensionOnly = [...document.querySelectorAll('[data-dimension]')];

const view = { width: 0, height: 0 };
const renderer4D = createRenderer4D();
const held = new Set();
let game = createGame(4);

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  view.width = bounds.width;
  view.height = bounds.height;
  canvas.width = Math.round(view.width * ratio);
  canvas.height = Math.round(view.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function setDimension(n) {
  game = createGame(n);
  renderer4D.reset();
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.mode) === n)));
  dimensionOnly.forEach(element => { element.hidden = Number(element.dataset.dimension) !== n; });
}

const inputFor = name => settingInputs.find(input => input.dataset.setting === name);

function setSetting(name, value) {
  settings[name] = value;
  inputFor(name).checked = value;
}

const axisInput = (plus, minus) => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0);

function readInput() {
  return {
    forward: axisInput('KeyW', 'KeyS'),
    right: axisInput('KeyD', 'KeyA'),
    ana: axisInput('KeyE', 'KeyQ'),
    vertical: axisInput('Space', 'KeyC'),
    jump: held.has('Space'),
    turnRight: axisInput('ArrowRight', 'ArrowLeft'),
    turnAna: axisInput('ArrowUp', 'ArrowDown'),
    spin: axisInput('KeyX', 'KeyZ'),
  };
}

const signed = v => (v >= 0 ? ' ' : '') + v.toFixed(2);
const directionText = e => e
  .map((v, axis) => (Math.abs(v) > 0.05 ? `${v >= 0 ? '+' : '-'}${Math.abs(v).toFixed(2)}${AXIS_NAMES[axis]}` : ''))
  .filter(Boolean)
  .join(' ');

function playerState() {
  if (settings.fly) return 'flying';
  return game.player.grounded ? 'on the ground' : 'in the air';
}

function renderStatus(lineCount) {
  const { world, player } = game;
  const P = player.basis;
  const landed = [...game.landedOn].sort((a, b) => a - b).join(' ') || 'none yet';
  const lines = [
    `position  ${player.feet.map((v, axis) => `${AXIS_NAMES[axis]}${signed(v)}`).join(' ')}`,
    `forward   ${directionText(P[world.forward])}`,
    `right     ${directionText(P[RIGHT])}`,
  ];
  if (world.hasAna) lines.push(`ana       ${directionText(P[ANA])}`);
  lines.push(
    `state     ${playerState()}`,
    `landed on ${landed} (${game.landedOn.size}/${world.platforms.length})`,
    `falls     ${game.falls}`,
    `lines     ${lineCount}`,
  );
  statusOutput.textContent = lines.join('\n');
}

function renderReveal() {
  revealOutput.hidden = !settings.reveal;
  if (!settings.reveal) return;
  const { world, player } = game;
  const P = player.basis;
  const columns = world.hasAna
    ? [[RIGHT, 'right'], [UP, 'up'], [ANA, 'ana'], [world.forward, 'fwd']]
    : [[RIGHT, 'right'], [UP, 'up'], [world.forward, 'fwd']];
  const rows = world.platforms.map(platform => {
    const top = [...platform.center];
    top[Y] = platform.max[Y];
    const offset = sub(top, player.feet);
    return `${platform.label.padStart(2)} ${columns.map(([i]) => signed(dot(offset, P[i])).padStart(6)).join(' ')}`;
  });
  const header = ` # ${columns.map(([, name]) => name.padStart(6)).join(' ')}`;
  revealOutput.textContent = [header, ...rows].join('\n');
}

function drawScene(timeS) {
  ctx.clearRect(0, 0, view.width, view.height);
  const camera = chaseCamera(game);
  return game.world.n === 4
    ? renderer4D.draw(ctx, view, game, camera, settings, timeS)
    : draw3D(ctx, view, game, camera, settings);
}

settingInputs.forEach(input => {
  input.checked = settings[input.dataset.setting];
  input.addEventListener('change', () => {
    settings[input.dataset.setting] = input.checked;
    input.blur();
  });
});

modeButtons.forEach(button => button.addEventListener('click', () => {
  setDimension(Number(button.dataset.mode));
  button.blur();
}));

respawnButton.addEventListener('click', () => {
  respawn(game);
  respawnButton.blur();
});

window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (CAPTURED_KEYS.includes(event.code)) event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'm') {
    setDimension(game.world.n === 4 ? 3 : 4);
    return;
  }
  if (key === 'h') {
    respawn(game);
    return;
  }
  const name = SHORTCUTS[key];
  if (name && !inputFor(name).closest('[hidden]')) setSetting(name, !settings[name]);
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());

new ResizeObserver(resize).observe(canvas);
resize();
setDimension(4);

let lastTimeMs = performance.now();
let physicsBacklogS = 0;

function tick(nowMs) {
  const dt = Math.min(MAX_FRAME_S, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  const input = readInput();
  turn(game, input, dt);
  physicsBacklogS += dt;
  while (physicsBacklogS >= PHYSICS_STEP_S) {
    stepPhysics(game, input, PHYSICS_STEP_S, settings.fly);
    physicsBacklogS -= PHYSICS_STEP_S;
  }
  renderStatus(drawScene(nowMs / 1000));
  renderReveal();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
