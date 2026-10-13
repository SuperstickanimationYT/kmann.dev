import { bitAt, hasLabel, isChipInput, isChipOutput, isWord, layout, pinPosition, pinWidth, snap, wirePoints } from './parts.js';
import { bounds, extract, relabel, uid } from './library.js';

const TAP_SLOP = 6;
const MIN_ZOOM = 0.08;
const MAX_ZOOM = 4;
const PASTE_STEP = 20;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = dx || dy ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export class Editor {
  constructor(canvas, store, hooks) {
    this.canvas = canvas;
    this.store = store;
    this.hooks = hooks;
    this.view = { x: -200, y: -160, zoom: 1 };
    this.selection = new Set();
    this.wireSelection = new Set();
    this.pointers = new Map();
    this.gesture = null;
    this.pinch = null;
    this.draft = null;
    this.ghost = null;
    this.boxMode = false;
    this.spaceHeld = false;
    this.hover = null;
    this.clipboard = null;
    this.pasteCount = 0;

    canvas.addEventListener('pointerdown', (event) => this.pointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.pointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.pointerUp(event));
    canvas.addEventListener('pointercancel', (event) => this.pointerCancel(event));
    canvas.addEventListener('pointerleave', () => { this.hover = null; });
    canvas.addEventListener('wheel', (event) => this.wheel(event), { passive: false });
    canvas.addEventListener('dblclick', (event) => this.doubleClick(event));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('keydown', (event) => this.keyDown(event));
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') this.spaceHeld = false;
    });
    window.addEventListener('blur', () => { this.spaceHeld = false; });
  }

  get circuit() {
    return this.store.current().circuit;
  }

  get chips() {
    return this.store.chips;
  }

  size() {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  screenPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  toWorld(point) {
    return { x: point.x / this.view.zoom + this.view.x, y: point.y / this.view.zoom + this.view.y };
  }

  components() {
    return new Map(this.circuit.components.map((comp) => [comp.id, comp]));
  }

  pins(comp) {
    const box = layout(comp, this.chips);
    return [
      ...box.inputs.map((pin) => ({ comp, key: pin.key, dir: 'in', width: pinWidth(pin), x: comp.x + pin.x, y: comp.y + pin.y })),
      ...box.outputs.map((pin) => ({ comp, key: pin.key, dir: 'out', width: pinWidth(pin), x: comp.x + pin.x, y: comp.y + pin.y })),
    ];
  }

  hit(world) {
    const reach = Math.max(8, 11 / this.view.zoom);
    let best = null;
    let bestDistance = reach;
    for (const comp of this.circuit.components) {
      const box = layout(comp, this.chips);
      if (world.x < comp.x - reach || world.x > comp.x + box.w + reach || world.y < comp.y - reach || world.y > comp.y + box.h + reach) continue;
      for (const pin of this.pins(comp)) {
        const d = distance(world, pin);
        if (d < bestDistance) {
          bestDistance = d;
          best = { type: 'pin', ...pin };
        }
      }
    }
    if (best) return best;

    const components = this.circuit.components;
    for (let i = components.length - 1; i >= 0; i--) {
      const comp = components[i];
      const box = layout(comp, this.chips);
      if (world.x >= comp.x && world.x <= comp.x + box.w && world.y >= comp.y && world.y <= comp.y + box.h) return { type: 'comp', comp };
    }

    const wireReach = Math.max(4, 7 / this.view.zoom);
    const byId = this.components();
    for (const wire of this.circuit.wires) {
      const points = this.wirePath(wire, byId);
      if (!points) continue;
      for (let i = 1; i < points.length; i++) {
        if (segmentDistance(world, points[i - 1], points[i]) < wireReach) return { type: 'wire', wire };
      }
    }
    return null;
  }

  wirePath(wire, byId) {
    const from = byId.get(wire.from.c);
    const to = byId.get(wire.to.c);
    const a = from && pinPosition(from, wire.from.p, this.chips);
    const b = to && pinPosition(to, wire.to.p, this.chips);
    return a && b ? wirePoints(a, b, wire.points) : null;
  }

  pinNear(world, anchor, anyWidth = false) {
    const dir = anchor.dir === 'out' ? 'in' : 'out';
    const reach = Math.max(12, 16 / this.view.zoom);
    const nearest = (pins, limit) => {
      let best = null;
      let bestDistance = limit;
      for (const pin of pins) {
        const d = distance(world, pin);
        if (pin.dir === dir && (anyWidth || pin.width === anchor.width) && d < bestDistance) {
          bestDistance = d;
          best = pin;
        }
      }
      return best;
    };
    const found = nearest(this.circuit.components.flatMap((comp) => this.pins(comp)), reach);
    if (found) return found;
    const target = this.hit(world);
    return target?.type === 'comp' ? nearest(this.pins(target.comp), Infinity) : null;
  }

  pointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    const screen = this.screenPoint(event);
    this.pointers.set(event.pointerId, screen);
    if (this.pointers.size === 2) {
      this.startPinch();
      return;
    }
    if (this.pointers.size > 2) return;

    const world = this.toWorld(screen);
    const mouse = event.pointerType === 'mouse';
    if (event.button === 1 || event.button === 2 || (mouse && this.spaceHeld)) {
      if (event.button === 2 && this.draft) {
        this.cancelDraft();
        return;
      }
      this.gesture = { type: 'pan', start: screen, last: screen };
      return;
    }
    if (this.draft) {
      this.gesture = { type: 'route', start: screen, last: screen };
      return;
    }

    const target = this.hit(world);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey || this.boxMode;
    if (target?.type === 'pin') {
      this.draft = { anchor: { c: target.comp.id, p: target.key, dir: target.dir, width: target.width }, points: [], cursor: world };
      this.gesture = { type: 'wire', start: screen, moved: false };
      this.hooks.status('Let go on another pin to connect. Click empty space while wiring to add a bend.');
      return;
    }
    if (target?.type === 'comp') {
      const comp = target.comp;
      if (additive) this.toggle(comp.id);
      else if (!this.selection.has(comp.id)) this.select([comp.id]);
      if (comp.kind === 'button') this.press(comp, true);
      this.gesture = { type: 'move', start: screen, startWorld: world, comp, additive, moved: false };
      return;
    }
    if (target?.type === 'wire') {
      if (additive) {
        if (!this.wireSelection.delete(target.wire.id)) this.wireSelection.add(target.wire.id);
      } else {
        this.selection.clear();
        this.wireSelection = new Set([target.wire.id]);
      }
      this.hooks.selectionChanged();
      this.gesture = { type: 'tap', start: screen };
      return;
    }

    if (mouse || this.boxMode) {
      if (!additive) this.clearSelection();
      this.gesture = { type: 'box', start: screen, current: screen, base: new Set(this.selection), moved: false };
    } else {
      this.gesture = { type: 'pan', start: screen, last: screen, clears: true };
    }
  }

  pointerMove(event) {
    const screen = this.screenPoint(event);
    if (this.pointers.has(event.pointerId)) this.pointers.set(event.pointerId, screen);
    const world = this.toWorld(screen);
    this.hover = world;
    if (this.pinch) {
      this.updatePinch();
      return;
    }
    const gesture = this.gesture;
    if (this.draft && gesture?.type !== 'pan') this.draft.cursor = world;
    if (!gesture) {
      this.updateCursor(world);
      return;
    }
    const moved = distance(screen, gesture.start) > TAP_SLOP;
    switch (gesture.type) {
      case 'route':
        if (!moved) break;
        gesture.type = 'pan';
        this.pan(gesture, screen, moved);
        break;
      case 'pan':
        this.pan(gesture, screen, moved);
        break;
      case 'wire':
        gesture.moved ||= moved;
        break;
      case 'move':
        if (!gesture.moved && moved) this.beginMove(gesture);
        if (gesture.moved) this.dragSelection(gesture, world);
        break;
      case 'box':
        gesture.current = screen;
        gesture.moved ||= moved;
        if (gesture.moved) this.boxSelect(gesture);
        break;
    }
  }

  pan(gesture, screen, moved) {
    this.view.x -= (screen.x - gesture.last.x) / this.view.zoom;
    this.view.y -= (screen.y - gesture.last.y) / this.view.zoom;
    gesture.last = screen;
    gesture.moved ||= moved;
  }

  pointerUp(event) {
    const screen = this.screenPoint(event);
    this.pointers.delete(event.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      return;
    }
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture) return;
    const world = this.toWorld(screen);

    switch (gesture.type) {
      case 'wire': {
        const target = this.pinNear(world, this.draft.anchor);
        if (target) this.finishDraft(target);
        else if (gesture.moved) this.refuseDraft(world);
        else this.hooks.status('Wiring: tap another pin to connect, tap empty space to add a bend, tap the first pin or press Esc to stop.');
        break;
      }
      case 'route': {
        const anchor = this.draft.anchor;
        const own = this.hit(world);
        if (own?.type === 'pin' && own.comp.id === anchor.c && own.key === anchor.p) {
          this.cancelDraft();
          break;
        }
        const target = this.pinNear(world, anchor);
        if (target) this.finishDraft(target);
        else if (this.pinNear(world, anchor, true)) this.refuseDraft(world);
        else this.draft.points.push([snap(world.x), snap(world.y)]);
        break;
      }
      case 'move':
        if (gesture.comp.kind === 'button') this.press(gesture.comp, false);
        if (gesture.moved) this.hooks.changed('layout');
        else if (gesture.comp.kind === 'switch' && !gesture.additive) this.flip(gesture.comp, world);
        break;
      case 'pan':
        if (gesture.clears && !gesture.moved) this.clearSelection();
        break;
    }
  }

  pointerCancel(event) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.gesture?.type === 'move' && this.gesture.comp.kind === 'button') this.press(this.gesture.comp, false);
    if (this.gesture?.type === 'move' && this.gesture.moved) this.hooks.changed('layout');
    if (this.gesture?.type === 'wire' && this.gesture.moved) this.cancelDraft();
    this.gesture = null;
  }

  updateCursor(world) {
    if (this.draft) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    const target = this.hit(world);
    this.canvas.style.cursor = target?.type === 'pin' ? 'crosshair'
      : target?.type === 'comp' ? (target.comp.kind === 'switch' || target.comp.kind === 'button' ? 'pointer' : 'move')
        : target?.type === 'wire' ? 'pointer' : 'default';
  }

  startPinch() {
    const gesture = this.gesture;
    if (gesture?.type === 'move') {
      if (gesture.comp.kind === 'button') this.press(gesture.comp, false);
      if (gesture.moved) this.hooks.changed('layout');
    }
    if (gesture?.type === 'wire') this.cancelDraft();
    this.gesture = null;
    const [a, b] = [...this.pointers.values()];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = { spread: Math.max(1, distance(a, b)), zoom: this.view.zoom, anchor: this.toWorld(middle) };
  }

  updatePinch() {
    const [a, b] = [...this.pointers.values()];
    if (!b) return;
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const zoom = clamp(this.pinch.zoom * distance(a, b) / this.pinch.spread, MIN_ZOOM, MAX_ZOOM);
    this.view.zoom = zoom;
    this.view.x = this.pinch.anchor.x - middle.x / zoom;
    this.view.y = this.pinch.anchor.y - middle.y / zoom;
  }

  wheel(event) {
    event.preventDefault();
    const screen = this.screenPoint(event);
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 2) {
      this.view.x += event.deltaX * unit / this.view.zoom;
      return;
    }
    this.zoomAt(screen, Math.exp(-event.deltaY * unit * (event.ctrlKey ? 0.01 : 0.0015)));
  }

  zoomAt(screen, factor) {
    const anchor = this.toWorld(screen);
    this.view.zoom = clamp(this.view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    this.view.x = anchor.x - screen.x / this.view.zoom;
    this.view.y = anchor.y - screen.y / this.view.zoom;
  }

  zoomBy(factor) {
    const { width, height } = this.size();
    this.zoomAt({ x: width / 2, y: height / 2 }, factor);
  }

  fit() {
    const box = bounds(this.circuit.components, this.chips);
    const { width, height } = this.size();
    if (!box) {
      this.view = { x: -width / 2, y: -height / 2, zoom: 1 };
      return;
    }
    const pad = 70;
    const zoom = clamp(Math.min((width - pad * 2) / (box.right - box.left), (height - pad * 2) / (box.bottom - box.top)), MIN_ZOOM, 1.5);
    this.view = {
      zoom,
      x: (box.left + box.right) / 2 - width / 2 / zoom,
      y: (box.top + box.bottom) / 2 - height / 2 / zoom,
    };
  }

  doubleClick(event) {
    const target = this.hit(this.toWorld(this.screenPoint(event)));
    if (target?.type !== 'comp') return;
    if (target.comp.kind === 'chip') this.hooks.openChip(target.comp.chip);
    else if (hasLabel(target.comp.kind)) this.hooks.editLabel();
  }

  keyDown(event) {
    if (event.target.closest?.('input, textarea, select, dialog')) return;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.code === 'Space') {
      this.spaceHeld = true;
      event.preventDefault();
      return;
    }
    const actions = {
      delete: () => this.deleteSelection(),
      backspace: () => this.deleteSelection(),
      escape: () => (this.draft ? this.cancelDraft() : this.clearSelection()),
    };
    const commands = {
      z: () => (event.shiftKey ? this.store.redo() : this.store.undo()),
      y: () => this.store.redo(),
      c: () => this.copy(),
      x: () => { this.copy(); this.deleteSelection(); },
      v: () => this.paste(),
      d: () => this.duplicate(),
      a: () => this.selectAll(),
    };
    const action = command ? commands[key] : actions[key];
    if (action) {
      event.preventDefault();
      action();
    } else if (!command && key === 'f') {
      this.fit();
    }
  }

  select(ids) {
    this.selection = new Set(ids);
    this.wireSelection.clear();
    this.hooks.selectionChanged();
  }

  toggle(id) {
    if (!this.selection.delete(id)) this.selection.add(id);
    this.hooks.selectionChanged();
  }

  clearSelection() {
    if (!this.selection.size && !this.wireSelection.size) return;
    this.selection.clear();
    this.wireSelection.clear();
    this.hooks.selectionChanged();
  }

  selectAll() {
    this.selection = new Set(this.circuit.components.map((comp) => comp.id));
    this.wireSelection = new Set(this.circuit.wires.map((wire) => wire.id));
    this.hooks.selectionChanged();
  }

  syncSelection() {
    const ids = new Set(this.circuit.components.map((comp) => comp.id));
    const wires = new Set(this.circuit.wires.map((wire) => wire.id));
    this.selection = new Set([...this.selection].filter((id) => ids.has(id)));
    this.wireSelection = new Set([...this.wireSelection].filter((id) => wires.has(id)));
    if (this.draft && !ids.has(this.draft.anchor.c)) this.draft = null;
  }

  selectedComponents() {
    return this.circuit.components.filter((comp) => this.selection.has(comp.id));
  }

  boxSelect(gesture) {
    const a = this.toWorld(gesture.start);
    const b = this.toWorld(gesture.current);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const picked = new Set(gesture.base);
    for (const comp of this.circuit.components) {
      const box = layout(comp, this.chips);
      if (comp.x < right && comp.x + box.w > left && comp.y < bottom && comp.y + box.h > top) picked.add(comp.id);
    }
    this.selection = picked;
    this.wireSelection = new Set(this.circuit.wires.filter((wire) => picked.has(wire.from.c) && picked.has(wire.to.c)).map((wire) => wire.id));
    this.hooks.selectionChanged();
  }

  beginMove(gesture) {
    gesture.moved = true;
    if (gesture.comp.kind === 'button') this.press(gesture.comp, false);
    this.store.record();
    const moving = this.selectedComponents();
    gesture.origins = moving.map((comp) => ({ comp, x: comp.x, y: comp.y }));
    gesture.bends = this.circuit.wires
      .filter((wire) => wire.points.length && this.selection.has(wire.from.c) && this.selection.has(wire.to.c))
      .map((wire) => ({ wire, points: wire.points.map((point) => [...point]) }));
  }

  dragSelection(gesture, world) {
    const dx = snap(world.x - gesture.startWorld.x);
    const dy = snap(world.y - gesture.startWorld.y);
    for (const origin of gesture.origins) {
      origin.comp.x = origin.x + dx;
      origin.comp.y = origin.y + dy;
    }
    for (const { wire, points } of gesture.bends) wire.points = points.map(([x, y]) => [x + dx, y + dy]);
  }

  flip(comp, world) {
    if (isWord(comp)) {
      const bit = bitAt(comp, layout(comp, this.chips), world.x - comp.x);
      if (bit < 0) return;
      comp.value = (comp.value ?? 0) ^ (1 << bit);
    } else {
      comp.on = !comp.on;
    }
    this.hooks.input(comp);
  }

  press(comp, down) {
    if (Boolean(comp.pressed) === down) return;
    comp.pressed = down;
    this.hooks.input(comp);
  }

  finishDraft(target) {
    const anchor = this.draft.anchor;
    const out = anchor.dir === 'out' ? anchor : { c: target.comp.id, p: target.key };
    const into = anchor.dir === 'out' ? { c: target.comp.id, p: target.key } : anchor;
    const points = anchor.dir === 'out' ? this.draft.points : [...this.draft.points].reverse();
    this.draft = null;
    this.store.record();
    this.circuit.wires = this.circuit.wires.filter((wire) => !(wire.to.c === into.c && wire.to.p === into.p));
    this.circuit.wires.push({ id: uid(), from: { c: out.c, p: out.p }, to: { c: into.c, p: into.p }, points });
    this.hooks.status('');
    this.hooks.changed('structure');
  }

  refuseDraft(world) {
    const mismatch = this.pinNear(world, this.draft.anchor, true);
    const width = this.draft.anchor.width;
    this.cancelDraft();
    if (mismatch) {
      const describe = (bits) => (bits > 1 ? `${bits === 8 || bits === 11 ? 'an' : 'a'} ${bits}-bit bus` : 'a single wire');
      this.hooks.status(`That pin takes ${describe(mismatch.width)}, but this is ${describe(width)}. Use a Bus join or Bus split in between.`, true);
    }
  }

  cancelDraft() {
    this.draft = null;
    this.hooks.status('');
  }

  deleteSelection() {
    if (!this.selection.size && !this.wireSelection.size) return;
    this.store.record();
    const circuit = this.circuit;
    circuit.components = circuit.components.filter((comp) => !this.selection.has(comp.id));
    circuit.wires = circuit.wires.filter((wire) => !this.wireSelection.has(wire.id)
      && !this.selection.has(wire.from.c) && !this.selection.has(wire.to.c));
    this.selection.clear();
    this.wireSelection.clear();
    this.hooks.changed('structure');
    this.hooks.selectionChanged();
  }

  copy() {
    if (!this.selection.size) return false;
    this.clipboard = JSON.stringify(extract(this.circuit, this.selection));
    this.pasteCount = 0;
    return true;
  }

  paste(at = null) {
    if (!this.clipboard) return;
    const forbidden = this.hooks.forbiddenChips();
    const piece = JSON.parse(this.clipboard);
    piece.components = piece.components.filter((comp) => comp.kind !== 'chip' || (this.chips.has(comp.chip) && !forbidden.has(comp.chip)));
    const ids = new Set(piece.components.map((comp) => comp.id));
    piece.wires = piece.wires.filter((wire) => ids.has(wire.from.c) && ids.has(wire.to.c));
    if (!piece.components.length) return;

    this.pasteCount++;
    const box = bounds(piece.components, this.chips);
    const dx = at ? snap(at.x - (box.left + box.right) / 2) : PASTE_STEP * this.pasteCount;
    const dy = at ? snap(at.y - (box.top + box.bottom) / 2) : PASTE_STEP * this.pasteCount;
    relabel(piece, new Map([...ids].map((id) => [id, uid()])));
    for (const comp of piece.components) {
      comp.x += dx;
      comp.y += dy;
    }
    for (const wire of piece.wires) wire.points = wire.points.map(([x, y]) => [x + dx, y + dy]);

    this.store.record();
    this.circuit.components.push(...piece.components);
    this.circuit.wires.push(...piece.wires);
    this.selection = new Set(piece.components.map((comp) => comp.id));
    this.wireSelection = new Set(piece.wires.map((wire) => wire.id));
    this.hooks.changed('structure');
    this.hooks.selectionChanged();
  }

  duplicate() {
    const clipboard = this.clipboard;
    const count = this.pasteCount;
    if (this.copy()) this.paste();
    this.clipboard = clipboard;
    this.pasteCount = count;
  }

  nextLabel(kind) {
    const taken = new Set(this.circuit.components.filter((comp) => comp.kind === kind).map((comp) => comp.label));
    const letters = isChipOutput(kind) ? 'QRSTUVWXYZ' : isChipInput(kind) ? 'ABCDEFGHIJKLMNOP' : '';
    for (const letter of letters) if (!taken.has(letter)) return letter;
    const base = isChipOutput(kind) ? 'Q' : isChipInput(kind) ? 'In' : kind === 'clock' ? 'Clock' : '';
    for (let n = 1; ; n++) if (!taken.has(`${base}${n}`)) return `${base}${n}`;
  }

  create(spec, center) {
    const comp = { id: uid(), kind: spec.kind, x: 0, y: 0 };
    if (spec.kind === 'chip') comp.chip = spec.chip;
    if (spec.kind === 'clock') comp.hz = 1;
    if (isChipInput(spec.kind) || isChipOutput(spec.kind)) comp.label = this.nextLabel(spec.kind);
    const box = layout(comp, this.chips);
    comp.x = snap(center.x - box.w / 2);
    comp.y = snap(center.y - box.h / 2);
    return comp;
  }

  ghostAt(spec, screen) {
    this.ghost = screen ? this.create(spec, this.toWorld(screen)) : null;
  }

  place(spec, screen = null) {
    const { width, height } = this.size();
    const comp = this.create(spec, this.toWorld(screen ?? { x: width / 2, y: height / 2 }));
    if (!screen) this.nudgeIntoSpace(comp);
    this.store.record();
    this.circuit.components.push(comp);
    this.select([comp.id]);
    this.hooks.changed('structure');
  }

  nudgeIntoSpace(comp) {
    const box = layout(comp, this.chips);
    const overlaps = () => this.circuit.components.some((other) => {
      const otherBox = layout(other, this.chips);
      return comp.x < other.x + otherBox.w && comp.x + box.w > other.x && comp.y < other.y + otherBox.h && comp.y + box.h > other.y;
    });
    for (let tries = 0; tries < 30 && overlaps(); tries++) {
      comp.x += 20;
      comp.y += 20;
    }
  }
}
