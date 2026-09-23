import { createNoise, createRandom } from './random.js';

export const STAGE_RADIUS = 180;

const NOISE_OCTAVES = 5;
const SURFACE_NOISE_SCALE = 20;
const LAND_NOISE_SCALE = 75;
const POLAR_CAP_COLOR = '#c9e6ff';
const POLAR_CAP_PEN = 5;
const CLOUD_BANK_STAMPS = 10;
const CLOUD_BANK_OPACITY = 0.05;
const WISPS_PER_CLOUD_BANK = 0.3;
const WISP_STAMPS = 3;
const WISP_OPACITY = 0.25;
const STREAM = { surface: 0x51f1, land: 0x1a4d, craters: 0xc4a7, polarCap: 0x9013, clouds: 0xc10d };

const SPRITES = {
  crater: { src: 'img/crater.svg', originX: 39.846, originY: 90.64 },
  cloud: { src: 'img/cloud.svg', originX: 43.041, originY: 18.738 },
  wisp: { src: 'img/wisp.svg', originX: 32.164, originY: 9.099 },
};

export async function loadSprites() {
  const entries = await Promise.all(Object.entries(SPRITES).map(async ([name, sprite]) => {
    const image = new Image();
    image.src = sprite.src;
    await image.decode();
    return [name, { ...sprite, image }];
  }));
  return Object.fromEntries(entries);
}

function hexToHsv(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  let hue = 0;
  if (spread) {
    if (max === r) hue = ((g - b) / spread + 6) % 6;
    else if (max === g) hue = (b - r) / spread + 2;
    else hue = (r - g) / spread + 4;
  }
  return { hue: hue / 6, saturation: max ? spread / max : 0 };
}

function writeHsv(pixels, offset, hue, saturation, value) {
  const sector = (((hue % 1) + 1) % 1) * 6;
  const whole = Math.floor(sector);
  const part = sector - whole;
  const low = value * (1 - saturation);
  const falling = value * (1 - saturation * part);
  const rising = value * (1 - saturation * (1 - part));
  const [r, g, b] = [
    [value, rising, low],
    [falling, value, low],
    [low, value, rising],
    [low, falling, value],
    [rising, low, value],
    [value, low, falling],
  ][whole];
  pixels[offset] = r * 255;
  pixels[offset + 1] = g * 255;
  pixels[offset + 2] = b * 255;
  pixels[offset + 3] = 255;
}

const sinDegrees = (degrees) => Math.sin((degrees * Math.PI) / 180);
const cosDegrees = (degrees) => Math.cos((degrees * Math.PI) / 180);

function createLayer(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function toStage(context, size) {
  const scale = size / (STAGE_RADIUS * 2);
  context.setTransform(scale, 0, 0, -scale, size / 2, size / 2);
}

function stamp(context, sprite, x, y, direction, opacity = 1) {
  context.save();
  context.globalAlpha = opacity;
  context.translate(x, y);
  context.scale(1, -1);
  context.rotate(((direction - 90) * Math.PI) / 180);
  context.drawImage(sprite.image, -sprite.originX, -sprite.originY);
  context.restore();
}

function clipToDisk(context, size) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.beginPath();
  context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  context.fill();
  context.globalCompositeOperation = 'source-over';
}

