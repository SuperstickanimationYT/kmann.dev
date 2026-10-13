import {
  AIR_WATER_CAPACITY, BARREL_CAPACITY, BUILDINGS, BUILDING_ORDER, CARRY_LIMIT, HOPPER_CAPACITY, MAX_TANKS, RESOURCES,
} from './items.js';
import { PROPELLANT_UNIT, emptyRocket, propellantCapacity } from './rocket.js';

export const STEP = 1 / 30;
export const TILE = 40.5;
export const COLS = 13;
export const ROWS = 9;
export const TILE_SIZE = 0.75;
export const REACH = 72;

const BREATH_RATE = 0.3;
const AIR_RATE_PER_LEVEL = 0.15;
const AIR_DRAIN_PER_LEVEL = 0.125;
const AIR_WATER_PER_LEVEL = 1 / 240;
const SCRUB_RATE = 0.6;
const SCRUB_DRAIN = 0.1;
const SOLAR_CHARGE_RATE = 1;
const MAX_AIR_LEVEL = 4;
const WALK_SPEED = 90;
const DOT_SPEED = 300;
const DOT_COUNT = 10;
const DOT_DELAY = 6;
const DOT_RADIUS = 5;
const PLAYER_RADIUS = 11;
const LEAK_O2 = 0.5;
const WALL_HALF_WIDTH = 4.35;
const WALL_ARM = 21;

export const WALL_CYCLE = ['empty', 'wall-horizontal', 'wall-vertical', 'wall-top-left', 'wall-top-right', 'wall-bottom-right', 'wall-bottom-left'];
const WALL_ARMS = {
  'wall-horizontal': ['left', 'right'],
  'wall-vertical': ['up', 'down'],
  'wall-top-left': ['down', 'right'],
  'wall-top-right': ['left', 'down'],
  'wall-bottom-right': ['up', 'left'],
  'wall-bottom-left': ['right', 'up'],
};

export const LANDER_BODY = { left: -20, right: 20, bottom: -19, top: 51 };
const LANDER_CLICK = { left: -53, right: 53, bottom: -58, top: 93 };
const MODES = ['play', 'build', 'place'];

export const CHUNKS = { main: 'Main', icy: 'Icy', basin: 'Regolith Basin' };

export function tileCenter(i, j) {
  return { x: -243 + i * TILE, y: 162 - j * TILE };
}

export function tileAt(x, y) {
  const i = Math.round((x + 243) / TILE);
  const j = Math.round((162 - y) / TILE);
  if (i < 0 || i >= COLS || j < 0 || j >= ROWS) return null;
  return { i, j };
}

function underLander(i, j) {
  return i >= 5 && i <= 7 && j >= 2 && j <= 5;
}

function inside(box, x, y) {
  return x >= box.left && x <= box.right && y >= box.bottom && y <= box.top;
}

function makeGrid(kind) {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => ({ kind })));
}

function newBuilding(type) {
  const spec = BUILDINGS[type];
  const building = { type };
  if (spec.battery) building.battery = null;
  if (type === 'Air Generator') Object.assign(building, { level: 2, water: 0, waterUse: 0 });
  if (spec.process) Object.assign(building, { hopper: 0, output: 0, progress: 0 });
  if (spec.store) building.store = {};
  if (spec.pad) building.rocket = emptyRocket();
  return building;
}

export function createGame() {
  return {
    phase: 'landing',
    time: 0,
    chunk: CHUNKS.main,
    mode: 'play',
    vitals: { o2: 100, co2: 0 },
    cause: '',
    inventory: {
      counts: { Barrel: 3, 'Solar Panel': 1, 'Water Generator': 1, 'Air Generator': 1, Water: 4 },
      batteries: [100],
    },
    main: makeGrid('empty'),
    outer: null,
    player: { x: 0, y: 0, size: 200, direction: 90, walking: false, target: null, pending: null },
    pointer: { x: 0, y: 0 },
    lander: { y: 200, costume: 'lander-on', frame: 0, debris: [] },
    steppingShrink: 0,
    dots: [],
    wallVersion: 0,
    vacuumMap: null,
    dotTimer: DOT_DELAY,
    keys: new Set(),
    events: [],
    toast: null,
    milestones: new Set(),
    showHud: true,
  };
}

function say(game, text) {
  game.toast = { text, age: 0 };
}

function sound(game, name) {
  game.events.push(name);
}

export function carried(game) {
  return RESOURCES.reduce((sum, name) => sum + (game.inventory.counts[name] || 0), 0);
}

