import { overlapArea } from './blueprint.js';
import { STAGE_ACTION_ROLES, STANDARD_GRAVITY } from './parts.js';

const EMPTY = 1e-6;
const DETACHING_ROLES = new Set(['separator', 'dockingPort', 'fairing']);

export const shortName = (name) => name.replace(/^Engine /, '');

export function countNames(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${count} × ${name}` : name)).join(', ');
}

export function simulateFlight(rocket, { useFileStaging, unknownPartMass }) {
  const flight = new Flight(rocket, unknownPartMass);
  if (useFileStaging) flight.flyPlayerStaging();
  else flight.flyWorkedOutStaging();
  return flight.result(useFileStaging);
}

export function stageDoesSomething(rocket, partIndexes) {
  return partIndexes.some((i) => STAGE_ACTION_ROLES.has(rocket.parts[i].role));
}

class Flight {
  constructor(rocket, unknownPartMass) {
    this.rocket = rocket;
    this.parts = rocket.parts;
    this.dryMass = this.parts.map((p) => (p.known ? p.dryMass : unknownPartMass[p.name] ?? 0));
    this.fuel = this.parts.map((p) => p.fuel);
    this.alive = new Set(this.parts.map((p) => p.index));
    this.engineOn = new Set(this.parts.filter((p) => p.role === 'engine' && p.engineStartsOn).map((p) => p.index));
    this.droppedAt = this.parts.map(() => null);
    this.timeline = [];
    this.burnCount = 0;
    this.pruneToRocket();
    this.launchMass = this.mass();
  }

  frontalWidth() {
    const boxes = [...this.alive].map((i) => this.parts[i].box);
    return Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
  }

  mass() {
    let total = 0;
    for (const i of this.alive) total += this.dryMass[i] + this.fuel[i];
    return total;
  }

  rootPart() {
    const alive = [...this.alive];
    const control = alive.find((i) => this.parts[i].role === 'control');
    if (control !== undefined) return control;
    return alive.reduce((top, i) => (this.parts[i].box.y1 > this.parts[top].box.y1 ? i : top), alive[0]);
  }

  reach(start, allowed) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const i = queue.pop();
      for (const j of this.rocket.links[i]) {
        if (allowed.has(j) && !seen.has(j)) {
          seen.add(j);
          queue.push(j);
        }
      }
    }
    return seen;
  }

  pruneToRocket() {
    if (this.alive.size === 0) return [];
    const kept = this.reach(this.rootPart(), this.alive);
    const lost = [...this.alive].filter((i) => !kept.has(i));
    this.dropParts(lost);
    return lost;
  }

  dropParts(indexes) {
    for (const i of indexes) {
      this.alive.delete(i);
      this.engineOn.delete(i);
      this.droppedAt[i] = this.burnCount;
    }
  }

  tankGroups() {
    const groupOf = new Map();
    const tanks = new Set([...this.alive].filter((i) => this.parts[i].role === 'tank'));
    for (const tank of tanks) {
      if (groupOf.has(tank)) continue;
      const members = this.reach(tank, tanks);
      for (const member of members) groupOf.set(member, members);
    }
    return groupOf;
  }

  fuelIn(group) {
    let total = 0;
    for (const i of group) total += this.fuel[i];
    return total;
  }

  feedsOf(engine, groupOf) {
    const groups = new Set();
    for (const j of this.rocket.links[engine]) {
      if (groupOf.has(j)) groups.add(groupOf.get(j));
    }
    return [...groups].filter((g) => this.fuelIn(g) > EMPTY);
  }

  burningEngines(groupOf) {
    return [...this.engineOn].filter((e) => this.alive.has(e) && this.feedsOf(e, groupOf).length > 0);
  }

  burnSegment() {
    const groupOf = this.tankGroups();
    const engines = this.burningEngines(groupOf);
    if (engines.length === 0) return null;

    const drain = new Map();
    let thrust = 0;
    let flow = 0;
    for (const e of engines) {
      const { thrust: t, isp } = this.parts[e];
      const feeds = this.feedsOf(e, groupOf);
      for (const g of feeds) drain.set(g, (drain.get(g) ?? 0) + t / isp / feeds.length);
      thrust += t;
      flow += t / isp;
    }
    let seconds = Infinity;
    for (const [group, rate] of drain) seconds = Math.min(seconds, this.fuelIn(group) / rate);

    const startMass = this.mass();
    const frontalWidth = this.frontalWidth();
    for (const [group, rate] of drain) {
      const groupFuel = this.fuelIn(group);
      const used = Math.min(groupFuel, rate * seconds);
      for (const i of group) this.fuel[i] -= used * (this.fuel[i] / groupFuel);
      if (this.fuelIn(group) < EMPTY) for (const i of group) this.fuel[i] = 0;
    }
    const endMass = this.mass();
    const deltaV = STANDARD_GRAVITY * (thrust / flow) * Math.log(startMass / endMass);

    const afterGroups = this.tankGroups();
    const starved = engines.filter((e) => this.feedsOf(e, afterGroups).length === 0);
    this.timeline.push({
      kind: 'burn',
      burn: this.burnCount,
      engines: countNames(engines.map((e) => shortName(this.parts[e].name))),
      thrust,
      startMass,
      endMass,
      seconds,
      deltaV,
      frontalWidth,
      burnedOut: countNames(starved.map((e) => shortName(this.parts[e].name))),
    });
    this.burnCount++;
    return { starved };
  }

  logStage(title, ignited, shutDown, lost) {
    if (!ignited.length && !shutDown.length && !lost.length) return false;
    this.timeline.push({
      kind: 'stage',
      title,
      ignited: countNames(ignited.map((e) => shortName(this.parts[e].name))),
      shutDown: countNames(shutDown.map((e) => shortName(this.parts[e].name))),
      droppedMass: lost.reduce((sum, i) => sum + this.dryMass[i] + this.fuel[i], 0),
      droppedCount: lost.length,
      droppedFuel: lost.reduce((sum, i) => sum + this.fuel[i], 0),
    });
    return true;
  }

  activate(stageNumber, partIndexes) {
    const ignited = [];
    const shutDown = [];
    const detached = [];
    for (const i of partIndexes) {
      if (!this.alive.has(i)) continue;
      const { role } = this.parts[i];
      if (role === 'engine') {
        if (this.engineOn.has(i)) {
          this.engineOn.delete(i);
          shutDown.push(i);
        } else {
          this.engineOn.add(i);
          ignited.push(i);
        }
      } else if (DETACHING_ROLES.has(role)) {
        detached.push(i);
      }
    }
    this.dropParts(detached);
    const lost = [...detached, ...this.pruneToRocket()];
    this.logStage(`Stage ${stageNumber}`, ignited, shutDown, lost);
  }

  flyPlayerStaging() {
    const stages = this.rocket.stages
      .map((partIndexes, n) => ({ number: n + 1, partIndexes }))
      .filter((stage) => stageDoesSomething(this.rocket, stage.partIndexes));
    let next = 0;
    while (true) {
      const segment = this.burnSegment();
      if (segment && segment.starved.length === 0) continue;
      if (next >= stages.length) {
        if (segment) continue;
        break;
      }
      const stage = stages[next++];
      this.activate(stage.number, stage.partIndexes);
    }
  }

  isCovered(engine) {
    const nozzle = this.parts[engine].nozzleBox;
    for (const i of this.alive) {
      if (i === engine || this.parts[i].role === 'engine') continue;
      if (overlapArea(nozzle, this.parts[i].box) > 0.01) return true;
    }
    return false;
  }

  igniteOpenEngines() {
    const ignited = [];
    for (const i of this.alive) {
      if (this.parts[i].role === 'engine' && !this.engineOn.has(i) && !this.isCovered(i)) {
        this.engineOn.add(i);
        ignited.push(i);
      }
    }
    return ignited;
  }

  igniteLowestEngines() {
    const engines = [...this.alive].filter((i) => this.parts[i].role === 'engine');
    if (engines.length === 0) return [];
    const lowest = Math.min(...engines.map((i) => this.parts[i].box.y0));
    const ignited = engines.filter((i) => this.parts[i].box.y0 <= lowest + 0.5);
    for (const i of ignited) this.engineOn.add(i);
    return ignited;
  }

  dropTrailingStages() {
    while (this.timeline.length && this.timeline[this.timeline.length - 1].kind === 'stage') this.timeline.pop();
  }

  dropFairings() {
    const fairings = [...this.alive].filter((i) => this.parts[i].role === 'fairing');
    this.dropParts(fairings);
    return [...fairings, ...this.pruneToRocket()];
  }

  dropSpentPieces() {
    const separators = new Set([...this.alive].filter((i) => this.parts[i].role === 'separator'));
    const body = new Set([...this.alive].filter((i) => !separators.has(i)));
    const pieceOf = new Map();
    const pieces = [];
    for (const i of body) {
      if (pieceOf.has(i)) continue;
      const piece = { parts: this.reach(i, body), children: [], linkSeparators: [] };
      for (const member of piece.parts) pieceOf.set(member, piece);
      pieces.push(piece);
    }
    const root = pieceOf.get(this.rootPart());
    if (!root) return [];

    const visited = new Set([root]);
    const queue = [root];
    while (queue.length) {
      const parent = queue.shift();
      for (const sep of separators) {
        const touched = new Set(this.rocket.links[sep].filter((j) => pieceOf.has(j)).map((j) => pieceOf.get(j)));
        if (!touched.has(parent)) continue;
        for (const piece of touched) {
          if (piece === parent) continue;
          if (!visited.has(piece)) {
            visited.add(piece);
            parent.children.push(piece);
            queue.push(piece);
          }
          if (parent.children.includes(piece)) piece.linkSeparators.push(sep);
        }
      }
    }

    const spent = (piece) => {
      let fuel = 0;
      let hardware = false;
      const walk = (p) => {
        for (const i of p.parts) {
          fuel += this.fuel[i];
          if (this.parts[i].role === 'tank' || this.parts[i].role === 'engine') hardware = true;
        }
        p.children.forEach(walk);
      };
      walk(piece);
      return hardware && fuel <= EMPTY;
    };

    const fired = [];
    const inspect = (piece) => {
      for (const child of piece.children) {
        if (spent(child)) fired.push(...child.linkSeparators);
        else inspect(child);
      }
    };
    inspect(root);
    if (fired.length === 0) return [];
    this.dropParts(fired);
    return [...fired, ...this.pruneToRocket()];
  }

  flyWorkedOutStaging() {
    const liftoffEngines = this.igniteOpenEngines();
    this.logStage('Liftoff', liftoffEngines.length ? liftoffEngines : this.igniteLowestEngines(), [], []);
    let fairingsAttached = true;
    let stageNumber = 2;
    while (true) {
      const segment = this.burnSegment();
      const lost = [];
      if (segment && fairingsAttached) {
        lost.push(...this.dropFairings());
        fairingsAttached = false;
      }
      lost.push(...this.dropSpentPieces());
      const ignited = this.igniteOpenEngines();
      const changed = this.logStage(`Stage ${stageNumber}`, ignited, [], lost);
      if (changed) stageNumber++;
      if (!segment && !changed) break;
    }
    this.dropTrailingStages();
  }

  result(useFileStaging) {
    const burns = this.timeline.filter((entry) => entry.kind === 'burn');
    const firstBurn = burns[0];
    const leftoverFuel = [...this.alive].reduce((sum, i) => sum + this.fuel[i], 0);
    const unknown = countNames(this.parts.filter((p) => !p.known).map((p) => p.name));
    return {
      usedFileStaging: useFileStaging,
      timeline: this.timeline,
      totalDeltaV: burns.reduce((sum, b) => sum + b.deltaV, 0),
      launchMass: this.launchMass,
      liftoffThrust: firstBurn && firstBurn.burn === 0 ? firstBurn.thrust : 0,
      finalMass: this.mass(),
      leftoverFuel,
      droppedAt: this.droppedAt,
      burnCount: this.burnCount,
      unknown,
    };
  }
}
