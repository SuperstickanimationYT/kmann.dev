import { mainSequenceStar, typicalRadiusEarth } from './physics.js';
import { CUSTOM_STAR, STARS, STARTING_WORLD, WORLDS } from './presets.js';

const PLANET_KEYS = {
  starMass: { key: 'm', min: 0.08, max: 50 },
  age: { key: 'age', min: 0.01, max: 13.8 },
  planetMass: { key: 'pm', min: 0.01, max: 4000 },
  planetRadius: { key: 'pr', min: 0.1, max: 25 },
  albedo: { key: 'alb', min: 0, max: 0.95 },
  greenhouse: { key: 'gh', min: 0, max: 600 },
  tilt: { key: 'tilt', min: 0, max: 90 },
  distance: { key: 'a', min: 0.001, max: 1000 },
  eccentricity: { key: 'e', min: 0, max: 0.95 },
  rotation: { key: 'rot', min: 1, max: 100000 },
};

export const LIFE_FIELDS = {
  pressureBar: { key: 'p', label: 'Surface pressure (bar)', min: 0.0001, max: 1000, step: 0.001, hint: 'Earth 1, Mars 0.006, Titan 1.5, Venus 92. On gas giants, the cloud layer you pick.' },
  oxygenBar: { key: 'o2', label: 'Oxygen in the air (bar)', min: 0, max: 100, step: 0.01, hint: 'Earth 0.21. Any other strong oxidiser counts the same.' },
  oceanPercent: { key: 'sea', label: 'Surface covered by liquid (%)', min: 0, max: 100, step: 1, hint: 'Earth 71.' },
};

const GAS_KEY = 'gas';
const SOLVENT_KEY = 'liq';

const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));

function numberParam(params, spec, fallback) {
  const raw = params.get(spec.key);
  const value = Number(raw);
  return raw === null || raw === '' || !Number.isFinite(value) ? fallback : clamp(value, spec);
}

function presetAsParams(preset) {
  const star = STARS[preset.star];
  const params = new URLSearchParams({
    star: preset.star,
    m: star.massSun,
    age: star.ageGyr,
    pm: preset.planet.massEarth,
    pr: preset.planet.radiusEarth,
    alb: preset.planet.albedo,
    gh: preset.planet.greenhouseK,
    tilt: preset.planet.tiltDeg,
    a: preset.orbit.distanceAu,
    e: preset.orbit.eccentricity,
    rot: preset.rotation.hours,
    lock: preset.rotation.locked ? '1' : '0',
    name: preset.name,
  });
  writeLife(params, preset.life);
  return params;
}

export function presetParams(id) {
  return presetAsParams(WORLDS[id]);
}

export function writeLife(params, life) {
  for (const [field, spec] of Object.entries(LIFE_FIELDS)) params.set(spec.key, life[field]);
  params.set(GAS_KEY, life.mainGas);
  params.set(SOLVENT_KEY, life.solvent);
}

export function readParams(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.has(PLANET_KEYS.distance.key) ? params : presetParams(STARTING_WORLD);
}

export function readPlanet(params) {
  const starId = params.get('star');
  const read = (field, fallback) => numberParam(params, PLANET_KEYS[field], fallback);
  const star = starId in STARS && starId !== CUSTOM_STAR ? STARS[starId] : mainSequenceStar(read('starMass', 1));
  const massEarth = read('planetMass', 1);
  return {
    name: params.get('name') || 'Unnamed world',
    chosen: {
      star,
      ageGyr: read('age', star.ageGyr ?? 4.6),
      planet: {
        massEarth,
        radiusEarth: read('planetRadius', typicalRadiusEarth(massEarth)),
        albedo: read('albedo', 0.3),
        greenhouseK: read('greenhouse', 0),
        tiltDeg: read('tilt', 0),
      },
      orbit: { distanceAu: read('distance', 1), eccentricity: read('eccentricity', 0) },
      rotation: { locked: params.get('lock') === '1', hours: read('rotation', 24) },
    },
  };
}

export function readLife(params) {
  const defaults = WORLDS[STARTING_WORLD].life;
  const life = {};
  for (const [field, spec] of Object.entries(LIFE_FIELDS)) life[field] = numberParam(params, spec, defaults[field]);
  life.mainGas = params.get(GAS_KEY) ?? defaults.mainGas;
  life.solvent = params.get(SOLVENT_KEY) ?? defaults.solvent;
  return life;
}