export function count(game, name) {
  return game.inventory.counts[name] || 0;
}

function add(game, name, amount = 1) {
  game.inventory.counts[name] = count(game, name) + amount;
  if (game.inventory.counts[name] <= 0) delete game.inventory.counts[name];
}

function roomFor(game, name) {
  return RESOURCES.includes(name) ? CARRY_LIMIT - carried(game) : Infinity;
}

export function currentGrid(game) {
  return game.chunk === CHUNKS.main ? game.main : game.outer;
}

function enterChunk(game, chunk) {
  game.chunk = chunk;
  game.outer = chunk === CHUNKS.icy ? makeGrid('ice') : chunk === CHUNKS.basin ? makeGrid('deposit') : null;
  game.player.target = null;
  game.player.pending = null;
}

export function cycleMode(game) {
  game.mode = MODES[(MODES.indexOf(game.mode) + 1) % MODES.length];
  game.player.target = null;
  game.player.pending = null;
}

function updateLanding(game) {
  const lander = game.lander;
  lander.frame += 1;
  if (lander.frame <= 20) {
    lander.y += lander.y / -32;
  } else if (lander.frame === 21) {
    for (let k = 0; k < 14; k += 1) {
      lander.debris.push({ x: 0, y: -50, direction: Math.random() * 360 - 180, life: 10 });
    }
    lander.y = 106;
  } else if (lander.frame <= 71) {
    lander.y += lander.y / -16;
  } else if (lander.frame <= 74) {
    lander.y *= 0.4;
  } else {
    lander.y = 0;
    lander.costume = 'lander-off';
    game.phase = 'stepping';
  }
  updateDebris(lander);
}

function updateDebris(lander) {
  for (const bit of lander.debris) {
    const steps = 5 - ((Math.abs(bit.direction) - 90) / 40) ** 2;
    const angle = ((90 - bit.direction) * Math.PI) / 180;
    bit.x += Math.cos(angle) * steps;
    bit.y += Math.sin(angle) * steps;
    bit.life -= 1;
  }
  lander.debris = lander.debris.filter((bit) => bit.life > 0);
}

function updateStepping(game) {
  const player = game.player;
  updateDebris(game.lander);
  if (game.steppingShrink > 0) {
    player.size -= 10;
    game.steppingShrink -= 1;
    if (game.steppingShrink === 0) {
      player.size = 100;
      player.direction = 90;
      game.phase = 'playing';
    }
    return;
  }
  player.x = game.pointer.x;
  player.y = game.pointer.y;
  player.direction += 15;
}

function wallRects(game) {
  if (game.chunk !== CHUNKS.main) return [];
  const rects = [LANDER_BODY];
  game.main.forEach((row, j) => row.forEach((tile, i) => {
    const arms = WALL_ARMS[tile.kind];
    if (!arms) return;
    const { x, y } = tileCenter(i, j);
    const core = { left: x - WALL_HALF_WIDTH, right: x + WALL_HALF_WIDTH, bottom: y - WALL_HALF_WIDTH, top: y + WALL_HALF_WIDTH };
    for (const arm of arms) {
      const rect = { ...core };
      if (arm === 'left') rect.left = x - WALL_ARM;
      if (arm === 'right') rect.right = x + WALL_ARM;
      if (arm === 'down') rect.bottom = y - WALL_ARM;
      if (arm === 'up') rect.top = y + WALL_ARM;
      rects.push(rect);
    }
  }));
  return rects;
}

const VACUUM_SOURCE = { x: 236, y: 176 };
const AIR_CELL = 3;
const AIR_COLS = 480 / AIR_CELL;
const AIR_ROWS = 360 / AIR_CELL;

function airCell(x, y) {
  const i = Math.min(AIR_COLS - 1, Math.max(0, Math.floor((x + 240) / AIR_CELL)));
  const j = Math.min(AIR_ROWS - 1, Math.max(0, Math.floor((180 - y) / AIR_CELL)));
  return j * AIR_COLS + i;
}

