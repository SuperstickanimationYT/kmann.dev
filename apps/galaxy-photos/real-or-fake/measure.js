const DETAIL_SCALES = [1, 2, 4, 8, 16];
const BOX_PASSES = 3;
const GALAXY_LIFT = 0.06;

function luminanceOf({ data, width, height }) {
  const luminance = new Float32Array(width * height);
  for (let i = 0; i < luminance.length; i++) {
    luminance[i] = (0.2126 * data[4 * i] + 0.7152 * data[4 * i + 1] + 0.0722 * data[4 * i + 2]) / 255;
  }
  return luminance;
}

function boxLine(from, to, start, stride, length, radius) {
  const width = 2 * radius + 1;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += from[start + Math.min(length - 1, Math.max(0, i)) * stride];
  for (let i = 0; i < length; i++) {
    to[start + i * stride] = sum / width;
    sum += from[start + Math.min(length - 1, i + radius + 1) * stride] - from[start + Math.max(0, i - radius) * stride];
  }
}

function blurred(values, width, height, sigma) {
  const radius = Math.max(1, Math.round((Math.sqrt((12 * sigma * sigma) / BOX_PASSES + 1) - 1) / 2));
  const result = Float32Array.from(values);
  const scratch = new Float32Array(values.length);
  for (let pass = 0; pass < BOX_PASSES; pass++) {
    for (let row = 0; row < height; row++) boxLine(result, scratch, row * width, 1, width, radius);
    for (let column = 0; column < width; column++) boxLine(scratch, result, column, width, height, radius);
  }
  return result;
}

function percentile(values, share) {
  if (!values.length) return 0;
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

export function measure(imageData) {
  const { data, width, height } = imageData;
  const luminance = luminanceOf(imageData);
  const background = percentile(luminance, 0.1);
  const smooth = blurred(luminance, width, height, 6);
  const inGalaxy = smooth.map((value) => (value > background + GALAXY_LIFT ? 1 : 0));
  const galaxyPixels = inGalaxy.reduce((sum, flag) => sum + flag, 0);

  const levels = DETAIL_SCALES.map((scale) => blurred(luminance, width, height, scale));
  const detail = DETAIL_SCALES.map((_, index) => {
    const sharper = index === 0 ? luminance : levels[index - 1];
    const softer = levels[index];
    let energy = 0;
    let brightness = 0;
    for (let i = 0; i < luminance.length; i++) {
      if (!inGalaxy[i]) continue;
      energy += Math.abs(sharper[i] - softer[i]);
      brightness += luminance[i];
    }
    return galaxyPixels ? energy / Math.max(brightness, 1e-6) : 0;
  });

  const galaxyLuminance = [];
  let blueness = 0;
  let saturation = 0;
  for (let i = 0; i < luminance.length; i++) {
    if (!inGalaxy[i]) continue;
    const [red, green, blue] = [data[4 * i], data[4 * i + 1], data[4 * i + 2]];
    const total = red + green + blue + 1;
    blueness += (blue - red) / total;
    const brightest = Math.max(red, green, blue);
    saturation += brightest ? (brightest - Math.min(red, green, blue)) / brightest : 0;
    galaxyLuminance.push(luminance[i]);
  }

  return {
    coverage: galaxyPixels / luminance.length,
    background,
    median: percentile(galaxyLuminance, 0.5),
    bright: percentile(galaxyLuminance, 0.97),
    blueness: galaxyPixels ? blueness / galaxyPixels : 0,
    saturation: galaxyPixels ? saturation / galaxyPixels : 0,
    detail,
  };
}

export const DETAIL_LABELS = DETAIL_SCALES.map((scale) => `detail ${scale}px`);

export function flatten(stats) {
  return {
    coverage: stats.coverage,
    background: stats.background,
    median: stats.median,
    bright: stats.bright,
    blueness: stats.blueness,
    saturation: stats.saturation,
    ...Object.fromEntries(stats.detail.map((value, index) => [DETAIL_LABELS[index], value])),
  };
}
