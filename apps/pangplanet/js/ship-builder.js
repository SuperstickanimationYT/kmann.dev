import { partBounds } from './fleet.js';
import { HULL_PAINTS, SHIP_BLOCKS } from './world.js';

const CELL_PX = 32;
const ZOOM = { min: 0.2, max: 4, step: 1.3, wheelSensitivity: 0.0015, linePx: 16 };
const TAP_SLOP_PX = 8;
const FIT_MARGIN_CELLS = 1.5;
const MODES = ['place', 'erase', 'inspect'];
const EDITING_MODES = new Set(['place', 'erase']);
const WEDGE_CORNERS = ['0 0', '100% 0', '100% 100%', '0 100%'];
const HINTS = {
  place: 'Tap a dashed square to attach the picked block. Drag to pan, pinch or scroll to zoom.',
  erase: 'Tap a block to remove it; half its price comes back. Striped blocks hold others on.',
  inspect: 'Tap a block to see what it is.',
  locked: 'Park the ship beside the market to place or erase blocks.',
};

const cellKey = (col, row) => `${col},${row}`;
export const wedgeClip = (turn) => `polygon(${WEDGE_CORNERS.filter((_, corner) => corner !== turn).join(', ')})`;
const clampZoom = (zoom) => Math.min(ZOOM.max, Math.max(ZOOM.min, zoom));

