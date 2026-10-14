const KEYWORDS = new Set(['if', 'then', 'elseif', 'else', 'end', 'while', 'do', 'keep', 'and', 'or', 'not', 'true', 'false']);
const SYMBOLS = ['==', '!=', '<=', '>=', '+', '-', '*', '/', '%', '^', '(', ')', ',', '=', '<', '>', '.'];

const DEGREES = Math.PI / 180;

export const BUILTINS = {
  abs: { args: 1, run: Math.abs, help: 'abs(x) size of x without its sign' },
  sign: { args: 1, run: Math.sign, help: 'sign(x) -1, 0 or 1' },
  sqrt: { args: 1, run: Math.sqrt, help: 'sqrt(x) square root' },
  round: { args: 1, run: Math.round, help: 'round(x) nearest whole number' },
  floor: { args: 1, run: Math.floor, help: 'floor(x) round down' },
  sin: { args: 1, run: (a) => Math.sin(a * DEGREES), help: 'sin(a) sine of an angle in degrees' },
  cos: { args: 1, run: (a) => Math.cos(a * DEGREES), help: 'cos(a) cosine of an angle in degrees' },
  atan2: { args: 2, run: (y, x) => Math.atan2(y, x) / DEGREES, help: 'atan2(y, x) angle in degrees' },
  min: { args: 2, run: Math.min, help: 'min(a, b) the smaller one' },
  max: { args: 2, run: Math.max, help: 'max(a, b) the larger one' },
  clamp: { args: 3, run: (x, low, high) => Math.max(low, Math.min(high, x)), help: 'clamp(x, low, high) keep x between low and high' },
};
const BUILTIN_NAMES = Object.keys(BUILTINS);

export const CPU_READINGS = {
  tilt: 'degrees the CPU beam has turned since Run, counterclockwise positive',
  spin: 'how fast the CPU beam turns, degrees per second',
  height: 'meters from the ground to the CPU',
  time: 'seconds since Run',
  dt: 'seconds since the previous pass began',
};

export const DEVICES = {
  motor: {
    plural: 'motors',
    ports: {
      power: { write: true, help: 'set from -1 to 1 to drive the motor, read back what you set' },
      angle: { help: 'degrees the motor has turned since Run' },
      speed: { help: 'motor speed in rpm' },
    },
  },
  gyro: {
    plural: 'gyros',
    ports: {
      tilt: { help: 'degrees this beam has turned since Run, counterclockwise positive' },
      spin: { help: 'how fast this beam turns, degrees per second' },
    },
  },
  angle: {
    plural: 'angle sensors',
    ports: {
      angle: { help: 'degrees this joint has turned since Run' },
      speed: { help: 'how fast this joint turns, in rpm' },
    },
  },
};
const DEVICE_NAME = new RegExp(`^(${Object.keys(DEVICES).join('|')})([1-9][0-9]*)$`);

const OP = {
  PUSH: 0, LOAD: 1, STORE: 2, IN: 3, OUT: 4, ONCE: 5, JUMP: 6, JUMP_IF_ZERO: 7, CALL: 8,
  ADD: 10, SUB: 11, MUL: 12, DIV: 13, MOD: 14, POW: 15,
  LT: 20, LE: 21, GT: 22, GE: 23, EQ: 24, NE: 25, AND: 26, OR: 27, NEG: 28, NOT: 29,
};

const BINARY = {
  '+': OP.ADD, '-': OP.SUB, '*': OP.MUL, '/': OP.DIV, '%': OP.MOD, '^': OP.POW,
  '<': OP.LT, '<=': OP.LE, '>': OP.GT, '>=': OP.GE, '==': OP.EQ, '!=': OP.NE, and: OP.AND, or: OP.OR,
};

class CodeError extends Error {
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}

function tokenize(source) {
  const tokens = [];
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\n') {
      line += 1;
      i += 1;
    } else if (/\s/.test(ch)) {
      i += 1;
    } else if (ch === '#') {
      while (i < source.length && source[i] !== '\n') i += 1;
    } else if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1]))) {
      const text = source.slice(i).match(/^(\d*\.?\d+|\d+\.)/)[0];
      tokens.push({ kind: 'number', value: Number(text), line });
      i += text.length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const text = source.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)[0];
      tokens.push({ kind: KEYWORDS.has(text) ? text : 'name', value: text, line });
      i += text.length;
    } else {
      const symbol = SYMBOLS.find((s) => source.startsWith(s, i));
      if (!symbol) throw new CodeError(line, `"${ch}" isn't part of the language.`);
      tokens.push({ kind: symbol, value: symbol, line });
      i += symbol.length;
    }
  }
  tokens.push({ kind: 'eof', value: 'the end of the program', line });
  return tokens;
}

