import { fractalNoise, hash2, smoothstep, surfaceFlux } from './noise.js';

export const MOON_RADIUS_ARCSEC = 932;
const SYNODIC_DAYS = 29.53;
const FULL_MOON_SURFACE_MAG = 3.4;
const WHITE_FLUX = surfaceFlux(FULL_MOON_SURFACE_MAG) / 0.4;
const MARE_ALBEDO = 0.55;
const EARTHSHINE = 2e-4;
const CRATER_CELLS_DEG = [10, 5, 2.5, 1.25, 0.6, 0.3, 0.15, 0.075, 0.0375];
const ARCSEC_PER_DEGREE_OF_SURFACE = (MOON_RADIUS_ARCSEC * Math.PI) / 180;

const MARIA = [
  [33, -16, 17], [28, 17, 10], [18, 24, 6], [8, 30, 13], [2, 25, 8], [17, 59, 7], [-6, 51, 9], [-12, 55, 7],
  [-15, 35, 5], [-20, -17, 10], [-10, -23, 6], [-24, -39, 6], [30, -50, 12], [15, -58, 14], [0, -52, 12],
  [-10, -43, 8], [20, -40, 10], [8, -20, 8], [13, 4, 4], [56, -30, 5], [57, -10, 5], [57, 10, 5], [56, 30, 5],
];

const RAY_CRATERS = [
  { lat: -43.3, lon: -11.2, radius: 0.75, rays: 14, length: 28, strength: 0.55 },
  { lat: 9.6, lon: -20.1, radius: 1.5, rays: 10, length: 14, strength: 0.4 },
  { lat: 8.1, lon: -38, radius: 0.5, rays: 8, length: 9, strength: 0.3 },
  { lat: 23.7, lon: -47.4, radius: 0.35, rays: 6, length: 6, strength: 0.6 },
];

const RAD = Math.PI / 180;

