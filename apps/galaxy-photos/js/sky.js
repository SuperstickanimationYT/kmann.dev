import { createRandom } from './random.js';
import { galaxyExtent, projectToFrame } from './galaxy.js';

const ASPECT = 4 / 3;
const MOST_FIELD_STARS = 260;
const MOST_BACKGROUND_GALAXIES = 900;
const STAR_COUNT_SLOPE = 0.32;
const FAINTEST_STAR = 0.0000025;

function blackbodyColour(kelvin) {
  const t = kelvin / 100;
  const red = t <= 66 ? 1 : Math.min(1, 1.29 * (t - 60) ** -0.1332);
  const green = t <= 66 ? Math.min(1, Math.max(0, 0.39 * Math.log(t) - 0.631)) : Math.min(1, 1.13 * (t - 60) ** -0.0755);
  const blue = t >= 66 ? 1 : t <= 19 ? 0 : Math.min(1, Math.max(0, 0.543 * Math.log(t - 10) - 1.196));
  const brightest = Math.max(red, green, blue);
  return [red / brightest, green / brightest, blue / brightest];
}

function fieldStars(random, amount) {
  const count = Math.round(MOST_FIELD_STARS * amount ** 1.5);
  const stars = [];
  for (let i = 0; i < count; i++) {
    const magnitudesBrighter = Math.min(7.5, -Math.log10(Math.max(random.next(), 1e-9)) / STAR_COUNT_SLOPE);
    const flux = FAINTEST_STAR * 10 ** (0.4 * magnitudesBrighter);
    const kelvin = random.pick([[3400, 2], [4300, 4], [5200, 5], [6000, 4], [7500, 2], [11000, 1]]) * random.between(0.9, 1.1);
    stars.push({
      place: [random.between(-0.5, 0.5) * ASPECT, random.between(-0.5, 0.5)],
      flux,
      colour: blackbodyColour(kelvin),
    });
  }
  return stars;
}

function backgroundGalaxies(random, amount) {
  const count = Math.round(MOST_BACKGROUND_GALAXIES * amount ** 1.4);
  const galaxies = [];
  for (let i = 0; i < count; i++) {
    const distance = random.next() ** 0.6;
    const halfLight = 0.0009 + 0.006 * (1 - distance) ** 2.5 * random.between(0.4, 1.2);
    const index = random.pick([[1, 6], [2, 2], [4, 2]]);
    const scale = halfLight / (2 * index - 0.327) ** index;
    const starbursting = random.next() < 0.22;
    const colour = starbursting
      ? [random.between(0.7, 0.9), random.between(0.8, 0.95), 1]
      : [1, random.between(0.6, 0.85) - 0.2 * distance, random.between(0.35, 0.6) - 0.25 * distance];
    galaxies.push({
      place: [random.between(-0.5, 0.5) * ASPECT, random.between(-0.5, 0.5)],
      flux: 0.000005 * (1 - distance + 0.08) ** 3 * random.between(0.4, 2.5) * (index === 4 ? 1.6 : 1),
      colour: colour.map((channel) => Math.max(0.15, channel)),
      shape: [scale, index === 4 ? random.between(0.6, 1) : random.between(0.2, 1), random.between(0, Math.PI), index],
    });
  }
  return galaxies;
}

function globularClusters(random, settings) {
  const bulge = settings.bulge / 100;
  const count = Math.round(15 + 160 * bulge ** 2);
  const { diskScale } = galaxyExtent();
  const coreRadius = diskScale;
  const clusters = [];
  for (let i = 0; i < count; i++) {
    const radius = coreRadius * ((1 - random.next() * 0.985) ** (-1 / 1.6) - 1);
    if (radius > diskScale * 9) continue;
    const z = random.between(-1, 1);
    const angle = random.between(0, 2 * Math.PI);
    const ring = Math.sqrt(1 - z * z);
    const point = [radius * ring * Math.cos(angle), radius * ring * Math.sin(angle), radius * z];
    const magnitudeSpread = random.normal() * 1.2;
    clusters.push({
      place: projectToFrame(point, settings),
      flux: 0.0000015 * 10 ** (-0.4 * magnitudeSpread) * (settings.size / 60) ** 2,
      colour: blackbodyColour(random.between(4600, 5600)),
      shape: [0.00008, 1, 0, 1],
    });
  }
  return clusters;
}

const packStars = (stars) => new Float32Array(stars.flatMap(({ place, flux, colour }) => [...place, flux, ...colour]));
const packBlobs = (blobs) => new Float32Array(blobs.flatMap(({ place, flux, colour, shape }) => [...place, flux, ...colour, ...shape]));

export function buildSky(settings) {
  const random = createRandom(settings.seed * 7 + 3);
  const stars = fieldStars(random, settings.stars / 100);
  const behind = [...backgroundGalaxies(random, settings.background / 100), ...globularClusters(random, settings)];
  return {
    stars: packStars(stars),
    starCount: stars.length,
    behind: packBlobs(behind),
    behindCount: behind.length,
    spikeRoll: random.between(0, Math.PI),
  };
}
