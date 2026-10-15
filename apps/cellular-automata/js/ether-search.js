const LINE_MAX_PERIOD = 16;
const LINE_MAX_TIME = 32;
const PLANE_MAX_AREA = 16;
const PLANE_MAX_SIDE = 8;
const PLANE_MAX_TIME = 12;
const OPTIONS = 7;
const MEANINGFUL_SHARE = 0.005;

export function searchLine(table) {
  const shapes = [];
  for (let width = 1; width <= LINE_MAX_PERIOD; width += 1) shapes.push({ width, height: 1 });
  const soup = { width: 2048, height: 1, generations: 2400, sampleEvery: 100, sampleFrom: 1600 };
  return search(shapes, LINE_MAX_TIME, lineStepper(table), soup);
}

export function searchPlane(table) {
  const shapes = [];
  for (let height = 1; height <= PLANE_MAX_SIDE; height += 1) {
    for (let width = 1; width <= PLANE_MAX_SIDE && width * height <= PLANE_MAX_AREA; width += 1) shapes.push({ width, height });
  }
  const soup = { width: 96, height: 96, generations: 360, sampleEvery: 1, sampleFrom: 356 };
  return search(shapes, PLANE_MAX_TIME, planeStepper(table), soup);
}

function search(shapes, maxTime, stepper, soup) {
  const cycles = shapes.flatMap((shape) => cyclesOfShape(shape, maxTime, stepper));
  const shares = soupShares(cycles, shapes, stepper, soup);
  return rank(cycles.map((cycle, index) => ({ ...cycle, share: shares[index] })));
}

function lineStepper(table) {
  return {
    neighbours: (width, height, x, y) => [[x - 1, y], [x, y], [x + 1, y]].map(([nx]) => ((nx % width) + width) % width + y * width),
    next: (values) => table[(values[0] << 2) | (values[1] << 1) | values[2]],
  };
}

function planeStepper(table) {
  return {
    neighbours: (width, height, x, y) => {
      const list = [];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) list.push((((y + dy) % height) + height) % height * width + (((x + dx) % width) + width) % width);
      }
      return list;
    },
    next: (values) => {
      let count = 0;
      for (let i = 0; i < 9; i += 1) if (i !== 4) count += values[i];
      return table[values[4] * 9 + count];
    },
  };
}

function stepTable({ width, height }, stepper) {
  const area = width * height;
  const neighbours = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) neighbours.push(stepper.neighbours(width, height, x, y));
  }
  const next = new Int32Array(1 << area);
  const values = new Uint8Array(9);
  for (let state = 0; state < next.length; state += 1) {
    let out = 0;
    for (let cell = 0; cell < area; cell += 1) {
      const list = neighbours[cell];
      for (let k = 0; k < list.length; k += 1) values[k] = (state >> list[k]) & 1;
      out |= stepper.next(values) << cell;
    }
    next[state] = out;
  }
  return next;
}

function translate(state, width, height, dx, dy) {
  const rowMask = (1 << width) - 1;
  let out = 0;
  for (let y = 0; y < height; y += 1) {
    const row = (state >> (((y + dy) % height) * width)) & rowMask;
    out |= (((row >> dx) | (row << (width - dx))) & rowMask) << (y * width);
  }
  return out;
}

function translationsOf({ width, height }) {
  const moves = [];
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) if (dx || dy) moves.push({ dx, dy, shrinks: (dx === 0) !== (dy === 0) });
  }
  return moves;
}

function cyclesOfShape(shape, maxTime, stepper) {
  const { width, height } = shape;
  const size = 1 << (width * height);
  const next = stepTable(shape, stepper);
  const moves = translationsOf(shape);
  const canonical = new Int32Array(size);
  const reducible = new Uint8Array(size);
  for (let state = 0; state < size; state += 1) {
    let lowest = state;
    for (const { dx, dy, shrinks } of moves) {
      const moved = translate(state, width, height, dx, dy);
      if (moved < lowest) lowest = moved;
      if (shrinks && moved === state) reducible[state] = 1;
    }
    canonical[state] = lowest;
  }

  const cycles = [];
  for (let start = 0; start < size; start += 1) {
    if (canonical[start] !== start || reducible[start]) continue;
    const phases = [start];
    let state = start;
    for (let time = 1; time <= maxTime; time += 1) {
      state = next[state];
      if (reducible[state] || canonical[state] < start) break;
      if (canonical[state] === start) {
        const move = [{ dx: 0, dy: 0 }, ...moves].find(({ dx, dy }) => translate(state, width, height, dx, dy) === start);
        cycles.push({ width, height, phases, time, move });
        break;
      }
      phases.push(state);
    }
  }
  return cycles;
}

