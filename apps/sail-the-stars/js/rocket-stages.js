export const STANDARD_GRAVITY = 9.80665;
const TOUCHING_M = 0.01;
const POSITION_DECIMALS = 1000;
export const SYMMETRIES = [2, 3, 4, 6, 8];

export const PARTS = {
  capsule: { widthM: 3.7, heightM: 3.5, kg: 6000 },
  tank: { widthM: 3.7, heightM: 4, kg: 2000, fuelKg: 44000 },
  engine: { widthM: 1.2, heightM: 2.4, kg: 470, thrustN: { sea: 845e3, vacuum: 914e3 }, ispS: { sea: 282, vacuum: 311 } },
  separator: { widthM: 3.7, heightM: 0.4, kg: 300, separates: true },
  sideSeparator: { widthM: 0.4, heightM: 1.2, kg: 100, separates: true },
  heatShield: { widthM: 3.7, heightM: 0.5, kg: 1000 },
  parachute: { widthM: 1.2, heightM: 0.8, kg: 600 },
};

const stack = (types) => {
  let y = 0;
  return types.map((type) => {
    const placed = { type, x: 0, y, copies: 1 };
    y += PARTS[type].heightM;
    return placed;
  });
};

const firstStage = ['engine', ...Array(6).fill('tank'), 'separator'];
const secondStage = ['engine', 'tank', 'heatShield', 'capsule', 'parachute'];

export const DEFAULT_DESIGN = {
  parts: [...stack([...firstStage, ...secondStage]), { type: 'engine', x: 1.25, y: 0, copies: 6 }],
};

export const rectOf = (entry) => {
  const { widthM, heightM } = PARTS[entry.type];
  return { left: entry.x - widthM / 2, right: entry.x + widthM / 2, bottom: entry.y, top: entry.y + heightM };
};

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > TOUCHING_M;

export function touching(a, b) {
  const [p, q] = [rectOf(a), rectOf(b)];
  const stacked = (Math.abs(p.top - q.bottom) < TOUCHING_M || Math.abs(q.top - p.bottom) < TOUCHING_M) && overlap(p.left, p.right, q.left, q.right);
  const beside = (Math.abs(p.right - q.left) < TOUCHING_M || Math.abs(q.right - p.left) < TOUCHING_M) && overlap(p.bottom, p.top, q.bottom, q.top);
  return stacked || beside;
}

const rests = (upper, lower) => Math.abs(rectOf(upper).bottom - rectOf(lower).top) < TOUCHING_M && overlap(rectOf(upper).left, rectOf(upper).right, rectOf(lower).left, rectOf(lower).right);

export function designFrom(value) {
  const parts = value?.parts;
  if (!Array.isArray(parts) || !parts.length) return null;
  const valid = parts.every(({ type, x, y, copies }) => Object.hasOwn(PARTS, type) && Number.isFinite(x) && x >= 0 && Number.isFinite(y) && (copies === 1 || SYMMETRIES.includes(copies)));
  return valid ? { parts: parts.map(({ type, x, y, copies }) => ({ type, x, y, copies })) } : null;
}

export const rounded = (metres) => Math.round(metres * POSITION_DECIMALS) / POSITION_DECIMALS;

export function settled(design) {
  const lowest = Math.min(...design.parts.map(({ y }) => y));
  return { parts: design.parts.map((part) => ({ ...part, y: rounded(part.y - lowest) })) };
}

export function assemble(design) {
  const entries = design.parts.map((part, id) => ({ ...part, id, fuelKg: (PARTS[part.type].fuelKg ?? 0) * part.copies }));
  const links = entries.map((entry) => entries.filter((other) => other !== entry && touching(entry, other)).map(({ id }) => id));
  const capsule = entries.find(({ type }) => type === 'capsule');
  const root = capsule ? capsule.id : entries.reduce((top, entry) => (rectOf(entry).top > rectOf(top).top ? entry : top)).id;
  const vehicle = { entries, links, root, attached: new Set(entries.map(({ id }) => id)) };
  vehicle.attached = reachable(vehicle, root, () => true);
  return vehicle;
}

