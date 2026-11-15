import { boxBlur, median, nearest, open, sampleEvery } from './filters.js';
import { hasSpikes, learnSpikeAngles, paintSpikes } from './spikes.js';

const CHANNELS = ['r', 'g', 'b'];

export function luminance(image) {
  const { r, g, b } = image;
  const out = new Float32Array(r.length);
  for (let i = 0; i < out.length; i += 1) out[i] = (r[i] + g[i] + b[i]) / 3;
  return out;
}

function noiseLevels(tophat) {
  const values = sampleEvery(tophat.length, 200000).map((i) => tophat[i]);
  const middle = median(values);
  const spread = Math.max(1.4826 * median(values.map((v) => Math.abs(v - middle))), 0.002);
  return { middle, spread };
}

function tophatOf(light, width, height, radius) {
  const background = open(light, width, height, radius);
  const tophat = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) tophat[i] = light[i] - background[i];
  return tophat;
}

const SIZE_PROBE_RADIUS = 20;
const SIZE_PROBE_PEAKS = 300;
const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];

function isLocalPeak(values, width, i) {
  const v = values[i];
  return v > values[i - 1] && v >= values[i + 1] && v > values[i - width] && v >= values[i + width]
    && v > values[i - width - 1] && v >= values[i + width + 1] && v > values[i - width + 1] && v >= values[i + width - 1];
}

function halfWidth(tophat, width, height, x, y) {
  const half = tophat[y * width + x] / 2;
  const reaches = DIRECTIONS.map(([dx, dy]) => {
    let previous = tophat[y * width + x];
    for (let step = 1; step <= SIZE_PROBE_RADIUS * 2; step += 1) {
      const sx = Math.round(x + dx * step);
      const sy = Math.round(y + dy * step);
      if (sx < 0 || sy < 0 || sx >= width || sy >= height) return Infinity;
      const value = tophat[sy * width + sx];
      if (value < half) return step - 1 + (previous - half) / Math.max(1e-6, previous - value);
      previous = value;
    }
    return Infinity;
  });
  return median(reaches.filter(Number.isFinite));
}

export function measureStarSize(image) {
  const { width, height } = image;
  const light = luminance(image);
  const tophat = tophatOf(light, width, height, SIZE_PROBE_RADIUS);
  const { middle, spread } = noiseLevels(tophat);
  const floor = middle + spread * 10;
  const peaks = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (tophat[i] > floor && light[i] < 0.95 && isLocalPeak(tophat, width, i)) peaks.push(i);
    }
  }
  peaks.sort((a, b) => tophat[b] - tophat[a]);
  const widths = peaks.slice(0, SIZE_PROBE_PEAKS)
    .map((i) => 2 * halfWidth(tophat, width, height, i % width, Math.floor(i / width)))
    .filter((w) => Number.isFinite(w) && w > 0);
  if (widths.length < 5) return 3;
  widths.sort((a, b) => a - b);
  return widths[Math.floor(widths.length * 0.75)];
}

export function radiusForStarWidth(fullWidth) {
  return Math.min(30, Math.max(2, Math.ceil(fullWidth)));
}

const MIN_ROUNDNESS = 0.5;
const RAYS = 16;
const RING_SAMPLES = 32;
const MAX_STARS = 50000;

function isPlateauOrPeak(values, width, i) {
  const v = values[i];
  return v >= values[i - 1] && v >= values[i + 1] && v >= values[i - width] && v >= values[i + width]
    && v >= values[i - width - 1] && v >= values[i + width + 1] && v >= values[i - width + 1] && v >= values[i + width - 1];
}

function plateauCentre(light, width, height, x0, y0, reach, tolerance) {
  const top = light[y0 * width + x0] - tolerance;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = Math.max(0, y0 - reach); y <= Math.min(height - 1, y0 + reach); y += 1) {
    for (let x = Math.max(0, x0 - reach); x <= Math.min(width - 1, x0 + reach); x += 1) {
      if (light[y * width + x] >= top) {
        sx += x;
        sy += y;
        n += 1;
      }
    }
  }
  return { x: Math.round(sx / n), y: Math.round(sy / n) };
}

