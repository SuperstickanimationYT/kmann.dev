const SAMPLE_LIMIT = 30000;
const ITERATIONS = 12;

export const SPACE = [0, 0, 0];

const distance = (pixels, offset, color) => {
  const r = pixels[offset] - color[0];
  const g = pixels[offset + 1] - color[1];
  const b = pixels[offset + 2] - color[2];
  return r * r + g * g + b * b;
};

function nearest(pixels, offset, colors) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < colors.length; i++) {
    const d = distance(pixels, offset, colors[i]);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

function samplePlanetPixels(planets, random) {
  const diskOffsets = planets.flatMap((planet) => planet.disk.map((index) => ({ pixels: planet.rgb, offset: index * 3 })));
  const keep = Math.min(1, SAMPLE_LIMIT / diskOffsets.length);
  const sample = diskOffsets.filter(() => random() < keep);
  const packed = new Float32Array(sample.length * 3);
  sample.forEach(({ pixels, offset }, i) => packed.set(pixels.subarray(offset, offset + 3), i * 3));
  return packed;
}

function seedCenters(pixels, count, random) {
  const total = pixels.length / 3;
  const centers = [[...pixels.subarray(0, 3)]];
  const closest = new Float32Array(total).fill(Infinity);
  while (centers.length < count) {
    let sum = 0;
    for (let i = 0; i < total; i++) {
      closest[i] = Math.min(closest[i], distance(pixels, i * 3, centers.at(-1)));
      sum += closest[i];
    }
    if (!sum) break;
    let target = random() * sum;
    let pick = 0;
    while (pick < total - 1 && (target -= closest[pick]) > 0) pick++;
    centers.push([...pixels.subarray(pick * 3, pick * 3 + 3)]);
  }
  return centers;
}

export function learnPalette(planets, count, random) {
  const pixels = samplePlanetPixels(planets, random);
  const centers = seedCenters(pixels, count, random);
  const total = pixels.length / 3;
  for (let round = 0; round < ITERATIONS; round++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < total; i++) {
      const sum = sums[nearest(pixels, i * 3, centers)];
      sum[0] += pixels[i * 3];
      sum[1] += pixels[i * 3 + 1];
      sum[2] += pixels[i * 3 + 2];
      sum[3]++;
    }
    sums.forEach(([r, g, b, n], i) => {
      if (n) centers[i] = [r / n, g / n, b / n];
    });
  }
  return [SPACE, ...centers.map((color) => color.map(Math.round))];
}

export function quantize(planet, palette) {
  const planetColors = palette.slice(1);
  const { rgb, disk } = planet;
  const indices = new Uint8Array(rgb.length / 3);
  const remembered = new Map();
  for (const index of disk) {
    const offset = index * 3;
    const packed = (rgb[offset] << 16) | (rgb[offset + 1] << 8) | rgb[offset + 2];
    let color = remembered.get(packed);
    if (color === undefined) remembered.set(packed, (color = 1 + nearest(rgb, offset, planetColors)));
    indices[index] = color;
  }
  return indices;
}
