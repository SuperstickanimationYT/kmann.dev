import { createRandom } from './random.js';
import { ANCHOR_METRES, faceDirection, groundHeightMetres, groundNoise, lattice, mapCoordinates, patchCorners, patchEdgeMetres, sampleMap } from './terrain.js';

export const SCATTER_FLOATS = 5;
export const SMALLEST_ROCK_PIXELS = 3;
const SIZE_AT = 3;
export const SCATTER_LAYERS = [
  { kind: 'rocks', edgeMetres: 4, reachMetres: 18, sizes: [0.05, 0.16] },
  { kind: 'rocks', edgeMetres: 16, reachMetres: 70, sizes: [0.16, 0.55] },
  { kind: 'rocks', edgeMetres: 64, reachMetres: 280, sizes: [0.55, 1.8] },
  { kind: 'rocks', edgeMetres: 256, reachMetres: 1000, sizes: [1.8, 6] },
  { kind: 'grass', edgeMetres: 6, reachMetres: 38, sizes: [0.1, 0.34] },
];

const GROUND_SEEN_UP_CLOSE_METRES = 0.25;
const HIGHEST_SPLASH_METRES = 0.4;
const CLUMP_OCTAVES = [[4, 0.35], [7, 0.4], [10, 0.25]];
const SPARSEST_CLUMP = 0.12;
const CLUMP_SEEDS = 930;
const ROCK_CLUMPS = 0;
const GRASS_CLUMPS = 1;
const TUFTS_PER_SQUARE_METRE = 36;
const GRASS_GRID_CELLS = 12;
const STEEPEST_GRASS_SLOPE = 0.9;
const SPARSEST_VEGETATION = 0.04;
const ROCKS_LEFT_IN_GRASS = 0.25;

export const scatterLevel = (radiusKm, { edgeMetres }) => Math.max(0, Math.round(Math.log2(patchEdgeMetres(radiusKm, 0) / edgeMetres)));

const smoothstep = (low, high, value) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

function clumping({ anchor, offset }, seed) {
  const noise = CLUMP_OCTAVES.reduce((sum, [octave, weight]) => sum + weight * groundNoise(anchor, offset, octave, CLUMP_SEEDS + seed), 0);
  return SPARSEST_CLUMP + (1 - SPARSEST_CLUMP) * smoothstep(0.35, 0.65, noise);
}

function placeAt(radiusMetres, face, s, t) {
  const up = faceDirection(face, s, t);
  const surface = up.map((value) => value * radiusMetres);
  const anchor = surface.map((value) => Math.floor(value / ANCHOR_METRES));
  return { up, anchor, offset: surface.map((value, axis) => value - anchor[axis] * ANCHOR_METRES) };
}

const heightAt = (ground, { up, anchor, offset }) => groundHeightMetres(ground, up, anchor, offset, GROUND_SEEN_UP_CLOSE_METRES);
const vegetationAt = (ground, { up }) => (ground.vegetation ? ground.vegetationShare * sampleMap(ground.vegetation, mapCoordinates(up)) : 0);

function sizeBetween([smallest, largest], random) {
  const largestShare = (smallest / largest) ** 2;
  return smallest / Math.sqrt(1 - random * (1 - largestShare));
}

const meanRockArea = ([smallest, largest]) => ((Math.PI / 4) * 2 * Math.log(largest / smallest)) / (1 / smallest ** 2 - 1 / largest ** 2);

function scatterRocks(ground, radiusMetres, tile, layer, random, add) {
  const { s, t, span } = patchCorners(tile);
  const edge = patchEdgeMetres(radiusMetres / 1000, tile.level);
  const wanted = (2 * ground.rocks.cover[tile.layer] * edge * edge) / meanRockArea(layer.sizes);
  for (let k = 0; k < wanted; k++) {
    const place = placeAt(radiusMetres, tile.face, s + random.next() * span, t + random.next() * span);
    const size = sizeBetween(layer.sizes, random.next());
    const keep = random.next();
    const seed = random.next();
    const overgrown = smoothstep(0.1, 0.5, vegetationAt(ground, place));
    if (keep > clumping(place, ROCK_CLUMPS) * (1 - overgrown * (1 - ROCKS_LEFT_IN_GRASS))) continue;
    const { height, seaLevel } = heightAt(ground, place);
    if (height > seaLevel + HIGHEST_SPLASH_METRES) add(place.up, height, size, seed);
  }
}

