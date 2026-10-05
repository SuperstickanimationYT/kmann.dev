import { LY_PER_PC, positionSeenAt, SUN_POSITION } from './milky-way.js';
import { KIND, SUN_VELOCITY } from './stars.js';

const NEBULA_COLOUR = '#ff8fa8';
const GALAXY_COLOUR = '#c9b8ff';
const SUN_COLOUR = '#ffe08a';
const SHADOW = 'rgba(0, 0, 0, 0.85)';
const EDGE_MARGIN = 28;
const SUN_RING = 14;

const isCatalogueDesignation = (name) => /^G\d/.test(name);
const subtract = (a, b) => a.map((value, i) => value - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function formatDistance(parsecs) {
  const lightYears = parsecs * LY_PER_PC;
  if (lightYears >= 1e6) return `${(lightYears / 1e6).toFixed(1)} million ly`;
  if (lightYears >= 100) return `${Math.round(lightYears).toLocaleString('en')} ly`;
  return `${lightYears.toFixed(1)} ly`;
}

function seenFrom(camera, present, velocity) {
  const delay = Math.hypot(...subtract(present, camera)) * LY_PER_PC;
  return positionSeenAt(present, velocity, delay);
}

export function describeStar({ kind, name, absolute, distance }) {
  const apparent = absolute + 5 * Math.log10(distance / 10);
  const brightness = `magnitude ${apparent.toFixed(1)} before dust, absolute ${absolute.toFixed(1)}`;
  const where = formatDistance(distance);
  if (kind === KIND.sun) return `The Sun · ${where} · ${brightness}`;
  if (kind === KIND.catalogue) return `${name ?? 'Unnamed real star (Hipparcos)'} · ${where} · ${brightness}`;
  if (kind === KIND.cluster) return `Procedural young star in ${name} · ${where} · ${brightness}`;
  return `Procedural star, no name · ${where} · ${brightness}`;
}

function createProjector({ camera, basis, tanHalf, width, height }) {
  return (point) => {
    const offset = subtract(point, camera);
    const depth = dot(offset, basis.forward);
    const across = dot(offset, basis.right) / Math.abs(depth) / tanHalf[0];
    const up = dot(offset, basis.up) / Math.abs(depth) / tanHalf[1];
    return {
      x: (across * 0.5 + 0.5) * width,
      y: (0.5 - up * 0.5) * height,
      ahead: depth > 0,
      distance: Math.hypot(...offset),
      direction: [across * Math.sign(depth), -up * Math.sign(depth)],
    };
  };
}

function createLabeller(context) {
  const placed = [];
  return (text, x, y) => {
    const width = context.measureText(text).width;
    const box = [x - 2, y - 13, x + width + 2, y + 4];
    if (placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) return false;
    placed.push(box);
    context.fillText(text, x, y);
    return true;
  };
}

function drawMarker(context, label, colour, spot, text, radius) {
  context.strokeStyle = colour;
  context.fillStyle = colour;
  context.beginPath();
  context.arc(spot.x, spot.y, radius, 0, 2 * Math.PI);
  context.stroke();
  label(text, spot.x + radius + 4, spot.y + 4);
}

function drawEdgeArrow(context, spot, width, height, text) {
  const [dx, dy] = spot.direction;
  const reach = Math.min((width / 2 - EDGE_MARGIN) / Math.max(Math.abs(dx), 1e-6), (height / 2 - EDGE_MARGIN) / Math.max(Math.abs(dy), 1e-6));
  const length = Math.hypot(dx, dy) || 1;
  const tip = [width / 2 + dx * reach, height / 2 + dy * reach];
  const unit = [dx / length, dy / length];
  context.beginPath();
  context.moveTo(tip[0], tip[1]);
  context.lineTo(tip[0] - unit[0] * 14 - unit[1] * 7, tip[1] - unit[1] * 14 + unit[0] * 7);
  context.lineTo(tip[0] - unit[0] * 14 + unit[1] * 7, tip[1] - unit[1] * 14 - unit[0] * 7);
  context.fill();
  const textWidth = context.measureText(text).width;
  const inset = 22 + Math.abs(unit[0]) * (textWidth / 2) + Math.abs(unit[1]) * 10;
  const x = Math.min(width - textWidth - 6, Math.max(6, tip[0] - unit[0] * inset - textWidth / 2));
  const y = Math.min(height - 8, Math.max(18, tip[1] - unit[1] * inset + 4));
  context.fillText(text, x, y);
}

export function drawGuides(context, { camera, basis, tanHalf, width, height, nebulae, galaxies, fontSize = 13 }) {
  const project = createProjector({ camera, basis, tanHalf, width, height });
  const onScreen = (spot) => spot.ahead && spot.x >= 0 && spot.x <= width && spot.y >= 0 && spot.y <= height;
  context.save();
  context.font = `${fontSize}px "Trebuchet MS", sans-serif`;
  context.lineWidth = 1.5;
  context.shadowColor = SHADOW;
  context.shadowBlur = 4;
  const label = createLabeller(context);

  const sun = project(seenFrom(camera, SUN_POSITION, SUN_VELOCITY));
  context.strokeStyle = SUN_COLOUR;
  context.fillStyle = SUN_COLOUR;
  const sunText = `Sun · ${formatDistance(sun.distance)}`;
  if (onScreen(sun)) drawMarker(context, label, SUN_COLOUR, sun, sunText, SUN_RING);
  else drawEdgeArrow(context, sun, width, height, sunText);

  galaxies.forEach((galaxy) => {
    const spot = project(galaxy.centre);
    if (onScreen(spot)) drawMarker(context, label, GALAXY_COLOUR, spot, `${galaxy.name} · ${formatDistance(spot.distance)}`, 6);
  });

  [...nebulae]
    .map((nebula) => ({ nebula, spot: project(seenFrom(camera, nebula.present, [0, 0, 0])) }))
    .filter(({ spot }) => onScreen(spot))
    .sort((a, b) => isCatalogueDesignation(a.nebula.name) - isCatalogueDesignation(b.nebula.name) || b.nebula.ionizing - a.nebula.ionizing)
    .forEach(({ nebula, spot }) => drawMarker(context, label, NEBULA_COLOUR, spot, `${nebula.name} · ${formatDistance(spot.distance)}`, 4));
  context.restore();
}
