import { NutrientField } from './field.js';
import { ancestorGenome, hueDistance, mutate, sticksToChild, upkeepPerMass } from './genome.js';
import { createRandom } from './random.js';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;
export const FIELD_CELL_SIZE = 8;

const GRID_CELL_SIZE = 14;
const SENSE_RADIUS = 14;
const UPWELLINGS = [
  { home: 300, reach: 250, period: 30000, start: 0 },
  { home: 900, reach: 250, period: 47000, start: 2 },
];
const UPWELLING_UPDATE_TICKS = 25;
const SIGHT_GAIN = 4;
const TURN_RANGE = Math.PI / 2;
const FREE_TURN_RATE = 0.2;
const NUTRIENT_PROBE_DISTANCE = 10;
const LIGHT_FALLOFF = 2;
const PHOTOSYNTHESIS_RATE = 0.03;
const BASE_UPKEEP = 0.002;
const SWIM_UPKEEP = 0.008;
const UPTAKE_RATE = 0.02;
const BUILD_COST = 1;
const ENERGY_STORE_PER_MASS = 2;
const BITE_RATE = 0.15;
const ARMOR_DRAG = 0.7;
const ARMOR_BLOCKING = 0.8;
const DIGESTION_EFFICIENCY = 0.6;
const BIOMASS_ENERGY = 0.8;
const MAX_SWIM_SPEED = 1.2;
const DRIFT_SPEED = 0.5;
const MIN_MASS = 0.6;
const STARTING_MASS = 2;
const STARTING_ENERGY = 1;
const MAX_CELLS = 12000;
const KIN_SPARING_DEGREES = 60;
const CALM_TUMBLE_CHANCE = 0.02;
const WORSENING_TUMBLE_CHANCE = 0.2;
const CROWD_SCALE = 4;
const CHANGE_GAIN = 20;
const RHYTHM_GAIN = 2;
const FASTEST_RHYTHM = 0.3;
const STEERING_RANGE = Math.PI / 2;
const VELOCITY_SMOOTHING = 0.05;
const FORWARD_NEIGHBOURS = [[0, 1], [1, -1], [1, 0], [1, 1]];
const MAX_BONDS = 6;
const BOND_UPKEEP = 0.0005;
const BOND_STIFFNESS = 0.5;
const BOND_BREAKING_STRETCH = 3;
const SHARING_RATE = 0.1;

export const radiusOf = (mass) => 1.5 * Math.sqrt(mass);
export const divisionMassOf = (type) => 2 + 10 * type.divisionSize;
export const maxAgeOf = (type) => 800 + 8000 * type.lifespan;

function wrappedDx(from, to) {
  let dx = to.x - from.x;
  if (dx > WORLD_WIDTH / 2) dx -= WORLD_WIDTH;
  else if (dx < -WORLD_WIDTH / 2) dx += WORLD_WIDTH;
  return dx;
}

const DEPTH_LIGHT = Float64Array.from({ length: WORLD_HEIGHT + 1 }, (_, y) => Math.exp((-LIGHT_FALLOFF * y) / WORLD_HEIGHT));

function keepInside(cell) {
  const { radius } = cell;
  cell.x = (cell.x + WORLD_WIDTH) % WORLD_WIDTH;
  cell.y = Math.min(WORLD_HEIGHT - radius, Math.max(radius, cell.y));
}

function becomeType(cell, typeIndex) {
  cell.typeIndex = Math.min(typeIndex, cell.genome.types.length - 1);
  cell.type = cell.genome.types[cell.typeIndex];
  cell.upkeep = BASE_UPKEEP + upkeepPerMass(cell.type) + SWIM_UPKEEP * cell.type.motility ** 2;
  cell.maxAge = maxAgeOf(cell.type);
}

function biteEdge(eater, prey) {
  const sizeAdvantage = Math.min(1, eater.bodySize / prey.bodySize);
  const edge = eater.type.predation * (1 - ARMOR_BLOCKING * prey.type.armor) * sizeAdvantage;
  if (edge <= 0) return 0;
  return hueDistance(eater.genome, prey.genome) < eater.type.kinSparing * KIN_SPARING_DEGREES ? 0 : edge;
}

function angleFrom(anchor, cell) {
  return Math.atan2(cell.y - anchor.y, wrappedDx(anchor, cell));
}