export function bindShipBuilder(root, { addBlock, removeBlock, showOptions }) {
  const find = (selector) => root.querySelector(selector);
  const view = find('[data-builder-view]');
  const board = find('[data-builder-board]');
  const modeButtons = [...root.querySelectorAll('[data-builder-mode]')];
  const placeTools = find('[data-builder-place-tools]');
  const blockChoice = find('[data-block-choice]');
  const hullPaint = find('[data-hull-paint]');
  const wedgeTurn = find('[data-wedge-turn]');
  const inspectCard = find('[data-builder-inspect]');
  const hint = find('[data-builder-hint]');
  const title = find('[data-builder-title]');
  const stats = find('[data-builder-stats]');

  const camera = { x: 0, y: 0, zoom: 1 };
  let mode = 'place';
  let editable = false;
  let plan = [];
  let shownSignature = '';
  let selected = null;
  let awaitingPlan = false;

  hullPaint.replaceChildren(...Object.entries(HULL_PAINTS).map(([value, { label }]) => new Option(label, value)));

  function applyCamera() {
    board.style.transform = `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`;
    view.style.backgroundSize = `${CELL_PX * camera.zoom}px ${CELL_PX * camera.zoom}px`;
    view.style.backgroundPosition = `${camera.x}px ${camera.y}px`;
  }

  function zoomAround(factor, screenX, screenY) {
    const zoom = clampZoom(camera.zoom * factor);
    const scale = zoom / camera.zoom;
    camera.x = screenX - (screenX - camera.x) * scale;
    camera.y = screenY - (screenY - camera.y) * scale;
    camera.zoom = zoom;
    applyCamera();
  }

  const zoomAroundCentre = (factor) => zoomAround(factor, view.clientWidth / 2, view.clientHeight / 2);

  function fitShip() {
    const cells = plan.filter((cell) => !cell.open);
    if (!cells.length || !view.clientWidth) return;
    const { minCol, maxCol, minRow, maxRow } = partBounds(cells);
    const widthPx = (maxCol - minCol + 1 + FIT_MARGIN_CELLS * 2) * CELL_PX;
    const heightPx = (maxRow - minRow + 1 + FIT_MARGIN_CELLS * 2) * CELL_PX;
    camera.zoom = clampZoom(Math.min(view.clientWidth / widthPx, view.clientHeight / heightPx));
    const midX = ((minCol + maxCol + 1) / 2) * CELL_PX;
    const midY = ((minRow + maxRow + 1) / 2) * CELL_PX;
    camera.x = view.clientWidth / 2 - midX * camera.zoom;
    camera.y = view.clientHeight / 2 - midY * camera.zoom;
    applyCamera();
  }

  function cellAt(clientX, clientY) {
    const box = view.getBoundingClientRect();
    const col = Math.floor((clientX - box.left - camera.x) / camera.zoom / CELL_PX);
    const row = Math.floor((clientY - box.top - camera.y) / camera.zoom / CELL_PX);
    return plan.find((cell) => cell.col === col && cell.row === row && (!cell.open || mode === 'place'));
  }

  const look = () => ({ paint: hullPaint.value, turn: Number(wedgeTurn.value) });

  function describeCell(cell) {
    const block = SHIP_BLOCKS[cell.type];
    const paint = block.structural ? ` · ${(HULL_PAINTS[cell.paint] ?? HULL_PAINTS.steel).label}` : '';
    const holding = cell.removable ? '' : ' · holds other blocks on';
    return `${block.label}${paint} · mass ${block.mass} · cost ${block.cost.toLocaleString()}${holding}`;
  }

  function showInspected() {
    const cell = selected && plan.find((entry) => !entry.open && cellKey(entry.col, entry.row) === selected);
    inspectCard.hidden = mode !== 'inspect' || !cell;
    if (cell) inspectCard.textContent = describeCell(cell);
    for (const element of board.children) element.classList.toggle('is-selected', mode === 'inspect' && element.dataset.cell === selected);
  }

  function actOn(cell) {
    if (!cell) return;
    if (mode === 'place' && cell.open && editable && blockChoice.value) addBlock(blockChoice.value, { col: cell.col, row: cell.row }, look());
    else if (mode === 'erase' && !cell.open && editable && cell.removable) removeBlock(cell.index);
    else if (mode === 'inspect' && !cell.open) {
      selected = cellKey(cell.col, cell.row);
      showInspected();
    }
  }

  function drawCell(cell) {
    const element = document.createElement('button');
    element.type = 'button';
    element.dataset.cell = cellKey(cell.col, cell.row);
    element.style.left = `${cell.col * CELL_PX}px`;
    element.style.top = `${cell.row * CELL_PX}px`;
    if (cell.open) {
      element.className = 'pp-builder-spot';
      element.setAttribute('aria-label', 'Attach the picked block here');
      return element;
    }
    element.className = 'pp-builder-block';
    element.classList.toggle('is-anchor', !cell.removable);
    element.style.background = cell.colour;
    if (cell.type === 'wedge') element.style.clipPath = wedgeClip(cell.turn);
    element.setAttribute('aria-label', cell.label);
    return element;
  }

  function drawBoard() {
    const shown = plan.filter((cell) => !cell.open || (mode === 'place' && editable));
    const signature = `${mode}:${editable}:${shown.map((cell) => `${cell.col},${cell.row},${cell.type},${cell.colour},${cell.turn},${cell.removable}`).join('|')}`;
    if (signature === shownSignature) return;
    shownSignature = signature;
    board.replaceChildren(...shown.map(drawCell));
    showInspected();
  }

  function showStructureChoices() {
    const type = blockChoice.value;
    hullPaint.hidden = !SHIP_BLOCKS[type]?.structural;
    wedgeTurn.hidden = type !== 'wedge';
    view.style.setProperty('--pp-ghost', type ? (SHIP_BLOCKS[type].structural ? HULL_PAINTS[hullPaint.value].colour : SHIP_BLOCKS[type].colour) : 'transparent');
  }

  function setMode(next) {
    mode = !editable && EDITING_MODES.has(next) ? 'inspect' : next;
    root.dataset.mode = mode;
    for (const button of modeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.builderMode === mode));
      button.disabled = !editable && EDITING_MODES.has(button.dataset.builderMode);
    }
    placeTools.hidden = mode !== 'place';
    hint.textContent = editable ? HINTS[mode] : HINTS.locked;
    drawBoard();
    showInspected();
  }

  const touches = new Map();
  let gesture = null;

  const spreadAndMiddle = () => {
    const [a, b] = touches.values();
    return { spread: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  view.addEventListener('pointerdown', (event) => {
    if (event.button > 0 || event.target.closest('.pp-builder-zoom, .pp-builder-inspect')) return;
    view.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = touches.size === 1 ? { kind: 'tap', startX: event.clientX, startY: event.clientY } : { kind: 'pinch', ...spreadAndMiddle() };
  });

  view.addEventListener('pointermove', (event) => {
    const last = touches.get(event.pointerId);
    if (!last || !gesture) return;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.kind === 'pinch' && touches.size === 2) {
      const next = spreadAndMiddle();
      const box = view.getBoundingClientRect();
      camera.x += next.x - gesture.x;
      camera.y += next.y - gesture.y;
      if (gesture.spread > 0) zoomAround(next.spread / gesture.spread, next.x - box.left, next.y - box.top);
      else applyCamera();
      gesture = { kind: 'pinch', ...next };
      return;
    }
    if (gesture.kind === 'tap' && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > TAP_SLOP_PX) gesture = { kind: 'pan' };
    if (gesture.kind === 'pan') {
      camera.x += event.clientX - last.x;
      camera.y += event.clientY - last.y;
      applyCamera();
    }
  });

  const letGo = (event) => {
    if (!touches.delete(event.pointerId)) return;
    if (event.type === 'pointerup' && gesture?.kind === 'tap') actOn(cellAt(event.clientX, event.clientY));
    gesture = touches.size ? { kind: 'pan' } : null;
  };
  for (const type of ['pointerup', 'pointercancel']) view.addEventListener(type, letGo);

  view.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const box = view.getBoundingClientRect();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? ZOOM.linePx : 1;
      zoomAround(Math.exp(-event.deltaY * lines * ZOOM.wheelSensitivity), event.clientX - box.left, event.clientY - box.top);
    },
    { passive: false },
  );

  board.addEventListener('click', (event) => {
    const element = event.detail === 0 && event.target.closest('[data-cell]');
    if (!element) return;
    const [col, row] = element.dataset.cell.split(',').map(Number);
    actOn(plan.find((cell) => cell.col === col && cell.row === row && (!cell.open || mode === 'place')));
  });

  find('[data-builder-zoom="in"]').addEventListener('click', () => zoomAroundCentre(ZOOM.step));
  find('[data-builder-zoom="out"]').addEventListener('click', () => zoomAroundCentre(1 / ZOOM.step));
  find('[data-builder-fit]').addEventListener('click', fitShip);
  let viewSize = { width: view.clientWidth, height: view.clientHeight };
  new ResizeObserver(() => {
    camera.x += (view.clientWidth - viewSize.width) / 2;
    camera.y += (view.clientHeight - viewSize.height) / 2;
    viewSize = { width: view.clientWidth, height: view.clientHeight };
    applyCamera();
  }).observe(view);
  modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.builderMode)));
  blockChoice.addEventListener('change', showStructureChoices);
  hullPaint.addEventListener('change', showStructureChoices);

  function startView() {
    awaitingPlan = false;
    selected = null;
    setMode(editable ? 'place' : 'inspect');
    viewSize = { width: view.clientWidth, height: view.clientHeight };
    fitShip();
  }

  function open() {
    root.hidden = false;
    awaitingPlan = true;
    if (plan.length) startView();
  }

  const close = () => {
    root.hidden = true;
  };

  function update({ title: shipTitle, stats: shipStats, plan: nextPlan, shipyard, blockChoices }) {
    title.textContent = `${shipTitle} builder`;
    stats.textContent = shipStats;
    plan = nextPlan;
    showOptions(blockChoice, blockChoices);
    showStructureChoices();
    const canEdit = shipyard && blockChoices.length > 0;
    if (canEdit !== editable) {
      editable = canEdit;
      setMode(mode);
    }
    drawBoard();
    if (awaitingPlan && !root.hidden) startView();
  }

  return { open, close, update, isOpen: () => !root.hidden };
}
