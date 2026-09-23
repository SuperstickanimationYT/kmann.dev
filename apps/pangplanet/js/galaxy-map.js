import { GALAXY, SECTOR_SIZE } from './universe.js';

const VIEW_RADIUS = { nearby: 5.5e7, galaxy: GALAXY.radius * 1.08 };
const ZOOM_STEP = 1.5;
const ZOOM_LIMITS = { min: 0.25, max: 40 };
const STAR_DOT_PX = 3;
const PICK_REACH_PX = 14;
const LABELS_ABOVE_PX_PER_SECTOR = 18;

export function createGalaxyMap(canvas) {
  const context = canvas.getContext('2d');
  const view = { mode: 'nearby', zoom: 1, size: 0, scale: 1, centerX: 0, centerY: 0 };
  let selected = null;

  function fit() {
    const ratio = window.devicePixelRatio || 1;
    view.size = canvas.clientWidth;
    canvas.width = Math.round(view.size * ratio);
    canvas.height = Math.round(view.size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  const toMap = (x, y) => [view.size / 2 + (x - view.centerX) * view.scale, view.size / 2 - (y - view.centerY) * view.scale];
  const onMap = (mx, my) => mx > -20 && my > -20 && mx < view.size + 20 && my < view.size + 20;

  function ring(x, y, radius, colour, dashed) {
    const [mx, my] = toMap(x, y);
    context.save();
    context.strokeStyle = colour;
    context.lineWidth = 1.5;
    if (dashed) context.setLineDash([5, 5]);
    context.beginPath();
    context.arc(mx, my, radius * view.scale, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawGalaxy() {
    const [mx, my] = toMap(GALAXY.x, GALAXY.y);
    const radius = GALAXY.radius * view.scale;
    const glow = context.createRadialGradient(mx, my, 0, mx, my, radius);
    glow.addColorStop(0, 'rgba(120, 150, 255, 0.22)');
    glow.addColorStop(1, 'rgba(60, 80, 160, 0.06)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(mx, my, radius, 0, Math.PI * 2);
    context.fill();
    ring(GALAXY.x, GALAXY.y, GALAXY.radius, 'rgba(140, 170, 255, 0.45)', false);
  }

  function drawStars(chart) {
    const showLabels = view.scale * SECTOR_SIZE > LABELS_ABOVE_PX_PER_SECTOR;
    context.font = '11px "Trebuchet MS", "Segoe UI", sans-serif';
    context.textAlign = 'center';
    for (const entry of chart.values()) {
      const [mx, my] = toMap(entry.x, entry.y);
      if (!onMap(mx, my)) continue;
      context.beginPath();
      context.arc(mx, my, STAR_DOT_PX, 0, Math.PI * 2);
      if (entry.visited) {
        context.fillStyle = entry.fill;
        context.fill();
      } else {
        context.strokeStyle = entry.fill;
        context.lineWidth = 1.5;
        context.stroke();
      }
      if (entry === selected) ring(entry.x, entry.y, (STAR_DOT_PX + 5) / view.scale, '#ffc933', false);
      if (showLabels || entry === selected) {
        context.fillStyle = 'rgba(200, 220, 245, 0.85)';
        context.fillText(entry.name, mx, my + 15);
      }
    }
  }

  function drawRocket(rocket) {
    const [mx, my] = toMap(rocket.x, rocket.y);
    context.fillStyle = '#6dff8c';
    context.beginPath();
    context.moveTo(mx, my - 7);
    context.lineTo(mx + 5, my + 5);
    context.lineTo(mx - 5, my + 5);
    context.closePath();
    context.fill();
  }

  function draw({ chart, rocket, warpRange, telescopeRange }) {
    if (canvas.clientWidth !== view.size) fit();
    const focus = view.mode === 'nearby' ? rocket : GALAXY;
    view.centerX = focus.x;
    view.centerY = focus.y;
    view.scale = view.size / 2 / (VIEW_RADIUS[view.mode] / view.zoom);
    context.fillStyle = '#02060d';
    context.fillRect(0, 0, view.size, view.size);
    drawGalaxy();
    if (warpRange) ring(rocket.x, rocket.y, warpRange, 'rgba(160, 120, 255, 0.7)', false);
    if (telescopeRange) ring(rocket.x, rocket.y, telescopeRange, 'rgba(63, 224, 208, 0.6)', true);
    drawStars(chart);
    drawRocket(rocket);
  }

  function pick(chart, clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    let nearest = null;
    let nearestDistance = PICK_REACH_PX;
    for (const entry of chart.values()) {
      const [mx, my] = toMap(entry.x, entry.y);
      const distance = Math.hypot(mx - x, my - y);
      if (distance < nearestDistance) {
        nearest = entry;
        nearestDistance = distance;
      }
    }
    selected = nearest;
    return nearest;
  }

  function showView(mode) {
    view.mode = mode;
    view.zoom = 1;
  }

  function zoom(direction) {
    const factor = direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
    view.zoom = Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, view.zoom * factor));
  }

  return { draw, pick, showView, zoom };
}
