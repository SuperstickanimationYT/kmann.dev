import { mod, planeWindowTable, stepPlaneTile } from './background.js';

export const OFF_BOARD = 2;
const CHUNK = 32;
const PADDED = CHUNK + 2;
const KEY_OFFSET = 2 ** 20;
const KEY_SPAN = 2 ** 21;

const chunkKey = (cx, cy) => (cx + KEY_OFFSET) * KEY_SPAN + (cy + KEY_OFFSET);
const chunkX = (key) => Math.floor(key / KEY_SPAN) - KEY_OFFSET;
const chunkY = (key) => (key % KEY_SPAN) - KEY_OFFSET;

export class PlaneWorld {
  constructor({ table, board, background }) {
    this.table = table;
    this.board = board;
    this.tile = { width: background.width, height: background.height, cells: background.phases[0] };
    this.window = planeWindowTable(background);
    this.generation = 0;
    this.padded = new Uint8Array(PADDED * PADDED);
    if (board) {
      this.cells = new Uint8Array(board.width * board.height);
      for (let y = 0; y < board.height; y += 1) {
        for (let x = 0; x < board.width; x += 1) this.cells[y * board.width + x] = this.backgroundAt(x, y);
      }
      this.boardPadded = new Uint8Array((board.width + 2) * (board.height + 2));
    } else {
      this.chunks = new Map();
    }
    this.backgroundChunks = new Map();
  }

  backgroundAt(x, y, tile = this.tile) {
    return tile.cells[mod(y, tile.height) * tile.width + mod(x, tile.width)];
  }

