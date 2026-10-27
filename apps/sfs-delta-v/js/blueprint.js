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
      engineStartsOn: Boolean(raw.B?.engine_on),
      box: transformedBox(part.localBox, transform),
      attachEdge: part.role === 'engine' ? transformedBox({ ...part.localBox, y0: 0, y1: 0 }, transform) : null,
      nozzleBox: part.role === 'engine' ? transformedBox(nozzleOf(part.localBox), transform) : null,
    };
  });
  const stages = (json.stages ?? [])
    .map((stage) => (stage.partIndexes ?? []).filter((i) => i >= 0 && i < parts.length))
    .filter((indexes) => indexes.length > 0);
  const resizedParts = json.parts.filter((raw) => Math.abs(raw.o?.x ?? 1) !== 1 || Math.abs(raw.o?.y ?? 1) !== 1).length;
  return { parts, stages, links: linkParts(parts), resizedParts };
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

export function overlapArea(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}
