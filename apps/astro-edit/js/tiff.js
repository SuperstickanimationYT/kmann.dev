import { decodeJxl } from './jxl.js';
import { inflate } from './png.js';

const TAG = {
  newSubfileType: 254,
  width: 256,
  height: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  make: 271,
  model: 272,
  stripOffsets: 273,
  orientation: 274,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  planarConfig: 284,
  predictor: 317,
  tileWidth: 322,
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  subIfds: 330,
  sampleFormat: 339,
  cfaRepeat: 33421,
  cfaPattern: 33422,
  blackLevel: 50714,
  whiteLevel: 50717,
  asShotNeutral: 50728,
  activeArea: 50829,
  forwardMatrix1: 50964,
};

const COMPRESSION = { none: 1, deflate: 8, deflateLegacy: 32946, jpegXl: 52546, losslessJpeg: 7 };
const PHOTOMETRIC = { gray: 1, rgb: 2, cfa: 32803, linearRaw: 34892 };
const TYPE_BYTES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
const CFA_RED = 0;
const CFA_GREEN = 1;
const CFA_BLUE = 2;

const XYZ_D50_TO_LINEAR_SRGB = [
  3.1338561, -1.6168667, -0.4906146,
  -0.9787684, 1.9161415, 0.033454,
  0.0719453, -0.2289914, 1.4052427,
];

export function isTiff(bytes) {
  return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 42);
}

function tiffReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const littleEndian = bytes[0] === 0x49;

  function readValue(type, at) {
    switch (type) {
      case 3: return view.getUint16(at, littleEndian);
      case 4: case 13: return view.getUint32(at, littleEndian);
      case 8: return view.getInt16(at, littleEndian);
      case 9: return view.getInt32(at, littleEndian);
      case 5: return view.getUint32(at, littleEndian) / view.getUint32(at + 4, littleEndian);
      case 10: return view.getInt32(at, littleEndian) / view.getInt32(at + 4, littleEndian);
      case 11: return view.getFloat32(at, littleEndian);
      case 12: return view.getFloat64(at, littleEndian);
      case 6: return view.getInt8(at);
      default: return view.getUint8(at);
    }
  }

  function readIfd(offset) {
    const count = view.getUint16(offset, littleEndian);
    const entries = new Map();
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      const type = view.getUint16(at + 2, littleEndian);
      const length = view.getUint32(at + 4, littleEndian);
      const size = (TYPE_BYTES[type] ?? 1) * length;
      const dataAt = size <= 4 ? at + 8 : view.getUint32(at + 8, littleEndian);
      entries.set(view.getUint16(at, littleEndian), { type, length, dataAt });
    }
    const next = view.getUint32(offset + 2 + count * 12, littleEndian);
    return {
      next,
      has: (tag) => entries.has(tag),
      values(tag) {
        const entry = entries.get(tag);
        if (!entry) return null;
        const step = TYPE_BYTES[entry.type] ?? 1;
        return Array.from({ length: entry.length }, (_, i) => readValue(entry.type, entry.dataAt + i * step));
      },
      value(tag, fallback) {
        return this.values(tag)?.[0] ?? fallback;
      },
      text(tag) {
        const entry = entries.get(tag);
        if (!entry) return '';
        return String.fromCharCode(...bytes.subarray(entry.dataAt, entry.dataAt + entry.length)).replace(/\0.*$/, '').trim();
      },
    };
  }

  function allIfds() {
    const found = [];
    const visit = (offset) => {
      for (let at = offset; at && at < bytes.length && found.length < 64; ) {
        const ifd = readIfd(at);
        found.push(ifd);
        for (const sub of ifd.values(TAG.subIfds) ?? []) visit(sub);
        at = ifd.next;
      }
    };
    visit(view.getUint32(4, littleEndian));
    return found;
  }

  return { view, littleEndian, allIfds };
}

