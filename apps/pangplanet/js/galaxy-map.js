import { GALAXY, SECTOR_SIZE } from './universe.js';

const VIEW_RADIUS = { nearby: 5.5e7, galaxy: GALAXY.radius * 1.08 };
const SYSTEM_MARGIN = 1.15;
const ZOOM_STEP = 1.5;
const ZOOM_LIMITS = { min: 0.25, max: 40 };
const STAR_DOT_PX = 3;
const SYSTEM_STAR_MIN_PX = 6;
const PLANET_MIN_PX = 3;
const PICK_REACH_PX = 14;
const LABELS_ABOVE_PX_PER_SECTOR = 18;
const BOUNTY_GOLD = '#ffc933';
const CRYSTAL_CYAN = '#7df3ff';

const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const systemRadius = ({ star, planets }) => Math.max(star.radius, ...planets.map((planet) => distanceBetween(star, planet))) * SYSTEM_MARGIN;

export function createGalaxyMap(canvas) {
  const context = canvas.getContext('2d');
  const view = { mode: 'nearby', zoom: 1, size: 0, scale: 1, centerX: 0, centerY: 0 };
  let system = null;
  let selected = null;
  let selectedPlanet = null;

  function fit() {
    const ratio = window.devicePixelRatio || 1;
    view.size = canvas.clientWidth;
    canvas.width = Math.round(view.size * ratio);
    canvas.height = Math.round(view.size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function frameOn(focus, radius) {
    view.centerX = focus.x;
    view.centerY = focus.y;
    view.scale = view.size / 2 / (radius / view.zoom);
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

  function disk(x, y, radiusPx, fill) {
    const [mx, my] = toMap(x, y);
    context.fillStyle = fill;
    context.beginPath();
    context.arc(mx, my, radiusPx, 0, Math.PI * 2);
    context.fill();
  }

  function label(text, x, y, offsetPx) {
    const [mx, my] = toMap(x, y);
    context.font = '11px "Trebuchet MS", "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.fillStyle = 'rgba(200, 220, 245, 0.85)';
    context.fillText(text, mx, my + offsetPx);
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
      if (entry.crystals) ring(entry.x, entry.y, (STAR_DOT_PX + 2) / view.scale, CRYSTAL_CYAN, false);
      if (entry === selected) ring(entry.x, entry.y, (STAR_DOT_PX + 5) / view.scale, BOUNTY_GOLD, false);
      if (showLabels || entry === selected) label(entry.name, entry.x, entry.y, 15);
    }
  }

  function drawSystem(bountyWaiting) {
    const { star, planets } = system;
    for (const planet of planets) ring(star.x, star.y, distanceBetween(star, planet), 'rgba(140, 170, 255, 0.18)', false);
    const starPx = Math.max(star.radius * view.scale, SYSTEM_STAR_MIN_PX);
    disk(star.x, star.y, starPx, star.palette?.fill ?? '#fff7dc');
    label(star.name, star.x, star.y, starPx + 13);
    for (const planet of planets) {
      const planetPx = Math.max(planet.radius * view.scale, PLANET_MIN_PX);
      disk(planet.x, planet.y, planetPx, planet.palette?.fill ?? '#9c9489');
      if (bountyWaiting(planet)) ring(planet.x, planet.y, (planetPx + 3) / view.scale, BOUNTY_GOLD, true);
      if (planet.resource === 'crystals') ring(planet.x, planet.y, (planetPx + 9) / view.scale, CRYSTAL_CYAN, false);
      if (planet === selectedPlanet) ring(planet.x, planet.y, (planetPx + 6) / view.scale, BOUNTY_GOLD, false);
      label(planet.name, planet.x, planet.y, planetPx + 13);
    }
  }

  function drawRoute(segments, drones) {
    context.save();
    context.strokeStyle = 'rgba(255, 150, 90, 0.8)';
    context.lineWidth = 1.5;
    context.setLineDash([4, 3]);
    for (const points of segments) {
      if (points.length < 4) continue;
      context.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const [mx, my] = toMap(points[i], points[i + 1]);
        if (i === 0) context.moveTo(mx, my);
        else context.lineTo(mx, my);
      }
      context.stroke();
    }
    context.restore();
    context.fillStyle = '#ff965a';
    for (const drone of drones) {
      const [mx, my] = toMap(drone.x, drone.y);
      context.fillRect(mx - 2.5, my - 2.5, 5, 5);
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

  function draw({ chart, rocket, warpRange, telescopeRange, bountyWaiting, routePath, drones }) {
    if (canvas.clientWidth !== view.size) fit();
    context.fillStyle = '#02060d';
    context.fillRect(0, 0, view.size, view.size);
    if (view.mode === 'system') {
      frameOn(system.star, systemRadius(system));
      drawSystem(bountyWaiting);
    } else {
      frameOn(view.mode === 'nearby' ? rocket : GALAXY, VIEW_RADIUS[view.mode]);
      drawGalaxy();
      if (warpRange) ring(rocket.x, rocket.y, warpRange, 'rgba(160, 120, 255, 0.7)', false);
      if (telescopeRange) ring(rocket.x, rocket.y, telescopeRange, 'rgba(63, 224, 208, 0.6)', true);
      drawStars(chart);
    }
    drawRoute(routePath, drones);
    drawRocket(rocket);
  }

  function nearestOnMap(candidates, clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    const x = clientX - box.left;
    const y = clientY - box.top;
    let nearest = null;
    let nearestDistance = PICK_REACH_PX;
    for (const candidate of candidates) {
      const [mx, my] = toMap(candidate.x, candidate.y);
      const distance = Math.hypot(mx - x, my - y);
      if (distance < nearestDistance) {
        nearest = candidate;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function pick(chart, clientX, clientY) {
    if (view.mode === 'system') {
      selectedPlanet = nearestOnMap(system.planets, clientX, clientY);
      return selectedPlanet;
    }
    selected = nearestOnMap(chart.values(), clientX, clientY);
    return selected;
  }

  function showView(mode) {
    view.mode = mode;
    view.zoom = 1;
    selectedPlanet = null;
  }

  function showSystem(closeUp) {
    system = closeUp;
    showView('system');
  }

  const showingSystem = () => view.mode === 'system';

  function zoom(direction) {
    const factor = direction === 'in' ? ZOOM_STEP : 1 / ZOOM_STEP;
    view.zoom = Math.min(ZOOM_LIMITS.max, Math.max(ZOOM_LIMITS.min, view.zoom * factor));
  }

  return { draw, pick, showView, showSystem, showingSystem, zoom };
}
