import { fractalNoise, gaussian, mix, seededRandom, smoothstep, surfaceFlux } from './noise.js';

const TEAL = [0.32, 1, 0.82];
const HYDROGEN_RED = [1, 0.3, 0.42];
const REFLECTION_BLUE = [0.6, 0.78, 1];
const OLD_STARS = [1, 0.84, 0.64];
const YOUNG_STARS = [0.82, 0.9, 1.1];

function normalized(color) {
  const luminance = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  return color.map((v) => v / luminance);
}

function tinted(color, flux) {
  return normalized(color).map((v) => v * flux);
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function axes(x, y, paDeg) {
  const pa = (paDeg * Math.PI) / 180;
  return { u: -x * Math.sin(pa) + y * Math.cos(pa), v: x * Math.cos(pa) + y * Math.sin(pa) };
}

function lanczosGamma(z) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

function sersic({ totalMag, effectiveRadius, index, axisRatio, paDeg, cx = 0, cy = 0 }) {
  const b = 2 * index - 1 / 3 + 0.009876 / index;
  const area = 2 * Math.PI * index * Math.exp(b) * b ** (-2 * index) * lanczosGamma(2 * index) * effectiveRadius ** 2 * axisRatio;
  const effectiveFlux = 10 ** (-0.4 * totalMag) / area;
  return (x, y) => {
    const { u, v } = axes(x - cx, y - cy, paDeg);
    const r = Math.hypot(u, v / axisRatio) / effectiveRadius;
    return effectiveFlux * Math.exp(-b * (r ** (1 / index) - 1));
  };
}

function ringNebula() {
  const noise = fractalNoise(57);
  return {
    stars: [{ x: 0, y: 0, mag: 15.8, bv: -0.3 }],
    paint(x, y) {
      const { u, v } = axes(x, y, 60);
      const rho = Math.hypot(u / 43, v / 31);
      const mottle = 0.8 + 0.4 * noise(x / 7 + 50, y / 7 + 50, 3);
      const ring = surfaceFlux(17.5) * Math.exp(-(((rho - 0.72) / 0.16) ** 2));
      const inner = surfaceFlux(19.6) * (1 - smoothstep(0.5, 0.75, rho));
      const halo = surfaceFlux(23.2) * Math.exp(-Math.max(rho - 1, 0) / 0.5) * smoothstep(0.75, 1, rho);
      const color = mix(TEAL, HYDROGEN_RED, smoothstep(0.62, 1, rho));
      return tinted(color, (ring + inner + halo) * mottle);
    },
  };
}

function dumbbellNebula() {
  const noise = fractalNoise(27);
  return {
    stars: [{ x: 0, y: 0, mag: 13.8, bv: -0.3 }],
    paint(x, y) {
      const { u, v } = axes(x, y, 125);
      const rho = Math.hypot(u / 240, v / 170);
      const waist = Math.abs(u) / (Math.abs(v) * 0.95 + 45) + (noise(x / 35, y / 35, 3) - 0.5) * 0.5;
      const lobes = surfaceFlux(18.4) * Math.exp(-((waist / 0.75) ** 2)) * (1 - smoothstep(0.5, 0.95, rho));
      const fill = surfaceFlux(20.7) * (1 - smoothstep(0.8, 1.05, rho));
      const halo = surfaceFlux(23.5) * (1 - smoothstep(1, 2, rho));
      const mottle = 0.75 + 0.5 * noise(x / 20 + 9, y / 20 - 4, 4);
      const color = mix(TEAL, HYDROGEN_RED, smoothstep(0.55, 1, rho) * 0.8);
      return tinted(color, (lobes + fill + halo) * mottle);
    },
  };
}

function orionNebula() {
  const noise = fractalNoise(42);
  const wisps = fractalNoise(4242);
  return {
    stars: [
      { x: 0, y: 0, mag: 5.1, bv: -0.3 },
      { x: -12.5, y: 3, mag: 6.7, bv: -0.1 },
      { x: -6, y: 9.5, mag: 7.9, bv: -0.1 },
      { x: 9, y: 10, mag: 6.7, bv: -0.2 },
      { x: -60, y: -125, mag: 5.0, bv: -0.2 },
      { x: -30, y: 450, mag: 6.9, bv: 0.0 },
      { x: -130, y: -1980, mag: 2.8, bv: -0.24 },
    ],
    paint(x, y) {
      const core = surfaceFlux(16.4) * Math.exp(-Math.hypot((x - 25) / 1.1, (y + 15) / 1.4) / 60);
      const body = surfaceFlux(19.3) * Math.exp(-Math.hypot(x / 1.4, (y + 160) / 1.5) / 210);
      const archRadius = 680;
      const fromArch = Math.hypot(x, y + archRadius);
      const archAngle = Math.atan2(y + archRadius, Math.abs(x));
      const alongWing = (Math.PI / 2 - archAngle) / 1.9;
      const wingWidth = 110 + 160 * Math.max(alongWing, 0);
      const wings = alongWing < 0 || alongWing > 1 ? 0 : surfaceFlux(19.9 + 2.4 * alongWing) * Math.exp(-(((fromArch - archRadius) / wingWidth) ** 2));
      const fan = surfaceFlux(21.8) * Math.exp(-Math.hypot(x / 1.3, (y + 520) / 1.0) / 520);
      const bayEdge = Math.hypot((x + 120) / 150, (y - 150) / 85) + (wisps(x / 70, y / 70, 3) - 0.5) * 0.8;
      const bay = 1 - 0.7 * (1 - smoothstep(0.7, 1.2, bayEdge));
      const m43 = surfaceFlux(19.8) * Math.exp(-Math.hypot(x + 30, y - 450) / 55) * smoothstep(-40, 10, -(x + 30) + 15);
      const filaments = 0.45 + 1.1 * noise(x / 110, y / 110, 5) ** 1.5 + 0.4 * Math.abs(wisps(x / 260, y / 60, 4) - 0.5);
      const glow = (core + (body + wings + fan) * filaments) * bay + m43;
      const color = mix(HYDROGEN_RED, TEAL, smoothstep(surfaceFlux(21), surfaceFlux(18), glow));
      return tinted(color, glow);
    },
  };
}

const PLEIADES_CENTER = { raHours: 3 + 46 / 60 + 50 / 3600, decDeg: 24 + 12 / 60 };
const PLEIADES = [
  ['Alcyone', 3, 47, 29.1, 24, 6, 18, 2.87],
  ['Atlas', 3, 49, 9.7, 24, 3, 12, 3.62],
  ['Electra', 3, 44, 52.5, 24, 6, 48, 3.7],
  ['Maia', 3, 45, 49.6, 24, 22, 4, 3.87],
  ['Merope', 3, 46, 19.6, 23, 56, 54, 4.18],
  ['Taygeta', 3, 45, 12.5, 24, 28, 2, 4.3],
  ['Pleione', 3, 49, 11.2, 24, 8, 12, 5.05],
  ['Celaeno', 3, 44, 48.2, 24, 17, 22, 5.45],
  ['Asterope', 3, 45, 54.4, 24, 33, 16, 5.76],
].map(([name, h, m, s, d, dm, ds, mag]) => {
  const ra = h + m / 60 + s / 3600;
  const dec = d + dm / 60 + ds / 3600;
  const cosDec = Math.cos((PLEIADES_CENTER.decDeg * Math.PI) / 180);
  return { name, x: -(ra - PLEIADES_CENTER.raHours) * 15 * cosDec * 3600, y: (dec - PLEIADES_CENTER.decDeg) * 3600, mag, bv: -0.08 };
});

function pleiades() {
  const random = seededRandom(45);
  const members = Array.from({ length: 140 }, () => {
    const mag = 7.2 + random() ** 0.7 * 5.5;
    return { x: gaussian(random) * 1900, y: gaussian(random) * 1700, mag, bv: -0.05 + (mag - 7) * 0.12 };
  });
  const streaks = fractalNoise(4545);
  const lit = PLEIADES.filter((star) => ['Merope', 'Maia', 'Electra', 'Alcyone'].includes(star.name));
  return {
    stars: [...PLEIADES, ...members],
    paint(x, y) {
      let glow = 0;
      for (const star of lit) {
        const peak = star.name === 'Merope' ? 21.2 : 22;
        glow += surfaceFlux(peak) * Math.exp(-Math.hypot(x - star.x, y - star.y) / 420);
      }
      const { u, v } = axes(x, y, 140);
      const striation = 0.35 + 1.3 * streaks(u / 900, v / 120, 4) ** 2;
      return tinted(REFLECTION_BLUE, glow * striation);
    },
  };
}

function hercules() {
  const random = seededRandom(13);
  const coreRadius = 37;
  const tidalRadius = 1500;
  const edge = 1 / Math.sqrt(1 + (tidalRadius / coreRadius) ** 2);
  const king = (r) => (r >= tidalRadius ? 0 : (1 / Math.sqrt(1 + (r / coreRadius) ** 2) - edge) ** 2);
  let integral = 0;
  for (let r = 0.5; r < tidalRadius; r += 1) integral += king(r) * 2 * Math.PI * r;
  let densityPeak = 0;
  for (let r = 0.5; r < tidalRadius; r += 1) densityPeak = Math.max(densityPeak, king(r) * r);
  const sampleRadius = () => {
    for (;;) {
      const r = random() * tidalRadius;
      if (random() * densityPeak < king(r) * r) return r;
    }
  };
  const stars = [];
  let resolvedFlux = 0;
  const count = Math.round(10 ** (2 + 0.45 * (16.6 - 13)));
  for (let i = 0; i < count; i++) {
    const mag = 13 + Math.log10(random() * 10 ** (0.45 * 3.6)) / 0.45;
    if (mag < 11.9) continue;
    const r = sampleRadius();
    const angle = random() * 2 * Math.PI;
    const horizontalBranch = mag > 14.6 && mag < 15.2 && random() < 0.5;
    const bv = horizontalBranch ? 0.05 : mag < 14.5 ? 1.15 + random() * 0.35 : 0.65 + random() * 0.25;
    stars.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), mag, bv });
    resolvedFlux += 10 ** (-0.4 * mag);
  }
  const glowFlux = Math.max(10 ** (-0.4 * 5.8) - resolvedFlux, 0);
  return {
    stars,
    paint(x, y) {
      return tinted([1, 0.88, 0.72], (glowFlux * king(Math.hypot(x, y))) / integral);
    },
  };
}

