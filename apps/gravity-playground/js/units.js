import { INVERSE_SQUARE_STRENGTH } from './physics.js';

export const MASS_PER_SUN = 1000;
export const EARTH_MASSES_PER_SUN = 332946;
export const KM_PER_AU = 149597870.7;
export const SUN_KM = 695700;
export const EARTH_KM = 6371;
const GIANT_PLANET_KM = 70000;
const LIGHT_KM_PER_S = 299792.458;
const REAL_SECONDS_PER_YEAR = 31557600;
const MS_PER_DAY = 86400000;
const DAYS_PER_YEAR = 365.25;
const KM_BELOW_AU = 0.01;
const EARTH_MASSES_BELOW_SUNS = 3000;

export const fromEarthMasses = (earthMasses) => (earthMasses * MASS_PER_SUN) / EARTH_MASSES_PER_SUN;
export const fromSolarMasses = (solarMasses) => solarMasses * MASS_PER_SUN;
const toEarthMasses = (mass) => (mass * EARTH_MASSES_PER_SUN) / MASS_PER_SUN;

export function realScale(unitsPerAu) {
  const secondsPerYear = 2 * Math.PI * Math.sqrt(unitsPerAu ** 3 / (INVERSE_SQUARE_STRENGTH * MASS_PER_SUN));
  const unitsPerKm = unitsPerAu / KM_PER_AU;
  const speedPerKmPerS = (unitsPerKm * REAL_SECONDS_PER_YEAR) / secondsPerYear;
  return {
    unitsPerAu,
    secondsPerYear,
    secondsPerDay: secondsPerYear / DAYS_PER_YEAR,
    fromAu: (au) => au * unitsPerAu,
    fromKm: (km) => km * unitsPerKm,
    toKm: (units) => units / unitsPerKm,
    fromKmPerS: (kmPerS) => kmPerS * speedPerKmPerS,
    toKmPerS: (speed) => speed / speedPerKmPerS,
    toMs: (seconds) => (seconds / secondsPerYear) * DAYS_PER_YEAR * MS_PER_DAY,
  };
}

const eventHorizonKm = (mass, scale) => scale.toKm((2 * INVERSE_SQUARE_STRENGTH * mass) / scale.fromKmPerS(LIGHT_KM_PER_S) ** 2);

const RADIUS_KM = {
  planet: (mass) => Math.min(GIANT_PLANET_KM, EARTH_KM * toEarthMasses(mass) ** 0.4),
  star: (mass) => SUN_KM * (mass / MASS_PER_SUN) ** 0.8,
  blackHole: eventHorizonKm,
};

export const radiusFor = (look, mass, scale) => scale.fromKm(RADIUS_KM[look](mass, scale));

export const NEW_BODY_MASS = { planet: fromEarthMasses(317.8), star: fromSolarMasses(1), blackHole: fromSolarMasses(10) };

export const REAL_MASS_RANGE = { min: fromEarthMasses(0.01), max: fromSolarMasses(100) };

const STAR_COLOURS = [
  [0.08, [255, 140, 90]],
  [0.5, [255, 190, 130]],
  [1, [255, 241, 214]],
  [3, [215, 228, 255]],
  [20, [165, 190, 255]],
];

export function starColour(mass) {
  const suns = mass / MASS_PER_SUN;
  const upper = STAR_COLOURS.findIndex(([stop]) => stop >= suns);
  if (upper <= 0) return STAR_COLOURS[upper === 0 ? 0 : STAR_COLOURS.length - 1][1];
  const [[lowSuns, low], [highSuns, high]] = [STAR_COLOURS[upper - 1], STAR_COLOURS[upper]];
  const along = Math.log(suns / lowSuns) / Math.log(highSuns / lowSuns);
  return low.map((channel, index) => Math.round(channel + (high[index] - channel) * along));
}

const rounded = (amount) => Number(amount.toPrecision(3)).toLocaleString();

export function formatMass(mass) {
  const earthMasses = toEarthMasses(mass);
  return earthMasses < EARTH_MASSES_BELOW_SUNS ? `${rounded(earthMasses)} M⊕` : `${rounded(mass / MASS_PER_SUN)} M☉`;
}

const ROUND_STEPS = [5, 2, 1];

export function roundLengthWithin(units, scale) {
  const inKm = units / scale.unitsPerAu < KM_BELOW_AU;
  const amount = inKm ? scale.toKm(units) : units / scale.unitsPerAu;
  const power = 10 ** Math.floor(Math.log10(amount));
  const round = power * ROUND_STEPS.find((step) => step * power <= amount);
  return { length: inKm ? scale.fromKm(round) : scale.fromAu(round), label: `${rounded(round)} ${inKm ? 'km' : 'AU'}` };
}

export function formatPace(simSecondsPerSecond, scale) {
  const days = simSecondsPerSecond / scale.secondsPerDay;
  return days < DAYS_PER_YEAR ? `${rounded(days)} days/s` : `${rounded(days / DAYS_PER_YEAR)} years/s`;
}
