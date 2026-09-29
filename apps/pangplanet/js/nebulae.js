import { createRandom } from '../../planet-textures/js/random.js';
import { SECTOR_SIZE, currentGalaxySeed, outsideGalaxy, starName } from './universe.js';

const BLOCK_IN_SECTORS = 25;
const BLOCK_SIZE = BLOCK_IN_SECTORS * SECTOR_SIZE;
const CHANCE_PER_BLOCK = 0.55;
const RADIUS_IN_SECTORS = [3, 10];
const PUFF_COUNT = [5, 9];
const PUFF_SPREAD = 0.6;
const PUFF_RADIUS = [0.35, 0.7];
const REACH_IN_RADII = 1.6;
const LOCAL_BUBBLE = 4 * SECTOR_SIZE;
const SALT = 0x4eb01a;
const INSIDE_DENSITY = 0.15;

export const NEBULA_KINDS = {
  emission: { share: 0.5, colour: [255, 96, 150], about: 'Its hydrogen glows red, lit by hot young stars.' },
  reflection: { share: 0.25, colour: [110, 160, 255], about: 'Its dust reflects the blue light of nearby stars.' },
  dark: { share: 0.25, colour: [26, 18, 14], about: 'Its dust blocks the light of the stars behind it.' },
};

const blocks = new Map();

function blockSeed(seed, blockX, blockY) {
  let hash = seed ^ SALT ^ Math.imul(blockX, 0x2c1b3c6d) ^ Math.imul(blockY, 0x297a2d39);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function pickKind(roll) {
  let total = 0;
  for (const [kind, { share }] of Object.entries(NEBULA_KINDS)) {
    total += share;
    if (roll < total) return kind;
  }
  return 'emission';
}

function generateBlock(seed, blockX, blockY) {
  const { next, integer, between } = createRandom(blockSeed(seed, blockX, blockY));
  if (next() >= CHANCE_PER_BLOCK) return [];
  const radius = between(...RADIUS_IN_SECTORS) * SECTOR_SIZE;
  const x = (blockX + between(0.2, 0.8)) * BLOCK_SIZE;
  const y = (blockY + between(0.2, 0.8)) * BLOCK_SIZE;
  if (outsideGalaxy(x, y) || Math.hypot(x, y) < LOCAL_BUBBLE + radius * REACH_IN_RADII) return [];
  const puffs = Array.from({ length: integer(...PUFF_COUNT) }, () => {
    const bearing = next() * Math.PI * 2;
    const offset = next() * radius * PUFF_SPREAD;
    return { x: x + Math.cos(bearing) * offset, y: y + Math.sin(bearing) * offset, radius: between(...PUFF_RADIUS) * radius };
  });
  return [{ name: starName(next), kind: pickKind(next()), x, y, radius, puffs }];
}

function nebulaeInBlock(blockX, blockY) {
  const seed = currentGalaxySeed();
  const key = `${seed}:${blockX},${blockY}`;
  if (!blocks.has(key)) blocks.set(key, generateBlock(seed, blockX, blockY));
  return blocks.get(key);
}

export function nebulaeWithin(x, y, range) {
  const found = [];
  const [fromX, toX] = [Math.floor((x - range) / BLOCK_SIZE) - 1, Math.floor((x + range) / BLOCK_SIZE) + 1];
  const [fromY, toY] = [Math.floor((y - range) / BLOCK_SIZE) - 1, Math.floor((y + range) / BLOCK_SIZE) + 1];
  for (let blockX = fromX; blockX <= toX; blockX++) {
    for (let blockY = fromY; blockY <= toY; blockY++) {
      for (const nebula of nebulaeInBlock(blockX, blockY)) {
        if (Math.hypot(nebula.x - x, nebula.y - y) <= range + nebula.radius * REACH_IN_RADII) found.push(nebula);
      }
    }
  }
  return found;
}

const densityOf = (nebula, x, y) => Math.min(1, nebula.puffs.reduce((sum, puff) => sum + Math.exp(-((puff.x - x) ** 2 + (puff.y - y) ** 2) / puff.radius ** 2), 0));

export function nebulaAt(x, y) {
  let thickest = null;
  for (const nebula of nebulaeWithin(x, y, 0)) {
    const density = densityOf(nebula, x, y);
    if (density >= INSIDE_DENSITY && density > (thickest?.density ?? 0)) thickest = { nebula, density };
  }
  return thickest;
}
