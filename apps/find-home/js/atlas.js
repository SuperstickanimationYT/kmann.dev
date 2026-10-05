import { armTraces, BAR_ANGLE, DISK, LY_PER_PC, SUN_POSITION } from './milky-way.js';

const SIZE = 900;
const HALF_SPAN = 19000;
const INSET_SIZE = 280;
const INSET_REACH_LY = 1600;
const INSET_REACH = INSET_REACH_LY / LY_PER_PC;
const COLOURS = {
  background: '#03080f',
  arm: 'rgba(95, 227, 255, 0.55)',
  armGuess: 'rgba(95, 227, 255, 0.22)',
  bar: 'rgba(255, 214, 150, 0.35)',
  nebula: '#ff6f8f',
  label: '#b9d6f5',
  dim: '#6f9dc9',
  sun: '#ffe08a',
  star: '#e2effd',
  edge: '#1f4f80',
};

function drawArms(context, toCanvas) {
  context.lineWidth = 9;
  context.lineCap = 'round';
  for (const { name, points } of armTraces(1)) {
    for (const fitted of [false, true]) {
      context.strokeStyle = fitted ? COLOURS.arm : COLOURS.armGuess;
      context.setLineDash(fitted ? [] : [10, 10]);
      context.beginPath();
      let drawing = false;
      points.forEach((point) => {
        if (point.fitted !== fitted || point.strength <= 0) {
          drawing = false;
          return;
        }
        const [x, y] = toCanvas(point.x, point.y);
        if (drawing) context.lineTo(x, y);
        else context.moveTo(x, y);
        drawing = true;
      });
      context.stroke();
    }
    const fittedPoints = points.filter((point) => point.fitted);
    const middle = fittedPoints[Math.floor(fittedPoints.length / 2)];
    if (middle && !name.startsWith('3-kpc')) {
      const [x, y] = toCanvas(middle.x, middle.y);
      context.setLineDash([]);
      context.fillStyle = COLOURS.dim;
      context.font = 'italic 14px "Trebuchet MS", sans-serif';
      context.fillText(name, x + 8, y - 8);
    }
  }
  context.setLineDash([]);
}

function drawBar(context, toCanvas, scale) {
  const [x, y] = toCanvas(0, 0);
  context.save();
  context.translate(x, y);
  context.rotate(BAR_ANGLE);
  context.fillStyle = COLOURS.bar;
  context.beginPath();
  context.ellipse(0, 0, DISK.longBarScales[1] * scale * 2, DISK.longBarScales[0] * scale, 0, 0, 2 * Math.PI);
  context.fill();
  context.beginPath();
  context.ellipse(0, 0, DISK.bulgeScales[1] * scale * 2.5, DISK.bulgeScales[0] * scale * 2.5, 0, 0, 2 * Math.PI);
  context.fill();
  context.restore();
}

function drawSun(context, x, y) {
  context.strokeStyle = COLOURS.sun;
  context.fillStyle = COLOURS.sun;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 7, 0, 2 * Math.PI);
  context.stroke();
  context.beginPath();
  context.arc(x, y, 2, 0, 2 * Math.PI);
  context.fill();
}

function createLabeller(context) {
  const placed = [];
  return (text, x, y) => {
    const width = context.measureText(text).width;
    const box = [x, y - 11, x + width, y + 3];
    if (placed.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) return;
    placed.push(box);
    context.fillText(text, x, y);
  };
}

const isCatalogueDesignation = (name) => /^G\d/.test(name);

function drawNebulae(context, nebulae, toCanvas, label) {
  const byImportance = [...nebulae].sort(
    (a, b) => isCatalogueDesignation(a.name) - isCatalogueDesignation(b.name) || b.ionizing - a.ionizing,
  );
  context.font = '13px "Trebuchet MS", sans-serif';
  byImportance.forEach((nebula) => {
    const [x, y] = toCanvas(nebula.present[0], nebula.present[1]);
    const radius = 1.5 + 1.4 * Math.max(0, Math.log10(nebula.ionizing / 1e48));
    context.fillStyle = COLOURS.nebula;
    context.beginPath();
    context.arc(x, y, radius, 0, 2 * Math.PI);
    context.fill();
    if (isCatalogueDesignation(nebula.name)) return;
    context.fillStyle = COLOURS.label;
    label(nebula.name, x + radius + 3, y + 4);
  });
}

