import { derivePlanet, randomPhysical } from './physics.js';

const EARTHLIKE_LAND = '#7eff00';
const CLEAR_SKY = { lava: 0, haze: 0, hazeColor: '#8fb8ff' };

function handTuned(name, physical, look) {
  return { name, planet: { ...physical, ...CLEAR_SKY, ...look } };
}

function fromPhysics(name, seed, physical) {
  const { seed: _unused, ...planet } = derivePlanet({ seed, ...physical });
  return { name, planet };
}

export const PRESETS = [
  handTuned('Gornia (Earth analog)', { kind: 'rocky', temperature: 288, water: 53, atmosphere: 30 }, {
    baseColor: '#0083ff', variation: 15, darkness: 35, polarCap: 35, bands: 0, craters: 0, land: true, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 30, haze: 24, hazeColor: '#7fb2ff',
  }),
  handTuned('Trynoon (Mars analog)', { kind: 'rocky', temperature: 210, water: 1, atmosphere: 5 }, {
    baseColor: '#ff6e00', variation: 25, darkness: 35, polarCap: 35, bands: 0, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0, haze: 4, hazeColor: '#d8a57a',
  }),
  handTuned('Tetrum (ocean world)', { kind: 'rocky', temperature: 295, water: 100, atmosphere: 40 }, {
    baseColor: '#0083ff', variation: 15, darkness: 35, polarCap: 0, bands: 0, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0, haze: 32, hazeColor: '#7fb2ff',
  }),
  handTuned('Norma (Jupiter analog)', { kind: 'giant', temperature: 130, water: 0, atmosphere: 100 }, {
    baseColor: '#ff7b00', variation: 8, darkness: 35, polarCap: 0, bands: 4, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0, haze: 10, hazeColor: '#e8d0a0',
  }),
  handTuned('Green gas giant', { kind: 'giant', temperature: 150, water: 0, atmosphere: 100 }, {
    baseColor: '#2aff00', variation: 20, darkness: 35, polarCap: 0, bands: 4, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0,
  }),
  handTuned('Glacia (icy moon)', { kind: 'rocky', temperature: 90, water: 60, atmosphere: 0 }, {
    baseColor: '#ffffff', variation: 35, darkness: 0, polarCap: 0, bands: 0, craters: 1, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0,
  }),
  fromPhysics('Lava world', 4471, { kind: 'rocky', temperature: 1100, water: 0, atmosphere: 15 }),
  fromPhysics('Desert world', 2380, { kind: 'rocky', temperature: 320, water: 6, atmosphere: 25 }),
  fromPhysics('Ice giant', 7612, { kind: 'giant', temperature: 60, water: 0, atmosphere: 100 }),
  fromPhysics('Hot Jupiter', 9051, { kind: 'giant', temperature: 1300, water: 0, atmosphere: 100 }),
];

export function randomSeed() {
  return 1 + Math.floor(Math.random() * 999999);
}

export function randomPlanet(next = Math.random) {
  return derivePlanet(randomPhysical(next));
}
