import { coastedState, elementsOf } from './kepler.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';

export const ENGINE_KM_PER_S2 = 0.015;
export const FASTEST_BURN_RATE = 5;

const SUN_GM = 1.32712440018e11;
const EARTH_GM = 398600.435436;
const MEASURED_GM_KM3_PER_S2 = {
  Sun: SUN_GM,
  Mercury: 22031.86855,
  Venus: 324858.592,
  Earth: EARTH_GM,
  Moon: 4902.800066,
  Mars: 42828.375214,
  Phobos: 0.0007087,
  Deimos: 0.0000962,
  Jupiter: 126686531.9,
  Io: 5959.916,
  Europa: 3202.739,
  Ganymede: 9887.834,
  Callisto: 7179.289,
  Saturn: 37931206.2,
  Mimas: 2.503,
  Enceladus: 7.211,
  Tethys: 41.21,
  Dione: 73.11,
  Rhea: 153.94,
  Titan: 8978.14,
  Iapetus: 120.51,
  Uranus: 5793951.3,
  Miranda: 4.3,
  Ariel: 83.46,
  Umbriel: 85.09,
  Titania: 226.94,
  Oberon: 205.32,
  Neptune: 6835099.5,
  Triton: 1427.6,
  Ceres: 62.6284,
  Pluto: 869.6,
  Charon: 106.1,
  Eris: 1108,
  Haumea: 267.4,
  Makemake: 207,
  Gonggong: 117,
  Quaoar: 80.4,
  Orcus: 41.2,
};
const G_KM3_PER_KG_S2 = 6.6743e-20;
const KG_PER_KM3 = { giant: 1.3e12, hazy: 1.9e12, rocky: 2.5e12, ocean: 5.5e12, clouded: 5.2e12 };
const PULLING_KINDS = new Set(['star', ...Object.keys(KG_PER_KM3)]);
const SPHERE_OF_INFLUENCE_POWER = 0.4;
const SMALLEST_REACH_RADII = 2;
const SECONDS_PER_DAY = 86400;

const MOST_STEPS_PER_FRAME = 400;
const BURN_STEP_SECONDS = 0.25;
const SHORTEST_COAST_STEP_SECONDS = 1;
const COAST_STEP_SHARE_OF_MARGIN = 0.2;
const GROUND_WATCH_SHARE = 1.2;
const PLACING_STEP_MS = 10000;

function starGm(star, bodies) {
  if (MEASURED_GM_KM3_PER_S2[star.name]) return MEASURED_GM_KM3_PER_S2[star.name];
  if (star.hole) return star.hole.suns * SUN_GM;
  const timed = bodies.find((body) => body.orbit && body.measured?.periodDays);
  if (!timed) return SUN_GM;
  const seconds = timed.measured.periodDays * SECONDS_PER_DAY;
  return (4 * Math.PI ** 2 * timed.orbit.a ** 3) / seconds ** 2;
}

function bodyGm(body) {
  if (MEASURED_GM_KM3_PER_S2[body.name]) return MEASURED_GM_KM3_PER_S2[body.name];
  if (body.measured?.earthMasses) return body.measured.earthMasses * EARTH_GM;
  return G_KM3_PER_KG_S2 * KG_PER_KM3[body.kind] * (4 / 3) * Math.PI * body.radiusKm ** 3;
}

export function gravityWells(bodies) {
  const star = bodies.find(({ kind }) => kind === 'star');
  const wells = new Map([[star.name, { body: star, gm: starGm(star, bodies), parent: null, reachKm: Infinity }]]);
  const pulling = bodies.filter((body) => body !== star && PULLING_KINDS.has(body.kind));
  for (const body of pulling) wells.set(body.name, { body, gm: bodyGm(body), parent: body.parent ?? star.name, reachKm: 0 });
  for (const well of wells.values()) {
    const parent = well.parent && wells.get(well.parent);
    if (!parent) continue;
    const apart = Math.hypot(...subtract(well.body.fromSunKm, parent.body.fromSunKm));
    well.reachKm = Math.max(apart * (well.gm / parent.gm) ** SPHERE_OF_INFLUENCE_POWER, SMALLEST_REACH_RADII * well.body.radiusKm);
  }
  return { star: star.name, wells };
}

