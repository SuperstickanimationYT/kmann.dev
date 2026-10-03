export const COLUMNS = 8;

export const PIECES = [
  { id: 'b1', shape: 'cube', color: 'red', size: 'big' },
  { id: 'b2', shape: 'cube', color: 'blue', size: 'big' },
  { id: 'b3', shape: 'cube', color: 'green', size: 'small' },
  { id: 'b4', shape: 'cube', color: 'yellow', size: 'small' },
  { id: 'b5', shape: 'cube', color: 'red', size: 'small' },
  { id: 'b6', shape: 'cube', color: 'yellow', size: 'big' },
  { id: 'p1', shape: 'pyramid', color: 'red', size: 'small' },
  { id: 'p2', shape: 'pyramid', color: 'green', size: 'big' },
  { id: 'p3', shape: 'pyramid', color: 'blue', size: 'small' },
];

export const START_STACKS = [['b2', 'p1'], [], ['b1', 'b5'], ['p2'], [], ['b6', 'b4', 'p3'], [], ['b3']];

export const pieceById = Object.fromEntries(PIECES.map((piece) => [piece.id, piece]));

export function createWorld(stacks = START_STACKS) {
  return { stacks: stacks.map((stack) => [...stack]) };
}

export const cloneWorld = (world) => createWorld(world.stacks);

export function isValidStacks(stacks) {
  if (!Array.isArray(stacks) || stacks.length !== COLUMNS) return false;
  const seen = stacks.flat();
  return seen.length === PIECES.length && PIECES.every((piece) => seen.includes(piece.id));
}

export function positionOf(world, id) {
  for (let col = 0; col < world.stacks.length; col++) {
    const level = world.stacks[col].indexOf(id);
    if (level >= 0) return { col, level };
  }
  return null;
}

export function describe(id) {
  if (id === 'table') return 'the table';
  const piece = pieceById[id];
  return `the ${piece.size} ${piece.color} ${piece.shape}`;
}

export function related(world, relation, x, z) {
  if (x === z || x === 'table') return false;
  const a = positionOf(world, x);
  if (z === 'table') return relation === 'on' ? a.level === 0 : relation === 'above';
  const b = positionOf(world, z);
  switch (relation) {
    case 'on': return a.col === b.col && a.level === b.level + 1;
    case 'under': return a.col === b.col && a.level + 1 === b.level;
    case 'above': return a.col === b.col && a.level > b.level;
    case 'below': return a.col === b.col && a.level < b.level;
    case 'beside': return Math.abs(a.col - b.col) === 1;
    case 'left_of': return a.col < b.col;
    case 'right_of': return a.col > b.col;
    default: return false;
  }
}

export function supportOf(world, id) {
  const { col, level } = positionOf(world, id);
  return level === 0 ? 'table' : world.stacks[col][level - 1];
}

export function placementRefusal(moverId, targetId) {
  if (targetId === 'table') return null;
  const mover = pieceById[moverId];
  const target = pieceById[targetId];
  if (target.shape === 'pyramid') return { rule: 'P1', reason: 'Nothing can rest on a pyramid.' };
  if (mover.size === 'big' && target.size === 'small') return { rule: 'P2', reason: "A big block won't balance on a small one." };
  return null;
}

function moveTop(world, id, col, plan) {
  const from = positionOf(world, id).col;
  world.stacks[from].pop();
  world.stacks[col].push(id);
  plan.moves.push({ id, from, to: col });
  plan.snapshots.push(world.stacks.map((stack) => [...stack]));
}

function freeColumnFor(world, id, avoid) {
  const columns = world.stacks.map((_, col) => col).filter((col) => !avoid.includes(col));
  const empty = columns.find((col) => world.stacks[col].length === 0);
  if (empty !== undefined) return empty;
  return columns.find((col) => !placementRefusal(id, world.stacks[col].at(-1)));
}

function clearAbove(world, id, avoid, plan) {
  for (;;) {
    const { col } = positionOf(world, id);
    const top = world.stacks[col].at(-1);
    if (top === id) return true;
    const dest = freeColumnFor(world, top, [...avoid, col]);
    if (dest === undefined) return false;
    moveTop(world, top, dest, plan);
  }
}

const refused = (rule, reason) => ({ ok: false, refusal: { rule, reason } });
const NO_ROOM = refused('P3', "There's no free spot to move things to.");

export function planPut(world, x, y) {
  if (x === 'table') return refused('P0', "I can't move the table.");
  if (x === y) return refused('P0', "I can't put something on itself.");
  const refusal = placementRefusal(x, y);
  if (refusal) return { ok: false, refusal };
  if (related(world, 'on', x, y)) return { ok: true, already: true, moves: [], snapshots: [], world };
  const next = cloneWorld(world);
  const plan = { ok: true, moves: [], snapshots: [], world: next };
  const avoidFor = (id) => (id === 'table' ? [] : [positionOf(next, id).col]);
  if (!clearAbove(next, x, avoidFor(y), plan)) return NO_ROOM;
  if (y !== 'table' && !clearAbove(next, y, avoidFor(x), plan)) return NO_ROOM;
  const dest = y === 'table' ? next.stacks.findIndex((stack) => stack.length === 0) : positionOf(next, y).col;
  if (dest < 0) return NO_ROOM;
  moveTop(next, x, dest, plan);
  return plan;
}

export function planClear(world, x) {
  if (x === 'table') return refused('P0', "I won't sweep the whole table.");
  const next = cloneWorld(world);
  const plan = { ok: true, moves: [], snapshots: [], world: next };
  if (!clearAbove(next, x, [], plan)) return NO_ROOM;
  plan.already = plan.moves.length === 0;
  return plan;
}

export function randomWorld(random = Math.random) {
  const stacks = Array.from({ length: COLUMNS }, () => []);
  const order = [...PIECES].sort(() => random() - 0.5);
  for (const piece of order) {
    const options = stacks.map((_, col) => col).filter((col) => !stacks[col].length || (stacks[col].length < 3 && !placementRefusal(piece.id, stacks[col].at(-1))));
    if (!options.length) return randomWorld(random);
    const empties = options.filter((col) => !stacks[col].length);
    const pool = random() < 0.35 && empties.length ? empties : options;
    stacks[pool[Math.floor(random() * pool.length)]].push(piece.id);
  }
  return createWorld(stacks);
}