function pickMainImage(ifds) {
  const fullSize = ifds.filter((ifd) => (ifd.value(TAG.newSubfileType, 0) & 1) === 0);
  const pixels = (ifd) => ifd.value(TAG.width, 0) * ifd.value(TAG.height, 0);
  return fullSize.sort((a, b) => pixels(b) - pixels(a))[0];
}

function segmentsOf(ifd, width, height) {
  if (ifd.has(TAG.tileOffsets)) {
    const tileWidth = ifd.value(TAG.tileWidth);
    const tileHeight = ifd.value(TAG.tileLength);
    const across = Math.ceil(width / tileWidth);
    const offsets = ifd.values(TAG.tileOffsets);
    const counts = ifd.values(TAG.tileByteCounts);
    return offsets.map((offset, i) => ({
      offset,
      byteCount: counts[i],
      x: (i % across) * tileWidth,
      y: Math.floor(i / across) * tileHeight,
      width: tileWidth,
      height: tileHeight,
    }));
  }
  const rowsPerStrip = Math.min(ifd.value(TAG.rowsPerStrip, height), height);
  const offsets = ifd.values(TAG.stripOffsets);
  const counts = ifd.values(TAG.stripByteCounts);
  return offsets.map((offset, i) => ({
    offset,
    byteCount: counts[i],
    x: 0,
    y: i * rowsPerStrip,
    width,
    height: Math.min(rowsPerStrip, height - i * rowsPerStrip),
  }));
}

function readSamples(bytes, littleEndian, bits, isFloat, count) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (isFloat && bits === 32) {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, littleEndian);
    return out;
  }
  if (bits === 16) {
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++) out[i] = view.getUint16(i * 2, littleEndian);
    return out;
  }
  if (bits === 8) return Uint16Array.from(bytes.subarray(0, count));
  throw new Error(`${bits}-bit ${isFloat ? 'float ' : ''}samples are not supported yet.`);
}

function undoHorizontalPredictor(samples, segmentWidth, rows, channels) {
  const rowLength = segmentWidth * channels;
  for (let row = 0; row < rows; row++) {
    const start = row * rowLength;
    for (let i = channels; i < rowLength; i++) samples[start + i] += samples[start + i - channels];
  }
}

async function decodeSegment(bytes, segment, format) {
  const raw = bytes.subarray(segment.offset, segment.offset + segment.byteCount);
  const count = segment.width * segment.height * format.channels;
  if (format.compression === COMPRESSION.jpegXl) {
    const decoded = await decodeJxl(raw);
    return { samples: decoded.data, width: decoded.width, height: decoded.height, channels: decoded.channels };
  }
  let plain = raw;
  if (format.compression === COMPRESSION.deflate || format.compression === COMPRESSION.deflateLegacy) {
    plain = await inflate(raw);
  } else if (format.compression === COMPRESSION.losslessJpeg) {
    throw new Error('This DNG uses lossless JPEG compression, which this prototype cannot read yet. Samsung Expert RAW and uncompressed DNGs work.');
  } else if (format.compression !== COMPRESSION.none) {
    throw new Error(`This file uses TIFF compression ${format.compression}, which this prototype cannot read yet.`);
  }
  const samples = readSamples(plain, format.littleEndian, format.bits, format.isFloat, count);
  if (format.predictor === 2) undoHorizontalPredictor(samples, segment.width, segment.height, format.channels);
  else if (format.predictor === 3) throw new Error('Floating-point predictor TIFFs are not supported yet.');
  return { samples, width: segment.width, height: segment.height, channels: format.channels };
}

function multiply3(a, b) {
  const out = new Array(9);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out[row * 3 + col] = a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col];
    }
  }
  return out;
}

