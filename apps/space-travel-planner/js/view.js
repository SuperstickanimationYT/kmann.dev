import { AU_KM, DAY_SECONDS, PLANETS, SUN_MU, planetElements, planetState } from './ephemeris.js';
import { elementsToState, propagate } from './kepler.js';
import { PLANET_LOOKS } from './planets.js';
import { createCamera, orbitCamera, projector, zoomCamera } from './camera.js';
import { norm, scale } from './vector.js';

const ORBIT_SAMPLES = 240;
const ARC_SAMPLES = 360;
const DROP_LINE_EVERY = 12;
const ZOOM_RANGE = [0.3, 250];
const DRAG_RADIANS_PER_PIXEL = 0.006;
const WHEEL_ZOOM = 0.0015;
const FIT_MARGIN = 2.6;
const RING_RADII_AU = [1, 2, 5, 10, 20, 30, 50];
const SPACECRAFT_LABEL_CLEARANCE = 0.04;
const SMALLEST_VISIBLE_ORBIT = 0.05;
const LABEL_FONT = '12px "Trebuchet MS", system-ui, sans-serif';

const toAu = (vector) => scale(vector, 1 / AU_KM);

export function orbitPath(planet, julianDate) {
  const elements = planetElements(planet, julianDate);
  return Array.from({ length: ORBIT_SAMPLES + 1 }, (_, step) => {
    const trueAnomaly = (2 * Math.PI * step) / ORBIT_SAMPLES;
    return toAu(elementsToState({ ...elements, trueAnomaly }, SUN_MU).r);
  });
}

export function transferPath(transfer) {
  const seconds = (transfer.arriveJd - transfer.departJd) * DAY_SECONDS;
  return Array.from({ length: ARC_SAMPLES + 1 }, (_, step) =>
    toAu(step === 0 ? transfer.departure.r : propagate(transfer.departure.r, transfer.v1, (seconds * step) / ARC_SAMPLES, SUN_MU).r),
  );
}

