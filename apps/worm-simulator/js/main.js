import { createRenderer } from './render.js';
import { WORLD_SHORT_SIDE, createWorld, dropFood, resizeWorld, scatterGrains, setFoodTarget, stepWorld } from './world.js';

const MAX_STEP = 1 / 60;
const MAX_FRAME = 0.1;

const canvas = document.querySelector('[data-stage]');
const controls = document.querySelector('[data-controls]');
const meters = {
  fullness: document.querySelector('[data-meter="fullness"]'),
  hydration: document.querySelector('[data-meter="hydration"]'),
  stamina: document.querySelector('[data-meter="stamina"]'),
};
const modeLabel = document.querySelector('[data-mode]');
const clockLabel = document.querySelector('[data-clock]');
const deathCard = document.querySelector('[data-death]');
const deathText = document.querySelector('[data-death-text]');
const pauseButton = document.querySelector('[data-pause]');
const hint = document.querySelector('[data-hint]');

const draw = createRenderer(canvas);
let scale = 1;
let paused = false;
let world = null;

const setting = (name) => controls.elements[name];
const settingNumber = (name) => Number(setting(name).value);

function showSettingValues() {
  for (const input of controls.querySelectorAll('input[type="range"]')) {
    const output = input.closest('label').querySelector('output');
    output.textContent = input.name === 'speed' ? `${input.value}×` : input.value;
  }
}

function fitCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  scale = Math.min(box.width, box.height) / WORLD_SHORT_SIDE;
  return { width: box.width / scale, height: box.height / scale };
}

function restart() {
  const { width, height } = fitCanvas();
  world = createWorld(width, height, { foodCount: settingNumber('food'), grainCount: settingNumber('sand') });
  deathCard.hidden = true;
}

function formatClock(seconds) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const MODE_TEXT = {
  eat: 'Looking for food',
  drink: 'Heading for water',
  sleep: 'Going home to sleep',
};

function describeMode() {
  if (world.death) return world.death === 'starved' ? 'Starved' : 'Dried out';
  if (world.mode === 'drink' && world.drinking) return 'Drinking';
  if (world.mode === 'sleep') {
    if (world.collapsed) return 'Collapsed from exhaustion';
    const lead = world.worm.segments[0];
    if (Math.hypot(world.bed.x - lead.x, world.bed.y - lead.y) <= 10) return 'Asleep';
  }
  const wish = MODE_TEXT[world.mode];
  return world.steerTarget ? `${wish} (you're steering)` : wish;
}

function showStatus() {
  for (const [need, meter] of Object.entries(meters)) {
    const value = Math.round(world.needs[need]);
    meter.style.setProperty('--fill', `${value}%`);
    meter.classList.toggle('worm-low', value < 25);
    meter.setAttribute('aria-valuenow', String(value));
    meter.querySelector('output').textContent = value;
  }
  modeLabel.textContent = describeMode();
  clockLabel.textContent = formatClock(world.time);
  if (world.death && deathCard.hidden) {
    deathText.textContent = `It ${world.death} after ${formatClock(world.time)} of worm time.`;
    deathCard.hidden = false;
  }
}

let lastFrame = performance.now();
function frame(now) {
  const elapsed = Math.min(MAX_FRAME, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!paused) {
    let remaining = elapsed * settingNumber('speed');
    while (remaining > 0) {
      const step = Math.min(MAX_STEP, remaining);
      stepWorld(world, step);
      remaining -= step;
    }
  }
  draw(world, scale);
  showStatus();
  window.requestAnimationFrame(frame);
}

function worldPoint(event) {
  const box = canvas.getBoundingClientRect();
  return { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
}

const steering = () => setting('steer').checked;

canvas.addEventListener('pointerdown', (event) => {
  if (steering()) {
    world.steerTarget = worldPoint(event);
    return;
  }
  const { x, y } = worldPoint(event);
  dropFood(world, x, y);
});

canvas.addEventListener('pointermove', (event) => {
  if (steering() && (event.pointerType === 'mouse' || event.buttons)) world.steerTarget = worldPoint(event);
});

canvas.addEventListener('pointerleave', () => {
  if (steering()) world.steerTarget = null;
});

controls.addEventListener('input', (event) => {
  showSettingValues();
  const { name } = event.target;
  if (name === 'food') setFoodTarget(world, settingNumber('food'));
  if (name === 'sand') scatterGrains(world, settingNumber('sand'));
  if (name === 'steer') {
    world.steerTarget = null;
    hint.textContent = steering()
      ? 'Move the mouse, or drag a finger, and the worm follows. It still eats and drinks whatever it touches.'
      : 'Click or tap the sand to drop food.';
  }
});

pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.textContent = paused ? 'Resume' : 'Pause';
});

for (const button of document.querySelectorAll('[data-restart]')) button.addEventListener('click', restart);

window.addEventListener('resize', () => {
  const { width, height } = fitCanvas();
  resizeWorld(world, width, height);
});

showSettingValues();
restart();
window.requestAnimationFrame(frame);
