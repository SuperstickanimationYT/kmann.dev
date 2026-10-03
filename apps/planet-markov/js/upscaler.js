import { diskReach, distanceFromCenter } from './training-set.js';

const SPACE = 0;
const FIRST_PLANET_COLOR = 1;
const CONTEXT_FIELDS = ['parent', 'besideParent', 'pastParent', 'left', 'above'];
const CONTEXT_SIZES = [5, 4, 3];
const SHAPE_MATCHES = [
  ['besideParent', 'parent'],
  ['pastParent', 'parent'],
  ['left', 'parent'],
  ['above', 'parent'],
  ['left', 'above'],
  ['left', 'besideParent'],
];

function lowColor(low, lowSize, column, row) {
  if (column < 0 || column >= lowSize || row < 0 || row >= lowSize) return SPACE;
  return low[row * lowSize + column];
}

function nearestPlanetColorInward(low, lowSize, index, size) {
  let column = (index % size) >> 1;
  let row = Math.floor(index / size) >> 1;
  const center = (lowSize - 1) / 2;
  for (let step = 0; step < lowSize && low[row * lowSize + column] === SPACE; step++) {
    column += Math.sign(Math.round(center - column));
    row += Math.sign(Math.round(center - row));
  }
  return low[row * lowSize + column] || FIRST_PLANET_COLOR;
}

function ringOf(index, size, rings) {
  if (!rings) return 0;
  const distance = distanceFromCenter(index, size);
  return distance > diskReach(size) ? rings : Math.min(rings - 1, Math.floor(distance * rings));
}

function contextOf(high, low, index, size, rings) {
  const lowSize = size >> 1;
  const column = index % size;
  const row = Math.floor(index / size);
  const parentColumn = column >> 1;
  const parentRow = row >> 1;
  const sideStep = column & 1 ? 1 : -1;
  const verticalStep = row & 1 ? 1 : -1;
  const ring = ringOf(index, size, rings);
  return {
    place: ((column & 1) + 2 * (row & 1)) * (rings + 1) + ring,
    outside: rings > 0 && ring === rings,
    parent: lowColor(low, lowSize, parentColumn, parentRow),
    besideParent: lowColor(low, lowSize, parentColumn + sideStep, parentRow),
    pastParent: lowColor(low, lowSize, parentColumn, parentRow + verticalStep),
    left: column > 0 ? high[index - 1] : SPACE,
    above: row > 0 ? high[index - size] : SPACE,
  };
}

function colorKey(context, length, colorCount) {
  let key = context.place;
  for (let field = 0; field < length; field++) key = key * colorCount + context[CONTEXT_FIELDS[field]];
  return key;
}

function shapeKey(context) {
  let key = context.place;
  for (const [a, b] of SHAPE_MATCHES) key = key * 2 + (context[a] === context[b] ? 1 : 0);
  return key;
}

const copiedField = (context, color) => CONTEXT_FIELDS.findIndex((field) => context[field] === color);

function tally(table, key, outcome, outcomeCount) {
  let counts = table.get(key);
  if (!counts) table.set(key, (counts = new Uint32Array(outcomeCount + 1)));
  counts[outcome]++;
  counts[outcomeCount]++;
}

export function trainUpscaler(pairs, colorCount, rings) {
  const levels = CONTEXT_SIZES.map((length) => ({ length, counts: new Map() }));
  const shapes = new Map();
  for (const { low, high, size } of pairs) {
    for (let index = 0; index < high.length; index++) {
      const context = contextOf(high, low, index, size, rings);
      for (const level of levels) tally(level.counts, colorKey(context, level.length, colorCount), high[index], colorCount);
      const copied = copiedField(context, high[index]);
      if (copied >= 0) tally(shapes, shapeKey(context), copied, CONTEXT_FIELDS.length);
    }
  }
  return { levels, shapes, colorCount, rings };
}

function drawFrom(counts, outcomeCount, allowed, random) {
  let total = 0;
  for (let outcome = 0; outcome < outcomeCount; outcome++) if (allowed(outcome)) total += counts[outcome];
  if (!total) return -1;
  let target = random() * total;
  for (let outcome = 0; outcome < outcomeCount; outcome++) {
    if (!allowed(outcome)) continue;
    target -= counts[outcome];
    if (target < 0) return outcome;
  }
  return -1;
}

const spaceAllowed = ({ outside, parent, besideParent, pastParent }) => outside || parent === SPACE || besideParent === SPACE || pastParent === SPACE;

export function createUpscaleSampler(upscaler, low, lowSize, random, forceDisk) {
  const size = lowSize * 2;
  const indices = new Uint8Array(size * size);
  const { levels, shapes, colorCount, rings } = upscaler;
  let next = 0;
  let fellBack = 0;

  const samplePixel = (index) => {
    if (forceDisk && distanceFromCenter(index, size) > diskReach(size)) return SPACE;
    const context = contextOf(indices, low, index, size, rings);
    const mayPaintSpace = forceDisk ? false : spaceAllowed(context);
    const allowedColor = (color) => mayPaintSpace || color !== SPACE;
    for (let depth = 0; depth < levels.length; depth++) {
      const counts = levels[depth].counts.get(colorKey(context, levels[depth].length, colorCount));
      const color = counts ? drawFrom(counts, colorCount, allowedColor, random) : -1;
      if (color < 0) continue;
      if (depth > 0) fellBack++;
      return color;
    }
    fellBack++;
    const counts = shapes.get(shapeKey(context));
    const allowedField = (field) => allowedColor(context[CONTEXT_FIELDS[field]]);
    const field = counts ? drawFrom(counts, CONTEXT_FIELDS.length, allowedField, random) : -1;
    if (field >= 0) return context[CONTEXT_FIELDS[field]];
    return CONTEXT_FIELDS.map((name) => context[name]).find(allowedColor) ?? nearestPlanetColorInward(low, lowSize, index, size);
  };

  return {
    size,
    indices,
    get cursor() {
      return next;
    },
    sampleRows(rowCount) {
      const end = Math.min(indices.length, next + rowCount * size);
      for (; next < end; next++) indices[next] = samplePixel(next);
      return next >= indices.length;
    },
    fallbackShare: () => fellBack / Math.max(1, next),
  };
}
