import { emptyCircuit } from './library.js';

const HISTORY_LIMIT = 200;

function workspace(circuit, chipId = null) {
  return { circuit, chipId, undo: [], redo: [], view: null };
}

export const store = {
  chips: new Map(),
  root: workspace(emptyCircuit()),
  stack: [],
  listeners: new Set(),

  current() {
    return this.stack.at(-1) ?? this.root;
  },

  editingIds() {
    return this.stack.map((ws) => ws.chipId);
  },

  openChip(def, circuit) {
    this.stack.push(workspace(circuit, def.id));
  },

  closeChip() {
    return this.stack.pop();
  },

  snapshot() {
    return JSON.stringify(this.current().circuit);
  },

  record(snapshot = this.snapshot()) {
    const ws = this.current();
    ws.undo.push(snapshot);
    if (ws.undo.length > HISTORY_LIMIT) ws.undo.shift();
    ws.redo.length = 0;
  },

  undo() {
    const ws = this.current();
    if (!ws.undo.length) return false;
    ws.redo.push(JSON.stringify(ws.circuit));
    ws.circuit = JSON.parse(ws.undo.pop());
    this.emit('structure');
    return true;
  },

  redo() {
    const ws = this.current();
    if (!ws.redo.length) return false;
    ws.undo.push(JSON.stringify(ws.circuit));
    ws.circuit = JSON.parse(ws.redo.pop());
    this.emit('structure');
    return true;
  },

  emit(kind) {
    for (const listener of this.listeners) listener(kind);
  },
};
