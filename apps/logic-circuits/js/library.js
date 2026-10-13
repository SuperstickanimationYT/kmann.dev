import { isChipInput, isChipOutput, layout, pinPosition } from './parts.js';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function emptyCircuit() {
  return { components: [], wires: [] };
}

export function cloneCircuit(circuit) {
  return JSON.parse(JSON.stringify(circuit));
}

export function chipPins(circuit) {
  const byPosition = (a, b) => a.y - b.y || a.x - b.x;
  const pin = (comp) => ({ id: comp.id, name: comp.label?.trim() || '?' });
  return {
    inputs: circuit.components.filter((comp) => isChipInput(comp.kind)).sort(byPosition).map(pin),
    outputs: circuit.components.filter((comp) => isChipOutput(comp.kind)).sort(byPosition).map(pin),
  };
}

function chipsUsedBy(circuit) {
  return circuit.components.filter((comp) => comp.kind === 'chip').map((comp) => comp.chip);
}

export function contains(def, chipId, chips, seen = new Set()) {
  for (const inner of chipsUsedBy(def.circuit)) {
    if (inner === chipId) return true;
    if (seen.has(inner)) continue;
    seen.add(inner);
    const innerDef = chips.get(inner);
    if (innerDef && contains(innerDef, chipId, chips, seen)) return true;
  }
  return false;
}

export function forbiddenChips(editingIds, chips) {
  const forbidden = new Set(editingIds);
  for (const def of chips.values()) {
    if (editingIds.some((id) => contains(def, id, chips))) forbidden.add(def.id);
  }
  return forbidden;
}

export function usages(chipId, board, chips) {
  const places = [];
  if (chipsUsedBy(board).includes(chipId)) places.push('the board');
  for (const def of chips.values()) {
    if (def.id !== chipId && chipsUsedBy(def.circuit).includes(chipId)) places.push(def.name);
  }
  return places;
}

export function pruneWires(circuit, chips) {
  const byId = new Map(circuit.components.map((comp) => [comp.id, comp]));
  const fed = new Set();
  const kept = [];
  for (let i = circuit.wires.length - 1; i >= 0; i--) {
    const wire = circuit.wires[i];
    const from = byId.get(wire.from.c);
    const to = byId.get(wire.to.c);
    const target = `${wire.to.c}:${wire.to.p}`;
    if (!from || !to || fed.has(target)) continue;
    if (pinPosition(from, wire.from.p, chips)?.dir !== 'out') continue;
    if (pinPosition(to, wire.to.p, chips)?.dir !== 'in') continue;
    fed.add(target);
    kept.push(wire);
  }
  circuit.wires = kept.reverse();
}

export function extract(circuit, ids) {
  return {
    components: circuit.components.filter((comp) => ids.has(comp.id)),
    wires: circuit.wires.filter((wire) => ids.has(wire.from.c) && ids.has(wire.to.c)),
  };
}

export function bounds(components, chips) {
  if (!components.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const comp of components) {
    const box = layout(comp, chips);
    left = Math.min(left, comp.x);
    top = Math.min(top, comp.y);
    right = Math.max(right, comp.x + box.w);
    bottom = Math.max(bottom, comp.y + box.h);
  }
  return { left, top, right, bottom };
}

export function relabel(circuit, renames) {
  for (const comp of circuit.components) {
    comp.id = renames.get(comp.id) ?? comp.id;
  }
  for (const wire of circuit.wires) {
    wire.id = uid();
    wire.from.c = renames.get(wire.from.c) ?? wire.from.c;
    wire.to.c = renames.get(wire.to.c) ?? wire.to.c;
  }
}

export function mergeLibrary(chips, incoming, circuits) {
  const renames = new Map();
  for (const def of incoming) {
    const existing = chips.get(def.id);
    if (existing && JSON.stringify(existing) === JSON.stringify(def)) continue;
    const id = existing ? uid() : def.id;
    renames.set(def.id, id);
  }
  const remap = (circuit) => {
    for (const comp of circuit.components) {
      if (comp.kind === 'chip' && renames.has(comp.chip)) comp.chip = renames.get(comp.chip);
    }
  };
  let added = 0;
  for (const def of incoming) {
    if (!renames.has(def.id)) continue;
    remap(def.circuit);
    def.id = renames.get(def.id);
    chips.set(def.id, def);
    added++;
  }
  circuits.forEach(remap);
  return added;
}

export function isCircuit(value) {
  return Array.isArray(value?.components) && Array.isArray(value?.wires);
}

export function isChipDef(value) {
  return typeof value?.id === 'string' && typeof value.name === 'string'
    && Array.isArray(value.inputs) && Array.isArray(value.outputs) && isCircuit(value.circuit);
}