const childrenOf = (wells, name) => [...wells.values()].filter(({ parent }) => parent === name);

export function wellAround(wells, star, fromSunKm) {
  let holder = wells.get(star);
  for (;;) {
    const inside = childrenOf(wells, holder.body.name).filter(({ body, reachKm }) => Math.hypot(...subtract(fromSunKm, body.fromSunKm)) < reachKm);
    if (!inside.length) return holder;
    holder = inside.reduce((nearest, well) => (well.reachKm < nearest.reachKm ? well : nearest));
  }
}

const STRAIGHT_ALONG_POLE = 1e-9;

const sidewaysOf = (direction) => normalize(cross(direction, Math.abs(direction[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));

export function circularOrbit(well, offsetKm, pole) {
  const distance = Math.hypot(...offsetKm);
  const inPlane = subtract(offsetKm, scale(pole, dot(offsetKm, pole)));
  const outward = Math.hypot(...inPlane) > STRAIGHT_ALONG_POLE * distance ? normalize(inPlane) : sidewaysOf(pole);
  return { holder: well.body.name, positionKm: scale(outward, distance), velocityKmS: scale(cross(pole, outward), Math.sqrt(well.gm / distance)) };
}

export function orbitalPlanePole(wells, name, placeAt, ms) {
  const well = wells.get(name);
  const orbiter = well.parent ? well : childrenOf(wells, name).reduce((heaviest, child) => (!heaviest || child.gm > heaviest.gm ? child : heaviest), null);
  if (!orbiter) return well.body.north ?? [0, 0, 1];
  const { positionKm, velocityKmS } = relativeMotion(placeAt, ms, orbiter.body.name, orbiter.parent);
  return normalize(cross(positionKm, velocityKmS));
}

function relativeMotion(placeAt, ms, child, parent) {
  const offset = (bodies) => {
    const named = (name) => bodies.find((body) => body.name === name).fromSunKm;
    return subtract(named(child), named(parent));
  };
  const before = offset(placeAt(ms - PLACING_STEP_MS));
  const after = offset(placeAt(ms + PLACING_STEP_MS));
  return { positionKm: scale(add(before, after), 0.5), velocityKmS: scale(subtract(after, before), 1000 / (2 * PLACING_STEP_MS)) };
}

export function relativeMotions(placeAt, ms, wells) {
  const [before, after] = [placeAt(ms - PLACING_STEP_MS), placeAt(ms + PLACING_STEP_MS)].map(placesOf);
  const motions = new Map();
  for (const [name, { parent }] of wells) {
    if (!parent) continue;
    const offsetIn = (places) => subtract(places.get(name), places.get(parent));
    const [from, to] = [offsetIn(before), offsetIn(after)];
    motions.set(name, { positionKm: scale(add(from, to), 0.5), velocityKmS: scale(subtract(to, from), 1000 / (2 * PLACING_STEP_MS)) });
  }
  return motions;
}

function orbitRange(state, gm) {
  const { a, e } = elementsOf({ position: state.positionKm, velocity: state.velocityKmS }, gm);
  const lowest = a * (1 - e);
  return { lowest: Number.isFinite(lowest) ? lowest : 0, highest: e < 1 && a > 0 ? a * (1 + e) : Infinity };
}

function stepSeconds(state, holder, children, range, left) {
  const distance = Math.hypot(...state.positionKm);
  const margins = [];
  if (range.lowest < GROUND_WATCH_SHARE * holder.body.radiusKm) margins.push(distance - holder.body.radiusKm);
  if (range.highest > holder.reachKm) margins.push(holder.reachKm - distance);
  for (const { offsetKm, reachKm } of children) {
    const apart = Math.hypot(...offsetKm);
    if (range.highest > apart - reachKm && range.lowest < apart + reachKm) margins.push(Math.hypot(...subtract(state.positionKm, offsetKm)) - reachKm);
  }
  if (!margins.length) return left;
  const speed = Math.max(Math.hypot(...state.velocityKmS), 1e-9);
  return Math.min(left, Math.max(SHORTEST_COAST_STEP_SECONDS, (COAST_STEP_SHARE_OF_MARGIN * Math.min(...margins)) / speed));
}

function kicked(state, push, seconds) {
  return { ...state, velocityKmS: add(state.velocityKmS, scale(push, seconds)) };
}

function coastFor(state, gm, seconds) {
  const { position, velocity } = coastedState({ position: state.positionKm, velocity: state.velocityKmS }, gm, seconds);
  return { ...state, positionKm: position, velocityKmS: velocity };
}

const placesOf = (bodies) => new Map(bodies.map(({ name, fromSunKm }) => [name, fromSunKm]));

function childrenAcross(wells, holderName, before, now) {
  const offsetIn = (places, name) => subtract(places.get(name), places.get(holderName));
  return childrenOf(wells, holderName).map((child) => ({ ...child, fromKm: offsetIn(before, child.body.name), toKm: offsetIn(now, child.body.name) }));
}

const fallingIn = ({ positionKm, velocityKmS }) => dot(positionKm, velocityKmS) < 0;

export function flown(state, { wells, before, now, fromMs, toMs, pushKmS2, placeAt, groundKm }) {
  const direction = Math.sign(toMs - fromMs);
  const burning = Math.hypot(...pushKmS2) > 0;
  const [placesBefore, placesNow] = [placesOf(before), placesOf(now)];
  const childrenByHolder = new Map();
  let current = state;
  let ms = fromMs;
  for (let step = 0; step < MOST_STEPS_PER_FRAME && (toMs - ms) * direction > 0; step++) {
    const holder = wells.get(current.holder);
    const share = (ms - fromMs) / (toMs - fromMs || 1);
    if (!childrenByHolder.has(current.holder)) childrenByHolder.set(current.holder, childrenAcross(wells, current.holder, placesBefore, placesNow));
    const children = childrenByHolder.get(current.holder).map((child) => ({ ...child, offsetKm: add(scale(child.fromKm, 1 - share), scale(child.toKm, share)) }));
    const leftSeconds = ((toMs - ms) * direction) / 1000;
    const finalStep = step === MOST_STEPS_PER_FRAME - 1;
    const seconds = finalStep ? leftSeconds : burning ? Math.min(leftSeconds, BURN_STEP_SECONDS) : stepSeconds(current, holder, children, orbitRange(current, holder.gm), leftSeconds);
    const push = burning ? scale(pushKmS2, 0.5 * direction) : null;
    current = push ? kicked(coastFor(kicked(current, push, seconds), holder.gm, seconds * direction), push, seconds) : coastFor(current, holder.gm, seconds * direction);
    ms += seconds * 1000 * direction;
    const distance = Math.hypot(...current.positionKm);
    if (distance < GROUND_WATCH_SHARE * holder.body.radiusKm && fallingIn(current) && distance < groundKm(holder.body, current.positionKm)) return { state: current, ms, landed: true };
    if (distance > holder.reachKm) {
      const relative = relativeMotion(placeAt, ms, holder.body.name, holder.parent);
      current = { holder: holder.parent, positionKm: add(current.positionKm, relative.positionKm), velocityKmS: add(current.velocityKmS, relative.velocityKmS) };
      continue;
    }
    const entered = children.find(({ offsetKm, reachKm }) => Math.hypot(...subtract(current.positionKm, offsetKm)) < reachKm);
    if (entered) {
      const relative = relativeMotion(placeAt, ms, entered.body.name, holder.body.name);
      current = { holder: entered.body.name, positionKm: subtract(current.positionKm, relative.positionKm), velocityKmS: subtract(current.velocityKmS, relative.velocityKmS) };
    }
  }
  return { state: current, ms: toMs, landed: false };
}

export const pullKmS2 = (well, distanceKm) => well.gm / distanceKm ** 2;
