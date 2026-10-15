import { fractalNoise, mix, surfaceFlux } from './noise.js';

function bandedColor(bands, latDeg) {
  for (let i = 1; i < bands.length; i++) {
    if (latDeg <= bands[i][0]) {
      const [l0, c0] = bands[i - 1];
      const [l1, c1] = bands[i];
      const t = (latDeg - l0) / (l1 - l0);
      return mix(c0, c1, t * t * (3 - 2 * t));
    }
  }
  return bands[bands.length - 1][1];
}

const ZONE = [0.87, 0.81, 0.69];
const BELT = [0.5, 0.34, 0.25];
const JUPITER_BANDS = [
  [-90, [0.42, 0.4, 0.38]],
  [-50, [0.55, 0.52, 0.47]],
  [-36, [0.72, 0.66, 0.57]],
  [-30, [0.6, 0.48, 0.38]],
  [-26, ZONE],
  [-21, ZONE],
  [-19, BELT],
  [-13, [0.64, 0.47, 0.35]],
  [-9, BELT],
  [-6, [0.88, 0.82, 0.7]],
  [5, ZONE],
  [8, [0.47, 0.31, 0.23]],
  [17, BELT],
  [20, ZONE],
  [25, [0.82, 0.76, 0.66]],
  [28, [0.62, 0.5, 0.4]],
  [32, [0.78, 0.72, 0.62]],
  [48, [0.58, 0.54, 0.49]],
  [90, [0.42, 0.4, 0.38]],
];

const SATURN_BANDS = [
  [-90, [0.6, 0.62, 0.6]],
  [-55, [0.78, 0.72, 0.58]],
  [-25, [0.9, 0.82, 0.62]],
  [-8, [0.95, 0.88, 0.68]],
  [8, [0.95, 0.88, 0.68]],
  [14, [0.8, 0.68, 0.5]],
  [24, [0.9, 0.82, 0.62]],
  [45, [0.82, 0.76, 0.6]],
  [70, [0.62, 0.66, 0.66]],
  [90, [0.58, 0.62, 0.64]],
];

function globePoint(dx, dy, radius, oblateness) {
  const x = dx / radius;
  const y = dy / (radius * oblateness);
  const r2 = x * x + y * y;
  if (r2 > 1) return null;
  const z = Math.sqrt(1 - r2);
  return { x, y, z, latDeg: (Math.asin(-y) * 180) / Math.PI, lon: Math.atan2(x, z) };
}

function jupiterAt(dx, dy, radius, noise) {
  const p = globePoint(dx, dy, radius, 0.935);
  if (!p) return null;
  const swirl = noise(p.lon * 6 + 40, p.latDeg * 0.35, 5) - 0.5;
  let color = bandedColor(JUPITER_BANDS, p.latDeg + swirl * 3.2);
  const grain = noise(p.lon * 22, p.latDeg * 1.4, 3) - 0.5;
  color = color.map((v) => v * (1 + grain * 0.12));
  const festoon = Math.exp(-(((p.latDeg - 6) / 2.5) ** 2)) * Math.max(0, noise(p.lon * 9, 7, 2) - 0.52) * 3;
  color = mix(color, [0.48, 0.42, 0.42], Math.min(festoon, 0.6));
  const spot = ((p.lon - 0.35) / 0.2) ** 2 + ((p.latDeg + 22) / 5) ** 2;
  if (spot < 1) color = mix(color, [0.78, 0.42, 0.3], (1 - spot) ** 0.6 * 0.85);
  const limb = p.z ** 0.55;
  return color.map((v) => v * limb);
}

const RING_ZONES = [
  [1.24, 1.53, 0.12, [0.7, 0.66, 0.6]],
  [1.53, 1.95, 0.9, [0.95, 0.9, 0.78]],
  [1.95, 2.03, 0.04, [0.6, 0.58, 0.55]],
  [2.03, 2.21, 0.65, [0.85, 0.8, 0.7]],
  [2.21, 2.215, 0.1, [0.7, 0.66, 0.6]],
  [2.215, 2.27, 0.6, [0.82, 0.77, 0.67]],
];

