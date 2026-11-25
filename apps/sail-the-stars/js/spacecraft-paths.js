import { coasted, orbitPoint } from './kepler.js';
import { equatorialToFrame } from './milky-way.js';
import { add, scale, subtract } from './vectors.js';

export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const MINUTE_MS = 60000;
export const GRAVITY = { Sun: 132712440018, Mercury: 22032, Venus: 324859, Earth: 398600.4, Moon: 4902.8, Mars: 42828.4, Jupiter: 126686534, Saturn: 37931187, Uranus: 5793939, Neptune: 6836529, Pluto: 975.5, Ceres: 62.63 };

const DAY_MS = 86400000;
const ROW_BYTES = 28;
const ROW_FLOATS = 6;
const HANDOVER_MS = DAY_MS;
const FULL_TURN = 2 * Math.PI;

export function betweenStates(a, b, mu, ms) {
  const share = (ms - a.ms) / (b.ms - a.ms);
  const weight = share ** 3 * (10 - 15 * share + 6 * share * share);
  return add(scale(coasted(a, mu, (ms - a.ms) / 1000), 1 - weight), scale(coasted(b, mu, (ms - b.ms) / 1000), weight));
}

const turnsFrom = (from, to) => to - from - FULL_TURN * Math.round((to - from) / FULL_TURN);

function betweenOrbits(a, b, mu, ms) {
  const share = (ms - a.ms) / (b.ms - a.ms);
  const mixed = (key) => a[key] + (b[key] - a[key]) * share;
  const turned = (key) => a[key] + turnsFrom(a[key], b[key]) * share;
  const seconds = (b.ms - a.ms) / 1000;
  const expected = a.meanAnomaly + Math.sqrt(mu / ((a.a + b.a) / 2) ** 3) * seconds;
  const gained = expected - a.meanAnomaly + turnsFrom(expected, b.meanAnomaly);
  return orbitPoint({ a: mixed('a'), e: mixed('e'), inclination: mixed('inclination'), node: turned('node'), periapsisArgument: turned('periapsisArgument'), meanAnomaly: a.meanAnomaly + gained * share });
}

const KINDS = {
  states: { between: betweenStates, rowOf: ([x, y, z, vx, vy, vz]) => ({ position: [x, y, z], velocity: [vx, vy, vz] }) },
  orbits: { between: betweenOrbits, rowOf: ([a, e, inclination, node, periapsisArgument, meanAnomaly]) => ({ a, e, inclination, node, periapsisArgument, meanAnomaly }) },
};

function rowsBefore(rows, ms) {
  let low = 0;
  let high = rows.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (rows[middle].ms <= ms) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function offsetInStretch({ centre, kind, rows }, ms) {
  const mu = GRAVITY[centre];
  const last = rows.at(-1);
  if (kind === 'states' && ms >= last.ms) return coasted(last, mu, (ms - last.ms) / 1000);
  if (kind === 'states' && ms <= rows[0].ms) return coasted(rows[0], mu, (ms - rows[0].ms) / 1000);
  const index = rowsBefore(rows, ms);
  return KINDS[kind].between(rows[index], rows[index + 1], mu, ms);
}

const within = ({ first, last }, ms) => ms >= first && ms <= last;
const missMs = ({ first, last }, ms) => Math.max(first - ms, ms - last, 0);
const eased = (share) => share * share * (3 - 2 * share);

function shareOf(stretch, cruise, ms) {
  if (!cruise) return 1;
  const rampMs = Math.min(HANDOVER_MS, (stretch.last - stretch.first) / 4);
  const arriving = cruise.first < stretch.first ? (ms - stretch.first) / rampMs : 1;
  const leaving = cruise.last > stretch.last ? (stretch.last - ms) / rampMs : 1;
  return eased(Math.max(0, Math.min(1, arriving, leaving)));
}

export function stretchesAt({ stretches }, ms) {
  const cruise = stretches.find(({ centre }) => centre === 'Sun');
  const cruising = cruise && within(cruise, ms);
  const held = stretches.filter((stretch) => stretch !== cruise && within(stretch, ms)).map((stretch) => ({ stretch, share: shareOf(stretch, cruise, ms) }));
  if (cruising || held.length) return [...(cruising ? [{ stretch: cruise, share: 1 }] : []), ...held];
  const nearest = stretches.reduce((best, stretch) => (missMs(stretch, ms) < missMs(best, ms) ? stretch : best));
  return [{ stretch: nearest, share: 1 }];
}

export function placeOnPath(path, ms, centreOf) {
  let place = null;
  let around = null;
  for (const { stretch, share } of stretchesAt(path, ms)) {
    const here = add(centreOf(stretch.centre), equatorialToFrame(offsetInStretch(stretch, ms)));
    place = place ? add(place, scale(subtract(here, place), share)) : here;
    if (!around || share > 0.5) around = stretch;
  }
  return { fromSunKm: place, stretch: around };
}

export async function loadSpacecraftPaths(folder) {
  const [listed, buffer] = await Promise.all([
    fetch(new URL('spacecraft-paths.json', folder)).then((response) => response.json()),
    fetch(new URL('spacecraft-paths.bin', folder)).then((response) => response.arrayBuffer()),
  ]);
  return unpackPaths(listed, buffer);
}

export function unpackPaths(listed, buffer) {
  const view = new DataView(buffer);
  let at = 0;
  const nextRow = (kind) => {
    const ms = J2000_MS + view.getInt32(at, true) * MINUTE_MS;
    const values = Array.from({ length: ROW_FLOATS }, (_, k) => view.getFloat32(at + 4 * (k + 1), true));
    at += ROW_BYTES;
    return { ms, ...KINDS[kind].rowOf(values) };
  };
  return new Map(Object.entries(listed).map(([name, { from, to, stretches }]) => [
    name,
    {
      from,
      to,
      stretches: stretches.map(([centre, kind, count]) => {
        const rows = Array.from({ length: count }, () => nextRow(kind));
        return { centre, kind, rows, first: rows[0].ms, last: rows.at(-1).ms };
      }),
    },
  ]));
}
