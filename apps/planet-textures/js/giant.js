import { hexToHsv, hsvToRgb } from './color.js';
import { createNoise, createRandom } from './random.js';
import { bump, clamp01, mix, smoothstep, wrapAngle } from './sphere.js';

const STREAM = { turbulence: 0x6b21, streaks: 0x2c95, storms: 0x7f3d };
const TURBULENCE_SCALE = 1.5;
const STREAK_SCALE = 6;
const STREAK_STRETCH = 40;
const CHAOS_SCALE = 4;

function createStorms(seed) {
  const random = createRandom(seed);
  return Array.from({ length: random.integer(1, 3) }, () => {
    const width = random.between(0.25, 0.45);
    return {
      lat: random.between(0.45, 1),
      lon: random.between(-Math.PI, Math.PI),
      width,
      height: width * random.between(0.4, 0.6),
      hueShift: random.between(-0.04, -0.015),
    };
  });
}

function stormAt(storms, p) {
  for (const storm of storms) {
    const across = (wrapAngle(p.lon - storm.lon) * Math.cos(p.lat)) / storm.width;
    const along = (p.lat - storm.lat) / storm.height;
    const reach = Math.hypot(across, along);
    if (reach < 1.4) return { storm, reach, swirl: Math.atan2(along, across) + reach * 4 };
  }
  return null;
}

export function createGiantShader(planet) {
  const turbulence = createNoise(planet.seed ^ STREAM.turbulence, 4);
  const streaks = createNoise(planet.seed ^ STREAM.streaks, 3);
  const storms = createStorms(planet.seed ^ STREAM.storms);
  const base = hexToHsv(planet.baseColor);
  const floor = 100 - planet.variation - planet.darkness;
  const hueSwing = planet.variation / 300;

  return (p, out) => {
    const poleward = p.lat / (Math.PI / 2);
    const warp = turbulence(p.x * TURBULENCE_SCALE, p.y * TURBULENCE_SCALE, p.lat * 6) - 0.5;
    const band = Math.sin(poleward * planet.bands * Math.PI * 2 + warp * (2 + planet.bands * 0.5));
    const polar = smoothstep(0.7, 0.92, poleward);
    const chaos = turbulence(p.x * CHAOS_SCALE, p.y * CHAOS_SCALE, p.z * CHAOS_SCALE) - 0.5;
    const streak = streaks(p.x * STREAK_SCALE, p.y * STREAK_SCALE, p.lat * STREAK_STRETCH) - 0.5;

    const shade = 0.5 + 0.5 * band * (1 - polar) + chaos * polar * 1.5 + streak * 0.9 * (1 - polar);
    let hue = base.hue + band * hueSwing * (1 - polar);
    let saturation = base.saturation * (1 - 0.25 * Math.max(0, band));
    let value = clamp01((shade * planet.variation + floor) / 100);

    const vortex = stormAt(storms, p);
    if (vortex) {
      const core = smoothstep(1, 0.8, vortex.reach);
      const eddies = 0.9 + 0.15 * Math.cos(vortex.swirl * 2);
      const collar = 1 + 0.2 * bump(vortex.reach, 1.08, 0.1);
      value = clamp01(value * mix(1, eddies, core) * collar);
      hue = mix(hue, base.hue + vortex.storm.hueShift, core);
      saturation = mix(saturation, Math.min(1, base.saturation * 1.15), core);
    }

    const [r, g, b] = hsvToRgb(hue, saturation, value);
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return 0;
  };
}
