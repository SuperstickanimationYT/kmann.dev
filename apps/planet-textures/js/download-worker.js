import { renderPlanet } from './planet.js';

self.onmessage = async ({ data: { planet, size, layer } }) => {
  const { surface, sky } = renderPlanet(planet, size);
  if (layer === 'planet') surface.getContext('2d').drawImage(sky, 0, 0);
  self.postMessage(await (layer === 'sky' ? sky : surface).convertToBlob({ type: 'image/png' }));
};
