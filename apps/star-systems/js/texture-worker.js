import { renderPlanet } from '../../planet-textures/js/planet.js';

self.onmessage = ({ data }) => {
  const { surface, sky } = renderPlanet(data.look, data.size);
  const flat = new OffscreenCanvas(data.size, data.size);
  const context = flat.getContext('2d');
  context.drawImage(surface, 0, 0);
  context.drawImage(sky, 0, 0);
  const bitmap = flat.transferToImageBitmap();
  self.postMessage({ key: data.key, size: data.size, bitmap }, [bitmap]);
};
