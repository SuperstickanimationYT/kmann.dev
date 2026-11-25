import { KM_PER_PC } from './solar-system.js';
import { speculationShown } from './speculation.js';
import { add, cross, dot, normalize, rotateAbout, scale, subtract } from './vectors.js';

const MS_PER_HOUR = 3600000;
const LEADING_POINT = Math.PI / 3;
const HOLD_KM = 50000;
const NEAREST_KM = 1e-9;
const STEP_SHARE = 0.1;
const MOST_STEPS = 400;

const WORMHOLES = [
  { ends: [{ host: 'Sun', planet: 'Earth' }, { host: 'Proxima Centauri', planet: 'b' }], radiusKm: 0.1, opened: 6043, builders: 'People' },
  { ends: [{ host: 'LHS 1140', planet: 'b' }, { host: 'TOI-700', planet: 'd' }], radiusKm: 0.3, builders: 'The civilization of LHS 1140 b' },
];

export const spokenHost = (host) => (host === 'Sun' ? 'the Sun' : host);
const mouthName = (leadsTo) => `Wormhole to ${spokenHost(leadsTo)}`;

const MOUTHS = WORMHOLES.flatMap(({ ends, ...wormhole }) =>
  ends.map(({ host, planet }, end) => {
    const leadsTo = ends[1 - end].host;
    return { ...wormhole, kind: 'wormhole', name: mouthName(leadsTo), partner: mouthName(host), host, planet, leadsTo, holdKm: HOLD_KM, mapLayer: -1 };
  }));

const isOpen = ({ opened }, ms) => opened === undefined || ms >= Date.UTC(opened, 0, 1);

export const mouthsOpen = (ms) => (speculationShown() ? MOUTHS.filter((mouth) => isOpen(mouth, ms)) : []);

export function placeMouth(mouth, system, ms) {
  const planetKm = system.planetFromStarKm(mouth.planet, ms);
  const laterKm = system.planetFromStarKm(mouth.planet, ms + MS_PER_HOUR);
  const north = normalize(cross(planetKm, laterKm));
  const fromSunKm = rotateAbout(planetKm, north, LEADING_POINT);
  return {
    ...mouth,
    north,
    meridian: normalize(cross(north, [0.3, 0.5, 0.8])),
    fromSunKm,
    centre: add(system.position, scale(fromSunKm, 1 / KM_PER_PC)),
    radius: mouth.radiusKm / KM_PER_PC,
  };
}

export const withWormholes = (system) => ({
  ...system,
  place: (ms) => [...system.place(ms), ...mouthsOpen(ms).filter(({ host }) => host === system.name).map((mouth) => placeMouth(mouth, system, ms))],
});

export const otherEnd = (mouth, system, ms) => placeMouth(MOUTHS.find(({ name }) => name === mouth.partner), system, ms);

const axesOf = ({ north, meridian }) => [meridian, cross(north, meridian), north];

export function throughThroat(from, to) {
  const axes = axesOf(from);
  const [x, y, z] = axesOf(to);
  return (vector) => {
    const [along, aside, up] = axes.map((axis) => dot(axis, vector));
    return add(add(scale(x, along), scale(y, -aside)), scale(z, up));
  };
}

const bendingRates = (depth, heading, radiusKm) => {
  const reach = Math.hypot(depth, radiusKm);
  const aside = Math.sin(heading) / reach;
  return { deeper: Math.cos(heading), turned: aside, veer: (-aside * depth) / reach };
};

function straightPath({ depth, heading, lengthKm }, radiusKm) {
  let place = { depth, heading, turned: 0 };
  for (let [left, count] = [lengthKm, 0]; left > 0 && count < MOST_STEPS; count++) {
    const step = Math.min(left, STEP_SHARE * Math.hypot(place.depth, radiusKm));
    const after = (rates, share) => ({ depth: place.depth + share * step * rates.deeper, heading: place.heading + share * step * rates.veer });
    const ratesAt = (spot) => bendingRates(spot.depth, spot.heading, radiusKm);
    const first = ratesAt(place);
    const second = ratesAt(after(first, 0.5));
    const third = ratesAt(after(second, 0.5));
    const last = ratesAt(after(third, 1));
    const gained = (rate) => (step / 6) * (first[rate] + 2 * second[rate] + 2 * third[rate] + last[rate]);
    place = { depth: place.depth + gained('deeper'), heading: place.heading + gained('veer'), turned: place.turned + gained('turned') };
    left -= step;
  }
  return place;
}

export function travel({ mouth, partner, offsetKm, shiftKm }) {
  const startDepth = Math.hypot(...offsetKm);
  const outward = scale(offsetKm, 1 / startDepth);
  const lengthKm = Math.hypot(...shiftKm);
  const sideways = cross(outward, shiftKm);
  const aside = Math.hypot(...sideways);
  const axis = aside > 0 ? scale(sideways, 1 / aside) : normalize(cross(outward, mouth.north));
  const heading = Math.atan2(aside, dot(outward, shiftKm));
  const end = straightPath({ depth: startDepth, heading, lengthKm }, mouth.radiusKm);
  const reached = rotateAbout(outward, axis, end.turned);
  const turn = (vector) => rotateAbout(vector, axis, end.turned + end.heading - heading);
  const offsetFrom = (direction) => scale(direction, Math.max(NEAREST_KM, Math.abs(end.depth)));
  if (end.depth >= 0) return { mouth, offsetKm: offsetFrom(reached), turn };
  const through = throughThroat(mouth, partner);
  const carried = (vector) => through(subtract(vector, scale(reached, 2 * dot(vector, reached))));
  return { mouth: partner, offsetKm: offsetFrom(through(reached)), turn: (vector) => carried(turn(vector)) };
}
