import { cross, dot, scale, sub, unit } from './vector.js';

const FIELD_OF_VIEW = (45 * Math.PI) / 180;
const NEAR = 1e-3;
const PITCH_LIMIT = Math.PI / 2 - 0.01;

export function createCamera() {
  return { yaw: -Math.PI / 2, pitch: 0.6, distance: 4, target: [0, 0, 0] };
}

export function orbitCamera(camera, deltaYaw, deltaPitch) {
  camera.yaw += deltaYaw;
  camera.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, camera.pitch + deltaPitch));
}

export function zoomCamera(camera, factor, [min, max]) {
  camera.distance = Math.max(min, Math.min(max, camera.distance * factor));
}

export function projector(camera, width, height) {
  const toCamera = [
    Math.cos(camera.pitch) * Math.cos(camera.yaw),
    Math.cos(camera.pitch) * Math.sin(camera.yaw),
    Math.sin(camera.pitch),
  ];
  const eye = sub(camera.target, scale(toCamera, -camera.distance));
  const forward = scale(toCamera, -1);
  const right = unit(cross(forward, [0, 0, 1]));
  const up = cross(right, forward);
  const focal = height / (2 * Math.tan(FIELD_OF_VIEW / 2));

  return (point) => {
    const offset = sub(point, eye);
    const depth = dot(offset, forward);
    if (depth < NEAR) return null;
    return { x: width / 2 + (dot(offset, right) / depth) * focal, y: height / 2 - (dot(offset, up) / depth) * focal, depth };
  };
}
