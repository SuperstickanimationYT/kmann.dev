import { keepStars, removeStars } from './stars.js';

function buffers(layer) {
  return [layer.r.buffer, layer.g.buffer, layer.b.buffer];
}

self.addEventListener('message', ({ data }) => {
  const { job, image, options } = data;
  const result = options.remove ? removeStars(image, options) : keepStars(image);
  self.postMessage({ job, ...result }, [...buffers(result.starless), ...buffers(result.stars)]);
});
