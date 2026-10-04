const SHEET_STOPS = [0.15, 0.46, 0.88];
const DEFAULT_STOP = 1;
const TAP_DISTANCE = 6;
const STORAGE_KEY = `studio-panel:${window.location.pathname}`;

const body = document.body;
const panel = document.querySelector('[data-studio-panel]');
const handle = panel.querySelector('[data-studio-handle]');
const narrow = window.matchMedia('(max-width: 820px)');

function remembered() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

function remember(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...remembered(), ...state }));
  } catch {
    return;
  }
}

let resizeQueued = false;
function announceResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  window.requestAnimationFrame(() => {
    resizeQueued = false;
    window.dispatchEvent(new Event('resize'));
  });
}

function setCollapsed(collapsed) {
  body.classList.toggle('studio-collapsed', collapsed);
  handle.setAttribute('aria-expanded', String(!collapsed));
  remember({ collapsed });
  announceResize();
}

const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight;

function setSheetHeight(pixels) {
  const clamped = Math.min(viewportHeight() * SHEET_STOPS.at(-1), Math.max(viewportHeight() * SHEET_STOPS[0], pixels));
  body.style.setProperty('--sheet-height', `${clamped}px`);
  announceResize();
}

function snapToStop(index) {
  setSheetHeight(viewportHeight() * SHEET_STOPS[index]);
  handle.setAttribute('aria-expanded', String(index > 0));
  remember({ stop: index });
}

function nearestStop(pixels) {
  const share = pixels / viewportHeight();
  return SHEET_STOPS.reduce((best, stop, index) => (Math.abs(stop - share) < Math.abs(SHEET_STOPS[best] - share) ? index : best), 0);
}

let drag = null;
let draggedJustNow = false;

handle.addEventListener('pointerdown', (event) => {
  if (!narrow.matches) return;
  draggedJustNow = false;
  drag = { startY: event.clientY, startHeight: panel.getBoundingClientRect().height, moved: false };
  handle.setPointerCapture(event.pointerId);
  body.classList.add('studio-dragging');
});

handle.addEventListener('pointermove', (event) => {
  if (!drag) return;
  const travel = drag.startY - event.clientY;
  if (Math.abs(travel) > TAP_DISTANCE) drag.moved = true;
  if (drag.moved) setSheetHeight(drag.startHeight + travel);
});

function endDrag() {
  if (!drag) return;
  body.classList.remove('studio-dragging');
  draggedJustNow = drag.moved;
  drag = null;
  if (draggedJustNow) snapToStop(nearestStop(panel.getBoundingClientRect().height));
}

handle.addEventListener('pointerup', endDrag);
handle.addEventListener('pointercancel', endDrag);

handle.addEventListener('click', () => {
  if (narrow.matches) {
    if (draggedJustNow) {
      draggedJustNow = false;
      return;
    }
    const current = nearestStop(panel.getBoundingClientRect().height);
    snapToStop(current === SHEET_STOPS.length - 1 ? 0 : current + 1);
  } else {
    setCollapsed(!body.classList.contains('studio-collapsed'));
  }
});

function applyLayout() {
  const saved = remembered();
  if (narrow.matches) {
    body.classList.remove('studio-collapsed');
    snapToStop(saved.stop ?? DEFAULT_STOP);
  } else {
    body.style.removeProperty('--sheet-height');
    setCollapsed(Boolean(saved.collapsed));
  }
}

narrow.addEventListener('change', applyLayout);
window.visualViewport?.addEventListener('resize', () => {
  if (narrow.matches && !drag) snapToStop(remembered().stop ?? DEFAULT_STOP);
});
applyLayout();
