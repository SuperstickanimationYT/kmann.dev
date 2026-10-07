import { skyColor, starColor } from './color.js';
import { SUN_FROM_EARTH_DEG } from './physics.js';
import { significant } from './results.js';

const ZONE_MARGIN = 3;
const ZONE_OPTIMISTIC = 'rgba(80, 200, 120, 0.22)';
const ZONE_CONSERVATIVE = 'rgba(80, 200, 120, 0.55)';
const AXIS = 'rgba(111, 157, 201, 0.7)';
const LABEL = '#b9d6f5';
const PLANET = '#5fe3ff';
const FONT = '12px "Trebuchet MS", "Segoe UI", system-ui, sans-serif';

const SKY_VIEW_SPAN_OVER_STAR = 4;
const SKY_VIEW_NARROWEST_DEG = 3;
const GROUND = '#060f1c';
const STAR_HEIGHT_FRACTION = 0.42;

function fitToBox(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: box.width, height: box.height };
}

function niceTicks(from, to) {
  const ticks = [];
  for (let power = Math.floor(Math.log10(from)); power <= Math.ceil(Math.log10(to)); power += 1) {
    for (const step of [1, 2, 5]) {
      const value = step * 10 ** power;
      if (value >= from && value <= to) ticks.push(value);
    }
  }
  return ticks;
}

export function drawZone(canvas, world) {
  const { context, width, height } = fitToBox(canvas);
  const { zone, orbit } = world;
  const from = Math.min(zone.optimisticInner, orbit.nearestAu) / ZONE_MARGIN;
  const to = Math.max(zone.optimisticOuter, orbit.farthestAu) * ZONE_MARGIN;
  const pad = 16;
  const x = (au) => pad + ((Math.log(au) - Math.log(from)) / (Math.log(to) - Math.log(from))) * (width - pad * 2);
  const bandTop = 14;
  const bandBottom = height - 30;
  const middle = (bandTop + bandBottom) / 2;

  context.clearRect(0, 0, width, height);
  context.fillStyle = ZONE_OPTIMISTIC;
  context.fillRect(x(zone.optimisticInner), bandTop, x(zone.optimisticOuter) - x(zone.optimisticInner), bandBottom - bandTop);
  context.fillStyle = ZONE_CONSERVATIVE;
  context.fillRect(x(zone.inner), bandTop, x(zone.outer) - x(zone.inner), bandBottom - bandTop);

  context.strokeStyle = AXIS;
  context.fillStyle = LABEL;
  context.font = FONT;
  context.textAlign = 'center';
  context.beginPath();
  context.moveTo(pad, bandBottom + 0.5);
  context.lineTo(width - pad, bandBottom + 0.5);
  context.stroke();
  const ticks = niceTicks(from, to);
  const labelled = ticks.length > 8 ? ticks.filter((tick) => String(tick).match(/^[0.]*1/)) : ticks;
  for (const tick of ticks) {
    context.beginPath();
    context.moveTo(x(tick), bandBottom);
    context.lineTo(x(tick), bandBottom + 5);
    context.stroke();
    if (labelled.includes(tick)) context.fillText(`${significant(tick)} AU`, x(tick), bandBottom + 19);
  }

  context.strokeStyle = PLANET;
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x(orbit.nearestAu), middle);
  context.lineTo(x(orbit.farthestAu), middle);
  context.stroke();
  context.lineWidth = 1;
  context.fillStyle = PLANET;
  context.beginPath();
  context.arc(x(orbit.distanceAu), middle, 6, 0, Math.PI * 2);
  context.fill();
}

export function drawSky(canvas, world) {
  const { context, width, height } = fitToBox(canvas);
  const { star, sky } = world;
  const spanDeg = Math.max(SKY_VIEW_NARROWEST_DEG, sky.starDiameterDeg * SKY_VIEW_SPAN_OVER_STAR, SUN_FROM_EARTH_DEG * SKY_VIEW_SPAN_OVER_STAR);
  const pixelsPerDeg = width / spanDeg;
  const horizon = height * 0.82;

  const air = context.createLinearGradient(0, 0, 0, horizon);
  air.addColorStop(0, skyColor(star.temperatureK));
  air.addColorStop(1, '#ffffff');
  context.fillStyle = air;
  context.fillRect(0, 0, width, horizon);
  context.globalAlpha = 0.35;
  context.fillStyle = skyColor(star.temperatureK);
  context.fillRect(0, 0, width, horizon);
  context.globalAlpha = 1;
  context.fillStyle = GROUND;
  context.fillRect(0, horizon, width, height - horizon);

  const starX = width * 0.42;
  const starY = height * STAR_HEIGHT_FRACTION;
  const starRadius = Math.max(1.5, (sky.starDiameterDeg * pixelsPerDeg) / 2);
  const glow = context.createRadialGradient(starX, starY, starRadius * 0.8, starX, starY, starRadius * 3);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
  glow.addColorStop(1, 'rgba(255, 255, 255, 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = starColor(star.temperatureK);
  context.beginPath();
  context.arc(starX, starY, starRadius, 0, Math.PI * 2);
  context.fill();

  const sunX = width * 0.76;
  const sunRadius = (SUN_FROM_EARTH_DEG * pixelsPerDeg) / 2;
  context.setLineDash([4, 4]);
  context.strokeStyle = 'rgba(6, 15, 28, 0.75)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(sunX, starY, sunRadius, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.lineWidth = 1;

  context.fillStyle = 'rgba(6, 15, 28, 0.85)';
  context.font = FONT;
  context.textAlign = 'center';
  context.fillText('the Sun from Earth', sunX, starY + sunRadius + 16);
  context.fillStyle = LABEL;
  context.textAlign = 'left';
  context.fillText(`${significant(spanDeg, 2)}° across`, 10, height - 10);
}
