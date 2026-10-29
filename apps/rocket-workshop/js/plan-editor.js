import { PATH_REACH, pathAt, planPoints } from './autopilot.js';
import { PART_LIMITS } from './parts.js';
import { EARTH } from './planets.js';

const AIR_TOP = EARTH.atmosphere.top;
const PADDING_PX = 16;
const HANDLE_PX = 7;
const HIT_PX = 22;
const PATH_SAMPLES = 60;
const GROUND_BEFORE = 0.15;
const GROUND_AFTER = 0.15;
const COLORS = {
  space: '#050d18',
  ground: '#2c6e49',
  groundEdge: '#7dffa8',
  air: 'rgba(61, 143, 224, 0.22)',
  orbit: '#5fe3ff',
  path: '#ffcf5c',
  guide: 'rgba(255, 255, 255, 0.35)',
  handle: '#ffffff',
  label: '#9fc3e6',
};

const clamp = (value, { min, max, step }) => Math.max(min, Math.min(max, Math.round(value / step) * step));

function onPlanet(x, y) {
  const angle = x / EARTH.radius;
  const r = EARTH.radius + y;
  return { x: r * Math.sin(angle), y: r * Math.cos(angle) - EARTH.radius };
}

function offPlanet(point) {
  const up = point.y + EARTH.radius;
  return { along: Math.atan2(point.x, up) * EARTH.radius, height: Math.hypot(point.x, up) - EARTH.radius };
}

function arc(height, from, to) {
  return Array.from({ length: PATH_SAMPLES + 1 }, (_, k) => onPlanet(from + ((to - from) * k) / PATH_SAMPLES, height));
}

export function planEditor(plan, { onChange, disabled }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'rw-plan';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Flight plan: the path the computer flies from the pad to orbit. Drag the dots to change it.');
  const context = canvas.getContext('2d');
  let view = null;
  let dragging = null;

  const fitView = (width, height) => {
    const reach = plan.orbitHeight * PATH_REACH;
    const points = [...arc(0, -reach * GROUND_BEFORE, reach * (1 + GROUND_AFTER)), ...arc(plan.orbitHeight * 1.15, -reach * GROUND_BEFORE, reach * (1 + GROUND_AFTER))];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const left = Math.min(...xs);
    const bottom = Math.min(...ys);
    const scale = Math.min((width - PADDING_PX * 2) / (Math.max(...xs) - left), (height - PADDING_PX * 2) / (Math.max(...ys) - bottom));
    return { width, height, left, bottom, scale };
  };
  const toScreen = (p) => ({ x: PADDING_PX + (p.x - view.left) * view.scale, y: view.height - PADDING_PX - (p.y - view.bottom) * view.scale });
  const fromScreen = (s) => ({ x: (s.x - PADDING_PX) / view.scale + view.left, y: (view.height - PADDING_PX - s.y) / view.scale + view.bottom });

  const line = (points, color, width, dash = []) => {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash(dash);
    context.beginPath();
    points.map(toScreen).forEach((s, k) => (k === 0 ? context.moveTo(s.x, s.y) : context.lineTo(s.x, s.y)));
    context.stroke();
    context.setLineDash([]);
  };
  const label = (text, at, align = 'left') => {
    const s = toScreen(at);
    context.fillStyle = COLORS.label;
    context.font = '11px "Trebuchet MS", system-ui, sans-serif';
    context.textAlign = align;
    context.textBaseline = 'bottom';
    context.fillText(text, s.x, s.y - 4);
  };

  function draw() {
    const box = canvas.getBoundingClientRect();
    if (!box.width) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (!dragging) view = fitView(box.width, box.height);
    const reach = plan.orbitHeight * PATH_REACH;
    const from = -reach * GROUND_BEFORE;
    const to = reach * (1 + GROUND_AFTER);
    context.fillStyle = COLORS.space;
    context.fillRect(0, 0, box.width, box.height);

    const ground = arc(0, from, to).map(toScreen);
    const airTop = arc(AIR_TOP, from, to).map(toScreen);
    context.fillStyle = COLORS.air;
    context.beginPath();
    [...airTop, ...[...ground].reverse()].forEach((s, k) => (k === 0 ? context.moveTo(s.x, s.y) : context.lineTo(s.x, s.y)));
    context.fill();
    context.fillStyle = COLORS.ground;
    context.beginPath();
    ground.forEach((s, k) => (k === 0 ? context.moveTo(s.x, s.y) : context.lineTo(s.x, s.y)));
    context.lineTo(box.width, box.height);
    context.lineTo(0, box.height);
    context.fill();
    line(arc(0, from, to), COLORS.groundEdge, 1.5);
    label('Air ends', onPlanet(from, AIR_TOP));
    line(arc(plan.orbitHeight, from, to), COLORS.orbit, 1.5, [6, 5]);

    const points = planPoints(plan);
    const handles = points.map((p) => onPlanet(p.x, p.y));
    line([handles[0], handles[1]], COLORS.guide, 1);
    line([handles[2], handles[3]], COLORS.guide, 1);
    line(Array.from({ length: PATH_SAMPLES + 1 }, (_, k) => {
      const p = pathAt(points, k / PATH_SAMPLES);
      return onPlanet(p.x, p.y);
    }), COLORS.path, 3);
    label(`Orbit ${Math.round(plan.orbitHeight / 1000)} km`, onPlanet(from, plan.orbitHeight));
    handles.slice(1).forEach((p, k) => {
      const s = toScreen(p);
      context.fillStyle = k === 2 ? COLORS.orbit : COLORS.handle;
      context.strokeStyle = COLORS.space;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(s.x, s.y, HANDLE_PX, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    });
  }

  const handleAt = (s) => {
    const points = planPoints(plan);
    let best = null;
    let bestDistance = HIT_PX;
    points.slice(1).forEach((p, k) => {
      const h = toScreen(onPlanet(p.x, p.y));
      const distance = Math.hypot(h.x - s.x, h.y - s.y);
      if (distance < bestDistance) {
        best = ['turnStart', 'turnFlat', 'orbitHeight'][k];
        bestDistance = distance;
      }
    });
    return best;
  };
  const local = (event) => {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (disabled) return;
    dragging = handleAt(local(event));
    if (dragging) canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) {
      canvas.style.cursor = !disabled && handleAt(local(event)) ? 'grab' : '';
      return;
    }
    const { along, height } = offPlanet(fromScreen(local(event)));
    if (dragging === 'orbitHeight') plan.orbitHeight = clamp(height, PART_LIMITS.orbitHeight);
    if (dragging === 'turnStart') plan.turnStart = clamp(height / plan.orbitHeight, PART_LIMITS.turnStart);
    if (dragging === 'turnFlat') plan.turnFlat = clamp(1 - along / (plan.orbitHeight * PATH_REACH), PART_LIMITS.turnFlat);
    draw();
  });
  const finish = () => {
    if (!dragging) return;
    dragging = null;
    draw();
    onChange();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  new ResizeObserver(draw).observe(canvas);
  canvas.redraw = draw;
  return canvas;
}
