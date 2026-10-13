import { GATE_OPS, inputCount } from './parts.js';

const INVERT = 4;
const MAX_NESTING = 64;
const TICKS_BEFORE_SHAKING = 48;
const MAX_CLOCK_EDGES_PER_FRAME = 256;

export function compile(circuit, chips, previous) {
  const parent = [];
  const newEndpoint = () => parent.push(parent.length) - 1;
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent[a] = b;
  };

  const gates = [];
  const switches = [];
  const clocks = [];
  const top = new Map();

  function walk(circuit, path, pins, depth) {
    if (depth > MAX_NESTING) return;
    const endpoints = new Map();
    for (const comp of circuit.components) {
      const at = (key) => `${comp.id}:${key}`;
      switch (comp.kind) {
        case 'switch':
        case 'button': {
          const endpoint = pins?.get(comp.id) ?? newEndpoint();
          endpoints.set(at('out'), endpoint);
          if (!pins) switches.push({ id: comp.id, endpoint });
          break;
        }
        case 'clock': {
          const endpoint = newEndpoint();
          endpoints.set(at('out'), endpoint);
          clocks.push({ hz: comp.hz ?? 1, endpoint });
          break;
        }
        case 'light': {
          const endpoint = newEndpoint();
          endpoints.set(at('in'), endpoint);
          const pin = pins?.get(comp.id);
          if (pin !== undefined) union(endpoint, pin);
          break;
        }
        case 'hex':
          for (let i = 0; i < 4; i++) endpoints.set(at(`in${i}`), newEndpoint());
          break;
        case 'chip': {
          const def = chips.get(comp.chip);
          if (!def) break;
          const inner = new Map();
          for (const pin of [...def.inputs, ...def.outputs]) {
            const endpoint = newEndpoint();
            inner.set(pin.id, endpoint);
            endpoints.set(at(pin.id), endpoint);
          }
          walk(def.circuit, `${path}${comp.id}/`, inner, depth + 1);
          break;
        }
        default: {
          const op = GATE_OPS[comp.kind];
          if (op === undefined) break;
          const ins = [];
          for (let i = 0; i < inputCount(comp); i++) {
            const endpoint = newEndpoint();
            endpoints.set(at(`in${i}`), endpoint);
            ins.push(endpoint);
          }
          const out = newEndpoint();
          endpoints.set(at('out'), out);
          gates.push({ op, ins, out, key: path + comp.id });
        }
      }
    }
    for (const wire of circuit.wires) {
      const a = endpoints.get(`${wire.from.c}:${wire.from.p}`);
      const b = endpoints.get(`${wire.to.c}:${wire.to.p}`);
      if (a !== undefined && b !== undefined) union(a, b);
    }
    if (!pins) for (const [key, endpoint] of endpoints) top.set(key, endpoint);
  }

  walk(circuit, '', null, 0);

  const netOfRoot = new Map();
  const net = (endpoint) => {
    const root = find(endpoint);
    let id = netOfRoot.get(root);
    if (id === undefined) {
      id = netOfRoot.size;
      netOfRoot.set(root, id);
    }
    return id;
  };

  const inStart = new Int32Array(gates.length + 1);
  gates.forEach((gate, g) => { inStart[g + 1] = inStart[g] + gate.ins.length; });
  const ins = new Int32Array(inStart[gates.length]);
  gates.forEach((gate, g) => gate.ins.forEach((endpoint, i) => { ins[inStart[g] + i] = net(endpoint); }));

  return new Simulation({
    ops: Uint8Array.from(gates, (gate) => gate.op),
    inStart,
    ins,
    outs: Int32Array.from(gates, (gate) => net(gate.out)),
    keys: gates.map((gate) => gate.key),
    switches: new Map(switches.map(({ id, endpoint }) => [id, net(endpoint)])),
    clocks: clocks.map(({ hz, endpoint }) => ({ hz, net: net(endpoint) })),
    top: new Map([...top].map(([key, endpoint]) => [key, net(endpoint)])),
    netCount: () => netOfRoot.size,
    previous,
  });
}