function vacuumReach(game) {
  if (game.vacuumMap && game.vacuumMap.version === game.wallVersion) return game.vacuumMap.open;
  const blocked = new Uint8Array(AIR_COLS * AIR_ROWS);
  for (const rect of wallRects(game)) {
    for (let j = 0; j < AIR_ROWS; j += 1) {
      const y = 180 - (j + 0.5) * AIR_CELL;
      if (y < rect.bottom - DOT_RADIUS || y > rect.top + DOT_RADIUS) continue;
      for (let i = 0; i < AIR_COLS; i += 1) {
        const x = (i + 0.5) * AIR_CELL - 240;
        if (x >= rect.left - DOT_RADIUS && x <= rect.right + DOT_RADIUS) blocked[j * AIR_COLS + i] = 1;
      }
    }
  }
  const open = new Uint8Array(AIR_COLS * AIR_ROWS);
  const queue = [airCell(VACUUM_SOURCE.x, VACUUM_SOURCE.y)];
  open[queue[0]] = 1;
  while (queue.length) {
    const cell = queue.pop();
    const i = cell % AIR_COLS;
    const neighbours = [i > 0 && cell - 1, i < AIR_COLS - 1 && cell + 1, cell - AIR_COLS, cell + AIR_COLS];
    for (const next of neighbours) {
      if (next === false || next < 0 || next >= open.length || open[next] || blocked[next]) continue;
      open[next] = 1;
      queue.push(next);
    }
  }
  game.vacuumMap = { version: game.wallVersion, open };
  return open;
}

export function exposed(game) {
  return game.chunk !== CHUNKS.main || vacuumReach(game)[airCell(game.player.x, game.player.y)] === 1;
}

function clearSealedDots(game) {
  const open = vacuumReach(game);
  game.dots = game.dots.filter((dot) => open[airCell(dot.x, dot.y)]);
  while (game.dotTimer <= 0 && game.dots.length < DOT_COUNT) spawnDot(game);
}

function spawnDot(game) {
  const angle = Math.random() * Math.PI * 2;
  game.dots.push({ x: VACUUM_SOURCE.x, y: VACUUM_SOURCE.y, vx: Math.cos(angle) * DOT_SPEED, vy: Math.sin(angle) * DOT_SPEED, cooldown: 0 });
}

function bounceOffRect(dot, rect, dx, dy) {
  const hit = dot.x + DOT_RADIUS > rect.left && dot.x - DOT_RADIUS < rect.right
    && dot.y + DOT_RADIUS > rect.bottom && dot.y - DOT_RADIUS < rect.top;
  if (!hit) return false;
  const wasInsideX = dot.x - dx + DOT_RADIUS > rect.left && dot.x - dx - DOT_RADIUS < rect.right;
  if (wasInsideX) {
    dot.vy = -dot.vy;
    dot.y -= dy;
  } else {
    dot.vx = -dot.vx;
    dot.x -= dx;
  }
  return true;
}

function updateDots(game, dt) {
  if (game.dotTimer > 0) {
    game.dotTimer -= dt;
    if (game.dotTimer <= 0) for (let k = 0; k < DOT_COUNT; k += 1) spawnDot(game);
    return;
  }
  if (game.chunk === CHUNKS.main && game.vacuumMap?.version !== game.wallVersion) clearSealedDots(game);
  const rects = wallRects(game);
  const substeps = 5;
  for (const dot of game.dots) {
    dot.cooldown = Math.max(0, dot.cooldown - dt);
    for (let s = 0; s < substeps; s += 1) {
      const dx = (dot.vx * dt) / substeps;
      const dy = (dot.vy * dt) / substeps;
      dot.x += dx;
      dot.y += dy;
      if (dot.x > 240 - DOT_RADIUS || dot.x < -240 + DOT_RADIUS) { dot.vx = -dot.vx; dot.x -= dx; }
      if (dot.y > 180 - DOT_RADIUS || dot.y < -180 + DOT_RADIUS) { dot.vy = -dot.vy; dot.y -= dy; }
      for (const rect of rects) if (bounceOffRect(dot, rect, dx, dy)) break;
    }
    const player = game.player;
    if (dot.cooldown === 0 && Math.hypot(dot.x - player.x, dot.y - player.y) < PLAYER_RADIUS + DOT_RADIUS) {
      game.vitals.o2 -= LEAK_O2;
      dot.vx = -dot.vx;
      dot.vy = -dot.vy;
      dot.cooldown = 0.6;
      sound(game, 'hit');
      say(game, game.chunk === CHUNKS.main ? 'Vacuum leak! Close the gaps in your walls.' : 'Vacuum leak! Out here nothing stops it.');
    }
  }
}

function updateBuildings(game, dt) {
  for (const row of game.main) for (const tile of row) {
    const b = tile.building;
    if (!b) continue;
    if (b.type === 'Air Generator') updateAirGenerator(game, b, dt);
    if (b.type === 'Solar Panel' && b.battery !== null) b.battery = Math.min(100, b.battery + SOLAR_CHARGE_RATE * dt);
    if (BUILDINGS[b.type].process) updateProcess(b, dt);
  }
}

