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

function backgroundGalaxy(random, place, kind) {
  const nearness = random.next() ** 3.2;
  const halfLight = 0.0011 + 0.024 * nearness * random.between(0.6, 1.2);
  const index = kind === 'elliptical' ? 4 : random.pick([[1, 4], [2, 1]]);
  const axisRatio = kind === 'elliptical' ? random.between(0.55, 1) : Math.max(0.12, Math.abs(Math.cos(random.between(0, Math.PI / 2))));
  const scale = halfLight / (2 * index - 0.327) ** index;
  const surfaceBrightness = random.between(0.04, 0.28) * (0.5 + nearness);
  const reddening = 1 - nearness;
  const colour = {
    elliptical: [1, random.between(0.72, 0.82) - 0.15 * reddening, random.between(0.5, 0.6) - 0.2 * reddening],
    spiral: [random.between(0.85, 1), random.between(0.82, 0.92) - 0.12 * reddening, random.between(0.75, 0.95) - 0.25 * reddening],
    starburst: [random.between(0.7, 0.85), random.between(0.8, 0.92), 1],
  }[kind];
  const spiralDetail = kind === 'spiral' && halfLight > 0.004;
  return {
    place,
    flux: surfaceBrightness * 2 * Math.PI * axisRatio * (halfLight / 1.68) ** 2,
    colour: colour.map((channel) => Math.max(0.15, channel)),
    shape: [scale, axisRatio, random.between(0, Math.PI), index],
    detail: [
      spiralDetail ? random.between(0.35, 0.8) : 0,
      kind === 'elliptical' ? 0 : random.between(0.05, kind === 'starburst' ? 0.1 : 0.35),
      random.between(2, 4.5) * (random.next() < 0.5 ? -1 : 1),
      random.between(0, 2 * Math.PI),
    ],
  };
}

function backgroundGalaxies(random, amount) {
  const count = Math.round(MOST_BACKGROUND_GALAXIES * amount ** 1.4);
  const groups = Array.from({ length: random.integer(0, 3) }, () => [random.between(-0.5, 0.5) * ASPECT, random.between(-0.5, 0.5)]);
  const galaxies = [];
  for (let i = 0; i < count; i++) {
    const grouped = groups.length && random.next() < 0.25;
    const centre = grouped ? groups[random.integer(0, groups.length - 1)] : null;
    const place = centre
      ? [centre[0] + random.normal() * 0.035, centre[1] + random.normal() * 0.035]
      : [random.between(-0.5, 0.5) * ASPECT, random.between(-0.5, 0.5)];
    const kind = grouped ? random.pick([['elliptical', 3], ['spiral', 1]]) : random.pick([['spiral', 5], ['elliptical', 2], ['starburst', 2]]);
    galaxies.push(backgroundGalaxy(random, place, kind));
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
      detail: [0, 0, 0, 0],
    });
  }
  return clusters;
}

const packStars = (stars) => new Float32Array(stars.flatMap(({ place, flux, colour }) => [...place, flux, ...colour]));
const packBlobs = (blobs) => new Float32Array(blobs.flatMap(({ place, flux, colour, shape, detail }) => [...place, flux, ...colour, ...shape, ...detail]));

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
