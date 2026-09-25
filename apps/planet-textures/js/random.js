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
  const between = (min, max) => min + next() * (max - min);
  return { next, integer, between };
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function shuffledPermutation(seed) {
  const { integer } = createRandom(seed);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = integer(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const permutation = new Uint8Array(512);
  for (let i = 0; i < 512; i++) permutation[i] = order[i & 255];
  return permutation;
}

function gradient(hash, x, y, z) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}

export function createNoise(seed, octaves) {
  const p = shuffledPermutation(seed);

  const perlin = (x, y, z) => {
    const floorX = Math.floor(x);
    const floorY = Math.floor(y);
    const floorZ = Math.floor(z);
    const cellX = floorX & 255;
    const cellY = floorY & 255;
    const cellZ = floorZ & 255;
    x -= floorX;
    y -= floorY;
    z -= floorZ;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const a = p[cellX] + cellY;
    const aa = p[a] + cellZ;
    const ab = p[a + 1] + cellZ;
    const b = p[cellX + 1] + cellY;
    const ba = p[b] + cellZ;
    const bb = p[b + 1] + cellZ;
    return lerp(
      lerp(
        lerp(gradient(p[aa], x, y, z), gradient(p[ba], x - 1, y, z), u),
        lerp(gradient(p[ab], x, y - 1, z), gradient(p[bb], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(gradient(p[aa + 1], x, y, z - 1), gradient(p[ba + 1], x - 1, y, z - 1), u),
        lerp(gradient(p[ab + 1], x, y - 1, z - 1), gradient(p[bb + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  };

  let amplitudeSum = 0;
  for (let octave = 0; octave < octaves; octave++) amplitudeSum += 0.5 ** octave;

  return (x, y, z) => {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    for (let octave = 0; octave < octaves; octave++) {
      total += perlin(x * frequency, y * frequency, z * frequency) * amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return Math.min(1, Math.max(0, 0.5 + total / amplitudeSum));
  };
}
