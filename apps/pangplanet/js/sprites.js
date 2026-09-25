import { SPECIES } from './aliens.js';

const RASTER_SIZE = 1024;
const FREIGHTER = { src: 'img/freighter.svg', tintPlaceholder: 'SPECIES' };

// Pivots are the original Scratch costume rotation centres, in costume pixels.
const SPRITES = {
  rocket: { src: 'img/rocket.svg', pivot: [16.94, 34.48] },
  flame: { src: 'img/flame.svg', pivot: [48.32, 11.12] },
  explosion: { src: 'img/explosion.svg', pivot: [42.24, 42.76] },
  market: { src: 'img/market.svg', pivot: [98.7, 158.36] },
  drill: { src: 'img/drill.svg', pivot: [8.12, 23.46] },
  wormhole: { src: 'img/wormhole.svg', pivot: [180.34, 180.34] },
  moon: { src: 'img/moon.webp' },
};

async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

async function rasterize(image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const density = RASTER_SIZE / Math.max(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * density);
  canvas.height = Math.ceil(height * density);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return { bitmap: await createImageBitmap(canvas), width, height };
}

const centred = (sprite, pivot) => ({ ...sprite, pivot: pivot ?? [sprite.width / 2, sprite.height / 2] });

async function loadTinted(svgText, colour) {
  const url = URL.createObjectURL(new Blob([svgText.replaceAll(FREIGHTER.tintPlaceholder, colour)], { type: 'image/svg+xml' }));
  try {
    return centred(await rasterize(await loadImage(url)));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadFreighters() {
  const svgText = await (await fetch(FREIGHTER.src)).text();
  const tinted = await Promise.all(SPECIES.map(async ({ key, colour }) => [key, await loadTinted(svgText, colour)]));
  return Object.fromEntries(tinted);
}

export async function loadSprites() {
  const entries = await Promise.all(
    Object.entries(SPRITES).map(async ([name, { src, pivot }]) => {
      const image = await loadImage(src);
      const sprite = src.endsWith('.svg')
        ? await rasterize(image)
        : { bitmap: image, width: image.naturalWidth, height: image.naturalHeight };
      return [name, centred(sprite, pivot)];
    }),
  );
  return { ...Object.fromEntries(entries), freighters: await loadFreighters() };
}
