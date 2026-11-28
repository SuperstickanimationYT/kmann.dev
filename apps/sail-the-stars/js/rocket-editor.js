import { assemble, DEFAULT_DESIGN, PARTS, rectOf, rounded, settled, STANDARD_GRAVITY, stageSummaries, SYMMETRIES, touching } from './rocket-stages.js';

const PART_NAMES = {
  capsule: 'Capsule',
  parachute: 'Parachute',
  heatShield: 'Heat shield',
  tank: 'Fuel tank',
  engine: 'Engine',
  separator: 'Separator',
  sideSeparator: 'Side separator',
  legs: 'Landing legs',
};
const PALETTE = Object.keys(PART_NAMES);

const OUTLINES = {
  capsule: [[0, 1], [0.32, 0], [0.68, 0], [1, 1]],
  parachute: [[0.1, 1], [0.1, 0.4], [0.5, 0], [0.9, 0.4], [0.9, 1]],
  heatShield: [[0, 0], [1, 0], [0.94, 1], [0.06, 1]],
  tank: [[0, 0], [1, 0], [1, 1], [0, 1]],
  engine: [[0.28, 0], [0.72, 0], [0.72, 0.3], [1, 1], [0, 1], [0.28, 0.3]],
  separator: [[0, 0], [1, 0], [1, 1], [0, 1]],
  sideSeparator: [[0, 0], [1, 0], [1, 1], [0, 1]],
  legs: [[0, 0], [0.3, 0], [1, 0.9], [1, 1], [0.6, 1], [0.6, 0.9], [0, 0.2]],
};
const DETAIL_LINES = {
  tank: [[[0, 0.1], [1, 0.1]], [[0, 0.9], [1, 0.9]]],
  separator: [[[0, 0.5], [1, 0.5]]],
  sideSeparator: [[[0.5, 0], [0.5, 1]]],
};

const BLUEPRINT = {
  paper: '#0a2c52',
  minor: 'rgba(160, 205, 255, 0.1)',
  major: 'rgba(160, 205, 255, 0.26)',
  axis: 'rgba(160, 205, 255, 0.55)',
  line: '#e6f1ff',
  fill: 'rgba(230, 241, 255, 0.12)',
  chosen: '#7cc4ff',
  loose: '#ffae8a',
  blocked: '#ff6b5c',
};

const SNAP_PIXELS = 14;
const GRID_STEP_M = 0.1;
const MAJOR_GRID_M = 5;
const SMALLEST_VIEW_M = 30;
const VIEW_MARGIN_M = 8;
const DRAG_START_PIXELS = 4;
const TOUCHING_M = 0.01;
const PALETTE_ICON_PX = 34;

const overlapping = (p, q) => Math.min(p.right, q.right) - Math.max(p.left, q.left) > TOUCHING_M && Math.min(p.top, q.top) - Math.max(p.bottom, q.bottom) > TOUCHING_M;

const images = (part) => (part.copies > 1 ? [1, -1] : [1]);

function problemWith(placed, others) {
  const { widthM } = PARTS[placed.type];
  if (placed.copies > 1 && 2 * placed.x * Math.sin(Math.PI / placed.copies) < widthM - TOUCHING_M) return `Too close to the middle for ${placed.copies} around.`;
  const own = rectOf(placed);
  const hit = others.some((other) => images(other).some((sign) => overlapping(own, rectOf({ ...other, x: other.x * sign }))));
  return hit ? 'It would overlap another part.' : null;
}

function nearest(value, options, reach) {
  const best = options.reduce((closest, option) => (Math.abs(option - value) < Math.abs(closest - value) ? option : closest), Infinity);
  return Math.abs(best - value) <= reach ? best : Math.round(value / GRID_STEP_M) * GRID_STEP_M;
}

function snapped(type, copiesWanted, rawX, rawY, others, metresPerPixel) {
  const { widthM, heightM } = PARTS[type];
  const xs = [0];
  const ys = [0];
  for (const other of others) {
    const rect = rectOf(other);
    xs.push(other.x, rect.right + widthM / 2, rect.left - widthM / 2);
    ys.push(rect.top, rect.bottom - heightM, rect.bottom, rect.top - heightM);
  }
  const reach = SNAP_PIXELS * metresPerPixel;
  const across = nearest(Math.abs(rawX), xs.filter((x) => x >= 0), reach);
  const x = across < widthM / 2 ? 0 : rounded(across);
  const placed = { type, x, y: rounded(nearest(rawY, ys, reach)), copies: x ? Math.max(2, copiesWanted) : 1 };
  return { placed, problem: problemWith(placed, others) };
}

