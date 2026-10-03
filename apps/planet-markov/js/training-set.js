export const PLANET_SIZE = 96;
const PLANETS_PER_SET = 24;

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

export const DISK_REACH = 1 + 2 / PLANET_SIZE;
const DISK = Array.from({ length: PLANET_SIZE * PLANET_SIZE }, (_, index) => index)
  .filter((index) => distanceFromCenter(index) <= DISK_REACH);

const reader = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
reader.canvas.width = PLANET_SIZE;
reader.canvas.height = PLANET_SIZE;

async function loadBitmap(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load ${src}`);
  return createImageBitmap(await response.blob());
}

function readPlanet(bitmap) {
  reader.drawImage(bitmap, 0, 0);
  const rgba = reader.getImageData(0, 0, PLANET_SIZE, PLANET_SIZE).data;
  const rgb = new Uint8Array(PLANET_SIZE * PLANET_SIZE * 3);
  for (let i = 0; i < PLANET_SIZE * PLANET_SIZE; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return { rgb, disk: DISK };
}

export async function loadTrainingSet(name) {
  const sources = Array.from({ length: PLANETS_PER_SET }, (_, index) => `training/${name}/${index}.png`);
  const bitmaps = await Promise.all(sources.map(loadBitmap));
  return bitmaps.map(readPlanet);
}
