import { cross, dot, normalize, orthonormal, rotateAbout, scale } from './vectors.js';

const STEEPEST_SINE = 0.985;

export function cameraBasis(away, up) {
  const forward = scale(away, -1);
  const upHint = Math.abs(dot(forward, up)) < STEEPEST_SINE ? up : Math.abs(forward[2]) < STEEPEST_SINE ? [0, 0, 1] : [1, 0, 0];
  return orthonormal(forward, upHint);
}

export function swungAround(away, up, across, down) {
  const yawed = rotateAbout(away, up, -across);
  const sideways = cross(up, yawed);
  if (!sideways.some(Boolean)) return yawed;
  const pitched = rotateAbout(yawed, normalize(sideways), -down);
  return Math.abs(dot(pitched, up)) < STEEPEST_SINE ? normalize(pitched) : normalize(yawed);
}
