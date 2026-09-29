import { createRandom } from '../../planet-textures/js/random.js';
import { NEBULA_KINDS } from './nebulae.js';

const TILE_PX = 512;
const PARALLAX = 0.02;
const WISPS = 42;
const WISP_RADIUS_PX = [40, 170];
const WISP_ALPHA = [0.05, 0.22];
const TEXTURE_SEED = 0x6e6562;
const GLOW_STRENGTH = 0.9;
const DUST_STRENGTH = 0.85;
const DUST_DIMMING = 0.55;

const textures = new Map();
const patterns = new WeakMap();

function cloudTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const context = canvas.getContext('2d');
  const { between } = createRandom(TEXTURE_SEED);
  const [r, g, b] = NEBULA_KINDS[kind].colour;
  for (let wisp = 0; wisp < WISPS; wisp++) {
    const [x, y, radius, alpha] = [between(0, TILE_PX), between(0, TILE_PX), between(...WISP_RADIUS_PX), between(...WISP_ALPHA)];
    for (const dx of [-TILE_PX, 0, TILE_PX]) {
      for (const dy of [-TILE_PX, 0, TILE_PX]) {
        const glow = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        context.fillStyle = glow;
        context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
      }
    }
  }
  textures.set(kind, canvas);
  return canvas;
}

function cloudPattern(context, kind) {
  if (!patterns.has(context)) patterns.set(context, new Map());
  const byKind = patterns.get(context);
  if (!byKind.has(kind)) byKind.set(kind, context.createPattern(cloudTexture(kind), 'repeat'));
  return byKind.get(kind);
}

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;

function fillWithClouds(context, view, kind, alpha) {
  const reach = Math.hypot(view.width, view.height) / 2 + TILE_PX;
  context.save();
  context.globalAlpha = alpha;
  context.translate(view.width / 2, view.height / 2);
  context.rotate(-view.angle);
  context.translate(-positiveModulo(view.x * PARALLAX, TILE_PX), positiveModulo(view.y * PARALLAX, TILE_PX));
  context.fillStyle = cloudPattern(context, kind);
  context.fillRect(-reach, -reach, reach * 2, reach * 2);
  context.restore();
}

export function drawNebulaGlow(context, view, here) {
  if (!here || here.nebula.kind === 'dark') return;
  fillWithClouds(context, view, here.nebula.kind, GLOW_STRENGTH * here.density);
}

export function drawNebulaDust(context, view, here) {
  if (here?.nebula.kind !== 'dark') return;
  context.fillStyle = `rgba(0, 0, 0, ${DUST_DIMMING * here.density})`;
  context.fillRect(0, 0, view.width, view.height);
  fillWithClouds(context, view, 'dark', DUST_STRENGTH * here.density);
}
