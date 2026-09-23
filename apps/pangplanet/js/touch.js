export function bindHoldButtons(root, { hold, release }) {
  for (const button of root.querySelectorAll('[data-hold]')) {
    const { hold: key } = button.dataset;
    button.addEventListener('pointerdown', (event) => {
      hold(key);
      button.setPointerCapture(event.pointerId);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, () => release(key));
  }
}

export function bindTapButtons(root, press) {
  for (const button of root.querySelectorAll('[data-tap]')) button.addEventListener('click', () => press(button.dataset.tap));
}

export function bindPinchZoom(canvas, zoomBy) {
  const touches = new Map();
  let spread = 0;
  const currentSpread = () => {
    const [a, b] = touches.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size === 2) spread = currentSpread();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!touches.has(event.pointerId)) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size !== 2) return;
    const next = currentSpread();
    if (spread > 0 && next > 0) zoomBy(next / spread);
    spread = next;
  });
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (event) => {
      touches.delete(event.pointerId);
      spread = 0;
    });
  }
}

export function bindVerticalSlider(handle, track, onFraction) {
  const follow = (event) => {
    const box = track.getBoundingClientRect();
    onFraction(Math.min(1, Math.max(0, (box.bottom - event.clientY) / box.height)));
  };
  handle.addEventListener('pointerdown', (event) => {
    follow(event);
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (handle.hasPointerCapture(event.pointerId)) follow(event);
  });
}
