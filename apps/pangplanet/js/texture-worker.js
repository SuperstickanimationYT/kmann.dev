import { renderPlanet } from '../../planet-textures/js/planet.js';

self.onmessage = ({ data }) => {
  const layers = renderPlanet(data.planet, data.size);
  const surface = layers.surface.transferToImageBitmap();
  const hasSky = data.planet.clouds > 0 || data.planet.haze > 0;
  const sky = hasSky ? layers.sky.transferToImageBitmap() : null;
  self.postMessage({ surface, sky }, sky ? [surface, sky] : [surface]);
};