class Simulation {
  constructor({ ops, inStart, ins, outs, keys, switches, clocks, top, netCount, previous }) {
    Object.assign(this, { ops, inStart, ins, outs, keys, switches, clocks, top });
    this.gateCount = ops.length;
    this.values = new Uint8Array(netCount());
    this.clockRates = [...new Set(clocks.map((clock) => clock.hz))];
    this.time = previous?.time ?? 0;
    this.unsettledTicks = 0;

    const nets = this.values.length;
    this.readerStart = new Int32Array(nets + 1);
    for (const n of ins) this.readerStart[n + 1]++;
    for (let n = 0; n < nets; n++) this.readerStart[n + 1] += this.readerStart[n];
    this.readers = new Int32Array(ins.length);
    const fill = this.readerStart.slice(0, nets);
    for (let g = 0; g < this.gateCount; g++) {
      for (let i = inStart[g]; i < inStart[g + 1]; i++) this.readers[fill[ins[i]]++] = g;
    }

    this.queued = new Uint8Array(this.gateCount);
    this.pending = new Int32Array(this.gateCount);
    this.spare = new Int32Array(this.gateCount);
    this.pendingLength = 0;
    this.changedNets = new Int32Array(this.gateCount);
    this.changedValues = new Uint8Array(this.gateCount);

    if (previous) this.adopt(previous);
    for (let g = 0; g < this.gateCount; g++) this.enqueue(g);
  }

  adopt(previous) {
    const outputs = new Map();
    for (let g = 0; g < previous.gateCount; g++) outputs.set(previous.keys[g], previous.values[previous.outs[g]]);
    for (let g = 0; g < this.gateCount; g++) {
      if (outputs.get(this.keys[g])) this.values[this.outs[g]] = 1;
    }
  }

  get settled() {
    return this.pendingLength === 0;
  }

  read(compId, key) {
    const net = this.top.get(`${compId}:${key}`);
    return net === undefined ? 0 : this.values[net];
  }

  setSwitch(compId, on) {
    const net = this.switches.get(compId);
    if (net !== undefined) this.setNet(net, on ? 1 : 0);
  }

  setNet(net, value) {
    if (this.values[net] === value) return;
    this.values[net] = value;
    this.wake(net);
  }

  wake(net) {
    for (let r = this.readerStart[net]; r < this.readerStart[net + 1]; r++) this.enqueue(this.readers[r]);
  }

  enqueue(g) {
    if (this.queued[g]) return;
    this.queued[g] = 1;
    this.pending[this.pendingLength++] = g;
  }

  evaluate(g) {
    const { ins, values } = this;
    const start = this.inStart[g];
    const end = this.inStart[g + 1];
    const op = this.ops[g];
    let value = 0;
    switch (op & 3) {
      case 0:
        value = 1;
        for (let i = start; i < end; i++) if (!values[ins[i]]) { value = 0; break; }
        break;
      case 1:
        for (let i = start; i < end; i++) if (values[ins[i]]) { value = 1; break; }
        break;
      case 2:
        for (let i = start; i < end; i++) value ^= values[ins[i]];
        break;
      default:
        value = values[ins[start]];
    }
    return op & INVERT ? value ^ 1 : value;
  }

  step() {
    const current = this.pending;
    const count = this.pendingLength;
    this.pending = this.spare;
    this.spare = current;
    this.pendingLength = 0;

    const shaking = this.unsettledTicks > TICKS_BEFORE_SHAKING;
    let changes = 0;
    for (let i = 0; i < count; i++) {
      const g = current[i];
      this.queued[g] = 0;
      if (shaking && Math.random() < 0.5) {
        this.enqueue(g);
        continue;
      }
      const value = this.evaluate(g);
      const net = this.outs[g];
      if (value !== this.values[net]) {
        this.changedNets[changes] = net;
        this.changedValues[changes++] = value;
      }
    }
    for (let c = 0; c < changes; c++) {
      this.values[this.changedNets[c]] = this.changedValues[c];
      this.wake(this.changedNets[c]);
    }
    this.unsettledTicks = this.pendingLength ? this.unsettledTicks + 1 : 0;
  }

  settle(deadline) {
    while (this.pendingLength) {
      for (let i = 0; i < 32 && this.pendingLength; i++) this.step();
      if (performance.now() > deadline) return;
    }
  }

  applyClocks() {
    for (const clock of this.clocks) this.setNet(clock.net, Math.floor(this.time * 2 * clock.hz + 1e-6) & 1);
  }

  advance(seconds, deadline) {
    const start = this.time;
    const end = start + seconds;
    const edges = [];
    for (const hz of this.clockRates) {
      const half = 0.5 / hz;
      for (let k = Math.floor(start / half) + 1; k * half <= end && edges.length < MAX_CLOCK_EDGES_PER_FRAME; k++) edges.push(k * half);
    }
    edges.sort((a, b) => a - b);
    for (const edge of edges) {
      this.time = edge;
      this.applyClocks();
      this.settle(deadline);
    }
    this.time = end;
    this.applyClocks();
    this.settle(deadline);
  }
}
