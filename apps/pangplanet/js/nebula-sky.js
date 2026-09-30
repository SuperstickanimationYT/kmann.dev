import { createRandom } from '../../planet-textures/js/random.js';
import { NEBULA_KINDS } from './nebulae.js';

const TILE_PX = 512;
const TILE_SCALE = 5;
const TILE_ON_SCREEN_PX = TILE_PX * TILE_SCALE;
const PARALLAX = 0.2;
const MAX_DRIFT_PX_PER_FRAME = TILE_ON_SCREEN_PX / 20;
const CLUSTERS = 4;
const CLUSTER_SPREAD_PX = 110;
const WISPS = 60;
const WISP_RADIUS_PX = [20, 110];
const WISP_ALPHA = [0.06, 0.3];
const TEXTURE_SEED = 0x6e6562;
const GLOW_STRENGTH = 0.9;
const DUST_STRENGTH = 0.85;
const DUST_DIMMING = 0.55;

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;

const textures = new Map();
let patterns = new WeakMap();
const drift = { x: 0, y: 0, lastX: null, lastY: null };

function cloudTexture(kind) {
  if (textures.has(kind)) return textures.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const context = canvas.getContext('2d');
  const { between, integer } = createRandom(TEXTURE_SEED);
  const [r, g, b] = NEBULA_KINDS[kind].colour;
  const clusters = Array.from({ length: CLUSTERS }, () => [between(0, TILE_PX), between(0, TILE_PX)]);
  const scatter = () => (between(-1, 1) + between(-1, 1)) * CLUSTER_SPREAD_PX;
  for (let wisp = 0; wisp < WISPS; wisp++) {
    const [clusterX, clusterY] = clusters[integer(0, CLUSTERS - 1)];
    const [x, y] = [positiveModulo(clusterX + scatter(), TILE_PX), positiveModulo(clusterY + scatter(), TILE_PX)];
    const [radius, alpha] = [between(...WISP_RADIUS_PX), between(...WISP_ALPHA)];
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

export function forgetNebulaTextures() {
  textures.clear();
  patterns = new WeakMap();
}

function driftWith(view) {
  const [dx, dy] = drift.lastX === null ? [0, 0] : [view.x - drift.lastX, view.y - drift.lastY];
  drift.lastX = view.x;
  drift.lastY = view.y;
  const moved = Math.hypot(dx, dy);
  if (moved === 0) return;
  const shift = MAX_DRIFT_PX_PER_FRAME * Math.tanh((moved * PARALLAX) / MAX_DRIFT_PX_PER_FRAME);
  drift.x = positiveModulo(drift.x + (dx / moved) * shift, TILE_ON_SCREEN_PX);
  drift.y = positiveModulo(drift.y + (dy / moved) * shift, TILE_ON_SCREEN_PX);
}

function fillWithClouds(context, view, kind, alpha) {
  driftWith(view);
  const reach = (Math.hypot(view.width, view.height) / 2 + TILE_ON_SCREEN_PX) / TILE_SCALE;
  context.save();
  context.globalAlpha = alpha;
  context.translate(view.width / 2, view.height / 2);
  context.rotate(-view.angle);
  context.translate(-drift.x, drift.y);
  context.scale(TILE_SCALE, TILE_SCALE);
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
