const SIGNATURE_BYTES = 8;
const CHANNELS_BY_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

export function unfilterRows(raw, rowBytes, rows, pixelBytes) {
  const out = new Uint8Array(rowBytes * rows);
  for (let row = 0; row < rows; row++) {
    const filter = raw[row * (rowBytes + 1)];
    const src = row * (rowBytes + 1) + 1;
    const dst = row * rowBytes;
    const above = dst - rowBytes;
    for (let i = 0; i < rowBytes; i++) {
      const left = i >= pixelBytes ? out[dst + i - pixelBytes] : 0;
      const up = row > 0 ? out[above + i] : 0;
      const upLeft = row > 0 && i >= pixelBytes ? out[above + i - pixelBytes] : 0;
      const value = raw[src + i];
      let predicted = 0;
      if (filter === 1) predicted = left;
      else if (filter === 2) predicted = up;
      else if (filter === 3) predicted = (left + up) >> 1;
      else if (filter === 4) predicted = paeth(left, up, upLeft);
      out[dst + i] = value + predicted;
    }
  }
  return out;
}

export async function decodePng(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];
  for (let at = SIGNATURE_BYTES; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = body[8];
      colorType = body[9];
      if (body[12] !== 0) throw new Error('Interlaced PNGs are not supported.');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  const channels = CHANNELS_BY_COLOR_TYPE[colorType];
  if (!channels || (depth !== 8 && depth !== 16)) throw new Error(`Unsupported PNG layout (type ${colorType}, ${depth}-bit).`);

  const sampleBytes = depth / 8;
  const rowBytes = width * channels * sampleBytes;
  const pixels = unfilterRows(await inflate(new Blob(idat)), rowBytes, height, channels * sampleBytes);
  const data = new Uint16Array(width * height * channels);
  if (depth === 16) {
    for (let i = 0; i < data.length; i++) data[i] = (pixels[2 * i] << 8) | pixels[2 * i + 1];
  } else {
    for (let i = 0; i < data.length; i++) data[i] = pixels[i] * 257;
  }
  return { width, height, channels, data };
}