export function createView(canvas) {
  const context = canvas.getContext('2d');
  const camera = createCamera();
  const pointers = new Map();
  let scene = null;
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

  function polyline(project, points, style, lineWidth, dash = []) {
    context.strokeStyle = style;
    context.lineWidth = lineWidth;
    context.setLineDash(dash);
    context.beginPath();
    let penDown = false;
    for (const point of points) {
      const spot = project(point);
      if (!spot) {
        penDown = false;
        continue;
      }
      if (penDown) context.lineTo(spot.x, spot.y);
      else context.moveTo(spot.x, spot.y);
      penDown = true;
    }
    context.stroke();
    context.setLineDash([]);
  }

  function dropLine(project, point, style) {
    polyline(project, [point, [point[0], point[1], 0]], style, 1);
  }

  function marker(project, point, radius, color, label) {
    const spot = project(point);
    if (!spot) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
    context.fill();
    if (!label) return;
    context.fillStyle = '#e2effd';
    context.font = LABEL_FONT;
    context.fillText(label, spot.x + radius + 4, spot.y - radius - 2);
  }

  function ring(project, point, radius, color) {
    const spot = project(point);
    if (!spot) return;
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(spot.x, spot.y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function drawEcliptic(project) {
    const reach = camera.distance * 1.5;
    const radii = RING_RADII_AU.filter((value) => value < reach);
    for (const radius of radii) {
      const circle = Array.from({ length: 121 }, (_, step) => {
        const angle = (2 * Math.PI * step) / 120;
        return [radius * Math.cos(angle), radius * Math.sin(angle), 0];
      });
      polyline(project, circle, 'rgba(61, 143, 221, 0.13)', 1);
    }
    const equinoxLength = radii.at(-1) ?? 1;
    polyline(project, [[0, 0, 0], [equinoxLength, 0, 0]], 'rgba(95, 227, 255, 0.25)', 1, [4, 4]);
    const tip = project([equinoxLength, 0, 0]);
    if (!tip) return;
    context.fillStyle = 'rgba(95, 227, 255, 0.6)';
    context.font = LABEL_FONT;
    context.fillText('Vernal equinox', tip.x + 4, tip.y + 14);
  }

  function drawSun(project) {
    const spot = project([0, 0, 0]);
    if (!spot) return;
    const glow = context.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, 14);
    glow.addColorStop(0, 'rgba(255, 236, 170, 1)');
    glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(spot.x, spot.y, 14, 0, Math.PI * 2);
    context.fill();
  }

  function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    if (!scene) return;
    const project = projector(camera, width, height);
    drawEcliptic(project);
    drawSun(project);

    const { transfer, path, orbits, fraction } = scene;
    const featured = (planet) => planet === transfer.from || planet === transfer.to;
    const now = transfer.departJd + (transfer.arriveJd - transfer.departJd) * fraction;

    for (const planet of PLANETS) {
      const style = featured(planet) ? `${PLANET_LOOKS[planet].color}99` : 'rgba(111, 157, 201, 0.25)';
      polyline(project, orbits[planet], style, featured(planet) ? 1.4 : 1);
    }

    path.forEach((point, step) => {
      if (step % DROP_LINE_EVERY === 0) dropLine(project, point, 'rgba(95, 227, 255, 0.16)');
    });
    const flown = Math.round(fraction * (path.length - 1));
    polyline(project, path.slice(flown), 'rgba(95, 227, 255, 0.45)', 1.5, [6, 4]);
    polyline(project, path.slice(0, flown + 1), '#5fe3ff', 2.2);

    ring(project, toAu(transfer.departure.r), 9, `${PLANET_LOOKS[transfer.from].color}aa`);
    ring(project, toAu(transfer.arrival.r), 9, `${PLANET_LOOKS[transfer.to].color}aa`);

    for (const planet of PLANETS) {
      const position = toAu(planetState(planet, now).r);
      if (featured(planet)) dropLine(project, position, `${PLANET_LOOKS[planet].color}66`);
      const visible = featured(planet) || norm(position) > camera.distance * SMALLEST_VISIBLE_ORBIT;
      if (visible) marker(project, position, featured(planet) ? 5 : 3.5, PLANET_LOOKS[planet].color, PLANET_LOOKS[planet].name);
    }
    const besidePlanet = fraction < SPACECRAFT_LABEL_CLEARANCE || fraction > 1 - SPACECRAFT_LABEL_CLEARANCE;
    marker(project, path[flown], 4, '#ffffff', besidePlanet ? null : 'Spacecraft');
  }

  function show(transfer) {
    const routeChanged = !scene || scene.transfer.from !== transfer.from || scene.transfer.to !== transfer.to;
    const orbits = routeChanged ? Object.fromEntries(PLANETS.map((planet) => [planet, orbitPath(planet, transfer.departJd)])) : scene.orbits;
    scene = { transfer, path: transferPath(transfer), orbits, fraction: scene?.fraction ?? 0 };
    if (routeChanged) {
      const reach = Math.max(norm(transfer.departure.r), norm(transfer.arrival.r)) / AU_KM;
      const portrait = Math.max(1, height / Math.max(1, width));
      camera.distance = Math.max(ZOOM_RANGE[0], Math.min(ZOOM_RANGE[1], reach * FIT_MARGIN * portrait));
    }
    draw();
  }

  function setFraction(fraction) {
    if (!scene) return;
    scene.fraction = fraction;
    draw();
  }

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });

  canvas.addEventListener('pointermove', (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    if (pointers.size === 1) {
      orbitCamera(camera, -(event.clientX - last.x) * DRAG_RADIANS_PER_PIXEL, (event.clientY - last.y) * DRAG_RADIANS_PER_PIXEL);
    } else if (pointers.size === 2) {
      const other = [...pointers].find(([id]) => id !== event.pointerId)[1];
      const before = Math.hypot(last.x - other.x, last.y - other.y);
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
      if (before > 0 && after > 0) zoomCamera(camera, before / after, ZOOM_RANGE);
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    draw();
  });

  const release = (event) => pointers.delete(event.pointerId);
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomCamera(camera, Math.exp(event.deltaY * WHEEL_ZOOM), ZOOM_RANGE);
      draw();
    },
    { passive: false },
  );

  new ResizeObserver(resize).observe(canvas);
  return { show, setFraction };
}