function peaksAbove(tophat, strong, width, height) {
  const peaks = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (tophat[i] > strong && isPlateauOrPeak(tophat, width, i)) peaks.push(i);
    }
  }
  peaks.sort((a, b) => tophat[b] - tophat[a]);
  return peaks.slice(0, MAX_STARS);
}

function rayReaches(light, width, height, x0, y0, floor, tolerance, limit) {
  const peak = light[y0 * width + x0];
  const halfway = floor + (peak - floor) / 2;
  const reaches = [];
  let unbounded = 0;
  for (let k = 0; k < RAYS; k += 1) {
    const dx = Math.cos((2 * Math.PI * k) / RAYS);
    const dy = Math.sin((2 * Math.PI * k) / RAYS);
    const profile = [peak];
    let lowest = peak;
    let reach = limit;
    for (let step = 1; step <= limit; step += 1) {
      const x = Math.round(x0 + dx * step);
      const y = Math.round(y0 + dy * step);
      if (x < 0 || y < 0 || x >= width || y >= height) { reach = step; break; }
      const value = light[y * width + x];
      profile.push(value);
      const flattened = value < halfway && step >= 3 && profile[step - 2] - value < tolerance;
      if (value < floor || value > lowest + tolerance || flattened) { reach = step; break; }
      if (value < lowest) lowest = value;
    }
    if (reach === limit) unbounded += 1;
    reaches.push(reach);
  }
  reaches.sort((a, b) => a - b);
  return { reaches, unbounded };
}

function starExtent(light, width, height, x0, y0, floor, tolerance, limit) {
  const { reaches, unbounded } = rayReaches(light, width, height, x0, y0, floor, tolerance, limit);
  if (unbounded > RAYS / 2) return 0;
  const inner = reaches[Math.floor(RAYS * 0.25)];
  const outer = reaches[Math.floor(RAYS * 0.75)];
  if (inner / outer < MIN_ROUNDNESS) return 0;
  return outer + 1;
}

function markCovered(covered, width, height, cx, cy, radius) {
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) covered[y * width + x] = 1;
    }
  }
}

export function paintOver(layer, star, radius) {
  const { width, height } = layer;
  const ringRadius = radius + 1.5;
  const ringX = [];
  const ringY = [];
  for (let k = 0; k < RING_SAMPLES; k += 1) {
    const angle = (2 * Math.PI * k) / RING_SAMPLES;
    ringX.push(star.cx + ringRadius * Math.cos(angle));
    ringY.push(star.cy + ringRadius * Math.sin(angle));
  }
  const ring = CHANNELS.map((key) => ringX.map((x, k) => nearest(layer[key], width, height, x, ringY[k])));
  const edge = radius + 1.5;
  for (let y = Math.max(0, Math.floor(star.cy - edge)); y <= Math.min(height - 1, Math.ceil(star.cy + edge)); y += 1) {
    for (let x = Math.max(0, Math.floor(star.cx - edge)); x <= Math.min(width - 1, Math.ceil(star.cx + edge)); x += 1) {
      const distance = Math.hypot(x - star.cx, y - star.cy);
      if (distance > edge) continue;
      const cover = distance <= radius ? 1 : (edge - distance) / (edge - radius);
      let total = 0;
      const sums = [0, 0, 0];
      for (let k = 0; k < RING_SAMPLES; k += 1) {
        const weight = 1 / ((x - ringX[k]) ** 2 + (y - ringY[k]) ** 2 + 0.5);
        total += weight;
        for (let c = 0; c < 3; c += 1) sums[c] += weight * ring[c][k];
      }
      const i = y * width + x;
      CHANNELS.forEach((key, c) => {
        const current = layer[key][i];
        const fill = Math.min(current, sums[c] / total);
        layer[key][i] = current + (fill - current) * cover;
      });
    }
  }
}

function brightestBlurredSpot(light, width, height, reach) {
  const blurred = boxBlur(light, width, height, reach);
  let best = -Infinity;
  let spot = { x: width / 2, y: height / 2 };
  for (let y = Math.floor(height * 0.15); y < height * 0.85; y += 1) {
    for (let x = Math.floor(width * 0.15); x < width * 0.85; x += 1) {
      if (blurred[y * width + x] > best) {
        best = blurred[y * width + x];
        spot = { x, y };
      }
    }
  }
  return spot;
}

