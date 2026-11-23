import { add, dot, subtract } from './vectors.js';

const ORBIT_RGB = '143, 196, 255';
const ORBIT_ALPHA = 0.28;
const TRAIL_SHARE = 1 / 6;
const NEAREST_DEPTH_KM = 1;
const SMALLEST_ORBIT_PX = 6;
const BODY_DOT_PX = 2.5;
const SMALLEST_MASKED_DISC_PX = 3;

function clipToFront(from, to) {
  if (from[2] >= NEAREST_DEPTH_KM && to[2] >= NEAREST_DEPTH_KM) return [from, to];
  if (from[2] < NEAREST_DEPTH_KM && to[2] < NEAREST_DEPTH_KM) return null;
  const share = (NEAREST_DEPTH_KM - from[2]) / (to[2] - from[2]);
  const cut = from.map((value, axis) => value + (to[axis] - value) * share);
  return from[2] < NEAREST_DEPTH_KM ? [cut, to] : [from, cut];
}

export function drawOrbits(context, { paths, offsetOf, bodies, basis, tanHalf, width, height }) {
  const pixelsPerTan = height / 2 / tanHalf[1];
  const toCamera = (offset) => [dot(offset, basis.right), dot(offset, basis.up), dot(offset, basis.forward)];
  const toScreen = ([x, y, z]) => [((x / z / tanHalf[0]) * 0.5 + 0.5) * width, (0.5 - (y / z / tanHalf[1]) * 0.5) * height];
  const strokeSegment = (segment) => {
    context.moveTo(...toScreen(segment[0]));
    context.lineTo(...toScreen(segment[1]));
  };
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  for (const { offsetKm, radiusKm } of bodies) {
    const centre = toCamera(offsetKm);
    if (centre[2] <= radiusKm) continue;
    const discPx = (radiusKm / centre[2]) * pixelsPerTan;
    if (discPx < SMALLEST_MASKED_DISC_PX) continue;
    const [x, y] = toScreen(centre);
    context.moveTo(x + discPx, y);
    context.arc(x, y, discPx, 0, 2 * Math.PI);
  }
  context.clip('evenodd');
  context.lineWidth = 1.25;
  for (const { name, parent, pointsKm } of paths) {
    const parentOffset = offsetOf(parent);
    const bodyOffset = offsetOf(name);
    if (!parentOffset || !bodyOffset) continue;
    const radiusKm = Math.hypot(...pointsKm[0]);
    if ((radiusKm / Math.max(Math.hypot(...parentOffset), radiusKm)) * pixelsPerTan < SMALLEST_ORBIT_PX) continue;
    const throughBody = subtract(bodyOffset, pointsKm[0]);
    const points = pointsKm.map((point) => toCamera(add(throughBody, point)));
    const segments = points.map((point, index) => clipToFront(point, points[(index + 1) % points.length]));
    context.strokeStyle = `rgba(${ORBIT_RGB}, ${ORBIT_ALPHA})`;
    context.beginPath();
    segments.forEach((segment) => segment && strokeSegment(segment));
    context.stroke();
    const trailSegments = Math.round(points.length * TRAIL_SHARE);
    segments.slice(0, trailSegments).forEach((segment, index) => {
      if (!segment) return;
      context.strokeStyle = `rgba(${ORBIT_RGB}, ${(1 - ORBIT_ALPHA) * (1 - index / trailSegments)})`;
      context.beginPath();
      strokeSegment(segment);
      context.stroke();
    });
    if (points[0][2] < NEAREST_DEPTH_KM) continue;
    context.fillStyle = `rgb(${ORBIT_RGB})`;
    context.beginPath();
    context.arc(...toScreen(points[0]), BODY_DOT_PX, 0, 2 * Math.PI);
    context.fill();
  }
  context.restore();
}
