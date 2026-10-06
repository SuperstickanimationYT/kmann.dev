import { DEGREES } from './milky-way.js';

export const SHIP = {
  thrusterTopSpeed: 10,
  jumpScatter: 0.02,
  energyBudgetShare: 1.5,
  jumpRealSeconds: 2.5,
  jumpClockSeconds: 600,
  headYawLimit: 110 * DEGREES,
  headPitchLimit: 70 * DEGREES,
};

export const WINDOWS = [
  { yaw: [-42, 42], pitch: [-16, 20] },
  { yaw: [55, 110], pitch: [-12, 16] },
  { yaw: [-110, -55], pitch: [-12, 16] },
].map(({ yaw, pitch }) => ({ yaw: yaw.map((value) => value * DEGREES), pitch: pitch.map((value) => value * DEGREES) }));

export const STRUTS = [-15, 15].map((yaw) => ({ yaw: yaw * DEGREES, halfWidth: 0.7 * DEGREES }));

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const combine = (a, b, wa, wb) => a.map((value, i) => value * wa + b[i] * wb);

export function viewBasis(ship, { yaw, pitch }) {
  const turnedForward = combine(ship.forward, ship.right, Math.cos(yaw), Math.sin(yaw));
  const right = combine(ship.right, ship.forward, Math.cos(yaw), -Math.sin(yaw));
  const forward = combine(turnedForward, ship.up, Math.cos(pitch), Math.sin(pitch));
  const up = combine(ship.up, turnedForward, Math.cos(pitch), -Math.sin(pitch));
  return { forward, right, up };
}

export function throughWindow(ship, direction) {
  const yaw = Math.atan2(dot(direction, ship.right), dot(direction, ship.forward));
  const pitch = Math.asin(Math.max(-1, Math.min(1, dot(direction, ship.up))));
  const inside = WINDOWS.some((window) => yaw >= window.yaw[0] && yaw <= window.yaw[1] && pitch >= window.pitch[0] && pitch <= window.pitch[1]);
  return inside && !STRUTS.some((strut) => Math.abs(yaw - strut.yaw) < strut.halfWidth);
}

export function cockpitUniforms(ship) {
  return {
    uShipRight: ship.right,
    uShipUp: ship.up,
    uShipForward: ship.forward,
    windows: Float32Array.from(WINDOWS.flatMap((window) => [...window.yaw, ...window.pitch])),
    struts: Float32Array.from(STRUTS.flatMap((strut) => [strut.yaw, strut.halfWidth])),
  };
}