function reachable(vehicle, from, passes) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const next of vehicle.links[id]) {
      if (seen.has(next) || !vehicle.attached.has(next) || !passes(vehicle.entries[next])) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

export const attachedEntries = (vehicle) => vehicle.entries.filter(({ id }) => vehicle.attached.has(id));

export const lowestOf = (entries) => Math.min(...entries.map(({ y }) => y));

function sections(vehicle) {
  const found = [];
  const placed = new Set();
  for (const entry of attachedEntries(vehicle)) {
    if (placed.has(entry.id) || PARTS[entry.type].separates) continue;
    const members = reachable(vehicle, entry.id, (other) => !PARTS[other.type].separates);
    members.forEach((id) => placed.add(id));
    found.push([...members].map((id) => vehicle.entries[id]));
  }
  return found;
}

const nozzleFree = (vehicle, engine) => !vehicle.links[engine.id].some((id) => vehicle.attached.has(id) && rests(engine, vehicle.entries[id]));

export const massKg = (vehicle) => attachedEntries(vehicle).reduce((sum, entry) => sum + PARTS[entry.type].kg * entry.copies + entry.fuelKg, 0);

export function refuel(vehicle) {
  attachedEntries(vehicle).forEach((entry) => (entry.fuelKg = (PARTS[entry.type].fuelKg ?? 0) * entry.copies));
}

function engineAt(pressureShare) {
  const { thrustN, ispS } = PARTS.engine;
  const flowKgS = thrustN.vacuum / (ispS.vacuum * STANDARD_GRAVITY);
  const isp = Math.max(0, ispS.vacuum - (ispS.vacuum - ispS.sea) * pressureShare);
  return { flowKgS, thrustN: flowKgS * isp * STANDARD_GRAVITY };
}

function firingSections(vehicle) {
  return sections(vehicle)
    .map((members) => ({ members, engines: members.filter((entry) => entry.type === 'engine' && nozzleFree(vehicle, entry)).reduce((sum, entry) => sum + entry.copies, 0), tanks: members.filter((entry) => entry.fuelKg > 0) }))
    .filter(({ engines, tanks }) => engines > 0 && tanks.length);
}

export const firingEngines = (vehicle) => firingSections(vehicle).flatMap(({ members }) => members.filter((entry) => entry.type === 'engine' && nozzleFree(vehicle, entry)));

export function thrustOf(vehicle, pressureShare) {
  const engine = engineAt(pressureShare);
  const engines = firingSections(vehicle).reduce((sum, section) => sum + section.engines, 0);
  return { thrustN: engines * engine.thrustN, flowKgS: engines * engine.flowKgS, engines };
}

export function burn(vehicle, seconds, throttle) {
  const engine = engineAt(0);
  for (const section of firingSections(vehicle)) {
    let wanted = section.engines * engine.flowKgS * throttle * seconds;
    const tanks = [...section.tanks].sort((a, b) => a.fuelKg - b.fuelKg);
    tanks.forEach((tank, k) => {
      const share = Math.min(tank.fuelKg, wanted / (tanks.length - k));
      tank.fuelKg -= share;
      wanted -= share;
    });
  }
}

function graphDepths(vehicle) {
  const depth = new Map([[vehicle.root, 0]]);
  const queue = [vehicle.root];
  while (queue.length) {
    const id = queue.shift();
    for (const next of vehicle.links[id]) {
      if (depth.has(next) || !vehicle.attached.has(next)) continue;
      depth.set(next, depth.get(id) + 1);
      queue.push(next);
    }
  }
  return depth;
}

function nextSeparators(vehicle) {
  const depth = graphDepths(vehicle);
  const separators = attachedEntries(vehicle).filter((entry) => PARTS[entry.type].separates && depth.has(entry.id));
  if (!separators.length) return [];
  const deepest = Math.max(...separators.map(({ id }) => depth.get(id)));
  return separators.filter(({ id }) => depth.get(id) === deepest);
}

export const stagesLeft = (vehicle) => {
  const copy = { ...vehicle, attached: new Set(vehicle.attached) };
  let count = 0;
  while (nextSeparators(copy).length) {
    separate(copy);
    count += 1;
  }
  return count;
};

export function separate(vehicle) {
  const firing = nextSeparators(vehicle);
  if (!firing.length) return [];
  firing.forEach(({ id }) => vehicle.attached.delete(id));
  const kept = reachable(vehicle, vehicle.root, () => true);
  const dropped = attachedEntries(vehicle).filter(({ id }) => !kept.has(id));
  dropped.forEach(({ id }) => vehicle.attached.delete(id));
  return [...firing, ...dropped];
}

export function stageSummaries(vehicle) {
  const copy = { ...vehicle, entries: vehicle.entries.map((entry) => ({ ...entry })), attached: new Set(vehicle.attached) };
  const engine = engineAt(0);
  const exhaustMS = engine.thrustN / engine.flowKgS;
  const stages = [];
  const begin = () => stages.push({ startKg: massKg(copy), seaLevelThrustN: thrustOf(copy, 1).thrustN, vacuumThrustN: thrustOf(copy, 0).thrustN, deltaVMS: 0, burnSeconds: 0 });
  begin();
  for (let guard = 0; guard < 100; guard++) {
    const firing = firingSections(copy);
    if (!firing.length) {
      if (!separate(copy).length) break;
      begin();
      continue;
    }
    const seconds = Math.min(...firing.map(({ engines, tanks }) => tanks.reduce((sum, tank) => sum + tank.fuelKg, 0) / (engines * engine.flowKgS)));
    const before = massKg(copy);
    burn(copy, seconds, 1);
    stages.at(-1).deltaVMS += exhaustMS * Math.log(before / massKg(copy));
    stages.at(-1).burnSeconds += seconds;
  }
  return stages;
}

export const deltaVLeftMS = (vehicle) => stageSummaries(vehicle).reduce((sum, { deltaVMS }) => sum + deltaVMS, 0);

export function shapeOf(vehicle) {
  const rects = attachedEntries(vehicle).map((entry) => ({ entry, ...rectOf(entry) }));
  const lengthM = Math.max(...rects.map(({ top }) => top)) - Math.min(...rects.map(({ bottom }) => bottom));
  const coreRadiusM = Math.max(...rects.filter(({ entry }) => entry.copies === 1).map(({ right }) => right), 0.5);
  const outerM = Math.max(coreRadiusM, ...rects.map(({ right }) => right));
  const sideColumns = new Map();
  for (const { entry, left, right } of rects) {
    if (entry.copies < 2 || left < coreRadiusM - TOUCHING_M) continue;
    const key = `${entry.x} ${entry.copies}`;
    sideColumns.set(key, Math.max(sideColumns.get(key) ?? 0, entry.copies * Math.PI * ((right - left) / 2) ** 2));
  }
  const endAreaM2 = Math.PI * coreRadiusM ** 2 + [...sideColumns.values()].reduce((sum, area) => sum + area, 0);
  return { kg: massKg(vehicle), endAreaM2, sideAreaM2: lengthM * 2 * outerM, lengthM };
}
