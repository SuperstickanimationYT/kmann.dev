import { wedgeOf } from './cones.js';
import { createGlow } from './glow.js';
import { isCollisionless, KINDS, radiusOf } from './physics.js';

const GRID_SPACING = 100;
const TRAIL_POINTS = 400;
const TRAIL_MIN_GAP = 2;
const GLOW_FROM_MASS = 300;
const MIN_DRAWN_RADIUS_PX = 4;
const DUST_BELOW_MASS = 0.1;
const DUST_RADIUS_PX = 1.2;
const DUST = 'rgba(190, 170, 140, 0.8)';
const STARLIGHT = 'rgba(235, 240, 255, 0.85)';
const STAR_RADIUS_PX = 1.1;
const DARK_MATTER = 'rgba(165, 125, 255, 0.28)';
const DARK_MATTER_RADIUS_PX = 1.6;
const MASS_COLOURS = [
  [1, [143, 163, 184]],
  [30, [79, 155, 224]],
  [150, [224, 180, 106]],
  [1000, [255, 241, 192]],
];
const SELECTED_RING = '#5fe3ff';
const PINNED_RING = 'rgba(255, 255, 255, 0.55)';
const PREDICTION = 'rgba(95, 227, 255, 0.55)';
const TEST_BALL = [95, 227, 255];
const TEST_BALL_RADIUS_PX = 3;
const MISSING_SPACE = 'rgba(0, 0, 0, 0.72)';
const MISSING_HATCH = 'rgba(95, 227, 255, 0.12)';
const WEDGE_EDGE = 'rgba(95, 227, 255, 0.55)';
const HATCH_SPACING_PX = 10;

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

const isDust = (body) => !body.test && body.kind === KINDS.solid && body.mass < DUST_BELOW_MASS;

const isSpeck = (body) => !body.test && (isDust(body) || isCollisionless(body));

export function noteTrails(bodies) {
  for (const body of bodies) {
    if (isSpeck(body)) continue;
    const last = body.trail.at(-1);
    if (last && Math.hypot(last[0] - body.x, last[1] - body.y) < TRAIL_MIN_GAP) continue;
    body.trail.push([body.x, body.y]);
    if (body.trail.length > TRAIL_POINTS) body.trail.shift();
  }
}

