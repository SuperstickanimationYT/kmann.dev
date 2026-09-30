import { radiusOf } from './physics.js';

const GRID_SPACING = 100;
const TRAIL_POINTS = 400;
const TRAIL_MIN_GAP = 2;
const GLOW_FROM_MASS = 300;
const MIN_DRAWN_RADIUS_PX = 4;
const MASS_COLOURS = [
  [1, [143, 163, 184]],
  [30, [79, 155, 224]],
  [150, [224, 180, 106]],
  [1000, [255, 241, 192]],
];
const SELECTED_RING = '#5fe3ff';
const PINNED_RING = 'rgba(255, 255, 255, 0.55)';
const PREDICTION = 'rgba(95, 227, 255, 0.55)';

function colourOf(mass) {
  const logMass = Math.log10(Math.max(1, mass));
  const upper = MASS_COLOURS.findIndex(([stop]) => Math.log10(stop) >= logMass);
  if (upper <= 0) return MASS_COLOURS[upper === 0 ? 0 : MASS_COLOURS.length - 1][1];
  const [lowMass, low] = MASS_COLOURS[upper - 1];
  const [highMass, high] = MASS_COLOURS[upper];
  const along = (logMass - Math.log10(lowMass)) / (Math.log10(highMass) - Math.log10(lowMass));
  return low.map((channel, index) => Math.round(channel + (high[index] - channel) * along));
}

const rgb = ([r, g, b], alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

export function noteTrails(bodies) {
  for (const body of bodies) {
    const last = body.trail.at(-1);
    if (last && Math.hypot(last[0] - body.x, last[1] - body.y) < TRAIL_MIN_GAP) continue;
    body.trail.push([body.x, body.y]);
    if (body.trail.length > TRAIL_POINTS) body.trail.shift();
  }
}

export function createView(canvas) {
  const context = canvas.getContext('2d');
  const camera = { x: 0, y: 0, zoom: 1 };
  let width = 0;
  let height = 0;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  const toScreen = (x, y) => [width / 2 + (x - camera.x) * camera.zoom, height / 2 + (y - camera.y) * camera.zoom];

  function toWorld(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return [camera.x + (clientX - box.left - width / 2) / camera.zoom, camera.y + (clientY - box.top - height / 2) / camera.zoom];
  }

  function zoomAround(factor, clientX, clientY) {
    const [beforeX, beforeY] = toWorld(clientX, clientY);
    camera.zoom = Math.min(8, Math.max(0.05, camera.zoom * factor));
    const [afterX, afterY] = toWorld(clientX, clientY);
    camera.x += beforeX - afterX;
    camera.y += beforeY - afterY;
  }

  function panBy(dxPx, dyPx) {
    camera.x -= dxPx / camera.zoom;
    camera.y -= dyPx / camera.zoom;
  }

  function drawGrid() {
    const spacing = GRID_SPACING * camera.zoom;
    if (spacing < 12) return;
    context.strokeStyle = 'rgba(61, 143, 224, 0.12)';
    context.lineWidth = 1;
    const [originX, originY] = toScreen(0, 0);
    const startX = ((originX % spacing) + spacing) % spacing;
    const startY = ((originY % spacing) + spacing) % spacing;
    context.beginPath();
    for (let x = startX; x <= width; x += spacing) {
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = startY; y <= height; y += spacing) {
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
    }
    context.stroke();
  }

  function drawTrail(body) {
    if (body.trail.length < 2) return;
    context.strokeStyle = rgb(colourOf(body.mass), 0.35);
    context.lineWidth = 1.5;
    context.beginPath();
    body.trail.forEach(([x, y], index) => {
      const [sx, sy] = toScreen(x, y);
      if (index === 0) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    });
    context.lineTo(...toScreen(body.x, body.y));
    context.stroke();
  }

  function drawBody(body, { selected, ghost = false }) {
    const [sx, sy] = toScreen(body.x, body.y);
    const radius = Math.max(MIN_DRAWN_RADIUS_PX, radiusOf(body.mass) * camera.zoom);
    const colour = colourOf(body.mass);
    context.globalAlpha = ghost ? 0.5 : 1;
    if (body.mass >= GLOW_FROM_MASS) {
      const glow = context.createRadialGradient(sx, sy, radius * 0.5, sx, sy, radius * 3);
      glow.addColorStop(0, rgb(colour, 0.35));
      glow.addColorStop(1, rgb(colour, 0));
      context.fillStyle = glow;
      context.fillRect(sx - radius * 3, sy - radius * 3, radius * 6, radius * 6);
    }
    const shade = context.createRadialGradient(sx - radius * 0.35, sy - radius * 0.35, radius * 0.1, sx, sy, radius);
    shade.addColorStop(0, rgb(colour.map((channel) => Math.min(255, channel + 50))));
    shade.addColorStop(1, rgb(colour.map((channel) => channel * 0.55)));
    context.fillStyle = shade;
    context.beginPath();
    context.arc(sx, sy, radius, 0, Math.PI * 2);
    context.fill();
    if (body.pinned) ring(sx, sy, radius + 4, PINNED_RING, [3, 3]);
    if (selected) ring(sx, sy, radius + 7, SELECTED_RING, []);
    context.globalAlpha = 1;
  }

  function ring(sx, sy, radius, colour, dash) {
    context.save();
    context.strokeStyle = colour;
    context.lineWidth = 1.5;
    context.setLineDash(dash);
    context.beginPath();
    context.arc(sx, sy, radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawLaunch({ body, aimX, aimY, path }) {
    context.save();
    context.strokeStyle = PREDICTION;
    context.lineWidth = 1.5;
    context.setLineDash([5, 5]);
    context.beginPath();
    path.forEach(([x, y], index) => {
      const [sx, sy] = toScreen(x, y);
      if (index === 0) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    });
    context.stroke();
    context.setLineDash([]);
    const [fromX, fromY] = toScreen(body.x, body.y);
    const [toX, toY] = toScreen(aimX, aimY);
    context.strokeStyle = SELECTED_RING;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();
    drawBody(body, { selected: false, ghost: true });
  }

  function draw({ bodies, selected, launch, trails }) {
    context.fillStyle = '#060f1c';
    context.fillRect(0, 0, width, height);
    drawGrid();
    if (trails) bodies.forEach(drawTrail);
    for (const body of bodies) drawBody(body, { selected: body === selected });
    if (launch) drawLaunch(launch);
  }

  function bodyAt(bodies, clientX, clientY, slackPx) {
    const [x, y] = toWorld(clientX, clientY);
    let nearest = null;
    let nearestGap = Infinity;
    for (const body of bodies) {
      const gap = Math.hypot(body.x - x, body.y - y) * camera.zoom - Math.max(MIN_DRAWN_RADIUS_PX, radiusOf(body.mass) * camera.zoom);
      if (gap < slackPx && gap < nearestGap) {
        nearest = body;
        nearestGap = gap;
      }
    }
    return nearest;
  }

  function frame(bodies) {
    if (!bodies.length) return;
    const xs = bodies.map((body) => body.x);
    const ys = bodies.map((body) => body.y);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    camera.x = (minX + maxX) / 2;
    camera.y = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY, 200) * 1.3;
    camera.zoom = Math.min(width, height) / span;
  }

  return { resize, draw, toWorld, zoomAround, panBy, bodyAt, frame, camera };
}
