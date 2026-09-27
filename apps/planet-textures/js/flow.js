import { createNoise } from './random.js';
import { mix, smoothstep, surfacePoint } from './sphere.js';

const STREAM = 0x3c0f;
const PIXELS_PER_CELL = 4;
const MOST_NODES = 257;
const STEPS = 6;
const STEP_TIME = 1 / STEPS;
const TURBULENCE_SCALE = 3;
const TURBULENCE_STRENGTH = 0.03;
const JET_SPEED = 0.2;
const VORTEX_SPIN = 0.06;
const VORTEX_REACH = 0.8;
const NUDGE = 1e-3;
const BICUBIC_REACH_IN_NODES = 3;

export const polarChaos = (poleward) => smoothstep(0.7, 0.92, poleward);

function createVelocity(planet, storms) {
  const turbulence = createNoise(planet.seed ^ STREAM, 2);
  const vortices = storms.map((storm, index) => ({
    center: surfacePoint(Math.sin(storm.lat), storm.lon),
    radius: storm.width * VORTEX_REACH,
    spin: VORTEX_SPIN * (index % 2 ? -1 : 1),
  }));

  const polewardOf = (z) => Math.asin(Math.min(1, Math.max(-1, z))) / (Math.PI / 2);
  const bandPhase = (poleward) => poleward * planet.bands * Math.PI * 2;

  const streamAt = (x, y, z) => {
    const poleward = polewardOf(z);
    const shear = mix(Math.abs(Math.cos(bandPhase(poleward))), 1, polarChaos(poleward));
    let stream = TURBULENCE_STRENGTH * (turbulence(x * TURBULENCE_SCALE, y * TURBULENCE_SCALE, z * TURBULENCE_SCALE) - 0.5) * shear;
    for (const vortex of vortices) {
      const along = x * vortex.center.x + y * vortex.center.y + z * vortex.center.z;
      const distanceSquared = 2 * (1 - along);
      stream += vortex.spin * Math.exp(-distanceSquared / vortex.radius ** 2);
    }
    return stream;
  };

  return (q, out) => {
    const here = streamAt(q.x, q.y, q.z);
    const gradX = (streamAt(q.x + NUDGE, q.y, q.z) - here) / NUDGE;
    const gradY = (streamAt(q.x, q.y + NUDGE, q.z) - here) / NUDGE;
    const gradZ = (streamAt(q.x, q.y, q.z + NUDGE) - here) / NUDGE;
    const poleward = polewardOf(q.z);
    const ring = Math.hypot(q.x, q.y) || 1;
    const jet = (JET_SPEED * Math.sin(bandPhase(poleward)) * (1 - polarChaos(poleward))) / ring;
    out.x = q.y * gradZ - q.z * gradY - q.y * jet;
    out.y = q.z * gradX - q.x * gradZ + q.x * jet;
    out.z = q.x * gradY - q.y * gradX;
    return out;
  };
}

function traceBack(x, y, z, velocityAt, q, velocity) {
  q.x = x;
  q.y = y;
  q.z = z;
  for (let step = 0; step < STEPS; step++) {
    velocityAt(q, velocity);
    q.x -= velocity.x * STEP_TIME;
    q.y -= velocity.y * STEP_TIME;
    q.z -= velocity.z * STEP_TIME;
    const length = Math.hypot(q.x, q.y, q.z);
    q.x /= length;
    q.y /= length;
    q.z /= length;
  }
  return q;
}

function catmullRomWeights(t, weights) {
  const t2 = t * t;
  const t3 = t2 * t;
  weights[0] = 0.5 * (-t3 + 2 * t2 - t);
  weights[1] = 0.5 * (3 * t3 - 5 * t2 + 2);
  weights[2] = 0.5 * (-3 * t3 + 4 * t2 + t);
  weights[3] = 0.5 * (t3 - t2);
  return weights;
}

export function createFlowField(planet, storms, size) {
  const velocityAt = createVelocity(planet, storms);
  const nodes = Math.min(MOST_NODES, Math.ceil(size / PIXELS_PER_CELL) + 1);
  const span = nodes - 1;
  const drift = new Float32Array(nodes * nodes * 3);
  const q = { x: 0, y: 0, z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  const sampledReach = 1 + (BICUBIC_REACH_IN_NODES * 2) / span;

  for (let row = 0; row < nodes; row++) {
    for (let column = 0; column < nodes; column++) {
      const east = (column / span) * 2 - 1;
      const north = 1 - (row / span) * 2;
      const reach = Math.hypot(east, north);
      if (reach > sampledReach) continue;
      const fromPole = reach * (Math.PI / 2);
      const outward = reach ? Math.sin(fromPole) / reach : 0;
      const x = east * outward;
      const y = north * outward;
      const z = Math.cos(fromPole);
      traceBack(x, y, z, velocityAt, q, velocity);
      const offset = (row * nodes + column) * 3;
      drift[offset] = q.x - x;
      drift[offset + 1] = q.y - y;
      drift[offset + 2] = q.z - z;
    }
  }

  const clampNode = (index) => Math.min(span, Math.max(0, index));
  const acrossWeights = [0, 0, 0, 0];
  const downWeights = [0, 0, 0, 0];

  return (p, out) => {
    const reach = 1 - p.lat / (Math.PI / 2);
    const inward = p.flat ? reach / p.flat : 0;
    const gridX = Math.min(span - 1e-6, Math.max(0, ((p.x * inward + 1) / 2) * span));
    const gridY = Math.min(span - 1e-6, Math.max(0, ((1 - p.y * inward) / 2) * span));
    const column = Math.floor(gridX);
    const row = Math.floor(gridY);
    catmullRomWeights(gridX - column, acrossWeights);
    catmullRomWeights(gridY - row, downWeights);
    let x = p.x;
    let y = p.y;
    let z = p.z;
    for (let j = 0; j < 4; j++) {
      const base = clampNode(row - 1 + j) * nodes;
      for (let i = 0; i < 4; i++) {
        const weight = downWeights[j] * acrossWeights[i];
        const offset = (base + clampNode(column - 1 + i)) * 3;
        x += drift[offset] * weight;
        y += drift[offset + 1] * weight;
        z += drift[offset + 2] * weight;
      }
    }
    const length = Math.hypot(x, y, z) || 1;
    out[0] = x / length;
    out[1] = y / length;
    out[2] = z / length;
    return out;
  };
}
