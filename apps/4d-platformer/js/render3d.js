import { add, cross, dot, normalize, scale, sub } from './vec.js';
import { hypercubeEdges, hypercubeVertices } from './shapes.js';
import { dropLine, FOV_HALF_ANGLE_TAN, LINE_SUBDIVISIONS, retinaSegments, visiblePlatformCenters } from './projection.js';
import { drawCaption, drawLabel, FRAME_COLOR, labelColor, lineColor, platformStyle, solidColor, strokeSegment } from './paint.js';
import { playerBox, RIGHT, UP, Y } from './world.js';

const OUTSIDE_CAMERA_POSITION = [-13, 13, -11];
const OUTSIDE_CAMERA_TARGET = [0, 0.5, 2.5];
const OUTSIDE_CAMERA_FOV = 48 * Math.PI / 180;
const LIGHT_DIRECTION = normalize([0.45, 1, -0.3]);
const VIEW_CONE_LENGTH = 4;
const VIEW_CONE_COLOR = '#8fb3e0';
const DROP_OVER_SURFACE_COLOR = '#e2effd';
const DROP_OVER_VOID_COLOR = 'hsl(0 90% 60%)';
const PICTURE_LIGHTNESS = 68;
const PANEL_MARGIN = 16;
const CAPTION_SPACE = 20;
const BANNER_SPACE = 22;
const SQUARE_CORNERS = hypercubeVertices([0, 0], [1, 1]);
const SQUARE_EDGES = hypercubeEdges(2);

function outsideProjector(panel) {
  const forward = normalize(sub(OUTSIDE_CAMERA_TARGET, OUTSIDE_CAMERA_POSITION));
  const right = normalize(cross([0, 1, 0], forward));
  const up = cross(forward, right);
  const focal = panel.half / Math.tan(OUTSIDE_CAMERA_FOV / 2);
  return p => {
    const d = sub(p, OUTSIDE_CAMERA_POSITION);
    const depth = dot(d, forward);
    if (depth < 0.1) return null;
    return { x: panel.cx + dot(d, right) * focal / depth, y: panel.cy - dot(d, up) * focal / depth };
  };
}

function boxFaces(min, max) {
  const faces = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [-1, 1]) {
      const [b, c] = [0, 1, 2].filter(k => k !== axis);
      const corner = (sb, sc) => {
        const p = [];
        p[axis] = side < 0 ? min[axis] : max[axis];
        p[b] = sb < 0 ? min[b] : max[b];
        p[c] = sc < 0 ? min[c] : max[c];
        return p;
      };
      const normal = [0, 0, 0];
      normal[axis] = side;
      faces.push({ normal, corners: [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)] });
    }
  }
  return faces;
}

