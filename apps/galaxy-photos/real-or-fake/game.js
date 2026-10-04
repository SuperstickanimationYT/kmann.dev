import { createRenderer } from '../js/renderer.js';
import { randomSeed } from '../js/random.js';
import { fakeSettingsFor } from './match.js';
import { REAL_PHOTOS, photoUrl, sourceUrl } from './photos.js';

const SHOWN_WIDTH = 800;
const SHOWN_HEIGHT = 600;
const RENDER_SCALE = 2;
const JPEG_QUALITY = 0.88;
const HISTORY_KEY = 'galaxy-real-or-fake-history';

const picture = document.querySelector('[data-picture]');
const status = document.querySelector('[data-status]');
const guessButtons = document.querySelectorAll('[data-guess]');
const nextButton = document.querySelector('[data-next]');
const verdict = document.querySelector('[data-verdict]');
const scoreLine = document.querySelector('[data-score]');
const breakdown = document.querySelector('[data-breakdown]');
const creditList = document.querySelector('[data-credits]');
const resetButton = document.querySelector('[data-reset]');

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
const renderer = createRenderer(document.createElement('canvas'));

function readHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(HISTORY_KEY)) ?? [];
  } catch {
    return [];
  }
}

function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    return;
  }
}

let history = readHistory();
let deck = [];
let current = null;
let upcoming = null;
let answered = false;

function shuffledDeck() {
  const order = [...REAL_PHOTOS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function asJpegUrl(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)), 'image/jpeg', JPEG_QUALITY));
}

async function generatedPicture(photo) {
  const settings = fakeSettingsFor(photo, randomSeed());
  const full = await renderer.renderToCanvas(settings, SHOWN_WIDTH * RENDER_SCALE, SHOWN_HEIGHT * RENDER_SCALE, nextFrame);
  const shown = document.createElement('canvas');
  shown.width = SHOWN_WIDTH;
  shown.height = SHOWN_HEIGHT;
  const context = shown.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(full, 0, 0, SHOWN_WIDTH, SHOWN_HEIGHT);
  return { url: await asJpegUrl(shown), settings };
}

function loaded(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(url);
    image.onerror = reject;
    image.src = url;
  });
}

async function prepareRound() {
  if (!deck.length) deck = shuffledDeck();
  const photo = deck.pop();
  const real = Math.random() < 0.5;
  if (real) return { photo, real, url: await loaded(photoUrl(photo)) };
  const { url, settings } = await generatedPicture(photo);
  return { photo, real, url, settings };
}

function generatorLink(settings) {
  const params = new URLSearchParams(Object.entries(settings).map(([name, value]) => [name, typeof value === 'boolean' ? Number(value) : value]));
  return `../#${params}`;
}

function showScore() {
  const correct = history.filter((round) => round.real === round.guessedReal).length;
  scoreLine.textContent = history.length ? `${correct} of ${history.length} right (${Math.round((100 * correct) / history.length)}%)` : 'No guesses yet';
  const fakes = history.filter((round) => !round.real);
  const reals = history.filter((round) => round.real);
  const fooled = fakes.filter((round) => round.guessedReal).length;
  const doubted = reals.filter((round) => !round.guessedReal).length;
  breakdown.textContent = history.length
    ? `Generated images you called real: ${fooled} of ${fakes.length}. Real photos you called generated: ${doubted} of ${reals.length}.`
    : '';
}

function showRound(round) {
  if (current?.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
  current = round;
  answered = false;
  picture.src = round.url;
  picture.hidden = false;
  status.hidden = true;
  verdict.replaceChildren();
  guessButtons.forEach((button) => { button.disabled = false; });
  nextButton.disabled = true;
}

async function advance() {
  nextButton.disabled = true;
  guessButtons.forEach((button) => { button.disabled = true; });
  if (!upcoming) {
    status.hidden = false;
    status.textContent = 'Preparing the next image…';
  }
  const round = await (upcoming ?? prepareRound());
  upcoming = null;
  showRound(round);
  upcoming = prepareRound();
}

function line(text, className) {
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  if (className) paragraph.className = className;
  return paragraph;
}

function link(text, href) {
  const anchor = document.createElement('a');
  anchor.textContent = text;
  anchor.href = href;
  if (href.startsWith('http')) anchor.rel = 'noopener';
  return anchor;
}

function guess(guessedReal) {
  if (!current || answered) return;
  answered = true;
  const right = guessedReal === current.real;
  history.push({ id: current.photo.id, real: current.real, guessedReal });
  saveHistory(history);

  verdict.replaceChildren(line(right ? 'Right.' : 'Wrong.', right ? 'gx-right' : 'gx-wrong'));
  if (current.real) {
    verdict.append(line('Real Hubble photo.'));
    const credit = line(`Credit: ${current.photo.credit}`, 'gx-credit');
    verdict.append(credit, link('See the original at ESA/Hubble', sourceUrl(current.photo)));
  } else {
    verdict.append(
      line(`Generated, matched to the type, tilt and framing of a real Hubble photo (${current.photo.id}).`),
      link('Open these settings in the generator', generatorLink(current.settings)),
    );
  }
  guessButtons.forEach((button) => { button.disabled = true; });
  nextButton.disabled = false;
  nextButton.focus();
  showScore();
}

guessButtons.forEach((button) => button.addEventListener('click', () => guess(button.dataset.guess === 'real')));
nextButton.addEventListener('click', advance);
resetButton.addEventListener('click', () => {
  history = [];
  saveHistory(history);
  showScore();
});

document.addEventListener('keydown', (event) => {
  if (event.target.closest('input, textarea, select')) return;
  if (event.key === 'r' || event.key === 'R') guess(true);
  else if (event.key === 'g' || event.key === 'G') guess(false);
});

for (const photo of REAL_PHOTOS) {
  const item = document.createElement('li');
  item.append(link(photo.id, sourceUrl(photo)), document.createTextNode(` — ${photo.credit.replace('\n', ' ')}`));
  creditList.append(item);
}

if (!renderer) {
  status.hidden = false;
  status.textContent = 'This browser lacks WebGL2 float render targets, so only real photos can be shown and the game would be meaningless.';
} else {
  showScore();
  advance();
}
