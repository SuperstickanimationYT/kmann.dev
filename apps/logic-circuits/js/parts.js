export const GRID = 10;
export const PIN_GAP = 20;
export const MIN_INPUTS = 2;
export const MAX_INPUTS = 8;
export const MAX_BITS = 16;
export const BIT_CELL = 12;

export const COLORS = {
  stage: '#040b14',
  chipStage: '#0a0a1c',
  dot: 'rgba(61, 143, 224, 0.28)',
  body: '#0d2640',
  edge: '#3d8fdd',
  text: '#e2effd',
  dim: '#6f9dc9',
  on: '#ffcf4d',
  off: '#24507c',
  pinHole: '#081626',
  selected: '#5fe3ff',
};

export const CHIP_COLORS = ['#2f7bd8', '#8b5cf6', '#d9467a', '#e07b28', '#2fa86b', '#c9a227', '#20a5b5', '#7a8799'];

export const PARTS = [
  { kind: 'switch', name: 'Switch', hint: 'Click to flip it on or off. Becomes an input pin in a chip.' },
  { kind: 'button', name: 'Button', hint: 'On only while held down. Becomes an input pin in a chip.' },
  { kind: 'clock', name: 'Clock', hint: 'Flips on and off by itself.' },
  { kind: 'light', name: 'Light', hint: 'Shows a signal. Becomes an output pin in a chip.' },
  { kind: 'hex', name: 'Hex display', hint: 'Shows four signals as one digit, 0 to F.' },
  { kind: 'join', name: 'Bus join', hint: 'Bundles single wires into one bus wire. The top input is bit 0.' },
  { kind: 'split', name: 'Bus split', hint: 'Opens a bus wire back up into single wires. The top output is bit 0.' },
  { kind: 'and', name: 'AND', hint: 'On when every input is on.' },
  { kind: 'or', name: 'OR', hint: 'On when any input is on.' },
  { kind: 'not', name: 'NOT', hint: 'Flips its input.' },
  { kind: 'nand', name: 'NAND', hint: 'Off only when every input is on.' },
  { kind: 'nor', name: 'NOR', hint: 'On only when every input is off.' },
  { kind: 'xor', name: 'XOR', hint: 'On when an odd number of inputs are on.' },
  { kind: 'xnor', name: 'XNOR', hint: 'On when an even number of inputs are on.' },
  { kind: 'buffer', name: 'Buffer', hint: 'Passes its input through one gate delay later.' },
];

export const PART_NAMES = Object.fromEntries(PARTS.map((part) => [part.kind, part.name]));

export const GATE_OPS = { and: 0, or: 1, xor: 2, buffer: 3, nand: 4, nor: 5, xnor: 6, not: 7 };

export const isGate = (kind) => kind in GATE_OPS;
export const hasInputCount = (kind) => isGate(kind) && kind !== 'not' && kind !== 'buffer';
export const isChipInput = (kind) => kind === 'switch' || kind === 'button';
export const isChipOutput = (kind) => kind === 'light';
export const hasBits = (kind) => kind === 'switch' || kind === 'light' || kind === 'join' || kind === 'split';
export const isBusPart = (kind) => kind === 'join' || kind === 'split';
export const bitsOf = (comp) => comp.bits ?? (isBusPart(comp.kind) ? 8 : 1);
export const isWord = (comp) => (comp.kind === 'switch' || comp.kind === 'light') && bitsOf(comp) > 1;
export const switchValue = (comp) => (isWord(comp) ? comp.value ?? 0 : comp.on || comp.pressed ? 1 : 0);
export const pinWidth = (pin) => pin.width ?? 1;
export const hasLabel = (kind) => kind === 'switch' || kind === 'button' || kind === 'clock' || kind === 'light' || kind === 'hex';

export const CLOCK_RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];

export function inputCount(comp) {
  return hasInputCount(comp.kind) ? comp.inputs ?? 2 : 1;
}

export function snap(value) {
  return Math.round(value / GRID) * GRID;
}

const SOURCE = { w: 40, h: 40, inputs: [], outputs: [{ key: 'out', x: 40, y: 20 }] };
const LIGHT = { w: 40, h: 40, inputs: [{ key: 'in', x: 0, y: 20 }], outputs: [] };
const HEX = {
  w: 60,
  h: 100,
  inputs: [1, 2, 4, 8].map((weight, i) => ({ key: `in${i}`, name: String(weight), x: 0, y: 20 + i * PIN_GAP })),
  outputs: [],
};
const MISSING = { w: 80, h: 40, inputs: [], outputs: [], missing: true };

