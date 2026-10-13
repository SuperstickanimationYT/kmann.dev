import { CHIP_COLORS, CLOCK_RATES, MAX_INPUTS, MIN_INPUTS, PART_NAMES, PARTS, hasInputCount, hasLabel, inputCount, isChipInput, isChipOutput, layout } from './parts.js';
import { bounds, chipPins, cloneCircuit, emptyCircuit, extract, forbiddenChips, isChipDef, isCircuit, mergeLibrary, pruneWires, uid, usages } from './library.js';
import { makeTab, store } from './store.js';
import { compile } from './sim.js';
import { drawComponent, drawScene } from './render.js';
import { Editor } from './editor.js';

const STORAGE_KEY = 'logic-circuits:v1';
const FRAME_BUDGET_MS = 10;
const STATUS_MS = 7000;

const $ = (selector) => document.querySelector(selector);
const canvas = $('[data-board]');
const context = canvas.getContext('2d');
const statusLine = $('[data-status]');

let sim = null;
let running = true;
let saveTimer = 0;
let statusTimer = 0;
let canvasSize = { width: 0, height: 0, ratio: 1 };

const editor = new Editor(canvas, store, {
  changed: (kind) => store.emit(kind),
  selectionChanged: () => {
    renderSelection();
    renderToolbar();
  },
  status: (text) => say(text, 0),
  input: (comp) => {
    sim.setSwitch(comp.id, comp.on || comp.pressed);
    scheduleSave();
  },
  openChip,
  editLabel: () => $('[data-label]')?.select(),
  forbiddenChips: () => forbiddenChips(store.editingIds(), store.chips),
});

store.listeners.add((kind) => {
  if (kind === 'structure') {
    editor.syncSelection();
    rebuild(true);
    renderTabs();
    renderChips();
    renderSelection();
  }
  renderToolbar();
  scheduleSave();
});

function say(text, ms = STATUS_MS) {
  clearTimeout(statusTimer);
  statusLine.textContent = text;
  statusLine.hidden = !text;
  if (text && ms) statusTimer = setTimeout(() => say(''), ms);
}

function rebuild(keepState) {
  const ws = store.current();
  sim = compile(ws.circuit, store.chips, keepState ? sim : ws.sim);
  ws.sim = sim;
  for (const comp of ws.circuit.components) {
    if (isChipInput(comp.kind)) sim.setSwitch(comp.id, comp.on || comp.pressed);
  }
}

function pruneEverywhere() {
  for (const def of store.chips.values()) pruneWires(def.circuit, store.chips);
  for (const ws of store.workspaces()) pruneWires(ws.circuit, store.chips);
}

function starterBoard() {
  const a = { id: uid(), kind: 'switch', x: 0, y: 0, label: 'A', on: true };
  const b = { id: uid(), kind: 'switch', x: 0, y: 60, label: 'B' };
  const gate = { id: uid(), kind: 'and', x: 120, y: 20 };
  const light = { id: uid(), kind: 'light', x: 260, y: 20, label: 'Q' };
  const wire = (from, to, p) => ({ id: uid(), from: { c: from.id, p: 'out' }, to: { c: to.id, p }, points: [] });
  return {
    components: [a, b, gate, light],
    wires: [wire(a, gate, 'in0'), wire(b, gate, 'in1'), wire(gate, light, 'in')],
  };
}

function savedTabs(saved) {
  if (saved?.version === 1 && isCircuit(saved.board)) {
    return [{ name: 'Board 1', board: saved.board, view: saved.view, stack: (saved.stack ?? []).map((draft, i, all) => ({ ...draft, view: i === all.length - 1 ? saved.draftView : null })) }];
  }
  return Array.isArray(saved?.tabs) ? saved.tabs.filter((tab) => isCircuit(tab?.board)) : [];
}

