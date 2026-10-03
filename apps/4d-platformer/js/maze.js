import { range } from './vec.js';

const CELLS_PER_AXIS = 3;
const VOXEL = 1.6;
const WALL_HEIGHT = 2.6;
const SEED = 20261002;

function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function carve(axisCount, random) {
  const size = 2 * CELLS_PER_AXIS + 1;
  const open = new Set();
  const key = voxel => voxel.join(',');
  const voxelOf = cell => cell.map(c => 2 * c + 1);
  const start = Array(axisCount).fill(0);
  const visited = new Set([key(start)]);
  const path = [start];
  open.add(key(voxelOf(start)));
  while (path.length) {
    const cell = path.at(-1);
    const neighbours = range(axisCount).flatMap(axis => [-1, 1].map(step => {
      const next = [...cell];
      next[axis] += step;
      return next;
    })).filter(next => next.every(c => c >= 0 && c < CELLS_PER_AXIS) && !visited.has(key(next)));
    if (!neighbours.length) {
      path.pop();
      continue;
    }
    const next = neighbours[Math.floor(random() * neighbours.length)];
    const between = voxelOf(cell).map((v, axis) => (v + voxelOf(next)[axis]) / 2);
    open.add(key(between));
    open.add(key(voxelOf(next)));
    visited.add(key(next));
    path.push(next);
  }
  return { size, isOpen: voxel => open.has(key(voxel)) };
}

function wallRuns({ size, isOpen }, axisCount) {
  const runs = [];
  const last = axisCount - 1;
  const walk = (prefix) => {
    if (prefix.length < last) {
      for (let v = 0; v < size; v++) walk([...prefix, v]);
      return;
    }
    let runStart = null;
    for (let v = 0; v <= size; v++) {
      const solid = v < size && !isOpen([...prefix, v]);
      if (solid && runStart === null) runStart = v;
      if (!solid && runStart !== null) {
        runs.push({ from: [...prefix, runStart], to: [...prefix, v - 1] });
        runStart = null;
      }
    }
  };
  walk([]);
  return runs;
}

const voxelCentre = v => (v - CELLS_PER_AXIS) * VOXEL;
const farCorner = 2 * CELLS_PER_AXIS - 1;

function placeInWorld(n, mazeAxes, voxelFrom, voxelTo, verticalSpan) {
  const center = Array(n).fill(0);
  const half = Array(n).fill(0);
  mazeAxes.forEach((axis, k) => {
    const [low, high] = [voxelCentre(voxelFrom[k]) - VOXEL / 2, voxelCentre(voxelTo[k]) + VOXEL / 2];
    center[axis] = (low + high) / 2;
    half[axis] = (high - low) / 2;
  });
  if (verticalSpan) {
    center[1] = (verticalSpan[0] + verticalSpan[1]) / 2;
    half[1] = (verticalSpan[1] - verticalSpan[0]) / 2;
  }
  return { center, half };
}

function buildMaze({ n, mazeAxes, flying }) {
  const maze = carve(mazeAxes.length, seededRandom(SEED + n));
  const verticalSpan = flying ? null : [0, WALL_HEIGHT];
  const walls = wallRuns(maze, mazeAxes.length).map(({ from, to }) => placeInWorld(n, mazeAxes, from, to, verticalSpan));
  const startVoxel = Array(mazeAxes.length).fill(1);
  const goalVoxel = Array(mazeAxes.length).fill(farCorner);
  const goal = placeInWorld(n, mazeAxes, goalVoxel, goalVoxel, verticalSpan && [0, WALL_HEIGHT]);
  const start = Array(n).fill(0);
  mazeAxes.forEach((axis, k) => (start[axis] = voxelCentre(startVoxel[k])));
  if (flying) start[1] -= VOXEL / 2 - 0.1;
  const extent = (CELLS_PER_AXIS + 0.5) * VOXEL;
  return {
    n,
    start,
    walls,
    goal,
    flying,
    floor: flying ? null : { center: Array(n).fill(0).map((_, axis) => (axis === 1 ? -0.25 : 0)), half: Array(n).fill(extent).map((h, axis) => (axis === 1 ? 0.25 : h)) },
  };
}

export const MAZES = {
  3: buildMaze({ n: 3, mazeAxes: [0, 1, 2], flying: true }),
  4: buildMaze({ n: 4, mazeAxes: [0, 2, 3], flying: false }),
};
