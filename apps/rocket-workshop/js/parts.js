import { CPU_CLOCKS, emptyDesign } from './design.js';

export const STACK_KINDS = ['capsule', 'computer', 'tank', 'engine', 'separator'];
export const SIDE_KINDS = ['fins', 'legs'];

export const PART_NAMES = {
  capsule: 'Capsule',
  computer: 'Computer',
  tank: 'Fuel tank',
  engine: 'Engine',
  separator: 'Separator',
  fins: 'Fins',
  legs: 'Landing legs',
};

export const PART_DEFAULTS = {
  capsule: { width: 2, torque: 10 },
  computer: { width: 2 },
  tank: { width: 2, height: 4, fins: false, legs: false },
  engine: { width: 2, thrust: 60, gimbal: 5, limit: 1, startsOn: true },
  separator: { width: 2, stageWhen: 'fuel', fuelTank: null, stageHeight: 10000, lightsAbove: true },
};

export const PART_LIMITS = {
  width: { min: 0.5, max: 5, step: 0.5 },
  height: { min: 1, max: 20, step: 0.5 },
  thrust: { min: 5, max: 500, step: 5 },
  gimbal: { min: 0, max: 20, step: 1 },
  limit: { min: 0, max: 1, step: 0.05 },
  torque: { min: 1, max: 100, step: 1 },
  stageHeight: { min: 100, max: 100000, step: 100 },
};

export const STAGE_WHEN = ['fuel', 'height', 'hand'];

const TANK_FUEL_KG_PER_SQUARE_METER = 250;
const TANK_DRY_SHARE = 0.1;
const NOZZLE_BELOW_TOP = 0.35;
const LEG_FOOT_BELOW = 0.3;
const SPOKE_WIDTH = 0.05;
const EDGE_WIDTH = 0.25;
const FIN_EDGE_WIDTH = 0.4;
const SAME_POINT = 1e-4;

const STACK_SHAPES = {
  capsule: (part) => ({ height: 1.8, bottom: part.width, top: part.width * 0.3, center: 0.7, kg: 800 }),
  computer: (part) => ({ height: 0.5, bottom: part.width, top: part.width, center: 0.25, kg: 50 }),
  tank: (part) => ({ height: part.height, bottom: part.width, top: part.width, center: part.height / 2, kg: tankFuel(part) * TANK_DRY_SHARE }),
  engine: (part) => ({ height: 1.6, bottom: 1.6, top: part.width, center: 1.6 - NOZZLE_BELOW_TOP, kg: 100 }),
  separator: (part) => ({ height: 0.3, bottom: part.width, top: part.width, center: 0.15, kg: 50 * part.width }),
};

const SIDE_KG = { fins: 40, legs: 60 };

export function tankFuel(part) {
  return TANK_FUEL_KG_PER_SQUARE_METER * part.width * part.height;
}

export function newPart(kind, id, settings = {}) {
  return { id, kind, ...PART_DEFAULTS[kind], ...settings };
}

export function nextPartId(parts) {
  return Math.max(0, ...parts.map((part) => part.id)) + 1;
}

export function separatorBelow(parts, index) {
  return parts.slice(0, index).some((part) => part.kind === 'separator');
}

export function tanksBelow(parts, separatorIndex) {
  return parts.slice(0, separatorIndex).filter((part) => part.kind === 'tank').reverse();
}

function stackOutlines(parts) {
  let y = 0;
  return parts.map((part) => {
    const shape = STACK_SHAPES[part.kind](part);
    const y0 = y;
    const y1 = y + shape.height;
    y = y1;
    const b = shape.bottom / 2;
    const t = shape.top / 2;
    return {
      part,
      kind: part.kind,
      kg: shape.kg,
      y0,
      y1,
      halfWidth: Math.max(b, t),
      points: [[-b, y0], [0, y0], [b, y0], [t, y1], [0, y1], [-t, y1]],
      center: [0, y0 + shape.center],
      bottomCenter: [0, y0],
      topCenter: [0, y1],
      topLeft: [-t, y1],
      topRight: [t, y1],
    };
  });
}

