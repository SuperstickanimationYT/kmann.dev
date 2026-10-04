const GROUND_LEVEL = 0.84;
const WALL_COLORS = ['#f2ece0', '#e8d8b0', '#b5523b', '#8fa9c8', '#e9c46a', '#a9a9a9', '#f4f1ea'];
const ROOF_COLORS = ['#7a2e22', '#4a3b33', '#3f4b5a', '#5c5c5c', '#8a4b2a'];
const DOOR_COLORS = ['#5b3a1e', '#2f4f6f', '#7a1f1f', '#2e5d3a'];
const LEAF_PALETTES = [
  ['#2f6b2a', '#3f8a35', '#5aa845', '#24521f'],
  ['#3d7a2f', '#6a9e3a', '#2b5a26', '#88b04b'],
  ['#c4622d', '#e0952f', '#a8401f', '#d9b23a'],
];

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

const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, low, high) => low + random() * (high - low);

function paintSkyAndGround(context, random) {
  const sky = context.createLinearGradient(0, 0, 0, GROUND_LEVEL);
  sky.addColorStop(0, pick(random, ['#5b8fd6', '#6aa3e0', '#7fb2e8']));
  sky.addColorStop(1, pick(random, ['#cfe3f5', '#dcebf7', '#bcd6f0']));
  context.fillStyle = sky;
  context.fillRect(0, 0, 1, GROUND_LEVEL);
  context.fillStyle = pick(random, ['#4f8a3a', '#5e9a44', '#6b8f3a']);
  context.fillRect(0, GROUND_LEVEL, 1, 1 - GROUND_LEVEL);
}

function readPixels(canvas, size) {
  const rgba = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) rgb.set(rgba.subarray(i * 4, i * 4 + 3), i * 3);
  return { size, rgb };
}

function onCanvas(size, paint) {
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(size, size);
  paint(context);
  return readPixels(canvas, size);
}

function paintHouse(context, random) {
  paintSkyAndGround(context, random);
  const width = between(random, 0.5, 0.78);
  const floors = random() < 0.5 ? 1 : 2;
  const height = floors === 1 ? between(random, 0.26, 0.32) : between(random, 0.38, 0.46);
  const left = 0.5 - width / 2 + between(random, -0.06, 0.06);
  const top = GROUND_LEVEL - height;
  const roofColor = pick(random, ROOF_COLORS);

  if (random() < 0.25) {
    context.fillStyle = roofColor;
    context.fillRect(left - 0.02, top - 0.03, width + 0.04, 0.03);
  } else {
    const roofHeight = between(random, 0.14, 0.24);
    if (random() < 0.5) {
      context.fillStyle = '#6b4a3a';
      context.fillRect(left + width * between(random, 0.6, 0.8), top - roofHeight * 0.85, 0.05, roofHeight * 0.7);
    }
    context.fillStyle = roofColor;
    context.beginPath();
    context.moveTo(left - 0.04, top);
    context.lineTo(left + width / 2, top - roofHeight);
    context.lineTo(left + width + 0.04, top);
    context.closePath();
    context.fill();
  }

  context.fillStyle = pick(random, WALL_COLORS);
  context.fillRect(left, top, width, height);

  const columns = Math.floor(between(random, 2, 4.99));
  const glass = pick(random, ['#9fc6e6', '#5f7f9f', '#cfe6f5']);
  const windowWidth = (width / columns) * 0.5;
  const windowHeight = (height / floors) * 0.45;
  const doorColumn = Math.floor(random() * columns);
  for (let floor = 0; floor < floors; floor++) {
    for (let column = 0; column < columns; column++) {
      const centerX = left + (width / columns) * (column + 0.5);
      const floorTop = top + (height / floors) * floor;
      if (floor === floors - 1 && column === doorColumn) {
        const doorHeight = (height / floors) * 0.72;
        context.fillStyle = pick(random, DOOR_COLORS);
        context.fillRect(centerX - windowWidth * 0.45, GROUND_LEVEL - doorHeight, windowWidth * 0.9, doorHeight);
        continue;
      }
      const windowTop = floorTop + (height / floors) * 0.25;
      context.fillStyle = '#fafafa';
      context.fillRect(centerX - windowWidth / 2 - 0.008, windowTop - 0.008, windowWidth + 0.016, windowHeight + 0.016);
      context.fillStyle = glass;
      context.fillRect(centerX - windowWidth / 2, windowTop, windowWidth, windowHeight);
    }
  }
}

function paintBranch(context, random, leaves, x, y, angle, length, thickness, depth) {
  const endX = x + Math.sin(angle) * length;
  const endY = y - Math.cos(angle) * length;
  context.strokeStyle = '#5a3d26';
  context.lineWidth = thickness;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(endX, endY);
  context.stroke();
  if (depth === 0) {
    leaves.push({ x: endX, y: endY, radius: between(random, 0.07, 0.11) });
    return;
  }
  const forks = random() < 0.3 ? 3 : 2;
  for (let fork = 0; fork < forks; fork++) {
    const spread = between(random, 0.3, 0.6) * (fork - (forks - 1) / 2) * 2;
    paintBranch(context, random, leaves, endX, endY, angle + spread + between(random, -0.15, 0.15), length * between(random, 0.65, 0.8), thickness * 0.68, depth - 1);
  }
}

function paintTree(context, random) {
  paintSkyAndGround(context, random);
  const leaves = [];
  const baseX = 0.5 + between(random, -0.08, 0.08);
  const trunkLength = between(random, 0.2, 0.28);
  paintBranch(context, random, leaves, baseX, GROUND_LEVEL + 0.02, between(random, -0.08, 0.08), trunkLength, between(random, 0.04, 0.06), 4);
  const palette = random() < 0.75 ? pick(random, LEAF_PALETTES.slice(0, 2)) : LEAF_PALETTES[2];
  for (const leaf of leaves) {
    for (let clump = 0; clump < 5; clump++) {
      context.fillStyle = pick(random, palette);
      context.beginPath();
      context.arc(leaf.x + between(random, -0.05, 0.05), leaf.y + between(random, -0.05, 0.05), leaf.radius * between(random, 0.6, 1), 0, Math.PI * 2);
      context.fill();
    }
  }
}

export const drawHouse = (seed, size) => onCanvas(size, (context) => paintHouse(context, createRandom(seed)));
export const drawTree = (seed, size) => onCanvas(size, (context) => paintTree(context, createRandom(seed)));
