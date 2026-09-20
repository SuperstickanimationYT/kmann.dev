const canvas = document.querySelector('[data-stage]');
const context = canvas.getContext('2d');

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

function drawGrid() {
  context.strokeStyle = 'rgba(61, 143, 224, 0.16)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 32) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
}

function drawOrbit(elapsed) {
  const radius = Math.min(width, height) * 0.28;
  const angle = elapsed / 1400;
  const x = width / 2 + Math.cos(angle) * radius;
  const y = height / 2 + Math.sin(angle) * radius;

  context.strokeStyle = 'rgba(61, 143, 224, 0.45)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.stroke();

  context.fillStyle = '#4a9bea';
  context.shadowColor = '#4a9bea';
  context.shadowBlur = 18;
  context.beginPath();
  context.arc(x, y, 9, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
}

function frame(elapsed) {
  context.clearRect(0, 0, width, height);
  drawGrid();
  drawOrbit(elapsed);
  window.requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
window.requestAnimationFrame(frame);