function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    saved = null;
  }
  for (const def of saved?.chips ?? []) if (isChipDef(def)) store.chips.set(def.id, def);
  for (const entry of savedTabs(saved)) {
    store.addTab(makeTab(String(entry.name || store.nextTabName()), entry.board, entry.view ?? null));
    for (const draft of entry.stack ?? []) {
      const def = store.chips.get(draft.chipId);
      if (def && isCircuit(draft.circuit) && !store.tabEditing(def.id)) store.openChip(def, draft.circuit, draft.view ?? null);
    }
  }
  if (!store.tabs.length) {
    store.addTab(makeTab('Board 1', starterBoard()));
    return false;
  }
  store.activeTab = store.tabs[Math.min(Math.max(0, saved.active ?? 0), store.tabs.length - 1)];
  pruneEverywhere();
  return true;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  const current = store.current();
  const viewOf = (ws) => (ws === current ? editor.view : ws.view);
  const state = {
    version: 2,
    chips: [...store.chips.values()],
    tabs: store.tabs.map((tab) => ({
      name: tab.name,
      board: tab.root.circuit,
      view: viewOf(tab.root),
      stack: tab.stack.map((ws) => ({ chipId: ws.chipId, circuit: ws.circuit, view: viewOf(ws) })),
    })),
    active: store.tabs.indexOf(store.activeTab),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state, (key, value) => (key === 'pressed' ? undefined : value)));
  } catch {
    say('Could not save in this browser. Use Export file to keep your work.');
  }
}

function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(save, 400);
}

function resize() {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (canvasSize.width && canvasSize.height) {
    editor.view.x += (canvasSize.width - rect.width) / 2 / editor.view.zoom;
    editor.view.y += (canvasSize.height - rect.height) / 2 / editor.view.zoom;
  }
  canvasSize = { width: rect.width, height: rect.height, ratio };
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
}

let lastFrame = performance.now();
function frame(now) {
  const seconds = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (running) sim.advance(seconds, performance.now() + FRAME_BUDGET_MS);
  const ws = store.current();
  drawScene(context, {
    ...canvasSize,
    view: editor.view,
    circuit: ws.circuit,
    chips: store.chips,
    sim,
    selection: editor.selection,
    wireSelection: editor.wireSelection,
    draft: editor.draft,
    ghost: editor.ghost,
    box: editor.gesture?.type === 'box' && editor.gesture.moved ? editor.gesture : null,
    editingChip: ws.chipId,
  });
  requestAnimationFrame(frame);
}

function partIcon(spec) {
  const icon = document.createElement('canvas');
  const width = 64;
  const height = 44;
  const ratio = window.devicePixelRatio || 1;
  icon.width = width * ratio;
  icon.height = height * ratio;
  icon.className = 'lc-part-icon';
  const ctx = icon.getContext('2d');
  const comp = { id: 'icon', kind: spec.kind, x: 0, y: 0, hz: 1, on: spec.kind === 'switch' };
  const box = layout(comp, store.chips);
  const scale = Math.min((width - 8) / box.w, (height - 8) / box.h, 0.8);
  ctx.setTransform(ratio * scale, 0, 0, ratio * scale, ratio * (width - box.w * scale) / 2, ratio * (height - box.h * scale) / 2);
  drawComponent(ctx, comp, store.chips, () => (spec.kind === 'light' ? 1 : 0), { detailed: false });
  return icon;
}

let paletteDrag = null;
let swallowClick = false;

function makePlacer(button, spec) {
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    paletteDrag = { spec, start: { x: event.clientX, y: event.clientY }, active: false };
  });
  button.addEventListener('click', () => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    editor.place(spec);
  });
}

function overCanvas(event) {
  const rect = canvas.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  return inside && document.elementFromPoint(event.clientX, event.clientY) === canvas;
}

window.addEventListener('pointermove', (event) => {
  if (!paletteDrag) return;
  if (!paletteDrag.active && Math.hypot(event.clientX - paletteDrag.start.x, event.clientY - paletteDrag.start.y) > 6) {
    paletteDrag.active = true;
    document.body.classList.add('lc-dragging');
  }
  if (paletteDrag.active) editor.ghostAt(paletteDrag.spec, overCanvas(event) ? editor.screenPoint(event) : null);
});

window.addEventListener('pointerup', (event) => {
  if (!paletteDrag) return;
  const drag = paletteDrag;
  paletteDrag = null;
  editor.ghost = null;
  document.body.classList.remove('lc-dragging');
  if (!drag.active) return;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; });
  if (overCanvas(event)) editor.place(drag.spec, editor.screenPoint(event));
});

function renderParts() {
  const list = $('[data-parts]');
  for (const part of PARTS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lc-part';
    button.title = part.hint;
    button.append(partIcon(part), Object.assign(document.createElement('span'), { textContent: part.name }));
    makePlacer(button, { kind: part.kind });
    list.append(button);
  }
}