export function layout(comp, chips) {
  switch (comp.kind) {
    case 'switch':
      return isWord(comp) ? wordLayout(bitsOf(comp), 'out') : SOURCE;
    case 'button':
    case 'clock':
      return SOURCE;
    case 'light':
      return isWord(comp) ? wordLayout(bitsOf(comp), 'in') : LIGHT;
    case 'join':
    case 'split':
      return busLayout(comp.kind, bitsOf(comp));
    case 'hex':
      return HEX;
    case 'chip': {
      const def = chips.get(comp.chip);
      return def ? chipLayout(def) : MISSING;
    }
    default:
      return gateLayout(inputCount(comp));
  }
}

const wordLayouts = new Map();

function wordLayout(bits, key) {
  const id = `${key}${bits}`;
  if (!wordLayouts.has(id)) {
    const w = Math.ceil((bits * BIT_CELL + 16) / PIN_GAP) * PIN_GAP;
    const pin = { key, x: key === 'out' ? w : 0, y: 20, width: bits };
    wordLayouts.set(id, { w, h: 40, inputs: key === 'in' ? [pin] : [], outputs: key === 'out' ? [pin] : [] });
  }
  return wordLayouts.get(id);
}

export function bitCellsLeft(comp, box) {
  return (box.w - bitsOf(comp) * BIT_CELL) / 2;
}

export function bitAt(comp, box, localX) {
  const column = Math.floor((localX - bitCellsLeft(comp, box)) / BIT_CELL);
  const bits = bitsOf(comp);
  return column >= 0 && column < bits ? bits - 1 - column : -1;
}

const busLayouts = new Map();

function busLayout(kind, bits) {
  const id = `${kind}${bits}`;
  if (!busLayouts.has(id)) {
    const h = bits * PIN_GAP;
    const singles = (key, x) => Array.from({ length: bits }, (_, i) => ({ key: `${key}${i}`, name: String(i), x, y: PIN_GAP / 2 + i * PIN_GAP }));
    busLayouts.set(id, kind === 'join'
      ? { w: 30, h, inputs: singles('in', 0), outputs: [{ key: 'out', x: 30, y: h / 2, width: bits }] }
      : { w: 30, h, inputs: [{ key: 'in', x: 0, y: h / 2, width: bits }], outputs: singles('out', 30) });
  }
  return busLayouts.get(id);
}

function gateLayout(count) {
  const h = Math.max(2, count) * PIN_GAP;
  const inputs = count === 1
    ? [{ key: 'in0', x: 0, y: h / 2 }]
    : Array.from({ length: count }, (_, i) => ({ key: `in${i}`, x: 0, y: PIN_GAP / 2 + i * PIN_GAP }));
  return { w: 60, h, inputs, outputs: [{ key: 'out', x: 60, y: h / 2 }] };
}

const chipLayouts = new WeakMap();

export function chipLayout(def) {
  const describe = (pins) => pins.map((pin) => `${pin.name}/${pinWidth(pin)}`).join(',');
  const signature = `${def.name}|${describe(def.inputs)}|${describe(def.outputs)}`;
  const cached = chipLayouts.get(def);
  if (cached?.signature === signature) return cached;

  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  const h = rows * PIN_GAP + PIN_GAP;
  const longest = (pins) => pins.reduce((most, pin) => Math.max(most, pin.name.length), 0);
  const raw = def.name.length * 9 + (longest(def.inputs) + longest(def.outputs)) * 7 + 36;
  const w = Math.ceil(Math.max(80, raw) / PIN_GAP) * PIN_GAP;
  const side = (pins, x) => {
    const top = (h - pins.length * PIN_GAP) / 2 + PIN_GAP / 2;
    return pins.map((pin, i) => ({ key: pin.id, name: pin.name, x, y: top + i * PIN_GAP, width: pinWidth(pin) }));
  };
  const result = { w, h, inputs: side(def.inputs, 0), outputs: side(def.outputs, w), signature };
  chipLayouts.set(def, result);
  return result;
}

export function pinPosition(comp, key, chips) {
  const box = layout(comp, chips);
  for (const pin of box.inputs) if (pin.key === key) return { x: comp.x + pin.x, y: comp.y + pin.y, dir: 'in', width: pinWidth(pin) };
  for (const pin of box.outputs) if (pin.key === key) return { x: comp.x + pin.x, y: comp.y + pin.y, dir: 'out', width: pinWidth(pin) };
  return null;
}

const CURVE_SAMPLES = 16;

export function curveControls(a, b) {
  const reach = Math.max(30, Math.abs(b.x - a.x) / 2);
  return [{ x: a.x + reach, y: a.y }, { x: b.x - reach, y: b.y }];
}

export function wirePoints(a, b, bends) {
  if (bends.length) return [a, ...bends.map(([x, y]) => ({ x, y })), b];
  const [c1, c2] = curveControls(a, b);
  const points = [];
  for (let i = 0; i <= CURVE_SAMPLES; i++) {
    const t = i / CURVE_SAMPLES;
    const u = 1 - t;
    points.push({
      x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
      y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
    });
  }
  return points;
}
