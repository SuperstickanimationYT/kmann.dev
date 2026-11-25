const screen = document.querySelector('[data-loading]');
const text = screen.querySelector('[data-loading-text]');
const startedAt = performance.now();

export function showShadersReady(ready, total) {
  const seconds = Math.round((performance.now() - startedAt) / 1000);
  text.textContent = `Preparing the graphics: ${ready} of ${total} parts, ${seconds} s so far`;
}

export function hideLoading() {
  screen.hidden = true;
}
