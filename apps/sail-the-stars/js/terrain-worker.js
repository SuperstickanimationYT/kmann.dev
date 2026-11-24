import { drainedBy } from './drainage.js';
import { buildRibbon } from './rivers.js';
import { buildScatter } from './surface-scatter.js';
import { buildPatch } from './terrain.js';

const grounds = new Map();

self.onmessage = ({ data }) => {
  if (data.ground) {
    grounds.set(data.body, data.ground);
    return;
  }
  if (data.drain) {
    self.postMessage({ rivers: drainedBy(data.drain) });
    return;
  }
  if (data.ribbon) {
    const ribbon = buildRibbon(grounds.get(data.body).rivers, data.radiusKm, data);
    self.postMessage({ chunk: data.chunk, spacing: data.spacing, riversCount: data.riversCount, ...ribbon }, [ribbon.vertices.buffer, ribbon.indices.buffer]);
    return;
  }
  if (data.scatter) {
    const tile = buildScatter(grounds.get(data.body), data.radiusKm, data);
    self.postMessage({ key: data.key, settingsCount: data.settingsCount, ...tile }, [tile.instances.buffer]);
    return;
  }
  const patch = buildPatch(grounds.get(data.body), data.radiusKm, data);
  self.postMessage({ key: data.key, ...patch }, [patch.vertices.buffer]);
};
