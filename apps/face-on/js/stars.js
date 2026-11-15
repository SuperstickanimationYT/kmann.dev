import { boxBlur, dilate, enlarge, halve, median, open, sampleEvery, smooth } from './filters.js';

const CHANNELS = ['r', 'g', 'b'];

export function luminance(image) {
  const { r, g, b } = image;
  const out = new Float32Array(r.length);
  for (let i = 0; i < out.length; i += 1) out[i] = (r[i] + g[i] + b[i]) / 3;
  return out;
}

function detectionThreshold(tophat, sensitivity) {
  const picks = sampleEvery(tophat.length, 200000);
  const values = picks.map((i) => tophat[i]);
  const middle = median(values);
  const spread = 1.4826 * median(values.map((v) => Math.abs(v - middle)));
  return middle + Math.max(spread, 0.002) * (11 - sensitivity);
}

function countBlobs(seed, width, height) {
  const seen = new Uint8Array(seed.length);
  const stack = new Int32Array(seed.length);
  let blobs = 0;
  for (let start = 0; start < seed.length; start += 1) {
    if (!seed[start] || seen[start]) continue;
    blobs += 1;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const i = stack[--top];
      const x = i % width;
      const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const j of neighbours) {
        if (j >= 0 && j < seed.length && seed[j] && !seen[j]) {
          seen[j] = 1;
          stack[top++] = j;
        }
      }
    }
  }
  return blobs;
}

function starMask(image, radius, sensitivity) {
  const { width, height } = image;
  const light = luminance(image);
  const background = open(light, width, height, radius);
  const tophat = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) tophat[i] = light[i] - background[i];
  const threshold = detectionThreshold(tophat, sensitivity);
  const seed = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) seed[i] = tophat[i] > threshold ? 1 : 0;
  const halo = Math.max(1, Math.round(radius * 0.6));
  const grown = boxBlur(dilate(seed, width, height, halo), width, height, halo);
  const alpha = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) alpha[i] = Math.min(1, grown[i] * 2);
  return { alpha, count: countBlobs(seed, width, height) };
}

function fillUnder(channel, alpha, width, height, radius) {
  const small = halve(channel, width, height);
  const reach = Math.max(1, Math.round(radius / 2));
  small.data = smooth(open(small.data, small.width, small.height, reach), small.width, small.height, reach);
  const fill = enlarge(small, width, height);
  const offsets = sampleEvery(channel.length, 100000)
    .filter((i) => alpha[i] === 0)
    .map((i) => channel[i] - fill[i]);
  const offset = median(offsets);
  for (let i = 0; i < fill.length; i += 1) fill[i] += offset;
  return fill;
}

export function removeStars(image, { radius, sensitivity }) {
  const { width, height } = image;
  const { alpha, count } = starMask(image, radius, sensitivity);
  const starless = { width, height };
  const stars = { width, height };
  for (const key of CHANNELS) {
    const original = image[key];
    const fill = fillUnder(original, alpha, width, height, radius);
    const clean = new Float32Array(original.length);
    const light = new Float32Array(original.length);
    for (let i = 0; i < original.length; i += 1) {
      const kept = original[i] + (Math.min(original[i], fill[i]) - original[i]) * alpha[i];
      clean[i] = kept;
      light[i] = Math.max(0, original[i] - kept);
    }
    starless[key] = clean;
    stars[key] = light;
  }
  return { starless, stars, count };
}

export function keepStars(image) {
  const { width, height } = image;
  const empty = () => new Float32Array(width * height);
  return { starless: image, stars: { width, height, r: empty(), g: empty(), b: empty() }, count: 0 };
}