function turnWithBody(cell) {
  if (cell.anchor === null || !cell.bonds.includes(cell.anchor)) {
    cell.anchor = cell.bonds[0] ?? null;
    if (cell.anchor) cell.headingFromAnchor = cell.heading - angleFrom(cell.anchor, cell);
  }
  if (cell.anchor) cell.heading = angleFrom(cell.anchor, cell) + cell.headingFromAnchor;
}

export function bodySpeed(body) {
  let vx = 0;
  let vy = 0;
  for (const cell of body) {
    vx += cell.vx;
    vy += cell.vy;
  }
  return Math.hypot(vx, vy) / body.length;
}

function unbond(a, b) {
  a.bonds.splice(a.bonds.indexOf(b), 1);
  b.bonds.splice(b.bonds.indexOf(a), 1);
}

export class World {
  constructor({ seed, matter, ancestors, light }) {
    this.random = createRandom(seed);
    this.light = light;
    this.tick = 0;
    this.nextId = 1;
    this.field = new NutrientField(WORLD_WIDTH, WORLD_HEIGHT, FIELD_CELL_SIZE, this.upwellingXs());
    this.gridCols = Math.ceil(WORLD_WIDTH / GRID_CELL_SIZE);
    this.gridRows = Math.ceil(WORLD_HEIGHT / GRID_CELL_SIZE);
    this.slotStart = new Int32Array(this.gridCols * this.gridRows + 1);
    this.slotFill = new Int32Array(this.gridCols * this.gridRows);
    this.cellSlot = new Int32Array(MAX_CELLS);
    this.order = new Int32Array(MAX_CELLS);
    this.xs = new Float64Array(MAX_CELLS);
    this.ys = new Float64Array(MAX_CELLS);
    this.cells = [];
    for (let i = 0; i < ancestors; i++) {
      const cell = this.createCell(this.random() * WORLD_WIDTH, this.random() * WORLD_HEIGHT, STARTING_MASS, STARTING_ENERGY, ancestorGenome(), 0, 0);
      cell.heading = this.random.between(-Math.PI, Math.PI);
      this.cells.push(cell);
    }
    this.field.fill(Math.max(0, matter - ancestors * STARTING_MASS));
    this.meanDensity = matter / this.field.values.length;
  }

  createCell(x, y, mass, energy, genome, typeIndex, generation) {
    const cell = { id: this.nextId++, x, y, mass, radius: radiusOf(mass), energy, genome, typeIndex: 0, type: null, upkeep: 0, maxAge: 0, generation, bonds: [], heading: 0, anchor: null, headingFromAnchor: 0, swimAngle: 0, vx: 0, vy: 0, bodySize: 1, bodyStamp: 0, signal: 0, nextSignal: 0, turn: 0, threatX: 0, threatY: 0, preyX: 0, preyY: 0, phase: 0, lastSensed: 0, age: 0, nearby: 0, pushX: 0, pushY: 0, dead: false };
    becomeType(cell, typeIndex);
    return cell;
  }

  upwellingXs() {
    return UPWELLINGS.map(({ home, reach, period, start }) => home + reach * Math.sin((2 * Math.PI * this.tick) / period + start));
  }

  lightAt(y) {
    return this.light * DEPTH_LIGHT[Math.min(WORLD_HEIGHT, Math.max(0, Math.round(y)))];
  }

  step() {
    this.tick++;
    if (this.tick % UPWELLING_UPDATE_TICKS === 0) this.field.moveUpwellings(this.upwellingXs());
    this.field.step();
    this.indexCells();
    this.measureBodies();
    this.interact();
    this.pullBonds();
    for (const cell of this.cells) this.live(cell);
    for (const cell of this.cells) cell.signal = cell.nextSignal;
    for (const cell of this.cells) this.move(cell);
    this.divideAndBury();
  }