function tracePart(context, type, left, top, width, height, mirrored = false) {
  const at = ([u, v]) => [left + (mirrored ? 1 - u : u) * width, top + v * height];
  context.beginPath();
  OUTLINES[type].forEach((corner, k) => context[k ? 'lineTo' : 'moveTo'](...at(corner)));
  context.closePath();
  context.fill();
  context.stroke();
  for (const [from, to] of DETAIL_LINES[type] ?? []) {
    context.beginPath();
    context.moveTo(...at(from));
    context.lineTo(...at(to));
    context.stroke();
  }
}

function paletteIcon(type) {
  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  canvas.width = canvas.height = PALETTE_ICON_PX * ratio;
  const context = canvas.getContext('2d');
  const { widthM, heightM } = PARTS[type];
  const scale = (PALETTE_ICON_PX - 6) / Math.max(widthM, heightM);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.strokeStyle = BLUEPRINT.line;
  context.fillStyle = BLUEPRINT.fill;
  context.lineWidth = 1.2;
  tracePart(context, type, (PALETTE_ICON_PX - widthM * scale) / 2, (PALETTE_ICON_PX - heightM * scale) / 2, widthM * scale, heightM * scale);
  canvas.setAttribute('aria-hidden', 'true');
  return canvas;
}

const formatKmS = (metresPerSecond) => `${(metresPerSecond / 1000).toFixed(2)} km/s`;
const formatTonnes = (kg) => `${(kg / 1000).toFixed(kg < 10000 ? 1 : 0)} t`;

