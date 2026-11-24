import { WHITE_BALANCE } from './population.js';

export const CAMERA = {
  electronsPerNanomaggy: 3.9 * (3.6 / 100) ** 2,
  readNoise: 3,
  dark: 0.01,
  fullWell: 50000,
  psfPixels: 0.7,
  frameSeconds: 10,
  realSecondsPerFrame: 1,
  maxWidth: 1280,
};

const SATURATED_BLACK_SHARE = 0.5;
const SPAN_IN_NOISE = 200;
const BRIGHT_SHARE = 0.9995;
const DARK_SHARE = 0.05;

const percentile = (sorted, share) => sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];

export function measureSignal(bands) {
  return bands.map((values) => {
    values.sort();
    return { dark: percentile(values, DARK_SHARE), median: percentile(values, 0.5), bright: percentile(values, BRIGHT_SHARE) };
  });
}

export function levelsFor({ signal, seconds, frames, electronsPerUnit }) {
  const noiseOf = (electrons) => Math.sqrt(electrons + CAMERA.dark * seconds + frames * CAMERA.readNoise ** 2);
  const visual = signal[1];
  const skyV = visual.dark * electronsPerUnit * seconds;
  const span = Math.max(SPAN_IN_NOISE * noiseOf(skyV), (visual.bright - visual.dark) * electronsPerUnit * seconds);
  const saturation = CAMERA.fullWell * frames;
  const black = signal.map(({ dark }) => {
    const sky = dark * electronsPerUnit * seconds;
    return Math.min(sky - 1.5 * noiseOf(sky), SATURATED_BLACK_SHARE * saturation);
  });
  const white = black.map((low, band) => Math.min(low + span * (WHITE_BALANCE[band] / WHITE_BALANCE[1]), saturation));
  return { black, white };
}

export const skyFillsPixels = ({ signal, electronsPerUnit }) =>
  signal[1].median * electronsPerUnit * CAMERA.frameSeconds > SATURATED_BLACK_SHARE * CAMERA.fullWell;

export function imageFromRows(pixels, width, height) {
  const image = new ImageData(width, height);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    image.data.set(pixels.subarray((height - 1 - row) * rowBytes, (height - row) * rowBytes), row * rowBytes);
  }
  return image;
}
