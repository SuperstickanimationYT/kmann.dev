import { toScreen } from './camera.js';
import { apoapsis, orbitPath } from './orbits.js';
import { hillRadius, treeOrder } from './system.js';
import { AU, KM, distance } from './units.js';

const BACKGROUND = '#03080f';
const LABEL = 'rgba(214, 228, 245, 0.85)';
const STATUS_COLOURS = { fail: '#ff5c5c', warn: '#ffb347' };
const SMALLEST_DOT = { star: 5, planet: 3.5, moon: 2.5 };
const SMALLEST_VISIBLE_ORBIT_PX = 6;
const PICK_RADIUS_PX = 14;
const SCALE_BAR_PX = 120;
const SCALE_BAR_LIFT_PX = 84;

const pathCache = new WeakMap();

function cachedPath(orbit) {
  const key = JSON.stringify(orbit);
  const cached = pathCache.get(orbit);
  if (cached?.key === key) return cached.points;
  const points = orbitPath(orbit);
  pathCache.set(orbit, { key, points });
  return points;
}

export function visibleBodies(system, camera, selectedId) {
  return treeOrder(system)
    .map(({ body }) => body)
    .filter((body) => !body.parent || body.id === selectedId || apoapsis(body.orbit) * camera.scale >= SMALLEST_VISIBLE_ORBIT_PX);
}

export function bodyAt(system, placed, camera, selectedId, screenX, screenY) {
  let nearest = null;
  let nearestGap = PICK_RADIUS_PX;
  for (const body of visibleBodies(system, camera, selectedId)) {
    const point = toScreen(camera, placed.get(body.id));
    const gap = Math.hypot(point.x - screenX, point.y - screenY) - body.radiusM * camera.scale;
    if (gap < nearestGap) {
      nearest = body;
      nearestGap = gap;
    }
  }
  return nearest;
}

function roundDown125(value) {
  const power = 10 ** Math.floor(Math.log10(value));
  const leading = value / power;
  return (leading >= 5 ? 5 : leading >= 2 ? 2 : 1) * power;
}

function niceLength(metres) {
  const unit = metres >= 0.01 * AU ? AU : KM;
  return roundDown125(metres / unit) * unit;
}

function drawScaleBar(context, camera) {
  const length = niceLength(SCALE_BAR_PX / camera.scale);
  const pixels = length * camera.scale;
  const y = camera.height - SCALE_BAR_LIFT_PX;
  context.strokeStyle = LABEL;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(16, y - 4);
  context.lineTo(16, y);
  context.lineTo(16 + pixels, y);
  context.lineTo(16 + pixels, y - 4);
  context.stroke();
  context.fillStyle = LABEL;
  context.font = '12px system-ui, sans-serif';
  context.textBaseline = 'bottom';
  context.fillText(distance(length), 16, y - 6);
}

function drawOrbit(context, camera, body, origin, colour, width) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.beginPath();
  cachedPath(body.orbit).forEach((offset, index) => {
    const point = toScreen(camera, { x: origin.x + offset.x, y: origin.y + offset.y });
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.stroke();
}

function ring(context, point, radius, colour, width, dash = []) {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.setLineDash(dash);
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
}

export function drawSystem(context, { system, placed, camera, selectedId, statusByBody }) {
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, camera.width, camera.height);
  const bodies = visibleBodies(system, camera, selectedId);

  for (const body of bodies) {
    if (!body.parent) continue;
    const status = STATUS_COLOURS[statusByBody.get(body.id)];
    const selected = body.id === selectedId;
    const colour = status ?? (selected ? 'rgba(214, 228, 245, 0.8)' : 'rgba(120, 160, 210, 0.28)');
    drawOrbit(context, camera, body, placed.get(body.parent), colour, selected ? 1.6 : 1);
  }

  context.font = '12px system-ui, sans-serif';
  context.textBaseline = 'middle';
  for (const body of bodies) {
    const point = toScreen(camera, placed.get(body.id));
    const radius = Math.max(body.radiusM * camera.scale, SMALLEST_DOT[body.kind]);
    if (body.kind === 'star') {
      context.shadowColor = body.color;
      context.shadowBlur = 16;
    }
    context.fillStyle = body.color;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowBlur = 0;

    const status = STATUS_COLOURS[statusByBody.get(body.id)];
    if (status) ring(context, point, radius + 4, status, 2);
    if (body.id === selectedId) {
      ring(context, point, radius + 8, 'rgba(255, 255, 255, 0.9)', 1.5);
      const hill = hillRadius(system, body) * camera.scale;
      if (Number.isFinite(hill) && hill > radius + 12) ring(context, point, hill, 'rgba(159, 214, 200, 0.6)', 1, [5, 5]);
    }
    context.fillStyle = LABEL;
    context.fillText(body.name, point.x + radius + 12, point.y);
  }

  drawScaleBar(context, camera);
}
