import { NutrientField } from './field.js';
import { ancestorGenome, hueDistance, mutate, sticksToChild, upkeepPerMass } from './genome.js';
import { createRandom } from './random.js';

export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;
export const FIELD_CELL_SIZE = 8;

const GRID_CELL_SIZE = 14;
const SENSE_RADIUS = 14;
const UPWELLING_XS = [300, 900];
const LIGHT_FALLOFF = 2;
const PHOTOSYNTHESIS_RATE = 0.03;
const BASE_UPKEEP = 0.002;
const SWIM_UPKEEP = 0.008;
const UPTAKE_RATE = 0.02;
const BUILD_COST = 1;
const ENERGY_STORE_PER_MASS = 2;
const BITE_RATE = 0.06;
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
const MAX_BONDS = 6;
const BOND_UPKEEP = 0.0005;
const BOND_STIFFNESS = 0.3;
const BOND_BREAKING_STRETCH = 2.2;
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

function keepInside(cell) {
  const radius = radiusOf(cell.mass);
  cell.x = (cell.x + WORLD_WIDTH) % WORLD_WIDTH;
  cell.y = Math.min(WORLD_HEIGHT - radius, Math.max(radius, cell.y));
}

function becomeType(cell, typeIndex) {
  cell.typeIndex = Math.min(typeIndex, cell.genome.types.length - 1);
  cell.type = cell.genome.types[cell.typeIndex];
  cell.upkeep = BASE_UPKEEP + upkeepPerMass(cell.type) + SWIM_UPKEEP * cell.type.motility ** 2;
  cell.maxAge = maxAgeOf(cell.type);
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
    this.field = new NutrientField(WORLD_WIDTH, WORLD_HEIGHT, FIELD_CELL_SIZE, UPWELLING_XS);
    this.gridCols = Math.ceil(WORLD_WIDTH / GRID_CELL_SIZE);
    this.gridRows = Math.ceil(WORLD_HEIGHT / GRID_CELL_SIZE);
    this.gridHeads = new Int32Array(this.gridCols * this.gridRows);
    this.gridNext = new Int32Array(MAX_CELLS);
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
    const cell = { id: this.nextId++, x, y, mass, energy, genome, typeIndex: 0, type: null, upkeep: 0, maxAge: 0, generation, bonds: [], heading: 0, age: 0, nearby: 0, lastSignal: 0, pushX: 0, pushY: 0, dead: false };
    becomeType(cell, typeIndex);
    return cell;
  }

  lightAt(y) {
    return this.light * Math.exp((-LIGHT_FALLOFF * y) / WORLD_HEIGHT);
  }

  step() {
    this.tick++;
    this.field.step();
    this.indexCells();
    this.interact();
    this.pullBonds();
    for (const cell of this.cells) this.live(cell);
    for (const cell of this.cells) this.move(cell);
    this.divideAndBury();
  }

  indexCells() {
    this.gridHeads.fill(-1);
    this.cells.forEach((cell, index) => {
      const slot = this.gridSlot(cell.x, cell.y);
      this.gridNext[index] = this.gridHeads[slot];
      this.gridHeads[slot] = index;
      cell.nearby = 0;
    });
  }

  gridSlot(x, y) {
    const col = Math.min(this.gridCols - 1, Math.max(0, Math.floor(x / GRID_CELL_SIZE)));
    const row = Math.min(this.gridRows - 1, Math.max(0, Math.floor(y / GRID_CELL_SIZE)));
    return row * this.gridCols + col;
  }

  interact() {
    const { cells, gridHeads, gridNext, gridCols, gridRows } = this;
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      const col = Math.min(gridCols - 1, Math.floor(a.x / GRID_CELL_SIZE));
      const row = Math.min(gridRows - 1, Math.floor(a.y / GRID_CELL_SIZE));
      for (let rowStep = -1; rowStep <= 1; rowStep++) {
        const neighbourRow = row + rowStep;
        if (neighbourRow < 0 || neighbourRow >= gridRows) continue;
        for (let colStep = -1; colStep <= 1; colStep++) {
          const neighbourCol = (col + colStep + gridCols) % gridCols;
          for (let j = gridHeads[neighbourRow * gridCols + neighbourCol]; j !== -1; j = gridNext[j]) {
            if (j > i) this.meet(a, cells[j]);
          }
        }
      }
    }
  }

  meet(a, b) {
    const dx = wrappedDx(a, b);
    const dy = b.y - a.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > SENSE_RADIUS * SENSE_RADIUS) return;
    const distance = Math.sqrt(distanceSquared) || 0.001;
    a.nearby++;
    b.nearby++;
    const overlap = radiusOf(a.mass) + radiusOf(b.mass) - distance;
    if (overlap <= 0) return;
    const share = b.mass / (a.mass + b.mass);
    const nx = dx / distance;
    const ny = dy / distance;
    a.pushX -= nx * overlap * share;
    a.pushY -= ny * overlap * share;
    b.pushX += nx * overlap * (1 - share);
    b.pushY += ny * overlap * (1 - share);
    if (a.bonds.includes(b)) return;
    this.bite(a, b);
    this.bite(b, a);
  }

  bite(eater, prey) {
    const edge = eater.type.predation - prey.type.armor;
    if (edge <= 0 || prey.mass <= 0) return;
    if (hueDistance(eater.genome, prey.genome) < eater.type.kinSparing * KIN_SPARING_DEGREES) return;
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
        const distance = Math.hypot(dx, dy) || 0.001;
        const rest = radiusOf(a.mass) + radiusOf(b.mass);
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
    if (type.motility > 0) this.steer(cell, light, density);
  }

  steer(cell, light, density) {
    const { type } = cell;
    const signal = type.lightSeeking * light + (type.foodSeeking * density) / this.meanDensity + (type.cellSeeking * cell.nearby) / CROWD_SCALE;
    const tumbleChance = signal >= cell.lastSignal ? CALM_TUMBLE_CHANCE : WORSENING_TUMBLE_CHANCE;
    cell.heading += this.random() < tumbleChance ? this.random.between(-Math.PI, Math.PI) : (this.random() - 0.5) * 0.5;
    cell.lastSignal = signal;
  }

  move(cell) {
    const speed = MAX_SWIM_SPEED * cell.type.motility;
    cell.x += Math.cos(cell.heading) * speed + cell.pushX + (this.random() - 0.5) * DRIFT_SPEED;
    cell.y += Math.sin(cell.heading) * speed + cell.pushY + (this.random() - 0.5) * DRIFT_SPEED;
    cell.pushX = 0;
    cell.pushY = 0;
    keepInside(cell);
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
    const angle = staysAttached ? parent.heading + rule.splitAngle : this.random.between(-Math.PI, Math.PI);
    const offset = radiusOf(parent.mass);
    const genome = staysAttached ? parent.genome : mutate(parent.genome, this.random);
    const childType = Math.min(rule.childType, genome.types.length - 1);
    const child = this.createCell(parent.x + Math.cos(angle) * offset, parent.y + Math.sin(angle) * offset, parent.mass, parent.energy, genome, childType, staysAttached ? parent.generation : parent.generation + 1);
    child.heading = angle;
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

  bodyOf(cell) {
    const body = new Set([cell]);
    for (const member of body) for (const partner of member.bonds) body.add(partner);
    return [...body];
  }

  findCell(id) {
    return this.cells.find((cell) => cell.id === id) ?? null;
  }
}
