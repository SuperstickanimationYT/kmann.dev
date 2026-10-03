const SIZES = [128, 512];

const worker = new Worker(new URL('./texture-worker.js', import.meta.url), { type: 'module' });
const ready = new Map();
const pending = new Set();
const queue = [];
let busy = false;

const sizeToCover = (radiusPx) => SIZES.find((size) => size >= radiusPx * 2) ?? SIZES.at(-1);

function sendNext() {
  if (busy || !queue.length) return;
  busy = true;
  worker.postMessage(queue.shift());
}

worker.onmessage = ({ data }) => {
  const held = ready.get(data.key);
  if (!held || held.width < data.size) ready.set(data.key, data.bitmap);
  pending.delete(`${data.key}@${data.size}`);
  busy = false;
  sendNext();
};

export function textureFor(key, radiusPx, makeLook) {
  const held = ready.get(key);
  const size = sizeToCover(radiusPx);
  const job = `${key}@${size}`;
  if ((!held || held.width < size) && !pending.has(job)) {
    pending.add(job);
    queue.push({ key, size, look: makeLook() });
    sendNext();
  }
  return held ?? null;
}
