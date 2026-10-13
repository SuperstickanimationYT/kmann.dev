const TILE_CENTER = [28.06, 28.06];

const COSTUMES = {
  empty: TILE_CENTER,
  deposit: TILE_CENTER,
  ice: TILE_CENTER,
  'wall-horizontal': TILE_CENTER,
  'wall-vertical': TILE_CENTER,
  'wall-top-left': TILE_CENTER,
  'wall-top-right': TILE_CENTER,
  'wall-bottom-right': TILE_CENTER,
  'wall-bottom-left': TILE_CENTER,
  'air-generator': TILE_CENTER,
  'water-generator': TILE_CENTER,
  'solar-panel': TILE_CENTER,
  barrel: TILE_CENTER,
  smelter: TILE_CENTER,
  electrolyzer: TILE_CENTER,
  'launch-pad': TILE_CENTER,
  'mode-build': [42.5, 37.12],
  'mode-place': [42.5, 37.12],
  'mode-play': [42.5, 37.12],
  player: [11.06, 11],
  'lander-off': [53.33, 93.28],
  'lander-on': [53.33, 93.28],
  debris: [3.33, 3.33],
};

const costumes = {};

function load(name) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const [cx, cy] = COSTUMES[name];
      costumes[name] = { image, cx, cy, width: image.naturalWidth, height: image.naturalHeight };
      resolve();
    };
    image.onerror = reject;
    image.src = `art/${name}.svg`;
  });
}

export function loadCostumes() {
  return Promise.all(Object.keys(COSTUMES).map(load));
}

export function drawCostume(context, name, x, y, { size = 1, direction = 90, alpha = 1 } = {}) {
  const costume = costumes[name];
  context.save();
  context.globalAlpha = alpha;
  context.translate(240 + x, 180 - y);
  context.rotate(((direction - 90) * Math.PI) / 180);
  context.scale(size, size);
  context.drawImage(costume.image, -costume.cx, -costume.cy, costume.width, costume.height);
  context.restore();
}