function ringAt(dx, dy, radius, tiltRad) {
  const sinTilt = Math.max(Math.sin(tiltRad), 0.004);
  const r = Math.hypot(dx / radius, dy / (radius * sinTilt));
  for (const [inner, outer, opacity, color] of RING_ZONES) {
    if (r >= inner && r < outer) {
      const radialShade = 0.92 + 0.08 * Math.sin(r * 90);
      return { opacity: Math.min(opacity / Math.max(sinTilt, 0.05) ** 0.15, 0.97), color: color.map((v) => v * radialShade), front: dy > 0 };
    }
  }
  return null;
}

function saturnAt(dx, dy, radius, tiltDeg, noise) {
  const tilt = (tiltDeg * Math.PI) / 180;
  const ring = ringAt(dx, dy, radius, tilt);
  const p = globePoint(dx, dy, radius, 0.9);
  let color = null;
  if (p) {
    const swirl = noise(p.lon * 4, p.latDeg * 0.25, 3) - 0.5;
    color = bandedColor(SATURN_BANDS, p.latDeg + swirl * 2).map((v) => v * p.z ** 0.6);
  }
  if (ring && (ring.front || !p)) {
    const under = color ?? [0, 0, 0];
    return mix(under, ring.color, ring.opacity);
  }
  return color;
}

function marsAt(dx, dy, radius, noise) {
  const p = globePoint(dx, dy, radius, 0.995);
  if (!p) return null;
  const albedo = noise(p.lon * 2.4 + 9, p.latDeg * 0.07 + 3, 5);
  const dark = Math.min(Math.max((albedo - 0.44) * 3.5, 0), 1) * (Math.abs(p.latDeg) < 55 ? 1 : 0.3);
  let color = mix([0.86, 0.5, 0.3], [0.42, 0.28, 0.22], dark * 0.8);
  const cap = Math.min(Math.max((-p.latDeg - 68) / 4, 0), 1);
  color = mix(color, [0.98, 0.96, 0.94], cap);
  const haze = 0.85 + 0.15 * (1 - p.z) ** 3;
  return color.map((v) => v * (0.55 + 0.45 * p.z ** 0.4) * haze);
}

function venusAt(dx, dy, radius, illuminatedFraction) {
  const p = globePoint(dx, dy, radius, 1);
  if (!p) return null;
  const phaseAngle = Math.acos(2 * illuminatedFraction - 1);
  const sunward = p.x * Math.sin(phaseAngle) + p.z * Math.cos(phaseAngle);
  if (sunward <= 0) return [0, 0, 0];
  const light = sunward ** 0.35 * Math.min(1, sunward * 12);
  return [1, 0.97, 0.88].map((v) => v * light);
}

export const PLANETS = {
  jupiter: { radiusArcsec: 22, whiteSurfaceMag: 5.3, meanSurfaceMag: 5.6 },
  saturn: { radiusArcsec: 9.3, whiteSurfaceMag: 6.4, meanSurfaceMag: 6.8 },
  mars: { radiusArcsec: 9.2, whiteSurfaceMag: 3.7, meanSurfaceMag: 4.4 },
  venus: { radiusArcsec: 19, whiteSurfaceMag: 1.3, meanSurfaceMag: 1.6 },
};

export function paintPlanet(image, n, pixelArcsec, targetId, options) {
  const noise = fractalNoise(targetId.length * 977 + 11);
  const radius = options.radiusArcsec / pixelArcsec;
  const white = surfaceFlux(PLANETS[targetId].whiteSurfaceMag);
  const reach = Math.ceil(radius * 2.4);
  const samples = [-0.25, 0.25];
  for (let y = Math.max(0, n / 2 - reach); y < Math.min(n, n / 2 + reach); y++) {
    for (let x = Math.max(0, n / 2 - reach); x < Math.min(n, n / 2 + reach); x++) {
      const sum = [0, 0, 0];
      for (const sy of samples) {
        for (const sx of samples) {
          const dx = x + sx - n / 2;
          const dy = y + sy - n / 2;
          let color = null;
          if (targetId === 'jupiter') color = jupiterAt(dx, dy, radius, noise);
          else if (targetId === 'saturn') color = saturnAt(dx, dy, radius, options.ringTiltDeg, noise);
          else if (targetId === 'mars') color = marsAt(dx, dy, radius, noise);
          else if (targetId === 'venus') color = venusAt(dx, dy, radius, options.venusPhase);
          if (color) for (let c = 0; c < 3; c++) sum[c] += color[c] / 4;
        }
      }
      for (let c = 0; c < 3; c++) image[c][y * n + x] += sum[c] * white;
    }
  }
}

