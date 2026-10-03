export const FRAME_COLOR = '#1f4f80';
const GOAL_HUE = 45;
export const CAPTION_COLOR = '#6f9dc9';

export function lineColor(style, lightness, colorOn) {
  if (style.kind === 'floor') return `hsl(210 12% ${lightness * 0.6}%)`;
  if (style.kind === 'wall') return `hsl(215 30% ${lightness * 0.45}%)`;
  if (style.kind === 'player') return `hsl(0 0% ${lightness}%)`;
  if (style.kind === 'goal') return `hsl(${GOAL_HUE} 100% ${lightness}%)`;
  if (style.kind === 'platform' && !colorOn) return `hsl(210 35% ${lightness}%)`;
  return `hsl(${style.hue} 90% ${lightness}%)`;
}

export function labelColor(platform, colorOn) {
  if (platform.isGoal) return `hsl(${GOAL_HUE} 100% 70%)`;
  return colorOn ? `hsl(${platform.hue} 85% 72%)` : '#e2effd';
}

export const platformStyle = platform => (platform.isGoal ? { kind: 'goal' } : { kind: 'platform', hue: platform.hue });

export function solidColor(body, shade, colorOn) {
  if (body.kind === 'floor') return `hsl(210 10% ${12 + 22 * shade}%)`;
  if (body.kind === 'player') return `hsl(0 0% ${45 + 45 * shade}%)`;
  if (body.kind === 'goal') return `hsl(${GOAL_HUE} 90% ${25 + 40 * shade}%)`;
  if (!colorOn) return `hsl(210 30% ${25 + 40 * shade}%)`;
  return `hsl(${body.hue} 70% ${22 + 38 * shade}%)`;
}

export function drawLabel(ctx, text, x, y, color) {
  ctx.font = 'bold 13px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawCaption(ctx, text, x, y) {
  ctx.font = '12px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = CAPTION_COLOR;
  ctx.fillText(text, x, y);
}

export function strokeSegment(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
