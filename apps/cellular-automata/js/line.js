import { lineWindowTable, mod, stepLineCycle } from './background.js';

const OFF_BOARD = 2;
const HISTORY_CELL_BUDGET = 24_000_000;

export class LineWorld {
  constructor({ table, board, background }) {
    this.table = table;
    this.board = board;
    this.window = lineWindowTable(background);
    this.rows = [];
    this.firstGeneration = 0;
    this.storedCells = 0;
    const phase = background.phases[0];
    const cells = board ? Uint8Array.from({ length: board.width }, (_, x) => phase[x % phase.length]) : new Uint8Array(0);
    this.push({ lo: 0, cells, background: phase });
  }

  get latest() {
    return this.rows.at(-1);
  }

  get generation() {
    return this.firstGeneration + this.rows.length - 1;
  }

  rowAt(generation) {
    return this.rows[generation - this.firstGeneration];
  }

  push(row) {
    row.ether = this.etherMask(row);
    this.rows.push(row);
    this.storedCells += row.cells.length;
    while (this.storedCells > HISTORY_CELL_BUDGET && this.rows.length > 2) {
      this.storedCells -= this.rows.shift().cells.length;
      this.firstGeneration += 1;
    }
  }

  valueAt(row, x) {
    const index = x - row.lo;
    if (index >= 0 && index < row.cells.length) return row.cells[index];
    if (!this.board) return row.background[mod(x, row.background.length)];
    if (this.board.wrap) return row.cells[mod(x, this.board.width)];
    return OFF_BOARD;
  }

  isEther(row, x) {
    const index = x - row.lo;
    if (index >= 0 && index < row.cells.length) return row.ether[index];
    return this.board ? 0 : 1;
  }

  step() {
    const row = this.latest;
    const background = stepLineCycle(row.background, this.table);
    this.push(this.board ? this.stepBoard(row, background) : this.stepEndless(row, background));
  }

  stepBoard(row, background) {
    const { width, wrap } = this.board;
    const cells = row.cells;
    const next = new Uint8Array(width);
    const edge = (x) => (wrap ? cells[mod(x, width)] : 0);
    for (let x = 0; x < width; x += 1) {
      const left = x > 0 ? cells[x - 1] : edge(-1);
      const right = x < width - 1 ? cells[x + 1] : edge(width);
      next[x] = this.table[(left << 2) | (cells[x] << 1) | right];
    }
    return { lo: 0, cells: next, background };
  }

  stepEndless(row, background) {
    const size = row.cells.length;
    const padded = new Uint8Array(size + 4);
    for (let i = 0; i < padded.length; i += 1) padded[i] = this.valueAt(row, row.lo - 2 + i);
    const next = new Uint8Array(size + 2);
    for (let i = 0; i < next.length; i += 1) {
      next[i] = this.table[(padded[i] << 2) | (padded[i + 1] << 1) | padded[i + 2]];
    }
    return trimToBackground({ lo: row.lo - 1, cells: next, background });
  }

  toggle(x) {
    const row = this.latest;
    if (this.board) {
      if (x < 0 || x >= this.board.width) return;
    } else if (x < row.lo || x >= row.lo + row.cells.length) {
      widenTo(row, x, this);
    }
    row.cells[x - row.lo] ^= 1;
    if (!this.board) Object.assign(row, trimToBackground(row));
    row.ether = this.etherMask(row);
  }

  fill(from, to, chooseValue) {
    const row = this.latest;
    if (!this.board) {
      widenTo(row, from, this);
      widenTo(row, to - 1, this);
    }
    for (let x = Math.max(from, row.lo); x < Math.min(to, row.lo + row.cells.length); x += 1) {
      row.cells[x - row.lo] = chooseValue(x);
    }
    if (!this.board) Object.assign(row, trimToBackground(row));
    row.ether = this.etherMask(row);
  }

  readRegion({ left, right }) {
    const row = this.latest;
    const cells = Uint8Array.from({ length: right - left }, (_, i) => this.valueAt(row, left + i) & 1);
    return { width: right - left, height: 1, cells };
  }

  writeRegion(left, top, { width, cells, opaque }) {
    const row = this.latest;
    this.fill(left, left + width, (x) => (opaque || cells[x - left] ? cells[x - left] : this.valueAt(row, x)));
  }

  clearRegion({ left, right }) {
    const { background } = this.latest;
    this.fill(left, right, (x) => background[mod(x, background.length)]);
  }

  offBackground(row = this.latest) {
    let count = 0;
    for (let i = 0; i < row.cells.length; i += 1) {
      if (row.cells[i] !== row.background[mod(row.lo + i, row.background.length)]) count += 1;
    }
    return count;
  }

  etherMask(row) {
    const { span, table } = this.window;
    const size = row.cells.length;
    const mask = new Uint8Array(size);
    const start = row.lo - span + 1;
    const keyMask = (1 << span) - 1;
    let key = 0;
    let offBoard = 0;
    let markedUntil = 0;
    const values = [];
    for (let k = 0; k < size + 2 * (span - 1); k += 1) {
      const value = this.valueAt(row, start + k);
      values.push(value);
      key = ((key << 1) | (value & 1)) & keyMask;
      if (value === OFF_BOARD) offBoard += 1;
      if (k >= span && values[k - span] === OFF_BOARD) offBoard -= 1;
      if (k < span - 1 || offBoard || !table[key]) continue;
      const first = Math.max(k - span + 1, markedUntil);
      for (let j = first; j <= k; j += 1) {
        const index = j - (span - 1);
        if (index >= 0 && index < size) mask[index] = 1;
      }
      markedUntil = k + 1;
    }
    return mask;
  }
}

function widenTo(row, x, world) {
  const lo = Math.min(row.lo, x);
  const hi = Math.max(row.lo + row.cells.length, x + 1);
  const cells = new Uint8Array(hi - lo);
  for (let i = 0; i < cells.length; i += 1) cells[i] = world.valueAt(row, lo + i);
  row.lo = lo;
  row.cells = cells;
}

function trimToBackground(row) {
  const { cells, background, lo } = row;
  const period = background.length;
  let start = 0;
  let end = cells.length;
  while (start < end && cells[start] === background[mod(lo + start, period)]) start += 1;
  while (end > start && cells[end - 1] === background[mod(lo + end - 1, period)]) end -= 1;
  return { lo: lo + start, cells: cells.slice(start, end), background };
}
