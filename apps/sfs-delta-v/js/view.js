const BURN_COLOURS = ['#e8794a', '#e3c14d', '#6cc46a', '#4ab3e8', '#9a7cf0', '#e46fb4'];
const KEPT_COLOUR = '#d7e6f5';
const LEFT_ON_PAD_COLOUR = '#5a6b7d';
const DRAW_ORDER = { tank: 0, fairing: 1, structure: 2, control: 2, dockingPort: 3, separator: 3, engine: 4 };

export function burnColour(burn) {
  if (burn === null) return KEPT_COLOUR;
  if (burn < 0) return LEFT_ON_PAD_COLOUR;
  return BURN_COLOURS[burn % BURN_COLOURS.length];
}

export const droppedAfterBurn = (droppedAt) => (droppedAt === null ? null : droppedAt - 1);

export function drawRocket(canvas, rocket, droppedAt) {
  const ratio = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const boxes = rocket.parts.map((p) => p.box);
  const left = Math.min(...boxes.map((b) => b.x0));
  const right = Math.max(...boxes.map((b) => b.x1));
  const bottom = Math.min(...boxes.map((b) => b.y0));
  const top = Math.max(...boxes.map((b) => b.y1));
  const padding = 14;
  const scale = Math.min((width - padding * 2) / (right - left), (height - padding * 2) / (top - bottom));
  const offsetX = (width - (right - left) * scale) / 2;
  const offsetY = (height - (top - bottom) * scale) / 2;
  const toScreen = (box) => ({
    x: offsetX + (box.x0 - left) * scale,
    y: height - offsetY - (box.y1 - bottom) * scale,
    w: (box.x1 - box.x0) * scale,
    h: (box.y1 - box.y0) * scale,
  });

  const ordered = [...rocket.parts].sort((a, b) => DRAW_ORDER[a.role] - DRAW_ORDER[b.role]);
  for (const part of ordered) {
    const r = toScreen(part.box);
    const colour = burnColour(droppedAfterBurn(droppedAt[part.index]));
    context.globalAlpha = part.role === 'fairing' ? 0.35 : 1;
    context.fillStyle = colour;
    context.strokeStyle = '#060f1c';
    context.lineWidth = 1;
    if (part.role === 'engine') {
      drawNozzle(context, r);
    } else {
      context.globalAlpha *= part.role === 'tank' ? 0.85 : 0.6;
      context.fillRect(r.x, r.y, r.w, r.h);
      context.globalAlpha = 1;
      context.strokeRect(r.x + 0.5, r.y + 0.5, Math.max(r.w - 1, 0), Math.max(r.h - 1, 0));
    }
  }
  context.globalAlpha = 1;
}

function drawNozzle(context, r) {
  const throat = r.w * 0.3;
  context.beginPath();
  context.moveTo(r.x + r.w / 2 - throat / 2, r.y);
  context.lineTo(r.x + r.w / 2 + throat / 2, r.y);
  context.lineTo(r.x + r.w, r.y + r.h);
  context.lineTo(r.x, r.y + r.h);
  context.closePath();
  context.fill();
  context.stroke();
}
