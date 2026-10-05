const MAX_ITERATIONS = 600;
const SUPERSAMPLE_BELOW = 192;
const WHOLE_SET_SHARE = 0.2;
const PROBES = 7;
const BAND_FREQUENCY = 0.6;
const SPECKLE_PIXELS = 96;
const INSIDE = [0, 0, 0];

const MANDELBROT = {
  folded: false,
  whole: { cx: -0.6, cy: 0, width: 2.6 },
  region: { left: -2, right: 0.5, top: -1.2, bottom: 1.2 },
  landmarks: [],
  landmarkShare: 0,
  palette: [
    [0, 7, 100],
    [32, 107, 203],
    [237, 255, 255],
    [255, 170, 0],
    [0, 2, 0],
  ],
};

const BURNING_SHIP = {
  folded: true,
  whole: { cx: -0.45, cy: -0.5, width: 3 },
  region: { left: -2.1, right: 1, top: -1.8, bottom: 0.6 },
  landmarks: [{ cx: -1.762, cy: -0.028, width: 0.1 }],
  landmarkShare: 0.5,
  palette: [
    [0, 0, 0],
    [90, 10, 0],
    [220, 80, 0],
    [255, 200, 60],
    [255, 255, 220],
  ],
};

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeTime(cx, cy, folded) {
  let x = 0;
  let y = 0;
  for (let n = 0; n < MAX_ITERATIONS; n++) {
    const xx = x * x;
    const yy = y * y;
    if (xx + yy > 256) return n + 1 - Math.log2(Math.log2(xx + yy) / 2);
    y = folded ? 2 * Math.abs(x * y) + cy : 2 * x * y + cy;
    x = xx - yy + cx;
  }
  return -1;
}

function pickView(fractal, random) {
  const { whole, region, landmarks, landmarkShare, folded } = fractal;
  if (random() < WHOLE_SET_SHARE) return { cx: whole.cx + (random() - 0.5) * 0.3, cy: whole.cy + (random() - 0.5) * 0.3, width: whole.width + random() * 0.6 };
  const nearLandmark = landmarks.length && random() < landmarkShare ? landmarks[Math.floor(random() * landmarks.length)] : null;
  for (;;) {
    const view = nearLandmark ? viewNear(nearLandmark, random) : viewIn(region, random);
    if (escapeTime(view.cx, view.cy, folded) > 25 && hasDetail(view, folded) && !isSpeckled(view, folded)) return view;
  }
}

function viewNear(landmark, random) {
  const width = landmark.width * 10 ** (-1.5 + random() * 1.5);
  return { cx: landmark.cx + (random() - 0.5) * width, cy: landmark.cy + (random() - 0.5) * width, width };
}

function viewIn(region, random) {
  return {
    cx: region.left + random() * (region.right - region.left),
    cy: region.top + random() * (region.bottom - region.top),
    width: 10 ** (-3.2 + random() * 3),
  };
}

function probeTimes({ cx, cy, width }, folded, nudge = 0) {
  const times = [];
  for (let row = 0; row < PROBES; row++) {
    for (let column = 0; column < PROBES; column++) {
      times.push(escapeTime(cx + (column / (PROBES - 1) - 0.5) * width + nudge, cy + (row / (PROBES - 1) - 0.5) * width, folded));
    }
  }
  return times;
}

function hasDetail(view, folded) {
  const times = probeTimes(view, folded);
  const inside = times.filter((time) => time < 0).length;
  const outside = times.filter((time) => time >= 0);
  const spread = outside.length ? Math.max(...outside) - Math.min(...outside) : 0;
  return inside < times.length * 0.6 && (inside > 0 || spread > 40);
}

const band = (time) => Math.sqrt(time) * BAND_FREQUENCY;

function isSpeckled(view, folded) {
  const here = probeTimes(view, folded);
  const nextPixel = probeTimes(view, folded, view.width / SPECKLE_PIXELS);
  const jumps = here.filter((time, index) => {
    const other = nextPixel[index];
    if (time < 0 || other < 0) return (time < 0) !== (other < 0);
    return Math.abs(band(time) - band(other)) > 0.2;
  }).length;
  return jumps > here.length * 0.25;
}

function colorOf(time, phase, palette) {
  if (time < 0) return INSIDE;
  const along = (((band(time) + phase) % 1) + 1) % 1;
  const scaled = along * palette.length;
  const from = palette[Math.floor(scaled)];
  const to = palette[(Math.floor(scaled) + 1) % palette.length];
  const mix = scaled - Math.floor(scaled);
  return from.map((channel, index) => channel + (to[index] - channel) * mix);
}

function drawFractal(fractal, seed, size) {
  const random = createRandom(seed);
  const { cx, cy, width } = pickView(fractal, random);
  const phase = random();
  const samples = size < SUPERSAMPLE_BELOW ? 2 : 1;
  const step = width / (size * samples);
  const rgb = new Uint8Array(size * size * 3);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const total = [0, 0, 0];
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = cx + ((column * samples + sx + 0.5) - (size * samples) / 2) * step;
          const y = cy + ((row * samples + sy + 0.5) - (size * samples) / 2) * step;
          colorOf(escapeTime(x, y, fractal.folded), phase, fractal.palette).forEach((channel, index) => { total[index] += channel; });
        }
      }
      rgb.set(total.map((channel) => Math.round(channel / (samples * samples))), (row * size + column) * 3);
    }
  }
  return { size, rgb };
}

export const drawMandelbrot = (seed, size) => drawFractal(MANDELBROT, seed, size);
export const drawBurningShip = (seed, size) => drawFractal(BURNING_SHIP, seed, size);
