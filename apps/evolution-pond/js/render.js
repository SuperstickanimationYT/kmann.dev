import { radiusOf, WORLD_HEIGHT, WORLD_WIDTH } from './world.js';

const DEEP_WATER = [3, 10, 22];
const LIT_WATER = [22, 74, 112];
const NUTRIENT_GLOW = [170, 110, 30];
const SMALLEST_DRAWN_RADIUS_PX = 2;
const PICK_REACH_PX = 10;

const COLOUR_LEVELS = 8;
const HUE_STEP_DEGREES = 10;
const ARMOR_LEVELS = 4;
const quantise = (value) => Math.round(value * COLOUR_LEVELS) / COLOUR_LEVELS;

export function dietColour(type) {
  const red = Math.round(50 + 205 * quantise(type.predation));
  const green = Math.round(50 + 205 * quantise(type.photosynthesis));
  const blue = Math.round(60 + 156 * quantise(type.absorption));
  return `rgb(${red}, ${green}, ${blue})`;
}

export function lineageColour(genome) {
  return `hsl(${Math.round(genome.hue / HUE_STEP_DEGREES) * HUE_STEP_DEGREES}, 75%, 62%)`;
}

const SIGNAL_LEVELS = 4;
const SIGNAL_REST = [140, 148, 158];
const SIGNAL_HIGH = [255, 150, 50];
const SIGNAL_LOW = [70, 140, 255];

function signalColour(signal) {
  const end = signal > 0 ? SIGNAL_HIGH : SIGNAL_LOW;
  const amount = Math.abs(signal);
  const [red, green, blue] = SIGNAL_REST.map((rest, channel) => Math.round(rest + (end[channel] - rest) * amount));
  return `rgb(${red}, ${green}, ${blue})`;
}

const SIGNAL_COLOURS = Array.from({ length: 2 * SIGNAL_LEVELS + 1 }, (_, level) => signalColour((level - SIGNAL_LEVELS) / SIGNAL_LEVELS));

const COLOURINGS = {
  diet: { colourOf: dietColour, keyOf: (cell) => cell.type },
  lineage: { colourOf: lineageColour, keyOf: (cell) => cell.genome },
};
const colourCaches = { diet: new WeakMap(), lineage: new WeakMap() };

function colourFor(mode, cell) {
  if (mode === 'signal') return SIGNAL_COLOURS[Math.round(cell.signal * SIGNAL_LEVELS) + SIGNAL_LEVELS];
  const { colourOf, keyOf } = COLOURINGS[mode];
  const key = keyOf(cell);
  const cache = colourCaches[mode];
  let colour = cache.get(key);
  if (colour === undefined) {
    colour = colourOf(key);
    cache.set(key, colour);
  }
  return colour;
}

function groupBy(cells, keyOf) {
  const groups = new Map();
  for (const cell of cells) {
    const key = keyOf(cell);
    if (key === null) continue;
    const group = groups.get(key);
    if (group) group.push(cell);
    else groups.set(key, [cell]);
  }
  return groups;
}

