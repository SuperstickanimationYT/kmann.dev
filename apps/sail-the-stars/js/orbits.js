import { longestRadiusKm, stretchedToBall } from './solar-system.js';
import { add, cross, dot, scale, subtract } from './vectors.js';

const ORBIT_RGB = '143, 196, 255';
const ORBIT_ALPHA = 0.28;
const TRAIL_SHARE = 1 / 6;
const NEAREST_DEPTH_KM = 1;
const GUARD_BAND = 3;
const SMALLEST_ORBIT_PX = 6;
const BODY_DOT_PX = 2.5;
const SMALLEST_HIDING_DISC_PX = 3;
const FLAT = 1e-12;

function clipToView(from, to, [tanX, tanY]) {
  const reachX = GUARD_BAND * tanX;
  const reachY = GUARD_BAND * tanY;
  const keepSides = [
    (point) => point[2] - NEAREST_DEPTH_KM,
    (point) => reachX * point[2] - point[0],
    (point) => reachX * point[2] + point[0],
    (point) => reachY * point[2] - point[1],
    (point) => reachY * point[2] + point[1],
  ];
  let enter = 0;
  let leave = 1;
  for (const side of keepSides) {
    const atFrom = side(from);
    const atTo = side(to);
    if (atFrom < 0 && atTo < 0) return null;
    if (atFrom < 0) enter = Math.max(enter, atFrom / (atFrom - atTo));
    if (atTo < 0) leave = Math.min(leave, atFrom / (atFrom - atTo));
  }
  if (enter > leave) return null;
  const at = (share) => from.map((value, axis) => value + (to[axis] - value) * share);
  return [at(enter), at(leave)];
}