function parse(tokens) {
  let at = 0;
  const peek = () => tokens[at];
  const accept = (kind) => (tokens[at].kind === kind ? tokens[at++] : null);
  const expect = (kind, why) => {
    const token = accept(kind);
    if (!token) throw new CodeError(peek().line, `Expected "${kind}" ${why}, found "${peek().value}".`);
    return token;
  };

  function block(enders, opener) {
    const statements = [];
    while (!enders.includes(peek().kind)) {
      if (peek().kind === 'eof') throw new CodeError(opener.line, `This ${opener.kind} has no "end". Every if and while needs one.`);
      statements.push(statement());
    }
    return statements;
  }

  function target() {
    const name = expect('name', 'at the start of the line');
    if (!accept('.')) return { kind: 'var', name: name.value, line: name.line };
    const port = expect('name', `after "${name.value}."`);
    return { kind: 'port', device: name.value, port: port.value, line: name.line };
  }

  function statement() {
    const token = peek();
    if (accept('keep')) {
      const name = expect('name', 'after keep');
      expect('=', `after "keep ${name.value}"`);
      return { kind: 'keep', name: name.value, value: expression(), line: token.line };
    }
    if (accept('if')) {
      const branches = [];
      do {
        const test = expression();
        expect('then', 'after the if condition');
        branches.push({ test, body: block(['elseif', 'else', 'end'], token) });
      } while (accept('elseif'));
      const otherwise = accept('else') ? block(['end'], token) : [];
      expect('end', 'to close the if');
      return { kind: 'if', branches, otherwise, line: token.line };
    }
    if (accept('while')) {
      const test = expression();
      expect('do', 'after the while condition');
      const body = block(['end'], token);
      expect('end', 'to close the while');
      return { kind: 'while', test, body, line: token.line };
    }
    if (token.kind !== 'name') throw new CodeError(token.line, `A line can't start with "${token.value}".`);
    const place = target();
    expect('=', `after "${place.kind === 'var' ? place.name : `${place.device}.${place.port}`}". Lines set a value, like x = 1`);
    return { kind: 'set', place, value: expression(), line: token.line };
  }

  function binaryLevel(operators, next) {
    return () => {
      let left = next();
      while (operators.includes(peek().kind)) {
        const op = tokens[at++];
        left = { kind: 'binary', op: op.kind, left, right: next(), line: op.line };
      }
      return left;
    };
  }

  function unary() {
    const token = peek();
    if (accept('-')) return { kind: 'unary', op: OP.NEG, value: unary(), line: token.line };
    if (accept('not')) return { kind: 'unary', op: OP.NOT, value: unary(), line: token.line };
    return power();
  }

  function power() {
    const base = primary();
    const token = peek();
    if (accept('^')) return { kind: 'binary', op: '^', left: base, right: unary(), line: token.line };
    return base;
  }

  function primary() {
    const token = peek();
    if (accept('number')) return { kind: 'number', value: token.value };
    if (accept('true')) return { kind: 'number', value: 1 };
    if (accept('false')) return { kind: 'number', value: 0 };
    if (accept('(')) {
      const inner = expression();
      expect(')', 'to close the bracket');
      return inner;
    }
    if (token.kind === 'name' && tokens[at + 1].kind === '(') {
      at += 2;
      const args = [];
      if (!accept(')')) {
        do args.push(expression());
        while (accept(','));
        expect(')', `to close ${token.value}(`);
      }
      return { kind: 'call', name: token.value, args, line: token.line };
    }
    if (token.kind === 'name') return target();
    throw new CodeError(token.line, `Expected a number or a name, found "${token.value}".`);
  }

  const comparison = binaryLevel(['<', '<=', '>', '>=', '==', '!='], binaryLevel(['+', '-'], binaryLevel(['*', '/', '%'], unary)));
  const negation = () => {
    const token = peek();
    if (accept('not')) return { kind: 'unary', op: OP.NOT, value: negation(), line: token.line };
    return comparison();
  };
  const expression = binaryLevel(['or'], binaryLevel(['and'], negation));

  return block(['eof']);
}