export function scrubbing(b) {
  return b.battery > 0;
}

export function makingOxygen(b) {
  return b.level > 0 && b.battery > 0 && (b.water > 0 || b.waterUse > 0);
}

function updateAirGenerator(game, b, dt) {
  if (!scrubbing(b)) return;
  game.vitals.co2 = Math.max(0, game.vitals.co2 - SCRUB_RATE * dt);
  b.battery = Math.max(0, b.battery - SCRUB_DRAIN * dt);
  game.milestones.add('air');
  if (b.waterUse <= 0 && b.water > 0 && b.level > 0) {
    b.water -= 1;
    b.waterUse = 1;
  }
  if (!makingOxygen(b)) return;
  game.vitals.o2 += AIR_RATE_PER_LEVEL * b.level * dt;
  b.battery = Math.max(0, b.battery - AIR_DRAIN_PER_LEVEL * b.level * dt);
  b.waterUse -= AIR_WATER_PER_LEVEL * b.level * dt;
}

export function processBlocked(b) {
  const spec = BUILDINGS[b.type].process;
  if (b.hopper < spec.inputPer) return `Needs ${spec.input.toLowerCase()}`;
  if (b.output >= HOPPER_CAPACITY) return 'Output full';
  if (spec.drain > 0 && !(b.battery > 0)) return 'Needs a charged battery';
  return '';
}

function updateProcess(b, dt) {
  const spec = BUILDINGS[b.type].process;
  if (processBlocked(b)) return;
  b.progress += dt / spec.seconds;
  if (spec.drain > 0) b.battery = Math.max(0, b.battery - (spec.drain / spec.seconds) * dt);
  if (b.progress >= 1) {
    b.progress = 0;
    b.hopper -= spec.inputPer;
    b.output += 1;
  }
}

function crossChunks(game) {
  const player = game.player;
  if (game.chunk === CHUNKS.main && player.x > 200) { enterChunk(game, CHUNKS.icy); player.x = -199; }
  else if (game.chunk === CHUNKS.icy && player.x < -200) { enterChunk(game, CHUNKS.main); player.x = 199; }
  else if (game.chunk === CHUNKS.basin && player.x > 200) { enterChunk(game, CHUNKS.main); player.x = -199; }
  else if (game.chunk === CHUNKS.main && player.x < -200) { enterChunk(game, CHUNKS.basin); player.x = 199; }
  if (game.chunk === CHUNKS.icy) player.x = Math.min(player.x, 229);
  if (game.chunk === CHUNKS.basin) player.x = Math.max(player.x, -229);
  player.y = Math.max(-169, Math.min(169, player.y));
}

function keyAxis(game) {
  const k = game.keys;
  const x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  const y = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  return { x, y };
}

function updatePlayer(game, dt) {
  const player = game.player;
  let { x, y } = keyAxis(game);
  if (x || y) {
    player.target = null;
    player.pending = null;
  } else if (player.target) {
    const dx = player.target.x - player.x;
    const dy = player.target.y - player.y;
    const distance = Math.hypot(dx, dy);
    const stopAt = player.pending ? REACH - 4 : 2;
    if (distance <= stopAt) {
      player.target = null;
      const pending = player.pending;
      player.pending = null;
      if (pending) pending();
    } else {
      x = dx / distance;
      y = dy / distance;
    }
  }
  const length = Math.hypot(x, y);
  player.walking = length > 0;
  if (!player.walking) return;
  player.x += (x / length) * WALK_SPEED * dt;
  player.y += (y / length) * WALK_SPEED * dt;
  player.direction = 90 - (Math.atan2(y, x) * 180) / Math.PI;
  crossChunks(game);
}

function checkVitals(game) {
  const { o2, co2 } = game.vitals;
  if (o2 < 80) game.cause = 'Hypoxia';
  else if (o2 > 120) game.cause = 'Oxygen Poisoning';
  else if (co2 > 10) game.cause = 'Hypercapnia';
  if (game.cause) game.phase = 'dead';
}

export function step(game) {
  const dt = STEP;
  if (game.toast) {
    game.toast.age += dt;
    if (game.toast.age > 3.5) game.toast = null;
  }
  if (game.phase === 'landing') return updateLanding(game);
  if (game.phase === 'stepping') return updateStepping(game);
  if (game.phase !== 'playing') return undefined;
  game.time += dt;
  game.vitals.o2 -= BREATH_RATE * dt;
  game.vitals.co2 += BREATH_RATE * dt;
  updatePlayer(game, dt);
  updateBuildings(game, dt);
  updateDots(game, dt);
  checkVitals(game);
  return undefined;
}

