import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { derivePlanet } from '../../planet-textures/js/physics.js';
import { renderPlanet } from '../../planet-textures/js/planet.js';
import { createRandom } from '../../planet-textures/js/random.js';

const PLANET_SIZE = 96;
const PLANETS_PER_SET = 24;
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

function renderPlanetPixels(physical) {
  const { surface, sky } = renderPlanet(derivePlanet(physical), PLANET_SIZE);
  return composite(surface.context.pixels, sky.context.pixels, PLANET_SIZE);
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

function encodePng({ width, height, rgb }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const scanlines = Buffer.alloc(height * (width * 3 + 1));
  for (let row = 0; row < height; row++) {
    scanlines.set(rgb.subarray(row * width * 3, (row + 1) * width * 3), row * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, ranges] of Object.entries(SETS)) {
  const folder = new URL(`${name}/`, OUTPUT);
  mkdirSync(folder, { recursive: true });
  randomPhysicals(name, ranges).forEach((physical, index) => {
    const image = { width: PLANET_SIZE, height: PLANET_SIZE, rgb: renderPlanetPixels(physical) };
    writeFileSync(new URL(`${index}.png`, folder), encodePng(image));
  });
  console.log(`${name}: ${PLANETS_PER_SET} planets`);
}
