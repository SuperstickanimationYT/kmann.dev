import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { derivePlanet } from '../../planet-textures/js/physics.js';
import { renderPlanet } from '../../planet-textures/js/planet.js';
import { createRandom } from '../../planet-textures/js/random.js';
import { learnPalette, quantize } from '../js/palette.js';

const PLANET_SIZE = 96;
const PLANETS_PER_SET = 24;
const HIRES_SIZE = 768;
const HIRES_PER_SET = 3;
const HIRES_COLORS = 63;
const OUTPUT = new URL('../training/', import.meta.url);

const SETS = {
  earthlike: { kind: 'rocky', temperature: [275, 300], water: [45, 80], atmosphere: [20, 45] },
  desert: { kind: 'rocky', temperature: [200, 330], water: [0, 4], atmosphere: [3, 30] },
  lava: { kind: 'rocky', temperature: [900, 1400], water: [0, 0], atmosphere: [0, 30] },
  giants: { kind: 'giant', temperature: [110, 175], water: [0, 0], atmosphere: [100, 100] },
};

class Gradient {
  stops = [];
  addColorStop(offset, color) {
    const [r, g, b, a] = color.match(/[\d.]+/g).map(Number);
    this.stops.push({ offset, rgba: [r, g, b, a * 255] });
  }
  at(offset) {
    const after = this.stops.findIndex((stop) => stop.offset >= offset);
    if (after <= 0) return this.stops[Math.max(0, after)].rgba;
    const from = this.stops[after - 1];
    const to = this.stops[after];
    const t = (offset - from.offset) / (to.offset - from.offset);
    return from.rgba.map((channel, i) => channel + (to.rgba[i] - channel) * t);
  }
}

class PixelContext {
  constructor(size) {
    this.size = size;
    this.pixels = new Uint8ClampedArray(size * size * 4);
  }
  createImageData(width, height) {
    return { data: new Uint8ClampedArray(width * height * 4) };
  }
  putImageData(image) {
    this.pixels.set(image.data);
  }
  createRadialGradient() {
    return new Gradient();
  }
  fillRect() {
    const half = this.size / 2;
    for (let row = 0; row < this.size; row++) {
      for (let column = 0; column < this.size; column++) {
        const offset = Math.hypot(column + 0.5 - half, row + 0.5 - half) / half;
        if (offset > 1) continue;
        this.pixels.set(this.fillStyle.at(offset), (row * this.size + column) * 4);
      }
    }
  }
  beginPath() {}
  arc() {}
  fill() {}
}

globalThis.OffscreenCanvas = class {
  constructor(width) {
    this.context = new PixelContext(width);
  }
  getContext() {
    return this.context;
  }
};

function composite(surface, sky, size) {
  const rgb = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    const alpha = sky[i * 4 + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      rgb[i * 3 + channel] = surface[i * 4 + channel] * (1 - alpha) + sky[i * 4 + channel] * alpha;
    }
  }
  return rgb;
}

function renderPlanetPixels(physical, size) {
  const { surface, sky } = renderPlanet(derivePlanet(physical), size);
  return composite(surface.context.pixels, sky.context.pixels, size);
}

function diskOf(size) {
  const reach = (1 + 2 / size) ** 2;
  const disk = [];
  for (let index = 0; index < size * size; index++) {
    const x = ((index % size) + 0.5) * (2 / size) - 1;
    const y = (Math.floor(index / size) + 0.5) * (2 / size) - 1;
    if (x * x + y * y <= reach) disk.push(index);
  }
  return disk;
}

function randomPhysicals(name, ranges) {
  const random = createRandom([...name].reduce((hash, letter) => hash * 31 + letter.charCodeAt(0), 7));
  const pick = ([min, max]) => Math.round(random.between(min, max));
  return Array.from({ length: PLANETS_PER_SET }, () => ({
    seed: random.integer(1, 999999),
    kind: ranges.kind,
    temperature: pick(ranges.temperature),
    water: pick(ranges.water),
    atmosphere: pick(ranges.atmosphere),
  }));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

const RGB = 2;
const INDEXED = 3;

function encodePng({ width, height, samples, palette }) {
  const colorType = palette ? INDEXED : RGB;
  const rowBytes = colorType === RGB ? width * 3 : width;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, colorType, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (rowBytes + 1));
  for (let row = 0; row < height; row++) {
    scanlines.set(samples.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    ...(palette ? [pngChunk('PLTE', Buffer.from(palette.flat()))] : []),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function bakeHires(physicals, folder, random) {
  const disk = diskOf(HIRES_SIZE);
  const planets = physicals.map((physical) => ({ rgb: renderPlanetPixels(physical, HIRES_SIZE), disk }));
  const palette = learnPalette(planets, HIRES_COLORS, random);
  planets.forEach((planet, index) => {
    const image = { width: HIRES_SIZE, height: HIRES_SIZE, samples: quantize(planet, palette), palette };
    writeFileSync(new URL(`hires-${index}.png`, folder), encodePng(image));
  });
}

for (const [name, ranges] of Object.entries(SETS)) {
  const folder = new URL(`${name}/`, OUTPUT);
  mkdirSync(folder, { recursive: true });
  const physicals = randomPhysicals(name, ranges);
  physicals.forEach((physical, index) => {
    const image = { width: PLANET_SIZE, height: PLANET_SIZE, samples: renderPlanetPixels(physical, PLANET_SIZE) };
    writeFileSync(new URL(`${index}.png`, folder), encodePng(image));
  });
  bakeHires(physicals.slice(0, HIRES_PER_SET), folder, createRandom(HIRES_SIZE).next);
  console.log(`${name}: ${PLANETS_PER_SET} planets, ${HIRES_PER_SET} at ${HIRES_SIZE} px`);
}
