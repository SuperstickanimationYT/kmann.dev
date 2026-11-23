import { buildPatch } from './terrain.js';

const grounds = new Map();

self.onmessage = ({ data }) => {
  if (data.ground) {
    grounds.set(data.body, data.ground);
    return;
  }
  const patch = buildPatch(grounds.get(data.body), data.radiusKm, data);
  self.postMessage({ key: data.key, ...patch }, [patch.vertices.buffer]);
};