function paintSurface(context, size, planet) {
  const surfaceNoise = createNoise(planet.seed ^ STREAM.surface, NOISE_OCTAVES);
  const landNoise = createNoise(planet.seed ^ STREAM.land, NOISE_OCTAVES);
  const base = hexToHsv(planet.baseColor);
  const land = hexToHsv(planet.landColor);
  const brightnessFloor = 100 - planet.variation - planet.darkness;
  const bandSwing = planet.variation / 300;
  const landLine = planet.landCover / 100;
  const pixelsPerUnit = size / (STAGE_RADIUS * 2);
  const image = context.createImageData(size, size);
  const pixels = image.data;

  for (let row = 0; row < size; row++) {
    const y = STAGE_RADIUS - (row + 0.5) / pixelsPerUnit;
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / pixelsPerUnit - STAGE_RADIUS;
      const distance = Math.hypot(x, y);
      if (distance > STAGE_RADIUS + 1) continue;

      const noise = surfaceNoise(x / SURFACE_NOISE_SCALE, y / SURFACE_NOISE_SCALE);
      const brightness = Math.min(100, Math.max(0, noise * planet.variation + brightnessFloor)) / 100;
      const hueShift = planet.bands > 0 ? sinDegrees(distance * planet.bands) * bandSwing : 0;
      const onLand = planet.land && landNoise(y / LAND_NOISE_SCALE, x / LAND_NOISE_SCALE) < landLine;
      const tint = onLand ? land : base;
      writeHsv(pixels, (row * size + column) * 4, tint.hue + hueShift, tint.saturation, brightness);
    }
  }
  context.putImageData(image, 0, 0);
}

function paintCraters(context, planet, sprites) {
  const random = createRandom(planet.seed ^ STREAM.craters);
  for (let i = 0; i < planet.craters; i++) {
    const direction = random.integer(-179, 180);
    const reach = random.integer(20, 120);
    stamp(context, sprites.crater, sinDegrees(direction) * reach, cosDegrees(direction) * reach, direction);
  }
}

function paintPolarCap(context, planet) {
  const random = createRandom(planet.seed ^ STREAM.polarCap);
  context.strokeStyle = POLAR_CAP_COLOR;
  context.lineWidth = POLAR_CAP_PEN;
  context.lineCap = 'round';
  for (let direction = 90; direction < 450; direction++) {
    const ripple = 5 * sinDegrees(direction * random.integer(7, 9));
    const swell = 5 * sinDegrees((direction + random.integer(50, 80)) * 3);
    const reach = ripple + swell + planet.polarCap;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(sinDegrees(direction) * reach, cosDegrees(direction) * reach);
    context.stroke();
  }
}

function paintClouds(context, planet, sprites) {
  const random = createRandom(planet.seed ^ STREAM.clouds);
  const span = STAGE_RADIUS;
  for (let bank = 0; bank < planet.clouds; bank++) {
    let x = random.integer(-span, span);
    let y = random.integer(-span, span);
    const direction = -60 + random.integer(-45, 45);
    for (let i = 0; i < CLOUD_BANK_STAMPS; i++) {
      stamp(context, sprites.cloud, x, y, direction, CLOUD_BANK_OPACITY);
      x -= 3;
      y += random.integer(-1, 1);
    }
  }

  const wisps = Math.round(planet.clouds * WISPS_PER_CLOUD_BANK);
  for (let wisp = 0; wisp < wisps; wisp++) {
    const heading = random.integer(-179, 180);
    const reach = random.integer(1, 150);
    let x = sinDegrees(heading) * reach;
    let y = cosDegrees(heading) * reach;
    const direction = random.integer(0, 1) ? 120 : -60;
    for (let i = 0; i < WISP_STAMPS; i++) {
      stamp(context, sprites.wisp, x, y, direction, WISP_OPACITY);
      x -= 1;
      y -= 4;
    }
  }
}

export function renderPlanet(planet, size, sprites) {
  const surface = createLayer(size);
  const surfaceContext = surface.getContext('2d');
  paintSurface(surfaceContext, size, planet);
  toStage(surfaceContext, size);
  paintCraters(surfaceContext, planet, sprites);
  if (planet.polarCap > 0) paintPolarCap(surfaceContext, planet);
  clipToDisk(surfaceContext, size);

  const clouds = createLayer(size);
  const cloudContext = clouds.getContext('2d');
  toStage(cloudContext, size);
  paintClouds(cloudContext, planet, sprites);
  clipToDisk(cloudContext, size);

  return { surface, clouds };
}
