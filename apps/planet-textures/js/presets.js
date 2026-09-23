const EARTHLIKE_LAND = '#7eff00';

export const PRESETS = [
  {
    name: 'Gornia (Earth analog)',
    planet: { baseColor: '#0083ff', variation: 15, darkness: 35, polarCap: 35, bands: 0, craters: 0, land: true, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 30 },
  },
  {
    name: 'Trynoon (Mars analog)',
    planet: { baseColor: '#ff6e00', variation: 25, darkness: 35, polarCap: 35, bands: 0, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0 },
  },
  {
    name: 'Tetrum (ocean world)',
    planet: { baseColor: '#0083ff', variation: 15, darkness: 35, polarCap: 0, bands: 0, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0 },
  },
  {
    name: 'Norma (Jupiter analog)',
    planet: { baseColor: '#ff7b00', variation: 8, darkness: 35, polarCap: 0, bands: 4, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0 },
  },
  {
    name: 'Green gas giant',
    planet: { baseColor: '#2aff00', variation: 20, darkness: 35, polarCap: 0, bands: 4, craters: 0, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0 },
  },
  {
    name: 'Glacia (icy moon)',
    planet: { baseColor: '#ffffff', variation: 35, darkness: 0, polarCap: 0, bands: 0, craters: 1, land: false, landColor: EARTHLIKE_LAND, landCover: 47, clouds: 0 },
  },
];

const between = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance = (odds) => Math.random() < odds;

function randomColor(minSaturation) {
  const hue = Math.random() * 360;
  const saturation = minSaturation + Math.random() * (100 - minSaturation);
  const lightness = 50 + (100 - saturation) / 2;
  const context = document.createElement('canvas').getContext('2d');
  context.fillStyle = `hsl(${hue} ${saturation}% ${lightness}%)`;
  return context.fillStyle;
}

export function randomSeed() {
  return between(1, 999999);
}

export function randomPlanet() {
  const gasGiant = chance(0.3);
  return {
    seed: randomSeed(),
    baseColor: randomColor(20),
    variation: between(10, 45),
    darkness: between(0, 50),
    polarCap: !gasGiant && chance(0.5) ? between(15, 80) : 0,
    bands: gasGiant ? between(2, 16) / 2 : 0,
    craters: !gasGiant && chance(0.4) ? between(1, 20) : 0,
    land: !gasGiant && chance(0.4),
    landColor: randomColor(40),
    landCover: between(20, 70),
    clouds: chance(0.5) ? between(10, 80) : 0,
  };
}