export function createPondRenderer(canvas) {
  const context = canvas.getContext('2d');
  const water = document.createElement('canvas');
  const waterContext = water.getContext('2d');
  let waterPixels = null;
  const view = { scale: 1, left: 0, top: 0, width: 0, height: 0 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    view.width = box.width;
    view.height = box.height;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    view.scale = Math.min(box.width / WORLD_WIDTH, box.height / WORLD_HEIGHT);
    view.left = (box.width - WORLD_WIDTH * view.scale) / 2;
    view.top = (box.height - WORLD_HEIGHT * view.scale) / 2;
  }

  function paintWater(world) {
    const { field } = world;
    if (!waterPixels || water.width !== field.cols) {
      water.width = field.cols;
      water.height = field.rows;
      waterPixels = waterContext.createImageData(field.cols, field.rows);
    }
    const pixels = waterPixels.data;
    for (let row = 0; row < field.rows; row++) {
      const lit = Math.min(1, world.lightAt((row + 0.5) * field.cellSize));
      for (let col = 0; col < field.cols; col++) {
        const index = row * field.cols + col;
        const richness = Math.min(1, field.values[index] / (world.meanDensity * 3));
        for (let channel = 0; channel < 3; channel++) {
          const base = DEEP_WATER[channel] + (LIT_WATER[channel] - DEEP_WATER[channel]) * lit;
          pixels[index * 4 + channel] = base + NUTRIENT_GLOW[channel] * richness;
        }
        pixels[index * 4 + 3] = 255;
      }
    }
    waterContext.putImageData(waterPixels, 0, 0);
  }

  function draw(world, { colourMode, selectedId }) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, view.width, view.height);
    paintWater(world);
    context.save();
    context.translate(view.left, view.top);
    context.scale(view.scale, view.scale);
    context.imageSmoothingEnabled = true;
    context.drawImage(water, 0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.beginPath();
    context.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    context.clip();

    const smallestRadius = SMALLEST_DRAWN_RADIUS_PX / view.scale;
    const drawnRadius = (cell) => Math.max(smallestRadius, radiusOf(cell.mass));
    const traceCircles = (cells) => {
      context.beginPath();
      for (const cell of cells) {
        const radius = drawnRadius(cell);
        context.moveTo(cell.x + radius, cell.y);
        context.arc(cell.x, cell.y, radius, 0, Math.PI * 2);
      }
    };

    context.strokeStyle = 'rgba(220, 235, 255, 0.45)';
    context.lineWidth = 0.8;
    context.beginPath();
    for (const cell of world.cells) {
      const { motility } = cell.type;
      if (motility <= 0.05) continue;
      const tail = drawnRadius(cell) * (1 + 2.5 * motility);
      context.moveTo(cell.x, cell.y);
      context.lineTo(cell.x - Math.cos(cell.swimAngle) * tail, cell.y - Math.sin(cell.swimAngle) * tail);
    }
    context.stroke();

    context.strokeStyle = 'rgba(200, 225, 255, 0.55)';
    context.lineWidth = 1;
    context.beginPath();
    for (const cell of world.cells) {
      for (const partner of cell.bonds) {
        if (partner.id < cell.id || Math.abs(partner.x - cell.x) > WORLD_WIDTH / 2) continue;
        context.moveTo(cell.x, cell.y);
        context.lineTo(partner.x, partner.y);
      }
    }
    context.stroke();

    for (const [colour, cells] of groupBy(world.cells, (cell) => colourFor(colourMode, cell))) {
      context.fillStyle = colour;
      traceCircles(cells);
      context.fill();
    }

    const armorLevel = (cell) => (cell.type.armor > 0.15 ? Math.ceil(cell.type.armor * ARMOR_LEVELS) / ARMOR_LEVELS : null);
    for (const [level, cells] of groupBy(world.cells, armorLevel)) {
      context.strokeStyle = `rgba(235, 240, 250, ${(0.7 * level).toFixed(2)})`;
      context.lineWidth = 0.3 + 0.6 * level;
      traceCircles(cells);
      context.stroke();
    }

    const selected = selectedId === null ? null : world.findCell(selectedId);
    if (selected) {
      context.strokeStyle = '#5fe3ff';
      context.lineWidth = 1.5 / view.scale;
      context.beginPath();
      for (const member of world.bodyOf(selected)) {
        const ring = drawnRadius(member) + 3 / view.scale;
        context.moveTo(member.x + ring, member.y);
        context.arc(member.x, member.y, ring, 0, Math.PI * 2);
      }
      context.stroke();
    }
    context.restore();
  }

  function toWorld(clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    return {
      x: (clientX - box.left - view.left) / view.scale,
      y: (clientY - box.top - view.top) / view.scale,
      reach: PICK_REACH_PX / view.scale,
    };
  }

  return { resize, draw, toWorld };
}
