const LUMA = [0.2126, 0.7152, 0.0722];
const MAD_TO_SIGMA = 1.4826;
const STAT_SAMPLES = 200000;
const CELL_SAMPLES = 600;
const MODEL_STEP = 16;
const BRIGHT_REJECT_SIGMA = 2.5;
const DARK_REJECT_SIGMA = 3;
const FIT_ROUNDS = 6;
const WHITE_PERCENTILE = 0.9995;
const HALO_DAMPING = 0.25;
const VIGNETTE_FLOOR = 0.5;
const COLOUR_SMOOTHING_CELLS = 1.2;
const CHROMA_NOISE_RADIUS = 0.0025;
const LOCAL_CLIP_ROUNDS = 3;
const LOCAL_CLIP_FRACTION = 0.4;

export const LOCAL_COLUMNS = 120;

export const CELL_USED = 0;
export const CELL_REJECTED = 1;
export const CELL_EXCLUDED = 2;
export const CELL_FORCED = 3;

export const DEFAULT_SETTINGS = {
  removeBackground: true,
  flattenVignetting: true,
  evenColour: 1,
  skyModel: 'local',
  blurSize: 0.06,
  degree: 3,
  background: 0.12,
  blackPoint: 2,
  boost: 0.5,
  saturation: 1.25,
  noise: 0.4,
};

export const PLAIN_STRETCH = { removeBackground: false, boost: 0, saturation: 1, noise: 0 };

function luma(r, g, b) {
  return LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function median(values) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[sorted.length >> 1] : 0;
}

function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

export function workingCopy(image, maxEdge) {
  const bin = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxEdge));
  const width = Math.floor(image.width / bin);
  const height = Math.floor(image.height / bin);
  const matrix = image.toLinearSrgb;
  const rgb = new Float32Array(width * height * 3);
  const area = bin * bin;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let dy = 0; dy < bin; dy++) {
        let at = ((y * bin + dy) * image.width + x * bin) * 3;
        for (let dx = 0; dx < bin; dx++, at += 3) {
          r += image.rgb[at];
          g += image.rgb[at + 1];
          b += image.rgb[at + 2];
        }
      }
      r /= area;
      g /= area;
      b /= area;
      const to = (y * width + x) * 3;
      rgb[to] = matrix[0] * r + matrix[1] * g + matrix[2] * b;
      rgb[to + 1] = matrix[3] * r + matrix[4] * g + matrix[5] * b;
      rgb[to + 2] = matrix[6] * r + matrix[7] * g + matrix[8] * b;
    }
  }
  return { width, height, rgb };
}

export function measureCells(image, columns) {
  const { width, height, rgb } = image;
  const rows = Math.max(4, Math.round((columns * height) / width));
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x0 = Math.floor((col * width) / columns);
      const x1 = Math.floor(((col + 1) * width) / columns);
      const y0 = Math.floor((row * height) / rows);
      const y1 = Math.floor(((row + 1) * height) / rows);
      const stride = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / CELL_SAMPLES)));
      const channels = [[], [], []];
      for (let y = y0; y < y1; y += stride) {
        for (let x = x0; x < x1; x += stride) {
          const at = (y * width + x) * 3;
          channels[0].push(rgb[at]);
          channels[1].push(rgb[at + 1]);
          channels[2].push(rgb[at + 2]);
        }
      }
      cells.push({
        col, row,
        x0, y0, x1, y1,
        u: ((x0 + x1) / width) - 1,
        v: ((y0 + y1) / height) - 1,
        values: channels.map(median),
      });
    }
  }
  return cells;
}

function polynomialTerms(degree) {
  const terms = [];
  for (let total = 0; total <= degree; total++) {
    for (let j = 0; j <= total; j++) terms.push([total - j, j]);
  }
  return terms;
}

function basis(u, v, terms) {
  return terms.map(([i, j]) => u ** i * v ** j);
}

function solveLinear(matrix, vector) {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const lead = a[col][col] || 1e-12;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col] / lead;
      for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
    }
  }
  return a.map((row, i) => row[n] / (row[i] || 1e-12));
}