function sideOutlines(stack) {
  const outlines = [];
  let stageBottom = 0;
  for (const host of stack) {
    if (host.kind === 'separator') stageBottom = host.y1;
    if (host.kind !== 'tank') continue;
    const height = host.y1 - host.y0;
    for (const side of [-1, 1]) {
      const root = side * host.halfWidth;
      if (host.part.fins) {
        outlines.push({ part: host.part, kind: 'fins', side, kg: SIDE_KG.fins, points: [[root, host.y0], [root + side, host.y0 - 0.5], [root, host.y0 + Math.min(height, 1.5)]] });
      }
      if (host.part.legs) {
        outlines.push({ part: host.part, kind: 'legs', side, kg: SIDE_KG.legs, points: [[root, host.y0], [root + side * 1.2, stageBottom - LEG_FOOT_BELOW], [root, host.y0 + Math.min(height, 1.2)]] });
      }
    }
  }
  for (const outline of outlines) {
    const n = outline.points.length;
    outline.center = [outline.points.reduce((sum, p) => sum + p[0], 0) / n, outline.points.reduce((sum, p) => sum + p[1], 0) / n];
  }
  return outlines;
}

function onSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < SAME_POINT) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (length * length);
  if (t <= SAME_POINT / length || t >= 1 - SAME_POINT / length) return null;
  const off = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / length;
  return off < SAME_POINT ? t : null;
}

function refinedRing(points, everyPoint) {
  const ring = [];
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    ring.push(a);
    const between = everyPoint.map((p) => ({ p, t: onSegment(p, a, b) })).filter((hit) => hit.t !== null);
    between.sort((p, q) => p.t - q.t);
    for (const { p } of between) if (!ring.some((q) => samePoint(q, p))) ring.push(p);
  });
  return ring.filter((p, i) => ring.findIndex((q) => samePoint(q, p)) === i);
}

function samePoint(p, q) {
  return Math.abs(p[0] - q[0]) < SAME_POINT && Math.abs(p[1] - q[1]) < SAME_POINT;
}

function stageRules(parts, stack, spokesOf, engineBeamOf) {
  const rules = [];
  let group = 0;
  parts.forEach((part, index) => {
    if (part.kind !== 'separator') return;
    group += 1;
    const below = tanksBelow(parts, index);
    const tank = below.find((other) => other.id === part.fuelTank) ?? below[0];
    const nextSeparator = parts.findIndex((other, i) => i > index && other.kind === 'separator');
    const above = parts.slice(index + 1, nextSeparator === -1 ? parts.length : nextSeparator);
    rules.push({
      group,
      when: part.stageWhen,
      height: part.stageHeight,
      tanks: part.stageWhen === 'fuel' && tank ? spokesOf.get(stack.find((s) => s.part === tank)) : [],
      lights: part.lightsAbove ? above.filter((other) => other.kind === 'engine').map((engine) => engineBeamOf.get(engine)) : [],
    });
  });
  return rules;
}

