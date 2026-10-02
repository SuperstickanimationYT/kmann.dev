const PIXELS_PER_CELL = 3;
const BOX_PASSES = 3;
const BLUR_PER_SOFTENING = { detail: 0.4, medium: 1.2, surroundings: 3 };
const STARS_FOR_SHARP_DETAIL = 6;
const SMALLEST_BLUR_CELLS = 1.2;
const FAINT_DENSITY = 0.0003;
const FULL_DENSITY = 0.3;
const WARM_DENSITY = { from: 0.01, to: 0.15 };
const CROWDING_FOR_FULL_YOUNG_LIGHT = 0.6;
const YOUNG_LIGHT_BOOST = 0.5;
const CORE = [255, 220, 170];
const DISK = [170, 190, 255];
const YOUNG = [205, 225, 255];

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, along) => a + (b - a) * along;

function boxBlurLine(from, to, start, stride, length, radius) {
  const width = 2 * radius + 1;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += from[start + Math.min(length - 1, Math.max(0, i)) * stride];
  for (let i = 0; i < length; i++) {
    to[start + i * stride] = sum / width;
    const leaving = from[start + Math.max(0, i - radius) * stride];
    const entering = from[start + Math.min(length - 1, i + radius + 1) * stride];
    sum += entering - leaving;
  }
}

function blur(grid, scratch, columns, rows, sigmaCells) {
  const boxWidth = Math.sqrt((12 * sigmaCells * sigmaCells) / BOX_PASSES + 1);
  const radius = Math.max(0, Math.round((boxWidth - 1) / 2));
  if (radius === 0) return;
  for (let pass = 0; pass < BOX_PASSES; pass++) {
    for (let row = 0; row < rows; row++) boxBlurLine(grid, scratch, row * columns, 1, columns, radius);
    for (let column = 0; column < columns; column++) boxBlurLine(scratch, grid, column, columns, rows, radius);
  }
}

export function createGlow() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  let columns = 0;
  let rows = 0;
  let detail, medium, surroundings, scratch, image;

  function fit(width, height) {
    const [neededColumns, neededRows] = [Math.ceil(width / PIXELS_PER_CELL), Math.ceil(height / PIXELS_PER_CELL)];
    if (neededColumns === columns && neededRows === rows) return;
    [columns, rows] = [neededColumns, neededRows];
    [detail, medium, surroundings, scratch] = [0, 0, 0, 0].map(() => new Float32Array(columns * rows));
    canvas.width = columns;
    canvas.height = rows;
    image = context.createImageData(columns, rows);
  }

  function splat(stars, toScreen) {
    detail.fill(0);
    for (const star of stars) {
      const [sx, sy] = toScreen(star.x, star.y);
      const [cx, cy] = [sx / PIXELS_PER_CELL - 0.5, sy / PIXELS_PER_CELL - 0.5];
      const [left, top] = [Math.floor(cx), Math.floor(cy)];
      if (left < 0 || top < 0 || left + 1 >= columns || top + 1 >= rows) continue;
      const [right, down] = [cx - left, cy - top];
      const at = top * columns + left;
      detail[at] += star.mass * (1 - right) * (1 - down);
      detail[at + 1] += star.mass * right * (1 - down);
      detail[at + columns] += star.mass * (1 - right) * down;
      detail[at + columns + 1] += star.mass * right * down;
    }
  }

  function paint(cellArea, starMass, detailBlurWorld) {
    const pixels = image.data;
    const fullBrightness = Math.asinh(FULL_DENSITY / FAINT_DENSITY);
    const warmSpan = Math.log(WARM_DENSITY.to / WARM_DENSITY.from);
    const sharpFromDensity = (STARS_FOR_SHARP_DETAIL * starMass) / (2 * Math.PI * detailBlurWorld ** 2);
    for (let cell = 0; cell < detail.length; cell++) {
      const sharpness = clamp01(medium[cell] / cellArea / sharpFromDensity);
      const density = mix(medium[cell], detail[cell], sharpness) / cellArea;
      const crowding = surroundings[cell] > 0 ? clamp01((medium[cell] / surroundings[cell] - 1) / CROWDING_FOR_FULL_YOUNG_LIGHT) : 0;
      const warmth = density > 0 ? clamp01(Math.log(density / WARM_DENSITY.from) / warmSpan) : 0;
      const youngLight = crowding * (1 - warmth);
      const brightness = Math.min(1, (Math.asinh(density / FAINT_DENSITY) / fullBrightness) * (1 + YOUNG_LIGHT_BOOST * youngLight));
      const pixel = cell * 4;
      for (let channel = 0; channel < 3; channel++) {
        const colour = mix(mix(DISK[channel], CORE[channel], warmth), YOUNG[channel], youngLight);
        pixels[pixel + channel] = colour * brightness;
      }
      pixels[pixel + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }

  function draw(target, stars, { toScreen, zoom, width, height }) {
    if (!stars.length) return;
    fit(width, height);
    splat(stars, toScreen);
    medium.set(detail);
    surroundings.set(detail);
    const [{ mass, softening }] = stars;
    const blurCells = (scale) => Math.max(SMALLEST_BLUR_CELLS, (scale * softening * zoom) / PIXELS_PER_CELL);
    blur(detail, scratch, columns, rows, blurCells(BLUR_PER_SOFTENING.detail));
    blur(medium, scratch, columns, rows, blurCells(BLUR_PER_SOFTENING.medium));
    blur(surroundings, scratch, columns, rows, blurCells(BLUR_PER_SOFTENING.surroundings));
    paint((PIXELS_PER_CELL / zoom) ** 2, mass, BLUR_PER_SOFTENING.detail * softening);
    target.save();
    target.globalCompositeOperation = 'lighter';
    target.imageSmoothingEnabled = true;
    target.drawImage(canvas, 0, 0, columns * PIXELS_PER_CELL, rows * PIXELS_PER_CELL);
    target.restore();
  }

  return { draw };
}
