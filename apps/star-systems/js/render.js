import { AU_KM } from './systems.js';
import { toScreen } from './camera.js';
import { eccentricAnomalyNearest, pointAtEccentricAnomaly } from './kepler.js';

const MARKER_PX = 2.5;
const HUGE_PX = 1e6;
const ORBIT_SAMPLES = 240;
const LIGHT_SECOND_KM = 299792.458;
const LABEL_SPACING_PX = 26;

export function screenRadius(body, camera) {
  return body.radiusKm / AU_KM * camera.scale;
}

function hostStar(system, body) {
  let current = body;
  while (current.parent) {
    current = system.bodies.find((other) => other.name === current.parent);
    if (current.kind === 'star') return current;
  }
  return null;
}

function drawBackground(context, camera) {
  context.fillStyle = '#03070e';
  context.fillRect(0, 0, camera.width, camera.height);
}

function fillAnnulus(context, center, innerPx, outerPx, style, camera) {
  if (outerPx > HUGE_PX) {
    const fromCenter = Math.hypot(center.x - camera.width / 2, center.y - camera.height / 2);
    if (fromCenter > innerPx && fromCenter < outerPx) {
      context.fillStyle = style;
      context.fillRect(0, 0, camera.width, camera.height);
    }
    return;
  }
  context.fillStyle = style;
  context.beginPath();
  context.arc(center.x, center.y, outerPx, 0, Math.PI * 2);
  if (innerPx > 0) context.arc(center.x, center.y, innerPx, 0, Math.PI * 2, true);
  context.fill('evenodd');
}

function drawStream(context, zone, placed, system, camera) {
  const from = placed.get(zone.from);
  const to = placed.get(zone.to);
  const giant = system.bodies.find((body) => body.name === zone.from);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const ux = dx / length;
  const uy = dy / length;
  const surface = giant.radiusKm / AU_KM;
  const start = toScreen(camera, { x: from.x + ux * surface, y: from.y + uy * surface });
  const bend = { x: from.x + dx * 0.75 - uy * length * 0.12, y: from.y + dy * 0.75 + ux * length * 0.12 };
  const end = toScreen(camera, { x: to.x - uy * 0.2, y: to.y + ux * 0.2 });
  const control = toScreen(camera, bend);
  const width = Math.max(1.5, Math.min(14, 0.02 * camera.scale));
  const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, 'rgba(255, 150, 90, 0.75)');
  gradient.addColorStop(1, 'rgba(255, 220, 170, 0.15)');
  context.strokeStyle = gradient;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.quadraticCurveTo(control.x, control.y, end.x, end.y);
  context.stroke();
}

function drawZones(context, system, placed, camera, layers) {
  for (const zone of system.zones) {
    if (zone.kind === 'stream') {
      drawStream(context, zone, placed, system, camera);
      continue;
    }
    if (zone.kind === 'habitable' && !layers.habitable) continue;
    const center = toScreen(camera, placed.get(zone.around));
    const innerPx = zone.inner * camera.scale;
    const outerPx = zone.outer * camera.scale;
    if (outerPx < 3) continue;
    if (zone.kind === 'habitable') {
      fillAnnulus(context, center, innerPx, outerPx, 'rgba(70, 200, 120, 0.13)', camera);
    } else if (zone.kind === 'belt') {
      fillAnnulus(context, center, innerPx, outerPx, 'rgba(170, 160, 140, 0.09)', camera);
    } else if (zone.kind === 'disk' && outerPx < HUGE_PX) {
      drawDisk(context, zone, center, innerPx, outerPx, camera, layers.labels);
    }
  }
}

const DISK_BANDS = 7;

