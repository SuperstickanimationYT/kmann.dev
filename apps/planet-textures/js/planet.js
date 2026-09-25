import { paintClouds } from './clouds.js';
import { paintCraters } from './craters.js';
import { createGiantShader } from './giant.js';
import { forEachDiskPixel } from './sphere.js';
import { createRockyShader } from './terrain.js';

const RELIEF_STRENGTH = 0.15;

const inWorker = typeof document === 'undefined';

function createLayer(size) {
  if (inWorker) return new OffscreenCanvas(size, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function clipToDisk(context, size) {
  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
}

function shadeRelief(rgb, relief, covered, size) {
  const strength = RELIEF_STRENGTH * size;
  for (let row = 1; row < size - 1; row++) {
    for (let column = 1; column < size - 1; column++) {
      const index = row * size + column;
      if (!covered[index - 1] || !covered[index + 1] || !covered[index - size] || !covered[index + size]) continue;
      const risingAway = relief[index + 1] - relief[index - 1] + relief[index + size] - relief[index - size];
      const light = Math.min(1.5, Math.max(0.5, 1 + risingAway * strength * 0.5));
      rgb[index * 3] *= light;
      rgb[index * 3 + 1] *= light;
      rgb[index * 3 + 2] *= light;
    }
  }
}

function paintSurface(context, size, planet) {
  const shade = planet.bands > 0 ? createGiantShader(planet) : createRockyShader(planet);
  const rgb = new Float32Array(size * size * 3);
  const relief = new Float32Array(size * size);
  const covered = new Uint8Array(size * size);
  const color = [0, 0, 0];

  forEachDiskPixel(size, (point, index) => {
    relief[index] = shade(point, color);
    covered[index] = 1;
    rgb[index * 3] = color[0];
    rgb[index * 3 + 1] = color[1];
    rgb[index * 3 + 2] = color[2];
  });
  if (planet.bands === 0) shadeRelief(rgb, relief, covered, size);
  if (planet.craters > 0) paintCraters(rgb, size, planet);

  const image = context.createImageData(size, size);
  const pixels = image.data;
  for (let index = 0; index < covered.length; index++) {
    if (!covered[index]) continue;
    pixels[index * 4] = rgb[index * 3] * 255;
    pixels[index * 4 + 1] = rgb[index * 3 + 1] * 255;
    pixels[index * 4 + 2] = rgb[index * 3 + 2] * 255;
    pixels[index * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

export function renderPlanet(planet, size) {
  const surface = createLayer(size);
  const surfaceContext = surface.getContext('2d');
  paintSurface(surfaceContext, size, planet);
  clipToDisk(surfaceContext, size);

  const clouds = createLayer(size);
  const cloudContext = clouds.getContext('2d');
  paintClouds(cloudContext, size, planet);
  clipToDisk(cloudContext, size);

  return { surface, clouds };
}
