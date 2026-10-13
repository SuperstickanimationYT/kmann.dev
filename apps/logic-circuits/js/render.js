import { BIT_CELL, COLORS, bitCellsLeft, bitsOf, curveControls, inputCount, isWord, layout, pinPosition, pinWidth, switchValue, wirePoints } from './parts.js';

const HEX_SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
const DETAIL_ZOOM = 0.35;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

export function drawScene(ctx, scene) {
  const { width, height, ratio, view, circuit, chips, sim, selection, wireSelection, editingChip } = scene;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = editingChip ? COLORS.chipStage : COLORS.stage;
  ctx.fillRect(0, 0, width, height);
  drawDots(ctx, view, width, height);

  const zoom = view.zoom;
  ctx.setTransform(ratio * zoom, 0, 0, ratio * zoom, -view.x * zoom * ratio, -view.y * zoom * ratio);
  const visible = { left: view.x - 60, top: view.y - 60, right: view.x + width / zoom + 60, bottom: view.y + height / zoom + 60 };
  const byId = new Map(circuit.components.map((comp) => [comp.id, comp]));
  const read = sim ? (comp, key) => sim.read(comp.id, key) : () => 0;

  for (const wire of circuit.wires) {
    const from = byId.get(wire.from.c);
    const to = byId.get(wire.to.c);
    if (!from || !to) continue;
    const a = pinPosition(from, wire.from.p, chips);
    const b = pinPosition(to, wire.to.p, chips);
    if (!a || !b) continue;
    const outside = Math.max(a.x, b.x) < visible.left || Math.min(a.x, b.x) > visible.right
      || Math.max(a.y, b.y) < visible.top || Math.min(a.y, b.y) > visible.bottom;
    if (outside && !wire.points.length) continue;
    drawWire(ctx, a, b, wire.points, read(from, wire.from.p), wireSelection.has(wire.id), a.width);
  }
  if (zoom >= DETAIL_ZOOM) {
    for (const wire of circuit.wires) {
      const from = byId.get(wire.from.c);
      const to = byId.get(wire.to.c);
      const a = from && pinPosition(from, wire.from.p, chips);
      const b = to && pinPosition(to, wire.to.p, chips);
      if (a?.width > 1 && b) drawBusValue(ctx, wirePoints(a, b, wire.points), read(from, wire.from.p), visible);
    }
  }

  const detailed = zoom >= DETAIL_ZOOM;
  for (const comp of circuit.components) {
    const box = layout(comp, chips);
    if (comp.x > visible.right || comp.y > visible.bottom || comp.x + box.w < visible.left || comp.y + box.h < visible.top) continue;
    drawComponent(ctx, comp, chips, (key) => read(comp, key), { selected: selection.has(comp.id), detailed });
  }

  if (scene.draft) drawDraft(ctx, scene.draft, byId, chips);
  if (scene.ghost) {
    ctx.globalAlpha = 0.55;
    drawComponent(ctx, scene.ghost, chips, () => 0, { detailed });
    ctx.globalAlpha = 1;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (scene.box) {
    const { start, current } = scene.box;
    ctx.fillStyle = 'rgba(95, 227, 255, 0.08)';
    ctx.strokeStyle = 'rgba(95, 227, 255, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(start.x, start.y, current.x - start.x, current.y - start.y);
    ctx.strokeRect(start.x + 0.5, start.y + 0.5, current.x - start.x, current.y - start.y);
    ctx.setLineDash([]);
  }
}

function drawDots(ctx, view, width, height) {
  let step = 20 * view.zoom;
  while (step < 12) step *= 5;
  const offsetX = -((view.x * view.zoom) % step);
  const offsetY = -((view.y * view.zoom) % step);
  ctx.fillStyle = COLORS.dot;
  const size = Math.min(2, Math.max(1, view.zoom * 1.5));
  for (let x = offsetX; x < width; x += step) {
    for (let y = offsetY; y < height; y += step) ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }
}

function drawWire(ctx, a, b, bends, value, selected, width) {
  const bus = width > 1;
  tracePath(ctx, a, b, bends);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (selected) {
    ctx.strokeStyle = 'rgba(95, 227, 255, 0.45)';
    ctx.lineWidth = bus ? 12 : 8;
    ctx.stroke();
  }
  ctx.strokeStyle = value ? COLORS.on : COLORS.off;
  ctx.lineWidth = bus ? 7 : 3;
  ctx.stroke();
  if (bus) {
    ctx.strokeStyle = value ? '#7a5a10' : COLORS.pinHole;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function midpoint(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let left = total / 2;
  for (let i = 1; i < points.length; i++) {
    const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (left <= length) {
      const t = length ? left / length : 0;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * t, y: points[i - 1].y + (points[i].y - points[i - 1].y) * t };
    }
    left -= length;
  }
  return points[0];
}

function drawBusValue(ctx, points, value, visible) {
  const at = midpoint(points);
  if (at.x < visible.left || at.x > visible.right || at.y < visible.top || at.y > visible.bottom) return;
  const label = String(value);
  ctx.font = `700 11px ${FONT}`;
  const w = ctx.measureText(label).width + 10;
  roundRect(ctx, at.x - w / 2, at.y - 8, w, 16, 8);
  ctx.fillStyle = value ? COLORS.on : '#0c2540';
  ctx.fill();
  ctx.strokeStyle = value ? '#fff1c2' : COLORS.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  text(ctx, label, at.x, at.y + 0.5, 11, 'center', value ? '#1d1500' : COLORS.text, 700);
}

function tracePath(ctx, a, b, bends) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (bends.length) {
    for (const [x, y] of bends) ctx.lineTo(x, y);
    ctx.lineTo(b.x, b.y);
  } else {
    const [c1, c2] = curveControls(a, b);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
  }
}

function drawDraft(ctx, draft, byId, chips) {
  const anchor = byId.get(draft.anchor.c);
  if (!anchor) return;
  const start = pinPosition(anchor, draft.anchor.p, chips);
  if (!start) return;
  const ends = draft.anchor.dir === 'out' ? [start, draft.cursor] : [draft.cursor, start];
  const bends = draft.anchor.dir === 'out' ? draft.points : [...draft.points].reverse();
  ctx.setLineDash([7, 6]);
  const bus = draft.anchor.width > 1;
  if (bends.length) {
    const points = wirePoints(ends[0], ends[1], bends);
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  } else {
    tracePath(ctx, ends[0], ends[1], bends);
  }
  ctx.strokeStyle = COLORS.selected;
  ctx.lineWidth = bus ? 5 : 2.5;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of draft.points) {
    ctx.fillStyle = COLORS.selected;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function text(ctx, value, x, y, size, align, color = COLORS.text, weight = 400) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

export function drawComponent(ctx, comp, chips, read, { selected = false, detailed = true } = {}) {
  const box = layout(comp, chips);
  const { x, y } = comp;

  if (selected) {
    roundRect(ctx, x - 5, y - 5, box.w + 10, box.h + 10, 8);
    ctx.fillStyle = 'rgba(95, 227, 255, 0.1)';
    ctx.fill();
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  switch (comp.kind) {
    case 'switch':
      if (isWord(comp)) drawWord(ctx, comp, box, switchValue(comp), true, detailed);
      else drawSwitch(ctx, x, y, comp.on);
      break;
    case 'button': drawButton(ctx, x, y, comp.pressed); break;
    case 'clock': drawClock(ctx, x, y, read('out'), comp.hz ?? 1, detailed); break;
    case 'light':
      if (isWord(comp)) drawWord(ctx, comp, box, read('in'), false, detailed);
      else drawLight(ctx, x, y, read('in'));
      break;
    case 'join':
    case 'split': drawBusPart(ctx, comp, box, detailed); break;
    case 'hex': drawHex(ctx, x, y, read); break;
    case 'chip': drawChip(ctx, comp, box, chips.get(comp.chip), detailed); break;
    default: drawGate(ctx, comp, box, read);
  }

  if (detailed && comp.label) {
    if (comp.kind === 'light') text(ctx, comp.label, x + box.w + 6, y + box.h / 2, 13, 'left');
    else if (comp.kind === 'hex') text(ctx, comp.label, x + box.w / 2, y - 10, 13, 'center');
    else text(ctx, comp.label, x - 6, y + box.h / 2, 13, 'right');
  }

  for (const pin of box.inputs) drawPin(ctx, x + pin.x, y + pin.y, read(pin.key), pinWidth(pin));
  for (const pin of box.outputs) drawPin(ctx, x + pin.x, y + pin.y, read(pin.key), pinWidth(pin));
}

function drawPin(ctx, x, y, on, width = 1) {
  ctx.beginPath();
  if (width > 1) ctx.roundRect(x - 5.5, y - 5.5, 11, 11, 2.5);
  else ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = on ? COLORS.on : COLORS.pinHole;
  ctx.fill();
  ctx.strokeStyle = on ? COLORS.on : COLORS.edge;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function frame(ctx, x, y, w, h, r = 7) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = COLORS.body;
  ctx.fill();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawSwitch(ctx, x, y, on) {
  frame(ctx, x + 2, y + 2, 36, 36);
  roundRect(ctx, x + 9, y + 12, 22, 16, 8);
  ctx.fillStyle = on ? 'rgba(255, 207, 77, 0.35)' : COLORS.pinHole;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(on ? x + 23 : x + 17, y + 20, 6, 0, Math.PI * 2);
  ctx.fillStyle = on ? COLORS.on : COLORS.dim;
  ctx.fill();
}

function drawWord(ctx, comp, box, value, clickable, detailed) {
  const { x, y } = comp;
  frame(ctx, x + 2, y + 2, box.w - 4, box.h - 4);
  const bits = bitsOf(comp);
  const left = x + bitCellsLeft(comp, box);
  for (let column = 0; column < bits; column++) {
    const on = (value >> (bits - 1 - column)) & 1;
    const cellX = left + column * BIT_CELL;
    roundRect(ctx, cellX + 1.5, y + 22, BIT_CELL - 3, 12, clickable ? 2 : 6);
    ctx.fillStyle = on ? COLORS.on : clickable ? '#163a60' : '#10233a';
    ctx.fill();
  }
  if (detailed) text(ctx, String(value), x + box.w / 2, y + 13, 12, 'center', value ? COLORS.on : COLORS.dim, 700);
}

function drawBusPart(ctx, comp, box, detailed) {
  const { x, y } = comp;
  roundRect(ctx, x + 6, y + 1, 18, box.h - 2, 6);
  ctx.fillStyle = COLORS.body;
  ctx.fill();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!detailed) return;
  for (const pin of comp.kind === 'join' ? box.inputs : box.outputs) text(ctx, pin.name, x + 15, y + pin.y + 0.5, 9, 'center', COLORS.dim);
}

function drawButton(ctx, x, y, pressed) {
  frame(ctx, x + 2, y + 2, 36, 36);
  ctx.beginPath();
  ctx.arc(x + 20, y + 20, pressed ? 9 : 11, 0, Math.PI * 2);
  ctx.fillStyle = pressed ? COLORS.on : '#163a60';
  ctx.fill();
  ctx.strokeStyle = pressed ? COLORS.on : COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawClock(ctx, x, y, on, hz, detailed) {
  frame(ctx, x + 2, y + 2, 36, 36);
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 26);
  ctx.lineTo(x + 14, y + 26);
  ctx.lineTo(x + 14, y + 14);
  ctx.lineTo(x + 24, y + 14);
  ctx.lineTo(x + 24, y + 26);
  ctx.lineTo(x + 32, y + 26);
  ctx.strokeStyle = on ? COLORS.on : COLORS.dim;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (detailed) text(ctx, `${hz} Hz`, x + 20, y + 50, 11, 'center', COLORS.dim);
}

function drawLight(ctx, x, y, on) {
  ctx.beginPath();
  ctx.arc(x + 20, y + 20, 15, 0, Math.PI * 2);
  if (on) {
    ctx.shadowColor = COLORS.on;
    ctx.shadowBlur = 18;
  }
  ctx.fillStyle = on ? COLORS.on : '#10233a';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = on ? '#fff1c2' : COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawHex(ctx, x, y, read) {
  frame(ctx, x + 6, y + 4, 52, 92);
  let digit = 0;
  for (let i = 0; i < 4; i++) digit |= read(`in${i}`) << i;
  const lit = HEX_SEGMENTS[digit];
  const left = x + 20;
  const top = y + 22;
  const w = 24;
  const half = 28;
  const t = 5;
  const segments = [
    [left, top - t / 2, w, t],
    [left + w - t / 2, top, t, half],
    [left + w - t / 2, top + half, t, half],
    [left, top + 2 * half - t / 2, w, t],
    [left - t / 2, top + half, t, half],
    [left - t / 2, top, t, half],
    [left, top + half - t / 2, w, t],
  ];
  segments.forEach(([sx, sy, sw, sh], i) => {
    ctx.fillStyle = lit & (1 << i) ? COLORS.on : 'rgba(61, 143, 221, 0.14)';
    ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
  });
}

function drawChip(ctx, comp, box, def, detailed) {
  const color = def?.color ?? '#aa3344';
  roundRect(ctx, comp.x, comp.y, box.w, box.h, 6);
  ctx.fillStyle = COLORS.body;
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (!detailed) return;
  text(ctx, def?.name ?? 'Missing chip', comp.x + box.w / 2, comp.y + box.h / 2, 14, 'center', COLORS.text, 700);
  for (const pin of box.inputs) text(ctx, pin.name, comp.x + 9, comp.y + pin.y, 11, 'left', '#cfe3f8');
  for (const pin of box.outputs) text(ctx, pin.name, comp.x + box.w - 9, comp.y + pin.y, 11, 'right', '#cfe3f8');
}

function drawGate(ctx, comp, box, read) {
  const { x, y } = comp;
  const inverted = comp.kind === 'nand' || comp.kind === 'nor' || comp.kind === 'xnor' || comp.kind === 'not';
  const left = x + 12;
  const right = x + box.w - (inverted ? 18 : 10);
  const top = y + 2;
  const bottom = y + box.h - 2;
  const middle = y + box.h / 2;
  const width = right - left;
  const orLike = comp.kind === 'or' || comp.kind === 'nor' || comp.kind === 'xor' || comp.kind === 'xnor';

  const count = inputCount(comp);
  for (let i = 0; i < count; i++) {
    const pin = box.inputs[i];
    ctx.beginPath();
    ctx.moveTo(x, y + pin.y);
    ctx.lineTo(left + (orLike ? 6 : 0), y + pin.y);
    ctx.strokeStyle = read(pin.key) ? COLORS.on : COLORS.off;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(right, middle);
  ctx.lineTo(x + box.w, middle);
  ctx.strokeStyle = read('out') ? COLORS.on : COLORS.off;
  ctx.stroke();

  ctx.beginPath();
  switch (comp.kind) {
    case 'and':
    case 'nand': {
      const flat = left + Math.max(0, width - box.h / 2);
      ctx.moveTo(left, top);
      ctx.lineTo(flat, top);
      ctx.ellipse(flat, middle, right - flat, (bottom - top) / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(left, bottom);
      ctx.closePath();
      break;
    }
    case 'not':
    case 'buffer':
      ctx.moveTo(left, top + 4);
      ctx.lineTo(right, middle);
      ctx.lineTo(left, bottom - 4);
      ctx.closePath();
      break;
    default:
      ctx.moveTo(left, top);
      ctx.quadraticCurveTo(left + width * 0.65, top, right, middle);
      ctx.quadraticCurveTo(left + width * 0.65, bottom, left, bottom);
      ctx.quadraticCurveTo(left + width * 0.3, middle, left, top);
      ctx.closePath();
  }
  ctx.fillStyle = COLORS.body;
  ctx.fill();
  ctx.strokeStyle = COLORS.edge;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (comp.kind === 'xor' || comp.kind === 'xnor') {
    ctx.beginPath();
    ctx.moveTo(left - 6, top);
    ctx.quadraticCurveTo(left - 6 + width * 0.3, middle, left - 6, bottom);
    ctx.stroke();
  }
  if (inverted) {
    ctx.beginPath();
    ctx.arc(right + 4, middle, 4, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.body;
    ctx.fill();
    ctx.stroke();
  }
}