export function setPointer(game, x, y) {
  game.pointer.x = x;
  game.pointer.y = y;
}

function walkThen(game, x, y, action) {
  const player = game.player;
  if (Math.hypot(x - player.x, y - player.y) <= REACH) {
    player.target = null;
    player.pending = null;
    action();
    return;
  }
  player.target = { x, y };
  player.pending = action;
}

function mine(game, tile) {
  const resource = tile.kind === 'ice' ? 'Ice Chunk' : 'Regolith';
  if (roomFor(game, resource) <= 0) {
    say(game, `You can carry ${CARRY_LIMIT} resources. Drop some in a barrel or a machine.`);
    return;
  }
  tile.kind = 'empty';
  add(game, resource);
  game.milestones.add(resource);
  sound(game, 'destroy');
}

function buildWall(game, tile) {
  if (tile.building) {
    say(game, 'That tile holds a building. Use Place mode to pick it up.');
    return;
  }
  tile.kind = WALL_CYCLE[(WALL_CYCLE.indexOf(tile.kind) + 1) % WALL_CYCLE.length];
  game.wallVersion += 1;
  sound(game, 'place');
}

function buildingIsEmpty(b) {
  if (b.battery != null) return false;
  if (b.water > 0 || b.hopper > 0 || b.output > 0) return false;
  if (b.store && Object.keys(b.store).length > 0) return false;
  if (b.rocket && (b.rocket.capsule || b.rocket.engine || b.rocket.tanks > 0 || b.rocket.propellant > 0)) return false;
  return true;
}

function placeBuilding(game, tile) {
  if (WALL_ARMS[tile.kind]) {
    say(game, 'That tile has a wall. Use Build mode to clear it.');
    return;
  }
  const current = tile.building ? tile.building.type : null;
  if (tile.building) {
    if (!buildingIsEmpty(tile.building)) {
      say(game, `Empty the ${current} before picking it up.`);
      return;
    }
    add(game, current);
    tile.building = null;
  }
  const start = current ? BUILDING_ORDER.indexOf(current) + 1 : 0;
  const next = BUILDING_ORDER.slice(start).find((type) => count(game, type) > 0);
  if (next) {
    add(game, next, -1);
    tile.building = newBuilding(next);
    game.milestones.add(next);
  }
  sound(game, 'place');
}

export function click(game, x, y) {
  if (game.phase === 'stepping') {
    if (game.steppingShrink === 0) {
      game.player.x = x;
      game.player.y = y;
      game.steppingShrink = 10;
    }
    return null;
  }
  if (game.phase !== 'playing') return null;
  const hit = tileAt(x, y);
  const onLander = game.chunk === CHUNKS.main && inside(LANDER_CLICK, x, y);
  if (game.mode === 'play') {
    if (onLander) {
      return new Promise((resolve) => walkThen(game, 0, 15, () => resolve({ kind: 'fabricator' })));
    }
    if (!hit) return null;
    const tile = currentGrid(game)[hit.j][hit.i];
    const center = tileCenter(hit.i, hit.j);
    if (tile.building) {
      return new Promise((resolve) => walkThen(game, center.x, center.y, () => resolve({ kind: 'building', building: tile.building })));
    }
    if (tile.kind === 'ice' || tile.kind === 'deposit') {
      walkThen(game, center.x, center.y, () => mine(game, tile));
      return null;
    }
    game.player.target = { x, y };
    game.player.pending = null;
    return null;
  }
  if (!hit) return null;
  if (game.chunk !== CHUNKS.main) {
    say(game, 'Build at the base, where you landed.');
    return null;
  }
  if (underLander(hit.i, hit.j)) return null;
  const tile = game.main[hit.j][hit.i];
  if (game.mode === 'build') buildWall(game, tile);
  else placeBuilding(game, tile);
  return null;
}

export function insertBattery(game, b) {
  const batteries = game.inventory.batteries;
  if (b.battery != null || batteries.length === 0) return;
  const pick = b.type === 'Solar Panel' ? Math.min(...batteries) : Math.max(...batteries);
  batteries.splice(batteries.indexOf(pick), 1);
  b.battery = pick;
  sound(game, 'beep');
}

export function takeBattery(game, b) {
  if (b.battery == null) return;
  game.inventory.batteries.push(b.battery);
  b.battery = null;
  sound(game, 'beep');
}

