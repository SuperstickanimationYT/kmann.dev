function slideMin(line, out, n, r, padded, g, h) {
  const w = 2 * r + 1;
  const m = n + 2 * r;
  padded.fill(Infinity, 0, r);
  padded.fill(Infinity, n + r, m);
  padded.set(line.subarray(0, n), r);
  for (let i = 0; i < m; i += 1) {
    const v = padded[i];
    g[i] = i % w === 0 || g[i - 1] > v ? v : g[i - 1];
  }
  h[m - 1] = padded[m - 1];
  for (let i = m - 2; i >= 0; i -= 1) {
    const v = padded[i];
    h[i] = i % w === w - 1 || h[i + 1] > v ? v : h[i + 1];
  }
  for (let i = 0; i < n; i += 1) {
    const left = h[i];
    const right = g[i + 2 * r];
    out[i] = left < right ? left : right;
  }
}

function rowsMin(src, width, height, r) {
  const line = new Float32Array(width);
  const out = new Float32Array(width);
  const padded = new Float32Array(width + 2 * r);
  const g = new Float32Array(width + 2 * r);
  const h = new Float32Array(width + 2 * r);
  const result = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    line.set(src.subarray(y * width, (y + 1) * width));
    slideMin(line, out, width, r, padded, g, h);
    result.set(out, y * width);
  }
  return result;
}

function columnsMin(src, width, height, r) {
  const w = 2 * r + 1;
  const m = height + 2 * r;
  const g = new Float32Array(m * width);
  const h = new Float32Array(m * width);
  const padRow = (row) => (row < r || row >= height + r ? null : (row - r) * width);
  for (let row = 0; row < m; row += 1) {
    const from = padRow(row);
    const base = row * width;
    const restart = row % w === 0;
    for (let x = 0; x < width; x += 1) {
      const v = from === null ? Infinity : src[from + x];
      const previous = restart ? Infinity : g[base - width + x];
      g[base + x] = previous < v ? previous : v;
    }
  }
  for (let row = m - 1; row >= 0; row -= 1) {
    const from = padRow(row);
    const base = row * width;
    const restart = row % w === w - 1 || row === m - 1;
    for (let x = 0; x < width; x += 1) {
      const v = from === null ? Infinity : src[from + x];
      const next = restart ? Infinity : h[base + width + x];
      h[base + x] = next < v ? next : v;
    }
  }
  const result = new Float32Array(src.length);
  const shift = 2 * r * width;
  for (let i = 0; i < result.length; i += 1) {
    const left = h[i];
    const right = g[i + shift];
    result[i] = left < right ? left : right;
  }
  return result;
}

function negated(values) {
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 1) out[i] = -values[i];
  return out;
}

export function erode(src, width, height, r) {
  return columnsMin(rowsMin(src, width, height, r), width, height, r);
}

export function dilate(src, width, height, r) {
  return negated(erode(negated(src), width, height, r));
}

export function open(src, width, height, r) {
  return dilate(erode(src, width, height, r), width, height, r);
}

function boxLine(line, out, n, r) {
  let sum = 0;
  for (let i = -r; i <= r; i += 1) sum += line[Math.min(n - 1, Math.max(0, i))];
  const scale = 1 / (2 * r + 1);
  for (let i = 0; i < n; i += 1) {
    out[i] = sum * scale;
    sum += line[Math.min(n - 1, i + r + 1)] - line[Math.max(0, i - r)];
  }
}

export function boxBlur(src, width, height, r) {
  if (r < 1) return Float32Array.from(src);
  const out = new Float32Array(width);
  const rows = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    boxLine(src.subarray(y * width, (y + 1) * width), out, width, r);
    rows.set(out, y * width);
  }
  return boxColumns(rows, width, height, r);
}

function boxColumns(rows, width, height, r) {
  const row = (y) => Math.min(height - 1, Math.max(0, y)) * width;
  const sum = new Float32Array(width);
  for (let y = -r; y <= r; y += 1) {
    const from = row(y);
    for (let x = 0; x < width; x += 1) sum[x] += rows[from + x];
  }
  const scale = 1 / (2 * r + 1);
  const result = new Float32Array(rows.length);
  for (let y = 0; y < height; y += 1) {
    const base = y * width;
    const entering = row(y + r + 1);
    const leaving = row(y - r);
    for (let x = 0; x < width; x += 1) {
      result[base + x] = sum[x] * scale;
      sum[x] += rows[entering + x] - rows[leaving + x];
    }
  }
  return result;
}

export function smooth(src, width, height, r) {
  return boxBlur(boxBlur(src, width, height, r), width, height, r);
}

export function median(values) {
  const sorted = Float32Array.from(values).sort();
  return sorted.length ? sorted[sorted.length >> 1] : 0;
}

export function sampleEvery(length, count) {
  const step = Math.max(1, Math.floor(length / count));
  const picks = [];
  for (let i = 0; i < length; i += step) picks.push(i);
  return picks;
}

export function halve(src, width, height) {
  const w = Math.max(1, width >> 1);
  const h = Math.max(1, height >> 1);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const top = 2 * y * width;
    const bottom = Math.min(height - 1, 2 * y + 1) * width;
    for (let x = 0; x < w; x += 1) {
      const left = 2 * x;
      const right = Math.min(width - 1, left + 1);
      out[y * w + x] = (src[top + left] + src[top + right] + src[bottom + left] + src[bottom + right]) / 4;
    }
  }
  return { data: out, width: w, height: h };
}

export function enlarge(small, width, height) {
  const { data, width: w, height: h } = small;
  const out = new Float32Array(width * height);
  const sx = w / width;
  const sy = h / height;
  for (let y = 0; y < height; y += 1) {
    const fy = Math.min(h - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.min(w - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const top = data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx;
      const bottom = data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx;
      out[y * width + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}
