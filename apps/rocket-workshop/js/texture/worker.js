import { renderPlanet } from './planet.js';

self.onmessage = ({ data: { name, look, size } }) => {
  const { surface, sky } = renderPlanet(look, size);
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d');
  context.drawImage(surface, 0, 0);
  context.drawImage(sky, 0, 0);
  const image = canvas.transferToImageBitmap();
  self.postMessage({ name, image }, [image]);
};
