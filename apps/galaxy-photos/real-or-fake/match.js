import { createRandom } from '../js/random.js';
import { presetSettings } from '../js/presets.js';

const SHAPE_WOBBLE = 7;
const SHAPE_FIELDS = ['pitch', 'armContrast', 'flocculence', 'bulge', 'flattening', 'disk', 'young', 'gas', 'dust', 'thickness'];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const sizeForDiameter = (diameter) => ((diameter - 0.15) / 0.95) * 100;

export function fakeSettingsFor(photo, seed) {
  const random = createRandom(seed);
  const settings = { ...presetSettings(photo.type, seed), ...photo.overrides };
  for (const field of SHAPE_FIELDS) {
    if (settings[field] === 0) continue;
    settings[field] = Math.round(clamp(settings[field] + random.normal() * SHAPE_WOBBLE, 0, 100));
  }
  const nearSideFlip = random.next() < 0.5 ? 180 : 0;
  const angle = photo.angle ?? random.between(0, 360);
  return {
    ...settings,
    seed,
    inclination: Math.round(clamp(photo.inclination + random.normal() * 3, 0, 90)),
    angle: Math.round(angle + nearSideFlip + random.normal() * 3),
    size: sizeForDiameter(photo.diameter * (1 + random.normal() * 0.05)),
    offsetX: photo.offsetX,
    offsetY: photo.offsetY,
    mirror: random.next() < 0.5,
    telescope: 'hubble',
    exposure: Math.round(51 + random.normal() * 6),
    stretch: Math.round(27 + random.normal() * 6),
    saturation: Math.round(125 + random.normal() * 8),
    noise: Math.round(30 + random.normal() * 6),
    stars: Math.round(random.between(5, 20)),
    background: photo.overrides.background ?? Math.round(random.between(6, 22)),
    resolved: 70,
  };
}