function button(label, onClick, className = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  if (className) element.className = className;
  element.addEventListener('click', onClick);
  return element;
}

function pinSummary(def) {
  return `${def.inputs.length} in, ${def.outputs.length} out`;
}

function renderChips() {
  const list = $('[data-chips]');
  list.replaceChildren();
  const editing = store.editingIds();
  const forbidden = forbiddenChips(editing, store.chips);
  const defs = [...store.chips.values()].sort((a, b) => a.name.localeCompare(b.name));
  $('[data-no-chips]').hidden = defs.length > 0;
  for (const def of defs) {
    const item = document.createElement('li');
    const place = document.createElement('button');
    place.type = 'button';
    place.className = 'lc-chip';
    place.style.setProperty('--chip', def.color);
    place.append(def.name, Object.assign(document.createElement('small'), { textContent: pinSummary(def) }));
    if (forbidden.has(def.id)) {
      place.disabled = true;
      place.title = editing.includes(def.id) ? 'You are editing this chip' : 'This chip is built from the one you are editing, so it cannot go inside it';
    } else {
      place.title = 'Drag onto the board, or click to drop it in the middle';
      makePlacer(place, { kind: 'chip', chip: def.id });
    }
    const tools = document.createElement('div');
    tools.className = 'lc-chip-tools';
    const open = button('Open', () => openChip(def.id));
    open.disabled = editing.includes(def.id);
    tools.append(open, button('Details', () => editChipDetails(def.id)), button('Delete', () => deleteChip(def.id)));
    item.append(place, tools);
    list.append(item);
  }
}

function field(labelText, control) {
  const label = document.createElement('label');
  label.className = 'lc-field';
  label.append(Object.assign(document.createElement('span'), { textContent: labelText }), control);
  return label;
}

function note(text) {
  return Object.assign(document.createElement('p'), { className: 'lc-note', textContent: text });
}

function renderSelection() {
  const host = $('[data-selection]');
  host.replaceChildren();
  const comps = editor.selectedComponents();
  const wires = editor.wireSelection.size;

  if (comps.length === 1) {
    host.append(...singlePartControls(comps[0]));
    return;
  }
  if (comps.length > 1) {
    const ids = new Set(comps.map((comp) => comp.id));
    const pins = chipPins(extract(editor.circuit, ids));
    host.append(note(`${comps.length} parts selected. As a chip they would have ${pins.inputs.length} input${pins.inputs.length === 1 ? '' : 's'} and ${pins.outputs.length} output${pins.outputs.length === 1 ? '' : 's'}.`));
    const actions = document.createElement('div');
    actions.className = 'lc-actions';
    actions.append(button('Make chip', makeChip, 'lc-primary'), button('Duplicate', () => editor.duplicate()), button('Delete', () => editor.deleteSelection()));
    host.append(actions);
    return;
  }
  if (wires) {
    host.append(note(`${wires} wire${wires === 1 ? '' : 's'} selected.`));
    const actions = document.createElement('div');
    actions.className = 'lc-actions';
    actions.append(button('Delete', () => editor.deleteSelection()));
    host.append(actions);
    return;
  }
  host.append(note('Nothing selected. Click a part to change it, or select several to make a chip.'));
}

