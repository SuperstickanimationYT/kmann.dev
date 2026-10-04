import { randomSeed } from '../js/random.js';
import { fakeSettingsFor } from './match.js';

export const SHOWN_WIDTH = 800;
export const SHOWN_HEIGHT = 600;
const RENDER_SCALE = 2;

const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));

export async function renderTwin(renderer, photo) {
  const settings = fakeSettingsFor(photo, randomSeed());
  const full = await renderer.renderToCanvas(settings, SHOWN_WIDTH * RENDER_SCALE, SHOWN_HEIGHT * RENDER_SCALE, nextFrame);
  const shown = document.createElement('canvas');
  shown.width = SHOWN_WIDTH;
  shown.height = SHOWN_HEIGHT;
  const context = shown.getContext('2d', { willReadFrequently: true });
  context.imageSmoothingQuality = 'high';
  context.drawImage(full, 0, 0, SHOWN_WIDTH, SHOWN_HEIGHT);
  return { canvas: shown, settings };
}