function assignedNames(statements, names = new Set()) {
  for (const s of statements) {
    if (s.kind === 'keep' || (s.kind === 'set' && s.place.kind === 'var')) names.add(s.kind === 'keep' ? s.name : s.place.name);
    if (s.kind === 'while') assignedNames(s.body, names);
    if (s.kind === 'if') {
      for (const branch of s.branches) assignedNames(branch.body, names);
      assignedNames(s.otherwise, names);
    }
  }
  return names;
}

function deviceIndex(device, prefix) {
  const match = device.match(new RegExp(`^${prefix}([1-9][0-9]*)$`));
  return match ? Number(match[1]) - 1 : -1;
}

export function compile(source, hardware) {
  try {
    const statements = parse(tokenize(source));
    const variables = [...assignedNames(statements)];
    const slots = new Map(variables.map((name, i) => [name, i]));
    const ports = [];
    const portIds = new Map();
    const drives = new Set();
    const code = [];
    let onceFlags = 0;

    const emit = (op, arg = 0) => {
      code.push(op, arg);
      return code.length - 2;
    };
    const patch = (at) => {
      code[at + 1] = code.length;
    };
    const portId = (port) => {
      const key = JSON.stringify(port);
      if (!portIds.has(key)) {
        portIds.set(key, ports.length);
        ports.push(port);
      }
      return portIds.get(key);
    };

    function resolve(place, writing) {
      if (place.kind === 'var') {
        if (CPU_READINGS[place.name]) {
          if (writing) throw new CodeError(place.line, `${place.name} is a reading. A program can't set it.`);
          return { io: portId({ kind: place.name }) };
        }
        const bare = place.name.match(DEVICE_NAME);
        if (bare) {
          const examples = Object.keys(DEVICES[bare[1]].ports).map((port) => `${place.name}.${port}`).join(' or ');
          throw new CodeError(place.line, `Say which reading of ${place.name} you mean, like ${examples}.`);
        }
        const touch = deviceIndex(place.name, 'touch');
        if (touch >= 0) {
          if (writing) throw new CodeError(place.line, `${place.name} is a sensor. A program can't set it.`);
          if (touch >= hardware.touch) throw new CodeError(place.line, `There is no ${place.name}. This robot has ${hardware.touch} touch sensor${hardware.touch === 1 ? '' : 's'}.`);
          return { io: portId({ kind: 'touch', index: touch }) };
        }
        if (!slots.has(place.name)) {
          const hint = BUILTINS[place.name] ? ` ${place.name} is a function. Call it like ${place.name}(x).` : ' Set it first, for example with keep.';
          throw new CodeError(place.line, `Unknown name "${place.name}".${hint}`);
        }
        return { slot: slots.get(place.name) };
      }
      const match = place.device.match(DEVICE_NAME);
      if (!match) throw new CodeError(place.line, `Unknown part "${place.device}". Parts are named like ${Object.keys(DEVICES).map((kind) => `${kind}1`).join(', ')}.`);
      const [, kind, number] = match;
      const device = DEVICES[kind];
      const index = Number(number) - 1;
      const count = hardware[kind];
      if (index >= count) throw new CodeError(place.line, `There is no ${place.device}. This robot has ${count} ${count === 1 ? device.plural.replace(/s$/, '') : device.plural}.`);
      const spec = device.ports[place.port];
      if (!spec) throw new CodeError(place.line, `${place.device} has ${Object.keys(device.ports).join(' and ')}, not "${place.port}".`);
      if (writing && !spec.write) throw new CodeError(place.line, `${place.device}.${place.port} is a reading. A program can't set it.`);
      if (writing) drives.add(index);
      return { io: portId({ kind: `${kind}-${place.port}`, index }) };
    }

    function expression(node) {
      if (node.kind === 'number') emit(OP.PUSH, node.value);
      else if (node.kind === 'var' || node.kind === 'port') {
        const where = resolve(node, false);
        if ('slot' in where) emit(OP.LOAD, where.slot);
        else emit(OP.IN, where.io);
      } else if (node.kind === 'unary') {
        expression(node.value);
        emit(node.op);
      } else if (node.kind === 'binary') {
        expression(node.left);
        expression(node.right);
        emit(BINARY[node.op]);
      } else if (node.kind === 'call') {
        const builtin = BUILTINS[node.name];
        if (!builtin) throw new CodeError(node.line, `There's no function called ${node.name}. Try ${BUILTIN_NAMES.join(', ')}.`);
        if (node.args.length !== builtin.args) throw new CodeError(node.line, `${node.name} takes ${builtin.args} value${builtin.args === 1 ? '' : 's'}, got ${node.args.length}.`);
        for (const arg of node.args) expression(arg);
        emit(OP.CALL, BUILTIN_NAMES.indexOf(node.name));
      }
    }

    function statementsOf(list) {
      for (const s of list) {
        if (s.kind === 'keep') {
          resolve({ kind: 'var', name: s.name, line: s.line }, true);
          const skip = emit(OP.ONCE, 0);
          code.push(onceFlags++);
          expression(s.value);
          emit(OP.STORE, slots.get(s.name));
          code[skip + 1] = code.length;
        } else if (s.kind === 'set') {
          expression(s.value);
          const where = resolve(s.place, true);
          if ('slot' in where) emit(OP.STORE, where.slot);
          else emit(OP.OUT, where.io);
        } else if (s.kind === 'while') {
          const top = code.length;
          expression(s.test);
          const exit = emit(OP.JUMP_IF_ZERO);
          statementsOf(s.body);
          emit(OP.JUMP, top);
          patch(exit);
        } else if (s.kind === 'if') {
          const exits = [];
          for (const branch of s.branches) {
            expression(branch.test);
            const next = emit(OP.JUMP_IF_ZERO);
            statementsOf(branch.body);
            exits.push(emit(OP.JUMP));
            patch(next);
          }
          statementsOf(s.otherwise);
          for (const exit of exits) patch(exit);
        }
      }
    }

    statementsOf(statements);
    return { ok: true, program: { code, variables, ports, drives, onceFlags } };
  } catch (error) {
    if (!(error instanceof CodeError)) throw error;
    return { ok: false, error: { line: error.line, message: error.message } };
  }
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

export class Processor {
  constructor(program, io) {
    this.program = program;
    this.io = io;
    this.values = new Float64Array(program.variables.length);
    this.done = new Uint8Array(program.onceFlags);
    this.stack = [];
    this.pc = 0;
    this.budget = 0;
    this.passes = 0;
    this.passStart = 0;
    this.dt = 0;
  }

  run(cycles, now) {
    const { code, ports } = this.program;
    const { stack, values } = this;
    this.budget += cycles;
    while (this.budget >= 1) {
      if (this.pc >= code.length) {
        this.dt = now - this.passStart;
        this.passStart = now;
        this.passes += 1;
        this.pc = 0;
        if (!code.length) {
          this.budget = 0;
          return;
        }
      }
      this.budget -= 1;
      const op = code[this.pc];
      const arg = code[this.pc + 1];
      this.pc += 2;
      if (op === OP.PUSH) stack.push(arg);
      else if (op === OP.LOAD) stack.push(values[arg]);
      else if (op === OP.STORE) values[arg] = stack.pop();
      else if (op === OP.IN) stack.push(finite(this.io.read(ports[arg], this)));
      else if (op === OP.OUT) this.io.write(ports[arg], stack.pop());
      else if (op === OP.ONCE) {
        const flag = code[this.pc];
        this.pc += 1;
        if (this.done[flag]) this.pc = arg;
        else this.done[flag] = 1;
      } else if (op === OP.JUMP) this.pc = arg;
      else if (op === OP.JUMP_IF_ZERO) {
        if (stack.pop() === 0) this.pc = arg;
      } else if (op === OP.CALL) {
        const builtin = BUILTINS[BUILTIN_NAMES[arg]];
        const args = stack.splice(stack.length - builtin.args, builtin.args);
        stack.push(finite(builtin.run(...args)));
      } else if (op === OP.NEG) stack.push(-stack.pop());
      else if (op === OP.NOT) stack.push(stack.pop() === 0 ? 1 : 0);
      else {
        const b = stack.pop();
        const a = stack.pop();
        stack.push(finite(binary(op, a, b)));
      }
    }
  }
}

function binary(op, a, b) {
  switch (op) {
    case OP.ADD: return a + b;
    case OP.SUB: return a - b;
    case OP.MUL: return a * b;
    case OP.DIV: return a / b;
    case OP.MOD: return a % b;
    case OP.POW: return a ** b;
    case OP.LT: return a < b ? 1 : 0;
    case OP.LE: return a <= b ? 1 : 0;
    case OP.GT: return a > b ? 1 : 0;
    case OP.GE: return a >= b ? 1 : 0;
    case OP.EQ: return a === b ? 1 : 0;
    case OP.NE: return a !== b ? 1 : 0;
    case OP.AND: return a !== 0 && b !== 0 ? 1 : 0;
    case OP.OR: return a !== 0 || b !== 0 ? 1 : 0;
    default: return 0;
  }
}