function cameraToSrgb(ifd0) {
  const neutral = ifd0.values(TAG.asShotNeutral);
  const forward = ifd0.values(TAG.forwardMatrix1);
  const whiteBalance = neutral ? [1 / neutral[0], 0, 0, 0, 1 / neutral[1], 0, 0, 0, 1 / neutral[2]] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if (forward?.length === 9) return multiply3(XYZ_D50_TO_LINEAR_SRGB, multiply3(forward, whiteBalance));
  const green = whiteBalance[4];
  return whiteBalance.map((value) => value / green);
}

function levelFor(levels, index, fallback) {
  if (!levels?.length) return fallback;
  return levels[index % levels.length];
}

function superpixelDemosaic(plane, width, height, pattern, blacks, white) {
  const outWidth = width >> 1;
  const outHeight = height >> 1;
  const rgb = new Float32Array(outWidth * outHeight * 3);
  const colorAt = [0, 1, 2, 3].map((position) => pattern[position]);
  const scale = [0, 1, 2, 3].map((position) => 1 / (white - levelFor(blacks, position, 0)));
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const sums = [0, 0, 0];
      const counts = [0, 0, 0];
      for (let position = 0; position < 4; position++) {
        const sourceX = 2 * x + (position & 1);
        const sourceY = 2 * y + (position >> 1);
        const color = colorAt[position];
        sums[color] += (plane[sourceY * width + sourceX] - levelFor(blacks, position, 0)) * scale[position];
        counts[color]++;
      }
      const at = (y * outWidth + x) * 3;
      rgb[at] = sums[CFA_RED] / counts[CFA_RED];
      rgb[at + 1] = sums[CFA_GREEN] / counts[CFA_GREEN];
      rgb[at + 2] = sums[CFA_BLUE] / counts[CFA_BLUE];
    }
  }
  return { width: outWidth, height: outHeight, rgb };
}

function normalizedRgb(plane, width, height, channels, blacks, whites, isFloat) {
  const rgb = new Float32Array(width * height * 3);
  const pick = channels >= 3 ? [0, 1, 2] : [0, 0, 0];
  const black = pick.map((channel) => (isFloat ? 0 : levelFor(blacks, channel, 0)));
  const range = pick.map((channel, i) => (isFloat ? 1 : levelFor(whites, channel, 65535) - black[i]));
  for (let pixel = 0, n = width * height; pixel < n; pixel++) {
    for (let c = 0; c < 3; c++) rgb[pixel * 3 + c] = (plane[pixel * channels + pick[c]] - black[c]) / range[c];
  }
  return { width, height, rgb };
}

function cropToActiveArea(plane, width, channels, area) {
  const [top, left, bottom, right] = area;
  const cropWidth = right - left;
  const cropHeight = bottom - top;
  const out = new plane.constructor(cropWidth * cropHeight * channels);
  for (let y = 0; y < cropHeight; y++) {
    const from = ((top + y) * width + left) * channels;
    out.set(plane.subarray(from, from + cropWidth * channels), y * cropWidth * channels);
  }
  return { plane: out, width: cropWidth, height: cropHeight };
}

export function orient(image, orientation) {
  if (orientation !== 3 && orientation !== 6 && orientation !== 8) return image;
  const { width, height, rgb } = image;
  const turned = orientation !== 3;
  const outWidth = turned ? height : width;
  const outHeight = turned ? width : height;
  const out = new Float32Array(rgb.length);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let sourceX = x;
      let sourceY = y;
      if (orientation === 3) { sourceX = width - 1 - x; sourceY = height - 1 - y; }
      else if (orientation === 6) { sourceX = y; sourceY = height - 1 - x; }
      else { sourceX = width - 1 - y; sourceY = x; }
      const from = (sourceY * width + sourceX) * 3;
      const to = (y * outWidth + x) * 3;
      out[to] = rgb[from];
      out[to + 1] = rgb[from + 1];
      out[to + 2] = rgb[from + 2];
    }
  }
  return { ...image, width: outWidth, height: outHeight, rgb: out };
}

