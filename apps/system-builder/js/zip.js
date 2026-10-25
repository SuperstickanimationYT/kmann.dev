const UTF8_NAMES_FLAG = 0x0800;
const STORED = 0;
const VERSION = 20;
const DOS_DATE_1980_01_01 = 0x21;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size, write) {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

export function storedZip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.path);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = header(30, (view) => {
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, VERSION, true);
      view.setUint16(6, UTF8_NAMES_FLAG, true);
      view.setUint16(8, STORED, true);
      view.setUint16(12, DOS_DATE_1980_01_01, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true);
    });
    directory.push(header(46, (view) => {
      view.setUint32(0, 0x02014b50, true);
      view.setUint16(4, VERSION, true);
      view.setUint16(6, VERSION, true);
      view.setUint16(8, UTF8_NAMES_FLAG, true);
      view.setUint16(10, STORED, true);
      view.setUint16(14, DOS_DATE_1980_01_01, true);
      view.setUint32(16, crc, true);
      view.setUint32(20, data.length, true);
      view.setUint32(24, data.length, true);
      view.setUint16(28, name.length, true);
      view.setUint32(42, offset, true);
    }), name);
    parts.push(local, name, data);
    offset += local.length + name.length + data.length;
  }
  const directorySize = directory.reduce((total, part) => total + part.length, 0);
  const end = header(22, (view) => {
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true);
    view.setUint32(12, directorySize, true);
    view.setUint32(16, offset, true);
  });
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}
