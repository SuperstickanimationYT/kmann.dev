const MS_PER_DAY = 86400000;
const CLOUD_LAP_DAYS = 40;

export const SIMULATED_CLOUD_MAPS = 10;

export const cloudTurn = (ms) => 2 * Math.PI * ((ms / (CLOUD_LAP_DAYS * MS_PER_DAY)) % 1);

const cloudImage = async (name, [width, height]) => {
  const response = await fetch(new URL(`data/clouds/${name}.webp`, window.location.href));
  return createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
};

function coverBesideTops(cover, tops, [width, height]) {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  context.globalCompositeOperation = 'lighter';
  for (const [image, colour] of [[cover, '#ff0000'], [tops, '#00ff00']]) {
    const tinted = new OffscreenCanvas(width, height);
    const paint = tinted.getContext('2d');
    paint.drawImage(image, 0, 0);
    paint.globalCompositeOperation = 'multiply';
    paint.fillStyle = colour;
    paint.fillRect(0, 0, width, height);
    context.drawImage(tinted, 0, 0);
    image.close();
  }
  return canvas;
}

const requested = new Set();

export function loadCloudMapsOf(bodies, size, onLoaded, onFailed) {
  const wanted = bodies.map(({ invented }) => invented?.cloudMap).filter((layer) => layer !== undefined && !requested.has(layer));
  for (const layer of new Set(wanted)) {
    requested.add(layer);
    Promise.all([cloudImage(`cover-${layer}`, size), cloudImage(`tops-${layer}`, size)])
      .then(([cover, tops]) => onLoaded(layer, coverBesideTops(cover, tops, size)))
      .catch(onFailed);
  }
}
