import { drawMaze } from './mazes.js';

export const PLANET_SIZE = 96;
export const HIRES_SIZE = 768;
export const SEED_SIZE = 3;

const planetSet = (label) => ({ group: 'Planets', label, noun: 'planet', count: 24, hiresCount: 3, round: true, colors: 12 });

export const TRAINING_SETS = {
  earthlike: planetSet('Earth-like'),
  desert: planetSet('Desert'),
  lava: planetSet('Lava'),
  giants: planetSet('Gas giants'),
  galaxies: {
    group: 'Galaxies',
    label: 'Hubble spirals',
    noun: 'galaxy',
    count: 14,
    hiresCount: 3,
    round: false,
    colors: 16,
    suggested: { start: 'seed', ringsOn: true },
    credited: true,
    caption: 'Watch the spiral arms. A long curving arm is far bigger than what any step can see, so the arms break into blotches.',
  },
  mazes: {
    group: 'Mazes',
    label: 'Mazes',
    noun: 'maze',
    count: 24,
    hiresCount: 3,
    round: false,
    colors: 2,
    drawn: drawMaze,
    pathCheck: true,
    caption: 'Every corridor looks right, but a maze has to connect from end to end. Tick Check paths to see how much of it is cut off.',
  },
};

export function distanceFromCenter(index, size = PLANET_SIZE) {
  const texel = 2 / size;
  const x = ((index % size) + 0.5) * texel - 1;
  const y = (Math.floor(index / size) + 0.5) * texel - 1;
  return Math.hypot(x, y);
}

export const diskReach = (size) => 1 + 2 / size;
export const DISK_REACH = diskReach(PLANET_SIZE);

const masks = new Map();

function maskOf(size, round) {
  const key = `${size}/${round}`;
  if (!masks.has(key)) {
    const pixels = Array.from({ length: size * size }, (_, index) => index);
    masks.set(key, round ? pixels.filter((index) => distanceFromCenter(index, size) <= diskReach(size)) : pixels);
  }
  return masks.get(key);
}

async function loadBitmap(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  return createImageBitmap(await response.blob());
}

function readPicture(bitmap, round) {
  const size = bitmap.width;
  const reader = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
  reader.drawImage(bitmap, 0, 0);
  const rgba = reader.getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return { size, rgb, disk: maskOf(size, round) };
}

async function loadPictures(name, files) {
  const { round } = TRAINING_SETS[name];
  const bitmaps = await Promise.all(files.map((file) => loadBitmap(`training/${name}/${file}`)));
  return bitmaps.map((bitmap) => readPicture(bitmap, round));
}

function drawPictures(name, size, count, firstSeed) {
  return Array.from({ length: count }, (_, index) => ({ ...TRAINING_SETS[name].drawn(firstSeed + index, size), disk: maskOf(size, false) }));
}

export async function loadTrainingSet(name) {
  const { count, drawn } = TRAINING_SETS[name];
  if (drawn) return drawPictures(name, PLANET_SIZE, count, 1);
  return loadPictures(name, Array.from({ length: count }, (_, index) => `${index}.png`));
}

function halve({ size, rgb, disk }) {
  const half = size / 2;
  const small = new Uint8Array(half * half * 3);
  for (let row = 0; row < half; row++) {
    for (let column = 0; column < half; column++) {
      const topLeft = (row * 2 * size + column * 2) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const sum = rgb[topLeft + channel] + rgb[topLeft + 3 + channel]
          + rgb[topLeft + size * 3 + channel] + rgb[topLeft + size * 3 + 3 + channel];
        small[(row * half + column) * 3 + channel] = Math.round(sum / 4);
      }
    }
  }
  return { size: half, rgb: small, disk: maskOf(half, disk.length < size * size) };
}

export function pyramidDownTo(picture, smallest) {
  const levels = [picture];
  while (levels[0].size > smallest) levels.unshift(halve(levels[0]));
  return levels;
}

export async function loadPyramids(name) {
  const { hiresCount, drawn, count } = TRAINING_SETS[name];
  const pictures = drawn
    ? drawPictures(name, HIRES_SIZE, hiresCount, count + 1)
    : await loadPictures(name, Array.from({ length: hiresCount }, (_, index) => `hires-${index}.png`));
  return pictures.map((picture) => pyramidDownTo(picture, PLANET_SIZE));
}

export async function loadCredits(name) {
  if (!TRAINING_SETS[name].credited) return null;
  const response = await fetch(`training/${name}/credits.json`);
  return response.json();
}
