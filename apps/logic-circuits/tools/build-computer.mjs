import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hasInputCount, layout } from '../js/parts.js';
import { compile } from '../js/sim.js';

const OUTPUT = fileURLToPath(new URL('../examples/computer.json', import.meta.url));
const COLUMN_GAP = 100;
const ROW_GAP = 20;

const BLOCKS = { id: 'ex8-blocks', name: 'Computer: building blocks' };
const CPU = { id: 'ex8-cpu', name: 'Computer: CPU' };

export const OPCODES = { NOP: 0, LDA: 1, ADD: 2, SUB: 3, STA: 4, LDI: 5, JMP: 6, JC: 7, JZ: 8, OUT: 9, HLT: 15 };

const FIBONACCI = [
  ['LDI', 0], ['STA', 14], ['LDI', 1], ['STA', 15],
  ['LDA', 14], ['OUT', 0], ['ADD', 15], ['JC', 0],
  ['STA', 13], ['LDA', 15], ['STA', 14], ['LDA', 13],
  ['STA', 15], ['JMP', 4], ['NOP', 0], ['NOP', 0],
];

const chips = new Map();

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function pinId(def, name) {
  const pin = [...def.inputs, ...def.outputs].find((entry) => entry.name === name);
  if (!pin) throw new Error(`${def.name} has no pin ${name}`);
  return pin.id;
}

class Builder {
  constructor(prefix) {
    this.prefix = prefix;
    this.components = [];
    this.wires = [];
    this.count = 0;
  }

  add(kind, props = {}) {
    const comp = { id: `${this.prefix}${kind}${this.count++}`, kind, x: 0, y: 0, ...props };
    this.components.push(comp);
    return comp;
  }

  input(label, bits = 1) {
    return this.add('switch', { id: `in-${slug(label)}`, label, ...(bits > 1 && { bits, value: 0 }) });
  }

  output(label, bits = 1) {
    return this.add('light', { id: `out-${slug(label)}`, label, ...(bits > 1 && { bits }) });
  }

  gate(kind, inputs = 2) {
    return this.add(kind, hasInputCount(kind) && inputs !== 2 ? { inputs } : {});
  }

  use(def) {
    return this.add('chip', { chip: def.id });
  }

  split(bits) {
    return this.add('split', { bits });
  }

  join(bits) {
    return this.add('join', { bits });
  }

  key(comp, name) {
    return comp.kind === 'chip' ? pinId(chips.get(comp.chip), name) : name;
  }

  wire(from, fromPin, to, toPin) {
    this.wires.push({
      id: `${this.prefix}w${this.wires.length}`,
      from: { c: from.id, p: this.key(from, fromPin) },
      to: { c: to.id, p: this.key(to, toPin) },
      points: [],
    });
  }

  gateFrom(kind, sources) {
    const gate = this.gate(kind, sources.length);
    sources.forEach(([comp, pin], i) => this.wire(comp, pin, gate, `in${i}`));
    return gate;
  }
}

