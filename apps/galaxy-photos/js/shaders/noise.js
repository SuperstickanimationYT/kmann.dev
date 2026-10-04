export const NOISE = `
uint hashUint(uint x) {
  x ^= x >> 16;
  x *= 0x7feb352du;
  x ^= x >> 15;
  x *= 0x846ca68bu;
  x ^= x >> 16;
  return x;
}

uint hashCell(ivec2 cell, uint seed) {
  return hashUint(uint(cell.x) + hashUint(uint(cell.y) + hashUint(seed)));
}

float unitFrom(uint h) {
  return float(h) / 4294967295.0;
}

float hashCell1(ivec2 cell, uint seed) {
  return unitFrom(hashCell(cell, seed));
}

vec2 hashCell2(ivec2 cell, uint seed) {
  uint h = hashCell(cell, seed);
  return vec2(unitFrom(h), unitFrom(hashUint(h)));
}

float gradientNoise(vec2 p, uint seed) {
  ivec2 cell = ivec2(floor(p));
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float corners[4];
  for (int i = 0; i < 4; i++) {
    ivec2 offset = ivec2(i & 1, i >> 1);
    float angle = 6.2831853 * hashCell1(cell + offset, seed);
    corners[i] = dot(vec2(cos(angle), sin(angle)), f - vec2(offset));
  }
  return 1.4 * mix(mix(corners[0], corners[1], u.x), mix(corners[2], corners[3], u.x), u.y);
}

const mat2 OCTAVE_TURN = mat2(0.8, -0.6, 0.6, 0.8) * 2.03;

float fbm(vec2 p, uint seed, int octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < octaves; i++) {
    total += amplitude * gradientNoise(p, seed + uint(i) * 101u);
    p = OCTAVE_TURN * p;
    amplitude *= 0.5;
  }
  return total;
}

float ridged(vec2 p, uint seed, int octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  float weight = 1.0;
  for (int i = 0; i < octaves; i++) {
    float ridge = 1.0 - abs(gradientNoise(p, seed + uint(i) * 131u));
    ridge *= ridge * weight;
    weight = clamp(ridge * 1.6, 0.0, 1.0);
    total += amplitude * ridge;
    p = OCTAVE_TURN * p;
    amplitude *= 0.5;
  }
  return total;
}

float clumps(vec2 p, float cellSize, float spread, float heaviness, uint seed) {
  vec2 g = p / cellSize;
  ivec2 cell = ivec2(floor(g));
  vec2 f = fract(g);
  float total = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      ivec2 neighbour = cell + ivec2(i, j);
      vec2 offset = vec2(i, j) + hashCell2(neighbour, seed) - f;
      float brightness = pow(hashCell1(neighbour, seed + 77u), heaviness);
      float size = spread * (0.45 + 0.9 * hashCell1(neighbour, seed + 191u));
      total += brightness * exp(-dot(offset, offset) / (size * size));
    }
  }
  return total;
}
`;
