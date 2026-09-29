import { createRandom } from '../../planet-textures/js/random.js';
import { EARTH_ORBIT } from './world.js';

const PHOTO_PX = 96;
const BACKGROUND_STARS = 45;
const FAINTEST_MAGNITUDE = 12;
const MAGNITUDE_SPAN = 14;
const DIMMEST_SHOWN = 0.05;
const WHITE = [255, 255, 255];

export function apparentBrightness(luminosity, distance) {
  const flux = luminosity / (distance / EARTH_ORBIT) ** 2;
  const magnitude = -2.5 * Math.log10(flux);
  return Math.min(1, Math.max(DIMMEST_SHOWN, (FAINTEST_MAGNITUDE - magnitude) / MAGNITUDE_SPAN));
}

function rgbOf(colour) {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour ?? '');
  if (!hex) return WHITE;
  const value = parseInt(hex[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function seedOf(text) {
  let hash = 0x811c9dc5;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193);
  return hash >>> 0;
}

const rgba = ([r, g, b], alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

function drawBackground(context, name) {
  const random = createRandom(seedOf(name));
  for (let i = 0; i < BACKGROUND_STARS; i++) {
    context.fillStyle = `rgba(210, 225, 255, ${random.between(0.08, 0.5)})`;
    context.fillRect(random.next() * PHOTO_PX, random.next() * PHOTO_PX, random.between(0.6, 1.4), random.between(0.6, 1.4));
  }
}

function drawSpikes(context, colour, length) {
  const middle = PHOTO_PX / 2;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const spike = context.createLinearGradient(middle, middle, middle + dx * length, middle + dy * length);
    spike.addColorStop(0, rgba(colour, 0.9));
    spike.addColorStop(1, rgba(colour, 0));
    context.strokeStyle = spike;
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(middle, middle);
    context.lineTo(middle + dx * length, middle + dy * length);
    context.stroke();
  }
}

function drawGlow(context, colour, radius) {
  const middle = PHOTO_PX / 2;
  const glow = context.createRadialGradient(middle, middle, 0, middle, middle, radius);
  glow.addColorStop(0, rgba(WHITE, 1));
  glow.addColorStop(0.15, rgba(colour, 0.95));
  glow.addColorStop(0.45, rgba(colour, 0.3));
  glow.addColorStop(1, rgba(colour, 0));
  context.fillStyle = glow;
  context.beginPath();
  context.arc(middle, middle, radius, 0, Math.PI * 2);
  context.fill();
}

export function createStarPhoto(canvas) {
  const context = canvas.getContext('2d');
  let shown = '';
  canvas.addEventListener('contextrestored', () => {
    shown = '';
  });

  function develop({ name, colour, brightness }) {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(PHOTO_PX * ratio);
    canvas.height = Math.round(PHOTO_PX * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#000';
    context.fillRect(0, 0, PHOTO_PX, PHOTO_PX);
    drawBackground(context, name);
    const rgb = rgbOf(colour);
    drawSpikes(context, rgb, 8 + 40 * brightness);
    drawGlow(context, rgb, 3 + 22 * brightness);
  }

  function show(subject) {
    canvas.hidden = !subject;
    if (!subject) return;
    const signature = `${subject.name}:${subject.colour}:${subject.brightness.toFixed(2)}`;
    if (signature === shown) return;
    shown = signature;
    develop(subject);
  }

  return { show };
}
