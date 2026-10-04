const MAX_ITERATIONS = 600;
const SUPERSAMPLE_BELOW = 192;
const WHOLE_SET_SHARE = 0.2;
const PROBES = 7;
const PALETTE = [
  [0, 7, 100],
  [32, 107, 203],
  [237, 255, 255],
  [255, 170, 0],
  [0, 2, 0],
];
const INSIDE = [0, 0, 0];

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

function escapeTime(cx, cy) {
  let x = 0;
  let y = 0;
  for (let n = 0; n < MAX_ITERATIONS; n++) {
    const xx = x * x;
    const yy = y * y;
    if (xx + yy > 256) return n + 1 - Math.log2(Math.log2(xx + yy) / 2);
    y = 2 * x * y + cy;
    x = xx - yy + cx;
  }
  return -1;
}

function pickView(random) {
  if (random() < WHOLE_SET_SHARE) return { cx: -0.6 + (random() - 0.5) * 0.3, cy: (random() - 0.5) * 0.3, width: 2.6 + random() * 0.6 };
  for (;;) {
    const view = { cx: -2 + random() * 2.5, cy: (random() - 0.5) * 2.4, width: 10 ** (-3.2 + random() * 3) };
    if (escapeTime(view.cx, view.cy) > 25 && hasDetail(view)) return view;
  }
}

function hasDetail({ cx, cy, width }) {
  const times = [];
  for (let row = 0; row < PROBES; row++) {
    for (let column = 0; column < PROBES; column++) {
      times.push(escapeTime(cx + (column / (PROBES - 1) - 0.5) * width, cy + (row / (PROBES - 1) - 0.5) * width));
    }
  }
  const inside = times.filter((time) => time < 0).length;
  const outside = times.filter((time) => time >= 0);
  const spread = outside.length ? Math.max(...outside) - Math.min(...outside) : 0;
  return inside < times.length * 0.6 && (inside > 0 || spread > 40);
}

function colorOf(time, phase) {
  if (time < 0) return INSIDE;
  const along = (((Math.sqrt(time) * 0.6 + phase) % 1) + 1) % 1;
  const scaled = along * PALETTE.length;
  const from = PALETTE[Math.floor(scaled)];
  const to = PALETTE[(Math.floor(scaled) + 1) % PALETTE.length];
  const mix = scaled - Math.floor(scaled);
  return from.map((channel, index) => channel + (to[index] - channel) * mix);
}

export function drawMandelbrot(seed, size) {
  const random = createRandom(seed);
  const { cx, cy, width } = pickView(random);
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
          colorOf(escapeTime(x, y), phase).forEach((channel, index) => { total[index] += channel; });
        }
      }
      rgb.set(total.map((channel) => Math.round(channel / (samples * samples))), (row * size + column) * 3);
    }
  }
  return { size, rgb };
}