function drawDisk(context, zone, center, innerPx, outerPx, camera, labelled) {
  const gradient = context.createRadialGradient(center.x, center.y, innerPx, center.x, center.y, outerPx);
  gradient.addColorStop(0, 'rgba(235, 240, 255, 0.9)');
  for (let band = 1; band <= DISK_BANDS; band += 1) {
    const at = band / (DISK_BANDS + 1);
    const heat = 1 - at;
    const red = 255;
    const green = Math.round(120 + 110 * heat);
    const blue = Math.round(60 + 160 * heat * heat);
    const alpha = (band % 2 ? 0.55 : 0.3) * (0.5 + 0.5 * heat);
    gradient.addColorStop(at, `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`);
  }
  gradient.addColorStop(1, 'rgba(255, 120, 60, 0.25)');
  fillAnnulus(context, center, innerPx, outerPx, gradient, camera);
  context.strokeStyle = 'rgba(255, 170, 110, 0.7)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.arc(center.x, center.y, outerPx, 0, Math.PI * 2);
  context.stroke();
  if (!labelled || outerPx < 20) return;
  context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.fillStyle = 'rgba(255, 200, 160, 0.85)';
  context.fillText(zone.label, center.x, center.y + outerPx + 6);
  context.textAlign = 'start';
}