const SMALLEST_SCALE = 2;
const HALO_MARGIN = 1.2;

function starScales(largest) {
  const scales = [];
  for (let r = largest; r > SMALLEST_SCALE; r = Math.round(r / 2)) scales.push(r);
  scales.push(SMALLEST_SCALE);
  return scales;
}

const PINK_SHARE = 0.04;
const PINK_FLOOR = 5 / 255;

function colourExcess(layer, x, y, reach) {
  const { width, height } = layer;
  return CHANNELS.map((key) => {
    const channel = layer[key];
    let core = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) core += nearest(channel, width, height, x + dx, y + dy);
    const ring = [];
    for (let k = 0; k < RING_SAMPLES; k += 1) {
      const angle = (2 * Math.PI * k) / RING_SAMPLES;
      ring.push(nearest(channel, width, height, x + (reach + 1.5) * Math.cos(angle), y + (reach + 1.5) * Math.sin(angle)));
    }
    return core / 9 - median(ring);
  });
}

function looksLikeGlowingGas(layer, x, y, reach) {
  const [r, g, b] = colourExcess(layer, x, y, reach);
  const greenDeficit = (r + b) / 2 - g;
  return greenDeficit >= PINK_FLOOR && greenDeficit >= PINK_SHARE * (r + g + b);
}

function removeAtScale(starless, nucleus, radius, sensitivity, guard, keepPink) {
  const { width, height } = starless;
  const light = luminance(starless);
  const background = open(light, width, height, radius);
  const tophat = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) tophat[i] = light[i] - background[i];
  const { middle, spread } = noiseLevels(tophat);
  const strong = middle + spread * (11 - sensitivity) * Math.sqrt(radius / SMALLEST_SCALE);
  const covered = new Uint8Array(light.length);
  let count = 0;
  for (const i of peaksAbove(tophat, strong, width, height)) {
    if (covered[i]) continue;
    const { x, y } = plateauCentre(light, width, height, i % width, Math.floor(i / width), radius, spread);
    if (Math.hypot(x - nucleus.x, y - nucleus.y) <= guard) continue;
    const extent = starExtent(light, width, height, x, y, background[y * width + x] + spread * 1.5, spread * 2, radius * 3);
    if (!extent) {
      markCovered(covered, width, height, i % width, Math.floor(i / width), 2);
      continue;
    }
    const reach = extent * HALO_MARGIN + 1;
    if (keepPink && looksLikeGlowingGas(starless, x, y, reach)) {
      markCovered(covered, width, height, x, y, reach + 1);
      continue;
    }
    paintOver(starless, { cx: x, cy: y }, reach);
    markCovered(covered, width, height, x, y, reach + 1);
    count += 1;
  }
  return count;
}

const SPIKE_CANDIDATES = 300;
const SPIKE_TEACHERS = 20;
const SPIKED_HALO = 4;

const HALO_LIMIT = 20;
const HALO_FLAT = 0.25;
const HALO_TAIL = 1.5;
const HALO_STEP = 4;
const HALO_SAMPLES = 64;

function ringMedian(channel, width, height, x, y, r) {
  const values = [];
  for (let k = 0; k < HALO_SAMPLES; k += 1) {
    const angle = (2 * Math.PI * k) / HALO_SAMPLES;
    values.push(nearest(channel, width, height, x + r * Math.cos(angle), y + r * Math.sin(angle)));
  }
  return median(values);
}

function haloReach(layer, x, y, start, limit, tolerance) {
  const { width, height } = layer;
  const brightest = (r) => Math.max(...CHANNELS.map((key) => ringMedian(layer[key], width, height, x, y, r)));
  let inner = brightest(start);
  for (let r = start + HALO_STEP; r <= limit; r += HALO_STEP) {
    const outer = brightest(r);
    if (inner - outer < tolerance) return r - HALO_STEP;
    inner = outer;
  }
  return limit;
}

