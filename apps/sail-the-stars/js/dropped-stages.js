import { flown } from './rocket.js';
import { assemble, shapeOf } from './rocket-stages.js';
import { add, normalize, rotateBasis, scale } from './vectors.js';

export const MOST_DROPPED = 6;
export const FARTHEST_DROPPED_KM = 300;
const PUSHED_BACK_KM_S = 0.0015;
const TUMBLE_RADIANS_PER_SECOND = [0.02, 0.1];

function wholeShape(entries) {
  const vehicle = assemble({ parts: entries });
  vehicle.attached = new Set(vehicle.entries.map(({ id }) => id));
  return shapeOf(vehicle);
}

export function dropAway(entries, { state, basis, model }) {
  const spin = Math.random() * 2 * Math.PI;
  const axis = normalize(add(scale(basis.up, Math.cos(spin)), scale(basis.right, Math.sin(spin))));
  const [slowest, fastest] = TUMBLE_RADIANS_PER_SECOND;
  const pushedBack = state.velocityKmS ? { ...state, velocityKmS: add(state.velocityKmS, scale(basis.forward, -PUSHED_BACK_KM_S)) } : state;
  return { model, state: pushedBack, basis: { ...basis }, shape: wholeShape(entries), tumble: { axis, rate: slowest + Math.random() * (fastest - slowest) }, fromSunKm: null };
}

export function stepDropped(stage, { settle, ...flight }) {
  if (stage.state.landedKm) return stage;
  const seconds = (flight.toMs - flight.fromMs) / 1000;
  const basis = rotateBasis(stage.basis, stage.tumble.axis, stage.tumble.rate * seconds);
  const moved = flown(stage.state, { ...flight, pushKmS2: [0, 0, 0], drag: { airOf: flight.airOf, craft: { noseward: basis.forward, ...stage.shape } } });
  return { ...stage, basis, state: moved.landed ? settle(moved.state) : moved.state };
}

