const PLANET_SPRITE_SIZE = 512;
const MOON_SPRITE_SIZE = 256;
const AVERAGE_SAMPLE_SIZE = 16;

const ROCKY = { kind: 'rocky', bands: 0, polarCap: 0, craters: 0, land: false, landColor: '#7eff00', landCover: 47, clouds: 0, lava: 0, haze: 0, hazeColor: '#8fb8ff' };
const GIANT = { ...ROCKY, kind: 'giant' };

const LOOKS = {
  Mercury: { ...ROCKY, seed: 11, baseColor: '#9a9590', variation: 20, darkness: 40, craters: 20 },
  Venus: { ...ROCKY, seed: 12, baseColor: '#e8c98a', variation: 10, darkness: 20, clouds: 150, haze: 60, hazeColor: '#e8b25f' },
  Earth: { ...ROCKY, seed: 13, baseColor: '#0a5fc4', variation: 15, darkness: 35, polarCap: 35, land: true, landColor: '#4f8f2f', landCover: 35, clouds: 30, haze: 24, hazeColor: '#7fb2ff' },
  Moon: { ...ROCKY, seed: 14, baseColor: '#b0b0b0', variation: 25, darkness: 30, craters: 25 },
  Mars: { ...ROCKY, seed: 15, baseColor: '#c1440e', variation: 25, darkness: 35, polarCap: 25, haze: 4, hazeColor: '#d8a57a' },
  Phobos: { ...ROCKY, seed: 16, baseColor: '#7a6a5e', variation: 20, darkness: 40, craters: 15 },
  Deimos: { ...ROCKY, seed: 17, baseColor: '#8a7a6e', variation: 20, darkness: 35, craters: 12 },
  Jupiter: { ...GIANT, seed: 18, baseColor: '#d9a066', variation: 8, darkness: 35, bands: 4, haze: 10, hazeColor: '#e8d0a0' },
  Io: { ...ROCKY, seed: 19, baseColor: '#e6d34a', variation: 35, darkness: 25, lava: 8 },
  Europa: { ...ROCKY, seed: 20, baseColor: '#e8e0d0', variation: 30, darkness: 10, craters: 2 },
  Ganymede: { ...ROCKY, seed: 21, baseColor: '#a09588', variation: 30, darkness: 30, craters: 15 },
  Callisto: { ...ROCKY, seed: 22, baseColor: '#6e655c', variation: 25, darkness: 40, craters: 25 },
  Saturn: { ...GIANT, seed: 23, baseColor: '#e3c98f', variation: 6, darkness: 15, bands: 5, haze: 15, hazeColor: '#ffffff' },
  Titan: { ...ROCKY, seed: 24, baseColor: '#c08a3a', variation: 15, darkness: 20, haze: 80, hazeColor: '#e8a040' },
  Uranus: { ...GIANT, seed: 25, baseColor: '#9fdfe8', variation: 4, darkness: 5, bands: 1, haze: 30, hazeColor: '#a8e0ff' },
  Neptune: { ...GIANT, seed: 26, baseColor: '#3f6fe0', variation: 10, darkness: 20, bands: 2, haze: 30, hazeColor: '#6fa0ff' },
  Triton: { ...ROCKY, seed: 27, baseColor: '#d0c4bc', variation: 20, darkness: 15, polarCap: 40, craters: 5 },
  Pluto: { ...ROCKY, seed: 28, baseColor: '#c9a888', variation: 35, darkness: 25, craters: 5 },
};

const PAINT_FIRST = ['Earth', 'Moon', 'Mars', 'Venus', 'Jupiter', 'Saturn'];
const sprites = new Map();

function averageColor(image) {
  const sample = document.createElement('canvas');
  sample.width = AVERAGE_SAMPLE_SIZE;
  sample.height = AVERAGE_SAMPLE_SIZE;
  const context = sample.getContext('2d');
  context.drawImage(image, 0, 0, AVERAGE_SAMPLE_SIZE, AVERAGE_SAMPLE_SIZE);
  const pixels = context.getImageData(0, 0, AVERAGE_SAMPLE_SIZE, AVERAGE_SAMPLE_SIZE).data;
  const sum = [0, 0, 0];
  let weight = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    sum[0] += pixels[i] * alpha;
    sum[1] += pixels[i + 1] * alpha;
    sum[2] += pixels[i + 2] * alpha;
    weight += alpha;
  }
  return `rgb(${sum.map((channel) => Math.round(channel / weight)).join(', ')})`;
}

export function paintSprites(bodies) {
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return;
  const painter = new Worker(new URL('./texture/worker.js', import.meta.url), { type: 'module' });
  painter.onmessage = ({ data: { name, image } }) => sprites.set(name, { image, color: averageColor(image) });
  const order = [...bodies].filter((body) => LOOKS[body.name]).sort((a, b) => {
    const rank = (body) => (PAINT_FIRST.includes(body.name) ? PAINT_FIRST.indexOf(body.name) : PAINT_FIRST.length);
    return rank(a) - rank(b);
  });
  for (const body of order) {
    const size = body.parent?.parent ? MOON_SPRITE_SIZE : PLANET_SPRITE_SIZE;
    painter.postMessage({ name: body.name, look: LOOKS[body.name], size });
  }
}

export function spriteFor(body) {
  return sprites.get(body.name) ?? null;
}
