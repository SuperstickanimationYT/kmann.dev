export const mod = (value, size) => ((value % size) + size) % size;

export function stepLineCycle(cells, table) {
  const size = cells.length;
  const next = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    next[i] = table[(cells[mod(i - 1, size)] << 2) | (cells[i] << 1) | cells[(i + 1) % size]];
  }
  return next;
}

export function stepPlaneTile(cells, width, height, table) {
  const next = new Uint8Array(cells.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx || dy) count += cells[mod(y + dy, height) * width + mod(x + dx, width)];
        }
      }
      next[y * width + x] = table[cells[y * width + x] * 9 + count];
    }
  }
  return next;
}

export function emptyLineBackground(table) {
  return { width: 1, phases: uniformOrbit(table[0]) };
}

export function emptyPlaneBackground(table) {
  return { width: 1, height: 1, phases: uniformOrbit(table[0]) };
}

function uniformOrbit(deadBecomes) {
  return deadBecomes ? [Uint8Array.of(0), Uint8Array.of(1)] : [Uint8Array.of(0)];
}

export function lineWindow(period) {
  const width = period * Math.ceil(8 / period);
  return width > 16 ? period : width;
}

export function planeWindow(width, height) {
  const across = width * Math.ceil(3 / width);
  const down = height * Math.ceil(3 / height);
  return across * down > 20 ? [width, height] : [across, down];
}

export function lineWindowTable({ width: period, phases }) {
  const span = lineWindow(period);
  const table = new Uint8Array(1 << span);
  for (const phase of phases) {
    for (let start = 0; start < period; start += 1) {
      let key = 0;
      for (let offset = 0; offset < span; offset += 1) key = (key << 1) | phase[(start + offset) % period];
      table[key] = 1;
    }
  }
  return { span, table };
}

export function planeWindowTable({ width, height, phases }) {
  const [across, down] = planeWindow(width, height);
  const table = new Uint8Array(1 << (across * down));
  for (const phase of phases) {
    for (let oy = 0; oy < height; oy += 1) {
      for (let ox = 0; ox < width; ox += 1) {
        let key = 0;
        for (let dy = 0; dy < down; dy += 1) {
          for (let dx = 0; dx < across; dx += 1) {
            key = (key << 1) | phase[((oy + dy) % height) * width + ((ox + dx) % width)];
          }
        }
        table[key] = 1;
      }
    }
  }
  return { across, down, table };
}
