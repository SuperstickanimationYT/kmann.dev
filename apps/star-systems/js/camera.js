export const MIN_SCALE = 1e-3;
export const MAX_SCALE = 5e7;

const FLIGHT_MS = 1400;

export function createCamera() {
  return { x: 0, y: 0, scale: 1, width: 1, height: 1, follow: null, flight: null };
}

export function clampScale(scale) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function toScreen(camera, point) {
  return {
    x: camera.width / 2 + (point.x - camera.x) * camera.scale,
    y: camera.height / 2 - (point.y - camera.y) * camera.scale,
  };
}

export function toWorld(camera, screenX, screenY) {
  return {
    x: camera.x + (screenX - camera.width / 2) / camera.scale,
    y: camera.y - (screenY - camera.height / 2) / camera.scale,
  };
}

export function scaleToFit(camera, radiusAU) {
  return clampScale(Math.min(camera.width, camera.height) / 2 / radiusAU);
}

export function zoomAt(camera, screenX, screenY, factor) {
  const anchor = toWorld(camera, screenX, screenY);
  camera.scale = clampScale(camera.scale * factor);
  if (camera.follow) return;
  camera.x = anchor.x - (screenX - camera.width / 2) / camera.scale;
  camera.y = anchor.y + (screenY - camera.height / 2) / camera.scale;
}

export function panBy(camera, dx, dy) {
  camera.follow = null;
  camera.flight = null;
  camera.x -= dx / camera.scale;
  camera.y += dy / camera.scale;
}

export function flyTo(camera, bodyName, targetScale, now) {
  camera.flight = {
    start: now,
    fromX: camera.x,
    fromY: camera.y,
    fromLog: Math.log(camera.scale),
    toLog: Math.log(clampScale(targetScale)),
    bodyName,
  };
  camera.follow = null;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function updateCamera(camera, placed, now) {
  const flight = camera.flight;
  if (flight) {
    const target = placed.get(flight.bodyName);
    const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
    const u = smoothstep(t);
    const travel = smoothstep(Math.min(1, Math.max(0, (t - 0.2) / 0.6)));
    const distance = Math.hypot(target.x - flight.fromX, target.y - flight.fromY);
    const overviewLog = Math.log(scaleToFit(camera, Math.max(distance * 0.6, 1e-9)));
    const midLog = Math.min(flight.fromLog, flight.toLog, overviewLog);
    camera.scale = Math.exp((1 - u) * (1 - u) * flight.fromLog + 2 * (1 - u) * u * midLog + u * u * flight.toLog);
    camera.x = flight.fromX + (target.x - flight.fromX) * travel;
    camera.y = flight.fromY + (target.y - flight.fromY) * travel;
    if (t >= 1) {
      camera.flight = null;
      camera.follow = flight.bodyName;
    }
    return;
  }
  if (camera.follow) {
    const target = placed.get(camera.follow);
    camera.x = target.x;
    camera.y = target.y;
  }
}
