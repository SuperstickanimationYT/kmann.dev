import { porkchopGrid } from './porkchop.js';

self.addEventListener('message', ({ data }) => {
  const grid = porkchopGrid(data.spec);
  self.postMessage({ id: data.id, grid }, [grid.c3.buffer, grid.arrivalSpeed.buffer]);
});
