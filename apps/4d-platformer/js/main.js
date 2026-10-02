import { ANA, createGame, respawn, RIGHT, stepPhysics, turn, UP, Y } from './world.js';
import { chaseCamera } from './projection.js';
import { createRenderer4D } from './render4d.js';
import { draw3D } from './render3d.js';
import { FREE_PLAY, LEVELS } from './levels.js';
import { dot, sub } from './vec.js';

const PHYSICS_STEP_S = 1 / 120;
const MAX_FRAME_S = 0.1;
const PROGRESS_KEY = '4d-platformer-levels-done';
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
const FREE_PLAY_GUIDES = {
  4: ['Free play in four dimensions. There is no goal: land on as many of the 10 platforms as you can.'],
  3: ['Free play in 3D: the same platforms with the fourth direction removed. Turn on the outside view to see your camera inside the world.'],
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
const levelList = document.querySelector('[data-levels]');
const freePlayButtons = [...document.querySelectorAll('[data-free]')];
const guideTitle = document.querySelector('[data-guide-title]');
const guideBody = document.querySelector('[data-guide-body]');
const banner = document.querySelector('[data-banner]');
const completeCard = document.querySelector('[data-complete]');
const completeTitle = document.querySelector('[data-complete-title]');
const nextButton = document.querySelector('[data-next]');
const replayButton = document.querySelector('[data-replay]');
const settingInputs = [...document.querySelectorAll('[data-setting]')];
const dimensionOnly = [...document.querySelectorAll('[data-dimension]')];

const view = { width: 0, height: 0 };
const renderer4D = createRenderer4D();
const held = new Set();
let levelsDone = loadProgress();
let stage = { kind: 'level', index: Math.min(levelsDone, LEVELS.length - 1) };
let game;

function loadProgress() {
  try {
    return Math.min(LEVELS.length, Number(localStorage.getItem(PROGRESS_KEY)) || 0);
  } catch {
    return 0;
  }
}

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, String(levelsDone));
  } catch {}
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const bounds = canvas.getBoundingClientRect();
  view.width = bounds.width;
  view.height = bounds.height;
  canvas.width = Math.round(view.width * ratio);
  canvas.height = Math.round(view.height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

const isLevel = () => stage.kind === 'level';
const currentLevel = () => LEVELS[stage.index];
const layoutFor = s => (s.kind === 'level' ? LEVELS[s.index].layout : FREE_PLAY[s.n]);

function stageName() {
  if (isLevel()) return `Level ${stage.index + 1} of ${LEVELS.length}: ${currentLevel().title}`;
  return `Free play, ${stage.n}D`;
}

function renderLevelButtons() {
  levelList.replaceChildren(...LEVELS.map((level, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(index + 1);
    button.title = index <= levelsDone ? level.title : `Finish level ${index} first`;
    button.disabled = index > levelsDone;
    button.setAttribute('aria-pressed', String(isLevel() && stage.index === index));
    if (index < levelsDone) button.classList.add('fd-done');
    button.addEventListener('click', () => {
      enterStage({ kind: 'level', index });
      button.blur();
    });
    return button;
  }));
  freePlayButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(!isLevel() && stage.n === Number(button.dataset.free)));
  });
}

function renderGuide() {
  guideTitle.textContent = stageName();
  const paragraphs = isLevel() ? currentLevel().guide : FREE_PLAY_GUIDES[stage.n];
  guideBody.replaceChildren(...paragraphs.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
  banner.textContent = isLevel() ? `${stageName()}. Land on the gold platform.` : stageName();
}

function enterStage(next) {
  stage = next;
  game = createGame(layoutFor(stage));
  renderer4D.reset();
  completeCard.hidden = true;
  dimensionOnly.forEach(element => { element.hidden = Number(element.dataset.dimension) !== game.world.n; });
  renderLevelButtons();
  renderGuide();
}

function showLevelComplete() {
  levelsDone = Math.max(levelsDone, stage.index + 1);
  saveProgress();
  renderLevelButtons();
  const following = LEVELS[stage.index + 1];
  completeTitle.textContent = `Level ${stage.index + 1} done`;
  nextButton.textContent = following ? `Next: ${following.title}` : 'Free play';
  completeCard.hidden = false;
}

function goToNext() {
  const nextIndex = stage.index + 1;
  enterStage(nextIndex < LEVELS.length ? { kind: 'level', index: nextIndex } : { kind: 'free', n: 4 });
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

function progressLine() {
  if (game.world.hasGoal) return `goal      ${game.reachedGoal ? 'reached' : 'not yet'}`;
  const landed = [...game.landedOn].sort((a, b) => a - b).join(' ') || 'none yet';
  return `landed on ${landed} (${game.landedOn.size}/${game.world.platforms.length})`;
}

function renderStatus(lineCount) {
  const { world, player } = game;
  const P = player.basis;
  const lines = [
    `position  ${player.feet.map((v, axis) => `${AXIS_NAMES[axis]}${signed(v)}`).join(' ')}`,
    `forward   ${directionText(P[world.forward])}`,
    `right     ${directionText(P[RIGHT])}`,
  ];
  if (world.hasAna) lines.push(`ana       ${directionText(P[ANA])}`);
  lines.push(
    `state     ${playerState()}`,
    progressLine(),
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
    return `${platform.label.padStart(4)} ${columns.map(([i]) => signed(dot(offset, P[i])).padStart(6)).join(' ')}`;
  });
  const header = `   # ${columns.map(([, name]) => name.padStart(6)).join(' ')}`;
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

freePlayButtons.forEach(button => button.addEventListener('click', () => {
  enterStage({ kind: 'free', n: Number(button.dataset.free) });
  button.blur();
}));

respawnButton.addEventListener('click', () => {
  respawn(game);
  respawnButton.blur();
});

nextButton.addEventListener('click', () => {
  goToNext();
  nextButton.blur();
});

replayButton.addEventListener('click', () => {
  enterStage(stage);
  replayButton.blur();
});

window.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (CAPTURED_KEYS.includes(event.code)) event.preventDefault();
  held.add(event.code);
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  if (key === 'enter' && !completeCard.hidden) {
    goToNext();
    return;
  }
  if (key === 'm' && !isLevel()) {
    enterStage({ kind: 'free', n: stage.n === 4 ? 3 : 4 });
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
enterStage(stage);

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
  if (isLevel() && game.reachedGoal && completeCard.hidden) showLevelComplete();
  renderStatus(drawScene(nowMs / 1000));
  renderReveal();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
