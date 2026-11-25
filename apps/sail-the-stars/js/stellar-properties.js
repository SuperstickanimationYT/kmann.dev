import { colourIndex } from './population.js';

const SUN_KELVIN = 5772;
const SUN_BOLOMETRIC = 4.74;

const DWARFS = [
  { absolute: -4, kelvin: 31400, logLuminosity: 4.65, mass: 17.7, gaiaColour: -0.4 },
  { absolute: -1.7, kelvin: 20600, logLuminosity: 3.43, mass: 7.3, gaiaColour: -0.25 },
  { absolute: -0.9, kelvin: 15700, logLuminosity: 2.68, mass: 4.7, gaiaColour: -0.15 },
  { absolute: 1.11, kelvin: 9700, logLuminosity: 1.58, mass: 2.3, gaiaColour: 0 },
  { absolute: 1.99, kelvin: 8080, logLuminosity: 1.09, mass: 1.88, gaiaColour: 0.23 },
  { absolute: 2.51, kelvin: 7220, logLuminosity: 0.86, mass: 1.61, gaiaColour: 0.38 },
  { absolute: 3.35, kelvin: 6550, logLuminosity: 0.52, mass: 1.33, gaiaColour: 0.59 },
  { absolute: 4.45, kelvin: 5930, logLuminosity: 0.13, mass: 1.06, gaiaColour: 0.78 },
  { absolute: 4.79, kelvin: 5770, logLuminosity: 0.01, mass: 1, gaiaColour: 0.82 },
  { absolute: 5.78, kelvin: 5270, logLuminosity: -0.33, mass: 0.88, gaiaColour: 0.98 },
  { absolute: 7.36, kelvin: 4440, logLuminosity: -0.76, mass: 0.7, gaiaColour: 1.36 },
  { absolute: 8.8, kelvin: 3850, logLuminosity: -1.16, mass: 0.57, gaiaColour: 1.84 },
  { absolute: 10.3, kelvin: 3560, logLuminosity: -1.54, mass: 0.44, gaiaColour: 2.2 },
  { absolute: 12.8, kelvin: 3210, logLuminosity: -2.14, mass: 0.23, gaiaColour: 2.7 },
  { absolute: 14.3, kelvin: 3060, logLuminosity: -2.52, mass: 0.162, gaiaColour: 3 },
  { absolute: 16.6, kelvin: 2810, logLuminosity: -3.02, mass: 0.102, gaiaColour: 3.6 },
];

const EVOLVED_BELOW_ABSOLUTE = 3.6;
const EVOLVED_REDDER_BY = 0.3;
const NO_GIANT_ROLL = 1;
const REDDEST_TRUSTED_COLOUR = 1.35;
const EVOLVED_MASSES = [[-5, 14], [-3, 6], [-1.5, 3], [0, 1.9], [1.5, 1.5], [3.6, 1.2]];

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function between(rows, x, columnOf, valueOf) {
  const next = rows.findIndex((row) => columnOf(row) >= x);
  if (next === 0) return valueOf(rows[0]);
  if (next < 0) return valueOf(rows.at(-1));
  const [from, to] = [rows[next - 1], rows[next]];
  const share = (x - columnOf(from)) / (columnOf(to) - columnOf(from));
  return valueOf(from) + (valueOf(to) - valueOf(from)) * share;
}

const byAbsolute = (absolute, valueOf) => between(DWARFS, absolute, (row) => row.absolute, valueOf);
const COOLEST_FIRST = [...DWARFS].reverse();
const correctionAt = (kelvin) =>
  between(COOLEST_FIRST, kelvin, (row) => row.kelvin, ({ logLuminosity, absolute }) => SUN_BOLOMETRIC - 2.5 * logLuminosity - absolute);

export const temperatureFromColour = (colour) => 4600 * (1 / (0.92 * colour + 1.7) + 1 / (0.92 * colour + 0.62));

const radiusOf = (luminosity, kelvin) => Math.sqrt(luminosity) * (SUN_KELVIN / kelvin) ** 2;

export function stellarProperties({ absolute, colour }) {
  const colourKelvin = temperatureFromColour(clamp(colour, -0.3, 2));
  const evolved = absolute < EVOLVED_BELOW_ABSOLUTE && colour > colourIndex(absolute, NO_GIANT_ROLL) + EVOLVED_REDDER_BY;
  const kelvin = !evolved && colour > REDDEST_TRUSTED_COLOUR ? byAbsolute(absolute, (row) => row.kelvin) : colourKelvin;
  const luminosity = 10 ** (0.4 * (SUN_BOLOMETRIC - absolute - correctionAt(kelvin)));
  const mass = evolved
    ? between(EVOLVED_MASSES, absolute, ([column]) => column, ([, solar]) => solar)
    : 10 ** byAbsolute(absolute, (row) => Math.log10(row.mass));
  return { evolved, kelvin, luminosity, mass, radius: radiusOf(luminosity, kelvin), gaiaColour: between(DWARFS, -mass, (row) => -row.mass, (row) => row.gaiaColour) };
}
