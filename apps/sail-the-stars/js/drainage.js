import { directionAt } from './rivers.js';
import { lattice } from './terrain.js';

const [WIDTH, HEIGHT] = [1024, 512];
const CELLS = WIDTH * HEIGHT;
const BLURS = 2;
const LEVELS_PER_STEP = 16;
const FALL_JITTER_STEPS = 0.8;
const POLAR_ROWS_SKIPPED = 36;
const LOWEST_POINT_WINDOW = 9;
const DEEPEST_GORGE_METRES = 250;
const PLACE_JITTER_CELLS = 0.7;
const JITTER_SALT = 6000;
const DRY_BELOW = 128;
const WATER = { leastCells: 14, widthMetres: 110, widestMetres: 1800 };
const LAVA = { leastCells: 40, widthMetres: 120, widestMetres: 600 };

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const column = (x) => (x + WIDTH) % WIDTH;

function shrunk({ width, height, values }) {
  const [stepX, stepY] = [width / WIDTH, height / HEIGHT];
  return Float32Array.from({ length: CELLS }, (_, cell) => {
    const [x, y] = [cell % WIDTH, Math.floor(cell / WIDTH)];
    let total = 0;
    for (let j = 0; j < stepY; j++) for (let i = 0; i < stepX; i++) total += values[(y * stepY + j) * width + x * stepX + i];
    return total / (stepX * stepY);
  });
}

function blurred(values) {
  return Float32Array.from(values, (_, cell) => {
    const [x, y] = [cell % WIDTH, Math.floor(cell / WIDTH)];
    let total = 4 * values[cell];
    for (const [i, j] of NEIGHBOURS.slice(0, 4)) total += 2 * values[Math.min(HEIGHT - 1, Math.max(0, y + j)) * WIDTH + column(x + i)];
    return total / 12;
  });
}

function lowestPoints(heights) {
  const half = LOWEST_POINT_WINDOW;
  return [...heights.keys()].filter((cell) => {
    const [x, y] = [cell % WIDTH, Math.floor(cell / WIDTH)];
    for (let j = Math.max(0, y - half); j <= Math.min(HEIGHT - 1, y + half); j++) {
      for (let i = x - half; i <= x + half; i++) if (heights[j * WIDTH + column(i)] < heights[cell]) return false;
    }
    return true;
  });
}

function floodUpFrom(outlets, heights) {
  const downstream = new Int32Array(CELLS).fill(-1);
  const reached = new Uint8Array(CELLS);
  const order = [];
  const steps = Math.ceil(256 * LEVELS_PER_STEP) + 1;
  const waiting = Array.from({ length: steps }, () => []);
  const stepOf = (cell) => Math.min(steps - 1, Math.floor((heights[cell] + FALL_JITTER_STEPS * lattice(cell, 0, 0, JITTER_SALT)) * LEVELS_PER_STEP));
  outlets.forEach((cell) => {
    reached[cell] = 1;
    waiting[stepOf(cell)].push(cell);
  });
  for (let step = 0; step < steps; step++) {
    for (let next = 0; next < waiting[step].length; next++) {
      const cell = waiting[step][next];
      order.push(cell);
      const [x, y] = [cell % WIDTH, Math.floor(cell / WIDTH)];
      for (const [i, j] of NEIGHBOURS) {
        if (y + j < POLAR_ROWS_SKIPPED || y + j >= HEIGHT - POLAR_ROWS_SKIPPED) continue;
        const neighbour = (y + j) * WIDTH + column(x + i);
        if (reached[neighbour]) continue;
        reached[neighbour] = 1;
        downstream[neighbour] = cell;
        waiting[Math.max(step, stepOf(neighbour))].push(neighbour);
      }
    }
  }
  return { downstream, order };
}

const latitudeOf = (row) => (0.5 - (row + 0.5) / HEIGHT) * Math.PI;

function placeOf(cell) {
  const jitter = (salt) => PLACE_JITTER_CELLS * (lattice(cell, salt, 0, JITTER_SALT + 1) - 0.5);
  return directionAt(((cell % WIDTH) + 0.5 + jitter(0)) / WIDTH * 2 * Math.PI - Math.PI, latitudeOf(Math.floor(cell / WIDTH) + jitter(1)));
}

export function drainedBy(ground) {
  const { leastCells, widthMetres, widestMetres } = ground.molten ? LAVA : WATER;
  let heights = shrunk(ground.heights);
  for (let pass = 0; pass < BLURS; pass++) heights = blurred(heights);
  const land = ground.land && shrunk(ground.land);
  const runs = shrunk(ground.runny);
  const outlets = land ? [...land.keys()].filter((cell) => land[cell] < DRY_BELOW) : lowestPoints(heights);
  const { downstream, order } = floodUpFrom(outlets, heights);
  const drained = Float32Array.from({ length: CELLS }, (_, cell) => Math.cos(latitudeOf(Math.floor(cell / WIDTH))));
  order.toReversed().forEach((cell) => downstream[cell] >= 0 && (drained[downstream[cell]] += drained[cell]));
  const isRiver = (cell) => drained[cell] >= leastCells && runs[cell] >= DRY_BELOW && downstream[cell] >= 0;
  const metres = (cell) => Math.max(land ? 0 : -Infinity, (ground.lowKm + (heights[cell] / 255) * ground.rangeKm) * 1000);
  const mainFeeder = new Map();
  const level = new Map();
  const cutOff = new Set();
  order.toReversed().filter(isRiver).forEach((cell) => {
    const here = metres(cell);
    const arriving = level.get(cell) ?? Infinity;
    if (arriving < here - DEEPEST_GORGE_METRES) cutOff.add(cell);
    level.set(cell, cutOff.has(cell) ? here : Math.min(here, arriving));
    const below = downstream[cell];
    if (!(drained[mainFeeder.get(below)] > drained[cell])) mainFeeder.set(below, cell);
    level.set(below, Math.min(level.get(below) ?? Infinity, level.get(cell)));
  });
  const feeders = new Map();
  order.filter(isRiver).forEach((cell) => feeders.set(downstream[cell], (feeders.get(downstream[cell]) ?? 0) + 1));
  const courses = order.filter((cell) => isRiver(cell) && (!feeders.has(cell) || cutOff.has(cell))).map((head) => {
    const cells = [head];
    while (isRiver(cells[cells.length - 1])) {
      const last = cells[cells.length - 1];
      const below = downstream[last];
      if (cutOff.has(below)) break;
      cells.push(below);
      if (mainFeeder.get(below) !== last) break;
    }
    const kept = cells.filter((cell, k) => k === 0 || k === cells.length - 1 || k % 2 === 0 || feeders.get(cell) > 1);
    return {
      ups: kept.map(placeOf),
      levels: kept.map((cell) => (land && land[cell] < DRY_BELOW ? 0 : Math.min(level.get(cell), metres(cell)))),
      widths: kept.map((cell) => Math.min(widestMetres, widthMetres * Math.sqrt(Math.min(drained[cell], drained[cells[Math.max(0, cells.length - 2)]]) / leastCells))),
    };
  }).filter(({ ups }) => ups.length > 1);
  return { courses, molten: !!ground.molten };
}
