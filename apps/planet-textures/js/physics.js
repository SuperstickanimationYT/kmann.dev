import { hsvToHex } from './color.js';
import { createRandom } from './random.js';
import { clamp01 } from './sphere.js';

const STREAM = 0x9a1c;
const BOILING_AT_ONE_BAR = 373;
const BOILING_RISE_PER_AIR = 2;
const THINNEST_AIR_FOR_LIQUID = 3;
const COLDEST_OPEN_SEA = 200;
const MOLTEN_ABOVE = 700;
const HABITABLE = { coldest: 255, hottest: 325, driest: 5, wettest: 97, thinnestAir: 10 };
const GIANT_ATMOSPHERE = 100;
const UNUSED_LAND = { land: false, landColor: '#7eff00', landCover: 47 };
const STAGE_RADIUS = 180;

const MINERALS = [
  { name: 'rust', hue: [0.02, 0.07], saturation: [0.45, 0.8] },
  { name: 'sand', hue: [0.08, 0.13], saturation: [0.25, 0.5] },
  { name: 'basalt', hue: [0, 1], saturation: [0, 0.1] },
  { name: 'slate', hue: [0.55, 0.7], saturation: [0.05, 0.15] },
];
const ALIEN_PLANT_HUES = [0.45, 0.08, 0.8, 0];

const GIANT_CLASSES = [
  { below: 90, hue: [0.5, 0.6], saturation: [0.35, 0.6], bands: [1, 2.5], variation: [4, 10], darkness: [5, 20], haze: 30, hazeColor: '#a8e0ff' },
  { below: 180, hue: [0.05, 0.11], saturation: [0.35, 0.6], bands: [3, 8], variation: [18, 30], darkness: [20, 35], haze: 10, hazeColor: '#e8d0a0' },
  { below: 350, hue: [0.08, 0.15], saturation: [0.08, 0.2], bands: [2, 5], variation: [8, 15], darkness: [5, 15], haze: 15, hazeColor: '#ffffff' },
  { below: 800, hue: [0.58, 0.64], saturation: [0.5, 0.7], bands: [1, 3], variation: [6, 12], darkness: [15, 30], haze: 35, hazeColor: '#6fa0ff' },
  { below: Infinity, hue: [0.95, 1.02], saturation: [0.5, 0.7], bands: [1.5, 3], variation: [10, 20], darkness: [50, 65], haze: 40, hazeColor: '#ff7a3a' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const halfStep = (value) => Math.round(value * 2) / 2;

function colorFrom(random, { hue, saturation }) {
  return hsvToHex(random.between(...hue), random.between(...saturation), 1);
}

function mineralColor(random, temperature, atmosphere) {
  if (temperature > MOLTEN_ABOVE) return colorFrom(random, MINERALS[2]);
  const choices = atmosphere > 0 ? MINERALS : MINERALS.filter((mineral) => mineral.name !== 'rust');
  return colorFrom(random, choices[random.integer(0, choices.length - 1)]);
}

function plantColor(random) {
  const hue = random.next() < 0.7 ? random.between(0.22, 0.36) : ALIEN_PLANT_HUES[random.integer(0, ALIEN_PLANT_HUES.length - 1)];
  return hsvToHex(hue, random.between(0.55, 0.95), 1);
}

function skyColor({ temperature, atmosphere }, seas, living) {
  if (temperature > 400 || atmosphere > 70) return '#e8b25f';
  return seas || living ? '#7fb2ff' : '#d8a57a';
}

function rockyLook(physical, random) {
  const { temperature, water, atmosphere } = physical;
  const boiling = BOILING_AT_ONE_BAR + atmosphere * BOILING_RISE_PER_AIR;
  const holdsLiquid = atmosphere >= THINNEST_AIR_FOR_LIQUID && temperature < boiling;
  const seas = water > 0 && holdsLiquid && temperature > COLDEST_OPEN_SEA;
  const living = seas
    && temperature > HABITABLE.coldest && temperature < HABITABLE.hottest
    && water >= HABITABLE.driest && water <= HABITABLE.wettest
    && atmosphere >= HABITABLE.thinnestAir;
  const molten = temperature > MOLTEN_ABOVE;
  const volatiles = Math.min(1, (water + atmosphere * 0.5) / 20);
  const evaporation = seas ? (water / 100) * clamp01((temperature - 240) / 80) : 0;
  const steam = water > 0 && temperature >= boiling ? water / 100 : 0;
  const airborne = atmosphere < THINNEST_AIR_FOR_LIQUID ? 0 : evaporation * 60 + atmosphere * 0.3 + Math.max(0, atmosphere - 60) * 2 + steam * 60;
  const ground = mineralColor(random, temperature, atmosphere);

  return {
    baseColor: seas ? hsvToHex(random.between(0.56, 0.62), random.between(0.75, 1), 1) : ground,
    variation: random.integer(10, 30),
    darkness: molten ? random.integer(55, 70) : random.integer(15, 45),
    bands: 0,
    polarCap: Math.round(clamp((290 - temperature) * 2.2 + 30, 0, STAGE_RADIUS) * volatiles),
    craters: molten ? 0 : Math.round(random.between(0, 25) * clamp01(1 - atmosphere / 40) * clamp01(1 - water / 60)),
    clouds: Math.round(Math.min(150, airborne)),
    lava: molten ? Math.round(clamp((temperature - MOLTEN_ABOVE) / 6, 5, 100)) : 0,
    land: seas && water < 100,
    landColor: living ? plantColor(random) : mineralColor(random, temperature, atmosphere),
    landCover: seas ? 100 - water : 47,
    haze: Math.round(atmosphere * 0.8),
    hazeColor: skyColor(physical, seas, living),
  };
}

function giantLook({ temperature }, random) {
  const kind = GIANT_CLASSES.find((giant) => temperature < giant.below);
  return {
    baseColor: hsvToHex(random.between(...kind.hue), random.between(...kind.saturation), 1),
    variation: random.integer(...kind.variation),
    darkness: random.integer(...kind.darkness),
    bands: halfStep(random.between(...kind.bands)),
    polarCap: 0,
    craters: 0,
    clouds: 0,
    lava: 0,
    ...UNUSED_LAND,
    haze: kind.haze,
    hazeColor: kind.hazeColor,
  };
}

export function derivePlanet(physical) {
  const random = createRandom(physical.seed ^ STREAM);
  const look = physical.kind === 'giant' ? giantLook(physical, random) : rockyLook(physical, random);
  return { ...physical, ...look };
}

export function randomPhysical(next = Math.random) {
  const between = (min, max) => min + Math.floor(next() * (max - min + 1));
  const kind = next() < 0.3 ? 'giant' : 'rocky';
  const temperature = Math.round((40 * 35 ** next()) / 5) * 5;
  return {
    seed: between(1, 999999),
    kind,
    temperature,
    water: kind === 'giant' || next() < 0.3 ? 0 : between(0, 100),
    atmosphere: kind === 'giant' ? GIANT_ATMOSPHERE : Math.round(next() ** 1.6 * 100),
  };
}
