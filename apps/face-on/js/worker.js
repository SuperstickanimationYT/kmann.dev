import { keepStars, measureStarSize, radiusForStarWidth, removeStars } from './stars.js';

function buffers(layer) {
  return [layer.r.buffer, layer.g.buffer, layer.b.buffer];
}

self.addEventListener('message', ({ data }) => {
  const { job, image, options } = data;
  const starWidth = options.measure ? measureStarSize(image) : null;
  const radius = starWidth === null ? options.radius : radiusForStarWidth(starWidth);
  const result = options.remove ? removeStars(image, { ...options, radius }) : keepStars(image);
  self.postMessage({ job, ...result, starWidth, radius }, [...buffers(result.starless), ...buffers(result.stars)]);
});
