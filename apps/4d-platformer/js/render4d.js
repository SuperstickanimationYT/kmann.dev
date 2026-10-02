import { hypercubeEdges, hypercubeVertices } from './shapes.js';
import { LINE_SUBDIVISIONS, retinaSegments, visiblePlatformCenters } from './projection.js';
import { drawLabel, FRAME_COLOR, labelColor, lineColor, strokeSegment } from './paint.js';

const VIEWER_DISTANCE = 4.2;
const VIEWER_BASE_YAW = 35 * Math.PI / 180;
const VIEWER_PITCH = 22 * Math.PI / 180;
const WOBBLE_AMPLITUDE = 7 * Math.PI / 180;
const WOBBLE_PERIOD_S = 4;
const RETINA_SIZE_OF_VIEW = 0.3;
const AUTO_CONTRAST_SMOOTHING = 0.15;
const FLAT_LIGHTNESS = 68;
const RETINA_BOX_DEPTHS = { near: VIEWER_DISTANCE - Math.sqrt(3), far: VIEWER_DISTANCE + Math.sqrt(3) };
const CUBE_VERTICES = hypercubeVertices([0, 0, 0], [1, 1, 1]);
const CUBE_EDGES = hypercubeEdges(3);

function viewerYaw(settings, timeS) {
  const wobble = settings.wobble ? WOBBLE_AMPLITUDE * Math.sin(2 * Math.PI * timeS / WOBBLE_PERIOD_S) : 0;
  return VIEWER_BASE_YAW + wobble;
}

function cubeToScreen(view, r, yaw) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = cy * r[0] + sy * r[2];
  const z1 = -sy * r[0] + cy * r[2];
  const cp = Math.cos(VIEWER_PITCH);
  const sp = Math.sin(VIEWER_PITCH);
  const y2 = cp * r[1] - sp * z1;
  const z2 = sp * r[1] + cp * z1;
  const depth = VIEWER_DISTANCE + z2;
  const k = RETINA_SIZE_OF_VIEW * Math.min(view.width, view.height) * VIEWER_DISTANCE / depth;
  return { x: view.width / 2 + x1 * k, y: view.height / 2 - y2 * k, depth };
}

export function createRenderer4D() {
  const depthRange = { ...RETINA_BOX_DEPTHS };

  function trackDepthRange(pieces, settings) {
    let target = RETINA_BOX_DEPTHS;
    if (settings.autoContrast && pieces.length) {
      let near = Infinity;
      let far = -Infinity;
      for (const { a, b } of pieces) {
        near = Math.min(near, a.depth, b.depth);
        far = Math.max(far, a.depth, b.depth);
      }
      target = { near, far: Math.max(far, near + 0.05) };
    }
    depthRange.near += (target.near - depthRange.near) * AUTO_CONTRAST_SMOOTHING;
    depthRange.far += (target.far - depthRange.far) * AUTO_CONTRAST_SMOOTHING;
  }

  const farness = depth => Math.min(1, Math.max(0, (depth - depthRange.near) / (depthRange.far - depthRange.near)));
  const lightnessAt = (depth, settings) => (settings.brightness ? 92 - 74 * farness(depth) : FLAT_LIGHTNESS);
  const widthAt = (depth, settings) => (settings.width ? 0.7 + 3.3 * (1 - farness(depth)) : 1.6);

  function strokeDepthLine(ctx, a, b, style, settings) {
    const gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    gradient.addColorStop(0, lineColor(style, lightnessAt(a.depth, settings), settings.color));
    gradient.addColorStop(1, lineColor(style, lightnessAt(b.depth, settings), settings.color));
    ctx.strokeStyle = gradient;
    ctx.lineWidth = widthAt((a.depth + b.depth) / 2, settings);
    strokeSegment(ctx, a, b);
  }

  function draw(ctx, view, game, camera, settings, timeS) {
    const yaw = viewerYaw(settings, timeS);
    if (settings.frame) {
      ctx.strokeStyle = FRAME_COLOR;
      ctx.lineWidth = 1;
      for (const [i, j] of CUBE_EDGES) {
        strokeSegment(ctx, cubeToScreen(view, CUBE_VERTICES[i], yaw), cubeToScreen(view, CUBE_VERTICES[j], yaw));
      }
    }

    const pieces = retinaSegments(game, camera, settings).map(({ ra, rb, style }) => {
      const a = cubeToScreen(view, ra, yaw);
      const b = cubeToScreen(view, rb, yaw);
      return { a, b, style, depth: (a.depth + b.depth) / 2 };
    });
    trackDepthRange(pieces, settings);
    pieces.sort((p, q) => q.depth - p.depth);
    ctx.lineCap = 'round';
    for (const { a, b, style } of pieces) strokeDepthLine(ctx, a, b, style, settings);

    if (settings.labels) {
      for (const { platform, r } of visiblePlatformCenters(game, camera)) {
        const s = cubeToScreen(view, r, yaw);
        drawLabel(ctx, platform.label, s.x, s.y, labelColor(platform, settings.color));
      }
    }
    return pieces.length / LINE_SUBDIVISIONS;
  }

  return {
    draw,
    reset: () => Object.assign(depthRange, RETINA_BOX_DEPTHS),
  };
}
