import { DEEP_SKY } from './deepsky.js';
import { MOON_RADIUS_ARCSEC, moonAdaptationFlux, paintMoon } from './moon.js';
import { gaussian, seededRandom, surfaceFlux } from './noise.js';
import { PLANETS, jupiterSystem, paintPlanet } from './planets.js';

const DOUBLES = {
  albireo: {
    name: 'Albireo (gold and blue double)',
    fieldDensity: 4,
    stars: [
      { x: -14, y: 10, mag: 3.1, bv: 1.13 },
      { x: 14, y: -10, mag: 4.7, bv: -0.1 },
    ],
  },
  epsilonLyrae: {
    name: 'ε¹ Lyrae (half of the Double Double)',
    fieldDensity: 2.5,
    stars: [
      { x: 0.2, y: -1.1, mag: 5.0, bv: 0.16 },
      { x: -0.2, y: 1.1, mag: 6.1, bv: 0.2 },
      { x: -95, y: -185, mag: 5.2, bv: 0.08 },
      { x: -97, y: -187.4, mag: 5.5, bv: 0.08 },
    ],
  },
  testDouble: { name: 'Test double (pick the gap)', fieldDensity: 1 },
  vega: { name: 'Vega (bright white star)', fieldDensity: 2.5, stars: [{ x: 0, y: 0, mag: 0.03, bv: 0 }] },
};

const PLANET_NAMES = {
  jupiter: 'Jupiter and its moons',
  saturn: 'Saturn',
  mars: 'Mars (near opposition)',
  venus: 'Venus (crescent)',
};

export const TARGET_GROUPS = [
  ['Moon and planets', ['moon', ...Object.keys(PLANET_NAMES)]],
  ['Stars', Object.keys(DOUBLES)],
  ['Faint objects', Object.keys(DEEP_SKY)],
];

export const TARGETS = {
  moon: { name: 'The Moon', kind: 'moon', fieldDensity: 1 },
  ...Object.fromEntries(Object.entries(PLANET_NAMES).map(([id, name]) => [id, { name, kind: 'planet', fieldDensity: 1 }])),
  ...Object.fromEntries(Object.entries(DOUBLES).map(([id, entry]) => [id, { ...entry, kind: 'double' }])),
  ...Object.fromEntries(Object.entries(DEEP_SKY).map(([id, entry]) => [id, { ...entry, kind: 'deepsky' }])),
};

export function hasDetailLayer(targetId) {
  return ['planet', 'double'].includes(TARGETS[targetId].kind);
}

function planetRadiusArcsec(settings) {
  return settings.targetId === 'jupiter' ? jupiterSystem(settings.epochMs).radiusArcsec : PLANETS[settings.targetId].radiusArcsec;
}

export function detailExtentArcsec(settings) {
  const target = TARGETS[settings.targetId];
  if (target.kind === 'planet') return planetRadiusArcsec(settings) * (settings.targetId === 'saturn' ? 4.8 : 2.15);
  if (settings.targetId === 'testDouble') return Math.max(8, settings.separationArcsec * 2.5);
  if (settings.targetId === 'albireo') return 44;
  return 8;
}

