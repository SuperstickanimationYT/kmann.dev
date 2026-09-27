import { renderPlanet } from '../../planet-textures/js/planet.js';

self.onmessage = ({ data }) => {
  const { surface, sky } = renderPlanet(data.planet, data.size);
  surface.getContext('2d').drawImage(sky, 0, 0);
  const bitmap = surface.transferToImageBitmap();
  self.postMessage({ bitmap }, [bitmap]);
};
