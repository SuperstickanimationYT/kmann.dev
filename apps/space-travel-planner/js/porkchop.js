import { routeOrNull } from './transfer.js';

export const METRIC_KEYS = ['c3', 'arrivalSpeed', 'totalDeltaV'];
export const DIRECT_GRID = { columns: 140, rows: 110 };
export const FLYBY_GRID = { columns: 100, rows: 80 };

export function departAt(grid, column) {
  return grid.departStart + (grid.departDays * column) / (grid.columns - 1);
}

export function flightAt(grid, row) {
  return grid.flightMin + ((grid.flightMax - grid.flightMin) * row) / (grid.rows - 1);
}

export function porkchopGrid(spec) {
  const cells = spec.columns * spec.rows;
  const grid = { ...spec, flybyJd: new Float64Array(cells), ...Object.fromEntries(METRIC_KEYS.map((key) => [key, new Float64Array(cells)])) };
  for (let row = 0; row < grid.rows; row++) {
    const flightDays = flightAt(grid, row);
    for (let column = 0; column < grid.columns; column++) {
      const route = routeOrNull({ from: spec.from, via: spec.via, to: spec.to, departJd: departAt(grid, column), flightDays });
      const index = row * grid.columns + column;
      for (const key of METRIC_KEYS) grid[key][index] = route ? route[key] : NaN;
      grid.flybyJd[index] = route?.flybyJd ?? NaN;
    }
  }
  return grid;
}

export function gridBuffers(grid) {
  return [grid.flybyJd.buffer, ...METRIC_KEYS.map((key) => grid[key].buffer)];
}

export function lowestIndex(values) {
  let best = -1;
  for (let index = 0; index < values.length; index++) {
    if (Number.isFinite(values[index]) && (best < 0 || values[index] < values[best])) best = index;
  }
  return best;
}
