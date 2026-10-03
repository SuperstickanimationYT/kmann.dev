import { ANA, createGame, respawn, RIGHT, squareUp, stepPhysics, turn, turnBy, UP, Y } from './world.js';
import { chaseCamera } from './projection.js';
import { createRenderer4D } from './render4d.js';
import { draw3D, drawPicture, panelSlots } from './render3d.js';
import { FREE_PLAY, LEVELS } from './levels.js';
import { ROOM_4D } from './rooms.js';
import { MAZES } from './maze.js';
import { readSensors } from './sensors.js';
import { drawRaysInWorld, drawSensorBall } from './sensorview.js';
import { dot, sub } from './vec.js';
import { drawCaption } from './paint.js';

const PHYSICS_STEP_S = 1 / 120;
const MAX_FRAME_S = 0.1;
const PROGRESS_KEY = '4d-platformer-levels-done';
const AXIS_NAMES = ['x', 'y', 'z', 'w'];
const CAPTURED_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
const SNAP_TURN_SPEED = Math.PI * 2;
const SNAP_KEYS = {
  ArrowRight: ['right', 1],
  ArrowLeft: ['right', -1],
  ArrowUp: ['ana', 1],
  ArrowDown: ['ana', -1],
  KeyX: ['spin', 1],
  KeyZ: ['spin', -1],
};
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
  o: 'rays',
  v: 'projection',
};
const ROOM_GUIDE = [
  'A kitchen and a living room in four dimensions. You are flying (F to walk instead), and the dim outline is the walls of the room.',
  'You start in the kitchen. The living room is toward ana: hold E to drift into it, Q to come back. A 4D table has 8 legs, and the couch has 4 armrests because its seat has sides in the ana direction too.',
];
const MAZE_GUIDES = {
  3: [
    'Find the gold cube using only sensors. 14 rays leave your body: 6 straight (right, left, up, down, forward, back) and 8 diagonals. On the sensor ball each ray is a dot: bigger and brighter means a wall is closer, gold means the goal, a hollow ring means nothing in range.',
    'The left panel draws the same rays among the walls around you, from the same angle as the ball. W A S D fly, Space up, C down, arrow keys turn 90 degrees. Once the ball makes sense on its own, hide the rays with O.',
  ],
  4: [
    'The same sensor ball in a 4D maze, walking on a floor. Its vertical axis now means ana and kata instead of up and down; everything else reads the same as in 3D.',
    'Q and E step kata and ana. Arrow keys turn 90 degrees: left and right as before, up and down toward ana and kata; Z and X spin right into ana. V shows the usual 4D picture beside the ball.',
  ],
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
  rays: true,
  projection: false,
};

const canvas = document.querySelector('[data-stage]');
const ctx = canvas.getContext('2d');
const statusOutput = document.querySelector('[data-status]');
const revealOutput = document.querySelector('[data-reveal]');
const respawnButton = document.querySelector('[data-respawn]');
const levelList = document.querySelector('[data-levels]');
const freePlayButtons = [...document.querySelectorAll('[data-free]')];
const roomButton = document.querySelector('[data-room]');
const mazeButtons = [...document.querySelectorAll('[data-maze-stage]')];
const mazeOnly = [...document.querySelectorAll('[data-maze]')];
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
let snap = null;

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
const isRoom = () => stage.kind === 'room';
const isMaze = () => stage.kind === 'maze';
const currentLevel = () => LEVELS[stage.index];
const LAYOUTS = { level: s => LEVELS[s.index].layout, free: s => FREE_PLAY[s.n], room: () => ROOM_4D, maze: s => MAZES[s.n] };
const layoutFor = s => LAYOUTS[s.kind](s);

function stageName() {
  if (isLevel()) return `Level ${stage.index + 1} of ${LEVELS.length}: ${currentLevel().title}`;
  if (isRoom()) return '4D room: kitchen and living room';
  if (isMaze()) return `${stage.n}D sensor maze`;
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
    button.setAttribute('aria-pressed', String(stage.kind === 'free' && stage.n === Number(button.dataset.free)));
  });
  roomButton.setAttribute('aria-pressed', String(isRoom()));
  mazeButtons.forEach(button => button.setAttribute('aria-pressed', String(isMaze() && stage.n === Number(button.dataset.mazeStage))));
}

function renderGuide() {
  guideTitle.textContent = stageName();
  const paragraphs = isLevel() ? currentLevel().guide : isRoom() ? ROOM_GUIDE : isMaze() ? MAZE_GUIDES[stage.n] : FREE_PLAY_GUIDES[stage.n];
  guideBody.replaceChildren(...paragraphs.map(text => {
    const p = document.createElement('p');
    p.textContent = text;
    return p;
  }));
  banner.textContent = isLevel() ? `${stageName()}. Land on the gold platform.` : isMaze() ? `${stageName()}. Find the gold cube.` : stageName();
}

let flyingBeforeForcedFlight = null;

function flyWhereLayoutFlies(wasForced) {
  const forced = game.world.flying;
  if (forced && !wasForced) flyingBeforeForcedFlight = settings.fly;
  if (forced) setSetting('fly', true);
  else if (wasForced) setSetting('fly', flyingBeforeForcedFlight);
}

