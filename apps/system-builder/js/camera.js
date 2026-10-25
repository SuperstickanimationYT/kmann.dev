const MIN_SCALE = 1e-16;
const MAX_SCALE = 1e-2;

export function createCamera() {
  return { x: 0, y: 0, scale: 1e-9, width: 1, height: 1, follow: null };
}

const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

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

export function fit(camera, centre, radius) {
  camera.x = centre.x;
  camera.y = centre.y;
  camera.scale = clampScale((Math.min(camera.width, camera.height) * 0.45) / radius);
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
  camera.x -= dx / camera.scale;
  camera.y += dy / camera.scale;
}

export function followTarget(camera, placed) {
  const target = camera.follow && placed.get(camera.follow);
  if (!target) return;
  camera.x = target.x;
  camera.y = target.y;
}
