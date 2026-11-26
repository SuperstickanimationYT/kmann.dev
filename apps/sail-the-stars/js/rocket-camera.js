import { add, cross, dot, normalize, orthonormal, rotateAbout, scale, subtract } from './vectors.js';

const STEEPEST_SINE = 0.985;
const GROUND_DOWN_BELOW_KM = 500;
const DOWN_TURNS_OVER_KM = 200;
const STRAIGHT_UP_OR_DOWN = 1e-6;
const SLANT_ENOUGH = 1e-6;

const smoothStep = (share) => {
  const t = Math.min(1, Math.max(0, share));
  return t * t * (3 - 2 * t);
};

function acrossOutward(outward, { positionKm, velocityKmS }, north) {
  const momentum = cross(positionKm, velocityKmS);
  if (Math.hypot(...momentum) > STRAIGHT_UP_OR_DOWN * Math.hypot(...positionKm) * Math.hypot(...velocityKmS)) return normalize(momentum);
  const flat = subtract(north, scale(outward, dot(north, outward)));
  if (Math.hypot(...flat) > SLANT_ENOUGH) return normalize(flat);
  return normalize(cross(outward, Math.abs(outward[2]) < STEEPEST_SINE ? [0, 0, 1] : [1, 0, 0]));
}

export function cameraPole(outward, state, heightKm, north) {
  const level = smoothStep((heightKm - GROUND_DOWN_BELOW_KM + DOWN_TURNS_OVER_KM / 2) / DOWN_TURNS_OVER_KM);
  if (!level) return outward;
  return normalize(add(scale(outward, 1 - level), scale(acrossOutward(outward, state, north), level)));
}

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