function negativeSpans(a, b, c) {
  if (Math.abs(a) < FLAT) {
    if (Math.abs(b) < FLAT) return c < 0 ? [[-Infinity, Infinity]] : [];
    const root = -c / b;
    return b > 0 ? [[-Infinity, root]] : [[root, Infinity]];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return a < 0 ? [[-Infinity, Infinity]] : [];
  const spread = Math.sqrt(discriminant);
  const [low, high] = [(-b - spread) / (2 * a), (-b + spread) / (2 * a)].sort((x, y) => x - y);
  return a > 0 ? [[low, high]] : [[-Infinity, low], [high, Infinity]];
}

function hiderOf(body, toCamera) {
  const rounded = body.flattening ? stretchedToBall({ ...body, north: toCamera(body.north), meridian: toCamera(body.meridian) }) : (point) => point;
  return { rounded, centre: rounded(toCamera(body.offsetKm)), radiusSquared: longestRadiusKm(body) ** 2 };
}

function hiddenSpans(seenFrom, seenTo, { rounded, centre, radiusSquared }) {
  const from = rounded(seenFrom);
  const to = rounded(seenTo);
  const along = subtract(to, from);
  const fromCentre = subtract(from, centre);
  const insideBody = negativeSpans(dot(along, along), 2 * dot(fromCentre, along), dot(fromCentre, fromCentre) - radiusSquared);
  const sideways = cross(centre, from);
  const sidewaysRate = cross(centre, along);
  const insideCone = negativeSpans(
    dot(sidewaysRate, sidewaysRate) - radiusSquared * dot(along, along),
    2 * (dot(sideways, sidewaysRate) - radiusSquared * dot(from, along)),
    dot(sideways, sideways) - radiusSquared * dot(from, from),
  );
  const silhouette = dot(centre, centre) - radiusSquared;
  const [beyondSilhouette] = negativeSpans(0, -dot(along, centre), silhouette - dot(from, centre));
  const behindBody = beyondSilhouette
    ? insideCone.map(([start, end]) => [Math.max(start, beyondSilhouette[0]), Math.min(end, beyondSilhouette[1])]).filter(([start, end]) => start < end)
    : [];
  return [...insideBody, ...behindBody];
}

function visiblePieces(segment, hiders) {
  const hidden = hiders
    .flatMap((hider) => hiddenSpans(segment[0], segment[1], hider))
    .map(([start, end]) => [Math.max(0, start), Math.min(1, end)])
    .filter(([start, end]) => start < end)
    .sort((x, y) => x[0] - y[0]);
  const pieces = [];
  let shown = 0;
  for (const [start, end] of hidden) {
    if (start > shown) pieces.push([shown, start]);
    shown = Math.max(shown, end);
  }
  if (shown < 1) pieces.push([shown, 1]);
  const at = (share) => add(segment[0], scale(subtract(segment[1], segment[0]), share));
  return pieces.map(([start, end]) => [at(start), at(end)]);
}

const pointHidden = (point, hiders) => hiders.some((hider) => hiddenSpans(point, point, hider).length > 0);

function pencil(context, { bodies, basis, tanHalf, width, height }) {
  const pixelsPerTan = height / 2 / tanHalf[1];
  const toCamera = (offset) => [dot(offset, basis.right), dot(offset, basis.up), dot(offset, basis.forward)];
  const toScreen = ([x, y, z]) => [((x / z / tanHalf[0]) * 0.5 + 0.5) * width, (0.5 - (y / z / tanHalf[1]) * 0.5) * height];
  const hiders = bodies
    .filter(({ offsetKm, radiusKm }) => (radiusKm / Math.hypot(...offsetKm)) * pixelsPerTan >= SMALLEST_HIDING_DISC_PX)
    .map((body) => hiderOf(body, toCamera));
  const shownPieces = (from, to) => {
    const inView = clipToView(from, to, tanHalf);
    return inView ? visiblePieces(inView, hiders) : [];
  };
  const tracePieces = (pieces) =>
    pieces.forEach(([from, to]) => {
      context.moveTo(...toScreen(from));
      context.lineTo(...toScreen(to));
    });
  const seen = (point) => Boolean(clipToView(point, point, tanHalf)) && !pointHidden(point, hiders);
  return { pixelsPerTan, toCamera, toScreen, shownPieces, tracePieces, seen };
}

export function drawOrbits(context, { paths, offsetOf, ...scene }) {
  const { pixelsPerTan, toCamera, toScreen, shownPieces, tracePieces, seen } = pencil(context, scene);
  context.save();
  context.lineWidth = 1.25;
  for (const { name, parent, pointsKm } of paths) {
    const parentOffset = offsetOf(parent);
    const bodyOffset = offsetOf(name);
    if (!parentOffset || !bodyOffset) continue;
    const radiusKm = Math.hypot(...pointsKm[0]);
    if ((radiusKm / Math.max(Math.hypot(...parentOffset), radiusKm)) * pixelsPerTan < SMALLEST_ORBIT_PX) continue;
    const throughBody = subtract(bodyOffset, pointsKm[0]);
    const points = pointsKm.map((point) => toCamera(add(throughBody, point)));
    const segments = points.map((point, index) => shownPieces(point, points[(index + 1) % points.length]));
    context.strokeStyle = `rgba(${ORBIT_RGB}, ${ORBIT_ALPHA})`;
    context.beginPath();
    segments.forEach(tracePieces);
    context.stroke();
    const trailSegments = Math.round(points.length * TRAIL_SHARE);
    segments.slice(0, trailSegments).forEach((pieces, index) => {
      context.strokeStyle = `rgba(${ORBIT_RGB}, ${(1 - ORBIT_ALPHA) * (1 - index / trailSegments)})`;
      context.beginPath();
      tracePieces(pieces);
      context.stroke();
    });
    if (!seen(points[0])) continue;
    context.fillStyle = `rgb(${ORBIT_RGB})`;
    context.beginPath();
    context.arc(...toScreen(points[0]), BODY_DOT_PX, 0, 2 * Math.PI);
    context.fill();
  }
  context.restore();
}

const PATH_RGB = '255, 196, 110';
const PATH_ALPHA = { past: 0.85, future: 0.3 };
const MARK_FONT = '12px "Trebuchet MS", sans-serif';
const MARK_TEXT_HEIGHT = 15;
const SHORTEST_PIECE_PX = 3;

export function drawCraftPath(context, { past, future, ...scene }) {
  const { pixelsPerTan, toCamera, shownPieces, tracePieces } = pencil(context, scene);
  const shortestTan = SHORTEST_PIECE_PX / pixelsPerTan;
  const tooClose = (from, to) => from[2] > NEAREST_DEPTH_KM && to[2] > NEAREST_DEPTH_KM && Math.hypot(to[0] / to[2] - from[0] / from[2], to[1] / to[2] - from[1] / from[2]) < shortestTan;
  context.save();
  context.lineWidth = 1.5;
  for (const [points, alpha] of [[future, PATH_ALPHA.future], [past, PATH_ALPHA.past]]) {
    const seen = [];
    points.map(toCamera).forEach((point, k) => {
      if (!seen.length || k === points.length - 1 || !tooClose(seen.at(-1), point)) seen.push(point);
    });
    context.strokeStyle = `rgba(${PATH_RGB}, ${alpha})`;
    context.beginPath();
    for (let k = 0; k + 1 < seen.length; k++) tracePieces(shownPieces(seen[k], seen[k + 1]));
    context.stroke();
  }
  context.restore();
}

export function drawCraftMarks(context, { craft, ...scene }) {
  const { toCamera, toScreen, seen } = pencil(context, scene);
  const written = [];
  const crowded = (box) => written.some((other) => box.x < other.x + other.width && other.x < box.x + box.width && Math.abs(box.y - other.y) < MARK_TEXT_HEIGHT);
  context.save();
  context.font = MARK_FONT;
  context.textBaseline = 'middle';
  context.fillStyle = `rgb(${PATH_RGB})`;
  for (const { body, offsetKm } of [...craft].sort((a, b) => Math.hypot(...a.offsetKm) - Math.hypot(...b.offsetKm))) {
    const point = toCamera(offsetKm);
    if (!seen(point)) continue;
    const [x, y] = toScreen(point);
    context.beginPath();
    context.arc(x, y, BODY_DOT_PX, 0, 2 * Math.PI);
    context.fill();
    const box = { x: x + 7, y, width: context.measureText(body.name).width };
    if (crowded(box)) continue;
    written.push(box);
    context.fillText(body.name, box.x, box.y);
  }
  context.restore();
}