function autoLayout(builder) {
  const comps = builder.components;
  const isSource = (comp) => comp.kind === 'switch' || comp.kind === 'button' || comp.kind === 'clock';
  const successors = new Map(comps.map((comp) => [comp.id, []]));
  const predecessors = new Map(comps.map((comp) => [comp.id, []]));
  for (const wire of builder.wires) {
    successors.get(wire.from.c).push(wire.to.c);
    predecessors.get(wire.to.c).push(wire.from.c);
  }

  const depth = new Map();
  const state = new Map();
  const forward = new Map(comps.map((comp) => [comp.id, []]));
  const visit = (id) => {
    state.set(id, 'open');
    for (const next of successors.get(id)) {
      if (state.get(next) === 'open') continue;
      forward.get(id).push(next);
      if (!state.has(next)) visit(next);
    }
    state.set(id, 'done');
  };
  for (const comp of comps.filter(isSource)) if (!state.has(comp.id)) visit(comp.id);
  for (const comp of comps) if (!state.has(comp.id)) visit(comp.id);
  const order = [];
  const placedOnce = new Set();
  const topo = (id) => {
    if (placedOnce.has(id)) return;
    placedOnce.add(id);
    for (const next of forward.get(id)) topo(next);
    order.push(id);
  };
  comps.forEach((comp) => topo(comp.id));
  order.reverse();
  for (const id of order) if (!depth.has(id)) depth.set(id, 0);
  for (const id of order) {
    for (const next of forward.get(id)) depth.set(next, Math.max(depth.get(next) ?? 0, depth.get(id) + 1));
  }
  for (const comp of comps.filter(isSource)) depth.set(comp.id, 0);
  const inner = comps.filter((comp) => !isSource(comp) && comp.kind !== 'light');
  for (const comp of inner) depth.set(comp.id, Math.max(1, depth.get(comp.id)));
  const deepest = Math.max(0, ...inner.map((comp) => depth.get(comp.id)));
  for (const comp of comps) if (comp.kind === 'light') depth.set(comp.id, deepest + 1);

  const columns = [];
  for (const comp of comps) (columns[depth.get(comp.id)] ??= []).push(comp);
  const placed = new Map();
  let x = 0;
  for (const column of columns.filter(Boolean)) {
    const order = column.map((comp, index) => {
      const ys = predecessors.get(comp.id).filter((id) => placed.has(id)).map((id) => placed.get(id));
      return { comp, index, center: ys.length ? ys.reduce((sum, y) => sum + y, 0) / ys.length : null };
    });
    if (!column.every((comp) => isSource(comp) || comp.kind === 'light')) {
      order.sort((a, b) => (a.center ?? Infinity) - (b.center ?? Infinity) || a.index - b.index);
    }
    const boxes = order.map(({ comp }) => layout(comp, chips));
    const height = boxes.reduce((sum, box) => sum + box.h + ROW_GAP, -ROW_GAP);
    let y = -height / 2;
    order.forEach(({ comp }, i) => {
      comp.x = Math.round(x / 10) * 10;
      comp.y = Math.round(y / 10) * 10;
      placed.set(comp.id, comp.y + boxes[i].h / 2);
      y += boxes[i].h + ROW_GAP;
    });
    x += Math.max(...boxes.map((box) => box.w)) + COLUMN_GAP;
  }
}

function defineChip(name, color, folder, build) {
  const id = `ex8-${slug(name)}`;
  const builder = new Builder('');
  build(builder);
  autoLayout(builder);
  const pin = (comp) => ({ id: comp.id, name: comp.label, ...(comp.bits > 1 && { width: comp.bits }) });
  const def = {
    id,
    name,
    color,
    folder: folder.id,
    inputs: builder.components.filter((comp) => comp.kind === 'switch').map(pin),
    outputs: builder.components.filter((comp) => comp.kind === 'light').map(pin),
    circuit: { components: builder.components, wires: builder.wires },
  };
  chips.set(id, def);
  return def;
}

const dLatch = defineChip('D latch', '#e07b28', BLOCKS, (b) => {
  const d = b.input('D');
  const e = b.input('E');
  const notD = b.gateFrom('not', [[d, 'out']]);
  const set = b.gateFrom('nand', [[d, 'out'], [e, 'out']]);
  const reset = b.gateFrom('nand', [[notD, 'out'], [e, 'out']]);
  const q = b.gate('nand');
  const notQ = b.gate('nand');
  b.wire(set, 'out', q, 'in0');
  b.wire(notQ, 'out', q, 'in1');
  b.wire(reset, 'out', notQ, 'in0');
  b.wire(q, 'out', notQ, 'in1');
  b.wire(q, 'out', b.output('Q'), 'in');
});

const flipFlop = defineChip('D flip-flop', '#e07b28', BLOCKS, (b) => {
  const d = b.input('D');
  const clk = b.input('CLK');
  const notClk = b.gateFrom('not', [[clk, 'out']]);
  const leader = b.use(dLatch);
  const follower = b.use(dLatch);
  b.wire(d, 'out', leader, 'D');
  b.wire(notClk, 'out', leader, 'E');
  b.wire(leader, 'Q', follower, 'D');
  b.wire(clk, 'out', follower, 'E');
  b.wire(follower, 'Q', b.output('Q'), 'in');
});

const mux2 = defineChip('Mux 2', '#20a5b5', BLOCKS, (b) => {
  const s = b.input('S');
  const a = b.input('A');
  const bIn = b.input('B');
  const notS = b.gateFrom('not', [[s, 'out']]);
  const pickA = b.gateFrom('and', [[a, 'out'], [notS, 'out']]);
  const pickB = b.gateFrom('and', [[bIn, 'out'], [s, 'out']]);
  b.wire(b.gateFrom('or', [[pickA, 'out'], [pickB, 'out']]), 'out', b.output('Y'), 'in');
});