const DEG = Math.PI / 180;
const JUPITER_SEMIDIAMETER_AT_1_AU = 98.44;
const KM_PER_ARCSEC_AT_1_AU = 725.27;
const GALILEAN = [
  { name: 'Io', mag: 5.0, diameterKm: 3643 },
  { name: 'Europa', mag: 5.3, diameterKm: 3122 },
  { name: 'Ganymede', mag: 4.6, diameterKm: 5268 },
  { name: 'Callisto', mag: 5.6, diameterKm: 4821 },
];

export function jupiterSystem(epochMs) {
  const d = epochMs / 86400000 + 2440587.5 - 2451545.0;
  const v = (172.74 + 0.00111588 * d) * DEG;
  const m = (357.529 + 0.9856003 * d) * DEG;
  const nAnomaly = (20.02 + 0.0830853 * d + 0.329 * Math.sin(v)) * DEG;
  const j = (66.115 + 0.9025179 * d - 0.329 * Math.sin(v)) * DEG;
  const a = (1.915 * Math.sin(m) + 0.02 * Math.sin(2 * m)) * DEG;
  const b = (5.555 * Math.sin(nAnomaly) + 0.168 * Math.sin(2 * nAnomaly)) * DEG;
  const k = j + a - b;
  const earthSun = 1.00014 - 0.01671 * Math.cos(m) - 0.00014 * Math.cos(2 * m);
  const jupiterSun = 5.20872 - 0.25208 * Math.cos(nAnomaly) - 0.00611 * Math.cos(2 * nAnomaly);
  const distanceAu = Math.sqrt(jupiterSun ** 2 + earthSun ** 2 - 2 * jupiterSun * earthSun * Math.cos(k));
  const psi = Math.asin((earthSun / distanceAu) * Math.sin(k));
  const t = d - distanceAu / 173;
  const offset = psi / DEG - b / DEG;
  let u1 = 163.8069 + 203.4058646 * t + offset;
  let u2 = 358.414 + 101.2916335 * t + offset;
  let u3 = 5.7176 + 50.234518 * t + offset;
  let u4 = 224.8092 + 21.48798 * t + offset;
  const g = (331.18 + 50.310482 * t) * DEG;
  const h = (87.45 + 21.569231 * t) * DEG;
  const r1 = 5.9057 - 0.0244 * Math.cos(2 * (u1 - u2) * DEG);
  const r2 = 9.3966 - 0.0882 * Math.cos(2 * (u2 - u3) * DEG);
  const r3 = 14.9883 - 0.0216 * Math.cos(g);
  const r4 = 26.3627 - 0.1939 * Math.cos(h);
  u1 += 0.473 * Math.sin(2 * (u1 - u2) * DEG);
  u2 += 1.065 * Math.sin(2 * (u2 - u3) * DEG);
  u3 += 0.165 * Math.sin(g);
  u4 += 0.843 * Math.sin(h);
  const radiusArcsec = JUPITER_SEMIDIAMETER_AT_1_AU / distanceAu;
  const moons = [[r1, u1], [r2, u2], [r3, u3], [r4, u4]].map(([r, u], i) => ({
    ...GALILEAN[i],
    x: r * Math.sin(u * DEG) * radiusArcsec,
    y: 0,
    radiusArcsec: GALILEAN[i].diameterKm / 2 / (distanceAu * KM_PER_ARCSEC_AT_1_AU),
    mag: GALILEAN[i].mag + 5 * Math.log10((distanceAu * jupiterSun) / (4.2 * 5.2)),
    bv: 0.8,
  }));
  return { radiusArcsec, distanceAu, moons };
}
