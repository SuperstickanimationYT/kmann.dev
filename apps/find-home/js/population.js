const SUN_ABSOLUTE = 4.83;

const YOUNG_DENSITIES = { '-8': -9.3, '-7': -8.5, '-6': -7.8, '-5': -7.2, '-4': -6.6, '-3': -6.0, '-2': -5.4 };
const OLD_DENSITIES = {
  '-1': -4.8, 0: -4.2, 1: -3.7, 2: -3.3, 3: -2.9, 4: -2.6, 5: -2.4, 6: -2.3, 7: -2.2,
  8: -2.1, 9: -2.0, 10: -1.95, 11: -1.9, 12: -1.85, 13: -1.9, 14: -2.0, 15: -2.1,
};

const MAIN_SEQUENCE_COLOUR = [
  [-8, -0.3], [-4, -0.25], [-2, -0.15], [-1, -0.1], [0, 0], [1, 0.15], [2, 0.3], [3, 0.45],
  [4, 0.6], [5, 0.7], [6, 0.9], [7, 1.1], [8, 1.3], [9, 1.45], [12, 1.55], [15, 1.7],
];
const GIANT_COLOUR = 1.1;
const SUPERGIANT_RED_COLOUR = 1.8;
const CELL_OCCUPANCY = 24;
const LARGEST_CELL = 400;

function interpolate(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export function giantShare(absolute) {
  if (absolute <= -5) return 0.2;
  if (absolute < -1.5) return 0;
  if (absolute < -0.5) return 0.5;
  if (absolute < 0.5) return 0.7;
  if (absolute < 1.5) return 0.4;
  return 0;
}

export function colourIndex(absolute, giantRoll) {
  if (giantRoll < giantShare(absolute)) return absolute <= -5 ? SUPERGIANT_RED_COLOUR : GIANT_COLOUR;
  return interpolate(MAIN_SEQUENCE_COLOUR, absolute);
}

export function bandFluxes(colour) {
  const redIndex = Math.min(1.4, 0.62 * colour + 0.04);
  return [10 ** (0.4 * redIndex), 1, 10 ** (-0.4 * colour)];
}

export const SUN_COLOUR = 0.65;
export const WHITE_BALANCE = bandFluxes(SUN_COLOUR);

export const luminosityOf = (absolute) => 10 ** (-0.4 * (absolute - SUN_ABSOLUTE));

function describeBins(densities, population) {
  return Object.entries(densities)
    .map(([magnitude, logDensity]) => {
      const absolute = Number(magnitude);
      const density = 10 ** logDensity;
      const giants = giantShare(absolute);
      const dwarfFlux = bandFluxes(interpolate(MAIN_SEQUENCE_COLOUR, absolute));
      const giantFlux = bandFluxes(absolute <= -5 ? SUPERGIANT_RED_COLOUR : GIANT_COLOUR);
      const light = density * luminosityOf(absolute);
      return {
        absolute,
        density,
        population,
        cell: Math.min(LARGEST_CELL, Math.cbrt(CELL_OCCUPANCY / density)),
        light: dwarfFlux.map((flux, band) => light * ((1 - giants) * flux + giants * giantFlux[band])),
        speedSpread: population === 'young' ? 10 : absolute < 2 ? 22 : 32,
      };
    })
    .sort((a, b) => a.absolute - b.absolute);
}

export const YOUNG_BINS = describeBins(YOUNG_DENSITIES, 'young');
export const OLD_BINS = describeBins(OLD_DENSITIES, 'old');
export const ALL_BINS = [...YOUNG_BINS, ...OLD_BINS];
