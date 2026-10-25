const DEG = Math.PI / 180;
const TURN = 2 * Math.PI;

export const orbitalPeriod = (a, mu) => TURN * Math.sqrt(a ** 3 / mu);

export const periapsis = (orbit) => orbit.a * (1 - orbit.e);

export const apoapsis = (orbit) => orbit.a * (1 + orbit.e);

export const isRetrograde = (orbit) => orbit.i > 90;

function eccentricAnomaly(meanAnomaly, e) {
  let E = e < 0.8 ? meanAnomaly : Math.PI;
  for (let step = 0; step < 16; step += 1) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

function perifocalToReference(orbit, along, across) {
  const node = orbit.node * DEG;
  const peri = orbit.peri * DEG;
  const tilt = orbit.i * DEG;
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const cosPeri = Math.cos(peri);
  const sinPeri = Math.sin(peri);
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  return {
    x: (cosNode * cosPeri - sinNode * sinPeri * cosTilt) * along + (-cosNode * sinPeri - sinNode * cosPeri * cosTilt) * across,
    y: (sinNode * cosPeri + cosNode * sinPeri * cosTilt) * along + (-sinNode * sinPeri + cosNode * cosPeri * cosTilt) * across,
    z: sinPeri * sinTilt * along + cosPeri * sinTilt * across,
  };
}

function pointAtEccentricAnomaly(orbit, E) {
  const semiMinor = orbit.a * Math.sqrt(1 - orbit.e * orbit.e);
  return perifocalToReference(orbit, orbit.a * (Math.cos(E) - orbit.e), semiMinor * Math.sin(E));
}

export function offsetAt(orbit, mu, seconds) {
  const turns = seconds / orbitalPeriod(orbit.a, mu);
  const meanAnomaly = orbit.meanAnomaly * DEG + TURN * (turns - Math.floor(turns));
  return pointAtEccentricAnomaly(orbit, eccentricAnomaly(meanAnomaly, orbit.e));
}

export function orbitPath(orbit, segments = 240) {
  const points = [];
  for (let step = 0; step <= segments; step += 1) {
    points.push(pointAtEccentricAnomaly(orbit, (TURN * step) / segments));
  }
  return points;
}

function orbitNormal(orbit) {
  const node = orbit.node * DEG;
  const tilt = orbit.i * DEG;
  return { x: Math.sin(tilt) * Math.sin(node), y: -Math.sin(tilt) * Math.cos(node), z: Math.cos(tilt) };
}

export function mutualInclination(first, second) {
  const a = orbitNormal(first);
  const b = orbitNormal(second);
  const cosine = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(cosine) / DEG;
}

const wrapDegrees = (degrees) => ((degrees % 360) + 360) % 360;

export function flattenedOrbit(orbit) {
  const retrograde = isRetrograde(orbit);
  return {
    argumentOfPeriapsis: wrapDegrees(retrograde ? orbit.node - orbit.peri : orbit.node + orbit.peri),
    direction: retrograde ? -1 : 1,
  };
}