export function createRocketEditor(panel, { onDone }) {
  const grid = panel.querySelector('[data-editor-grid]');
  const partsList = panel.querySelector('[data-editor-parts]');
  const symmetryButtons = panel.querySelector('[data-editor-symmetry]');
  const note = panel.querySelector('[data-editor-note]');
  const stagesList = panel.querySelector('[data-editor-stages]');
  const total = panel.querySelector('[data-editor-total]');
  const warnings = panel.querySelector('[data-editor-warnings]');
  const removeButton = panel.querySelector('[data-editor-remove]');
  let design = { parts: [] };
  let symmetry = 2;
  let chosen = null;
  let drag = null;
  let view = null;
  let loose = new Set();
  let changed = false;

  function fitView() {
    const width = grid.clientWidth;
    const height = grid.clientHeight;
    const rects = design.parts.flatMap((part) => images(part).map((sign) => rectOf({ ...part, x: part.x * sign })));
    const top = Math.max(0, ...rects.map((rect) => rect.top));
    const bottom = Math.min(0, ...rects.map((rect) => rect.bottom));
    const reach = Math.max(0, ...rects.map((rect) => Math.abs(rect.right)));
    const scale = Math.min(height / Math.max(SMALLEST_VIEW_M, top - bottom + 2 * VIEW_MARGIN_M), width / (2 * (reach + VIEW_MARGIN_M)));
    view = { width, height, scale, originX: width / 2, originY: height / 2 + ((top + bottom) / 2) * scale };
  }

  const toMetres = (clientX, clientY) => {
    const box = grid.getBoundingClientRect();
    return { x: (clientX - box.left - view.originX) / view.scale, y: (view.originY - (clientY - box.top)) / view.scale, inside: clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom };
  };

  function partAt({ x, y }) {
    const hits = design.parts.filter((part) => images(part).some((sign) => {
      const rect = rectOf({ ...part, x: part.x * sign });
      return x >= rect.left && x <= rect.right && y >= rect.bottom && y <= rect.top;
    }));
    return hits.at(-1) ?? null;
  }

  function drawPart(context, part, colour) {
    const { widthM, heightM } = PARTS[part.type];
    context.strokeStyle = colour;
    context.fillStyle = BLUEPRINT.fill;
    for (const sign of images(part)) {
      const left = view.originX + (part.x * sign - widthM / 2) * view.scale;
      const top = view.originY - (part.y + heightM) * view.scale;
      tracePart(context, part.type, left, top, widthM * view.scale, heightM * view.scale, sign < 0);
    }
    if (part.copies > 1) {
      context.fillStyle = colour;
      context.fillText(`×${part.copies}`, view.originX + (part.x + widthM / 2) * view.scale + 4, view.originY - (part.y + heightM / 2) * view.scale);
    }
  }

  function drawGrid(context) {
    context.fillStyle = BLUEPRINT.paper;
    context.fillRect(0, 0, view.width, view.height);
    const metres = (pixels) => pixels / view.scale;
    const [leftM, rightM] = [metres(-view.originX), metres(view.width - view.originX)];
    const [bottomM, topM] = [metres(view.originY - view.height), metres(view.originY)];
    context.lineWidth = 1;
    for (let x = Math.ceil(leftM); x <= rightM; x++) {
      context.strokeStyle = x === 0 ? BLUEPRINT.axis : x % MAJOR_GRID_M ? BLUEPRINT.minor : BLUEPRINT.major;
      const px = Math.round(view.originX + x * view.scale) + 0.5;
      context.beginPath();
      context.moveTo(px, 0);
      context.lineTo(px, view.height);
      context.stroke();
    }
    for (let y = Math.ceil(bottomM); y <= topM; y++) {
      context.strokeStyle = y % MAJOR_GRID_M ? BLUEPRINT.minor : BLUEPRINT.major;
      const py = Math.round(view.originY - y * view.scale) + 0.5;
      context.beginPath();
      context.moveTo(0, py);
      context.lineTo(view.width, py);
      context.stroke();
    }
  }

  function draw() {
    if (panel.hidden) return;
    const ratio = window.devicePixelRatio || 1;
    if (!drag) fitView();
    const [width, height] = [Math.round(view.width * ratio), Math.round(view.height * ratio)];
    if (grid.width !== width || grid.height !== height) [grid.width, grid.height] = [width, height];
    const context = grid.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawGrid(context);
    context.lineWidth = 1.5;
    context.font = '12px system-ui, sans-serif';
    context.textBaseline = 'middle';
    for (const part of design.parts) drawPart(context, part, part === chosen ? BLUEPRINT.chosen : loose.has(part) ? BLUEPRINT.loose : BLUEPRINT.line);
    if (drag?.place) {
      context.setLineDash([5, 4]);
      drawPart(context, drag.place.placed, drag.place.problem ? BLUEPRINT.blocked : BLUEPRINT.chosen);
      context.setLineDash([]);
    }
  }

  function describe() {
    stagesList.replaceChildren();
    warnings.replaceChildren();
    removeButton.disabled = !chosen;
    if (!design.parts.length) {
      loose = new Set();
      total.textContent = 'Drag parts onto the grid, or click one to stack it on top.';
      return;
    }
    const vehicle = assemble(design);
    loose = new Set(design.parts.filter((_, id) => !vehicle.attached.has(id)));
    const stages = stageSummaries(vehicle);
    stages.forEach((stage, k) => {
      const thrustN = k ? stage.vacuumThrustN : stage.seaLevelThrustN;
      const item = document.createElement('li');
      item.textContent = stage.deltaVMS ? `${formatKmS(stage.deltaVMS)}, ${Math.round(stage.burnSeconds)} s, thrust ${(thrustN / (stage.startKg * STANDARD_GRAVITY)).toFixed(2)} × weight` : 'No engine';
      stagesList.append(item);
    });
    const deltaVMS = stages.reduce((sum, { deltaVMS: part }) => sum + part, 0);
    const heights = design.parts.map(rectOf);
    total.textContent = `${formatKmS(deltaVMS)} in vacuum, ${formatTonnes(stages[0].startKg)}, ${Math.round(Math.max(...heights.map(({ top }) => top)) - Math.min(...heights.map(({ bottom }) => bottom)))} m tall.`;
    const warn = (text) => warnings.append(Object.assign(document.createElement('li'), { textContent: text }));
    if (loose.size) warn(`${loose.size} ${loose.size === 1 ? 'part touches' : 'parts touch'} nothing that reaches the ${vehicle.entries[vehicle.root].type === 'capsule' ? 'capsule' : 'top part'}, so ${loose.size === 1 ? 'it stays' : 'they stay'} behind.`);
    if (!stages[0].seaLevelThrustN) warn('Nothing fires at launch: an engine needs fuel in its stage and nothing under its nozzle.');
    else if (stages[0].seaLevelThrustN < stages[0].startKg * STANDARD_GRAVITY) warn('Too heavy to lift off Earth.');
  }

  function update() {
    describe();
    draw();
  }

  function commit(next) {
    design = next;
    changed = true;
    update();
  }

  function stackOnTop(type) {
    const middle = design.parts.filter(({ x }) => x === 0).map(rectOf);
    const placed = { type, x: 0, y: rounded(Math.max(0, ...middle.map(({ top }) => top))), copies: 1 };
    const problem = problemWith(placed, design.parts);
    if (problem) {
      note.textContent = problem;
      return;
    }
    chosen = placed;
    commit({ parts: [...design.parts, placed] });
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_START_PIXELS) return;
    drag.moved = true;
    const at = toMetres(event.clientX, event.clientY);
    const others = design.parts.filter((part) => part !== drag.from);
    drag.place = at.inside ? snapped(drag.type, drag.copies, at.x - drag.grabX, at.y - drag.grabY, others, 1 / view.scale) : null;
    note.textContent = drag.place?.problem ?? (at.inside || !drag.from ? '' : 'Let go here to remove it.');
    draw();
  }

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { from, place, moved, type } = drag;
    drag = null;
    const others = design.parts.filter((part) => part !== from);
    if (!moved) {
      if (from) chosen = from;
      else stackOnTop(type);
      update();
      return;
    }
    if (place && !place.problem) {
      chosen = place.placed;
      commit({ parts: [...others, place.placed] });
    } else if (from && !place && event.type === 'pointerup') {
      chosen = null;
      note.textContent = `${PART_NAMES[from.type]} removed.`;
      commit({ parts: others });
    } else update();
  }

  function startDrag(event, fields) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, place: null, grabX: 0, grabY: 0, ...fields };
  }

  for (const type of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    const { kg, fuelKg = 0 } = PARTS[type];
    const label = document.createElement('span');
    label.append(PART_NAMES[type], Object.assign(document.createElement('small'), { textContent: fuelKg ? `${formatTonnes(kg)} + ${formatTonnes(fuelKg)} fuel` : formatTonnes(kg) }));
    button.append(paletteIcon(type), label);
    button.addEventListener('pointerdown', (event) => startDrag(event, { type, copies: symmetry, from: null, grabY: PARTS[type].heightM / 2 }));
    button.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), stackOnTop(type)));
    partsList.append(button);
  }
  for (const target of [partsList, grid]) {
    target.addEventListener('pointermove', moveDrag);
    target.addEventListener('pointerup', endDrag);
    target.addEventListener('pointercancel', endDrag);
  }

  grid.addEventListener('pointerdown', (event) => {
    const at = toMetres(event.clientX, event.clientY);
    const part = partAt(at);
    if (!part) {
      chosen = null;
      update();
      return;
    }
    const sign = at.x < 0 && part.copies > 1 ? -1 : 1;
    startDrag(event, { type: part.type, copies: part.copies > 1 ? part.copies : symmetry, from: part, grabX: at.x - part.x * sign, grabY: at.y - part.y });
  });

  for (const copies of SYMMETRIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `×${copies}`;
    button.dataset.copies = copies;
    button.addEventListener('click', () => chooseSymmetry(copies));
    symmetryButtons.append(button);
  }

  function chooseSymmetry(copies) {
    symmetry = copies;
    for (const button of symmetryButtons.children) button.setAttribute('aria-pressed', String(Number(button.dataset.copies) === copies));
    if (!chosen || chosen.copies === 1) return;
    const group = sideGroup(chosen);
    const regrouped = new Map(group.map((part) => [part, { ...part, copies }]));
    const kept = design.parts.filter((part) => !regrouped.has(part));
    const problem = [...regrouped.values()].map((part) => problemWith(part, kept)).find(Boolean);
    note.textContent = problem ?? '';
    if (problem) return;
    chosen = regrouped.get(chosen);
    commit({ parts: design.parts.map((part) => regrouped.get(part) ?? part) });
  }

  function sideGroup(start) {
    const group = [start];
    for (let k = 0; k < group.length; k++) {
      for (const part of design.parts) if (part.copies > 1 && !group.includes(part) && touching(part, group[k])) group.push(part);
    }
    return group;
  }

  function removeChosen() {
    if (!chosen) return;
    const gone = chosen;
    chosen = null;
    note.textContent = `${PART_NAMES[gone.type]} removed.`;
    commit({ parts: design.parts.filter((part) => part !== gone) });
  }

  removeButton.addEventListener('click', removeChosen);
  panel.querySelector('[data-editor-default]').addEventListener('click', () => replace(DEFAULT_DESIGN));
  panel.querySelector('[data-editor-clear]').addEventListener('click', () => replace({ parts: [] }));
  panel.addEventListener('keydown', (event) => (event.key === 'Delete' || event.key === 'Backspace') && removeChosen());
  grid.addEventListener('contextmenu', (event) => event.preventDefault());
  new ResizeObserver(draw).observe(grid);

  function replace(next) {
    chosen = null;
    note.textContent = '';
    commit({ parts: next.parts.map((part) => ({ ...part })) });
  }

  return {
    open(current) {
      panel.hidden = false;
      design = { parts: current.parts.map((part) => ({ ...part })) };
      changed = false;
      chosen = null;
      note.textContent = '';
      chooseSymmetry(symmetry);
      update();
    },
    finish() {
      if (changed && !design.parts.length) {
        note.textContent = 'Add at least one part first.';
        return false;
      }
      panel.hidden = true;
      drag = null;
      if (changed) onDone(settled(design));
      return true;
    },
  };
}
