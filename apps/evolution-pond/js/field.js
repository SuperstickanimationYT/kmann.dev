const DIFFUSION = 0.2;
const SINKING = 0.004;
const UPWELLING = 0.03;
const UPWELLING_HALF_WIDTH = 3;

export class NutrientField {
  constructor(width, height, cellSize, upwellingXs) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.values = new Float32Array(this.cols * this.rows);
    this.next = new Float32Array(this.cols * this.rows);
    this.upwellingColumns = new Uint8Array(this.cols);
    this.moveUpwellings(upwellingXs);
  }

  moveUpwellings(xs) {
    this.upwellingColumns.fill(0);
    for (const x of xs) {
      const centre = Math.floor(x / this.cellSize);
      for (let offset = -UPWELLING_HALF_WIDTH; offset <= UPWELLING_HALF_WIDTH; offset++) {
        this.upwellingColumns[(((centre + offset) % this.cols) + this.cols) % this.cols] = 1;
      }
    }
  }

  fill(total) {
    this.values.fill(total / this.values.length);
  }

  total() {
    let sum = 0;
    for (const value of this.values) sum += value;
    return sum;
  }

  indexAt(x, y) {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return row * this.cols + col;
  }

  densityAt(x, y) {
    return this.values[this.indexAt(x, y)];
  }

  take(x, y, wanted) {
    const index = this.indexAt(x, y);
    const taken = Math.min(wanted, this.values[index]);
    this.values[index] -= taken;
    return taken;
  }

  add(x, y, amount) {
    this.values[this.indexAt(x, y)] += amount;
  }

  step() {
    const { cols, rows, values, next } = this;
    for (let row = 0; row < rows; row++) {
      const above = row > 0 ? -cols : 0;
      const below = row < rows - 1 ? cols : 0;
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const left = col > 0 ? index - 1 : index + cols - 1;
        const right = col < cols - 1 ? index + 1 : index - cols + 1;
        const here = values[index];
        next[index] = here + DIFFUSION * (values[left] + values[right] + values[index + above] + values[index + below] - 4 * here);
      }
    }
    values.set(next);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        const rising = this.upwellingColumns[col];
        const target = rising ? (row > 0 ? index - cols : -1) : (row < rows - 1 ? index + cols : -1);
        if (target < 0) continue;
        const moved = values[index] * (rising ? UPWELLING : SINKING);
        next[index] -= moved;
        next[target] += moved;
      }
    }
    values.set(next);
  }
}
