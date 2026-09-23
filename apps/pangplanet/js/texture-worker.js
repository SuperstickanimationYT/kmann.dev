import { renderPlanet } from '../../planet-textures/js/planet.js';

let stamps;

self.onmessage = ({ data }) => {
  if (data.stamps) {
    stamps = data.stamps;
    return;
  }
  const { surface, clouds } = renderPlanet(data.planet, data.size, stamps);
  surface.getContext('2d').drawImage(clouds, 0, 0);
  const bitmap = surface.transferToImageBitmap();
  self.postMessage({ bitmap }, [bitmap]);
};