  get(x, y) {
    if (this.board) {
      const { width, height, wrap } = this.board;
      if (x >= 0 && y >= 0 && x < width && y < height) return this.cells[y * width + x];
      return wrap ? this.cells[mod(y, height) * width + mod(x, width)] : OFF_BOARD;
    }
    const chunk = this.chunks.get(chunkKey(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    return chunk ? chunk[mod(y, CHUNK) * CHUNK + mod(x, CHUNK)] : this.backgroundAt(x, y);
  }

  set(x, y, value) {
    if (this.board) {
      const { width, height } = this.board;
      if (x >= 0 && y >= 0 && x < width && y < height) this.cells[y * width + x] = value;
      return;
    }
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = this.backgroundChunk(cx, cy, this.tile, this.backgroundChunks).slice();
      this.chunks.set(key, chunk);
    }
    chunk[mod(y, CHUNK) * CHUNK + mod(x, CHUNK)] = value;
  }

  backgroundChunk(cx, cy, tile, cache) {
    const ox = mod(cx * CHUNK, tile.width);
    const oy = mod(cy * CHUNK, tile.height);
    const key = oy * tile.width + ox;
    let chunk = cache.get(key);
    if (!chunk) {
      chunk = new Uint8Array(CHUNK * CHUNK);
      for (let y = 0; y < CHUNK; y += 1) {
        for (let x = 0; x < CHUNK; x += 1) chunk[y * CHUNK + x] = this.backgroundAt(ox + x, oy + y, tile);
      }
      cache.set(key, chunk);
    }
    return chunk;
  }

  step() {
    const nextCells = stepPlaneTile(this.tile.cells, this.tile.width, this.tile.height, this.table);
    const nextTile = { ...this.tile, cells: nextCells };
    if (this.board) this.stepBoard();
    else this.stepEndless(nextTile);
    this.tile = nextTile;
    this.backgroundChunks = new Map();
    this.generation += 1;
  }

  stepBoard() {
    const { width, height, wrap } = this.board;
    const cells = this.cells;
    const padded = this.boardPadded;
    const stride = width + 2;
    for (let py = 0; py < height + 2; py += 1) {
      const y = py - 1;
      const inside = y >= 0 && y < height;
      for (let px = 0; px < width + 2; px += 1) {
        const x = px - 1;
        if (inside && x >= 0 && x < width) padded[py * stride + px] = cells[y * width + x];
        else padded[py * stride + px] = wrap ? cells[mod(y, height) * width + mod(x, width)] : 0;
      }
    }
    const next = new Uint8Array(cells.length);
    this.nextFromPadded(padded, stride, width, height, next);
    this.cells = next;
  }

  nextFromPadded(padded, stride, width, height, out) {
    const table = this.table;
    for (let y = 0; y < height; y += 1) {
      let i = (y + 1) * stride + 1;
      for (let x = 0; x < width; x += 1, i += 1) {
        const count = padded[i - stride - 1] + padded[i - stride] + padded[i - stride + 1]
          + padded[i - 1] + padded[i + 1]
          + padded[i + stride - 1] + padded[i + stride] + padded[i + stride + 1];
        out[y * width + x] = table[padded[i] * 9 + count];
      }
    }
  }

  stepEndless(nextTile) {
    const todo = new Set();
    for (const key of this.chunks.keys()) {
      const cx = chunkX(key);
      const cy = chunkY(key);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) todo.add(chunkKey(cx + dx, cy + dy));
      }
    }
    const nextBackgrounds = new Map();
    const nextChunks = new Map();
    const sources = new Array(9);
    for (const key of todo) {
      const cx = chunkX(key);
      const cy = chunkY(key);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          sources[(dy + 1) * 3 + dx + 1] = this.chunks.get(chunkKey(cx + dx, cy + dy))
            ?? this.backgroundChunk(cx + dx, cy + dy, this.tile, this.backgroundChunks);
        }
      }
      this.fillPadded(sources);
      const next = new Uint8Array(CHUNK * CHUNK);
      this.nextFromPadded(this.padded, PADDED, CHUNK, CHUNK, next);
      const background = this.backgroundChunk(cx, cy, nextTile, nextBackgrounds);
      if (!sameCells(next, background)) nextChunks.set(key, next);
    }
    this.chunks = nextChunks;
  }

  fillPadded(sources) {
    const padded = this.padded;
    for (let py = 0; py < PADDED; py += 1) {
      const sy = py - 1;
      const oy = sy < 0 ? -1 : sy >= CHUNK ? 1 : 0;
      const row = (sy - oy * CHUNK) * CHUNK;
      for (let px = 0; px < PADDED; px += 1) {
        const sx = px - 1;
        const ox = sx < 0 ? -1 : sx >= CHUNK ? 1 : 0;
        padded[py * PADDED + px] = sources[(oy + 1) * 3 + ox + 1][row + sx - ox * CHUNK];
      }
    }
  }

  readRegion({ left, top, right, bottom }) {
    const width = right - left;
    const height = bottom - top;
    const cells = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) cells[y * width + x] = this.get(left + x, top + y) & 1;
    }
    return { width, height, cells };
  }

  writeRegion(left, top, { width, height, cells, opaque }) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = cells[y * width + x];
        if (opaque || value) this.set(left + x, top + y, value);
      }
    }
    if (!this.board) this.dropBackgroundChunks();
  }

  clearRegion({ left, top, right, bottom }) {
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) this.set(x, y, this.backgroundAt(x, y));
    }
    if (!this.board) this.dropBackgroundChunks();
  }

  dropBackgroundChunks() {
    for (const [key, chunk] of this.chunks) {
      if (sameCells(chunk, this.backgroundChunk(chunkX(key), chunkY(key), this.tile, this.backgroundChunks))) this.chunks.delete(key);
    }
  }

  offBackground() {
    let count = 0;
    if (this.board) {
      const { width, height } = this.board;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) if (this.cells[y * width + x] !== this.backgroundAt(x, y)) count += 1;
      }
      return count;
    }
    for (const [key, chunk] of this.chunks) {
      const background = this.backgroundChunk(chunkX(key), chunkY(key), this.tile, this.backgroundChunks);
      for (let i = 0; i < chunk.length; i += 1) if (chunk[i] !== background[i]) count += 1;
    }
    return count;
  }

  bounds() {
    if (this.board) return { x: 0, y: 0, width: this.board.width, height: this.board.height };
    if (!this.chunks.size) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const key of this.chunks.keys()) {
      left = Math.min(left, chunkX(key));
      top = Math.min(top, chunkY(key));
      right = Math.max(right, chunkX(key) + 1);
      bottom = Math.max(bottom, chunkY(key) + 1);
    }
    return { x: left * CHUNK, y: top * CHUNK, width: (right - left) * CHUNK, height: (bottom - top) * CHUNK };
  }

  sample(left, top, columns, rows, stride, out) {
    let i = 0;
    for (let row = 0; row < rows; row += 1) {
      const y = top + Math.floor(row * stride);
      if (this.board) {
        for (let column = 0; column < columns; column += 1) out[i++] = this.boardCell(left + Math.floor(column * stride), y);
        continue;
      }
      const cy = Math.floor(y / CHUNK);
      const rowOffset = mod(y, CHUNK) * CHUNK;
      let cx = NaN;
      let chunk = null;
      for (let column = 0; column < columns; column += 1) {
        const x = left + Math.floor(column * stride);
        const nextCx = Math.floor(x / CHUNK);
        if (nextCx !== cx) {
          cx = nextCx;
          chunk = this.chunks.get(chunkKey(cx, cy)) ?? this.backgroundChunk(cx, cy, this.tile, this.backgroundChunks);
        }
        out[i++] = chunk[rowOffset + x - cx * CHUNK];
      }
    }
  }

  boardCell(x, y) {
    const { width, height } = this.board;
    return x >= 0 && y >= 0 && x < width && y < height ? this.cells[y * width + x] : OFF_BOARD;
  }

  etherMask(values, columns, rows, mask) {
    const { across, down, table } = this.window;
    mask.fill(0);
    for (let y = 0; y + down <= rows; y += 1) {
      for (let x = 0; x + across <= columns; x += 1) {
        let key = 0;
        let valid = true;
        for (let dy = 0; dy < down && valid; dy += 1) {
          const base = (y + dy) * columns + x;
          for (let dx = 0; dx < across; dx += 1) {
            const value = values[base + dx];
            if (value === OFF_BOARD) {
              valid = false;
              break;
            }
            key = (key << 1) | value;
          }
        }
        if (!valid || !table[key]) continue;
        for (let dy = 0; dy < down; dy += 1) mask.fill(1, (y + dy) * columns + x, (y + dy) * columns + x + across);
      }
    }
  }
}

function sameCells(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}