function subtractHalo(layer, x, y, inner, outer) {
  const { width, height } = layer;
  for (const key of CHANNELS) {
    const channel = layer[key];
    const profile = [];
    for (let r = inner; r <= outer; r += 1) {
      const level = ringMedian(channel, width, height, x, y, r);
      profile.push(Math.min(level, profile.length ? profile[profile.length - 1] : level));
    }
    const floor = profile[profile.length - 1];
    for (let py = Math.max(0, Math.floor(y - outer)); py <= Math.min(height - 1, Math.ceil(y + outer)); py += 1) {
      for (let px = Math.max(0, Math.floor(x - outer)); px <= Math.min(width - 1, Math.ceil(x + outer)); px += 1) {
        const distance = Math.hypot(px - x, py - y);
        if (distance < inner || distance > outer) continue;
        const step = distance - inner;
        const below = Math.floor(step);
        const above = Math.min(profile.length - 1, below + 1);
        const level = profile[below] + (profile[above] - profile[below]) * (step - below);
        const i = py * width + px;
        channel[i] = Math.max(channel[i] - (level - floor), Math.min(channel[i], floor));
      }
    }
  }
}

function removeSpikedStars(starless, light, nucleus, radius, sensitivity, guard) {
  const { width, height } = starless;
  const background = open(light, width, height, SPIKED_HALO * radius);
  const tophat = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) tophat[i] = light[i] - background[i];
  const { middle, spread } = noiseLevels(tophat);
  const strong = middle + spread * (11 - sensitivity) * 2;
  const claimed = new Uint8Array(light.length);
  const found = [];
  for (const i of peaksAbove(tophat, strong, width, height)) {
    const { x, y } = plateauCentre(light, width, height, i % width, Math.floor(i / width), radius, spread);
    if (claimed[y * width + x] || Math.hypot(x - nucleus.x, y - nucleus.y) <= guard) continue;
    markCovered(claimed, width, height, x, y, radius * 2);
    const core = Math.max(1.5, halfWidth(tophat, width, height, x, y));
    if (Number.isFinite(core)) found.push({ x, y, core, glow: tophat[y * width + x] * core * core });
  }
  const candidates = found.sort((a, b) => b.glow - a.glow).slice(0, SPIKE_CANDIDATES);
  const angles = learnSpikeAngles(light, width, height, candidates.slice(0, SPIKE_TEACHERS));
  if (!angles.length) return { angles, count: 0 };
  const covered = new Uint8Array(light.length);
  let count = 0;
  for (const { x, y, core } of candidates) {
    if (covered[y * width + x] || !hasSpikes(light, width, height, x, y, core, angles)) continue;
    const { reaches } = rayReaches(light, width, height, x, y, background[y * width + x] + spread * 1.5, spread * 2, radius * 6);
    const coreReach = reaches[RAYS >> 1];
    const halo = haloReach(starless, x, y, coreReach, radius * HALO_LIMIT, spread * HALO_FLAT);
    const reach = coreReach * HALO_MARGIN + 1;
    paintSpikes(starless, light, x, y, reach, core, angles, spread);
    subtractHalo(starless, x, y, Math.ceil(reach), Math.ceil(halo * HALO_TAIL));
    paintOver(starless, { cx: x, cy: y }, reach);
    markCovered(covered, width, height, x, y, reach + 1);
    count += 1;
  }
  return { angles, count };
}

export function removeStars(image, { radius, sensitivity, keepPink }) {
  const { width, height } = image;
  const nucleus = brightestBlurredSpot(luminance(image), width, height, 2 * radius);
  const starless = { width, height, r: Float32Array.from(image.r), g: Float32Array.from(image.g), b: Float32Array.from(image.b) };
  const spiked = removeSpikedStars(starless, luminance(image), nucleus, radius, sensitivity, 2 * radius);
  let count = spiked.count;
  for (const scale of starScales(radius)) count += removeAtScale(starless, nucleus, scale, sensitivity, 2 * radius, keepPink);
  const stars = { width, height };
  for (const key of CHANNELS) {
    const out = new Float32Array(width * height);
    for (let i = 0; i < out.length; i += 1) out[i] = Math.max(0, image[key][i] - starless[key][i]);
    stars[key] = out;
  }
  return { starless, stars, count, spikeAngles: spiked.angles.toSorted((a, b) => a - b) };
}

export function keepStars(image) {
  const { width, height } = image;
  const empty = () => new Float32Array(width * height);
  return { starless: image, stars: { width, height, r: empty(), g: empty(), b: empty() }, count: 0, spikeAngles: [] };
}