function leastSquares(cells, states, terms) {
  const size = terms.length;
  const normal = Array.from({ length: size }, () => new Array(size).fill(0));
  const targets = [0, 1, 2].map(() => new Array(size).fill(0));
  cells.forEach((cell, index) => {
    if (states[index] !== CELL_USED && states[index] !== CELL_FORCED) return;
    const row = basis(cell.u, cell.v, terms);
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) normal[i][j] += row[i] * row[j];
      for (let c = 0; c < 3; c++) targets[c][i] += row[i] * cell.values[c];
    }
  });
  return targets.map((target) => solveLinear(normal, target));
}

function modelAt(coefficients, terms, u, v) {
  const row = basis(u, v, terms);
  return coefficients.map((channel) => channel.reduce((sum, weight, i) => sum + weight * row[i], 0));
}

export function fitBackground(cells, degree, overrides) {
  const terms = polynomialTerms(degree);
  const lumas = cells.map((cell) => luma(...cell.values));
  let states = cells.map((_, index) => overrides.get(index) ?? CELL_USED);
  let coefficients = leastSquares(cells, states, terms);

  for (let round = 0; round < FIT_ROUNDS; round++) {
    const residuals = cells.map((cell, index) => lumas[index] - luma(...modelAt(coefficients, terms, cell.u, cell.v)));
    const usedResiduals = residuals.filter((_, index) => states[index] === CELL_USED || states[index] === CELL_FORCED);
    const center = median(usedResiduals);
    const sigma = MAD_TO_SIGMA * median(usedResiduals.map((r) => Math.abs(r - center))) || 1e-6;
    const next = cells.map((_, index) => {
      if (overrides.has(index)) return overrides.get(index);
      const offset = residuals[index] - center;
      return offset > BRIGHT_REJECT_SIGMA * sigma || offset < -DARK_REJECT_SIGMA * sigma ? CELL_REJECTED : CELL_USED;
    });
    if (next.filter((state) => state === CELL_USED || state === CELL_FORCED).length < terms.length * 2) break;
    states = next;
    coefficients = leastSquares(cells, states, terms);
  }
  const isSky = states.map(isSkyState);
  return {
    kind: 'polynomial',
    terms,
    coefficients,
    states,
    level: median(lumas.filter((_, index) => isSky[index])),
    colourShifts: colourShiftGrid(cells, isSky, coefficients, terms),
  };
}

function gridShape(cells) {
  return { columns: cells.at(-1).col + 1, rows: cells.at(-1).row + 1 };
}

function isSkyState(state) {
  return state === CELL_USED || state === CELL_FORCED;
}

function gaussianKernel(spread) {
  const reach = Math.max(1, Math.ceil(3 * spread));
  return Array.from({ length: 2 * reach + 1 }, (_, i) => Math.exp(-((i - reach) ** 2) / (2 * spread ** 2)));
}

function convolveLines(src, dst, columns, rows, kernel, horizontal) {
  const reach = (kernel.length - 1) / 2;
  const lines = horizontal ? rows : columns;
  const length = horizontal ? columns : rows;
  for (let line = 0; line < lines; line++) {
    for (let i = 0; i < length; i++) {
      const sums = [0, 0, 0, 0];
      for (let k = -reach; k <= reach; k++) {
        const j = i + k;
        if (j < 0 || j >= length) continue;
        const cell = horizontal ? line * columns + j : j * columns + line;
        for (let c = 0; c < 4; c++) sums[c] += kernel[k + reach] * src[cell * 4 + c];
      }
      dst.set(sums, (horizontal ? line * columns + i : i * columns + line) * 4);
    }
  }
}

function smoothGrid(values, isSky, columns, rows, spread) {
  const cells = columns * rows;
  const weighted = new Float32Array(cells * 4);
  for (let cell = 0; cell < cells; cell++) {
    if (!isSky[cell]) continue;
    for (let c = 0; c < 3; c++) weighted[cell * 4 + c] = values[cell * 3 + c];
    weighted[cell * 4 + 3] = 1;
  }
  const kernel = gaussianKernel(spread);
  const across = new Float32Array(weighted.length);
  convolveLines(weighted, across, columns, rows, kernel, true);
  convolveLines(across, weighted, columns, rows, kernel, false);
  const smoothed = new Float32Array(cells * 3);
  for (let cell = 0; cell < cells; cell++) {
    const weight = weighted[cell * 4 + 3];
    for (let c = 0; c < 3; c++) smoothed[cell * 3 + c] = weight > 1e-9 ? weighted[cell * 4 + c] / weight : 0;
  }
  return { columns, rows, values: smoothed };
}