function singlePartControls(comp) {
  const nodes = [];
  const def = comp.kind === 'chip' ? store.chips.get(comp.chip) : null;
  const heading = Object.assign(document.createElement('p'), { className: 'lc-picked', textContent: def ? def.name : PART_NAMES[comp.kind] });
  nodes.push(heading);
  const part = PARTS.find((entry) => entry.kind === comp.kind);
  if (part) nodes.push(note(part.hint));

  if (hasLabel(comp.kind)) {
    const input = Object.assign(document.createElement('input'), { value: comp.label ?? '', maxLength: 16, spellcheck: false });
    input.dataset.label = '';
    let before = null;
    let original = '';
    input.addEventListener('focus', () => {
      before = store.snapshot();
      original = comp.label ?? '';
    });
    input.addEventListener('input', () => { comp.label = input.value; });
    input.addEventListener('change', () => {
      if (before && (comp.label ?? '') !== original) store.record(before);
      before = store.snapshot();
      original = comp.label ?? '';
      scheduleSave();
    });
    nodes.push(field(isChipInput(comp.kind) || isChipOutput(comp.kind) ? 'Label (the pin name inside a chip)' : 'Label', input));
  }

  if (hasInputCount(comp.kind)) {
    const select = document.createElement('select');
    for (let n = MIN_INPUTS; n <= MAX_INPUTS; n++) select.append(new Option(String(n), String(n), false, n === inputCount(comp)));
    select.addEventListener('change', () => {
      store.record();
      comp.inputs = Number(select.value);
      pruneWires(editor.circuit, store.chips);
      store.emit('structure');
    });
    nodes.push(field('Inputs', select));
  }

  if (comp.kind === 'clock') {
    const select = document.createElement('select');
    for (const hz of CLOCK_RATES) select.append(new Option(`${hz} Hz`, String(hz), false, hz === (comp.hz ?? 1)));
    select.addEventListener('change', () => {
      store.record();
      comp.hz = Number(select.value);
      store.emit('structure');
    });
    nodes.push(field('Speed', select));
  }

  if (def) {
    nodes.push(note(`Inputs: ${def.inputs.map((pin) => pin.name).join(', ') || 'none'}. Outputs: ${def.outputs.map((pin) => pin.name).join(', ') || 'none'}.`));
  }

  const actions = document.createElement('div');
  actions.className = 'lc-actions';
  if (def && !store.editingIds().includes(def.id)) actions.append(button('Open chip', () => openChip(def.id), 'lc-primary'));
  actions.append(button('Duplicate', () => editor.duplicate()), button('Delete', () => editor.deleteSelection()));
  nodes.push(actions);
  return nodes;
}

function renderToolbar() {
  const ws = store.current();
  const anySelected = editor.selection.size > 0 || editor.wireSelection.size > 0;
  $('[data-undo]').disabled = !ws.undo.length;
  $('[data-redo]').disabled = !ws.redo.length;
  $('[data-delete]').disabled = !anySelected;
  $('[data-duplicate]').disabled = !editor.selection.size;
  $('[data-make-chip]').disabled = !ws.circuit.components.length;
  $('[data-make-chip]').textContent = editor.selection.size ? 'Make chip' : 'Make chip from board';
  $('[data-box-mode]').setAttribute('aria-pressed', String(editor.boxMode));

  const crumbs = $('[data-crumbs]');
  crumbs.hidden = !store.stack.length;
  if (store.stack.length) {
    const names = store.stack.map((entry) => store.chips.get(entry.chipId)?.name ?? '?');
    $('[data-crumb-path]').textContent = `${store.activeTab.name} › ${names.join(' › ')}`;
  }
}

function renderAll() {
  renderTabs();
  renderChips();
  renderSelection();
  renderToolbar();
}

const dialog = $('[data-chip-dialog]');
const dialogForm = $('[data-chip-form]');

function chipDialog({ title, ok, name, color, pins, renaming = null }) {
  $('[data-dialog-title]').textContent = title;
  $('[data-dialog-ok]').textContent = ok;
  $('[data-dialog-error]').textContent = '';
  const order = { inputs: [...pins.inputs], outputs: [...pins.outputs] };
  renderPinOrder(order);
  dialogForm.elements.name.value = name;
  const swatches = $('[data-swatches]');
  swatches.querySelectorAll('label').forEach((label) => label.remove());
  for (const choice of CHIP_COLORS) {
    const label = document.createElement('label');
    label.className = 'lc-swatch';
    label.style.setProperty('--chip', choice);
    const radio = Object.assign(document.createElement('input'), { type: 'radio', name: 'color', value: choice, checked: choice === color });
    radio.setAttribute('aria-label', choice);
    label.append(radio);
    swatches.append(label);
  }

  return new Promise((resolve) => {
    const finish = (result) => {
      dialogForm.removeEventListener('submit', submit);
      dialog.removeEventListener('close', dismissed);
      dialog.removeEventListener('cancel', dismissed);
      resolve(result);
    };
    const submit = (event) => {
      if (event.submitter?.value !== 'ok') {
        finish(null);
        return;
      }
      const chosen = dialogForm.elements.name.value.trim();
      const clash = [...store.chips.values()].some((def) => def.id !== renaming && def.name.toLowerCase() === chosen.toLowerCase());
      if (!chosen || clash) {
        event.preventDefault();
        $('[data-dialog-error]').textContent = chosen ? 'You already have a chip with that name.' : 'Give the chip a name.';
        return;
      }
      finish({ name: chosen, color: dialogForm.elements.color.value || color, pins: order });
    };
    const dismissed = () => finish(null);
    dialogForm.addEventListener('submit', submit);
    dialog.addEventListener('close', dismissed);
    dialog.addEventListener('cancel', dismissed);
    dialog.showModal();
    dialogForm.elements.name.select();
  });
}