const registerBit = defineChip('Register bit', '#e07b28', BLOCKS, (b) => {
  const d = b.input('D');
  const load = b.input('LOAD');
  const clk = b.input('CLK');
  const keep = b.use(mux2);
  const ff = b.use(flipFlop);
  b.wire(load, 'out', keep, 'S');
  b.wire(ff, 'Q', keep, 'A');
  b.wire(d, 'out', keep, 'B');
  b.wire(keep, 'Y', ff, 'D');
  b.wire(clk, 'out', ff, 'CLK');
  b.wire(ff, 'Q', b.output('Q'), 'in');
});

function register(bits) {
  return defineChip(`Register ${bits}`, '#e07b28', BLOCKS, (b) => {
    const d = b.input('D', bits);
    const load = b.input('LOAD');
    const clk = b.input('CLK');
    const split = b.split(bits);
    const join = b.join(bits);
    b.wire(d, 'out', split, 'in');
    for (let i = 0; i < bits; i++) {
      const cell = b.use(registerBit);
      b.wire(split, `out${i}`, cell, 'D');
      b.wire(load, 'out', cell, 'LOAD');
      b.wire(clk, 'out', cell, 'CLK');
      b.wire(cell, 'Q', join, `in${i}`);
    }
    b.wire(join, 'out', b.output('Q', bits), 'in');
  });
}

function wideMux(bits) {
  return defineChip(`Mux 2x${bits}`, '#20a5b5', BLOCKS, (b) => {
    const s = b.input('S');
    const a = b.input('A', bits);
    const bIn = b.input('B', bits);
    const splitA = b.split(bits);
    const splitB = b.split(bits);
    const join = b.join(bits);
    b.wire(a, 'out', splitA, 'in');
    b.wire(bIn, 'out', splitB, 'in');
    for (let i = 0; i < bits; i++) {
      const mux = b.use(mux2);
      b.wire(s, 'out', mux, 'S');
      b.wire(splitA, `out${i}`, mux, 'A');
      b.wire(splitB, `out${i}`, mux, 'B');
      b.wire(mux, 'Y', join, `in${i}`);
    }
    b.wire(join, 'out', b.output('Y', bits), 'in');
  });
}

const register8 = register(8);
const register4 = register(4);
const mux2x8 = wideMux(8);
const mux2x4 = wideMux(4);

const halfAdder = defineChip('Half adder', '#2fa86b', BLOCKS, (b) => {
  const a = b.input('A');
  const bIn = b.input('B');
  b.wire(b.gateFrom('xor', [[a, 'out'], [bIn, 'out']]), 'out', b.output('S'), 'in');
  b.wire(b.gateFrom('and', [[a, 'out'], [bIn, 'out']]), 'out', b.output('C'), 'in');
});

const fullAdder = defineChip('Full adder', '#2fa86b', BLOCKS, (b) => {
  const a = b.input('A');
  const bIn = b.input('B');
  const carryIn = b.input('Cin');
  const first = b.use(halfAdder);
  const second = b.use(halfAdder);
  b.wire(a, 'out', first, 'A');
  b.wire(bIn, 'out', first, 'B');
  b.wire(first, 'S', second, 'A');
  b.wire(carryIn, 'out', second, 'B');
  b.wire(second, 'S', b.output('S'), 'in');
  b.wire(b.gateFrom('or', [[first, 'C'], [second, 'C']]), 'out', b.output('Cout'), 'in');
});

const adder8 = defineChip('Adder 8', '#2fa86b', BLOCKS, (b) => {
  const a = b.input('A', 8);
  const bIn = b.input('B', 8);
  const carryIn = b.input('Cin');
  const splitA = b.split(8);
  const splitB = b.split(8);
  const join = b.join(8);
  b.wire(a, 'out', splitA, 'in');
  b.wire(bIn, 'out', splitB, 'in');
  let carry = [carryIn, 'out'];
  for (let i = 0; i < 8; i++) {
    const adder = b.use(fullAdder);
    b.wire(splitA, `out${i}`, adder, 'A');
    b.wire(splitB, `out${i}`, adder, 'B');
    b.wire(carry[0], carry[1], adder, 'Cin');
    b.wire(adder, 'S', join, `in${i}`);
    carry = [adder, 'Cout'];
  }
  b.wire(join, 'out', b.output('S', 8), 'in');
  b.wire(carry[0], carry[1], b.output('Cout'), 'in');
});

