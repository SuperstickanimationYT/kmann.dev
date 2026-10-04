import { createRenderer } from '../js/renderer.js';
import { flatten, measure } from './measure.js';
import { REAL_PHOTOS, photoUrl, sourceUrl } from './photos.js';
import { SHOWN_HEIGHT, SHOWN_WIDTH, renderTwin } from './twin.js';

const grid = document.querySelector('[data-pairs]');
const summary = document.querySelector('[data-summary]');
const rerollButton = document.querySelector('[data-reroll]');
const renderer = createRenderer(document.createElement('canvas'));

let generation = 0;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const format = (value) => (Math.abs(value) >= 0.1 ? value.toFixed(2) : value.toFixed(3));

function pixelsOf(source) {
  const canvas = document.createElement('canvas');
  canvas.width = SHOWN_WIDTH;
  canvas.height = SHOWN_HEIGHT;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, SHOWN_WIDTH, SHOWN_HEIGHT);
  return context.getImageData(0, 0, SHOWN_WIDTH, SHOWN_HEIGHT);
}

function loadedImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function pairRow(photo) {
  const row = document.createElement('figure');
  row.className = 'gx-pair';
  const realSlot = document.createElement('div');
  const fakeSlot = document.createElement('div');
  realSlot.className = 'gx-pending';
  fakeSlot.className = 'gx-pending';
  const caption = document.createElement('figcaption');
  const source = document.createElement('a');
  source.href = sourceUrl(photo);
  source.rel = 'noopener';
  source.textContent = photo.id;
  caption.append(source, document.createTextNode(` (${photo.type}, tilt ${photo.inclination}°). Left real, right generated. Credit: ${photo.credit.replace('\n', ' ')}`));
  const numbers = document.createElement('p');
  numbers.className = 'gx-numbers';
  caption.append(numbers);
  row.append(realSlot, fakeSlot, caption);
  return { row, realSlot, fakeSlot, numbers };
}

function showSummary(pairs) {
  const names = Object.keys(pairs[0].real);
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Measure</th><th>Real (median)</th><th>Generated (median)</th><th>Generated ÷ real (median)</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const name of names) {
    const real = median(pairs.map((pair) => pair.real[name]));
    const fake = median(pairs.map((pair) => pair.fake[name]));
    const ratio = median(pairs.map((pair) => pair.fake[name] / (Math.abs(pair.real[name]) > 1e-6 ? pair.real[name] : 1e-6)));
    const row = document.createElement('tr');
    for (const text of [name, format(real), format(fake), format(ratio)]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  const heading = document.createElement('p');
  heading.textContent = `Measured over ${pairs.length} of ${REAL_PHOTOS.length} pairs. Detail is the brightness change between two blur levels, relative to galaxy brightness.`;
  summary.replaceChildren(heading, table);
}

async function renderAll() {
  const run = ++generation;
  grid.replaceChildren();
  summary.replaceChildren();
  const rows = REAL_PHOTOS.map((photo) => ({ photo, ...pairRow(photo) }));
  rows.forEach(({ row }) => grid.append(row));
  const pairs = [];
  for (const { photo, realSlot, fakeSlot, numbers } of rows) {
    const real = await loadedImage(photoUrl(photo));
    real.alt = `Real Hubble photo ${photo.id}`;
    realSlot.replaceWith(real);
    const { canvas } = await renderTwin(renderer, photo);
    if (run !== generation) return;
    canvas.setAttribute('aria-label', `Generated twin of ${photo.id}`);
    fakeSlot.replaceWith(canvas);

    const pair = { real: flatten(measure(pixelsOf(real))), fake: flatten(measure(pixelsOf(canvas))) };
    pairs.push(pair);
    numbers.textContent = Object.keys(pair.real).map((name) => `${name} ${format(pair.real[name])} / ${format(pair.fake[name])}`).join(' · ');
    showSummary(pairs);
  }
  window.galaxyPairs = pairs;
}

rerollButton.addEventListener('click', renderAll);
if (renderer) renderAll();
