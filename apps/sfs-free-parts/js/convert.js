import { ENGINES } from '../../sfs-delta-v/js/parts.js';

export const FREE_PARTS = new Set([
  'Base Small',
  'Capsule',
  'Cone',
  'Cone Side',
  'Docking Port',
  'Engine Hawk',
  'Engine Kolibri',
  'Engine Valiant',
  'Fairing',
  'Fairing Cone',
  'Fairing Cone Round',
  'Fuel Tank',
  'Heat Shield',
  'Landing Leg',
  'Parachute',
  'Probe',
  'RCS',
  'Separator',
  'Side Fuselage',
  'Side Separator',
  'Solar Array 2',
  'Strut',
  'Strut 2',
  'Wheel Medium',
]);

const FREE_ENGINES = [...FREE_PARTS].filter((name) => ENGINES[name]);
const SMALLEST_SHRINK = 0.02;

const copyOf = (raw) => structuredClone(raw);

function withShape(raw, name, changes) {
  const part = copyOf(raw);
  part.n = name;
  Object.assign(part, changes);
  return part;
}

const PART_SWAPS = {
  Base: {
    to: 'Fuel Tank',
    swap: (raw) => {
      const width = raw.N?.width ?? 3;
      return [withShape(raw, 'Fuel Tank', {
        N: { width_original: width, width_a: width, width_b: width, height: raw.N?.height ?? 2.5, fuel_percent: raw.N?.fuel_percent ?? 1 },
      })];
    },
  },
  'Cone Round': {
    to: 'Cone squashed to half height',
    swap: (raw) => [withShape(raw, 'Cone', { o: { ...(raw.o ?? { x: 1, z: 0 }), y: (raw.o?.y ?? 1) * 0.5 } })],
  },
  'Landing Leg Big': {
    to: 'Landing Leg',
    swap: (raw) => [withShape(raw, 'Landing Leg', {})],
  },
};

function stackOptions(thrustNeeded, free) {
  const ratio = thrustNeeded / free.thrust;
  const whole = Math.floor(ratio + SMALLEST_SHRINK);
  const rest = ratio - whole;
  if (rest <= SMALLEST_SHRINK) return [Array(Math.max(whole, 1)).fill(1)];
  const shrinkExtra = [...Array(whole).fill(1), rest];
  if (whole === 0) return [shrinkExtra];
  const stretchLast = [...Array(whole - 1).fill(1), 1 + rest];
  return [shrinkExtra, stretchLast];
}

const massMismatch = (paid, free, stretches) => Math.abs(stretches.length * free.mass - paid.mass) / paid.mass;

function bestStack(paid, thrustNeeded, free) {
  return stackOptions(thrustNeeded, free).reduce((best, option) =>
    massMismatch(paid, free, option) < massMismatch(paid, free, best) ? option : best);
}

function closestFreeEngine(paid, thrustNeeded) {
  const mismatch = (name) => {
    const free = ENGINES[name];
    return Math.abs(free.isp - paid.isp) / paid.isp + massMismatch(paid, free, bestStack(paid, thrustNeeded, free));
  };
  return FREE_ENGINES.reduce((best, name) => (mismatch(name) < mismatch(best) ? name : best));
}

function engineStandIns(raw) {
  const paid = ENGINES[raw.n];
  const stretch = raw.o?.y ?? 1;
  const thrustNeeded = paid.thrust * Math.abs(stretch);
  const name = closestFreeEngine(paid, thrustNeeded);
  const stretches = bestStack(paid, thrustNeeded, ENGINES[name]);
  const parts = stretches.map((s) => withShape(raw, name, { o: { ...(raw.o ?? { x: 1, z: 0 }), y: Math.sign(stretch) * s } }));
  return { name, stretches, parts };
}

function engineLabel(name, stretches) {
  const label = ENGINES[name].label;
  const whole = stretches.filter((s) => s === 1).length;
  const resized = stretches.filter((s) => s !== 1).map((s) => `a ${label} at ${Math.round(s * 100)}% height`);
  const full = whole === 0 ? [] : [whole === 1 ? `1 ${label}` : `${whole} ${label}s`];
  return [...full, ...resized].join(' + ');
}

function standInsFor(raw) {
  if (ENGINES[raw.n]) {
    const { name, stretches, parts } = engineStandIns(raw);
    return { parts, to: engineLabel(name, stretches) };
  }
  const swap = PART_SWAPS[raw.n];
  if (swap) return { parts: swap.swap(raw), to: swap.to };
  return { parts: [], to: null };
}

export function convertBlueprint(json) {
  const parts = [];
  const newIndexes = [];
  const changes = new Map();
  const paidIndexes = new Set();
  const standInIndexes = new Set();

  json.parts.forEach((raw, index) => {
    if (FREE_PARTS.has(raw.n)) {
      newIndexes.push([parts.length]);
      parts.push(copyOf(raw));
      return;
    }
    paidIndexes.add(index);
    const { parts: standIns, to } = standInsFor(raw);
    const key = `${raw.n}\u0000${to}`;
    const change = changes.get(key) ?? { from: raw.n, to, count: 0 };
    change.count++;
    changes.set(key, change);
    newIndexes.push(standIns.map((_, n) => parts.length + n));
    for (const part of standIns) {
      standInIndexes.add(parts.length);
      parts.push(part);
    }
  });

  const stages = (json.stages ?? [])
    .map((stage) => ({ ...stage, partIndexes: (stage.partIndexes ?? []).flatMap((i) => newIndexes[i] ?? []) }))
    .filter((stage) => stage.partIndexes.length > 0);

  return {
    blueprint: { ...copyOf(json), parts, stages },
    changes: [...changes.values()],
    paidIndexes,
    standInIndexes,
  };
}
