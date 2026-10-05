import { describeSnapshot, heightCalibration } from './density.js';
import { decodeSnapshot, galaxiesIn, headerBytes, readLayout, snapshotsReceived } from './snapshot-file.js';
import { SNAPSHOT_FILE_URL } from './timeline.js';

let bytes = null;
let layout = null;
let galaxies = null;
let kpcPerRoughHeight = 0;
let ready = 0;

function noteArrival(byteCount) {
  const now = snapshotsReceived(byteCount, layout);
  if (now === ready) return;
  if (!ready) kpcPerRoughHeight = heightCalibration(decodeSnapshot(bytes, layout, 0), galaxies);
  ready = now;
  self.postMessage({ type: 'progress', ready });
}

async function load() {
  const response = await fetch(new URL(SNAPSHOT_FILE_URL, import.meta.url));
  if (!response.ok) throw new Error(`snapshot file: HTTP ${response.status}`);
  const reader = response.body.getReader();
  const early = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!bytes) {
      early.push(value);
      received += value.length;
      if (received < headerBytes) continue;
      const head = new Uint8Array(received);
      early.reduce((at, chunk) => (head.set(chunk, at), at + chunk.length), 0);
      layout = readLayout(head);
      bytes = new Uint8Array(layout.totalBytes);
      bytes.set(head.subarray(0, Math.min(head.length, bytes.length)));
      if (received >= layout.firstSnapshotAt) galaxies = galaxiesIn(bytes, layout);
    } else {
      bytes.set(value.subarray(0, Math.max(0, bytes.length - received)), received);
      received += value.length;
      galaxies ??= received >= layout.firstSnapshotAt ? galaxiesIn(bytes, layout) : null;
    }
    if (galaxies) noteArrival(received);
  }
}

self.addEventListener('message', ({ data }) => {
  if (data.type !== 'field') return;
  const index = Math.min(data.index, ready - 1);
  const field = describeSnapshot(decodeSnapshot(bytes, layout, index), galaxies, kpcPerRoughHeight);
  self.postMessage({ type: 'field', request: data.request, index, field }, [field.positions.buffer, field.heights.buffer]);
});

load().catch((error) => self.postMessage({ type: 'failed', message: error.message }));
