const CELLS = 32;
const WALL = [30, 38, 56];
const FLOOR = [222, 214, 190];
const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carvePassages(random) {
  const openRight = new Uint8Array(CELLS * CELLS);
  const openDown = new Uint8Array(CELLS * CELLS);
  const visited = new Uint8Array(CELLS * CELLS);
  const stack = [0];
  visited[0] = 1;
  while (stack.length) {
    const cell = stack.at(-1);
    const x = cell % CELLS;
    const y = Math.floor(cell / CELLS);
    const unvisited = STEPS
      .map(([dx, dy]) => [x + dx, y + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < CELLS && ny < CELLS && !visited[ny * CELLS + nx]);
    if (!unvisited.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = unvisited[Math.floor(random() * unvisited.length)];
    if (dx === 1) openRight[cell] = 1;
    if (dx === -1) openRight[ny * CELLS + nx] = 1;
    if (dy === 1) openDown[cell] = 1;
    if (dy === -1) openDown[ny * CELLS + nx] = 1;
    visited[ny * CELLS + nx] = 1;
    stack.push(ny * CELLS + nx);
  }
  return { openRight, openDown };
}

function isWall(px, py, size, passages) {
  const pitch = size / CELLS;
  const wall = pitch / 3;
  const x = Math.floor(px / pitch);
  const y = Math.floor(py / pitch);
  const inLeftWall = px % pitch < wall;
  const inTopWall = py % pitch < wall;
  const onBorder = px >= size - wall || py >= size - wall;
  const isEntrance = x === 0 && y === 0 && inTopWall && !inLeftWall;
  const isExit = x === CELLS - 1 && y === CELLS - 1 && py >= size - wall && px % pitch >= wall && px < size - wall;
  if (isEntrance || isExit) return false;
  if (onBorder) return true;
  if (inLeftWall && inTopWall) return true;
  if (inLeftWall) return x === 0 || !passages.openRight[y * CELLS + x - 1];
  if (inTopWall) return y === 0 || !passages.openDown[(y - 1) * CELLS + x];
  return false;
}

export function drawMaze(seed, size) {
  const passages = carvePassages(createRandom(seed));
  const rgb = new Uint8Array(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) rgb.set(isWall(px, py, size, passages) ? WALL : FLOOR, (py * size + px) * 3);
  }
  return { size, rgb };
}
