import { bodyById, childrenOf, density, gravitationalParameter, hasSurface } from './system.js';
import { apoapsis, periapsis, mutualInclination, orbitalPeriod } from './orbits.js';
import { distance, significant } from './units.js';

const FLUID_ROCHE = 2.44;
const GLADMAN_SPACING = 2 * Math.sqrt(3);
const LONG_LIVED_SPACING = 10;
const KOZAI_ANGLE = 39.2;
const ROCKY_J2 = 0.001;
const GIANT_J2 = 0.01;
const RESONANCE_TOLERANCE = 0.01;
const RESONANCES = [[2, 1], [3, 2], [4, 3], [5, 4], [3, 1], [5, 3], [5, 2], [7, 4], [7, 5], [8, 5]];

const fail = (bodies, text) => ({ level: 'fail', bodies, text });
const warn = (bodies, text) => ({ level: 'warn', bodies, text });
const info = (bodies, text) => ({ level: 'info', bodies, text });

const LEVEL_ORDER = { fail: 0, warn: 1, info: 2 };

function rocheLimit(parent, body) {
  return FLUID_ROCHE * parent.radiusM * Math.cbrt(density(parent) / density(body));
}

function checkAgainstParent(system, body) {
  const parent = bodyById(system, body.parent);
  const closest = periapsis(body.orbit);
  if (body.orbit.e >= 1) return [fail([body.id], `${body.name} is on an escape path, not an orbit.`)];
  if (closest < parent.radiusM + body.radiusM) {
    return [fail([body.id], `${body.name} hits ${parent.name} at its closest approach.`)];
  }
  const roche = rocheLimit(parent, body);
  if (closest < roche) {
    return [fail([body.id], `${body.name} comes within ${parent.name}'s Roche limit (${distance(roche)}), so tides would tear it apart.`)];
  }
  return [];
}

function laplaceRadius(host, star) {
  const oblateness = hasSurface(host) ? ROCKY_J2 : GIANT_J2;
  const hostOrbit = host.orbit;
  return Math.pow(
    oblateness * host.radiusM ** 2 * hostOrbit.a ** 3 * (1 - hostOrbit.e ** 2) ** 1.5 * (host.massKg / star.massKg),
    1 / 5,
  );
}

function domingosLimit(hostOrbit, hostHill, orbit, retrograde) {
  if (retrograde) return 0.9309 * hostHill * (1 - 1.0764 * hostOrbit.e - 0.9812 * orbit.e);
  return 0.4895 * hostHill * (1 - 1.0305 * hostOrbit.e - 0.2738 * orbit.e);
}

function checkAgainstGrandparent(system, body) {
  const host = bodyById(system, body.parent);
  if (!host.parent) return [];
  const star = bodyById(system, host.parent);
  const findings = [];
  const tilt = mutualInclination(body.orbit, host.orbit);
  const hostHill = host.orbit.a * Math.cbrt(host.massKg / (3 * star.massKg));
  const limit = domingosLimit(host.orbit, hostHill, body.orbit, tilt > 90);
  if (body.orbit.a > limit) {
    findings.push(fail([body.id], `${body.name} orbits too far from ${host.name}: ${star.name} would pull it away. The limit for this orbit is ${distance(Math.max(limit, 0))}.`));
  }
  if (tilt > KOZAI_ANGLE && tilt < 180 - KOZAI_ANGLE && body.orbit.a > laplaceRadius(host, star)) {
    findings.push(warn([body.id], `${body.name}'s orbit is tilted ${Math.round(tilt)}° from ${host.name}'s. ${star.name} will swing its eccentricity up and down (Kozai–Lidov cycles), which can crash it into ${host.name}.`));
  }
  return findings;
}

function mutualHillRadius(parent, inner, outer) {
  return Math.cbrt((inner.massKg + outer.massKg) / (3 * parent.massKg)) * (inner.orbit.a + outer.orbit.a) / 2;
}

