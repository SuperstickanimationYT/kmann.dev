const MYR_PER_SIM_SECOND = 59;

export const MERGER_SIMULATION = { seed: 314, starsEach: 3000, secondsPerSnapshot: 0.125, snapshots: 241 };

export const myrAt = (index) => Math.round(index * MERGER_SIMULATION.secondsPerSnapshot * MYR_PER_SIM_SECOND);

export const simSecondsAt = (index) => index * MERGER_SIMULATION.secondsPerSnapshot;

export function createMergerTimeline(onProgress) {
  const worker = new Worker(new URL('./simulation.worker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let nextRequest = 1;
  let ready = 0;
  const readyWaiters = [];

  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') {
      ready = data.ready;
      onProgress(ready);
      readyWaiters.filter(({ count }) => count <= ready).forEach(({ resolve }) => resolve());
      readyWaiters.splice(0, readyWaiters.length, ...readyWaiters.filter(({ count }) => count > ready));
      return;
    }
    waiting.get(data.request)?.({ ...data.field, index: data.index });
    waiting.delete(data.request);
  });

  function fieldAt(index) {
    const request = nextRequest++;
    return new Promise((resolve) => {
      waiting.set(request, resolve);
      worker.postMessage({ type: 'field', index, request });
    });
  }

  function untilReady(count) {
    if (count <= ready) return Promise.resolve();
    return new Promise((resolve) => readyWaiters.push({ count, resolve }));
  }

  return { fieldAt, untilReady, ready: () => ready };
}