function enterStage(next) {
  const wasForced = Boolean(game?.world.flying);
  stage = next;
  game = createGame(layoutFor(stage));
  renderer4D.reset();
  flyWhereLayoutFlies(wasForced);
  completeCard.hidden = true;
  dimensionOnly.forEach(element => { element.hidden = Number(element.dataset.dimension) !== game.world.n; });
  mazeOnly.forEach(element => { element.hidden = !isMaze() || (element.dataset.maze !== 'any' && Number(element.dataset.maze) !== stage.n); });
  snap = null;
  renderLevelButtons();
  renderGuide();
}

function showMazeSolved() {
  completeTitle.textContent = `${stage.n}D maze solved`;
  nextButton.textContent = stage.n === 3 ? 'Next: 4D sensor maze' : 'Free play 4D';
  completeCard.hidden = false;
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
  if (isMaze()) {
    enterStage(stage.n === 3 ? { kind: 'maze', n: 4 } : { kind: 'free', n: 4 });
    return;
  }
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

const landmarks = world => world.platforms.filter(platform => platform.marked);

function progressLine() {
  if (game.world.hasGoal) return `goal      ${game.reachedGoal ? 'reached' : 'not yet'}`;
  const landed = [...game.landedOn].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', ') || 'none yet';
  const names = new Set(landmarks(game.world).map(platform => platform.label));
  return `landed on ${landed} (${game.landedOn.size}/${names.size})`;
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
  const rows = landmarks(world).map(platform => {
    const top = [...platform.center];
    top[Y] = platform.max[Y];
    const offset = sub(top, player.feet);
    return `${platform.label.padStart(4)} ${columns.map(([i]) => signed(dot(offset, P[i])).padStart(6)).join(' ')}`;
  });
  const header = `   # ${columns.map(([, name]) => name.padStart(6)).join(' ')}`;
  revealOutput.textContent = [header, ...rows].join('\n');
}

function drawMaze(camera, timeS) {
  const sensing = readSensors(game);
  const panels = [];
  if (game.world.n === 3 && settings.rays) panels.push('rays');
  if (settings.projection) panels.push('projection');
  panels.push('sensors');
  const slots = panelSlots(view, panels.length);
  let lineCount = 0;
  panels.forEach((panel, i) => {
    const slot = slots[i];
    if (panel === 'rays') drawRaysInWorld(ctx, slot, game, sensing);
    if (panel === 'sensors') drawSensorBall(ctx, slot, sensing);
    if (panel !== 'projection') return;
    const square = { left: slot.cx - slot.half, top: slot.cy - slot.half, width: 2 * slot.half, height: 2 * slot.half };
    if (game.world.n === 3) {
      lineCount = drawPicture(ctx, slot, game, camera, settings);
      return;
    }
    lineCount = renderer4D.draw(ctx, square, game, camera, settings, timeS);
    drawCaption(ctx, 'the regular 4D picture', slot.cx, slot.cy - slot.half - 6);
  });
  return lineCount;
}

function drawScene(timeS) {
  ctx.clearRect(0, 0, view.width, view.height);
  const camera = chaseCamera(game);
  if (isMaze()) return drawMaze(camera, timeS);
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

mazeButtons.forEach(button => button.addEventListener('click', () => {
  enterStage({ kind: 'maze', n: Number(button.dataset.mazeStage) });
  button.blur();
}));

roomButton.addEventListener('click', () => {
  enterStage({ kind: 'room' });
  roomButton.blur();
});

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
  if (key === 'm' && stage.kind === 'free') {
    enterStage({ kind: 'free', n: stage.n === 4 ? 3 : 4 });
    return;
  }
  if (game.world.snapTurns && SNAP_KEYS[event.code]) {
    const [plane, sign] = SNAP_KEYS[event.code];
    if (!snap && (plane === 'right' || game.world.hasAna)) snap = { plane, sign, remaining: Math.PI / 2 };
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

function advanceSnap(dt) {
  if (!snap) return;
  const step = Math.min(snap.remaining, SNAP_TURN_SPEED * dt);
  turnBy(game, snap.plane, snap.sign * step);
  snap.remaining -= step;
  if (snap.remaining > 0) return;
  squareUp(game);
  snap = null;
}

let lastTimeMs = performance.now();
let physicsBacklogS = 0;

function tick(nowMs) {
  const dt = Math.min(MAX_FRAME_S, (nowMs - lastTimeMs) / 1000);
  lastTimeMs = nowMs;
  const input = readInput();
  if (game.world.snapTurns) advanceSnap(dt);
  else turn(game, input, dt);
  physicsBacklogS += dt;
  while (physicsBacklogS >= PHYSICS_STEP_S) {
    stepPhysics(game, input, PHYSICS_STEP_S, settings.fly);
    physicsBacklogS -= PHYSICS_STEP_S;
  }
  if (isLevel() && game.reachedGoal && completeCard.hidden) showLevelComplete();
  if (isMaze() && game.reachedGoal && completeCard.hidden) showMazeSolved();
  renderStatus(drawScene(nowMs / 1000));
  renderReveal();
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