export function createView(canvas) {
  const context = canvas.getContext('2d');
  const glowLayer = createGlow();
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

  function tracePath(points) {
    context.beginPath();
    let penDown = false;
    for (const point of points) {
      if (!point) {
        penDown = false;
        continue;
      }
      const [sx, sy] = toScreen(...point);
      if (penDown) context.lineTo(sx, sy);
      else context.moveTo(sx, sy);
      penDown = true;
    }
  }

  function drawTrail(body) {
    if (body.trail.length < 2) return;
    context.strokeStyle = body.test ? rgb(TEST_BALL, 0.5) : rgb(colourOf(body.mass), 0.35);
    context.lineWidth = 1.5;
    tracePath(body.trail);
    context.lineTo(...toScreen(body.x, body.y));
    context.stroke();
  }

  function drawTestBall(body, { selected, ghost = false }) {
    const [sx, sy] = toScreen(body.x, body.y);
    context.globalAlpha = ghost ? 0.5 : 1;
    context.fillStyle = rgb(TEST_BALL);
    context.beginPath();
    context.arc(sx, sy, TEST_BALL_RADIUS_PX, 0, Math.PI * 2);
    context.fill();
    if (selected) ring(sx, sy, TEST_BALL_RADIUS_PX + 6, SELECTED_RING, []);
    context.globalAlpha = 1;
  }

  function drawWedge(cone, cutAngle) {
    const wedge = wedgeOf(cone, cutAngle);
    const [sx, sy] = toScreen(wedge.x, wedge.y);
    const reach = Math.hypot(width, height) * 2 + Math.hypot(sx - width / 2, sy - height / 2);
    const corner = (bearing) => [sx + Math.cos(bearing) * reach, sy + Math.sin(bearing) * reach];
    context.save();
    context.beginPath();
    context.moveTo(sx, sy);
    const steps = Math.max(1, Math.ceil(wedge.angle / 0.2));
    for (let i = 0; i <= steps; i++) context.lineTo(...corner(wedge.from + (wedge.angle * i) / steps));
    context.closePath();
    context.fillStyle = MISSING_SPACE;
    context.fill();
    context.clip();
    context.strokeStyle = MISSING_HATCH;
    context.lineWidth = 1;
    context.beginPath();
    for (let offset = -reach; offset < reach; offset += HATCH_SPACING_PX) {
      context.moveTo(sx + offset - reach, sy - reach);
      context.lineTo(sx + offset + reach, sy + reach);
    }
    context.stroke();
    context.restore();
    context.save();
    context.strokeStyle = WEDGE_EDGE;
    context.setLineDash([6, 5]);
    context.lineWidth = 1.5;
    for (const bearing of [wedge.from, wedge.to]) {
      context.beginPath();
      context.moveTo(sx, sy);
      context.lineTo(...corner(bearing));
      context.stroke();
    }
    context.restore();
    if (wedge.angle < Math.PI / 180) return;
    const labelAt = toScreen(wedge.x + Math.cos(cutAngle) * (radiusOf(cone.mass) + 60 / camera.zoom), wedge.y + Math.sin(cutAngle) * (radiusOf(cone.mass) + 60 / camera.zoom));
    context.fillStyle = WEDGE_EDGE;
    context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.fillText(`${Math.round((wedge.angle * 180) / Math.PI)}° missing`, ...labelAt);
  }

  function drawSpecks(bodies, belongs, colour, radiusOfSpeck) {
    context.fillStyle = colour;
    context.beginPath();
    for (const body of bodies) {
      if (!belongs(body)) continue;
      const [sx, sy] = toScreen(body.x, body.y);
      const radius = radiusOfSpeck(body);
      if (sx < -radius || sy < -radius || sx > width + radius || sy > height + radius) continue;
      context.moveTo(sx + radius, sy);
      context.arc(sx, sy, radius, 0, Math.PI * 2);
    }
    context.fill();
  }

  function drawBody(body, { selected, ghost = false }) {
    if (body.test) {
      drawTestBall(body, { selected, ghost });
      return;
    }
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

  function drawLaunch({ body, pullX, pullY, path }) {
    context.save();
    context.strokeStyle = PREDICTION;
    context.lineWidth = 1.5;
    context.setLineDash([5, 5]);
    tracePath(path);
    context.stroke();
    context.setLineDash([]);
    const [fromX, fromY] = toScreen(body.x, body.y);
    const [toX, toY] = toScreen(2 * body.x - pullX, 2 * body.y - pullY);
    context.strokeStyle = SELECTED_RING;
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.stroke();
    context.restore();
    drawBody(body, { selected: false, ghost: true });
  }

  const isGalacticStar = (body) => !body.test && body.kind === KINDS.star;
  const isDarkMatter = (body) => !body.test && body.kind === KINDS.darkMatter;

  function draw({ bodies, selected, launch, trails, glow, cutAngle }) {
    context.fillStyle = '#060f1c';
    context.fillRect(0, 0, width, height);
    drawGrid();
    if (cutAngle !== null) for (const cone of bodies.filter((body) => !body.test)) drawWedge(cone, cutAngle);
    if (trails) bodies.forEach(drawTrail);
    if (glow) glowLayer.draw(context, bodies.filter(isGalacticStar), { toScreen, zoom: camera.zoom, width, height });
    else drawSpecks(bodies, isDarkMatter, DARK_MATTER, () => DARK_MATTER_RADIUS_PX);
    drawSpecks(bodies, isDust, DUST, (body) => Math.max(DUST_RADIUS_PX, radiusOf(body.mass) * camera.zoom));
    if (!glow) drawSpecks(bodies, isGalacticStar, STARLIGHT, () => STAR_RADIUS_PX);
    for (const body of bodies) if (!isSpeck(body)) drawBody(body, { selected: body === selected });
    if (launch) drawLaunch(launch);
  }

  function bodyAt(bodies, clientX, clientY, slackPx) {
    const [x, y] = toWorld(clientX, clientY);
    let nearest = null;
    let nearestGap = Infinity;
    for (const body of bodies) {
      if (isSpeck(body)) continue;
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
