export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(random) {
  let u = 0;
  while (u === 0) u = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

export function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function fractalNoise(seed) {
  const size = 256;
  const random = seededRandom(seed);
  const table = new Float64Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = random();
  const smooth = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => table[(y & (size - 1)) * size + (x & (size - 1))];
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  return (x, y, octaves = 4) => {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * noise(x * frequency + o * 17.3, y * frequency - o * 9.1);
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum;
  };
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

export function mix(a, b, t) {
  return a.map((v, k) => v + (b[k] - v) * t);
}

export function surfaceFlux(magPerArcsec2) {
  return 10 ** (-0.4 * magPerArcsec2);
}