export async function decodeTiff(bytes, onStatus = () => {}) {
  const reader = tiffReader(bytes);
  const ifds = reader.allIfds();
  const ifd0 = ifds[0];
  const main = pickMainImage(ifds);
  if (!main) throw new Error('No full-size image found in this file.');

  const width = main.value(TAG.width);
  const height = main.value(TAG.height);
  const photometric = main.value(TAG.photometric, PHOTOMETRIC.rgb);
  const channels = main.value(TAG.samplesPerPixel, 1);
  const bits = main.value(TAG.bitsPerSample, 8);
  const format = {
    channels,
    bits,
    isFloat: main.value(TAG.sampleFormat, 1) === 3,
    compression: main.value(TAG.compression, COMPRESSION.none),
    predictor: main.value(TAG.predictor, 1),
    littleEndian: reader.littleEndian,
  };
  if (main.value(TAG.planarConfig, 1) !== 1) throw new Error('Planar TIFFs are not supported yet.');
  if (![PHOTOMETRIC.gray, PHOTOMETRIC.rgb, PHOTOMETRIC.cfa, PHOTOMETRIC.linearRaw].includes(photometric)) {
    throw new Error(`Unsupported photometric interpretation ${photometric}.`);
  }

  if (format.compression === COMPRESSION.jpegXl) onStatus('Decoding JPEG XL (Expert RAW files take about 10 seconds)…');
  else onStatus('Reading pixels…');

  let plane = new (format.isFloat ? Float32Array : Uint16Array)(width * height * channels);
  for (const segment of segmentsOf(main, width, height)) {
    const decoded = await decodeSegment(bytes, segment, format);
    const copyWidth = Math.min(decoded.width, width - segment.x);
    const copyHeight = Math.min(decoded.height, height - segment.y);
    for (let y = 0; y < copyHeight; y++) {
      for (let x = 0; x < copyWidth; x++) {
        const from = (y * decoded.width + x) * decoded.channels;
        const to = ((segment.y + y) * width + segment.x + x) * channels;
        for (let c = 0; c < channels; c++) plane[to + c] = decoded.samples[from + Math.min(c, decoded.channels - 1)];
      }
    }
  }

  let planeWidth = width;
  let planeHeight = height;
  const activeArea = main.values(TAG.activeArea);
  if (activeArea?.length === 4 && (activeArea[2] - activeArea[0] !== height || activeArea[3] - activeArea[1] !== width)) {
    ({ plane, width: planeWidth, height: planeHeight } = cropToActiveArea(plane, width, channels, activeArea));
  }

  onStatus('Converting colour…');
  const blacks = main.values(TAG.blackLevel);
  const whites = main.values(TAG.whiteLevel) ?? [2 ** bits - 1];
  let image;
  if (photometric === PHOTOMETRIC.cfa) {
    const repeat = main.values(TAG.cfaRepeat) ?? [2, 2];
    if (repeat[0] !== 2 || repeat[1] !== 2) throw new Error('Only 2×2 colour filter patterns are supported.');
    image = superpixelDemosaic(plane, planeWidth, planeHeight, main.values(TAG.cfaPattern), blacks, whites[0]);
  } else {
    image = normalizedRgb(plane, planeWidth, planeHeight, channels, blacks, whites, format.isFloat);
  }

  const camera = [ifd0.text(TAG.make), ifd0.text(TAG.model)].filter(Boolean).join(' ');
  const kind = format.compression === COMPRESSION.jpegXl ? 'JPEG XL DNG' : photometric === PHOTOMETRIC.cfa ? 'raw DNG' : 'TIFF';
  const upright = orient(image, ifd0.value(TAG.orientation, 1));
  return {
    ...upright,
    toLinearSrgb: photometric === PHOTOMETRIC.cfa || photometric === PHOTOMETRIC.linearRaw ? cameraToSrgb(ifd0) : [1, 0, 0, 0, 1, 0, 0, 0, 1],
    description: `${camera ? `${camera} · ` : ''}${kind} · ${upright.width}×${upright.height}`,
  };
}