function colourShiftGrid(cells, isSky, coefficients, terms) {
  const { columns, rows } = gridShape(cells);
  const shifts = new Float32Array(columns * rows * 3);
  cells.forEach((cell, index) => {
    if (!isSky[index]) return;
    const glow = modelAt(coefficients, terms, cell.u, cell.v);
    const residual = cell.values.map((value, c) => value - glow[c]);
    const brightness = luma(...residual);
    for (let c = 0; c < 3; c++) shifts[(cell.row * columns + cell.col) * 3 + c] = residual[c] - brightness;
  });
  return smoothGrid(shifts, isSky, columns, rows, COLOUR_SMOOTHING_CELLS);
}

function catmullRom(p0, p1, p2, p3, t) {
  return p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
}

function sampleGrid(grid, u, v) {
  const gx = Math.min(grid.columns - 1, Math.max(0, ((u + 1) / 2) * grid.columns - 0.5));
  const gy = Math.min(grid.rows - 1, Math.max(0, ((v + 1) / 2) * grid.rows - 0.5));
  const x = Math.floor(gx);
  const y = Math.floor(gy);
  const clampX = (i) => Math.min(grid.columns - 1, Math.max(0, i));
  const clampY = (i) => Math.min(grid.rows - 1, Math.max(0, i));
  const at = (col, row, c) => grid.values[(clampY(row) * grid.columns + clampX(col)) * 3 + c];
  return [0, 1, 2].map((c) => {
    const across = [-1, 0, 1, 2].map((dy) => catmullRom(at(x - 1, y + dy, c), at(x, y + dy, c), at(x + 1, y + dy, c), at(x + 2, y + dy, c), gx - x));
    return catmullRom(...across, gy - y);
  });
}

export function fitLocalBackground(cells, overrides, blurSize) {
  const { columns, rows } = gridShape(cells);
  const spread = blurSize * columns;
  const lumas = cells.map((cell) => luma(...cell.values));
  const values = new Float32Array(cells.length * 3);
  cells.forEach((cell, index) => values.set(cell.values, index * 3));
  let states = cells.map((_, index) => overrides.get(index) ?? CELL_USED);
  let grid = smoothGrid(values, states.map(isSkyState), columns, rows, spread);
  for (let round = 0; round < LOCAL_CLIP_ROUNDS; round++) {
    states = cells.map((_, index) => {
      if (overrides.has(index)) return overrides.get(index);
      const expected = grid.values.subarray(index * 3, index * 3 + 3);
      const outlier = cells[index].values.some((value, c) => Math.abs(value / Math.max(1e-6, expected[c]) - 1) > LOCAL_CLIP_FRACTION);
      return outlier ? CELL_REJECTED : CELL_USED;
    });
    grid = smoothGrid(values, states.map(isSkyState), columns, rows, spread);
  }
  return {
    kind: 'local',
    states,
    level: median(lumas.filter((_, index) => isSkyState(states[index]))),
    grid,
  };
}

function glowAt(model, u, v, evenColour) {
  if (model.kind === 'local') return sampleGrid(model.grid, u, v);
  const glow = modelAt(model.coefficients, model.terms, u, v);
  const shift = sampleGrid(model.colourShifts, u, v);
  return glow.map((value, c) => value + evenColour * shift[c]);
}

