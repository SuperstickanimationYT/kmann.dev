import { randomPlanet } from '../../planet-textures/js/presets.js';
import { createRandom } from '../../planet-textures/js/random.js';
import { GENERATED_BOUNTY, HOME_SYSTEM, SOI_MARGIN, massFor } from './world.js';

const GALAXY_SEED = 0x9a1a7;
const SECTOR_SIZE = 1.5e7;
const LOAD_REACH = 1;
const UNLOAD_REACH = 2;
const STAR_CHANCE = 0.6;
const STAR_SPREAD = 0.2;
const PLANET_COUNT = [1, 7];
const FIRST_ORBIT_IN_STAR_RADII = 4;
const ORBIT_GAP = [150000, 350000];
const GAS_GIANT_CHANCE = 0.3;
const STAR_GRAVITY = [2, 6];
const ROCKY = { radius: [2000, 14000], gravity: [0.05, 0.4] };
const GAS_GIANT = { radius: [16000, 30000], gravity: [0.3, 0.7] };
const STAR_TYPES = [
  { fill: '#ffb38a', glow: 'rgba(255, 140, 90, 0.45)', radius: [25000, 40000] },
  { fill: '#fff7dc', glow: 'rgba(255, 236, 170, 0.45)', radius: [40000, 60000] },
  { fill: '#f4f6ff', glow: 'rgba(230, 236, 255, 0.45)', radius: [50000, 70000] },
  { fill: '#bcd4ff', glow: 'rgba(150, 190, 255, 0.5)', radius: [60000, 80000] },
];
const SYLLABLES = ['ka', 've', 'tri', 'nor', 'zu', 'lo', 'mi', 'xan', 'dar', 'the', 'ol', 'py', 'rho', 'qui', 'sel', 'bra', 'on', 'ix'];

export const bodies = [...HOME_SYSTEM];
const loadedSectors = new Map();

export const sectorOf = (x, y) => [Math.round(x / SECTOR_SIZE), Math.round(y / SECTOR_SIZE)];
const sectorCenter = (sectorX, sectorY) => [sectorX * SECTOR_SIZE, sectorY * SECTOR_SIZE];

function sectorSeed(sectorX, sectorY) {
  let hash = GALAXY_SEED ^ Math.imul(sectorX, 0x27d4eb2d) ^ Math.imul(sectorY, 0x165667b1);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

const within = (next, [min, max]) => min + next() * (max - min);
const pick = (next, list) => list[Math.floor(next() * list.length)];

function starName(next) {
  const syllables = Array.from({ length: 2 + Math.floor(next() * 2) }, () => pick(next, SYLLABLES)).join('');
  return syllables[0].toUpperCase() + syllables.slice(1);
}

const GRAVITY_RANGE = [ROCKY.gravity[0], GAS_GIANT.gravity[1]];

function bountyForGravity(surfaceGravity) {
  const { min, max, step } = GENERATED_BOUNTY;
  const difficulty = (surfaceGravity - GRAVITY_RANGE[0]) / (GRAVITY_RANGE[1] - GRAVITY_RANGE[0]);
  return Math.round((min + difficulty * (max - min)) / step) * step;
}

function generatePlanet(next, star, orbit, index) {
  const gasGiant = next() < GAS_GIANT_CHANCE;
  const shape = gasGiant ? GAS_GIANT : ROCKY;
  const radius = within(next, shape.radius);
  const bearing = next() * Math.PI * 2;
  const planet = randomPlanet(next, gasGiant);
  const surfaceGravity = within(next, shape.gravity);
  return {
    name: `${star.name} ${String.fromCharCode(98 + index)}`,
    x: star.x + Math.sin(bearing) * orbit,
    y: star.y + Math.cos(bearing) * orbit,
    radius,
    soi: radius + SOI_MARGIN,
    mass: massFor(radius, surfaceGravity),
    kind: 'planemo',
    palette: { fill: planet.baseColor },
    planet,
    bounty: bountyForGravity(surfaceGravity),
  };
}

function generateSystem(sectorX, sectorY) {
  if (sectorX === 0 && sectorY === 0) return [];
  const { next, integer } = createRandom(sectorSeed(sectorX, sectorY));
  if (next() > STAR_CHANCE) return [];

  const type = pick(next, STAR_TYPES);
  const radius = within(next, type.radius);
  const [centerX, centerY] = sectorCenter(sectorX, sectorY);
  const star = {
    name: starName(next),
    x: centerX + within(next, [-STAR_SPREAD, STAR_SPREAD]) * SECTOR_SIZE,
    y: centerY + within(next, [-STAR_SPREAD, STAR_SPREAD]) * SECTOR_SIZE,
    radius,
    soi: radius + SOI_MARGIN,
    mass: massFor(radius, within(next, STAR_GRAVITY)),
    kind: 'star',
    palette: { fill: type.fill, glow: type.glow },
  };

  const planets = [];
  let orbit = radius * FIRST_ORBIT_IN_STAR_RADII;
  const count = integer(...PLANET_COUNT);
  for (let index = 0; index < count; index++) {
    orbit += within(next, ORBIT_GAP);
    planets.push(generatePlanet(next, star, orbit, index));
  }
  return [star, ...planets];
}

export function starsWithin(x, y, range) {
  const [sectorX, sectorY] = sectorOf(x, y);
  const reach = Math.ceil(range / SECTOR_SIZE);
  const stars = HOME_SYSTEM.filter((body) => body.kind === 'star');
  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      const systemBodies = loadedSectors.get(`${sectorX + dx},${sectorY + dy}`)?.bodies ?? generateSystem(sectorX + dx, sectorY + dy);
      const star = systemBodies.find((body) => body.kind === 'star');
      if (star) stars.push(star);
    }
  }
  const distance = (star) => Math.hypot(star.x - x, star.y - y);
  return stars.filter((star) => distance(star) <= range).sort((a, b) => distance(a) - distance(b));
}

const sectorGap = (sector, sectorX, sectorY) => Math.max(Math.abs(sector.x - sectorX), Math.abs(sector.y - sectorY));

export function streamSectors(x, y) {
  const [sectorX, sectorY] = sectorOf(x, y);
  let changed = false;
  for (const [key, sector] of loadedSectors) {
    if (sectorGap(sector, sectorX, sectorY) <= UNLOAD_REACH) continue;
    loadedSectors.delete(key);
    changed = true;
  }
  for (let dx = -LOAD_REACH; dx <= LOAD_REACH; dx++) {
    for (let dy = -LOAD_REACH; dy <= LOAD_REACH; dy++) {
      const key = `${sectorX + dx},${sectorY + dy}`;
      if (loadedSectors.has(key)) continue;
      loadedSectors.set(key, { x: sectorX + dx, y: sectorY + dy, bodies: generateSystem(sectorX + dx, sectorY + dy) });
      changed = true;
    }
  }
  if (changed) bodies.splice(0, bodies.length, ...HOME_SYSTEM, ...[...loadedSectors.values()].flatMap((sector) => sector.bodies));
}
