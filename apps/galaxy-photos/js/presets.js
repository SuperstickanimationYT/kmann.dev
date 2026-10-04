import { createRandom } from './random.js';

const CAMERA = {
  telescope: 'hubble',
  exposure: 50,
  stretch: 50,
  noise: 50,
  saturation: 100,
  stars: 25,
  background: 40,
  resolved: 50,
};

const VIEW = { inclination: 35, angle: 20, size: 65 };

export const PRESETS = {
  grand: {
    label: 'Grand-design spiral (like M51)',
    shape: { arms: 2, pitch: 19, armContrast: 82, flocculence: 10, bar: 0, bulge: 25, flattening: 30, disk: 70, young: 80, gas: 70, dust: 60, thickness: 30 },
  },
  early: {
    label: 'Early-type spiral (like M81)',
    shape: { arms: 2, pitch: 12, armContrast: 55, flocculence: 25, bar: 0, bulge: 60, flattening: 25, disk: 80, young: 45, gas: 35, dust: 55, thickness: 35 },
  },
  barred: {
    label: 'Barred spiral (like NGC 1300)',
    shape: { arms: 2, pitch: 16, armContrast: 75, flocculence: 12, bar: 70, bulge: 35, flattening: 30, disk: 70, young: 70, gas: 60, dust: 65, thickness: 30 },
  },
  flocculent: {
    label: 'Flocculent spiral (like NGC 4414)',
    shape: { arms: 3, pitch: 15, armContrast: 30, flocculence: 85, bar: 0, bulge: 40, flattening: 30, disk: 80, young: 60, gas: 45, dust: 75, thickness: 30 },
  },
  open: {
    label: 'Open many-armed spiral (like M101)',
    shape: { arms: 4, pitch: 26, armContrast: 55, flocculence: 45, bar: 0, bulge: 10, flattening: 30, disk: 55, young: 90, gas: 85, dust: 40, thickness: 25 },
  },
  edgeOn: {
    label: 'Edge-on spiral (like NGC 891)',
    shape: { arms: 2, pitch: 14, armContrast: 50, flocculence: 40, bar: 0, bulge: 45, flattening: 35, disk: 80, young: 50, gas: 40, dust: 85, thickness: 28 },
    view: { inclination: 88, angle: 35, size: 80 },
  },
  lenticular: {
    label: 'Lenticular (S0)',
    shape: { arms: 2, pitch: 15, armContrast: 0, flocculence: 0, bar: 0, bulge: 65, flattening: 30, disk: 85, young: 0, gas: 0, dust: 12, thickness: 45 },
  },
  elliptical: {
    label: 'Elliptical (E3)',
    shape: { arms: 2, pitch: 15, armContrast: 0, flocculence: 0, bar: 0, bulge: 100, flattening: 30, disk: 0, young: 0, gas: 0, dust: 0, thickness: 50 },
    view: { inclination: 60, angle: 20, size: 55 },
  },
};

export function presetSettings(name, seed) {
  const preset = PRESETS[name];
  return { seed, ...CAMERA, ...VIEW, ...preset.shape, ...preset.view };
}

const PRESET_WEIGHTS = [['grand', 3], ['early', 3], ['barred', 3], ['flocculent', 2], ['open', 2], ['edgeOn', 1], ['lenticular', 1], ['elliptical', 1]];
const LIMITS = {
  arms: [1, 4], pitch: [6, 35], armContrast: [0, 100], flocculence: [0, 100], bar: [0, 100], bulge: [0, 100], flattening: [0, 100],
  disk: [0, 100], young: [0, 100], gas: [0, 100], dust: [0, 100], thickness: [0, 100],
};

export function randomGalaxy(seed, camera) {
  const random = createRandom(seed);
  const name = random.pick(PRESET_WEIGHTS);
  const shape = { ...PRESETS[name].shape };
  for (const [field, [low, high]] of Object.entries(LIMITS)) {
    if (shape[field] === 0 && field !== 'bar') continue;
    const wobble = field === 'arms' ? random.integer(-1, 1) * (random.next() < 0.3 ? 1 : 0) : random.normal() * (high - low) * 0.1;
    shape[field] = Math.round(Math.min(high, Math.max(low, shape[field] + wobble)));
  }
  if (name !== 'barred' && random.next() < 0.3 && shape.young > 0) shape.bar = random.integer(20, 60);
  const view = PRESETS[name].view ?? {
    inclination: Math.round((Math.acos(random.between(0.08, 1)) * 180) / Math.PI),
    size: random.integer(50, 85),
  };
  return { ...camera, ...shape, ...view, angle: random.integer(0, 359), seed };
}
