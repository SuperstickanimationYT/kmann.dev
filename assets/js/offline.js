const PARALLEL_DOWNLOADS = 6;

const button = document.querySelector('[data-save-offline]');
const appUrl = new URL('./', window.location.href);
const cacheName = `offline:${appUrl.href}`;
const workerUrl = new URL('../../sw.js', import.meta.url);

let installPrompt = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (button.dataset.state === 'saved') showSaved();
});

function show(state, label) {
  button.dataset.state = state;
  button.textContent = label;
  button.disabled = state === 'saving' || (state === 'saved' && !installPrompt);
}

function showSaved() {
  show('saved', installPrompt ? 'Install app' : 'Saved offline');
}

function megabytes(bytes) {
  return `${Math.max(0.1, bytes / 1e6).toFixed(1)} MB`;
}

async function fileList() {
  const response = await fetch(new URL('offline-files.json', appUrl), { cache: 'no-store' });
  return response.json();
}

async function download(cache, paths, onProgress) {
  const queue = paths.map((path) => new URL(path, appUrl).href);
  let done = 0;
  async function worker() {
    while (queue.length) {
      await cache.add(queue.shift());
      onProgress(++done);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, worker));
}

async function missingPaths(cache, paths) {
  const present = await Promise.all(paths.map((path) => cache.match(new URL(path, appUrl).href)));
  return paths.filter((_, index) => !present[index]);
}

async function save() {
  show('saving', 'Saving…');
  const cache = await caches.open(cacheName);
  try {
    const { files } = await fileList();
    await download(cache, files, (done) => {
      show('saving', `Saving… ${Math.round((done / files.length) * 100)}%`);
    });
    await navigator.serviceWorker.register(workerUrl, { scope: appUrl.pathname });
    showSaved();
  } catch {
    await caches.delete(cacheName);
    show('idle', 'Save failed, retry');
  }
}

async function fillGaps() {
  const cache = await caches.open(cacheName);
  const { files } = await fileList();
  await download(cache, await missingPaths(cache, files), () => {});
}

async function installApp() {
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
  showSaved();
}

async function start() {
  if (await caches.has(cacheName)) {
    showSaved();
    navigator.serviceWorker.register(workerUrl, { scope: appUrl.pathname });
    if (navigator.onLine) fillGaps().catch(() => {});
  } else {
    const { bytes } = await fileList();
    show('idle', `Save offline (${megabytes(bytes)})`);
  }
  button.hidden = false;
}

button.addEventListener('click', () => {
  if (button.dataset.state === 'idle') save();
  else if (installPrompt) installApp();
});

if ('serviceWorker' in navigator && 'caches' in window) start().catch(() => {});
