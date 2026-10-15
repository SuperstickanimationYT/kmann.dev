import { OFF_BOARD } from './plane.js';

const MIN_CELL = 0.05;
const MAX_CELL = 64;
const GRID_FROM = 9;
const READOUT_CLEARANCE = 112;

const rgba = (hex) => {
  const value = parseInt(hex.slice(1), 16);
  return (255 << 24) | ((value & 0xff) << 16) | (value & 0xff00) | (value >> 16);
};

const COLOURS = {
  outside: rgba('#000000'),
  dead: rgba('#06121f'),
  deadDisturbed: rgba('#12304f'),
  liveEther: rgba('#194a75'),
  live: rgba('#5fe3ff'),
};

export class View {
  constructor(canvas, { onDraw, onCameraMove, onSelect, onPaste }) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.image = document.createElement('canvas');
    this.imageContext = this.image.getContext('2d');
    this.camera = { x: 0, y: 0, cell: 8 };
    this.follow = true;
    this.tool = 'move';
    this.dimEther = true;
    this.onDraw = onDraw;
    this.onCameraMove = onCameraMove;
    this.onSelect = onSelect;
    this.onPaste = onPaste;
    this.selection = null;
    this.pasting = null;
    this.hover = null;
    this.pointers = new Map();
    this.listen();
  }

  setWorld(world, dimensions) {
    this.world = world;
    this.dimensions = dimensions;
  }

  get size() {
    const box = this.canvas.getBoundingClientRect();
    return { width: box.width, height: box.height };
  }

  resize() {
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = this.size;
    this.canvas.width = Math.max(1, Math.round(width * ratio));
    this.canvas.height = Math.max(1, Math.round(height * ratio));
  }

  toWorld(screenX, screenY) {
    const { width, height } = this.size;
    return {
      x: this.camera.x + (screenX - width / 2) / this.camera.cell,
      y: this.camera.y + (screenY - height / 2) / this.camera.cell,
    };
  }

  lineSpan(slack) {
    if (this.world.board) return { lo: 0, width: this.world.board.width };
    const { left, right } = this.activeColumns();
    const width = Math.max((right - left) * slack + 80, 160);
    return { lo: (left + right) / 2 - width / 2, width };
  }

  activeColumns() {
    const row = this.world.latest;
    const first = row.ether.indexOf(0);
    if (first < 0) return { left: row.lo, right: row.lo + row.cells.length };
    return { left: row.lo + first, right: row.lo + row.ether.lastIndexOf(0) + 1 };
  }

  showLineSpan({ lo, width }) {
    this.camera.cell = clamp(this.size.width / width, MIN_CELL, MAX_CELL);
    this.camera.x = lo + width / 2;
  }

  fit() {
    const { width, height } = this.size;
    if (this.dimensions === 1) {
      this.showLineSpan(this.lineSpan(1));
      this.follow = true;
      return;
    }
    const bounds = this.world.bounds() ?? { x: -32, y: -32, width: 64, height: 64 };
    const margin = this.world.board ? 1 : 1.2;
    this.camera.cell = clamp(Math.min(width / (bounds.width * margin), height / (bounds.height * margin)), MIN_CELL, MAX_CELL);
    this.camera.x = bounds.x + bounds.width / 2;
    this.camera.y = bounds.y + bounds.height / 2;
  }

  followLatest() {
    if (this.dimensions !== 1 || !this.follow) return;
    if (!this.world.board) this.keepActiveColumnsInView();
    const halfRows = this.size.height / 2 / this.camera.cell;
    const clearOfReadout = (this.size.height / 2 - READOUT_CLEARANCE) / this.camera.cell;
    this.camera.y = Math.max(this.world.firstGeneration + clearOfReadout, this.world.generation + 1 - halfRows);
  }

  keepActiveColumnsInView() {
    const { left, right } = this.activeColumns();
    const halfColumns = this.size.width / 2 / this.camera.cell;
    const inView = left >= this.camera.x - halfColumns && right <= this.camera.x + halfColumns;
    if (!inView) this.showLineSpan(this.lineSpan(1.5));
  }

  render() {
    this.followLatest();
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = this.canvas;
    const cell = this.camera.cell * ratio;
    const left = this.camera.x - width / 2 / cell;
    const top = this.camera.y - height / 2 / cell;
    const stride = cell >= 1 ? 1 : 1 / cell;
    const x0 = Math.floor(left);
    const y0 = Math.floor(top);
    const columns = cell >= 1 ? Math.ceil(width / cell) + 1 : width;
    const rows = cell >= 1 ? Math.ceil(height / cell) + 1 : height;

    if (this.image.width !== columns || this.image.height !== rows) {
      this.image.width = columns;
      this.image.height = rows;
    }
    const pixels = this.imageContext.createImageData(columns, rows);
    const out = new Uint32Array(pixels.data.buffer);
    if (this.dimensions === 1) this.paintLine(out, x0, y0, columns, rows, stride);
    else this.paintPlane(out, x0, y0, columns, rows, stride);
    this.imageContext.putImageData(pixels, 0, 0);

    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = false;
    const offsetX = (x0 - left) * cell;
    const offsetY = (y0 - top) * cell;
    if (stride === 1) context.drawImage(this.image, offsetX, offsetY, columns * cell, rows * cell);
    else context.drawImage(this.image, 0, 0, width, height);
    if (cell >= GRID_FROM) this.drawGrid(offsetX, offsetY, cell, columns, rows);
    if (this.selection) this.drawSelection(cell);
    if (this.pasting && this.hover) this.drawGhost(cell);
  }

  toScreen(x, y, cell) {
    return {
      x: (x - this.camera.x) * cell + this.canvas.width / 2,
      y: (y - this.camera.y) * cell + this.canvas.height / 2,
    };
  }

  rowSpan(top, bottom) {
    return this.dimensions === 1 ? { top: this.world.generation, bottom: this.world.generation + 1 } : { top, bottom };
  }

  drawSelection(cell) {
    const { left, right } = this.selection;
    const { top, bottom } = this.rowSpan(this.selection.top, this.selection.bottom);
    const from = this.toScreen(left, top, cell);
    const to = this.toScreen(right, bottom, cell);
    const context = this.context;
    context.fillStyle = 'rgba(95, 227, 255, 0.12)';
    context.strokeStyle = '#5fe3ff';
    context.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    context.setLineDash([6, 4]);
    const height = Math.max(to.y - from.y, 3);
    context.fillRect(from.x, from.y, to.x - from.x, height);
    context.strokeRect(Math.round(from.x) + 0.5, Math.round(from.y) + 0.5, Math.round(to.x - from.x), Math.round(height));
    context.setLineDash([]);
  }

  pasteOrigin() {
    const { width, height, snap = 1 } = this.pasting;
    const top = this.dimensions === 1 ? this.world.generation : this.hover.y - Math.floor(height / 2);
    return { left: Math.round((this.hover.x - Math.floor(width / 2)) / snap) * snap, top };
  }

  drawGhost(cell) {
    const { width, height, cells } = this.pasting;
    const { left, top } = this.pasteOrigin();
    const context = this.context;
    const size = Math.max(cell, 1);
    context.fillStyle = 'rgba(255, 196, 92, 0.8)';
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!cells[y * width + x]) continue;
        const corner = this.toScreen(left + x, top + y, cell);
        context.fillRect(corner.x, corner.y, size, size);
      }
    }
    const from = this.toScreen(left, top, cell);
    context.strokeStyle = 'rgba(255, 196, 92, 0.9)';
    context.lineWidth = 1;
    context.strokeRect(Math.round(from.x) + 0.5, Math.round(from.y) + 0.5, Math.round(width * cell), Math.round(Math.max(height * cell, 3)));
  }

  colour(value, ether) {
    if (value === OFF_BOARD) return COLOURS.outside;
    if (!this.dimEther) return value ? COLOURS.live : COLOURS.dead;
    if (value) return ether ? COLOURS.liveEther : COLOURS.live;
    return ether ? COLOURS.dead : COLOURS.deadDisturbed;
  }

  paintLine(out, x0, y0, columns, rows, stride) {
    const world = this.world;
    for (let r = 0; r < rows; r += 1) {
      const row = world.rowAt(y0 + Math.floor(r * stride));
      const base = r * columns;
      if (!row) {
        out.fill(COLOURS.outside, base, base + columns);
        continue;
      }
      for (let c = 0; c < columns; c += 1) {
        const x = x0 + Math.floor(c * stride);
        const value = world.board && (x < 0 || x >= world.board.width) ? OFF_BOARD : world.valueAt(row, x);
        out[base + c] = this.colour(value, world.isEther(row, x));
      }
    }
  }

  paintPlane(out, x0, y0, columns, rows, stride) {
    const world = this.world;
    const masked = this.dimEther && stride === 1;
    const margin = masked ? Math.max(world.window.across, world.window.down) - 1 : 0;
    const wideColumns = columns + 2 * margin;
    const wideRows = rows + 2 * margin;
    const values = new Uint8Array(wideColumns * wideRows);
    world.sample(x0 - margin, y0 - margin, wideColumns, wideRows, stride, values);
    const mask = new Uint8Array(values.length);
    if (masked) world.etherMask(values, wideColumns, wideRows, mask);
    else mask.fill(1);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < columns; c += 1) {
        const index = (r + margin) * wideColumns + c + margin;
        out[r * columns + c] = this.colour(values[index], mask[index]);
      }
    }
  }

  drawGrid(offsetX, offsetY, cell, columns, rows) {
    const context = this.context;
    context.strokeStyle = 'rgba(95, 227, 255, 0.07)';
    context.lineWidth = 1;
    context.beginPath();
    for (let c = 0; c <= columns; c += 1) {
      const x = Math.round(offsetX + c * cell) + 0.5;
      context.moveTo(x, 0);
      context.lineTo(x, this.canvas.height);
    }
    for (let r = 0; r <= rows; r += 1) {
      const y = Math.round(offsetY + r * cell) + 0.5;
      context.moveTo(0, y);
      context.lineTo(this.canvas.width, y);
    }
    context.stroke();
  }

  zoomAt(screenX, screenY, factor) {
    const before = this.toWorld(screenX, screenY);
    this.camera.cell = clamp(this.camera.cell * factor, MIN_CELL, MAX_CELL);
    const after = this.toWorld(screenX, screenY);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
    if (this.dimensions === 1) this.follow = false;
    this.onCameraMove();
  }

  panBy(screenDx, screenDy) {
    this.camera.x -= screenDx / this.camera.cell;
    this.camera.y -= screenDy / this.camera.cell;
    if (this.dimensions === 1 && screenDy) this.follow = false;
    this.onCameraMove();
  }

  listen() {
    const canvas = this.canvas;
    const local = (event) => {
      const box = canvas.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const { x, y } = local(event);
      this.zoomAt(x, y, Math.exp(-event.deltaY * 0.0015));
    }, { passive: false });

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      const point = local(event);
      const primary = event.button === 0 && this.pointers.size === 0;
      let action = 'pan';
      if (primary && this.pasting) {
        this.hover = this.cellAt(point);
        const { left, top } = this.pasteOrigin();
        this.onPaste(left, top);
        action = 'none';
      } else if (primary && this.tool === 'draw') {
        action = 'draw';
        this.drawAt(point, true);
      } else if (primary && this.tool === 'select') {
        action = 'select';
        this.selectFrom = this.cellAt(point);
        this.selectTo(point);
      }
      this.pointers.set(event.pointerId, { ...point, action });
    });

    canvas.addEventListener('pointermove', (event) => {
      const point = local(event);
      if (this.pasting) {
        this.hover = this.cellAt(point);
        this.onCameraMove();
      }
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      if (previous.action === 'none') return;
      if (previous.action === 'draw') {
        this.strokeTo(previous, point);
      } else if (previous.action === 'select') {
        this.selectTo(point);
      } else if (this.pointers.size === 2) {
        const [other] = [...this.pointers].filter(([id]) => id !== event.pointerId).map(([, value]) => value);
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(point.x - other.x, point.y - other.y);
        if (before > 0) this.zoomAt((point.x + other.x) / 2, (point.y + other.y) / 2, after / before);
        this.panBy((point.x - previous.x) / 2, (point.y - previous.y) / 2);
      } else {
        this.panBy(point.x - previous.x, point.y - previous.y);
      }
      this.pointers.set(event.pointerId, { ...point, action: previous.action });
    });

    const release = (event) => this.pointers.delete(event.pointerId);
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  cellAt(point) {
    const { x, y } = this.toWorld(point.x, point.y);
    return { x: Math.floor(x), y: Math.floor(y) };
  }

  selectTo(point) {
    const end = this.cellAt(point);
    const start = this.selectFrom;
    this.selection = {
      left: Math.min(start.x, end.x),
      right: Math.max(start.x, end.x) + 1,
      top: Math.min(start.y, end.y),
      bottom: Math.max(start.y, end.y) + 1,
    };
    this.onSelect(this.selection);
  }

  strokeTo(from, to) {
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / Math.max(1, this.camera.cell / 2)));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      this.drawAt({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, false);
    }
  }

  drawAt(point, first) {
    const { x, y } = this.toWorld(point.x, point.y);
    this.onDraw(Math.floor(x), Math.floor(y), first);
  }
}

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}
