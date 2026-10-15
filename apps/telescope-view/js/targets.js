import { seededRandom } from './optics.js';

export const TARGETS = {
  jupiter: { name: 'Jupiter', kind: 'planet', extentArcsec: 46, apparentBrightness: 1 },
  saturn: { name: 'Saturn', kind: 'planet', extentArcsec: 44, apparentBrightness: 0.55 },
  mars: { name: 'Mars (near opposition)', kind: 'planet', extentArcsec: 20, apparentBrightness: 1.3 },
  venus: { name: 'Venus (crescent)', kind: 'planet', extentArcsec: 40, apparentBrightness: 6 },
  albireo: {
    name: 'Albireo (gold and blue double)',
    kind: 'stars',
    extentArcsec: 44,
    stars: [
      { x: -14, y: 10, mag: 3.1, bv: 1.13 },
      { x: 14, y: -10, mag: 4.7, bv: -0.1 },
    ],
  },
  epsilonLyrae: {
    name: 'ε¹ Lyrae (half of the Double Double)',
    kind: 'stars',
    extentArcsec: 8,
    stars: [
      { x: 0.2, y: -1.1, mag: 5.0, bv: 0.16 },
      { x: -0.2, y: 1.1, mag: 6.1, bv: 0.2 },
    ],
  },
  testDouble: { name: 'Test double (pick the gap)', kind: 'stars', extentArcsec: 8, adjustableSeparation: true },
  vega: { name: 'Vega (bright white star)', kind: 'stars', extentArcsec: 8, stars: [{ x: 0, y: 0, mag: 0.03, bv: 0 }] },
};

export function starsFor(targetId, separationArcsec) {
  const target = TARGETS[targetId];
  if (!target.adjustableSeparation) return target.stars;
  return [
    { x: -separationArcsec / 2, y: 0, mag: 6, bv: 0.3 },
    { x: separationArcsec / 2, y: 0, mag: 6, bv: 0.3 },
  ];
}

export function extentArcsec(targetId, separationArcsec) {
  const target = TARGETS[targetId];
  return target.adjustableSeparation ? Math.max(8, separationArcsec * 2.5) : target.extentArcsec;
}

const STAR_COLORS = [
  [-0.3, [0.55, 0.68, 1]],
  [0, [0.78, 0.86, 1]],
  [0.6, [1, 0.94, 0.84]],
  [1.1, [1, 0.74, 0.46]],
  [1.6, [1, 0.58, 0.3]],
];

function starColor(bv) {
  for (let i = 1; i < STAR_COLORS.length; i++) {
    const [b1, c1] = STAR_COLORS[i];
    const [b0, c0] = STAR_COLORS[i - 1];
    if (bv <= b1 || i === STAR_COLORS.length - 1) {
      const t = Math.min(Math.max((bv - b0) / (b1 - b0), 0), 1);
      const color = c0.map((v, k) => v + (c1[k] - v) * t);
      const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
      return color.map((v) => v / luminance);
    }
  }
  return [1, 1, 1];
}

const STAR_FLUX_AT_MAG_4_IN_100MM = 18;

function depositStars(image, n, pixelArcsec, stars, apertureMm) {
  for (const star of stars) {
    const flux = STAR_FLUX_AT_MAG_4_IN_100MM * 10 ** (-0.4 * (star.mag - 4)) * (apertureMm / 100) ** 2;
    const color = starColor(star.bv);
    const gx = n / 2 + star.x / pixelArcsec;
    const gy = n / 2 - star.y / pixelArcsec;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const corners = [
      [x0, y0, (1 - fx) * (1 - fy)],
      [x0 + 1, y0, fx * (1 - fy)],
      [x0, y0 + 1, (1 - fx) * fy],
      [x0 + 1, y0 + 1, fx * fy],
    ];
    for (const [x, y, weight] of corners) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      for (let c = 0; c < 3; c++) image[c][y * n + x] += flux * weight * color[c];
    }
  }
}

function valueNoise(seed) {
  const random = seededRandom(seed);
  const size = 256;
  const table = new Float64Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = random();
  const smooth = (t) => t * t * (3 - 2 * t);
  const at = (x, y) => table[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
  return (x, y, octaves = 4) => {
    let sum = 0;
    let amplitude = 0.5;
    let frequency = 1;
    for (let o = 0; o < octaves; o++) {
      sum += amplitude * noise(x * frequency, y * frequency);
      amplitude *= 0.5;
      frequency *= 2.03;
    }
    return sum;
  };
}

function mix(a, b, t) {
  return a.map((v, k) => v + (b[k] - v) * t);
}

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

const PLANET_RADII_ARCSEC = { jupiter: 22, saturn: 9.3, mars: 9.2, venus: 19 };

function paintPlanet(image, n, pixelArcsec, targetId, options) {
  const noise = valueNoise(targetId.length * 977 + 11);
  const radius = PLANET_RADII_ARCSEC[targetId] / pixelArcsec;
  const surface = TARGETS[targetId].apparentBrightness;
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
      for (let c = 0; c < 3; c++) image[c][y * n + x] = sum[c] * surface;
    }
  }
}

export function buildSource({ targetId, n, pixelArcsec, apertureMm, separationArcsec, ringTiltDeg, venusPhase }) {
  const image = [new Float64Array(n * n), new Float64Array(n * n), new Float64Array(n * n)];
  if (TARGETS[targetId].kind === 'planet') paintPlanet(image, n, pixelArcsec, targetId, { ringTiltDeg, venusPhase });
  else depositStars(image, n, pixelArcsec, starsFor(targetId, separationArcsec), apertureMm);
  return image;
}