const alu = defineChip('ALU', '#2fa86b', CPU, (b) => {
  const a = b.input('A', 8);
  const bIn = b.input('B', 8);
  const sub = b.input('SUB');
  const splitB = b.split(8);
  const flipped = b.join(8);
  b.wire(bIn, 'out', splitB, 'in');
  for (let i = 0; i < 8; i++) b.wire(b.gateFrom('xor', [[splitB, `out${i}`], [sub, 'out']]), 'out', flipped, `in${i}`);
  const adder = b.use(adder8);
  b.wire(a, 'out', adder, 'A');
  b.wire(flipped, 'out', adder, 'B');
  b.wire(sub, 'out', adder, 'Cin');
  const bitsOut = b.split(8);
  b.wire(adder, 'S', bitsOut, 'in');
  const zero = b.gate('nor', 8);
  for (let i = 0; i < 8; i++) b.wire(bitsOut, `out${i}`, zero, `in${i}`);
  b.wire(adder, 'S', b.output('R', 8), 'in');
  b.wire(adder, 'Cout', b.output('C'), 'in');
  b.wire(zero, 'out', b.output('Z'), 'in');
});

const decoder = defineChip('Decoder 4-16', '#8b5cf6', BLOCKS, (b) => {
  const a = b.input('A', 4);
  const split = b.split(4);
  b.wire(a, 'out', split, 'in');
  const inverted = [0, 1, 2, 3].map((i) => b.gateFrom('not', [[split, `out${i}`]]));
  for (let n = 0; n < 16; n++) {
    const match = b.gateFrom('and', [0, 1, 2, 3].map((i) => ((n >> i) & 1 ? [split, `out${i}`] : [inverted[i], 'out'])));
    b.wire(match, 'out', b.output(`Y${n}`), 'in');
  }
});

const mux16x8 = defineChip('Mux 16x8', '#20a5b5', BLOCKS, (b) => {
  const address = b.input('ADDR', 4);
  const words = Array.from({ length: 16 }, (_, i) => b.input(`I${i}`, 8));
  const split = b.split(4);
  b.wire(address, 'out', split, 'in');
  let layer = words.map((word) => [word, 'out']);
  for (let level = 0; level < 4; level++) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const mux = b.use(mux2x8);
      b.wire(split, `out${level}`, mux, 'S');
      b.wire(layer[i][0], layer[i][1], mux, 'A');
      b.wire(layer[i + 1][0], layer[i + 1][1], mux, 'B');
      next.push([mux, 'Y']);
    }
    layer = next;
  }
  b.wire(layer[0][0], layer[0][1], b.output('Y', 8), 'in');
});

const ram = defineChip('RAM 16x8', '#d9467a', CPU, (b) => {
  const address = b.input('ADDR', 4);
  const dataIn = b.input('DIN', 8);
  const write = b.input('WE');
  const clk = b.input('CLK');
  const select = b.use(decoder);
  b.wire(address, 'out', select, 'A');
  const read = b.use(mux16x8);
  b.wire(address, 'out', read, 'ADDR');
  for (let n = 0; n < 16; n++) {
    const enable = b.gateFrom('and', [[select, `Y${n}`], [write, 'out']]);
    const cell = b.use(register8);
    b.wire(dataIn, 'out', cell, 'D');
    b.wire(enable, 'out', cell, 'LOAD');
    b.wire(clk, 'out', cell, 'CLK');
    b.wire(cell, 'Q', read, `I${n}`);
  }
  b.wire(read, 'Y', b.output('DOUT', 8), 'in');
});

const incrementer = defineChip('Incrementer 4', '#2fa86b', BLOCKS, (b) => {
  const a = b.input('A', 4);
  const split = b.split(4);
  const join = b.join(4);
  b.wire(a, 'out', split, 'in');
  b.wire(b.gateFrom('not', [[split, 'out0']]), 'out', join, 'in0');
  let carry = [split, 'out0'];
  for (let i = 1; i < 4; i++) {
    const adder = b.use(halfAdder);
    b.wire(split, `out${i}`, adder, 'A');
    b.wire(carry[0], carry[1], adder, 'B');
    b.wire(adder, 'S', join, `in${i}`);
    carry = [adder, 'C'];
  }
  b.wire(join, 'out', b.output('Y', 4), 'in');
});

