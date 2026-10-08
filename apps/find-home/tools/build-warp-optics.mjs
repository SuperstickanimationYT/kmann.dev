// Traces null geodesics through an Alcubierre bubble to see what the crew at its centre sees.
// Run: node apps/find-home/tools/build-warp-optics.mjs
// Writes data/warp-optics.bin: int32 speedCount, int32 angleCount, float32 speeds[], float32 angles[],
// then for each speed and each viewing angle from the direction of travel: float32 skyAngle, float32 log10 shift.
// skyAngle is where in the outside sky that pixel looks; shift is observed / emitted frequency. -1 marks no light.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUBBLE_RADIUS = 100;
export const WALL_SHARPNESS = 0.1;
const SPEED_COUNT = 40;
const LOWEST_SPEED = 0.01;
const HIGHEST_SPEED = 3000;
const ANGLE_COUNT = 160;
const SMALLEST_ANGLE = 1e-5;
const ESCAPE_RADIUS = 6 * BUBBLE_RADIUS;
const WALL_STEP = 0.05;
const OPEN_STEP = 1;
const MAX_STEPS = 400000;

const wallNorm = Math.tanh(WALL_SHARPNESS * BUBBLE_RADIUS);
const sech2 = (x) => 1 / Math.cosh(x) ** 2;
const shape = (r) => (Math.tanh(WALL_SHARPNESS * (r + BUBBLE_RADIUS)) - Math.tanh(WALL_SHARPNESS * (r - BUBBLE_RADIUS))) / (2 * wallNorm);
const shapeSlope = (r) => (WALL_SHARPNESS * (sech2(WALL_SHARPNESS * (r + BUBBLE_RADIUS)) - sech2(WALL_SHARPNESS * (r - BUBBLE_RADIUS)))) / (2 * wallNorm);

// Stationary frame xi = x - v t: ds^2 = -dt^2 + (dxi + b dt)^2 + dy^2, b = v (1 - shape(r)).
// The ray stays in the plane through the axis, so two spatial dimensions suffice. p_t = -1 at the observer.
function rates(v, state, out) {
  const [x, y, px, py] = state;
  const r = Math.hypot(x, y);
  const b = v * (1 - shape(r));
  const q = -1 - b * px;
  const slope = r > 0 ? (-v * shapeSlope(r)) / r : 0;
  out[0] = q * b + px;
  out[1] = py;
  out[2] = -q * slope * x * px;
  out[3] = -q * slope * y * px;
}

const k1 = new Float64Array(4);
const k2 = new Float64Array(4);
const k3 = new Float64Array(4);
const k4 = new Float64Array(4);
const probe = new Float64Array(4);

function trace(v, angle) {
  const state = new Float64Array([0, 0, -Math.cos(angle), -Math.sin(angle)]);
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = Math.hypot(state[0], state[1]);
    if (r > ESCAPE_RADIUS) {
      const size = Math.hypot(state[2], state[3]);
      return [Math.atan2(Math.abs(state[3]), -state[2]), Math.log10(1 / size)];
    }
    rates(v, state, k1);
    const speed = Math.hypot(k1[0], k1[1]) || 1;
    const h = -(Math.abs(r - BUBBLE_RADIUS) < 6 / WALL_SHARPNESS ? WALL_STEP : OPEN_STEP) / speed;
    for (let j = 0; j < 4; j++) probe[j] = state[j] + 0.5 * h * k1[j];
    rates(v, probe, k2);
    for (let j = 0; j < 4; j++) probe[j] = state[j] + 0.5 * h * k2[j];
    rates(v, probe, k3);
    for (let j = 0; j < 4; j++) probe[j] = state[j] + h * k3[j];
    rates(v, probe, k4);
    for (let j = 0; j < 4; j++) state[j] += (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  }
  return [-1, -30];
}

export const speedAt = (index) => (index === 0 ? 0 : LOWEST_SPEED * (HIGHEST_SPEED / LOWEST_SPEED) ** ((index - 1) / (SPEED_COUNT - 2)));
export const angleAt = (index) => (index === 0 ? 0 : SMALLEST_ANGLE * (Math.PI / SMALLEST_ANGLE) ** ((index - 1) / (ANGLE_COUNT - 2)));

const speeds = Float32Array.from({ length: SPEED_COUNT }, (_, i) => speedAt(i));
const angles = Float32Array.from({ length: ANGLE_COUNT }, (_, i) => angleAt(i));
const table = new Float32Array(SPEED_COUNT * ANGLE_COUNT * 2);
const started = Date.now();
speeds.forEach((v, s) => {
  angles.forEach((angle, a) => {
    const [skyAngle, logShift] = v === 0 ? [angle, 0] : trace(v, angle);
    table[(s * ANGLE_COUNT + a) * 2] = skyAngle < 0 ? -1 : skyAngle;
    table[(s * ANGLE_COUNT + a) * 2 + 1] = logShift;
  });
});

const header = new Int32Array([SPEED_COUNT, ANGLE_COUNT]);
const bytes = Buffer.concat([header, speeds, angles, table].map((array) => Buffer.from(array.buffer)));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'warp-optics.bin');
writeFileSync(out, bytes);
console.log(`${out}: ${bytes.length} bytes in ${((Date.now() - started) / 1000).toFixed(1)} s`);
