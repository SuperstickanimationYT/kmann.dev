const MAGIC = 0x314d5847;
const HEADER_BYTES = 20;
const POSITION_STEP = 0.04;
const VELOCITY_STEP = 0.02;
const VALUES_PER_STAR = 4;
const INT16_LIMIT = 32767;

const paddedToFour = (bytes) => Math.ceil(bytes / 4) * 4;

function layoutOf(stars, snapshots) {
  const galaxiesAt = HEADER_BYTES;
  const firstSnapshotAt = galaxiesAt + paddedToFour(stars);
  const snapshotBytes = stars * VALUES_PER_STAR * 2;
  return { stars, snapshots, galaxiesAt, firstSnapshotAt, snapshotBytes, totalBytes: firstSnapshotAt + snapshots * snapshotBytes };
}

const quantize = (value, step) => Math.max(-INT16_LIMIT, Math.min(INT16_LIMIT, Math.round(value / step)));

export function encodeSnapshots(galaxies, snapshots) {
  const layout = layoutOf(galaxies.length, snapshots.length);
  const bytes = new Uint8Array(layout.totalBytes);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, MAGIC, true);
  header.setUint32(4, layout.stars, true);
  header.setUint32(8, layout.snapshots, true);
  header.setFloat32(12, POSITION_STEP, true);
  header.setFloat32(16, VELOCITY_STEP, true);
  bytes.set(galaxies, layout.galaxiesAt);
  snapshots.forEach((stars, index) => {
    const packed = new Int16Array(bytes.buffer, layout.firstSnapshotAt + index * layout.snapshotBytes, layout.stars * VALUES_PER_STAR);
    for (let i = 0; i < stars.length; i++) packed[i] = quantize(stars[i], i % VALUES_PER_STAR < 2 ? POSITION_STEP : VELOCITY_STEP);
  });
  return bytes;
}

export function readLayout(bytes) {
  const header = new DataView(bytes.buffer, bytes.byteOffset, HEADER_BYTES);
  if (header.getUint32(0, true) !== MAGIC) throw new Error('Not a galaxy merger snapshot file');
  return { ...layoutOf(header.getUint32(4, true), header.getUint32(8, true)), positionStep: header.getFloat32(12, true), velocityStep: header.getFloat32(16, true) };
}

export const headerBytes = HEADER_BYTES;

export const galaxiesIn = (bytes, layout) => bytes.slice(layout.galaxiesAt, layout.galaxiesAt + layout.stars);

export const snapshotsReceived = (byteCount, layout) =>
  Math.max(0, Math.min(layout.snapshots, Math.floor((byteCount - layout.firstSnapshotAt) / layout.snapshotBytes)));

export function decodeSnapshot(bytes, layout, index) {
  const packed = new Int16Array(bytes.buffer, bytes.byteOffset + layout.firstSnapshotAt + index * layout.snapshotBytes, layout.stars * VALUES_PER_STAR);
  const stars = new Float32Array(packed.length);
  for (let i = 0; i < packed.length; i++) stars[i] = packed[i] * (i % VALUES_PER_STAR < 2 ? layout.positionStep : layout.velocityStep);
  return stars;
}
