export const KPC_PER_SIM_UNIT = 3 / 50;
export const MERGER_RMAX = 60;
export const FIELD_GRID = 1024;

const HEAT_GRID = 96;
const BLUR_KPC = { small: 0.35, medium: 0.9, large: 3 };
const STARS_FOR_SHARP_DETAIL = 10;
const COLD_DISK_HEIGHT_KPC = 0.35;
const HEIGHT_RANGE_KPC = [0.2, 7];
const TRUSTED_HEIGHT_SHARE = 0.5;
const DISK_SCALE_KPC = 3;
const CORE_SEARCH_REACHES = [300, 150, 60, 30];
const ROTATION_REACH = 100;
const FLOATS_PER_STAR = 4;

function boxBlurLine(from, to, start, stride, length, radius) {
  const width = 2 * radius + 1;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += from[start + Math.min(length - 1, Math.max(0, i)) * stride];
  for (let i = 0; i < length; i++) {
    to[start + i * stride] = sum / width;
    sum += from[start + Math.min(length - 1, i + radius + 1) * stride] - from[start + Math.max(0, i - radius) * stride];
  }
}

function blur(grid, size, sigmaCells) {
  const passes = 3;
  const radius = Math.max(0, Math.round((Math.sqrt((12 * sigmaCells * sigmaCells) / passes + 1) - 1) / 2));
  if (!radius) return grid;
  const scratch = new Float32Array(grid.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let row = 0; row < size; row++) boxBlurLine(grid, scratch, row * size, 1, size, radius);
    for (let column = 0; column < size; column++) boxBlurLine(scratch, grid, column, size, size, radius);
  }
  return grid;
}

function splat(grid, size, x, y, weight) {
  const cx = ((x / MERGER_RMAX) * 0.5 + 0.5) * size - 0.5;
  const cy = ((y / MERGER_RMAX) * 0.5 + 0.5) * size - 0.5;
  const [left, top] = [Math.floor(cx), Math.floor(cy)];
  if (left < 0 || top < 0 || left + 1 >= size || top + 1 >= size) return;
  const [right, down] = [cx - left, cy - top];
  const at = top * size + left;
  grid[at] += weight * (1 - right) * (1 - down);
  grid[at + 1] += weight * right * (1 - down);
  grid[at + size] += weight * (1 - right) * down;
  grid[at + size + 1] += weight * right * down;
}

function sampleBilinear(grid, size, u, v) {
  const [cx, cy] = [u * size - 0.5, v * size - 0.5];
  const left = Math.max(0, Math.min(size - 2, Math.floor(cx)));
  const top = Math.max(0, Math.min(size - 2, Math.floor(cy)));
  const [right, down] = [Math.min(1, Math.max(0, cx - left)), Math.min(1, Math.max(0, cy - top))];
  const at = top * size + left;
  return (grid[at] * (1 - right) + grid[at + 1] * right) * (1 - down) + (grid[at + size] * (1 - right) + grid[at + size + 1] * right) * down;
}

const starAt = (stars, i, centre = { x: 0, y: 0 }) => ({
  x: stars[i * FLOATS_PER_STAR] - centre.x,
  y: stars[i * FLOATS_PER_STAR + 1] - centre.y,
  vx: stars[i * FLOATS_PER_STAR + 2],
  vy: stars[i * FLOATS_PER_STAR + 3],
});

function membersOf(stars, galaxies, which, centre) {
  const members = [];
  for (let i = 0; i < galaxies.length; i++) if (galaxies[i] === which) members.push(starAt(stars, i, centre));
  return members;
}