function nearResonance(system, inner, outer) {
  const ratio = orbitalPeriod(outer.orbit.a, gravitationalParameter(system, outer)) / orbitalPeriod(inner.orbit.a, gravitationalParameter(system, inner));
  return RESONANCES.find(([p, q]) => Math.abs(ratio / (p / q) - 1) < RESONANCE_TOLERANCE);
}

function checkSiblings(system, parent) {
  const siblings = childrenOf(system, parent.id);
  const findings = [];
  for (let index = 0; index < siblings.length; index += 1) {
    for (let later = index + 1; later < siblings.length; later += 1) {
      const inner = siblings[index];
      const outer = siblings[later];
      if (periapsis(outer.orbit) >= apoapsis(inner.orbit)) continue;
      const pair = [inner.id, outer.id];
      const resonance = nearResonance(system, inner, outer);
      if (resonance) {
        findings.push(warn(pair, `${inner.name} and ${outer.name} have crossing orbits. Bodies near a ${resonance[0]}:${resonance[1]} resonance can cross orbits and still never meet; a simulation tells.`));
      } else {
        findings.push(fail(pair, `${inner.name} and ${outer.name} have crossing orbits.`));
      }
    }
  }
  const pairs = siblings.slice(1).map((outer, index) => {
    const inner = siblings[index];
    const separated = periapsis(outer.orbit) >= apoapsis(inner.orbit);
    const spacing = (outer.orbit.a - inner.orbit.a) / mutualHillRadius(parent, inner, outer);
    return { inner, outer, separated, spacing, resonance: nearResonance(system, inner, outer) };
  });
  const crowded = (pair) => pair && pair.separated && pair.spacing < LONG_LIVED_SPACING;
  pairs.forEach((pair, index) => {
    if (!pair.separated) return;
    const { inner, outer, spacing, resonance } = pair;
    const ids = [inner.id, outer.id];
    const spacingText = `${significant(spacing, 2)} mutual Hill radii apart`;
    if (spacing < GLADMAN_SPACING) {
      findings.push(fail(ids, `${inner.name} and ${outer.name} are ${spacingText}. Under ${significant(GLADMAN_SPACING, 2)} they will have close encounters.`));
    } else if (crowded(pair) && (crowded(pairs[index - 1]) || crowded(pairs[index + 1]))) {
      findings.push(warn(ids, `${inner.name} and ${outer.name} are ${spacingText}, in a row of tightly packed orbits. Rows spaced under ${LONG_LIVED_SPACING} usually go unstable within a few billion years, unless resonances protect them.`));
    }
    if (resonance) {
      findings.push(info(ids, `${inner.name} and ${outer.name} are near a ${resonance[0]}:${resonance[1]} resonance. That can protect or destabilise them; a simulation tells which.`));
    }
  });
  return findings;
}

function checkNames(system) {
  const seen = new Map();
  const findings = [];
  for (const body of system.bodies) {
    const name = body.name.trim();
    if (!name) findings.push(fail([body.id], 'A body has no name.'));
    else if (seen.has(name)) findings.push(fail([seen.get(name), body.id], `Two bodies are named ${name}. Games need unique names.`));
    else seen.set(name, body.id);
  }
  return findings;
}

export function checkSystem(system) {
  const findings = [...checkNames(system)];
  for (const body of system.bodies) {
    findings.push(...checkSiblings(system, body));
    if (!body.parent) continue;
    findings.push(...checkAgainstParent(system, body), ...checkAgainstGrandparent(system, body));
  }
  return findings.sort((first, second) => LEVEL_ORDER[first.level] - LEVEL_ORDER[second.level]);
}

export function worstLevelByBody(findings) {
  const worst = new Map();
  for (const finding of findings) {
    for (const id of finding.bodies) {
      const current = worst.get(id);
      if (!current || LEVEL_ORDER[finding.level] < LEVEL_ORDER[current]) worst.set(id, finding.level);
    }
  }
  return worst;
}