export function assemble(parts, keep = {}) {
  const design = emptyDesign();
  design.layers = ['Rocket'];
  design.parts = parts;
  design.program = keep.program ?? '';
  const stack = stackOutlines(parts);
  const outlines = [...stack, ...sideOutlines(stack)];
  const lowest = Math.min(0, ...outlines.flatMap((outline) => outline.points.map((p) => p[1])));
  for (const outline of outlines) {
    for (const key of ['points', 'center', 'bottomCenter', 'topCenter', 'topLeft', 'topRight']) {
      if (!outline[key]) continue;
      outline[key] = key === 'points' ? outline.points.map(([x, y]) => [x, y - lowest]) : [outline[key][0], outline[key][1] - lowest];
    }
  }

  const everyPoint = outlines.flatMap((outline) => outline.points);
  const nodeIds = new Map();
  const nodeAt = ([x, y]) => {
    const key = `${Math.round(x / SAME_POINT)},${Math.round(y / SAME_POINT)}`;
    if (!nodeIds.has(key)) {
      const node = { id: design.nextId++, x, y };
      design.nodes.push(node);
      nodeIds.set(key, node.id);
    }
    return nodeIds.get(key);
  };
  const beamIds = new Map();
  const beamBetween = (a, b, width) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (!beamIds.has(key)) {
      const beam = { id: design.nextId++, a, b, layer: 0, kg: 0, width };
      design.beams.push(beam);
      beamIds.set(key, beam);
    }
    const beam = beamIds.get(key);
    beam.width = Math.max(beam.width, width);
    return beam;
  };

  const spokesOf = new Map();
  const ownedBy = new Map();
  design.outlines = outlines.map((outline) => {
    const ring = refinedRing(outline.points, everyPoint).map(nodeAt);
    const center = nodeAt(outline.center);
    const edgeWidth = outline.kind === 'fins' ? FIN_EDGE_WIDTH : EDGE_WIDTH;
    const edges = ring.map((id, i) => beamBetween(id, ring[(i + 1) % ring.length], edgeWidth));
    const spokes = ring.map((id) => beamBetween(center, id, SPOKE_WIDTH));
    for (const spoke of spokes) spoke.kg += outline.kg / spokes.length;
    spokesOf.set(outline, spokes.map((spoke) => spoke.id));
    ownedBy.set(outline, [...edges, ...spokes]);
    return {
      part: outline.part.id,
      kind: outline.kind,
      side: outline.side,
      nodes: ring,
      center,
      ...(outline.bottomCenter && { bottom: nodeAt(outline.bottomCenter), top: nodeAt(outline.topCenter), topLeft: nodeAt(outline.topLeft), topRight: nodeAt(outline.topRight) }),
    };
  });

  const upright = (outline) => {
    const center = design.outlines[outlines.indexOf(outline)].center;
    const top = design.outlines[outlines.indexOf(outline)].top;
    return beamIds.get(center < top ? `${center}-${top}` : `${top}-${center}`);
  };
  const engineBeamOf = new Map();
  let group = 0;
  for (const outline of stack) {
    const { part } = outline;
    if (part.kind === 'tank') {
      const spokes = spokesOf.get(outline);
      for (const id of spokes) {
        design.beams.find((beam) => beam.id === id).fuel = tankFuel(part) / spokes.length;
        design.tanks.push(id);
      }
    }
    if (part.kind === 'engine') {
      const beam = upright(outline);
      engineBeamOf.set(part, beam.id);
      design.engines.push({ beam: beam.id, nozzle: design.outlines[outlines.indexOf(outline)].center, thrust: part.thrust, limit: part.limit, gimbal: part.gimbal, lit: part.startsOn });
    }
    if (part.kind === 'capsule') design.wheels.push({ beam: upright(outline).id, torque: part.torque });
    if (part.kind === 'computer' && !design.cpu) design.cpu = { beam: upright(outline).id, clock: CPU_CLOCKS.includes(keep.clock) ? keep.clock : 5000 };
    if (part.kind === 'separator') {
      group += 1;
      for (const beam of ownedBy.get(outline)) design.separators.push({ beam: beam.id, group });
    }
  }
  design.stages = stageRules(parts, stack, spokesOf, engineBeamOf);
  return design;
}

const finite = (value, fallback, { min, max }) => (Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback);

export function cleanParts(list) {
  if (!Array.isArray(list)) return null;
  const ids = new Set();
  const parts = [];
  for (const raw of list) {
    if (!STACK_KINDS.includes(raw?.kind)) continue;
    const id = Number.isInteger(raw.id) && !ids.has(raw.id) ? raw.id : nextPartId(parts);
    ids.add(id);
    const defaults = PART_DEFAULTS[raw.kind];
    const part = { id, kind: raw.kind };
    for (const [key, fallback] of Object.entries(defaults)) {
      if (typeof fallback === 'boolean') part[key] = typeof raw[key] === 'boolean' ? raw[key] : fallback;
      else if (key === 'stageWhen') part[key] = STAGE_WHEN.includes(raw[key]) ? raw[key] : fallback;
      else if (key === 'fuelTank') part[key] = Number.isInteger(raw[key]) ? raw[key] : null;
      else part[key] = finite(raw[key], fallback, PART_LIMITS[key]);
    }
    parts.push(part);
  }
  return parts;
}

export function starterParts() {
  let id = 0;
  const part = (kind, settings) => newPart(kind, (id += 1), settings);
  return [
    part('engine', { thrust: 120 }),
    part('tank', { height: 6, fins: true }),
    part('separator'),
    part('engine', { thrust: 30, startsOn: false }),
    part('tank', { height: 3 }),
    part('computer'),
    part('capsule'),
  ];
}