function fillSolidBox(ctx, project, body, colorOn) {
  const { min, max } = body;
  const center = min.map((v, k) => (v + max[k]) / 2);
  for (const { normal, corners } of boxFaces(min, max)) {
    const faceCenter = add(center, normal.map((s, k) => s * (max[k] - min[k]) / 2));
    if (dot(normal, sub(OUTSIDE_CAMERA_POSITION, faceCenter)) <= 0) continue;
    const points = corners.map(project);
    if (points.some(p => !p)) continue;
    const shade = 0.25 + 0.75 * Math.max(0, dot(normal, LIGHT_DIRECTION));
    ctx.fillStyle = solidColor(body, shade, colorOn);
    ctx.strokeStyle = '#03080f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function strokeWorldLine(ctx, project, a, b, color, width, dash = []) {
  const pa = project(a);
  const pb = project(b);
  if (!pa || !pb) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  strokeSegment(ctx, pa, pb);
  ctx.setLineDash([]);
}

function drawViewCone(ctx, project, game, camera) {
  const F = game.world.forward;
  const apex = camera.position;
  const rayTo = (sr, su) => add(apex, scale(
    add(add(camera.basis[F], scale(camera.basis[RIGHT], sr * FOV_HALF_ANGLE_TAN)), scale(camera.basis[UP], su * FOV_HALF_ANGLE_TAN)),
    VIEW_CONE_LENGTH,
  ));
  const far = [rayTo(-1, -1), rayTo(1, -1), rayTo(1, 1), rayTo(-1, 1)];
  const dash = [5, 4];
  far.forEach((corner, i) => {
    strokeWorldLine(ctx, project, apex, corner, VIEW_CONE_COLOR, 1, dash);
    strokeWorldLine(ctx, project, corner, far[(i + 1) % far.length], VIEW_CONE_COLOR, 1, dash);
  });
  const p = project(apex);
  if (!p) return;
  ctx.fillStyle = VIEW_CONE_COLOR;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
  ctx.fill();
  drawLabel(ctx, 'camera', p.x, p.y - 12, VIEW_CONE_COLOR);
}

function drawOutsideView(ctx, panel, game, camera, settings) {
  const project = outsideProjector(panel);
  const distanceFromViewer = body => Math.hypot(...sub(body.min.map((v, k) => (v + body.max[k]) / 2), OUTSIDE_CAMERA_POSITION));

  ctx.save();
  ctx.beginPath();
  ctx.rect(panel.cx - panel.half, panel.cy - panel.half, 2 * panel.half, 2 * panel.half);
  ctx.clip();

  if (settings.floor && game.world.floor) fillSolidBox(ctx, project, { ...game.world.floor, kind: 'floor' }, settings.color);
  const bodies = [
    ...game.world.platforms.map(p => ({ min: p.min, max: p.max, ...platformStyle(p) })),
    { ...playerBox(game), kind: 'player' },
  ].sort((a, b) => distanceFromViewer(b) - distanceFromViewer(a));
  bodies.forEach(body => fillSolidBox(ctx, project, body, settings.color));

  if (settings.dropLine) {
    const { from, to, overSurface } = dropLine(game);
    strokeWorldLine(ctx, project, from, to, overSurface ? DROP_OVER_SURFACE_COLOR : DROP_OVER_VOID_COLOR, 2);
  }
  drawViewCone(ctx, project, game, camera);

  if (settings.labels) {
    for (const p of game.world.platforms) {
      const above = [...p.center];
      above[Y] = p.max[Y] + 0.35;
      const s = project(above);
      if (s) drawLabel(ctx, p.label, s.x, s.y, labelColor(p, settings.color));
    }
  }
  ctx.restore();
  drawCaption(ctx, 'the world, from outside', panel.cx, panel.cy - panel.half - 6);
}

export function drawPicture(ctx, panel, game, camera, settings) {
  const toPanel = r => ({ x: panel.cx + r[0] * panel.half, y: panel.cy - r[1] * panel.half });
  if (settings.frame) {
    ctx.strokeStyle = FRAME_COLOR;
    ctx.lineWidth = 1;
    for (const [i, j] of SQUARE_EDGES) strokeSegment(ctx, toPanel(SQUARE_CORNERS[i]), toPanel(SQUARE_CORNERS[j]));
  }
  const pieces = retinaSegments(game, camera, settings);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6;
  for (const { ra, rb, style } of pieces) {
    ctx.strokeStyle = lineColor(style, PICTURE_LIGHTNESS, settings.color);
    strokeSegment(ctx, toPanel(ra), toPanel(rb));
  }
  if (settings.labels) {
    for (const { platform, r } of visiblePlatformCenters(game, camera)) {
      const p = toPanel(r);
      drawLabel(ctx, platform.label, p.x, p.y, labelColor(platform, settings.color));
    }
  }
  drawCaption(ctx, 'what the camera sees', panel.cx, panel.cy - panel.half - 6);
  return pieces.length / LINE_SUBDIVISIONS;
}

export function panelSlots(view, count) {
  const left = PANEL_MARGIN;
  const top = PANEL_MARGIN + BANNER_SPACE + CAPTION_SPACE;
  const width = view.width - 2 * PANEL_MARGIN;
  const height = view.height - top - PANEL_MARGIN;
  const halfFor = (slotWidth, slotHeight) => Math.max(40, Math.min(slotWidth, slotHeight) / 2 - PANEL_MARGIN / 2);
  const stackedSlotHeight = (height - CAPTION_SPACE * (count - 1)) / count;
  const sideBySide = halfFor(width / count, height) >= halfFor(width, stackedSlotHeight);
  const half = sideBySide ? halfFor(width / count, height) : halfFor(width, stackedSlotHeight);
  const slot = i => ({
    cx: sideBySide ? left + (width / count) * (i + 0.5) : left + width / 2,
    cy: sideBySide ? top + height / 2 : top + (stackedSlotHeight + CAPTION_SPACE) * i + stackedSlotHeight / 2,
    half,
  });
  return Array.from({ length: count }, (_, i) => slot(i));
}

function layoutPanels(view, showOutside) {
  const slots = panelSlots(view, showOutside ? 2 : 1);
  return showOutside ? { outside: slots[0], picture: slots[1] } : { picture: slots[0] };
}

export function draw3D(ctx, view, game, camera, settings) {
  const panels = layoutPanels(view, settings.outside);
  if (panels.outside) drawOutsideView(ctx, panels.outside, game, camera, settings);
  return drawPicture(ctx, panels.picture, game, camera, settings);
}
