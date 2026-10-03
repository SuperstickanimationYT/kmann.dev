import { hypercubeEdges, hypercubeVertices } from './shapes.js';
import { drawCaption, drawLabel, strokeSegment } from './paint.js';
import { dot, sub } from './vec.js';

const VIEWER_DISTANCE = 4.5;
const VIEWER_YAW = 28 * Math.PI / 180;
const VIEWER_PITCH = 18 * Math.PI / 180;
const BALL_SIZE_OF_PANEL = 0.62;
const CUBE_CORNERS = hypercubeVertices([0, 0, 0], [1, 1, 1]);
const CUBE_EDGES = hypercubeEdges(3);
const FRAME = 'rgba(95, 140, 200, 0.35)';
const NODE_RADIUS = { least: 2.5, extra: 9 };
const LABEL_OUTSET = 1.32;
const RAY_VIEW_REACH = 2;
const CLIP_LIMIT = 1.15;
const PLATE_HALF = 0.35;

function projector(panel) {
  const [cy, sy, cp, sp] = [Math.cos(VIEWER_YAW), Math.sin(VIEWER_YAW), Math.cos(VIEWER_PITCH), Math.sin(VIEWER_PITCH)];
  const scaleFor = BALL_SIZE_OF_PANEL * panel.half;
  return ([a, b, c]) => {
    const x1 = cy * a + sy * c;
    const z1 = -sy * a + cy * c;
    const y2 = cp * b - sp * z1;
    const depth = VIEWER_DISTANCE + sp * b + cp * z1;
    const k = (scaleFor * VIEWER_DISTANCE) / depth;
    return { x: panel.cx + x1 * k, y: panel.cy - y2 * k, depth };
  };
}

function nodeColor(kind, nearness, alpha = 1) {
  if (kind === 'goal') return `hsla(45 100% ${45 + 30 * nearness}% / ${alpha})`;
  return `hsla(195 85% ${14 + 70 * nearness}% / ${alpha})`;
}

function drawFrame(ctx, project) {
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 1;
  for (const [i, j] of CUBE_EDGES) strokeSegment(ctx, project(CUBE_CORNERS[i]), project(CUBE_CORNERS[j]));
}

function drawYou(ctx, project) {
  const you = project([0, 0, 0]);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(you.x, you.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSensorBall(ctx, panel, { frame, readings }) {
  const project = projector(panel);
  drawFrame(ctx, project);
  const you = project([0, 0, 0]);
  const nodes = readings
    .map(reading => ({ ...reading, at: project(reading.sensorDirection) }))
    .sort((p, q) => q.at.depth - p.at.depth);
  ctx.lineWidth = 1;
  for (const { at, kind, nearness } of nodes) {
    ctx.strokeStyle = nodeColor(kind, nearness, 0.35);
    strokeSegment(ctx, you, at);
  }
  drawYou(ctx, project);
  for (const { at, kind, nearness } of nodes) {
    ctx.beginPath();
    ctx.arc(at.x, at.y, NODE_RADIUS.least + NODE_RADIUS.extra * nearness ** 2, 0, Math.PI * 2);
    if (kind === 'nothing') {
      ctx.strokeStyle = 'rgba(140, 170, 210, 0.45)';
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = nodeColor(kind, nearness);
    ctx.fill();
  }
  frame.names.forEach((name, axis) => {
    for (const [sign, label] of [[1, name], [-1, frame.oppositeNames[axis]]]) {
      const outside = [0, 0, 0];
      outside[axis] = sign * LABEL_OUTSET;
      const at = project(outside);
      drawLabel(ctx, label, at.x, at.y, 'rgba(160, 195, 235, 0.85)');
    }
  });
  drawCaption(ctx, 'sensors: bigger and brighter is closer', panel.cx, panel.cy - panel.half - 6);
}

function clipToCube(a, b) {
  let [t0, t1] = [0, 1];
  for (let axis = 0; axis < 3; axis++) {
    const d = b[axis] - a[axis];
    for (const [limit, sign] of [[-CLIP_LIMIT, 1], [CLIP_LIMIT, -1]]) {
      const inside = sign * (a[axis] - limit);
      const rate = sign * d;
      if (Math.abs(rate) < 1e-12) {
        if (inside < 0) return null;
        continue;
      }
      const t = -inside / rate;
      if (rate > 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  if (t0 > t1) return null;
  const at = t => a.map((v, k) => v + (b[k] - v) * t);
  return [at(t0), at(t1)];
}

function plateCorners(hitPoint, faceAxis) {
  const [u, v] = [0, 1, 2].filter(axis => axis !== faceAxis);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([su, sv]) => {
    const corner = [...hitPoint];
    corner[u] += su * PLATE_HALF;
    corner[v] += sv * PLATE_HALF;
    return corner;
  });
}

function drawPlate(ctx, project, toBall, { hitPoint, faceAxis, kind, nearness }) {
  const corners = plateCorners(hitPoint, faceAxis).map(corner => toBall(corner));
  if (corners.some(corner => corner.some(v => Math.abs(v) > CLIP_LIMIT))) return;
  ctx.beginPath();
  corners.map(project).forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = nodeColor(kind, nearness, 0.28);
  ctx.strokeStyle = nodeColor(kind, nearness, 0.8);
  ctx.fill();
  ctx.stroke();
}

export function drawRaysInWorld(ctx, panel, game, { frame, readings }) {
  const project = projector(panel);
  const toBall = point => frame.axes.map(axis => dot(sub(point, frame.origin), axis) / RAY_VIEW_REACH);
  drawFrame(ctx, project);
  ctx.lineWidth = 1;
  const plated = readings
    .filter(reading => reading.kind !== 'nothing')
    .sort((p, q) => project(toBall(q.hitPoint)).depth - project(toBall(p.hitPoint)).depth);
  plated.forEach(reading => drawPlate(ctx, project, toBall, reading));
  const you = project([0, 0, 0]);
  for (const { sensorDirection, distance, kind, nearness } of readings) {
    const clipped = clipToCube([0, 0, 0], sensorDirection.map(s => (s * distance) / RAY_VIEW_REACH));
    const end = project(clipped[1]);
    ctx.strokeStyle = nodeColor(kind, Math.max(nearness, 0.35));
    ctx.lineWidth = 1.5;
    strokeSegment(ctx, you, end);
    if (kind === 'nothing') continue;
    ctx.fillStyle = nodeColor(kind, nearness);
    ctx.beginPath();
    ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  drawYou(ctx, project);
  drawCaption(ctx, 'the same rays, and the walls they hit', panel.cx, panel.cy - panel.half - 6);
}