function drawScale(context, scale, x, y, lightYears) {
  const length = (lightYears / LY_PER_PC) * scale;
  context.strokeStyle = COLOURS.label;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + length, y);
  context.stroke();
  context.fillStyle = COLOURS.label;
  context.font = '13px "Trebuchet MS", sans-serif';
  context.fillText(`${lightYears.toLocaleString('en')} light-years`, x, y - 8);
}

function drawInset(context, nebulae, nearbyNamed) {
  const left = SIZE - INSET_SIZE - 12;
  const top = SIZE - INSET_SIZE - 12;
  const scale = INSET_SIZE / 2 / INSET_REACH;
  const centre = [left + INSET_SIZE / 2, top + INSET_SIZE / 2];
  const toInset = (x, y) => [centre[0] + (x - SUN_POSITION[0]) * scale, centre[1] - (y - SUN_POSITION[1]) * scale];
  context.fillStyle = COLOURS.background;
  context.strokeStyle = COLOURS.edge;
  context.lineWidth = 1;
  context.fillRect(left, top, INSET_SIZE, INSET_SIZE);
  context.strokeRect(left, top, INSET_SIZE, INSET_SIZE);
  context.save();
  context.beginPath();
  context.rect(left, top, INSET_SIZE, INSET_SIZE);
  context.clip();
  context.font = '11px "Trebuchet MS", sans-serif';
  const label = createLabeller(context);
  drawSun(context, centre[0], centre[1]);
  label('Sun', centre[0] + 9, centre[1] + 4);
  nearbyNamed.forEach((star) => {
    const [x, y] = toInset(star.position[0], star.position[1]);
    context.fillStyle = COLOURS.star;
    context.beginPath();
    context.arc(x, y, 1.8, 0, 2 * Math.PI);
    context.fill();
    context.fillStyle = COLOURS.dim;
    label(star.name, x + 4, y + 3);
  });
  nebulae.forEach((nebula) => {
    const [x, y] = toInset(nebula.present[0], nebula.present[1]);
    context.fillStyle = COLOURS.nebula;
    context.beginPath();
    context.arc(x, y, 3.5, 0, 2 * Math.PI);
    context.fill();
    context.fillStyle = COLOURS.label;
    label(nebula.name, x + 5, y + 4);
  });
  context.restore();
  context.fillStyle = COLOURS.label;
  context.font = '12px "Trebuchet MS", sans-serif';
  context.fillText(`Within ${INSET_REACH_LY.toLocaleString('en')} light-years, same orientation`, left + 8, top + 18);
}

export function drawAtlas(canvas, nebulae, nearby) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  const scale = SIZE / 2 / HALF_SPAN;
  const toCanvas = (x, y) => [SIZE / 2 + x * scale, SIZE / 2 - y * scale];

  context.fillStyle = COLOURS.background;
  context.fillRect(0, 0, SIZE, SIZE);
  drawBar(context, toCanvas, scale);
  drawArms(context, toCanvas);
  const label = createLabeller(context);
  const [sx, sy] = toCanvas(SUN_POSITION[0], SUN_POSITION[1]);
  drawSun(context, sx, sy);
  context.font = 'bold 14px "Trebuchet MS", sans-serif';
  label('Sun', sx + 11, sy + 5);
  const [cx, cy] = toCanvas(0, 0);
  context.fillStyle = COLOURS.label;
  context.font = '13px "Trebuchet MS", sans-serif';
  label('Galactic centre', cx + 10, cy + 4);
  drawNebulae(context, nebulae, toCanvas, label);

  context.fillStyle = COLOURS.dim;
  context.fillText('Rotation: clockwise', 16, 24);
  context.fillText('Solid arms: measured. Dashed: extrapolated.', 16, 42);
  drawScale(context, scale, 16, SIZE - 24, 10000);

  const local = nebulae.filter((nebula) => Math.hypot(nebula.present[0] - SUN_POSITION[0], nebula.present[1] - SUN_POSITION[1]) < INSET_REACH);
  drawInset(context, local, nearby.filter((star) => star.name));
}
