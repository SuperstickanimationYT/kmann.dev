import { overlapArea } from './blueprint.js';
import { STAGE_ACTION_ROLES, STANDARD_GRAVITY } from './parts.js';

const EMPTY = 1e-6;
const DETACHING_ROLES = new Set(['separator', 'dockingPort', 'fairing']);
const LOWEST_ENGINE_REACH = 3;
const SPLITTING_ROLES = new Set(['separator', 'dockingPort']);

export function countNames(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => (count > 1 ? `${count} × ${name}` : name)).join(', ');
}

export function simulateFlight(rocket, { useFileStaging, unknownPartMass }) {
  const flight = new Flight(rocket, { useFileStaging, unknownPartMass, efficientEngines: true });
  flight.flyToEnd();
  return flight.result();
}

export function stageDoesSomething(rocket, partIndexes) {
  return partIndexes.some((i) => STAGE_ACTION_ROLES.has(rocket.parts[i].role));
}

export class Flight {
  constructor(rocket, { useFileStaging, unknownPartMass, efficientEngines }) {
    this.rocket = rocket;
    this.parts = rocket.parts;
    this.useFileStaging = useFileStaging;
    this.efficientEngines = efficientEngines;
    this.dryMass = this.parts.map((p) => (p.known ? p.dryMass : unknownPartMass[p.name] ?? 0));
    this.fuel = this.parts.map((p) => p.fuel);
    this.alive = new Set(this.parts.map((p) => p.index));
    this.engineOn = new Set(this.parts.filter((p) => p.role === 'engine' && p.engineStartsOn).map((p) => p.index));
    this.droppedAt = this.parts.map(() => null);
    this.timeline = [];
    this.burnCount = 0;
    this.plan = null;
    this.liftoffThrust = null;
    this.playerStages = rocket.stages
      .map((partIndexes, n) => ({ number: n + 1, partIndexes }))
      .filter((stage) => stageDoesSomething(rocket, stage.partIndexes));
    this.nextStage = 0;
    this.fairingsAttached = true;
    this.workedOutStageNumber = 2;
    this.pruneToRocket();
    this.launchMass = this.mass();

    if (!useFileStaging) {
      this.igniteOpenEngines();
      if (this.engineOn.size === 0) this.igniteLowestEngines();
    }
    this.logStage('Liftoff', [...this.engineOn], [], []);
    this.afterStaging();
  }

  label(i) {
    return this.parts[i].label ?? this.parts[i].name;
  }

  labels(indexes) {
    return countNames(indexes.map((i) => this.label(i)));
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
    if (indexes.length) this.plan = null;
  }

  setEngine(engine, on) {
    if (on) this.engineOn.add(engine);
    else this.engineOn.delete(engine);
    this.plan = null;
  }

