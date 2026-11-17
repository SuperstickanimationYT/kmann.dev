import { directTransferOrNull } from './transfer.js';

export function departAt(grid, column) {
  return grid.departStart + (grid.departDays * column) / (grid.columns - 1);
}

export function flightAt(grid, row) {
  return grid.flightMin + ((grid.flightMax - grid.flightMin) * row) / (grid.rows - 1);
}

export function porkchopGrid(spec) {
  const grid = { ...spec, c3: new Float64Array(spec.columns * spec.rows), arrivalSpeed: new Float64Array(spec.columns * spec.rows) };
  for (let row = 0; row < grid.rows; row++) {
    const flight = flightAt(grid, row);
    for (let column = 0; column < grid.columns; column++) {
      const depart = departAt(grid, column);
      const transfer = directTransferOrNull(spec.from, spec.to, depart, depart + flight);
      const index = row * grid.columns + column;
      grid.c3[index] = transfer ? transfer.c3 : NaN;
      grid.arrivalSpeed[index] = transfer ? transfer.arrivalSpeed : NaN;
    }
  }
  return grid;
}

export function lowestIndex(values) {
  let best = -1;
  for (let index = 0; index < values.length; index++) {
    if (Number.isFinite(values[index]) && (best < 0 || values[index] < values[best])) best = index;
  }
  return best;
}