function renderPinOrder(order) {
  const host = $('[data-dialog-pins]');
  host.replaceChildren();
  for (const [side, title] of [['inputs', 'Inputs'], ['outputs', 'Outputs']]) {
    const pins = order[side];
    if (!pins.length) continue;
    const list = document.createElement('ol');
    list.className = 'lc-pin-list';
    list.setAttribute('aria-label', `${title}, top to bottom`);
    pins.forEach((pin, i) => {
      const move = (step) => {
        [pins[i], pins[i + step]] = [pins[i + step], pins[i]];
        renderPinOrder(order);
        host.querySelector(`[data-pin="${side}:${i + step}:${step < 0 ? 'up' : 'down'}"]:not(:disabled)`)?.focus();
      };
      const up = button('↑', () => move(-1));
      const down = button('↓', () => move(1));
      up.disabled = i === 0;
      down.disabled = i === pins.length - 1;
      up.dataset.pin = `${side}:${i}:up`;
      down.dataset.pin = `${side}:${i}:down`;
      up.setAttribute('aria-label', `Move ${pin.name} up`);
      down.setAttribute('aria-label', `Move ${pin.name} down`);
      const item = document.createElement('li');
      item.append(Object.assign(document.createElement('span'), { textContent: pin.name }), up, down);
      list.append(item);
    });
    const group = document.createElement('div');
    group.append(Object.assign(document.createElement('h3'), { textContent: title }), list);
    host.append(group);
  }
}

function suggestName() {
  const names = new Set([...store.chips.values()].map((def) => def.name));
  for (let n = 1; ; n++) if (!names.has(`Chip ${n}`)) return `Chip ${n}`;
}

