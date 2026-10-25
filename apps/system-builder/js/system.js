import { G, AU, KM, EARTH_MASS, EARTH_RADIUS, SUN_MASS, SUN_RADIUS, KINDS } from './units.js';
import { offsetAt, apoapsis, periapsis } from './orbits.js';

const SUB_NEPTUNE_RADIUS = 1.6 * EARTH_RADIUS;
const NEW_ORBIT_SPACING = 1.3;
const NEW_ORBIT_HILL_RADII = 12;
const NEW_MOON_HILL_FRACTION = 0.15;
const PALETTE = ['#c9a27a', '#7fb0e6', '#d98c5f', '#e3cf9a', '#9fd6c8', '#b9a3e3', '#e39aa8', '#a8c97f'];

const newId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

export const bodyById = (system, id) => system.bodies.find((body) => body.id === id);

export const rootOf = (system) => system.bodies.find((body) => !body.parent);

export const childrenOf = (system, id) =>
  system.bodies.filter((body) => body.parent === id).sort((first, second) => first.orbit.a - second.orbit.a);

export function treeOrder(system) {
  const ordered = [];
  const visit = (body, depth) => {
    ordered.push({ body, depth });
    for (const child of childrenOf(system, body.id)) visit(child, depth + 1);
  };
  const root = rootOf(system);
  if (root) visit(root, 0);
  return ordered;
}

export function descendantsOf(system, id) {
  return childrenOf(system, id).flatMap((child) => [child, ...descendantsOf(system, child.id)]);
}

export const gravitationalParameter = (system, body) => G * (bodyById(system, body.parent).massKg + body.massKg);

export const surfaceGravity = (body) => (G * body.massKg) / body.radiusM ** 2;

export const density = (body) => body.massKg / ((4 / 3) * Math.PI * body.radiusM ** 3);

export const hasSurface = (body) => body.kind !== 'star' && body.radiusM < SUB_NEPTUNE_RADIUS;

export function hillRadius(system, body) {
  if (!body.parent) return Infinity;
  const parent = bodyById(system, body.parent);
  return periapsis(body.orbit) * Math.cbrt(body.massKg / (3 * parent.massKg));
}

export function placeAt(system, seconds) {
  const placed = new Map();
  for (const { body } of treeOrder(system)) {
    if (!body.parent) {
      placed.set(body.id, { x: 0, y: 0, z: 0 });
      continue;
    }
    const origin = placed.get(body.parent);
    const offset = offsetAt(body.orbit, gravitationalParameter(system, body), seconds);
    placed.set(body.id, { x: origin.x + offset.x, y: origin.y + offset.y, z: origin.z + offset.z });
  }
  return placed;
}

function unusedName(system, base) {
  const names = new Set(system.bodies.map((body) => body.name));
  for (let number = 1; ; number += 1) {
    const name = `${base} ${number}`;
    if (!names.has(name)) return name;
  }
}

function stablySpacedBeyond(parent, outermost, massKg) {
  const halfSpacing = (NEW_ORBIT_HILL_RADII / 2) * Math.cbrt((outermost.massKg + massKg) / (3 * parent.massKg));
  const hillSpaced = halfSpacing < 1 ? outermost.orbit.a * (1 + halfSpacing) / (1 - halfSpacing) : Infinity;
  return Math.max(hillSpaced, apoapsis(outermost.orbit) * NEW_ORBIT_SPACING);
}

function firstFreeOrbit(system, parent, kind, massKg) {
  const siblings = childrenOf(system, parent.id);
  if (siblings.length) return stablySpacedBeyond(parent, siblings[siblings.length - 1], massKg);
  if (kind === 'moon') return Math.max(hillRadius(system, parent) * NEW_MOON_HILL_FRACTION, parent.radiusM * 4);
  return Math.max(AU, parent.radiusM * 20);
}

const BODY_TEMPLATES = {
  star: { massKg: 0.5 * SUN_MASS, radiusM: 0.5 * SUN_RADIUS, color: '#ffcf8a' },
  planet: { massKg: EARTH_MASS, radiusM: EARTH_RADIUS },
  moon: { massKg: 0.0123 * EARTH_MASS, radiusM: 1737 * KM },
};

export function addBody(system, kind, parentId) {
  const parent = bodyById(system, parentId);
  const template = BODY_TEMPLATES[kind];
  const body = {
    id: newId(),
    name: unusedName(system, KINDS[kind]),
    kind,
    parent: parent.id,
    massKg: template.massKg,
    radiusM: template.radiusM,
    color: template.color ?? PALETTE[system.bodies.length % PALETTE.length],
    orbit: { a: firstFreeOrbit(system, parent, kind, template.massKg), e: 0, i: 0, node: 0, peri: 0, meanAnomaly: Math.random() * 360 },
  };
  system.bodies.push(body);
  return body;
}

export function removeBody(system, id) {
  const doomed = new Set([id, ...descendantsOf(system, id).map((body) => body.id)]);
  system.bodies = system.bodies.filter((body) => !doomed.has(body.id));
  if (doomed.has(system.home)) system.home = null;
}

export function createSystem() {
  return {
    name: 'New system',
    author: '',
    description: '',
    home: null,
    bodies: [{
      id: newId(),
      name: 'Star',
      kind: 'star',
      parent: null,
      massKg: SUN_MASS,
      radiusM: SUN_RADIUS,
      color: '#ffe3a1',
      orbit: null,
    }],
  };
}

const ORBIT_FIELDS = ['a', 'e', 'i', 'node', 'peri', 'meanAnomaly'];

function assertFinite(value, what) {
  if (!Number.isFinite(value)) throw new Error(`${what} is not a number.`);
}

export function parseSystem(text) {
  const system = JSON.parse(text);
  if (!system || !Array.isArray(system.bodies)) throw new Error('This file has no list of bodies.');
  const ids = new Set(system.bodies.map((body) => body.id));
  const roots = system.bodies.filter((body) => !body.parent);
  if (roots.length !== 1) throw new Error(`A system needs exactly one body with no parent; this one has ${roots.length}.`);
  for (const body of system.bodies) {
    if (!KINDS[body.kind]) throw new Error(`${body.name} has an unknown kind, "${body.kind}".`);
    assertFinite(body.massKg, `${body.name}'s mass`);
    assertFinite(body.radiusM, `${body.name}'s radius`);
    if (!body.parent) continue;
    if (!ids.has(body.parent)) throw new Error(`${body.name} orbits a body that isn't in the file.`);
    for (const field of ORBIT_FIELDS) assertFinite(body.orbit?.[field], `${body.name}'s orbit ${field}`);
  }
  if (treeOrder(system).length !== system.bodies.length) throw new Error('Some bodies orbit each other in a loop.');
  return { name: 'Imported system', author: '', description: '', home: null, ...system };
}
