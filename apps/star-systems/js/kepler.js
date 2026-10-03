const DEG = Math.PI / 180;

export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const DAY_MS = 86400000;

export function daysSinceJ2000(ms) {
  return (ms - J2000_MS) / DAY_MS;
}

function eccentricAnomaly(meanAnomaly, e) {
  let E = e < 0.8 ? meanAnomaly : Math.PI;
  for (let step = 0; step < 12; step += 1) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

export function pointAtEccentricAnomaly(orbit, E) {
  const b = orbit.a * Math.sqrt(1 - orbit.e * orbit.e);
  const along = orbit.a * (Math.cos(E) - orbit.e);
  const across = b * Math.sin(E);
  const w = orbit.periapsisDeg * DEG;
  return {
    x: along * Math.cos(w) - across * Math.sin(w),
    y: along * Math.sin(w) + across * Math.cos(w),
  };
}

export function orbitOffset(orbit, days) {
  const turns = days / orbit.periodDays;
  const meanAnomaly = orbit.meanAnomalyDeg * DEG + 2 * Math.PI * (turns - Math.floor(turns));
  return pointAtEccentricAnomaly(orbit, eccentricAnomaly(meanAnomaly, orbit.e));
}

export function eccentricAnomalyNearest(orbit, offsetX, offsetY) {
  const w = orbit.periapsisDeg * DEG;
  const along = offsetX * Math.cos(w) + offsetY * Math.sin(w) + orbit.a * orbit.e;
  const across = -offsetX * Math.sin(w) + offsetY * Math.cos(w);
  const b = orbit.a * Math.sqrt(1 - orbit.e * orbit.e);
  return Math.atan2(across / b, along / orbit.a);
}

export function positions(system, days) {
  const placed = new Map();
  for (const body of system.bodies) {
    const parent = body.parent ? placed.get(body.parent) : { x: 0, y: 0 };
    const offset = body.orbit ? orbitOffset(body.orbit, days) : { x: 0, y: 0 };
    placed.set(body.name, { x: parent.x + offset.x, y: parent.y + offset.y });
  }
  return placed;
}