function unitVector(latDeg, lonDeg) {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

const MARE_DISCS = MARIA.map(([lat, lon, radius]) => ({
  radius,
  center: unitVector(lat, lon),
  reachCos: Math.cos((radius * 1.15 + 5) * RAD),
}));

export function moonPhase(ageDays) {
  const elongation = ((ageDays / SYNODIC_DAYS) * 360) % 360;
  const phaseAngle = Math.abs(180 - elongation);
  const litFraction = (1 - Math.cos(elongation * RAD)) / 2;
  const surfaceFactor = 10 ** (-0.4 * (0.026 * phaseAngle + 4e-9 * phaseAngle ** 4)) / Math.max(litFraction, 0.1);
  return { elongation, phaseAngle, litFraction, surfaceFactor };
}

export function moonAdaptationFlux(ageDays) {
  return WHITE_FLUX * 0.8 * 0.45 * moonPhase(ageDays).surfaceFactor;
}

function makeTerrain(minRadiusDeg) {
  const noise = fractalNoise(1969);
  const levels = CRATER_CELLS_DEG.filter((cell) => cell * 0.45 >= minRadiusDeg);
  const mareAt = (lat, lon) => {
    const point = unitVector(lat, lon);
    let wobble = null;
    let mare = 0;
    for (const disc of MARE_DISCS) {
      const cosDistance = point[0] * disc.center[0] + point[1] * disc.center[1] + point[2] * disc.center[2];
      if (cosDistance < disc.reachCos) continue;
      wobble ??= (noise(lon / 9 + 20, lat / 9 + 20, 5) - 0.5) * 12;
      const distance = Math.acos(Math.min(cosDistance, 1)) / RAD;
      mare = Math.max(mare, 1 - smoothstep(disc.radius * 0.75, disc.radius * 1.15, distance + wobble));
    }
    return mare;
  };
  const rayBearings = RAY_CRATERS.map((crater, c) => Array.from({ length: crater.rays }, (_, k) => 2 * Math.PI * hash2(c, k, 99)));
  const rayBrightening = (lat, lon) => {
    let boost = 0;
    RAY_CRATERS.forEach((crater, c) => {
      const dx = (lon - crater.lon) * Math.cos(crater.lat * RAD);
      const dy = lat - crater.lat;
      const distance = Math.hypot(dx, dy);
      if (distance > crater.length * 1.5) return;
      boost += crater.strength * 1.4 * Math.exp(-(((distance / crater.radius) - 1.3) ** 2));
      const bearing = Math.atan2(dy, dx);
      for (const ray of rayBearings[c]) {
        const offset = Math.abs(((bearing - ray + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        const width = (crater.radius * 2.2) / Math.max(distance, crater.radius) + 0.02;
        const streaks = 0.5 + noise(distance * 1.2 + c * 40, ray * 30, 3);
        boost += crater.strength * 0.7 * streaks * Math.exp(-((offset / width) ** 2)) * Math.exp(-distance / crater.length) * smoothstep(crater.radius, crater.radius * 2, distance);
      }
    });
    return boost;
  };
  const bigCraterInMare = new Map();
  const inMare = (level, i, j, cLat, cLon) => {
    const key = `${level}:${i}:${j}`;
    if (!bigCraterInMare.has(key)) bigCraterInMare.set(key, mareAt(cLat, cLon) > 0.5);
    return bigCraterInMare.get(key);
  };
  const slopeAt = (lat, lon, out) => {
    let east = 0;
    let north = 0;
    const cosLat = Math.max(Math.cos(lat * RAD), 0.05);
    for (let level = 0; level < levels.length; level++) {
      const cell = levels[level];
      const ci = Math.floor(lon / cell);
      const cj = Math.floor(lat / cell);
      const fi = lon / cell - ci;
      const fj = lat / cell - cj;
      const wideLon = cosLat < 0.7;
      for (let dj = fj < 0.52 ? -1 : 0; dj <= (fj > 0.48 ? 1 : 0); dj++) {
        for (let di = wideLon || fi < 0.52 ? -1 : 0; di <= (wideLon || fi > 0.48 ? 1 : 0); di++) {
          const i = ci + di;
          const j = cj + dj;
          if (hash2(i, j, level * 7 + 1) > (cell >= 2.5 ? 0.45 : 0.6)) continue;
          const radius = cell * (0.15 + 0.3 * hash2(i, j, level * 7 + 2));
          const cLon = (i + 0.2 + 0.6 * hash2(i, j, level * 7 + 3)) * cell;
          const cLat = (j + 0.2 + 0.6 * hash2(i, j, level * 7 + 4)) * cell;
          const dx = (lon - cLon) * cosLat;
          const dy = lat - cLat;
          const d = Math.hypot(dx, dy) / radius;
          if (d > 1.6 || d < 1e-6) continue;
          if (cell >= 2.5 && inMare(level, i, j, cLat, cLon)) continue;
          const depth = radius * (radius < 0.3 ? 0.2 : 0.11);
          let dhdd = 0.25 * depth * Math.exp(-(((d - 1) / 0.18) ** 2)) * ((-2 * (d - 1)) / 0.18 ** 2);
          if (d < 1) dhdd += 2 * depth * d;
          if (radius > 0.6) dhdd += 0.35 * depth * Math.exp(-((d / 0.14) ** 2)) * ((-2 * d) / 0.14 ** 2);
          const scale = dhdd / (radius * radius * d);
          east += scale * dx;
          north += scale * dy;
        }
      }
    }
    out[0] = east;
    out[1] = north;
  };
  return { mareAt, slopeAt, rayBrightening, noise };
}

export function paintMoon(image, n, pixelArcsec, ageDays) {
  const { elongation, surfaceFactor, litFraction } = moonPhase(ageDays);
  const sun = [Math.sin(elongation * RAD), 0, -Math.cos(elongation * RAD)];
  const pixelDeg = pixelArcsec / ARCSEC_PER_DEGREE_OF_SURFACE;
  const terrain = makeTerrain(pixelDeg * 0.6);
  const slope = [0, 0];
  const radiusPx = MOON_RADIUS_ARCSEC / pixelArcsec;
  const tint = [1.02, 0.99, 0.95];
  for (let py = 0; py < n; py++) {
    const y = -(py - n / 2) / radiusPx;
    if (Math.abs(y) > 1) continue;
    for (let px = 0; px < n; px++) {
      const x = (px - n / 2) / radiusPx;
      const r2 = x * x + y * y;
      if (r2 > 1) continue;
      const z = Math.sqrt(1 - r2);
      const lat = Math.asin(y) / RAD;
      const lon = Math.atan2(x, z) / RAD;
      const mare = terrain.mareAt(lat, lon);
      const speckle = 0.85 + 0.3 * terrain.noise(lon * 1.5, lat * 1.5, 5);
      const albedo = ((1 - mare * (1 - MARE_ALBEDO)) * speckle) * (1 + terrain.rayBrightening(lat, lon));
      terrain.slopeAt(lat, lon, slope);
      const limbCalm = smoothstep(0.1, 0.6, z);
      const slopeEast = slope[0] * limbCalm;
      const slopeNorth = slope[1] * limbCalm;
      const lonR = lon * RAD;
      const latR = lat * RAD;
      const east = [Math.cos(lonR), 0, -Math.sin(lonR)];
      const north = [-Math.sin(latR) * Math.sin(lonR), Math.cos(latR), -Math.sin(latR) * Math.cos(lonR)];
      const normal = [x, y, z].map((v, k) => v - slopeEast * east[k] - slopeNorth * north[k]);
      const length = Math.hypot(...normal);
      const mu0 = (normal[0] * sun[0] + normal[1] * sun[1] + normal[2] * sun[2]) / length;
      const mu = Math.max(normal[2] / length, 0.02);
      const sphereMu0 = x * sun[0] + z * sun[2];
      const lit = mu0 > 0 && sphereMu0 > -0.03 ? (mu0 / (mu0 + mu)) * surfaceFactor : 0;
      const flux = WHITE_FLUX * albedo * (lit + EARTHSHINE * (1 - litFraction) ** 3);
      for (let c = 0; c < 3; c++) image[c][py * n + px] += flux * tint[c];
    }
  }
}
