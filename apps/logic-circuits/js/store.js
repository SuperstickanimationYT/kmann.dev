import { emptyCircuit, uid } from './library.js';

const HISTORY_LIMIT = 200;

function workspace(circuit, chipId = null, view = null) {
  return { circuit, chipId, undo: [], redo: [], view };
}

export function makeTab(name, circuit = emptyCircuit(), view = null) {
  return { id: uid(), name, root: workspace(circuit, null, view), stack: [] };
}

export const store = {
  chips: new Map(),
  folders: [],
  tabs: [],
  activeTab: null,
  listeners: new Set(),

  get root() {
    return this.activeTab.root;
  },

  get stack() {
    return this.activeTab.stack;
  },

  current() {
    return this.stack.at(-1) ?? this.root;
  },

  workspaces() {
    return this.tabs.flatMap((tab) => [tab.root, ...tab.stack]);
  },

  editingIds() {
    return this.stack.map((ws) => ws.chipId);
  },

  tabEditing(chipId) {
    return this.tabs.find((tab) => tab.stack.some((ws) => ws.chipId === chipId)) ?? null;
  },

  nextTabName() {
    const names = new Set(this.tabs.map((tab) => tab.name));
    for (let n = 1; ; n++) if (!names.has(`Board ${n}`)) return `Board ${n}`;
  },

  addTab(tab) {
    this.tabs.push(tab);
    this.activeTab = tab;
    return tab;
  },

  removeTab(tab) {
    const index = this.tabs.indexOf(tab);
    this.tabs.splice(index, 1);
    if (this.activeTab === tab) this.activeTab = this.tabs[Math.min(index, this.tabs.length - 1)];
  },

  openChip(def, circuit, view = null) {
    this.stack.push(workspace(circuit, def.id, view));
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
