import { describePart } from './parts.js';

const TOUCH_GAP = 0.1;
const MIN_SHARED_EDGE = 0.05;

export function parseBlueprint(text) {
  let json;
  try {
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('This is not a Blueprint.txt file. It should be JSON that starts with {.');
  }
  if (!Array.isArray(json.parts) || json.parts.length === 0) {
    throw new Error('The blueprint has no parts.');
  }
  const parts = json.parts.map((raw, index) => {
    const part = describePart(raw);
    const transform = orientationOf(raw);
    return {
      index,
      name: raw.n,
      ...part,
      ...(part.role === 'engine' && { thrust: part.thrust * Math.abs(transform.scaleY) }),
      engineStartsOn: Boolean(raw.B?.engine_on),
      box: transformedBox(part.localBox, transform),
      attachEdge: part.role === 'engine' ? transformedBox({ ...part.localBox, y0: 0, y1: 0 }, transform) : null,
      nozzleBox: part.role === 'engine' ? transformedBox(nozzleOf(part.localBox), transform) : null,
    };
  });
  const stages = (json.stages ?? [])
    .map((stage) => (stage.partIndexes ?? []).filter((i) => i >= 0 && i < parts.length))
    .filter((indexes) => indexes.length > 0);
  const resizedParts = json.parts.filter((raw, i) => isResized(raw, parts[i].role === 'engine')).length;
  const links = linkParts(parts);
  const bridgedGaps = joinLoosePieces(parts, links);
  return { parts, stages, links, resizedParts, bridgedGaps };
}

function isResized(raw, isEngine) {
  const widened = Math.abs(raw.o?.x ?? 1) !== 1;
  const stretched = Math.abs(raw.o?.y ?? 1) !== 1;
  return widened || (stretched && !isEngine);
}

function nozzleOf(engineBox) {
  const length = -engineBox.y0;
  return { x0: engineBox.x0 * 0.35, x1: engineBox.x1 * 0.35, y0: -length * 0.85, y1: -0.3 };
}

function orientationOf(raw) {
  const turn = ((raw.o?.z ?? 0) * Math.PI) / 180;
  return {
    x: raw.p?.x ?? 0,
    y: raw.p?.y ?? 0,
    scaleX: raw.o?.x ?? 1,
    scaleY: raw.o?.y ?? 1,
    cos: Math.cos(turn),
    sin: Math.sin(turn),
  };
}

function transformedBox(local, t) {
  const corners = [
    [local.x0, local.y0],
    [local.x1, local.y0],
    [local.x0, local.y1],
    [local.x1, local.y1],
  ].map(([x, y]) => {
    const sx = x * t.scaleX;
    const sy = y * t.scaleY;
    return [t.x + sx * t.cos - sy * t.sin, t.y + sx * t.sin + sy * t.cos];
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

const gap = (a0, a1, b0, b1) => Math.max(a0, b0) - Math.min(a1, b1);

function boxesTouch(a, b) {
  const dx = gap(a.x0, a.x1, b.x0, b.x1);
  const dy = gap(a.y0, a.y1, b.y0, b.y1);
  return (dx <= TOUCH_GAP && dy < -MIN_SHARED_EDGE) || (dy <= TOUCH_GAP && dx < -MIN_SHARED_EDGE);
}

function edgeMeetsBox(edge, box) {
  const dx = gap(edge.x0, edge.x1, box.x0, box.x1);
  const dy = gap(edge.y0, edge.y1, box.y0, box.y1);
  const edgeIsLevel = edge.x1 - edge.x0 >= edge.y1 - edge.y0;
  return edgeIsLevel ? dy <= TOUCH_GAP && dx < -MIN_SHARED_EDGE : dx <= TOUCH_GAP && dy < -MIN_SHARED_EDGE;
}

function partsAttach(a, b) {
  if (a.role === 'engine' && b.role === 'engine') return false;
  if (a.role === 'engine') return edgeMeetsBox(a.attachEdge, b.box);
  if (b.role === 'engine') return edgeMeetsBox(b.attachEdge, a.box);
  return boxesTouch(a.box, b.box);
}

function linkParts(parts) {
  const links = parts.map(() => []);
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (partsAttach(parts[i], parts[j])) {
        links[i].push(j);
        links[j].push(i);
      }
    }
  }
  return links;
}

function boxDistance(a, b) {
  const dx = Math.max(0, gap(a.x0, a.x1, b.x0, b.x1));
  const dy = Math.max(0, gap(a.y0, a.y1, b.y0, b.y1));
  return Math.hypot(dx, dy);
}

function pieceLabels(links) {
  const label = links.map(() => -1);
  let count = 0;
  for (let start = 0; start < links.length; start++) {
    if (label[start] !== -1) continue;
    const stack = [start];
    label[start] = count;
    while (stack.length) {
      for (const j of links[stack.pop()]) {
        if (label[j] === -1) {
          label[j] = count;
          stack.push(j);
        }
      }
    }
    count++;
  }
  return { label, count };
}

function joinLoosePieces(parts, links) {
  const { label, count } = pieceLabels(links);
  if (count < 2) return 0;
  const closest = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (label[i] !== label[j]) closest.push({ i, j, distance: boxDistance(parts[i].box, parts[j].box) });
    }
  }
  closest.sort((a, b) => a.distance - b.distance);
  const pieceOf = Array.from({ length: count }, (_, n) => n);
  const root = (n) => (pieceOf[n] === n ? n : (pieceOf[n] = root(pieceOf[n])));
  let joined = 0;
  for (const { i, j } of closest) {
    const a = root(label[i]);
    const b = root(label[j]);
    if (a === b) continue;
    pieceOf[a] = b;
    links[i].push(j);
    links[j].push(i);
    if (++joined === count - 1) break;
  }
  return joined;
}

export function overlapArea(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}
