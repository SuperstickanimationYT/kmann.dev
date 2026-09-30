const UNITS = 100;
const MIN_POINT_SPACING = 1.5;
const INK = '#e2effd';
const GUIDE = 'rgba(95, 227, 255, 0.18)';
const GUIDE_LINES = [25, 55, 80];

export function createDrawpad(canvas, onChange) {
  const context = canvas.getContext('2d');
  let strokes = [];
  let drawing = null;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const size = canvas.getBoundingClientRect().width;
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    draw();
  }

  function draw() {
    const scale = canvas.width / UNITS;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, UNITS, UNITS);
    context.lineWidth = 0.4;
    context.strokeStyle = GUIDE;
    context.setLineDash([2, 2]);
    for (const y of GUIDE_LINES) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(UNITS, y);
      context.stroke();
    }
    context.beginPath();
    context.moveTo(UNITS / 2, 0);
    context.lineTo(UNITS / 2, UNITS);
    context.stroke();
    context.setLineDash([]);
    context.strokeStyle = INK;
    context.lineWidth = 7;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    for (const stroke of drawing ? [...strokes, drawing] : strokes) {
      context.beginPath();
      stroke.forEach(([x, y], index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
      if (stroke.length === 1) context.lineTo(stroke[0][0] + 0.1, stroke[0][1]);
      context.stroke();
    }
  }

  function pointFrom(event) {
    const box = canvas.getBoundingClientRect();
    const clamp = (value) => Math.min(UNITS, Math.max(0, value));
    return [clamp(((event.clientX - box.left) / box.width) * UNITS), clamp(((event.clientY - box.top) / box.height) * UNITS)];
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    drawing = [pointFrom(event)];
    draw();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drawing) return;
    const point = pointFrom(event);
    const last = drawing[drawing.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_POINT_SPACING) return;
    drawing.push(point);
    draw();
  });

  const finish = () => {
    if (!drawing) return;
    strokes = [...strokes, drawing.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])];
    drawing = null;
    draw();
    onChange(strokes);
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  new ResizeObserver(resize).observe(canvas);

  return {
    load(next) {
      strokes = next;
      drawing = null;
      draw();
    },
    undo() {
      strokes = strokes.slice(0, -1);
      draw();
      onChange(strokes);
    },
    clear() {
      strokes = [];
      draw();
      onChange(strokes);
    },
  };
}