function removeModel(image, model, settings) {
  const { width, height, rgb } = image;
  const out = new Float32Array(rgb.length);
  const floor = VIGNETTE_FLOOR * model.level;
  const knots = Math.ceil(width / MODEL_STEP) + 1;
  const rowModel = new Float32Array(knots * 3);
  for (let y = 0; y < height; y++) {
    const v = ((2 * y + 1) / height) - 1;
    for (let k = 0; k < knots; k++) {
      const u = ((2 * Math.min(k * MODEL_STEP, width - 1) + 1) / width) - 1;
      rowModel.set(glowAt(model, u, v, settings.evenColour), k * 3);
    }
    for (let x = 0; x < width; x++) {
      const k = Math.floor(x / MODEL_STEP);
      const t = (x - k * MODEL_STEP) / MODEL_STEP;
      const at = (y * width + x) * 3;
      const next = Math.min(k + 1, knots - 1) * 3;
      const glow = [0, 1, 2].map((c) => rowModel[k * 3 + c] + (rowModel[next + c] - rowModel[k * 3 + c]) * t);
      const flatten = settings.flattenVignetting ? model.level / Math.max(floor, luma(...glow)) : 1;
      for (let c = 0; c < 3; c++) out[at + c] = (rgb[at + c] - glow[c]) * flatten;
    }
  }
  return out;
}

function measureLevels(rgb, pixels) {
  const step = Math.max(1, Math.floor(pixels / STAT_SAMPLES));
  const lumas = [];
  const peaks = [];
  for (let pixel = 0; pixel < pixels; pixel += step) {
    const at = pixel * 3;
    lumas.push(luma(rgb[at], rgb[at + 1], rgb[at + 2]));
    peaks.push(Math.max(rgb[at], rgb[at + 1], rgb[at + 2]));
  }
  const sortedLumas = Float32Array.from(lumas).sort();
  const center = percentile(sortedLumas, 0.5);
  const deviations = Float32Array.from(lumas, (value) => Math.abs(value - center)).sort();
  const sigma = MAD_TO_SIGMA * percentile(deviations, 0.5);
  const white = percentile(Float32Array.from(peaks).sort(), WHITE_PERCENTILE);
  return { center, sigma, white: Math.max(white, center + 10 * sigma + 1e-6) };
}

function asinhStretch(x, beta) {
  return Math.asinh(beta * x) / Math.asinh(beta);
}

function betaForTarget(backgroundLevel, target) {
  if (backgroundLevel >= target) return 1e-3;
  let low = Math.log(1e-3);
  let high = Math.log(1e8);
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    if (asinhStretch(backgroundLevel, Math.exp(mid)) < target) low = mid;
    else high = mid;
  }
  return Math.exp((low + high) / 2);
}

function blurPass(src, dst, width, height, radius, horizontal) {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const stride = horizontal ? 1 : width;
  const scale = 1 / (2 * radius + 1);
  for (let line = 0; line < lines; line++) {
    const start = horizontal ? line * width : line;
    const sample = (i) => src[start + Math.min(length - 1, Math.max(0, i)) * stride];
    let sum = 0;
    for (let i = -radius; i <= radius; i++) sum += sample(i);
    for (let i = 0; i < length; i++) {
      dst[start + i * stride] = sum * scale;
      sum += sample(i + radius + 1) - sample(i - radius);
    }
  }
}

export function blur(src, width, height, radius) {
  const out = Float32Array.from(src);
  if (radius < 1) return out;
  const scratch = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    blurPass(out, scratch, width, height, radius, true);
    blurPass(scratch, out, width, height, radius, false);
  }
  return out;
}

function stretch(rgb, pixels, levels, settings) {
  const blackPoint = levels.center - settings.blackPoint * levels.sigma;
  const range = levels.white - blackPoint;
  const beta = betaForTarget((levels.center - blackPoint) / range, settings.background);
  const flatGain = beta / Math.asinh(beta);
  for (let pixel = 0; pixel < pixels; pixel++) {
    const at = pixel * 3;
    const r = Math.max(0, (rgb[at] - blackPoint) / range);
    const g = Math.max(0, (rgb[at + 1] - blackPoint) / range);
    const b = Math.max(0, (rgb[at + 2] - blackPoint) / range);
    const brightness = luma(r, g, b);
    const gain = brightness > 1e-7 ? asinhStretch(brightness, beta) / brightness : flatGain;
    const peak = Math.max(r, g, b) * gain;
    const fit = peak > 1 ? gain / peak : gain;
    rgb[at] = r * fit;
    rgb[at + 1] = g * fit;
    rgb[at + 2] = b * fit;
  }
}

