import { createNoise, createRandom } from './random.js';
import { angleBetween, bump, forEachDiskPixel, levelAt, rotateAbout, sampleLevels, smoothstep, surfacePoint, toDegrees } from './sphere.js';

const STREAM = { field: 0xc10d, detail: 0x5d19, cyclones: 0xe2b1 };
const FIELD_SCALE = 2.5;
const FIELD_STRETCH = 4;
const DETAIL_SCALE = 14;
const COVERAGE_PER_CLOUD = 1 / 60;
const CYCLONES_AT_FULL_COVER = 3.5;
const CLOUD_WHITE = [245, 248, 255];
const MAX_OPACITY = 0.95;

function createCyclones(planet, coverage) {
  const random = createRandom(planet.seed ^ STREAM.cyclones);
  return Array.from({ length: Math.round(coverage * CYCLONES_AT_FULL_COVER) }, () => {
    const latitude = random.between(30, 65) * (Math.PI / 180);
    return {
      axis: surfacePoint(Math.sin(latitude), random.between(-Math.PI, Math.PI)),
      radius: random.between(0.1, 0.22),
      spin: random.between(4, 5.5),
    };
  });
}

function climateBias(latitude) {
  return 0.12 * bump(latitude, 55, 12) + 0.1 * bump(latitude, 2, 5) - 0.12 * bump(latitude, 25, 9);
}

function createDensity(planet, coverage) {
  const field = createNoise(planet.seed ^ STREAM.field, 5);
  const detail = createNoise(planet.seed ^ STREAM.detail, 4);
  const cyclones = createCyclones(planet, coverage);
  const hasWeatherBelts = planet.bands === 0;
  const swirled = { x: 0, y: 0, z: 0 };

  return (p) => {
    swirled.x = p.x;
    swirled.y = p.y;
    swirled.z = p.z;
    let density = 0;
    for (const cyclone of cyclones) {
      const reach = angleBetween(swirled, cyclone.axis) / cyclone.radius;
      if (reach > 2) continue;
      rotateAbout(swirled, cyclone.axis, cyclone.spin * (1 - reach / 2) ** 2, swirled);
      density += 0.25 * bump(reach, 0.45, 0.35) - 0.4 * bump(reach, 0, 0.12);
    }
    const latitude = Math.asin(Math.min(1, swirled.z));
    density += field(swirled.x * FIELD_SCALE, swirled.y * FIELD_SCALE, latitude * FIELD_STRETCH);
    density += (detail(swirled.x * DETAIL_SCALE, swirled.y * DETAIL_SCALE, swirled.z * DETAIL_SCALE) - 0.5) * 0.35;
    if (hasWeatherBelts) density += climateBias(toDegrees(p.lat));
    return density;
  };
}

export function paintClouds(context, size, planet) {
  if (!planet.clouds) return;
  const coverage = 1 - Math.exp(-planet.clouds * COVERAGE_PER_CLOUD);
  const densityAt = createDensity(planet, coverage);
  const threshold = levelAt(sampleLevels(planet.seed ^ STREAM.field, densityAt), 1 - coverage);
  const image = context.createImageData(size, size);
  const pixels = image.data;

  forEachDiskPixel(size, (p, index) => {
    const offset = index * 4;
    pixels[offset] = CLOUD_WHITE[0];
    pixels[offset + 1] = CLOUD_WHITE[1];
    pixels[offset + 2] = CLOUD_WHITE[2];
    pixels[offset + 3] = 255 * MAX_OPACITY * smoothstep(threshold - 0.04, threshold + 0.2, densityAt(p));
  });
  context.putImageData(image, 0, 0);
}
