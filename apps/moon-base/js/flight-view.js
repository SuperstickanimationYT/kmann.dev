import {
  EARTH_RADIUS, ENTRY_ALTITUDE, MOON_DISTANCE, MOON_RADIUS, dominantBody, judgeEntry, moonAt,
} from './orbit.js';

const STARS = Array.from({ length: 220 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2 }));
export const ZOOM_RANGE = { min: 0.5, max: 4e6 };

export function createCamera() {
  return { focus: 'rocket', metersPerPixel: 20 };
}

function focusPoint(f, camera) {
  if (camera.focus === 'earth') return { x: 0, y: 0 };
  if (camera.focus === 'moon') return moonAt(f.s.t);
  return f.s;
}

function makeProjector(f, camera, width, height) {
  const center = focusPoint(f, camera);
  const mpp = camera.metersPerPixel;
  return (x, y) => ({ x: width / 2 + (x - center.x) / mpp, y: height / 2 - (y - center.y) / mpp });
}

function drawStars(context, width, height) {
  context.fillStyle = '#ffffff';
  for (const star of STARS) {
    context.globalAlpha = 0.25 + star.r / 2;
    context.fillRect(star.x * width, star.y * height, star.r, star.r);
  }
  context.globalAlpha = 1;
}

function drawBody(context, project, mpp, body, width, height) {
  const center = project(body.x, body.y);
  const radius = body.radius / mpp;
  if (center.x + radius < 0 || center.x - radius > width || center.y + radius < 0 || center.y - radius > height) return;
  context.fillStyle = body.fill;
  context.beginPath();
  if (radius < 2e4) {
    context.arc(center.x, center.y, Math.max(radius, 1.5), 0, Math.PI * 2);
  } else {
    const toView = Math.atan2(height / 2 - center.y, width / 2 - center.x);
    const span = Math.min(Math.PI, (2 * Math.hypot(width, height)) / radius);
    for (let k = -64; k <= 64; k += 1) {
      const a = toView + (span * k) / 64;
      context.lineTo(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a));
    }
    context.lineTo(center.x + (radius - 1e4) * Math.cos(toView), center.y + (radius - 1e4) * Math.sin(toView));
  }
  context.closePath();
  context.fill();
  if (body.halo && radius < 2e4) {
    context.strokeStyle = body.halo;
    context.lineWidth = Math.max(1, body.haloWidth / mpp);
    context.beginPath();
    context.arc(center.x, center.y, (body.radius + body.haloWidth / 2) / mpp, 0, Math.PI * 2);
    context.stroke();
  }
}

function drawMoonOrbit(context, project, mpp) {
  const center = project(0, 0);
  context.strokeStyle = 'rgba(160, 180, 210, 0.25)';
  context.lineWidth = 1;
  context.setLineDash([4, 6]);
  context.beginPath();
  context.arc(center.x, center.y, MOON_DISTANCE / mpp, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
}

function drawPrediction(context, f, project) {
  const prediction = f.prediction;
  if (!prediction || f.landed) return;
  const frame = dominantBody(f.s);
  const moonNow = moonAt(f.s.t);
  const place = (p) => {
    if (frame === 'earth') return project(p.x, p.y);
    const moon = moonAt(p.t);
    return project(p.x - moon.x + moonNow.x, p.y - moon.y + moonNow.y);
  };
  context.strokeStyle = '#5fe3ff';
  context.lineWidth = 1.5;
  context.beginPath();
  prediction.points.forEach((p, n) => {
    const at = place(p);
    if (n === 0) context.moveTo(at.x, at.y);
    else context.lineTo(at.x, at.y);
  });
  context.stroke();
  const event = prediction.event;
  if (!event) return;
  const last = place(prediction.points[prediction.points.length - 1]);
  const good = event.kind === 'entry' && judgeEntry(event.angle) === 'good';
  context.strokeStyle = good ? '#4dff6a' : '#ff5a4d';
  context.lineWidth = 2.5;
  context.beginPath();
  context.moveTo(last.x - 6, last.y - 6);
  context.lineTo(last.x + 6, last.y + 6);
  context.moveTo(last.x + 6, last.y - 6);
  context.lineTo(last.x - 6, last.y + 6);
  context.stroke();
}

function drawRocket(context, f, project) {
  const at = project(f.s.x, f.s.y);
  context.save();
  context.translate(at.x, at.y);
  context.rotate(-f.heading);
  if (f.throttle > 0 && f.propellant > 0) {
    context.fillStyle = '#ffb347';
    context.beginPath();
    context.moveTo(-7, -4);
    context.lineTo(-7 - 10 * f.throttle - Math.random() * 4, 0);
    context.lineTo(-7, 4);
    context.closePath();
    context.fill();
  }
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#1f68c4';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(11, 0);
  context.lineTo(-7, -6);
  context.lineTo(-4, 0);
  context.lineTo(-7, 6);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

export function drawFlight(context, f, camera, width, height) {
  context.fillStyle = '#01040a';
  context.fillRect(0, 0, width, height);
  drawStars(context, width, height);
  const mpp = camera.metersPerPixel;
  const project = makeProjector(f, camera, width, height);
  drawMoonOrbit(context, project, mpp);
  drawBody(context, project, mpp, {
    x: 0, y: 0, radius: EARTH_RADIUS, fill: '#2a6fd6', halo: 'rgba(120, 190, 255, 0.35)', haloWidth: ENTRY_ALTITUDE,
  }, width, height);
  const moon = moonAt(f.s.t);
  drawBody(context, project, mpp, { x: moon.x, y: moon.y, radius: MOON_RADIUS, fill: '#9a9a9a' }, width, height);
  drawPrediction(context, f, project);
  drawRocket(context, f, project);
}