function rank(cycles) {
  const visible = cycles.filter(({ phases }) => phases[0] !== 0);
  const size = (cycle) => cycle.width * cycle.height * cycle.time;
  const common = visible.filter((cycle) => cycle.share >= MEANINGFUL_SHARE).sort((a, b) => b.share - a.share || size(a) - size(b));
  const rest = visible.filter((cycle) => cycle.share < MEANINGFUL_SHARE).sort((a, b) => size(a) - size(b));
  return [...common, ...rest].slice(0, OPTIONS).map(describe);
}

function describe({ width, height, phases, time, move, share }) {
  const area = width * height;
  return {
    width,
    height,
    phases: phases.map((bits) => Uint8Array.from({ length: area }, (_, i) => (bits >> i) & 1)),
    time,
    dx: signedShift(move.dx, width),
    dy: signedShift(move.dy, height),
    share,
  };
}

function signedShift(shift, size) {
  return shift > size / 2 ? shift - size : shift;
}

function soupShares(cycles, shapes, stepper, soup) {
  const owners = new Map(shapes.map((shape) => [`${shape.width}x${shape.height}`, { ...shape, owner: new Int32Array(1 << (shape.width * shape.height)).fill(-1) }]));
  cycles.forEach((cycle, index) => {
    const { owner } = owners.get(`${cycle.width}x${cycle.height}`);
    for (const phase of cycle.phases) {
      owner[phase] = index;
      for (const { dx, dy } of translationsOf(cycle)) owner[translate(phase, cycle.width, cycle.height, dx, dy)] = index;
    }
  });

  const counts = new Float64Array(cycles.length);
  const frames = runSoup(stepper, soup);
  const cells = soup.width * soup.height;
  const keys = new Int32Array(cells);
  for (const frame of frames) {
    for (const { width, height, owner } of owners.values()) {
      for (let y = 0; y < soup.height; y += 1) {
        for (let x = 0; x < soup.width; x += 1) {
          let key = 0;
          for (let ty = 0; ty < height; ty += 1) {
            const row = ((y + ty) % soup.height) * soup.width;
            for (let tx = 0; tx < width; tx += 1) key |= frame[row + (x + tx) % soup.width] << (ty * width + tx);
          }
          keys[y * soup.width + x] = key;
        }
      }
      for (let y = 0; y < soup.height; y += 1) {
        for (let x = 0; x < soup.width; x += 1) {
          const key = keys[y * soup.width + x];
          const index = owner[key];
          if (index < 0) continue;
          if (keys[y * soup.width + (x + width) % soup.width] !== key) continue;
          if (soup.height > 1 && keys[((y + height) % soup.height) * soup.width + x] !== key) continue;
          counts[index] += 1;
        }
      }
    }
  }
  return [...counts].map((count) => count / (frames.length * cells));
}

function runSoup(stepper, { width, height, generations, sampleEvery, sampleFrom }) {
  const neighbours = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) neighbours.push(stepper.neighbours(width, height, x, y));
  }
  let cells = Uint8Array.from({ length: width * height }, () => (Math.random() < 0.5 ? 1 : 0));
  const values = new Uint8Array(9);
  const frames = [];
  for (let generation = 0; generation < generations; generation += 1) {
    const next = new Uint8Array(cells.length);
    for (let cell = 0; cell < cells.length; cell += 1) {
      const list = neighbours[cell];
      for (let k = 0; k < list.length; k += 1) values[k] = cells[list[k]];
      next[cell] = stepper.next(values);
    }
    cells = next;
    if (generation >= sampleFrom && (generation - sampleFrom) % sampleEvery === sampleEvery - 1) frames.push(cells);
  }
  return frames;
}
