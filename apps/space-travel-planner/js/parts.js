export const PART_SOURCES = {
  rl10c1: 'L3Harris RL10 data sheet',
  rl10b2: 'Wikipedia, RL10',
  aj10: 'Wikipedia, AJ10',
  r4d: 'L3Harris bipropellant rocket engines data sheet (300:1 nozzle)',
  star48bv: 'NASA JANNAF propellants paper (NTRS 20240015535) for Isp and inert fraction; Wikipedia, Star 48 for propellant mass and burn time',
  hydroloxTank: 'Centaur on Atlas V: 2,247 kg dry minus a 188 kg RL10C-1, per 20,830 kg of propellant (Wikipedia, Centaur)',
  storableTank: 'Assumed. No single public source; spacecraft storable systems run near this share.',
};

export const PROPELLANTS = {
  hydrolox: { name: 'Liquid hydrogen + oxygen', fuel: 'hydrogen', oxidizer: 'oxygen', tankShare: (2247 - 188) / 20830 },
  storable: { name: 'MMH + nitrogen tetroxide', fuel: 'mmh', oxidizer: 'nto', tankShare: 0.1 },
};

export const ENGINES = {
  rl10c1: { name: 'RL10C-1', propellant: 'hydrolox', thrust: 105980, isp: 453.8, mass: 188, mixture: 5.5 },
  rl10b2: { name: 'RL10B-2', propellant: 'hydrolox', thrust: 110100, isp: 465.5, mass: 301, mixture: 5.88 },
  aj10: { name: 'AJ10-190', propellant: 'storable', thrust: 26700, isp: 316, mass: 118, mixture: 1.65 },
  r4d: { name: 'R-4D-11', propellant: 'storable', thrust: 490, isp: 315, mass: 4.31, mixture: 1.65 },
};

const STAR_48BV_PROPELLANT = 2010;
const STAR_48BV_INERT_SHARE = 0.0783;
const STAR_48BV_ISP = 292.1;
const STAR_48BV_BURN_SECONDS = 84.1;

export const SOLID_MOTORS = {
  star48bv: {
    name: 'Star 48BV',
    propellant: STAR_48BV_PROPELLANT,
    inert: (STAR_48BV_PROPELLANT * STAR_48BV_INERT_SHARE) / (1 - STAR_48BV_INERT_SHARE),
    isp: STAR_48BV_ISP,
    thrust: (STAR_48BV_PROPELLANT * STAR_48BV_ISP * 9.80665) / STAR_48BV_BURN_SECONDS,
  },
};