function grassGrid(ground, radiusMetres, tile) {
  const { s, t, span } = patchCorners(tile);
  const side = GRASS_GRID_CELLS + 1;
  const heights = new Float64Array(side * side);
  let seaLevel = -Infinity;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const sampled = heightAt(ground, placeAt(radiusMetres, tile.face, s + (i / GRASS_GRID_CELLS) * span, t + (j / GRASS_GRID_CELLS) * span));
      heights[j * side + i] = sampled.height;
      seaLevel = sampled.seaLevel;
    }
  }
  const sample = (x, y) => {
    const i = Math.min(GRASS_GRID_CELLS - 1, Math.floor(x * GRASS_GRID_CELLS));
    const j = Math.min(GRASS_GRID_CELLS - 1, Math.floor(y * GRASS_GRID_CELLS));
    const [fx, fy] = [x * GRASS_GRID_CELLS - i, y * GRASS_GRID_CELLS - j];
    const corner = j * side + i;
    const [a, b, c, d] = [heights[corner], heights[corner + 1], heights[corner + side], heights[corner + side + 1]];
    return { height: (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy, rise: Math.hypot(b - a, c - a) * GRASS_GRID_CELLS };
  };
  return { sample, seaLevel };
}

function scatterGrass(ground, radiusMetres, tile, layer, random, add) {
  const { s, t, span } = patchCorners(tile);
  const edge = patchEdgeMetres(radiusMetres / 1000, tile.level);
  const vegetation = vegetationAt(ground, placeAt(radiusMetres, tile.face, s + span / 2, t + span / 2));
  if (vegetation < SPARSEST_VEGETATION) return;
  const { sample, seaLevel } = grassGrid(ground, radiusMetres, tile);
  const [shortest, tallest] = layer.sizes;
  const wanted = TUFTS_PER_SQUARE_METRE * edge * edge;
  for (let k = 0; k < wanted; k++) {
    const [x, y, keep, vigour, seed] = [random.next(), random.next(), random.next(), random.next(), random.next()];
    const place = placeAt(radiusMetres, tile.face, s + x * span, t + y * span);
    const lush = vegetation * (0.35 + 0.65 * clumping(place, GRASS_CLUMPS));
    if (keep > 1.6 * lush) continue;
    const { height, rise } = sample(x, y);
    if (rise / edge > STEEPEST_GRASS_SLOPE || height < seaLevel + HIGHEST_SPLASH_METRES) continue;
    add(place.up, height, shortest + (tallest - shortest) * (0.3 + 0.7 * vigour) * Math.min(1, 0.25 + lush), seed);
  }
}

export function rocksSeen({ instances, count }, nearestMetres, pixelAngle) {
  const smallest = SMALLEST_ROCK_PIXELS * nearestMetres * pixelAngle;
  let [seen, unseen] = [0, count];
  while (seen < unseen) {
    const middle = (seen + unseen) >> 1;
    if (instances[middle * SCATTER_FLOATS + SIZE_AT] >= smallest) seen = middle + 1;
    else unseen = middle;
  }
  return seen;
}

export function buildScatter(ground, radiusKm, tile) {
  const layer = SCATTER_LAYERS[tile.layer];
  const radiusMetres = radiusKm * 1000;
  const { s, t, span } = patchCorners(tile);
  const random = createRandom(lattice(tile.ix, tile.iy, tile.face * SCATTER_LAYERS.length + tile.layer, tile.level) * 4294967295);
  const middle = placeAt(radiusMetres, tile.face, s + span / 2, t + span / 2);
  const centre = middle.up.map((value) => value * (radiusMetres + heightAt(ground, middle).height));
  const placed = [];
  let farthest = 0;
  const add = (up, height, size, seed) => {
    const point = up.map((value, axis) => value * (radiusMetres + height) - centre[axis]);
    farthest = Math.max(farthest, Math.hypot(...point) + size);
    placed.push([...point, size, seed]);
  };
  const scatter = layer.kind === 'grass' ? scatterGrass : scatterRocks;
  scatter(ground, radiusMetres, tile, layer, random, add);
  if (layer.kind === 'rocks') placed.sort((a, b) => b[SIZE_AT] - a[SIZE_AT]);
  return { instances: new Float32Array(placed.flat()), count: placed.length, centreKm: centre.map((value) => value / 1000), boundKm: farthest / 1000, up: middle.up };
}
