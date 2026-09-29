export function bindHold(button, { hold, release }) {
  button.addEventListener('pointerdown', (event) => {
    hold();
    button.setPointerCapture(event.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
}

export function bindHoldButtons(root, { hold, release }) {
  for (const button of root.querySelectorAll('[data-hold]')) {
    const { hold: key } = button.dataset;
    bindHold(button, { hold: () => hold(key), release: () => release(key) });
  }
}

export function bindJoystick(pad, knob, onPushAndScreenBearing) {
  const aimAt = (event) => {
    const box = pad.getBoundingClientRect();
    const radius = box.width / 2;
    const dx = event.clientX - (box.left + radius);
    const dy = event.clientY - (box.top + radius);
    const push = Math.min(1, Math.hypot(dx, dy) / radius);
    const bearing = Math.atan2(dx, -dy);
    knob.style.transform = `translate(${Math.sin(bearing) * push * radius}px, ${-Math.cos(bearing) * push * radius}px)`;
    onPushAndScreenBearing(push, bearing);
  };
  const letGo = () => {
    knob.style.transform = '';
    onPushAndScreenBearing(0, 0);
  };
  pad.addEventListener('pointerdown', (event) => {
    pad.setPointerCapture(event.pointerId);
    aimAt(event);
  });
  pad.addEventListener('pointermove', (event) => {
    if (pad.hasPointerCapture(event.pointerId)) aimAt(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, letGo);
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

const TAP_SLOP_PX = 8;
const WHEEL_ZOOM_RATE = 0.0015;
const WHEEL_LINE_PX = 16;

function gestureOf(pointers) {
  const points = [...pointers.values()];
  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const [a, b] = points;
  return { x, y, spread: b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 };
}

export function bindPanZoom(canvas, { pan, zoomAt, tap }) {
  const pointers = new Map();
  let start = null;
  let dragged = false;
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      start = { x: event.clientX, y: event.clientY };
      dragged = false;
    } else dragged = true;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId)) return;
    const before = gestureOf(pointers);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = gestureOf(pointers);
    if (!dragged && Math.hypot(event.clientX - start.x, event.clientY - start.y) <= TAP_SLOP_PX) return;
    dragged = true;
    pan(after.x - before.x, after.y - before.y);
    if (before.spread > 0 && after.spread > 0) zoomAt(after.spread / before.spread, after.x, after.y);
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, (event) => pointers.delete(event.pointerId));
  canvas.addEventListener('click', (event) => {
    if (!dragged) tap(event.clientX, event.clientY);
  });
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const scrolledPx = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * WHEEL_LINE_PX : event.deltaY;
      zoomAt(Math.exp(-scrolledPx * WHEEL_ZOOM_RATE), event.clientX, event.clientY);
    },
    { passive: false },
  );
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
