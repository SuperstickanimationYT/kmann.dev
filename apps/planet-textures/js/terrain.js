import { hexToHsv, hexToRgb, hsvToRgb, mixHue, mixInto } from './color.js';
import { createNoise } from './random.js';
import { bump, clamp01, levelAt, mix, sampleLevels, smoothstep, toDegrees } from './sphere.js';

const STREAM = { terrain: 0x1a4d, grain: 0x51f1, moisture: 0x3e77, iceEdge: 0x9013 };
const CONTINENT_SCALE = 1.8;
const GRAIN_SCALE = 9;
const MOISTURE_SCALE = 2.2;
const ICE_EDGE_SCALE = 5;
const STAGE_RADIUS = 180;
const SAND_HUE = 0.1;
const ROCK = hsvToRgb(0.07, 0.18, 1);
const SEA_ICE = hexToRgb('#c9e6ff');
const LAND_ICE = hexToRgb('#f2f7ff');
const DESERT_LATITUDE = 25;
const COAST_WIDTH = 0.1;

export function createRockyShader(planet) {
  const terrain = createNoise(planet.seed ^ STREAM.terrain, 6);
  const grain = createNoise(planet.seed ^ STREAM.grain, 3);
  const moisture = createNoise(planet.seed ^ STREAM.moisture, 3);
  const iceEdge = createNoise(planet.seed ^ STREAM.iceEdge, 3);
  const heightAt = (p) => terrain(p.x * CONTINENT_SCALE, p.y * CONTINENT_SCALE, p.z * CONTINENT_SCALE);

  const heights = sampleLevels(planet.seed ^ STREAM.terrain, heightAt);
  const seaLevel = planet.land ? levelAt(heights, 1 - planet.landCover / 100) : -Infinity;
  const peak = levelAt(heights, 0.995);
  const trench = levelAt(heights, 0.005);
  const midHeight = levelAt(heights, 0.5);

  const base = hexToHsv(planet.baseColor);
  const land = hexToHsv(planet.landColor);
  const ocean = hsvToRgb(base.hue, base.saturation, 1);
  const shallows = hsvToRgb(base.hue - 0.04, base.saturation * 0.55, 1);
  const lowland = hsvToRgb(land.hue, land.saturation, 1);
  const desert = hsvToRgb(SAND_HUE, Math.min(0.55, land.saturation * 0.5 + 0.2), 1);
  const tundra = hsvToRgb(mixHue(land.hue, 0.08, 0.6), land.saturation * 0.35, 1);

  const capReach = planet.polarCap / STAGE_RADIUS;
  const capLatitude = capReach > 0 ? toDegrees(Math.acos(Math.min(1, capReach))) : 90;
  const floor = 100 - planet.variation - planet.darkness;
  const reliefScale = planet.land ? 1 : planet.variation / 150;

  return (p, out) => {
    const height = heightAt(p);
    const onLand = height >= seaLevel;
    const texture = grain(p.x * GRAIN_SCALE, p.y * GRAIN_SCALE, p.z * GRAIN_SCALE);
    let brightness = clamp01((texture * planet.variation + floor) / 100);
    let elevation = 0;
    const latitude = toDegrees(p.lat);
    const chill = capReach > 0 ? smoothstep(capLatitude - 22, capLatitude - 4, latitude) : 0;

    if (!planet.land) {
      brightness = clamp01(brightness + ((height - midHeight) * planet.variation) / 50);
      out[0] = ocean[0];
      out[1] = ocean[1];
      out[2] = ocean[2];
    } else if (!onLand) {
      const depth = (seaLevel - height) / (seaLevel - trench);
      out[0] = shallows[0];
      out[1] = shallows[1];
      out[2] = shallows[2];
      mixInto(out, ocean, smoothstep(0, COAST_WIDTH, depth));
      brightness *= mix(1.2, 0.55, smoothstep(0, 0.5, depth));
    } else {
      elevation = (height - seaLevel) / Math.max(1e-6, peak - seaLevel);
      const wetness = moisture(p.x * MOISTURE_SCALE, p.y * MOISTURE_SCALE, p.z * MOISTURE_SCALE);
      const dryness = (0.5 - wetness) * 3 + bump(latitude, DESERT_LATITUDE, 13) * 0.9 - 0.25 - elevation * 0.3;
      const sandy = smoothstep(0.15, 0.55, dryness) * (1 - chill);
      const rocky = smoothstep(0.55, 0.9, elevation);
      out[0] = lowland[0];
      out[1] = lowland[1];
      out[2] = lowland[2];
      mixInto(out, desert, sandy);
      mixInto(out, tundra, chill);
      mixInto(out, ROCK, rocky * 0.8);
      brightness *= mix(1, 1.3, sandy) * mix(1, 0.85, chill) * mix(1, 0.8, rocky);
    }

    out[0] *= brightness;
    out[1] *= brightness;
    out[2] *= brightness;

    if (planet.land && onLand && capReach > 0) {
      const snowline = smoothstep(0.9, 0.97, elevation + chill * 0.3);
      mixInto(out, LAND_ICE, snowline);
    }

    if (capReach > 0) {
      const wobble = (iceEdge(p.x * ICE_EDGE_SCALE, p.y * ICE_EDGE_SCALE, p.z * ICE_EDGE_SCALE) - 0.5) * 0.35;
      const terrainPush = planet.land ? (onLand ? 0.05 + elevation * 0.12 : -0.03) : (height - midHeight) * 0.25;
      const edge = capReach + wobble + terrainPush;
      mixInto(out, planet.land && onLand ? LAND_ICE : SEA_ICE, smoothstep(edge + 0.012, edge - 0.012, p.flat));
    }

    return (planet.land ? Math.max(height, seaLevel) : height) * reliefScale;
  };
}
