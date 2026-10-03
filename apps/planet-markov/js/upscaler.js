const OUTSIDE_IMAGE = 0;
const CONTEXT_FIELDS = ['parent', 'besideParent', 'pastParent', 'left', 'above'];
const CONTEXT_SIZES = [5, 4, 3, 1];

function lowColor(low, lowSize, column, row) {
  if (column < 0 || column >= lowSize || row < 0 || row >= lowSize) return OUTSIDE_IMAGE;
  return low[row * lowSize + column];
}

function contextOf(high, low, index, size) {
  const lowSize = size >> 1;
  const column = index % size;
  const row = Math.floor(index / size);
  const parentColumn = column >> 1;
  const parentRow = row >> 1;
  const sideStep = column & 1 ? 1 : -1;
  const verticalStep = row & 1 ? 1 : -1;
  return {
    quadrant: (column & 1) + 2 * (row & 1),
    parent: lowColor(low, lowSize, parentColumn, parentRow),
    besideParent: lowColor(low, lowSize, parentColumn + sideStep, parentRow),
    pastParent: lowColor(low, lowSize, parentColumn, parentRow + verticalStep),
    left: column > 0 ? high[index - 1] : OUTSIDE_IMAGE,
    above: row > 0 ? high[index - size] : OUTSIDE_IMAGE,
  };
}

function contextKey(context, length, colorCount) {
  let key = context.quadrant;
  for (let field = 0; field < length; field++) key = key * colorCount + context[CONTEXT_FIELDS[field]];
  return key;
}

export function trainUpscaler(pairs, colorCount) {
  const levels = CONTEXT_SIZES.map((length) => ({ length, counts: new Map() }));
  for (const { low, high, size } of pairs) {
    for (let index = 0; index < high.length; index++) {
      const context = contextOf(high, low, index, size);
      for (const level of levels) {
        const key = contextKey(context, level.length, colorCount);
        let counts = level.counts.get(key);
        if (!counts) level.counts.set(key, (counts = new Uint32Array(colorCount + 1)));
        counts[high[index]]++;
        counts[colorCount]++;
      }
    }
  }
  return { levels, colorCount };
}

function drawFrom(counts, colorCount, random) {
  let target = random() * counts[colorCount];
  for (let color = 0; color < colorCount; color++) {
    target -= counts[color];
    if (target < 0) return color;
  }
  return colorCount - 1;
}

export function createUpscaleSampler(upscaler, low, lowSize, random) {
  const size = lowSize * 2;
  const indices = new Uint8Array(size * size);
  const { levels, colorCount } = upscaler;
  let next = 0;
  let fellBack = 0;

  const samplePixel = (index) => {
    const context = contextOf(indices, low, index, size);
    for (let depth = 0; depth < levels.length; depth++) {
      const counts = levels[depth].counts.get(contextKey(context, levels[depth].length, colorCount));
      if (!counts) continue;
      if (depth > 0) fellBack++;
      return drawFrom(counts, colorCount, random);
    }
    fellBack++;
    return context.parent;
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
