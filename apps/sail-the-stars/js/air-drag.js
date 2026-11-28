import { coastedState } from './kepler.js';
import { add, cross, dot, scale, subtract } from './vectors.js';

const MEASURED_AIR = {
  Venus: { kgPerM3: 65, scaleKm: 15.9 },
  Earth: { kgPerM3: 1.217, scaleKm: 8.5 },
  Mars: { kgPerM3: 0.02, scaleKm: 11.1 },
  Titan: { kgPerM3: 5.3, scaleKm: 21 },
  Jupiter: { kgPerM3: 0.16, scaleKm: 27 },
  Saturn: { kgPerM3: 0.19, scaleKm: 59.5 },
  Uranus: { kgPerM3: 0.42, scaleKm: 27.7 },
  Neptune: { kgPerM3: 0.45, scaleKm: 19.7 },
};
const THINNEST_KG_PER_M3 = 1e-9;
const DEEPEST_SCALE_HEIGHTS = 5;

export const ROCKET_KG = 30000;
const ROCKET_RADIUS_M = 1.5;
const END_AREA_M2 = Math.PI * ROCKET_RADIUS_M ** 2;
const SIDE_AREA_M2 = 36;
const DRAG_COEFFICIENT = { noseFirst: 0.5, tailFirst: 1.2, sideways: 1.2 };

const LARGEST_SLOWING_PER_STEP = 0.1;
const LARGEST_CLIMB_PER_STEP_SCALE_HEIGHTS = 0.2;

export function airOf(body) {
  if (body.invented) return body.invented.wet ? MEASURED_AIR.Earth : null;
  return MEASURED_AIR[body.name] ?? null;
}

export function airAround(body, spinRadiansPerSecondOf) {
  const air = airOf(body);
  if (!air) return null;
  return { ...air, radiusKm: body.radiusKm, topKm: air.scaleKm * Math.log(air.kgPerM3 / THINNEST_KG_PER_M3), spin: scale(body.north, spinRadiansPerSecondOf(body)) };
}

export const insideAir = (air, positionKm) => Boolean(air) && Math.hypot(...positionKm) - air.radiusKm < air.topKm;

const densityAt = (air, positionKm) => air.kgPerM3 * Math.exp(Math.min(DEEPEST_SCALE_HEIGHTS, (air.radiusKm - Math.hypot(...positionKm)) / air.scaleKm));

const windAt = (air, positionKm) => cross(air.spin, positionKm);

function dragAreaM2(noseward, heading) {
  const along = dot(noseward, heading);
  const across = Math.sqrt(Math.max(0, 1 - along * along));
  const endCoefficient = along > 0 ? DRAG_COEFFICIENT.noseFirst : DRAG_COEFFICIENT.tailFirst;
  return endCoefficient * END_AREA_M2 * Math.abs(along) + DRAG_COEFFICIENT.sideways * SIDE_AREA_M2 * across;
}

function slowingPerKm(air, state, noseward) {
  const throughAirKmS = subtract(state.velocityKmS, windAt(air, state.positionKm));
  const speedKmS = Math.hypot(...throughAirKmS);
  if (!speedKmS) return { throughAirKmS, speedKmS, perKm: 0 };
  const areaM2 = dragAreaM2(noseward, scale(throughAirKmS, 1 / speedKmS));
  return { throughAirKmS, speedKmS, perKm: (1000 * densityAt(air, state.positionKm) * areaM2) / (2 * ROCKET_KG) };
}

export function dragged(state, air, noseward, seconds) {
  if (!insideAir(air, state.positionKm)) return state;
  const { throughAirKmS, speedKmS, perKm } = slowingPerKm(air, state, noseward);
  const kept = 1 / (1 + perKm * speedKmS * seconds);
  return { ...state, velocityKmS: add(windAt(air, state.positionKm), scale(throughAirKmS, kept)) };
}

export function airStepSeconds(state, air, noseward) {
  const { speedKmS, perKm } = slowingPerKm(air, state, noseward);
  const speed = Math.max(speedKmS, Math.hypot(...state.velocityKmS), 1e-9);
  return Math.min(LARGEST_SLOWING_PER_STEP / Math.max(perKm * speedKmS, 1e-12), (LARGEST_CLIMB_PER_STEP_SCALE_HEIGHTS * air.scaleKm) / speed);
}

function coasted(state, gm, seconds) {
  const { position, velocity } = coastedState({ position: state.positionKm, velocity: state.velocityKmS }, gm, seconds);
  return { ...state, positionKm: position, velocityKmS: velocity };
}

const FALL_MOST_STEPS = 20000;
const FALL_STEP_SECONDS = [0.05, 20];
const FALL_LONGEST_SECONDS = 6 * 3600;
const FALL_PATH_POINTS = 256;

export function fallThroughAir(start, { air, gm, noseward, groundKm }) {
  let state = start;
  let seconds = 0;
  const pointsKm = [start.positionKm];
  let end = 'unfinished';
  for (let step = 0; step < FALL_MOST_STEPS && seconds < FALL_LONGEST_SECONDS; step++) {
    const stepSeconds = Math.min(FALL_STEP_SECONDS[1], Math.max(FALL_STEP_SECONDS[0], airStepSeconds(state, air, noseward)));
    state = dragged(coasted(dragged(state, air, noseward, stepSeconds / 2), gm, stepSeconds), air, noseward, stepSeconds / 2);
    seconds += stepSeconds;
    pointsKm.push(state.positionKm);
    const distanceKm = Math.hypot(...state.positionKm);
    if (distanceKm < groundKm) {
      end = 'ground';
      break;
    }
    if (!insideAir(air, state.positionKm) && dot(state.positionKm, state.velocityKmS) > 0) {
      end = 'out of air';
      break;
    }
  }
  const every = Math.max(1, Math.ceil(pointsKm.length / FALL_PATH_POINTS));
  const kept = pointsKm.filter((_, k) => k % every === 0 || k === pointsKm.length - 1);
  return { state, seconds, end, pointsKm: kept };
}
