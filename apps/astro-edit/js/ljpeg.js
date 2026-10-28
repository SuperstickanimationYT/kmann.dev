const MARKER = { sof3: 0xc3, dht: 0xc4, soi: 0xd8, eoi: 0xd9, sos: 0xda, dri: 0xdd };
const LOOKUP_BITS = 16;

function huffmanLookup(counts, symbols) {
  const lookup = new Int32Array(1 << LOOKUP_BITS).fill(-1);
  let code = 0;
  let next = 0;
  for (let length = 1; length <= 16; length++) {
    for (let i = 0; i < counts[length - 1]; i++) {
      const shift = LOOKUP_BITS - length;
      const entry = (length << 8) | symbols[next++];
      lookup.fill(entry, code << shift, (code + 1) << shift);
      code++;
    }
    code <<= 1;
  }
  return lookup;
}

function bitReader(data, start) {
  let at = start;
  let buffer = 0;
  let count = 0;

  function fill() {
    while (count <= 24) {
      let byte = 0;
      if (at < data.length) {
        byte = data[at];
        if (byte !== 0xff) at++;
        else if (data[at + 1] === 0) at += 2;
        else byte = 0;
      }
      buffer = ((buffer << 8) | byte) >>> 0;
      count += 8;
    }
  }

  return {
    decode(lookup) {
      fill();
      const entry = lookup[(buffer >>> (count - LOOKUP_BITS)) & 0xffff];
      if (entry < 0) throw new Error('The lossless JPEG data in this file is damaged.');
      count -= entry >> 8;
      return entry & 0xff;
    },
    bits(length) {
      if (length === 0) return 0;
      fill();
      count -= length;
      return (buffer >>> count) & ((1 << length) - 1);
    },
    restart() {
      count = 0;
      buffer = 0;
      while (at + 1 < data.length && !(data[at] === 0xff && data[at + 1] >= 0xd0 && data[at + 1] <= 0xd7)) at++;
      at += 2;
    },
  };
}

function difference(reader, lookup) {
  const size = reader.decode(lookup);
  if (size === 0) return 0;
  if (size === 16) return 32768;
  const value = reader.bits(size);
  return value < 1 << (size - 1) ? value - (1 << size) + 1 : value;
}

function predict(predictor, left, above, aboveLeft) {
  switch (predictor) {
    case 1: return left;
    case 2: return above;
    case 3: return aboveLeft;
    case 4: return left + above - aboveLeft;
    case 5: return left + ((above - aboveLeft) >> 1);
    case 6: return above + ((left - aboveLeft) >> 1);
    case 7: return (left + above) >> 1;
    default: throw new Error(`Unknown lossless JPEG predictor ${predictor}.`);
  }
}

function decodeScan(data, start, frame, scan, tables, restartInterval) {
  const { width, height, precision } = frame;
  const components = scan.components.length;
  const lookups = scan.components.map((component) => {
    const lookup = tables[component.table];
    if (!lookup) throw new Error('This lossless JPEG is missing a Huffman table.');
    return lookup;
  });
  const out = new Uint16Array(width * height * components);
  const rowLength = width * components;
  const initial = 1 << (precision - scan.pointTransform - 1);
  const reader = bitReader(data, start);
  let untilRestart = restartInterval;
  let firstRowStart = 0;

  for (let y = 0; y < height; y++) {
    const row = y * rowLength;
    for (let x = 0; x < width; x++) {
      if (restartInterval && untilRestart === 0) {
        reader.restart();
        untilRestart = restartInterval;
        firstRowStart = row + x * components;
      }
      for (let c = 0; c < components; c++) {
        const at = row + x * components + c;
        const onFirstRow = at - rowLength < firstRowStart;
        let prediction;
        if (onFirstRow) prediction = at - components >= firstRowStart && x > 0 ? out[at - components] : initial;
        else if (x === 0) prediction = out[at - rowLength];
        else prediction = predict(scan.predictor, out[at - components], out[at - rowLength], out[at - rowLength - components]);
        out[at] = (prediction + difference(reader, lookups[c])) & 0xffff;
      }
      untilRestart--;
    }
  }
  if (scan.pointTransform) for (let i = 0; i < out.length; i++) out[i] <<= scan.pointTransform;
  return out;
}

export function decodeLosslessJpeg(data) {
  if (data[0] !== 0xff || data[1] !== MARKER.soi) throw new Error('Expected lossless JPEG data in this file.');
  const tables = [];
  let frame = null;
  let restartInterval = 0;
  let at = 2;
  while (at + 4 <= data.length) {
    if (data[at] !== 0xff) { at++; continue; }
    const marker = data[at + 1];
    if (marker === 0xff) { at++; continue; }
    const length = (data[at + 2] << 8) | data[at + 3];
    const body = at + 4;
    const end = at + 2 + length;
    if (marker === MARKER.dht) {
      for (let p = body; p < end; ) {
        const id = data[p] & 0x0f;
        const counts = data.subarray(p + 1, p + 17);
        const total = counts.reduce((sum, count) => sum + count, 0);
        tables[id] = huffmanLookup(counts, data.subarray(p + 17, p + 17 + total));
        p += 17 + total;
      }
    } else if (marker === MARKER.sof3) {
      const count = data[body + 5];
      for (let i = 0; i < count; i++) {
        if (data[body + 7 + i * 3] !== 0x11) throw new Error('Subsampled lossless JPEG is not supported.');
      }
      frame = { precision: data[body], height: (data[body + 1] << 8) | data[body + 2], width: (data[body + 3] << 8) | data[body + 4] };
    } else if (marker === MARKER.dri) {
      restartInterval = (data[body] << 8) | data[body + 1];
    } else if (marker === MARKER.sos) {
      if (!frame) throw new Error('This JPEG is not lossless, so it cannot be read as raw data.');
      const count = data[body];
      const components = Array.from({ length: count }, (_, i) => ({ table: data[body + 2 + i * 2] >> 4 }));
      const after = body + 1 + count * 2;
      const scan = { components, predictor: data[after], pointTransform: data[after + 2] & 0x0f };
      const samples = decodeScan(data, end, frame, scan, tables, restartInterval);
      return { samples, width: frame.width, height: frame.height, channels: count };
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      throw new Error('This JPEG is not lossless, so it cannot be read as raw data.');
    }
    at = end;
  }
  throw new Error('The lossless JPEG data in this file is incomplete.');
}