function lumaPlane(rgb, pixels) {
  const plane = new Float32Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel++) plane[pixel] = luma(rgb[pixel * 3], rgb[pixel * 3 + 1], rgb[pixel * 3 + 2]);
  return plane;
}

function reduceNoise(rgb, width, height, settings) {
  const pixels = width * height;
  const longEdge = Math.max(width, height);
  const brightness = lumaPlane(rgb, pixels);
  const redDifference = new Float32Array(pixels);
  const blueDifference = new Float32Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel++) {
    redDifference[pixel] = rgb[pixel * 3] - brightness[pixel];
    blueDifference[pixel] = rgb[pixel * 3 + 2] - brightness[pixel];
  }
  const chromaRadius = Math.round(settings.noise * CHROMA_NOISE_RADIUS * longEdge);
  const smoothRed = blur(redDifference, width, height, chromaRadius);
  const smoothBlue = blur(blueDifference, width, height, chromaRadius);
  const smoothBrightness = blur(brightness, width, height, Math.max(1, Math.round(settings.noise * 0.0015 * longEdge)));
  const sky = settings.background;
  for (let pixel = 0; pixel < pixels; pixel++) {
    const backgroundWeight = settings.noise * (1 - smoothstep(sky * 1.2, sky + 0.2, smoothBrightness[pixel]));
    const y = brightness[pixel] + (smoothBrightness[pixel] - brightness[pixel]) * backgroundWeight;
    const r = y + smoothRed[pixel];
    const b = y + smoothBlue[pixel];
    rgb[pixel * 3] = r;
    rgb[pixel * 3 + 1] = (y - LUMA[0] * r - LUMA[2] * b) / LUMA[1];
    rgb[pixel * 3 + 2] = b;
  }
}

function enhance(rgb, width, height, settings) {
  const pixels = width * height;
  const brightness = lumaPlane(rgb, pixels);
  const sky = settings.background;
  const amount = settings.boost;
  const surroundings = amount > 0 ? blur(brightness, width, height, Math.round(0.02 * Math.max(width, height))) : null;
  for (let pixel = 0; pixel < pixels; pixel++) {
    const at = pixel * 3;
    const y = brightness[pixel];
    let boosted = y;
    let objectWeight = 0;
    if (surroundings) {
      objectWeight = smoothstep(0.004, 0.12, surroundings[pixel] - sky);
      const detail = y - surroundings[pixel];
      boosted += amount * objectWeight * 1.2 * (detail > 0 ? detail : HALO_DAMPING * detail);
      boosted += amount * objectWeight * 0.8 * Math.max(0, boosted - sky) * (1 - boosted);
      boosted = Math.min(1, Math.max(0, boosted));
    }
    const gain = y > 1e-6 ? boosted / y : 1;
    const saturation = 1 + (settings.saturation - 1) * smoothstep(sky * 0.9, sky + 0.15, y) + amount * 0.6 * objectWeight;
    let r = boosted + (rgb[at] * gain - boosted) * saturation;
    let g = boosted + (rgb[at + 1] * gain - boosted) * saturation;
    let b = boosted + (rgb[at + 2] * gain - boosted) * saturation;
    r = Math.max(0, r);
    g = Math.max(0, g);
    b = Math.max(0, b);
    const peak = Math.max(r, g, b);
    const fit = peak > 1 ? 1 / peak : 1;
    rgb[at] = r * fit;
    rgb[at + 1] = g * fit;
    rgb[at + 2] = b * fit;
  }
}

export function render(image, model, settings) {
  const { width, height } = image;
  const pixels = width * height;
  const rgb = settings.removeBackground && model ? removeModel(image, model, settings) : Float32Array.from(image.rgb);
  stretch(rgb, pixels, measureLevels(rgb, pixels), settings);
  if (settings.noise > 0) reduceNoise(rgb, width, height, settings);
  enhance(rgb, width, height, settings);
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel++) {
    rgba[pixel * 4] = rgb[pixel * 3] * 255 + 0.5;
    rgba[pixel * 4 + 1] = rgb[pixel * 3 + 1] * 255 + 0.5;
    rgba[pixel * 4 + 2] = rgb[pixel * 3 + 2] * 255 + 0.5;
    rgba[pixel * 4 + 3] = 255;
  }
  return { width, height, rgba };
}