  indexCells() {
    const { cells, slotStart, slotFill, cellSlot, order, xs, ys } = this;
    slotStart.fill(0);
    for (let i = 0; i < cells.length; i++) {
      const slot = this.gridSlot(cells[i].x, cells[i].y);
      cellSlot[i] = slot;
      slotStart[slot + 1]++;
    }
    for (let slot = 1; slot < slotStart.length; slot++) slotStart[slot] += slotStart[slot - 1];
    slotFill.set(slotStart.subarray(0, slotFill.length));
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const position = slotFill[cellSlot[i]]++;
      order[position] = i;
      xs[position] = cell.x;
      ys[position] = cell.y;
      cell.radius = radiusOf(cell.mass);
      cell.nearby = 0;
      cell.threatX = 0;
      cell.threatY = 0;
      cell.preyX = 0;
      cell.preyY = 0;
    }
  }

  measureBodies() {
    const stamp = this.tick;
    const members = [];
    for (const cell of this.cells) {
      if (cell.bodyStamp === stamp) continue;
      members.length = 0;
      members.push(cell);
      cell.bodyStamp = stamp;
      for (let i = 0; i < members.length; i++) {
        for (const partner of members[i].bonds) {
          if (partner.bodyStamp === stamp) continue;
          partner.bodyStamp = stamp;
          members.push(partner);
        }
      }
      for (const member of members) member.bodySize = members.length;
    }
  }

  gridSlot(x, y) {
    const col = Math.min(this.gridCols - 1, Math.max(0, Math.floor(x / GRID_CELL_SIZE)));
    const row = Math.min(this.gridRows - 1, Math.max(0, Math.floor(y / GRID_CELL_SIZE)));
    return row * this.gridCols + col;
  }

  interact() {
    const { gridCols, gridRows, slotStart } = this;
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridCols; col++) {
        const slot = row * gridCols + col;
        const end = slotStart[slot + 1];
        for (let p = slotStart[slot]; p < end; p++) {
          for (let q = p + 1; q < end; q++) this.check(p, q);
          for (const [rowStep, colStep] of FORWARD_NEIGHBOURS) {
            const neighbourRow = row + rowStep;
            if (neighbourRow >= gridRows) continue;
            const neighbour = neighbourRow * gridCols + ((col + colStep + gridCols) % gridCols);
            const neighbourEnd = slotStart[neighbour + 1];
            for (let q = slotStart[neighbour]; q < neighbourEnd; q++) this.check(p, q);
          }
        }
      }
    }
  }

  check(p, q) {
    const { xs, ys } = this;
    let dx = xs[q] - xs[p];
    if (dx > WORLD_WIDTH / 2) dx -= WORLD_WIDTH;
    else if (dx < -WORLD_WIDTH / 2) dx += WORLD_WIDTH;
    const dy = ys[q] - ys[p];
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > SENSE_RADIUS * SENSE_RADIUS) return;
    this.meet(this.cells[this.order[p]], this.cells[this.order[q]], dx, dy, Math.sqrt(distanceSquared) || 0.001);
  }

  meet(a, b, dx, dy, distance) {
    a.nearby++;
    b.nearby++;
    const nx = dx / distance;
    const ny = dy / distance;
    const bonded = a.bonds.includes(b);
    if (!bonded) {
      const closeness = 1 - distance / SENSE_RADIUS;
      const aThreatensB = biteEdge(a, b) * closeness;
      const bThreatensA = biteEdge(b, a) * closeness;
      a.threatX += nx * bThreatensA;
      a.threatY += ny * bThreatensA;
      a.preyX += nx * aThreatensB;
      a.preyY += ny * aThreatensB;
      b.threatX -= nx * aThreatensB;
      b.threatY -= ny * aThreatensB;
      b.preyX -= nx * bThreatensA;
      b.preyY -= ny * bThreatensA;
    }
    const overlap = a.radius + b.radius - distance;
    if (overlap <= 0) return;
    const share = b.mass / (a.mass + b.mass);
    a.pushX -= nx * overlap * share;
    a.pushY -= ny * overlap * share;
    b.pushX += nx * overlap * (1 - share);
    b.pushY += ny * overlap * (1 - share);
    if (bonded) return;
    this.bite(a, b);
    this.bite(b, a);
  }

  bite(eater, prey) {
    const edge = biteEdge(eater, prey);
    if (edge <= 0 || prey.mass <= 0) return;
    const taken = Math.min(prey.mass, BITE_RATE * edge);
    const energyTaken = Math.max(0, prey.energy) * (taken / prey.mass);
    prey.mass -= taken;
    prey.energy -= energyTaken;
    eater.mass += taken * DIGESTION_EFFICIENCY;
    eater.energy += energyTaken + taken * BIOMASS_ENERGY;
    this.field.add(prey.x, prey.y, taken * (1 - DIGESTION_EFFICIENCY));
  }

  pullBonds() {
    for (const a of this.cells) {
      for (const b of a.bonds) {
        if (b.id < a.id) continue;
        const dx = wrappedDx(a, b);
        const dy = b.y - a.y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const rest = a.radius + b.radius;
        if (distance > rest * BOND_BREAKING_STRETCH) {
          unbond(a, b);
          continue;
        }
        const share = b.mass / (a.mass + b.mass);
        const pull = (BOND_STIFFNESS * (distance - rest)) / distance;
        a.pushX += dx * pull * share;
        a.pushY += dy * pull * share;
        b.pushX -= dx * pull * (1 - share);
        b.pushY -= dy * pull * (1 - share);
        this.shareEnergy(a, b);
      }
    }
  }

  shareEnergy(a, b) {
    const openness = (a.type.sharing + b.type.sharing) / 2;
    const flow = SHARING_RATE * openness * (a.energy / a.mass - b.energy / b.mass) * Math.min(a.mass, b.mass) * 0.5;
    a.energy -= flow;
    b.energy += flow;
  }

  live(cell) {
    const { type } = cell;
    const light = this.lightAt(cell.y);
    cell.energy += PHOTOSYNTHESIS_RATE * type.photosynthesis * light * cell.mass;
    cell.energy -= cell.mass * cell.upkeep + BOND_UPKEEP * cell.bonds.length;
    const density = this.field.densityAt(cell.x, cell.y);
    const affordable = Math.max(0, cell.energy) / BUILD_COST;
    const absorbed = this.field.take(cell.x, cell.y, Math.min(UPTAKE_RATE * type.absorption * density, affordable));
    cell.mass += absorbed;
    cell.energy = Math.min(cell.energy - absorbed * BUILD_COST, cell.mass * ENERGY_STORE_PER_MASS);
    cell.age++;
    cell.dead = cell.energy <= 0 || cell.mass < MIN_MASS || cell.age > cell.maxAge;
    turnWithBody(cell);
    this.think(cell, light, density);
    if (type.motility > 0) this.steer(cell);
  }

  think(cell, light, density) {
    const { type } = cell;
    const threat = Math.sqrt(cell.threatX * cell.threatX + cell.threatY * cell.threatY);
    const prey = Math.sqrt(cell.preyX * cell.preyX + cell.preyY * cell.preyY);
    const sensed =
      type.lightSense * light +
      (type.foodSense * density) / this.meanDensity +
      (type.cellSense * cell.nearby) / CROWD_SCALE +
      SIGHT_GAIN * (type.threatSense * threat + type.preySense * prey);
    const change = (sensed - cell.lastSensed) * CHANGE_GAIN;
    cell.lastSensed = sensed;
    let heard = 0;
    for (const partner of cell.bonds) heard += partner.signal;
    if (cell.bonds.length > 0) heard /= cell.bonds.length;
    cell.phase += FASTEST_RHYTHM * type.rhythmSpeed;
    cell.nextSignal = Math.tanh(type.signalBias + sensed + type.changeSense * change + type.neighbourSense * heard * 2 + type.rhythm * RHYTHM_GAIN * Math.sin(cell.phase));
    const rightX = -Math.sin(cell.heading);
    const rightY = Math.cos(cell.heading);
    const threatToRight = rightX * cell.threatX + rightY * cell.threatY;
    const preyToRight = rightX * cell.preyX + rightY * cell.preyY;
    const probeX = rightX * NUTRIENT_PROBE_DISTANCE;
    const probeY = rightY * NUTRIENT_PROBE_DISTANCE;
    const richerToRight = (this.field.densityAt(cell.x + probeX, cell.y + probeY) - this.field.densityAt(cell.x - probeX, cell.y - probeY)) / this.meanDensity;
    cell.turn = Math.tanh(SIGHT_GAIN * (type.chasing * preyToRight - type.dodging * threatToRight) + type.foraging * richerToRight);
  }

  steer(cell) {
    if (cell.bonds.length === 0) {
      const tumbleChance = CALM_TUMBLE_CHANCE + ((WORSENING_TUMBLE_CHANCE - CALM_TUMBLE_CHANCE) * (1 - cell.signal)) / 2;
      cell.heading += this.random() < tumbleChance ? this.random.between(-Math.PI, Math.PI) : (this.random() - 0.5) * 0.5;
      cell.heading += cell.turn * FREE_TURN_RATE;
    }
    cell.swimAngle = cell.heading + cell.type.thrustAngle + cell.type.steering * cell.signal * STEERING_RANGE + cell.turn * TURN_RANGE;
  }

  move(cell) {
    const speed = (MAX_SWIM_SPEED * cell.type.motility * (1 - ARMOR_DRAG * cell.type.armor) * (1 + cell.signal)) / 2;
    const startX = cell.x;
    const startY = cell.y;
    cell.x += Math.cos(cell.swimAngle) * speed + cell.pushX + (this.random() - 0.5) * DRIFT_SPEED;
    cell.y += Math.sin(cell.swimAngle) * speed + cell.pushY + (this.random() - 0.5) * DRIFT_SPEED;
    cell.pushX = 0;
    cell.pushY = 0;
    keepInside(cell);
    cell.vx += (wrappedDx({ x: startX }, cell) - cell.vx) * VELOCITY_SMOOTHING;
    cell.vy += (cell.y - startY - cell.vy) * VELOCITY_SMOOTHING;
  }

  divideAndBury() {
    const survivors = [];
    for (const cell of this.cells) {
      if (cell.dead) {
        this.field.add(cell.x, cell.y, Math.max(0, cell.mass));
        for (const partner of [...cell.bonds]) unbond(cell, partner);
        continue;
      }
      survivors.push(cell);
      if (cell.mass >= divisionMassOf(cell.type) && survivors.length < MAX_CELLS) survivors.push(this.divide(cell));
    }
    this.cells = survivors;
  }

  divide(parent) {
    const rule = parent.type;
    const staysAttached = sticksToChild(rule) && parent.bonds.length < MAX_BONDS;
    parent.mass /= 2;
    parent.energy /= 2;
    parent.radius = radiusOf(parent.mass);
    const angle = staysAttached ? parent.heading + rule.splitAngle : this.random.between(-Math.PI, Math.PI);
    const offset = radiusOf(parent.mass);
    const genome = staysAttached ? parent.genome : mutate(parent.genome, this.random);
    const childType = Math.min(rule.childType, genome.types.length - 1);
    const child = this.createCell(parent.x + Math.cos(angle) * offset, parent.y + Math.sin(angle) * offset, parent.mass, parent.energy, genome, childType, staysAttached ? parent.generation : parent.generation + 1);
    child.heading = staysAttached ? parent.heading : angle;
    child.swimAngle = child.heading;
    child.signal = parent.signal;
    child.phase = parent.phase;
    becomeType(parent, rule.parentBecomes);
    if (staysAttached) {
      parent.bonds.push(child);
      child.bonds.push(parent);
    } else {
      parent.heading = angle + Math.PI;
    }
    parent.x -= Math.cos(angle) * offset;
    parent.y -= Math.sin(angle) * offset;
    keepInside(parent);
    keepInside(child);
    return child;
  }

  totalMatter() {
    let total = this.field.total();
    for (const cell of this.cells) total += cell.mass;
    return total;
  }

  cellAt(x, y, reach) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const cell of this.cells) {
      const distance = Math.hypot(cell.x - x, cell.y - y) - radiusOf(cell.mass);
      if (distance < nearestDistance) {
        nearest = cell;
        nearestDistance = distance;
      }
    }
    return nearestDistance < reach ? nearest : null;
  }

  bodies() {
    const seen = new Set();
    const bodies = [];
    for (const cell of this.cells) {
      if (seen.has(cell)) continue;
      const body = this.bodyOf(cell);
      for (const member of body) seen.add(member);
      bodies.push(body);
    }
    return bodies;
  }

  fastestBody(fewestCells) {
    let fastest = null;
    let fastestSpeed = 0;
    for (const body of this.bodies()) {
      if (body.length < fewestCells) continue;
      const speed = bodySpeed(body);
      if (speed > fastestSpeed) {
        fastest = body;
        fastestSpeed = speed;
      }
    }
    return fastest && { body: fastest, speed: fastestSpeed };
  }

  bodyOf(cell) {
    const body = new Set([cell]);
    for (const member of body) for (const partner of member.bonds) body.add(partner);
    return [...body];
  }

  findCell(id) {
    return this.cells.find((cell) => cell.id === id) ?? null;
  }
}