async function makeChip() {
  const circuit = editor.circuit;
  const chosen = editor.selection.size ? editor.selectedComponents() : circuit.components;
  if (!chosen.length) return;
  const ids = new Set(chosen.map((comp) => comp.id));
  const inner = cloneCircuit(extract(circuit, ids));
  for (const comp of inner.components) delete comp.pressed;
  const pins = chipPins(inner);
  if (!pins.inputs.length && !pins.outputs.length) {
    say('A chip needs pins. Include switches (inputs) and lights (outputs) in what you select.');
    return;
  }
  const result = await chipDialog({
    title: 'Make chip',
    ok: 'Make chip',
    name: suggestName(),
    color: CHIP_COLORS[store.chips.size % CHIP_COLORS.length],
    pins,
  });
  if (!result) return;

  const box = bounds(inner.components, store.chips);
  for (const comp of inner.components) {
    comp.x -= box.left;
    comp.y -= box.top;
  }
  for (const wire of inner.wires) wire.points = wire.points.map(([x, y]) => [x - box.left, y - box.top]);
  const def = { id: uid(), name: result.name, color: result.color, ...result.pins, circuit: inner };
  store.chips.set(def.id, def);

  store.record();
  circuit.components = circuit.components.filter((comp) => !ids.has(comp.id));
  circuit.wires = circuit.wires.filter((wire) => !ids.has(wire.from.c) && !ids.has(wire.to.c));
  const chip = editor.create({ kind: 'chip', chip: def.id }, { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
  circuit.components.push(chip);
  editor.select([chip.id]);
  store.emit('structure');
  say(`Made ${def.name}. It is in My chips, ready to use again. Double-click it to see inside.`);
}

function openChip(chipId) {
  const def = store.chips.get(chipId);
  if (!def || store.editingIds().includes(chipId)) return;
  const elsewhere = store.tabEditing(chipId);
  if (elsewhere) {
    switchTab(elsewhere);
    say(`${def.name} is already open in this tab.`);
    return;
  }
  editor.draft = null;
  store.current().view = { ...editor.view };
  store.openChip(def, cloneCircuit(def.circuit));
  editor.clearSelection();
  rebuild(false);
  editor.fit();
  renderAll();
  scheduleSave();
  say(`Editing ${def.name}. Every copy of it changes when you save.`);
}

function leaveChip() {
  store.closeChip();
  editor.draft = null;
  editor.clearSelection();
  const ws = store.current();
  if (ws.view) editor.view = ws.view;
  else editor.fit();
  rebuild(false);
  renderAll();
  scheduleSave();
}

function saveChip() {
  const ws = store.current();
  const def = store.chips.get(ws.chipId);
  const pins = chipPins(ws.circuit, def);
  if (!pins.inputs.length && !pins.outputs.length) {
    say('A chip needs at least one switch or light to use as a pin.');
    return;
  }
  for (const comp of ws.circuit.components) delete comp.pressed;
  Object.assign(def, pins, { circuit: ws.circuit });
  leaveChip();
  pruneEverywhere();
  rebuild(true);
  say(`Saved ${def.name}.`);
}

function discardChip() {
  const ws = store.current();
  const name = store.chips.get(ws.chipId)?.name ?? 'this chip';
  if (ws.undo.length && !window.confirm(`Throw away your changes to ${name}?`)) return;
  leaveChip();
}

async function editChipDetails(chipId) {
  const def = store.chips.get(chipId);
  const result = await chipDialog({ title: 'Chip details', ok: 'Save', name: def.name, color: def.color, pins: def, renaming: chipId });
  if (!result) return;
  Object.assign(def, { name: result.name, color: result.color, ...result.pins });
  store.emit('structure');
}

function deleteChip(chipId) {
  const def = store.chips.get(chipId);
  const boards = store.tabs.map((tab) => ({ name: `the ${tab.name} tab`, circuit: tab.root.circuit }));
  const places = usages(chipId, boards, store.chips);
  for (const tab of store.tabs) {
    for (const ws of tab.stack) {
      if (ws.chipId === chipId || ws.circuit.components.some((comp) => comp.chip === chipId)) places.push(`your open edit of ${store.chips.get(ws.chipId)?.name}`);
    }
  }
  if (places.length) {
    say(`${def.name} is still used in ${places.join(', ')}. Remove it from there first.`);
    return;
  }
  if (!window.confirm(`Delete ${def.name} from your chips?`)) return;
  store.chips.delete(chipId);
  store.emit('structure');
}

function exportFile() {
  const data = { app: 'logic-circuits', version: 1, board: store.root.circuit, chips: [...store.chips.values()] };
  const blob = new Blob([JSON.stringify(data, (key, value) => (key === 'pressed' ? undefined : value))], { type: 'application/json' });
  const fileName = `${store.activeTab.name.replace(/[^\w -]+/g, '').trim() || 'logic-circuits'}.json`;
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function importFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    say('That file is not a Logic Circuits export.');
    return;
  }
  const incoming = (Array.isArray(data?.chips) ? data.chips : []).filter(isChipDef);
  const board = isCircuit(data?.board) ? data.board : null;
  if (!incoming.length && !board) {
    say('That file is not a Logic Circuits export.');
    return;
  }
  const added = mergeLibrary(store.chips, incoming, board ? [board] : []);
  pruneEverywhere();
  const opened = Boolean(board?.components.length);
  if (opened) {
    pruneWires(board, store.chips);
    openTab(makeTab(file.name.replace(/\.json$/i, '').slice(0, 24) || store.nextTabName(), board));
  } else {
    store.emit('structure');
  }
  say(`Imported ${added} chip${added === 1 ? '' : 's'}${opened ? ' and opened the board in a new tab' : ''}.`);
}

function clearBoard() {
  if (!editor.circuit.components.length) return;
  if (!window.confirm('Remove everything from this board? Your chips stay. You can undo this.')) return;
  store.record();
  store.current().circuit = emptyCircuit();
  editor.clearSelection();
  store.emit('structure');
}

function leaveTab() {
  editor.draft = null;
  editor.ghost = null;
  editor.clearSelection();
  store.current().view = { ...editor.view };
}

function enterTab() {
  const ws = store.current();
  rebuild(false);
  if (ws.view) editor.view = { ...ws.view };
  else editor.fit();
  renderAll();
  scheduleSave();
}

function switchTab(tab) {
  if (tab === store.activeTab) return;
  leaveTab();
  store.activeTab = tab;
  enterTab();
}

function openTab(tab) {
  leaveTab();
  store.addTab(tab);
  enterTab();
}

function closeTab(tab) {
  if (store.tabs.length < 2) return;
  const busy = tab.root.circuit.components.length || tab.stack.length;
  if (busy && !window.confirm(`Close ${tab.name}? Everything on it goes. Chips you made stay in My chips.`)) return;
  if (tab === store.activeTab) leaveTab();
  const wasActive = tab === store.activeTab;
  store.removeTab(tab);
  if (wasActive) enterTab();
  else {
    renderTabs();
    scheduleSave();
  }
}

function renameTab(tab, label) {
  const input = Object.assign(document.createElement('input'), { value: tab.name, maxLength: 24, spellcheck: false, className: 'lc-tab-name' });
  input.setAttribute('aria-label', 'Tab name');
  label.replaceWith(input);
  input.select();
  let done = false;
  const finish = (keep) => {
    if (done) return;
    done = true;
    if (keep && input.value.trim()) tab.name = input.value.trim();
    renderTabs();
    renderToolbar();
    scheduleSave();
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') finish(true);
    if (event.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

function renderTabs() {
  const strip = $('[data-tabs]');
  strip.replaceChildren();
  for (const tab of store.tabs) {
    const active = tab === store.activeTab;
    const item = document.createElement('div');
    item.className = 'lc-tab';
    item.setAttribute('role', 'tab');
    item.setAttribute('aria-selected', String(active));
    const label = button(tab.name, () => (active ? renameTab(tab, label) : switchTab(tab)), 'lc-tab-label');
    label.title = active ? 'Click to rename' : `Switch to ${tab.name}`;
    const editing = tab.stack.at(-1);
    if (editing) label.append(Object.assign(document.createElement('small'), { textContent: ` › ${store.chips.get(editing.chipId)?.name ?? '?'}` }));
    item.append(label);
    if (store.tabs.length > 1) {
      const close = button('×', () => closeTab(tab), 'lc-tab-close');
      close.setAttribute('aria-label', `Close ${tab.name}`);
      item.append(close);
    }
    strip.append(item);
  }
  const add = button('+', () => openTab(makeTab(store.nextTabName())), 'lc-tab-add');
  add.setAttribute('aria-label', 'New tab');
  add.title = 'New tab: a fresh board that shares your chips';
  strip.append(add);
  strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function setRunning(next) {
  running = next;
  $('[data-run]').textContent = running ? 'Pause' : 'Run';
  $('[data-step]').disabled = running;
}

$('[data-undo]').addEventListener('click', () => store.undo());
$('[data-redo]').addEventListener('click', () => store.redo());
$('[data-delete]').addEventListener('click', () => editor.deleteSelection());
$('[data-duplicate]').addEventListener('click', () => editor.duplicate());
$('[data-make-chip]').addEventListener('click', makeChip);
$('[data-box-mode]').addEventListener('click', () => {
  editor.boxMode = !editor.boxMode;
  renderToolbar();
});
$('[data-fit]').addEventListener('click', () => editor.fit());
document.querySelectorAll('[data-zoom]').forEach((zoom) => zoom.addEventListener('click', () => editor.zoomBy(Number(zoom.dataset.zoom))));
$('[data-chip-save]').addEventListener('click', saveChip);
$('[data-chip-cancel]').addEventListener('click', discardChip);
$('[data-run]').addEventListener('click', () => setRunning(!running));
$('[data-step]').addEventListener('click', () => sim.step());
$('[data-reset]').addEventListener('click', () => {
  sim = null;
  store.current().sim = null;
  rebuild(false);
});
$('[data-export]').addEventListener('click', exportFile);
$('[data-import]').addEventListener('click', () => $('[data-import-file]').click());
$('[data-import-file]').addEventListener('change', (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (file) importFile(file);
});
$('[data-clear]').addEventListener('click', clearBoard);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});

new ResizeObserver(resize).observe(canvas);
resize();
const restored = load();
renderParts();
rebuild(false);
if (store.current().view) editor.view = store.current().view;
else editor.fit();
renderAll();
setRunning(true);
if (!restored) say('Click the switches to flip them. Drag from a pin to another pin to add a wire.', 0);
requestAnimationFrame(frame);
