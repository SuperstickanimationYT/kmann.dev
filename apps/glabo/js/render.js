import { COLUMNS, pieceById } from './world.js';

const FILL = { red: '#e0524f', green: '#4fbf6a', blue: '#4a8fea', yellow: '#f2c84b' };
const MOVE_MS = 520;
const GLOW_MS = 2400;

const ease = (t) => t * t * (3 - 2 * t);

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let shown = [];
  let queue = [];
  let move = null;
  let glow = { ids: [], until: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function metrics() {
    const column = width / COLUMNS;
    const tableY = height - 34;
    const big = Math.min(column * 0.8, (tableY - 30) / 3.4);
    return { column, tableY, big, small: big * 0.62 };
  }

  function layout(stacks) {
    const m = metrics();
    const boxes = {};
    stacks.forEach((stack, col) => {
      let bottom = m.tableY;
      for (const id of stack) {
        const side = pieceById[id].size === 'big' ? m.big : m.small;
        boxes[id] = { x: (col + 0.5) * m.column, bottom, side };
        bottom -= side;
      }
    });
    return boxes;
  }

  function drawPiece(id, box, glowing) {
    const piece = pieceById[id];
    const half = box.side / 2;
    const top = box.bottom - box.side;
    context.beginPath();
    if (piece.shape === 'cube') {
      context.roundRect(box.x - half + 1, top + 1, box.side - 2, box.side - 2, 4);
    } else {
      context.moveTo(box.x, top + 1);
      context.lineTo(box.x + half - 1, box.bottom - 1);
      context.lineTo(box.x - half + 1, box.bottom - 1);
      context.closePath();
    }
    context.fillStyle = FILL[piece.color];
    if (glowing) {
      context.shadowColor = '#5fe3ff';
      context.shadowBlur = 22;
    }
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = glowing ? 3 : 1.5;
    context.strokeStyle = glowing ? '#5fe3ff' : 'rgba(0, 0, 0, 0.35)';
    context.stroke();
  }

  function drawTable() {
    const m = metrics();
    context.fillStyle = '#1b3a5c';
    context.fillRect(0, m.tableY, width, 6);
    context.fillStyle = '#6f9dc9';
    context.font = '12px "Trebuchet MS", sans-serif';
    context.textAlign = 'center';
    for (let col = 0; col < COLUMNS; col++) context.fillText(String(col + 1), (col + 0.5) * m.column, m.tableY + 24);
  }

  function movingBox(now) {
    const t = Math.min(1, (now - move.start) / MOVE_MS);
    const from = layout(move.from)[move.id];
    const to = layout(move.to)[move.id];
    const peaks = [...Object.values(layout(move.from)), ...Object.values(layout(move.to))].map((box) => box.bottom - box.side);
    const clearance = Math.max(from.side + 6, Math.min(...peaks) - 10);
    const box = { ...to };
    if (t < 0.3) {
      box.x = from.x;
      box.bottom = from.bottom + (clearance - from.bottom) * ease(t / 0.3);
    } else if (t < 0.7) {
      box.x = from.x + (to.x - from.x) * ease((t - 0.3) / 0.4);
      box.bottom = clearance;
    } else {
      box.bottom = clearance + (to.bottom - clearance) * ease((t - 0.7) / 0.3);
    }
    return { box, done: t >= 1 };
  }

  function startNextMove(now) {
    const next = queue.shift();
    const id = next.flat().find((piece) => next.findIndex((stack) => stack.includes(piece)) !== shown.findIndex((stack) => stack.includes(piece)));
    move = id ? { id, from: shown, to: next, start: now } : null;
    if (!id) shown = next;
  }

  function frame(now) {
    if (!move && queue.length) startNextMove(now);
    context.clearRect(0, 0, width, height);
    drawTable();
    const glowing = now < glow.until ? new Set(glow.ids) : new Set();
    if (move) {
      const { box, done } = movingBox(now);
      const still = layout(move.to);
      for (const [id, place] of Object.entries(still)) if (id !== move.id) drawPiece(id, place, glowing.has(id));
      drawPiece(move.id, box, glowing.has(move.id));
      if (done) {
        shown = move.to;
        move = null;
      }
    } else {
      for (const [id, place] of Object.entries(layout(shown))) drawPiece(id, place, glowing.has(id));
    }
    window.requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  window.requestAnimationFrame(frame);

  return {
    show(stacks) {
      queue = [];
      move = null;
      shown = stacks.map((stack) => [...stack]);
    },
    animate(snapshots) {
      queue.push(...snapshots.map((stacks) => stacks.map((stack) => [...stack])));
    },
    highlight(ids) {
      glow = { ids, until: performance.now() + GLOW_MS + queue.length * MOVE_MS };
    },
  };
}