function drawOrbit(context, body, parentPoint, camera, highlighted) {
  const orbit = body.orbit;
  const parentScreen = toScreen(camera, parentPoint);
  const apoapsisPx = orbit.a * (1 + orbit.e) * camera.scale;
  if (apoapsisPx < 4) return;
  const view = Math.hypot(camera.width, camera.height);
  const viewFromParent = { x: camera.x - parentPoint.x, y: camera.y - parentPoint.y };
  const nearest = eccentricAnomalyNearest(orbit, viewFromParent.x, viewFromParent.y);
  const window = Math.min(Math.PI, (3 * view) / Math.max(orbit.a * camera.scale * Math.sqrt(1 - orbit.e * orbit.e), 1));
  context.strokeStyle = highlighted ? 'rgba(95, 227, 255, 0.75)' : 'rgba(110, 160, 220, 0.32)';
  context.lineWidth = highlighted ? 1.6 : 1;
  context.beginPath();
  for (let step = 0; step <= ORBIT_SAMPLES; step += 1) {
    const E = nearest - window + (2 * window * step) / ORBIT_SAMPLES;
    const offset = pointAtEccentricAnomaly(orbit, E);
    const x = parentScreen.x + offset.x * camera.scale;
    const y = parentScreen.y - offset.y * camera.scale;
    if (step === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

function drawRings(context, body, center, camera) {
  const inner = body.rings.innerKm / AU_KM * camera.scale;
  const outer = body.rings.outerKm / AU_KM * camera.scale;
  if (outer < MARKER_PX * 1.5) return;
  fillAnnulus(context, center, inner, outer, 'rgba(226, 207, 152, 0.4)', camera);
}

function drawHalo(context, body, center, radius) {
  const glow = radius * 2.2 + 10;
  const halo = context.createRadialGradient(center.x, center.y, radius * 0.9, center.x, center.y, glow);
  halo.addColorStop(0, hexWithAlpha(body.color, 0.55));
  halo.addColorStop(1, hexWithAlpha(body.color, 0));
  context.fillStyle = halo;
  context.beginPath();
  context.arc(center.x, center.y, glow, 0, Math.PI * 2);
  context.fill();
}

function drawStar(context, body, center, radius) {
  if (body.kind === 'star') drawHalo(context, body, center, radius);
  context.fillStyle = body.color;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawLitSphere(context, body, center, radius, lightFrom) {
  let lx = 0;
  let ly = 0;
  if (lightFrom) {
    const dx = lightFrom.x - center.x;
    const dy = lightFrom.y - center.y;
    const length = Math.hypot(dx, dy) || 1;
    lx = dx / length;
    ly = dy / length;
  }
  const shade = context.createRadialGradient(
    center.x + lx * radius * 0.45, center.y + ly * radius * 0.45, radius * 0.05,
    center.x, center.y, radius * 1.05,
  );
  shade.addColorStop(0, body.color);
  shade.addColorStop(0.55, body.color);
  shade.addColorStop(1, '#05080d');
  context.fillStyle = shade;
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fill();
}

function hexWithAlpha(hex, alpha) {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function onScreen(point, margin, camera) {
  return point.x > -margin && point.y > -margin && point.x < camera.width + margin && point.y < camera.height + margin;
}

function drawBodies(context, system, placed, camera, selectedName) {
  const drawn = [];
  for (const body of system.bodies) {
    const center = toScreen(camera, placed.get(body.name));
    const radius = screenRadius(body, camera);
    if (!onScreen(center, radius * 2.2 + 20, camera)) continue;
    const shownRadius = Math.max(radius, MARKER_PX);
    if (body.rings) drawRings(context, body, center, camera);
    if (body.kind === 'star' || body.kind === 'remnant') {
      drawStar(context, body, center, shownRadius);
    } else {
      const star = hostStar(system, body);
      drawLitSphere(context, body, center, shownRadius, star && toScreen(camera, placed.get(star.name)));
    }
    if (body.name === selectedName) {
      context.strokeStyle = 'rgba(95, 227, 255, 0.9)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.arc(center.x, center.y, shownRadius + 5, 0, Math.PI * 2);
      context.stroke();
    }
    drawn.push({ body, center, radius: shownRadius });
  }
  return drawn;
}

function drawLabels(context, drawn, selectedName) {
  const placedLabels = [];
  const ordered = [...drawn].sort((a, b) => (b.body.name === selectedName) - (a.body.name === selectedName) || b.radius - a.radius);
  context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
  context.textBaseline = 'middle';
  for (const item of ordered) {
    const x = item.center.x + Math.min(item.radius, 60) + 6;
    const y = item.center.y - Math.min(item.radius, 60) * 0.5 - 6;
    const crowded = placedLabels.some((other) => Math.hypot(other.x - x, other.y - y) < LABEL_SPACING_PX);
    if (crowded) continue;
    placedLabels.push({ x, y });
    const label = item.body.candidate ? `${item.body.name}?` : item.body.name;
    context.fillStyle = item.body.name === selectedName ? '#5fe3ff' : 'rgba(205, 225, 245, 0.85)';
    context.fillText(label, x, y);
  }
}

function niceLength(km) {
  const power = 10 ** Math.floor(Math.log10(km));
  const leading = km / power;
  const step = leading >= 5 ? 5 : leading >= 2 ? 2 : 1;
  return step * power;
}

export function formatDistanceKm(km) {
  const au = km / AU_KM;
  if (au >= 0.1) return `${formatNumber(au)} AU`;
  return `${formatNumber(km)} km`;
}

function formatLightTime(km) {
  const seconds = km / LIGHT_SECOND_KM;
  if (seconds < 1) return '';
  if (seconds < 60) return `${formatNumber(seconds)} light-seconds`;
  if (seconds < 3600) return `${formatNumber(seconds / 60)} light-minutes`;
  if (seconds < 86400) return `${formatNumber(seconds / 3600)} light-hours`;
  return `${formatNumber(seconds / 86400)} light-days`;
}

export function formatNumber(value) {
  if (value >= 1000) return Math.round(value).toLocaleString('en-US');
  if (value >= 10) return value.toFixed(0);
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  return value.toPrecision(2);
}

function drawScaleBar(context, camera) {
  const kmPerPx = AU_KM / camera.scale;
  const km = niceLength(kmPerPx * 140);
  const au = km / AU_KM;
  const lengthKm = au >= 0.1 ? niceLength(au) * AU_KM : km;
  const lengthPx = lengthKm / kmPerPx;
  const x = 14;
  const y = camera.height - 18;
  context.strokeStyle = 'rgba(205, 225, 245, 0.8)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(x, y - 5);
  context.lineTo(x, y);
  context.lineTo(x + lengthPx, y);
  context.lineTo(x + lengthPx, y - 5);
  context.stroke();
  context.fillStyle = 'rgba(205, 225, 245, 0.9)';
  context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
  context.textBaseline = 'bottom';
  const light = formatLightTime(lengthKm);
  context.fillText(light ? `${formatDistanceKm(lengthKm)} · ${light}` : formatDistanceKm(lengthKm), x, y - 8);
}

export function render(context, scene) {
  const { system, placed, camera, layers, selectedName } = scene;
  drawBackground(context, camera);
  drawZones(context, system, placed, camera, layers);
  if (layers.orbits) {
    for (const body of system.bodies) {
      if (!body.orbit) continue;
      const parentPoint = body.parent ? placed.get(body.parent) : { x: 0, y: 0 };
      drawOrbit(context, body, parentPoint, camera, body.name === selectedName);
    }
  }
  const drawn = drawBodies(context, system, placed, camera, selectedName);
  if (layers.labels) drawLabels(context, drawn, selectedName);
  drawScaleBar(context, camera);
  return drawn;
}