function andromeda() {
  const noise = fractalNoise(31);
  const bulge = sersic({ totalMag: 4.75, effectiveRadius: 265, index: 2.2, axisRatio: 0.65, paDeg: 38 });
  const diskScale = 1400;
  const diskQ = 0.26;
  const diskFlux = 10 ** (-0.4 * 3.95) / (2 * Math.PI * diskScale ** 2 * diskQ);
  const m32 = sersic({ totalMag: 8.1, effectiveRadius: 30, index: 4, axisRatio: 0.75, paDeg: 170, cx: -250, cy: -1400 });
  const m110 = sersic({ totalMag: 8.1, effectiveRadius: 150, index: 1.5, axisRatio: 0.5, paDeg: 170, cx: 1000, cy: 1950 });
  return {
    stars: [{ x: 0, y: 0, mag: 12.8, bv: 0.9 }],
    paint(x, y) {
      const { u, v } = axes(x, y, 38);
      const r = Math.hypot(u, v / diskQ) / diskScale;
      let disk = diskFlux * Math.exp(-r);
      if (v > 0) {
        const lanes = Math.exp(-(((r - 0.45) / 0.05) ** 2)) + Math.exp(-(((r - 0.78) / 0.06) ** 2));
        disk *= 1 - 0.45 * lanes * smoothstep(0, 120, v) * (0.6 + 0.8 * noise(u / 400, v / 100, 3));
      }
      return add(tinted(OLD_STARS, bulge(x, y) + m32(x, y) + m110(x, y)), tinted([0.95, 0.92, 0.9], disk));
    },
  };
}