const counter = defineChip('Program counter', '#d9467a', CPU, (b) => {
  const target = b.input('TARGET', 4);
  const jump = b.input('JUMP');
  const hold = b.input('HOLD');
  const clk = b.input('CLK');
  const reg = b.use(register4);
  const next = b.use(incrementer);
  const pick = b.use(mux2x4);
  b.wire(reg, 'Q', next, 'A');
  b.wire(jump, 'out', pick, 'S');
  b.wire(next, 'Y', pick, 'A');
  b.wire(target, 'out', pick, 'B');
  b.wire(pick, 'Y', reg, 'D');
  b.wire(b.gateFrom('not', [[hold, 'out']]), 'out', reg, 'LOAD');
  b.wire(clk, 'out', reg, 'CLK');
  b.wire(reg, 'Q', b.output('PC', 4), 'in');
});

const control = defineChip('Control unit', '#8b5cf6', CPU, (b) => {
  const op = b.input('OP', 4);
  const carry = b.input('C');
  const zero = b.input('Z');
  const decode = b.use(decoder);
  b.wire(op, 'out', decode, 'A');
  const line = (name) => [decode, `Y${OPCODES[name]}`];
  const loadA = b.gateFrom('or', [line('LDA'), line('ADD'), line('SUB'), line('LDI')]);
  const loadFlags = b.gateFrom('or', [line('ADD'), line('SUB')]);
  const jumpIfCarry = b.gateFrom('and', [line('JC'), [carry, 'out']]);
  const jumpIfZero = b.gateFrom('and', [line('JZ'), [zero, 'out']]);
  const jump = b.gateFrom('or', [line('JMP'), [jumpIfCarry, 'out'], [jumpIfZero, 'out']]);
  b.wire(loadA, 'out', b.output('LOAD A'), 'in');
  b.wire(...line('LDA'), b.output('FROM RAM'), 'in');
  b.wire(...line('LDI'), b.output('FROM ARG'), 'in');
  b.wire(...line('SUB'), b.output('SUB'), 'in');
  b.wire(...line('STA'), b.output('WRITE'), 'in');
  b.wire(loadFlags, 'out', b.output('LOAD FLAGS'), 'in');
  b.wire(...line('OUT'), b.output('LOAD OUT'), 'in');
  b.wire(jump, 'out', b.output('JUMP'), 'in');
  b.wire(...line('HLT'), b.output('HALT'), 'in');
});

