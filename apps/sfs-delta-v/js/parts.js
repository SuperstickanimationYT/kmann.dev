export const STANDARD_GRAVITY = 9.8;

const TANK_TONS_PER_AREA = 2.5;
const TANK_FUEL_SHARE = 0.9;

const ENGINES = {
  'Engine Titan': { label: 'Titan', mass: 12, thrust: 400, isp: 240, width: 3, length: 4.5 },
  'Engine Hawk': { label: 'Hawk', mass: 3.5, thrust: 120, isp: 240, width: 2, length: 3 },
  'Engine Frontier': { label: 'Frontier', mass: 6, thrust: 100, isp: 290, width: 2.5, length: 3.5 },
  'Engine Peregrine': { label: 'Peregrine', mass: 2, thrust: 75, isp: 180, width: 2, length: 2.5 },
  'Engine Valiant': { label: 'Valiant', mass: 2, thrust: 40, isp: 280, width: 1.6, length: 2.5 },
  'Engine Kolibri': { label: 'Kolibri', mass: 0.5, thrust: 15, isp: 260, width: 1, length: 1 },
  'Placeholder ION': { label: 'Ion', mass: 0.5, thrust: 1.5, isp: 1200, width: 1, length: 0.5, drawsFromAllTanks: true },
};

const centred = (width, bottom, top) => ({ x0: -width / 2, x1: width / 2, y0: bottom, y1: top });

const meanTankWidth = (N) => ((N.width_a ?? N.width_original ?? 2) + (N.width_b ?? N.width_original ?? 2)) / 2;

const KINDS = {
  'Fuel Tank': {
    role: 'tank',
    mass: (N) => TANK_TONS_PER_AREA * meanTankWidth(N) * (N.height ?? 2),
    box: (N) => centred(Math.max(N.width_a ?? 2, N.width_b ?? 2), 0, N.height ?? 2),
  },
  Separator: {
    role: 'separator',
    mass: (N) => 0.2 * (N.width ?? 2),
    box: (N) => centred(Math.max(N.width ?? 2, N.width_b ?? 2), 0, (N.height ?? 0.42) + 0.5),
  },
  'Side Separator': {
    role: 'separator',
    mass: () => 0.2,
    box: () => ({ x0: 0, x1: 0.5, y0: 0, y1: 1 }),
  },
  'Docking Port': {
    role: 'dockingPort',
    mass: (N) => ((N.width ?? 2) <= 1 ? 0.25 : 0.3),
    box: (N) => centred(N.width ?? 2, -0.5, 0),
  },
  Fairing: {
    role: 'fairing',
    mass: (N) => 0.03 * meanTankWidth(N) * (N.height ?? 2),
    box: (N) => centred(Math.max(N.width_a ?? 2, N.width_b ?? 2), 0, N.height ?? 2),
  },
  'Fairing Cone': {
    role: 'fairing',
    mass: (N) => 0.018 * (N.width ?? 2) * (N.height ?? 2),
    box: (N) => centred(N.width ?? 2, 0, N.height ?? 2),
  },
  'Fairing Cone Round': {
    role: 'fairing',
    mass: (N) => 0.018 * (N.width ?? 2) * (N.width ?? 2) * 0.5,
    box: (N) => centred(N.width ?? 2, 0, (N.width ?? 2) / 2),
  },
  Capsule: { role: 'control', mass: () => 4, box: () => centred(2, 0, 2) },
  Probe: { role: 'control', mass: () => 3, box: (N) => centred(N.width ?? 2, 0, 1) },
  Parachute: { role: 'structure', mass: () => 0.5, box: () => centred(1, 0, 1) },
  'Heat Shield': {
    role: 'structure',
    mass: (N) => 0.25 * (N.width ?? 2),
    box: (N) => centred(N.width ?? 2, -0.15, 0.1),
  },
  Cone: { role: 'structure', mass: (N) => 0.05 * (N.size ?? 2), box: (N) => centred(N.size ?? 2, 0, N.size ?? 2) },
  'Cone Round': { role: 'structure', mass: (N) => 0.05 * (N.size ?? 2), box: (N) => centred(N.size ?? 2, 0, (N.size ?? 2) / 2) },
  'Cone Side': { role: 'structure', mass: (N) => 0.025 * (N.size ?? 2), box: (N) => centred(N.size ?? 2, 0, N.size ?? 2) },
  RCS: { role: 'structure', mass: () => 0.05, box: () => centred(0.5, 0, 0.5) },
  'Landing Leg Big': { role: 'structure', mass: () => 0.75, box: () => centred(1, 0, 1) },
  'Wheel Medium': { role: 'structure', mass: () => 0.5, box: () => centred(1, 0, 1) },
  Base: {
    role: 'tank',
    mass: (N) => TANK_TONS_PER_AREA * (N.width ?? 3) * (N.height ?? 2.5),
    box: (N) => centred(N.width ?? 3, 0, N.height ?? 2.5),
  },
  Strut: { role: 'structure', mass: () => 0.2, box: (N) => ({ x0: 0, x1: N.size ?? 1, y0: 0, y1: 0.5 }) },
};

const UNKNOWN_BOX = centred(1, 0, 1);

export function describePart(raw) {
  const N = raw.N ?? {};
  const engine = ENGINES[raw.n];
  if (engine) {
    return {
      role: 'engine',
      label: engine.label,
      drawsFromAllTanks: Boolean(engine.drawsFromAllTanks),
      known: true,
      dryMass: engine.mass,
      fuel: 0,
      thrust: engine.thrust,
      isp: engine.isp,
      localBox: centred(engine.width, -engine.length, 0),
    };
  }
  const kind = KINDS[raw.n];
  if (!kind) return { role: 'structure', known: false, dryMass: 0, fuel: 0, localBox: UNKNOWN_BOX };
  if (!kind.mass) return { role: kind.role, known: false, dryMass: 0, fuel: 0, localBox: kind.box(N) };
  const fullMass = kind.mass(N);
  if (kind.role !== 'tank') {
    return { role: kind.role, known: true, dryMass: fullMass, fuel: 0, localBox: kind.box(N) };
  }
  const fuelCapacity = fullMass * TANK_FUEL_SHARE;
  return {
    role: 'tank',
    known: true,
    dryMass: fullMass - fuelCapacity,
    fuel: fuelCapacity * (N.fuel_percent ?? 1),
    localBox: kind.box(N),
  };
}

export const STAGE_ACTION_ROLES = new Set(['engine', 'separator', 'dockingPort', 'fairing']);