function midpointOfCores(stars, galaxies) {
  const [a, b] = [0, 1].map((which) => coreOf(membersOf(stars, galaxies, which)));
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function coreOf(members) {
  let x = members.reduce((sum, star) => sum + star.x, 0) / members.length;
  let y = members.reduce((sum, star) => sum + star.y, 0) / members.length;
  for (const reach of CORE_SEARCH_REACHES) {
    const near = members.filter((star) => Math.hypot(star.x - x, star.y - y) <= reach);
    if (!near.length) break;
    x = near.reduce((sum, star) => sum + star.x, 0) / near.length;
    y = near.reduce((sum, star) => sum + star.y, 0) / near.length;
  }
  return { x, y };
}

function rotationalOrder(members, core) {
  const near = members.filter((star) => Math.hypot(star.x - core.x, star.y - core.y) <= ROTATION_REACH);
  const driftX = near.reduce((sum, star) => sum + star.vx, 0) / near.length;
  const driftY = near.reduce((sum, star) => sum + star.vy, 0) / near.length;
  let [spin, mostSpin] = [0, 0];
  for (const star of near) {
    const [dx, dy, dvx, dvy] = [star.x - core.x, star.y - core.y, star.vx - driftX, star.vy - driftY];
    spin += dx * dvy - dy * dvx;
    mostSpin += Math.hypot(dx, dy) * Math.hypot(dvx, dvy);
  }
  return mostSpin ? Math.abs(spin / mostSpin) : 0;
}

function roughHeights(stars, count, centre) {
  const cellKpc = (2 * MERGER_RMAX) / HEAT_GRID;
  const [mass, vx, vy, speedSquared] = [0, 0, 0, 0].map(() => new Float32Array(HEAT_GRID * HEAT_GRID));
  for (let i = 0; i < count; i++) {
    const star = starAt(stars, i, centre);
    const [x, y] = [star.x * KPC_PER_SIM_UNIT, star.y * KPC_PER_SIM_UNIT];
    splat(mass, HEAT_GRID, x, y, 1);
    splat(vx, HEAT_GRID, x, y, star.vx);
    splat(vy, HEAT_GRID, x, y, star.vy);
    splat(speedSquared, HEAT_GRID, x, y, star.vx * star.vx + star.vy * star.vy);
  }
  [mass, vx, vy, speedSquared].forEach((grid) => blur(grid, HEAT_GRID, 1.2));
  const heights = new Float32Array(HEAT_GRID * HEAT_GRID);
  for (let cell = 0; cell < heights.length; cell++) {
    if (mass[cell] < 0.5) continue;
    const ordered = (vx[cell] / mass[cell]) ** 2 + (vy[cell] / mass[cell]) ** 2;
    const randomSquared = Math.max(0, speedSquared[cell] / mass[cell] - ordered);
    heights[cell] = randomSquared / (mass[cell] / cellKpc ** 2);
  }
  return { heights, mass };
}

function weightedMedian(values, weights) {
  const order = [...values.keys()].filter((i) => weights[i] > 0.5).sort((a, b) => values[a] - values[b]);
  const total = order.reduce((sum, i) => sum + weights[i], 0);
  let running = 0;
  for (const i of order) if ((running += weights[i]) >= total / 2) return values[i];
  return 1;
}

export function heightCalibration(stars, galaxies) {
  const { heights, mass } = roughHeights(stars, galaxies.length, midpointOfCores(stars, galaxies));
  return COLD_DISK_HEIGHT_KPC / weightedMedian(heights, mass);
}

const quantile = (sorted, share) => sorted[Math.floor(sorted.length * share)] ?? 0;

export function buildStarField(stars, galaxies, kpcPerRoughHeight) {
  const count = galaxies.length;
  const centre = midpointOfCores(stars, galaxies);
  const cellKpc = (2 * MERGER_RMAX) / FIELD_GRID;
  const centralDensity = count / 2 / (2 * Math.PI * DISK_SCALE_KPC ** 2);
  const sharpDensity = STARS_FOR_SHARP_DETAIL / (2 * Math.PI * BLUR_KPC.small ** 2) / centralDensity;

  const raw = new Float32Array(FIELD_GRID * FIELD_GRID);
  const memberRaw = [new Float32Array(raw.length), new Float32Array(raw.length)];
  for (let i = 0; i < count; i++) {
    const star = starAt(stars, i, centre);
    const [x, y] = [star.x * KPC_PER_SIM_UNIT, star.y * KPC_PER_SIM_UNIT];
    splat(raw, FIELD_GRID, x, y, 1 / (cellKpc * cellKpc * centralDensity));
    splat(memberRaw[galaxies[i]], FIELD_GRID, x, y, 1);
  }
  const [small, medium, large] = [BLUR_KPC.small, BLUR_KPC.medium, BLUR_KPC.large].map((kpc) => blur(raw.slice(), FIELD_GRID, kpc / cellKpc));
  memberRaw.forEach((grid) => blur(grid, FIELD_GRID, BLUR_KPC.large / cellKpc));
  const { heights: rough } = roughHeights(stars, count, centre);

  const light = new Float32Array(FIELD_GRID * FIELD_GRID * 4);
  const members = new Float32Array(FIELD_GRID * FIELD_GRID * 4);
  const litHeights = [];
  for (let row = 0; row < FIELD_GRID; row++) {
    for (let column = 0; column < FIELD_GRID; column++) {
      const cell = row * FIELD_GRID + column;
      const estimated = kpcPerRoughHeight * sampleBilinear(rough, HEAT_GRID, (column + 0.5) / FIELD_GRID, (row + 0.5) / FIELD_GRID);
      const clamped = Math.min(HEIGHT_RANGE_KPC[1], Math.max(HEIGHT_RANGE_KPC[0], estimated));
      const trusted = Math.min(1, large[cell] / (TRUSTED_HEIGHT_SHARE * sharpDensity));
      const height = COLD_DISK_HEIGHT_KPC + (clamped - COLD_DISK_HEIGHT_KPC) * trusted;
      light.set([small[cell], medium[cell], large[cell], height], cell * 4);
      members.set([memberRaw[0][cell], memberRaw[1][cell], 0, 0], cell * 4);
      if (medium[cell] > 0.05) litHeights.push(height);
    }
  }
  litHeights.sort((a, b) => a - b);

  const galaxyStars = [0, 1].map((which) => membersOf(stars, galaxies, which, centre));
  const cores = galaxyStars.map(coreOf);
  return {
    light,
    members,
    sharpDensity,
    cores: cores.map(({ x, y }) => [x * KPC_PER_SIM_UNIT, y * KPC_PER_SIM_UNIT]),
    order: galaxyStars.map((members, which) => rotationalOrder(members, cores[which])),
    typicalHeight: quantile(litHeights, 0.5),
    tallHeight: quantile(litHeights, 0.9),
  };
}
