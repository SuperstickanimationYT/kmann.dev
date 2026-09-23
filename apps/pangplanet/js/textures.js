import { loadSprites } from '../../planet-textures/js/planet.js';
import { bodies } from './universe.js';

const TEXTURE_SIZES = [256, 1024];

const baked = new WeakMap();
const wanted = new Map();
const worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
let bakingBody = null;

worker.onmessage = ({ data }) => {
  baked.set(bakingBody, data.bitmap);
  bakingBody = null;
};

export async function loadTextureStamps() {
  const sprites = await loadSprites();
  const stamps = await Promise.all(
    Object.entries(sprites).map(async ([name, sprite]) => [name, { ...sprite, image: await createImageBitmap(sprite.image) }]),
  );
  worker.postMessage({ stamps: Object.fromEntries(stamps) });
}

const sizeToCover = (radiusPx) => TEXTURE_SIZES.find((size) => size >= radiusPx) ?? TEXTURE_SIZES.at(-1);

export function planetTexture(body, radiusPx) {
  const texture = baked.get(body);
  const size = texture ? sizeToCover(radiusPx) : TEXTURE_SIZES[0];
  if (!texture || texture.width < size) wanted.set(body, size);
  return texture ?? null;
}

export function bakeNextTexture() {
  if (bakingBody) return;
  for (const [body, size] of wanted) {
    wanted.delete(body);
    if (!bodies.includes(body)) continue;
    bakingBody = body;
    worker.postMessage({ planet: body.planet, size });
    return;
  }
}
