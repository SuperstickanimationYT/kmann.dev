const MAX_POINTS = 400;
const PADDING = { top: 14, right: 6, bottom: 4, left: 6 };

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function createPopulationChart(canvas, tip) {
  const context = canvas.getContext('2d');
  let points = [];
  let hoverIndex = -1;
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
    draw();
  }

  function record(tick, count) {
    points.push({ tick, count });
    if (points.length > MAX_POINTS) points = points.filter((_, index) => index % 2 === 0);
  }

  function clear() {
    points = [];
    hoverIndex = -1;
    tip.hidden = true;
  }

  const highest = () => Math.max(10, ...points.map((point) => point.count));
  const xOf = (index) => PADDING.left + (index / Math.max(1, points.length - 1)) * (width - PADDING.left - PADDING.right);
  const yOf = (count) => height - PADDING.bottom - (count / highest()) * (height - PADDING.top - PADDING.bottom);

  function draw() {
    context.clearRect(0, 0, width, height);
    context.strokeStyle = token('--edge');
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(PADDING.left, height - PADDING.bottom + 0.5);
    context.lineTo(width - PADDING.right, height - PADDING.bottom + 0.5);
    context.stroke();

    context.fillStyle = token('--text-dim');
    context.font = '11px system-ui, sans-serif';
    context.textBaseline = 'top';
    context.fillText(highest().toLocaleString(), PADDING.left, 0);
    if (points.length < 2) return;

    context.strokeStyle = token('--link');
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(xOf(index), yOf(point.count));
      else context.lineTo(xOf(index), yOf(point.count));
    });
    context.stroke();

    if (hoverIndex < 0) return;
    const point = points[hoverIndex];
    const x = xOf(hoverIndex);
    context.strokeStyle = token('--text-dim');
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 0.5, PADDING.top);
    context.lineTo(x + 0.5, height - PADDING.bottom);
    context.stroke();
    context.fillStyle = token('--link');
    context.strokeStyle = token('--bg');
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, yOf(point.count), 4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    tip.textContent = `${point.count.toLocaleString()} cells at ${point.tick.toLocaleString()} ticks`;
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max(0, x - tip.offsetWidth / 2), width - tip.offsetWidth)}px`;
  }

  function pointAt(clientX) {
    const box = canvas.getBoundingClientRect();
    const fraction = (clientX - box.left - PADDING.left) / (box.width - PADDING.left - PADDING.right);
    return Math.round(Math.min(1, Math.max(0, fraction)) * (points.length - 1));
  }

  canvas.addEventListener('pointermove', (event) => {
    if (points.length < 2) return;
    hoverIndex = pointAt(event.clientX);
    draw();
  });
  canvas.addEventListener('pointerleave', () => {
    hoverIndex = -1;
    tip.hidden = true;
    draw();
  });

  return { resize, record, clear, draw };
}