export function setAirLevel(game, b, change) {
  b.level = Math.max(0, Math.min(MAX_AIR_LEVEL, b.level + change));
  sound(game, 'beep');
}

export function fillAirWater(game, b) {
  const amount = Math.min(count(game, 'Water'), AIR_WATER_CAPACITY - b.water);
  if (amount <= 0) return;
  add(game, 'Water', -amount);
  b.water += amount;
  sound(game, 'place');
}

export function loadHopper(game, b) {
  const spec = BUILDINGS[b.type].process;
  const amount = Math.min(count(game, spec.input), HOPPER_CAPACITY - b.hopper);
  if (amount <= 0) return;
  add(game, spec.input, -amount);
  b.hopper += amount;
  sound(game, 'place');
}

export function collectOutput(game, b) {
  const spec = BUILDINGS[b.type].process;
  const amount = Math.min(b.output, roomFor(game, spec.output));
  if (amount <= 0) {
    if (b.output > 0) say(game, `You can carry ${CARRY_LIMIT} resources.`);
    return;
  }
  b.output -= amount;
  add(game, spec.output, amount);
  game.milestones.add(spec.output);
  sound(game, 'place');
}

export function storedTotal(b) {
  return Object.values(b.store).reduce((sum, n) => sum + n, 0);
}

export function storeInBarrel(game, b, name) {
  const amount = Math.min(count(game, name), BARREL_CAPACITY - storedTotal(b));
  if (amount <= 0) return;
  add(game, name, -amount);
  b.store[name] = (b.store[name] || 0) + amount;
  sound(game, 'place');
}

export function takeFromBarrel(game, b, name) {
  const amount = Math.min(b.store[name] || 0, roomFor(game, name));
  if (amount <= 0) {
    say(game, `You can carry ${CARRY_LIMIT} resources.`);
    return;
  }
  b.store[name] -= amount;
  if (b.store[name] === 0) delete b.store[name];
  add(game, name, amount);
  sound(game, 'place');
}

export function canAfford(game, recipe) {
  return Object.entries(recipe.cost).every(([name, n]) => count(game, name) >= n);
}

export function craft(game, recipe) {
  if (!canAfford(game, recipe)) return;
  for (const [name, n] of Object.entries(recipe.cost)) add(game, name, -n);
  if (recipe.item === 'Battery') game.inventory.batteries.push(0);
  else add(game, recipe.item);
  game.milestones.add(recipe.item);
  sound(game, 'place');
}

export function installPart(game, pad, part) {
  const rocket = pad.rocket;
  if (count(game, part) <= 0) return;
  if (part === 'Capsule' && rocket.capsule) return;
  if (part === 'Engine' && rocket.engine) return;
  if (part === 'Tank' && rocket.tanks >= MAX_TANKS) return;
  add(game, part, -1);
  if (part === 'Capsule') rocket.capsule = true;
  if (part === 'Engine') rocket.engine = true;
  if (part === 'Tank') rocket.tanks += 1;
  sound(game, 'place');
}

export function removePart(game, pad, part) {
  const rocket = pad.rocket;
  if (part === 'Capsule' && rocket.capsule) rocket.capsule = false;
  else if (part === 'Engine' && rocket.engine) rocket.engine = false;
  else if (part === 'Tank' && rocket.tanks > 0 && rocket.propellant <= propellantCapacity({ tanks: rocket.tanks - 1 })) rocket.tanks -= 1;
  else return;
  add(game, part);
  sound(game, 'place');
}

export function fuelRocket(game, pad) {
  const rocket = pad.rocket;
  const space = Math.floor((propellantCapacity(rocket) - rocket.propellant) / PROPELLANT_UNIT);
  const amount = Math.min(count(game, 'Propellant'), space);
  if (amount <= 0) return;
  add(game, 'Propellant', -amount);
  rocket.propellant += amount * PROPELLANT_UNIT;
  sound(game, 'place');
}

export function drainRocket(game, pad) {
  const rocket = pad.rocket;
  const amount = Math.min(Math.floor(rocket.propellant / PROPELLANT_UNIT), roomFor(game, 'Propellant'));
  if (amount <= 0) return;
  rocket.propellant -= amount * PROPELLANT_UNIT;
  add(game, 'Propellant', amount);
  sound(game, 'place');
}

export function findPad(game) {
  for (const row of game.main) for (const tile of row) if (tile.building && tile.building.type === 'Launch Pad') return tile.building;
  return null;
}
