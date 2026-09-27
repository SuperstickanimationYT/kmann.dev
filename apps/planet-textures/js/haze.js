import { hexToRgb } from './color.js';

const GRADIENT_STOPS = 24;
const OVERALL_TINT = 0.6;
const LIMB_GLOW = 0.95;

function opacityAt(flat, thickness) {
  const depth = Math.sqrt(Math.max(0, 1 - flat * flat));
  return Math.min(1, thickness * thickness * OVERALL_TINT + thickness * LIMB_GLOW * (1 - depth) ** 2);
}

export function paintHaze(context, size, planet) {
  if (!planet.haze) return;
  const thickness = planet.haze / 100;
  const [r, g, b] = hexToRgb(planet.hazeColor).map((channel) => Math.round(channel * 255));
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let stop = 0; stop <= GRADIENT_STOPS; stop++) {
    const flat = Math.sqrt(stop / GRADIENT_STOPS);
    gradient.addColorStop(flat, `rgba(${r}, ${g}, ${b}, ${opacityAt(flat, thickness)})`);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
}