const cpu = defineChip('CPU', '#2f7bd8', CPU, (b) => {
  const instruction = b.input('INSTR', 8);
  const clk = b.input('CLK');
  const reset = b.input('RESET');
  const notReset = b.gateFrom('not', [[reset, 'out']]);

  const fields = b.split(8);
  b.wire(instruction, 'out', fields, 'in');
  const arg = b.join(4);
  const op = b.join(4);
  const immediate = b.join(8);
  for (let i = 0; i < 4; i++) {
    b.wire(fields, `out${i}`, arg, `in${i}`);
    b.wire(fields, `out${i + 4}`, op, `in${i}`);
    b.wire(fields, `out${i}`, immediate, `in${i}`);
  }

  const regA = b.use(register8);
  const flagC = b.use(registerBit);
  const flagZ = b.use(registerBit);
  const unit = b.use(control);
  b.wire(op, 'out', unit, 'OP');
  b.wire(flagC, 'Q', unit, 'C');
  b.wire(flagZ, 'Q', unit, 'Z');

  const memory = b.use(ram);
  b.wire(arg, 'out', memory, 'ADDR');
  b.wire(regA, 'Q', memory, 'DIN');
  b.wire(unit, 'WRITE', memory, 'WE');
  b.wire(clk, 'out', memory, 'CLK');

  const math = b.use(alu);
  b.wire(regA, 'Q', math, 'A');
  b.wire(memory, 'DOUT', math, 'B');
  b.wire(unit, 'SUB', math, 'SUB');

  const fromRam = b.use(mux2x8);
  b.wire(unit, 'FROM RAM', fromRam, 'S');
  b.wire(math, 'R', fromRam, 'A');
  b.wire(memory, 'DOUT', fromRam, 'B');
  const fromArg = b.use(mux2x8);
  b.wire(unit, 'FROM ARG', fromArg, 'S');
  b.wire(fromRam, 'Y', fromArg, 'A');
  b.wire(immediate, 'out', fromArg, 'B');
  const clearA = b.use(mux2x8);
  b.wire(reset, 'out', clearA, 'S');
  b.wire(fromArg, 'Y', clearA, 'A');
  b.wire(clearA, 'Y', regA, 'D');
  b.wire(b.gateFrom('or', [[unit, 'LOAD A'], [reset, 'out']]), 'out', regA, 'LOAD');
  b.wire(clk, 'out', regA, 'CLK');

  const loadFlags = b.gateFrom('or', [[unit, 'LOAD FLAGS'], [reset, 'out']]);
  for (const [flag, source] of [[flagC, 'C'], [flagZ, 'Z']]) {
    b.wire(b.gateFrom('and', [[math, source], [notReset, 'out']]), 'out', flag, 'D');
    b.wire(loadFlags, 'out', flag, 'LOAD');
    b.wire(clk, 'out', flag, 'CLK');
  }

  const regOut = b.use(register8);
  const clearOut = b.use(mux2x8);
  b.wire(reset, 'out', clearOut, 'S');
  b.wire(regA, 'Q', clearOut, 'A');
  b.wire(clearOut, 'Y', regOut, 'D');
  b.wire(b.gateFrom('or', [[unit, 'LOAD OUT'], [reset, 'out']]), 'out', regOut, 'LOAD');
  b.wire(clk, 'out', regOut, 'CLK');

  const pc = b.use(counter);
  const target = b.use(mux2x4);
  b.wire(reset, 'out', target, 'S');
  b.wire(arg, 'out', target, 'A');
  b.wire(target, 'Y', pc, 'TARGET');
  b.wire(b.gateFrom('or', [[unit, 'JUMP'], [reset, 'out']]), 'out', pc, 'JUMP');
  b.wire(b.gateFrom('and', [[unit, 'HALT'], [notReset, 'out']]), 'out', pc, 'HOLD');
  b.wire(clk, 'out', pc, 'CLK');

  b.wire(pc, 'PC', b.output('PC', 4), 'in');
  b.wire(regA, 'Q', b.output('A', 8), 'in');
  b.wire(regOut, 'Q', b.output('OUT', 8), 'in');
  b.wire(flagC, 'Q', b.output('C'), 'in');
  b.wire(flagZ, 'Q', b.output('Z'), 'in');
  b.wire(unit, 'HALT', b.output('HALT'), 'in');
});

function encode([name, arg]) {
  return (OPCODES[name] << 4) | arg;
}

export function buildBoard(program = FIBONACCI) {
  const b = new Builder('board-');
  const rom = program.map((step, i) => {
    const word = b.add('switch', { label: String(i), bits: 8, value: encode(step), x: 0, y: i * 60 });
    return word;
  });
  const fetch = b.add('chip', { chip: mux16x8.id, x: 260, y: 280 });
  const core = b.add('chip', { chip: cpu.id, x: 560, y: 380 });
  const clock = b.add('clock', { label: 'Clock', hz: 8, x: 440, y: 640 });
  const reset = b.add('button', { label: 'Reset', x: 440, y: 720 });
  rom.forEach((word, i) => b.wire(word, 'out', fetch, `I${i}`));
  b.wire(core, 'PC', fetch, 'ADDR');
  b.wire(fetch, 'Y', core, 'INSTR');
  b.wire(clock, 'out', core, 'CLK');
  b.wire(reset, 'out', core, 'RESET');
  const lights = [['OUT', 8, 'OUT', 360], ['A', 8, 'A', 420], ['PC', 4, 'PC', 480], ['Carry', 1, 'C', 540], ['Zero', 1, 'Z', 590], ['Halted', 1, 'HALT', 640]];
  const shown = {};
  for (const [label, bits, pin, y] of lights) {
    const light = b.add('light', { label, x: 800, y, ...(bits > 1 && { bits }) });
    b.wire(core, pin, light, 'in');
    shown[label] = light;
  }
  return { circuit: { components: b.components, wires: b.wires }, rom, reset, clock, shown };
}

export function example() {
  const { circuit } = buildBoard();
  return {
    app: 'logic-circuits',
    version: 1,
    board: circuit,
    chips: [...chips.values()],
    folders: [BLOCKS, CPU],
  };
}

export { chips };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT, `${JSON.stringify(example())}\n`);
  const gates = compile(example().board, chips).gateCount;
  console.log(`wrote ${OUTPUT}: ${chips.size} chips, ${gates} gates`);
}
