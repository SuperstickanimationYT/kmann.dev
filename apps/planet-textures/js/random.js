export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(next() * (max - min + 1));
  return { next, integer };
}

const GRADIENTS = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

export function createNoise(seed, octaves) {
  const { integer } = createRandom(seed);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = integer(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const permutation = new Uint8Array(512);
  for (let i = 0; i < 512; i++) permutation[i] = order[i & 255];

  const corner = (cellX, cellY, dx, dy) => {
    const [gx, gy] = GRADIENTS[permutation[permutation[cellX] + cellY] & 7];
    return gx * dx + gy * dy;
  };

  const perlin = (x, y) => {
    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const cellX = floorX & 255;
    const cellY = floorY & 255;
    const dx = x - floorX;
    const dy = y - floorY;
    const u = fade(dx);
    const v = fade(dy);
    return lerp(
      lerp(corner(cellX, cellY, dx, dy), corner(cellX + 1, cellY, dx - 1, dy), u),
      lerp(corner(cellX, cellY + 1, dx, dy - 1), corner(cellX + 1, cellY + 1, dx - 1, dy - 1), u),
      v,
    );
  };

  let amplitudeSum = 0;
  for (let octave = 0; octave < octaves; octave++) amplitudeSum += 0.5 ** octave;

  return (x, y) => {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave++) {
      total += perlin(x * frequency, y * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return Math.min(1, Math.max(0, 0.5 + total / amplitudeSum));
  };
}
