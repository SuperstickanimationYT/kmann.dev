import { createRenderer } from '../js/renderer.js';
import { randomSeed } from '../js/random.js';
import { fakeSettingsFor } from './match.js';
import { REAL_PHOTOS, photoUrl, sourceUrl } from './photos.js';

const RENDER_WIDTH = 800;
const RENDER_HEIGHT = 600;

const grid = document.querySelector('[data-pairs]');
const rerollButton = document.querySelector('[data-reroll]');
const renderer = createRenderer(document.createElement('canvas'));
const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

let generation = 0;

function pairRow(photo) {
  const row = document.createElement('figure');
  row.className = 'gx-pair';
  const real = new Image();
  real.src = photoUrl(photo);
  real.alt = `Real Hubble photo ${photo.id}`;
  const fakeSlot = document.createElement('div');
  fakeSlot.className = 'gx-pending';
  const caption = document.createElement('figcaption');
  const source = document.createElement('a');
  source.href = sourceUrl(photo);
  source.rel = 'noopener';
  source.textContent = photo.id;
  caption.append(source, document.createTextNode(` (${photo.type}, tilt ${photo.inclination}°). Left real, right generated. Credit: ${photo.credit.replace('\n', ' ')}`));
  row.append(real, fakeSlot, caption);
  return { row, fakeSlot };
}

async function renderAll() {
  const run = ++generation;
  grid.replaceChildren();
  const rows = REAL_PHOTOS.map((photo) => ({ photo, ...pairRow(photo) }));
  rows.forEach(({ row }) => grid.append(row));
  for (const { photo, fakeSlot } of rows) {
    const canvas = await renderer.renderToCanvas(fakeSettingsFor(photo, randomSeed()), RENDER_WIDTH, RENDER_HEIGHT, nextFrame);
    if (run !== generation) return;
    canvas.setAttribute('aria-label', `Generated twin of ${photo.id}`);
    fakeSlot.replaceWith(canvas);
  }
}

rerollButton.addEventListener('click', renderAll);
if (renderer) renderAll();