function whirlpool() {
  const knots = fractalNoise(51);
  const bulge = sersic({ totalMag: 9.9, effectiveRadius: 25, index: 2, axisRatio: 0.85, paDeg: 163 });
  const companion = sersic({ totalMag: 9.6, effectiveRadius: 35, index: 2.5, axisRatio: 0.8, paDeg: 80, cx: 30, cy: 260 });
  const diskScale = 90;
  const diskFlux = 10 ** (-0.4 * 8.65) / (2 * Math.PI * diskScale ** 2 * 0.85);
  const pitch = Math.tan((18 * Math.PI) / 180);
  return {
    stars: [],
    paint(x, y) {
      const { u, v } = axes(x, y, 163);
      const dv = v / 0.85;
      const r = Math.hypot(u, dv);
      const phase = 2 * Math.atan2(dv, u) - (2 * Math.log(Math.max(r, 5) / 20)) / pitch;
      const arm = ((1 + Math.cos(phase)) / 2) ** 2;
      const clumps = 0.7 + 0.6 * knots(x / 9, y / 9, 3);
      const disk = diskFlux * Math.exp(-r / diskScale) * (0.5 + 1.3 * arm * clumps) * smoothstep(8, 30, r);
      const bridge = surfaceFlux(23.2) * Math.exp(-Math.abs(Math.hypot(x - 10, y - 140) - 140) / 18) * smoothstep(-50, 60, x) * smoothstep(0, 120, y);
      return add(tinted(OLD_STARS, bulge(x, y) + companion(x, y) + bridge), tinted(YOUNG_STARS, disk));
    },
  };
}

export const DEEP_SKY = {
  m45: { name: 'M45 Pleiades (star cluster)', extentArcsec: 7200, fieldDensity: 1, build: pleiades },
  m42: { name: 'M42 Orion Nebula', extentArcsec: 3000, fieldDensity: 1.5, build: orionNebula },
  m13: { name: 'M13 Hercules globular cluster', extentArcsec: 1500, fieldDensity: 0.5, build: hercules },
  m57: { name: 'M57 Ring Nebula', extentArcsec: 200, fieldDensity: 3, build: ringNebula },
  m27: { name: 'M27 Dumbbell Nebula', extentArcsec: 720, fieldDensity: 5, build: dumbbellNebula },
  m31: { name: 'M31 Andromeda Galaxy', extentArcsec: 10800, fieldDensity: 0.8, build: andromeda },
  m51: { name: 'M51 Whirlpool Galaxy', extentArcsec: 900, fieldDensity: 0.25, build: whirlpool },
};
