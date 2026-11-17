import { gridBuffers, porkchopGrid } from './porkchop.js';

self.addEventListener('message', ({ data }) => {
  const grid = porkchopGrid(data.spec);
  self.postMessage({ id: data.id, grid }, gridBuffers(grid));
});