  tankGroups() {
    const groupOf = new Map();
    const tanks = new Set([...this.alive].filter((i) => this.parts[i].role === 'tank'));
    for (const tank of tanks) {
      if (groupOf.has(tank)) continue;
      const members = [...this.reach(tank, tanks)];
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
    if (this.parts[engine].drawsFromAllTanks) {
      for (const group of groupOf.values()) groups.add(group);
    } else {
      for (const j of this.rocket.links[engine]) {
        if (groupOf.has(j)) groups.add(groupOf.get(j));
      }
    }
    return [...groups].filter((g) => this.fuelIn(g) > EMPTY);
  }

  currentPlan() {
    if (this.plan !== null) return this.plan;
    const groupOf = this.tankGroups();
    const engines = [...this.engineOn].filter((e) => this.alive.has(e) && this.feedsOf(e, groupOf).length > 0);
    if (engines.length === 0) {
      this.plan = undefined;
      return undefined;
    }
    const drains = new Map();
    let thrust = 0;
    let flow = 0;
    for (const e of engines) {
      const { thrust: t, isp } = this.parts[e];
      const feeds = this.feedsOf(e, groupOf);
      for (const g of feeds) drains.set(g, (drains.get(g) ?? 0) + t / isp / feeds.length);
      thrust += t;
      flow += t / isp;
    }
    const boxes = [...this.alive].map((i) => this.parts[i].box);
    const frontalWidth = Math.max(...boxes.map((b) => b.x1)) - Math.min(...boxes.map((b) => b.x0));
    this.plan = { engines, drains: [...drains], thrust, flow, frontalWidth };
    return this.plan;
  }

  burn(maxSeconds) {
    const plan = this.currentPlan();
    if (!plan) return null;
    let seconds = maxSeconds;
    for (const [group, rate] of plan.drains) seconds = Math.min(seconds, this.fuelIn(group) / rate);
    const startMass = this.mass();
    let emptied = false;
    for (const [group, rate] of plan.drains) {
      const groupFuel = this.fuelIn(group);
      const used = Math.min(groupFuel, rate * seconds);
      for (const i of group) this.fuel[i] -= used * (this.fuel[i] / groupFuel);
      if (this.fuelIn(group) < EMPTY) {
        for (const i of group) this.fuel[i] = 0;
        emptied = true;
      }
    }
    const endMass = this.mass();
    const deltaV = endMass < startMass ? STANDARD_GRAVITY * (plan.thrust / plan.flow) * Math.log(startMass / endMass) : 0;
    let starved = [];
    if (emptied) {
      this.plan = null;
      const groupOf = this.tankGroups();
      starved = plan.engines.filter((e) => this.feedsOf(e, groupOf).length === 0);
    }
    return { plan, seconds, startMass, endMass, deltaV, starved };
  }

  burnSegment() {
    const segment = this.burn(Infinity);
    if (!segment) return null;
    this.timeline.push({
      kind: 'burn',
      burn: this.burnCount,
      engines: this.labels(segment.plan.engines),
      thrust: segment.plan.thrust,
      startMass: segment.startMass,
      endMass: segment.endMass,
      seconds: segment.seconds,
      deltaV: segment.deltaV,
      burnedOut: this.labels(segment.starved),
    });
    this.burnCount++;
    return segment;
  }

  logStage(title, ignited, shutDown, lost) {
    if (!ignited.length && !shutDown.length && !lost.length) return false;
    this.timeline.push({
      kind: 'stage',
      title,
      ignited: this.labels(ignited),
      shutDown: this.labels(shutDown),
      droppedMass: lost.reduce((sum, i) => sum + this.dryMass[i] + this.fuel[i], 0),
      droppedCount: lost.length,
      droppedFuel: lost.reduce((sum, i) => sum + this.fuel[i], 0),
    });
    return true;
  }

  afterStaging() {
    if (this.liftoffThrust === null && this.currentPlan()) this.liftoffThrust = this.plan.thrust;
    if (this.efficientEngines) this.useMostEfficientEngines();
  }

  switchToSpaceEngines() {
    this.efficientEngines = true;
    this.useMostEfficientEngines();
  }

  useMostEfficientEngines() {
    const plan = this.currentPlan();
    if (!plan) return;
    const groupOf = this.tankGroups();
    const feeds = new Map(plan.engines.map((e) => [e, new Set(this.feedsOf(e, groupOf))]));
    const outclassed = plan.engines.filter((e) => plan.engines.some(
      (other) => this.parts[other].isp > this.parts[e].isp && [...feeds.get(e)].some((g) => feeds.get(other).has(g)),
    ));
    for (const e of outclassed) this.setEngine(e, false);
    this.logStage('In space, only the most efficient engines fire', [], outclassed, []);
  }

  react(segment) {
    const changed = this.useFileStaging ? this.firePlayerStage(segment) : this.stageWhenSpent(segment);
    if (changed) this.afterStaging();
    return changed;
  }

  firePlayerStage(segment) {
    if (segment && segment.starved.length === 0) return false;
    if (this.nextStage >= this.playerStages.length) return false;
    const { number, partIndexes } = this.playerStages[this.nextStage++];
    const ignited = [];
    const shutDown = [];
    const detached = [];
    for (const i of partIndexes) {
      if (!this.alive.has(i)) continue;
      const { role } = this.parts[i];
      if (role === 'engine') {
        const on = !this.engineOn.has(i);
        this.setEngine(i, on);
        (on ? ignited : shutDown).push(i);
      } else if (DETACHING_ROLES.has(role)) {
        detached.push(i);
      }
    }
    this.dropParts(detached);
    const lost = [...detached, ...this.pruneToRocket()];
    this.logStage(`Stage ${number}`, ignited, shutDown, lost);
    return true;
  }

  stageWhenSpent(segment) {
    const lost = [];
    if (segment && this.fairingsAttached) {
      lost.push(...this.dropFairings());
      this.fairingsAttached = false;
    }
    lost.push(...this.dropSpentPieces());
    let ignited = this.igniteOpenEngines();
    if (!segment && lost.length === 0 && ignited.length === 0) ignited = this.igniteOpenEngines(Infinity);
    const changed = this.logStage(`Stage ${this.workedOutStageNumber}`, ignited, [], lost);
    if (changed) this.workedOutStageNumber++;
    return changed;
  }

  flyToEnd() {
    let deltaV = 0;
    while (true) {
      const segment = this.burnSegment();
      if (segment) deltaV += segment.deltaV;
      const changed = this.react(segment);
      if (!segment && !changed) break;
    }
    this.dropTrailingStages();
    return deltaV;
  }

  isCovered(engine) {
    const nozzle = this.parts[engine].nozzleBox;
    for (const i of this.alive) {
      if (i === engine || this.parts[i].role === 'engine') continue;
      if (overlapArea(nozzle, this.parts[i].box) > 0.01) return true;
    }
    return false;
  }

  igniteOpenEngines(reach = LOWEST_ENGINE_REACH) {
    const ignited = [];
    const bottom = Math.min(...[...this.alive].map((i) => this.parts[i].box.y0));
    for (const i of this.alive) {
      const part = this.parts[i];
      const nearBottom = part.box.y0 <= bottom + reach;
      if (part.role === 'engine' && nearBottom && !this.engineOn.has(i) && !this.isCovered(i)) {
        this.setEngine(i, true);
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
    for (const i of ignited) this.setEngine(i, true);
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
    const separators = new Set([...this.alive].filter((i) => SPLITTING_ROLES.has(this.parts[i].role)));
    const body = new Set([...this.alive].filter((i) => !separators.has(i)));
    const pieceOf = new Map();
    for (const i of body) {
      if (pieceOf.has(i)) continue;
      const piece = { parts: this.reach(i, body), children: [], linkSeparators: [] };
      for (const member of piece.parts) pieceOf.set(member, piece);
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

  result() {
    const burns = this.timeline.filter((entry) => entry.kind === 'burn');
    const leftoverFuel = [...this.alive].reduce((sum, i) => sum + this.fuel[i], 0);
    const unknown = countNames(this.parts.filter((p) => !p.known).map((p) => p.name));
    return {
      usedFileStaging: this.useFileStaging,
      timeline: this.timeline,
      totalDeltaV: burns.reduce((sum, b) => sum + b.deltaV, 0),
      launchMass: this.launchMass,
      liftoffThrust: this.liftoffThrust ?? 0,
      finalMass: this.mass(),
      leftoverFuel,
      droppedAt: this.droppedAt,
      burnCount: this.burnCount,
      unknown,
    };
  }
}
