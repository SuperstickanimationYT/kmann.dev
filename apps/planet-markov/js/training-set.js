export const PLANET_SIZE = 96;
export const HIRES_SIZE = 768;
const PLANETS_PER_SET = 24;
const HIRES_PER_SET = 3;

export const TRAINING_SETS = {
  earthlike: 'Earth-like',
  desert: 'Desert',
  lava: 'Lava',
  giants: 'Gas giants',
};

export function distanceFromCenter(index, size = PLANET_SIZE) {
  const texel = 2 / size;
  const x = ((index % size) + 0.5) * texel - 1;
  const y = (Math.floor(index / size) + 0.5) * texel - 1;
  return Math.hypot(x, y);
}

export const diskReach = (size) => 1 + 2 / size;
export const DISK_REACH = diskReach(PLANET_SIZE);

const disks = new Map();

function diskOf(size) {
  if (!disks.has(size)) {
    const disk = [];
    for (let index = 0; index < size * size; index++) if (distanceFromCenter(index, size) <= diskReach(size)) disk.push(index);
    disks.set(size, disk);
  }
  return disks.get(size);
}

async function loadBitmap(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  return createImageBitmap(await response.blob());
}

function readPlanet(bitmap) {
  const size = bitmap.width;
  const reader = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
  reader.drawImage(bitmap, 0, 0);
  const rgba = reader.getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return { size, rgb, disk: diskOf(size) };
}

async function loadPlanets(sources) {
  const bitmaps = await Promise.all(sources.map(loadBitmap));
  return bitmaps.map(readPlanet);
}

export function loadTrainingSet(name) {
  return loadPlanets(Array.from({ length: PLANETS_PER_SET }, (_, index) => `training/${name}/${index}.png`));
}

function halve({ size, rgb }) {
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
  return { size: half, rgb: small, disk: diskOf(half) };
}

export async function loadPyramids(name) {
  const planets = await loadPlanets(Array.from({ length: HIRES_PER_SET }, (_, index) => `training/${name}/hires-${index}.png`));
  return planets.map((planet) => {
    const levels = [planet];
    while (levels[0].size > PLANET_SIZE) levels.unshift(halve(levels[0]));
    return levels;
  });
}