export function adaptationFlux(settings, skyFluxLuminance) {
  const target = TARGETS[settings.targetId];
  if (target.kind === 'planet') return surfaceFlux(PLANETS[settings.targetId].meanSurfaceMag);
  if (target.kind === 'moon') return moonAdaptationFlux(settings.moonAgeDays);
  return target.kind === 'double' ? skyFluxLuminance : null;
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

const MIN_FIELD_SQUARE_ARCSEC = 9000;
const FAINTEST_FIELD_STAR = 16.5;
const fieldStarCache = new Map();

function starsBrighterThanPerSquareDegree(mag) {
  const t = mag - 6;
  return 10 ** (-0.92 + 0.43 * t - 0.004 * t * t);
}

function fieldStars(targetId, viewArcsec) {
  const square = Math.max(MIN_FIELD_SQUARE_ARCSEC, Math.ceil(viewArcsec / 3600) * 3600);
  const key = `${targetId}:${square}`;
  if (fieldStarCache.has(key)) return fieldStarCache.get(key);
  const random = seededRandom([...targetId].reduce((sum, ch) => sum * 31 + ch.charCodeAt(0), 7));
  const squareDegrees = (square / 3600) ** 2;
  const total = Math.round(starsBrighterThanPerSquareDegree(FAINTEST_FIELD_STAR) * squareDegrees * TARGETS[targetId].fieldDensity);
  const stars = [];
  for (let i = 0; i < total; i++) {
    const wanted = starsBrighterThanPerSquareDegree(FAINTEST_FIELD_STAR) * random();
    let low = 1;
    let high = FAINTEST_FIELD_STAR;
    for (let step = 0; step < 24; step++) {
      const mid = (low + high) / 2;
      if (starsBrighterThanPerSquareDegree(mid) < wanted) low = mid;
      else high = mid;
    }
    const x = (random() - 0.5) * square;
    const y = (random() - 0.5) * square;
    if (low < 8 && Math.hypot(x, y) < 300) continue;
    stars.push({ x, y, mag: low, bv: Math.min(Math.max(0.65 + 0.4 * gaussian(random), -0.2), 1.8) });
  }
  fieldStarCache.set(key, stars);
  return stars;
}

const deepSkyCache = new Map();

function deepSkyObject(targetId) {
  if (!deepSkyCache.has(targetId)) deepSkyCache.set(targetId, DEEP_SKY[targetId].build());
  return deepSkyCache.get(targetId);
}

function targetStars(settings) {
  const target = TARGETS[settings.targetId];
  if (settings.targetId === 'testDouble') {
    return [
      { x: -settings.separationArcsec / 2, y: 0, mag: 6, bv: 0.3 },
      { x: settings.separationArcsec / 2, y: 0, mag: 6, bv: 0.3 },
    ];
  }
  if (target.kind === 'double') return target.stars;
  if (target.kind === 'deepsky') return deepSkyObject(settings.targetId).stars;
  if (settings.targetId === 'jupiter') return jupiterSystem(settings.epochMs).moons;
  return [];
}

function depositStar(image, n, pixelArcsec, star, pointBoost) {
  const flux = (pointBoost * 10 ** (-0.4 * star.mag)) / pixelArcsec ** 2;
  const color = starColor(star.bv);
  const gx = n / 2 + star.x / pixelArcsec;
  const gy = n / 2 - star.y / pixelArcsec;
  const discRadius = (star.radiusArcsec ?? 0) / pixelArcsec;
  if (discRadius > 0.7) {
    const reach = Math.ceil(discRadius + 1);
    const cells = [];
    for (let y = Math.floor(gy) - reach; y <= Math.floor(gy) + reach; y++) {
      for (let x = Math.floor(gx) - reach; x <= Math.floor(gx) + reach; x++) {
        if (x >= 0 && y >= 0 && x < n && y < n && Math.hypot(x - gx, y - gy) <= discRadius) cells.push(y * n + x);
      }
    }
    for (const index of cells) for (let c = 0; c < 3; c++) image[c][index] += (flux * color[c]) / cells.length;
    return;
  }
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  for (const [x, y, weight] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
    if (x < 0 || y < 0 || x >= n || y >= n) continue;
    for (let c = 0; c < 3; c++) image[c][y * n + x] += flux * weight * color[c];
  }
}

function paintDeepSky(image, n, pixelArcsec, targetId) {
  const object = deepSkyObject(targetId);
  for (let py = 0; py < n; py++) {
    const y = -(py - n / 2) * pixelArcsec;
    for (let px = 0; px < n; px++) {
      const value = object.paint((px - n / 2) * pixelArcsec, y);
      const index = py * n + px;
      image[0][index] += value[0];
      image[1][index] += value[1];
      image[2][index] += value[2];
    }
  }
}

export function buildLayerSource(layer, settings, n, pixelArcsec, pointBoost) {
  const image = [new Float32Array(n * n), new Float32Array(n * n), new Float32Array(n * n)];
  const target = TARGETS[settings.targetId];
  const half = (n / 2) * pixelArcsec;
  const inside = (star) => Math.abs(star.x) < half && Math.abs(star.y) < half;
  const stars = [...fieldStars(settings.targetId, n * pixelArcsec), ...targetStars(settings)];
  for (const star of stars) if (inside(star)) depositStar(image, n, pixelArcsec, star, pointBoost);
  if (target.kind === 'deepsky') paintDeepSky(image, n, pixelArcsec, settings.targetId);
  if (target.kind === 'moon') paintMoon(image, n, pixelArcsec, settings.moonAgeDays);
  if (target.kind === 'planet') {
    paintPlanet(image, n, pixelArcsec, settings.targetId, { ...settings, radiusArcsec: planetRadiusArcsec(settings) });
  }
  return image;
}

export { MOON_RADIUS_ARCSEC };
