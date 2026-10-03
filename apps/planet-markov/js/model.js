import { distanceFromCenter, PLANET_SIZE } from './training-set.js';

export const NEIGHBORS = [
  { name: 'left', dx: -1, dy: 0 },
  { name: 'above', dx: 0, dy: -1 },
  { name: 'above-left', dx: -1, dy: -1 },
  { name: 'above-right', dx: 1, dy: -1 },
  { name: 'two left', dx: -2, dy: 0 },
  { name: 'two above', dx: 0, dy: -2 },
];

const OUTSIDE_IMAGE = 0;

function neighborColor(indices, index, { dx, dy }) {
  const column = (index % PLANET_SIZE) + dx;
  const row = Math.floor(index / PLANET_SIZE) + dy;
  if (column < 0 || column >= PLANET_SIZE || row < 0) return OUTSIDE_IMAGE;
  return indices[row * PLANET_SIZE + column];
}

function ringPosition(index, rings) {
  const distance = distanceFromCenter(index);
  return distance > 1 ? rings : Math.min(rings - 1, distance * rings);
}

function contextLevels(neighborCount, rings) {
  const levels = [];
  for (let n = neighborCount; n >= 0; n--) levels.push({ neighbors: n, rings });
  if (rings) levels.push({ neighbors: 0, rings: 0 });
  return levels;
}

function contextKey(indices, index, level, ring, colorCount) {
  let key = 0;
  for (let n = 0; n < level.neighbors; n++) key = key * colorCount + neighborColor(indices, index, NEIGHBORS[n]);
  return level.rings ? key * (level.rings + 1) + ring : key;
}

export function trainModel(quantizedPlanets, { colorCount, neighborCount, rings }) {
  const levels = contextLevels(neighborCount, rings).map((level) => ({ ...level, counts: new Map() }));
  for (const indices of quantizedPlanets) {
    for (let index = 0; index < indices.length; index++) {
      const ring = Math.floor(ringPosition(index, rings));
      for (const level of levels) {
        const key = contextKey(indices, index, level, ring, colorCount);
        let counts = level.counts.get(key);
        if (!counts) level.counts.set(key, (counts = new Uint32Array(colorCount + 1)));
        counts[indices[index]]++;
        counts[colorCount]++;
      }
    }
  }
  return { levels, colorCount, rings };
}

export const contextsLearned = (model) => model.levels[0].counts.size;

function drawFrom(counts, colorCount, random) {
  let target = random() * counts[colorCount];
  for (let color = 0; color < colorCount; color++) {
    target -= counts[color];
    if (target < 0) return color;
  }
  return colorCount - 1;
}

function blendedRing(index, rings, random) {
  const position = ringPosition(index, rings);
  if (position >= rings) return rings;
  const centered = Math.max(0, position - 0.5);
  const lower = Math.floor(centered);
  return Math.min(rings - 1, random() < centered - lower ? lower + 1 : lower);
}

export function createSampler(model, random) {
  const indices = new Uint8Array(PLANET_SIZE * PLANET_SIZE);
  let next = 0;
  let fellBack = 0;
  const { levels, colorCount, rings } = model;

  const samplePixel = (index) => {
    const ring = rings ? blendedRing(index, rings, random) : 0;
    for (let depth = 0; depth < levels.length; depth++) {
      const level = levels[depth];
      const counts = level.counts.get(contextKey(indices, index, level, ring, colorCount));
      if (!counts) continue;
      if (depth > 0) fellBack++;
      return drawFrom(counts, colorCount, random);
    }
    return OUTSIDE_IMAGE;
  };

  return {
    indices,
    sampleRows(rowCount) {
      const end = Math.min(indices.length, next + rowCount * PLANET_SIZE);
      for (; next < end; next++) indices[next] = samplePixel(next);
      return next >= indices.length;
    },
    fallbackShare: () => fellBack / Math.max(1, next),
  };
}
