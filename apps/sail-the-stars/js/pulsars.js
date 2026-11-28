import { planets } from './exoplanet-data.js';
import { DEGREES } from './milky-way.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';

export const NEUTRON_STAR_RADIUS_KM = 12;
export const GRAVITY_KM_PER_SUN = 1.476625;
const ASSUMED_SUNS = 1.4;
const UNKNOWN_OLD_KELVIN = 1e5;
const UNKNOWN_KELVIN_NOTE = 'unknown; shown at 100,000 K';
const EARTH_MASSES_PER_SUN = 332946;
const RANKIN_BEAM_DEGREES = 5.75;
const MS_PER_YEAR = 365.25 * 86400000;
const YEAR_2000_MS = Date.UTC(2000, 0, 1, 12);

export const apparentRadiusKm = (suns) => NEUTRON_STAR_RADIUS_KM / Math.sqrt(1 - (2 * GRAVITY_KM_PER_SUN * suns) / NEUTRON_STAR_RADIUS_KM);
const rankinBeamDegrees = (periodSeconds) => Math.min(90, RANKIN_BEAM_DEGREES / Math.sqrt(periodSeconds));

const DOUBLE_PULSAR_B = {
  periodSeconds: 2.77346077007,
  suns: 1.2489,
  kelvin: UNKNOWN_OLD_KELVIN,
  kelvinNote: UNKNOWN_KELVIN_NOTE,
  massMeasured: true,
  kind: 'Pulsar B of the Double Pulsar',
  seenFromEarth: 'radio, until 2008',
  precession: { tiltDegrees: 130, magneticTiltDegrees: 70.9, degreesPerYear: 4.77, phaseDegreesIn2008: 52.3, beamDegrees: 8.8, year: 2008.2 },
  story: 'Its beam swept off Earth in 2008: its spin axis precesses once every 75 years, carrying the beam with it.',
};

export const PULSAR_SYSTEMS = [
  {
    name: 'Crab Pulsar', ra: 83.6330565, dec: 22.0144980, parsecs: 2000, motion: [-11.34, 2.65], radialKmS: 0, visual: 16.6,
    pulsar: {
      periodSeconds: 0.0333924123, suns: ASSUMED_SUNS, kelvin: 1.6e6, kelvinNote: 'under 2 million K; not measured',
      seenFromEarth: 'radio, visible light, X-rays, gamma rays',
      spin: { positionAngle: 124, fromEarthDegrees: 61.3 },
      visiblePulses: { between: 0.012, peaks: [{ phase: 0, height: 1, halfHeightWidth: 0.046 }, { phase: 0.39, height: 0.28, halfHeightWidth: 0.091 }] },
      story: 'Left by the supernova seen from Earth in 1054. It flashes in visible light 30 times a second, one of very few pulsars bright enough.',
    },
    planets: [],
  },
  {
    name: 'Vela Pulsar', ra: 128.83588121, dec: -45.17635419, parsecs: 280, motion: [-49.68, 29.9], radialKmS: 0, visual: 23.6,
    pulsar: {
      periodSeconds: 0.089328385024, suns: ASSUMED_SUNS, kelvin: 6.8e5,
      seenFromEarth: 'radio, visible light (faint), X-rays, gamma rays',
      spin: { positionAngle: 130.6, fromEarthDegrees: 63.6 },
      story: 'Left by a supernova roughly 11,000 years ago; the brightest steady source in the gamma-ray sky.',
    },
    planets: [],
  },
  {
    name: 'Geminga', ra: 98.475637, dec: 17.770252, parsecs: 190, motion: [138, 97], radialKmS: 0, visual: 25.5,
    pulsar: {
      periodSeconds: 0.237099441692, suns: ASSUMED_SUNS, kelvin: 5e5,
      seenFromEarth: 'gamma rays and X-rays; radio telescopes barely detect it',
      radioQuiet: true,
      spin: { fromEarthDegrees: 50 },
      story: 'Its name means "Gemini gamma-ray source", and in Milanese "it\'s not there": for years nothing could be seen at its place.',
    },
    planets: [],
  },
  {
    name: 'PSR B1257+12', ra: 195.0149029, dec: 12.68235336, parsecs: 709, motion: [45.5, -84.7], radialKmS: 0,
    pulsar: {
      periodSeconds: 0.00621853194840048, suns: ASSUMED_SUNS, kelvin: UNKNOWN_OLD_KELVIN, kelvinNote: UNKNOWN_KELVIN_NOTE,
      seenFromEarth: 'radio',
      spinAlongOrbits: true,
      story: 'Named Lich. Its planets, found in 1992 by timing these pulses, were the first known beyond the Solar System.',
    },
    planets: planets(
      ['c', 1.5, 4.3, 66.5419, 0.3595, 0.0186, 53.1, 250.4, 37, null, 2449768.6, false, 'measured'],
      ['b', 0.3, 0.02, 25.262, 0.1885, 0, null, 0, 52, null, 2449765.6, false, 'least'],
      ['d', 1.45, 3.9, 98.2114, 0.466, 0.0252, 46.9, 108.3, 33, null, 2449767.0, false, 'measured'],
    ),
  },
  {
    name: 'Double Pulsar', ra: 114.46353508, dec: -30.66130953, parsecs: 1100, motion: [-3.8, 2.1], radialKmS: 0,
    pulsar: {
      periodSeconds: 0.0226993785996239, suns: 1.3381, kelvin: UNKNOWN_OLD_KELVIN, kelvinNote: UNKNOWN_KELVIN_NOTE, massMeasured: true,
      kind: 'Pulsar A of the Double Pulsar',
      seenFromEarth: 'radio',
      spinAlongOrbits: true,
      story: 'The only known pair where both stars were seen pulsing. The orbit shrinks as it sends out gravitational waves; the two will merge in about 85 million years.',
    },
    planets: planets(['B', 0, 1.2489 * EARTH_MASSES_PER_SUN, 0.10225156248, 0.005876, 0.0877775, 90.501, 87.0331, UNKNOWN_OLD_KELVIN, null, 2453156.407428, false, 'measured']).map((row) => ({ ...row, name: 'Double Pulsar B', pulsar: DOUBLE_PULSAR_B })),
  },
];

export const FWHM_PER_SIGMA = 2 * Math.sqrt(2 * Math.LN2);
const NEIGHBOUR_TURNS = [-1, 0, 1];
const ERF_FIT_SCALE = 0.3275911;
const ERF_FIT = [1.061405429, -1.453152027, 1.421413741, -0.284496736, 0.254829592];

function erf(x) {
  const t = 1 / (1 + ERF_FIT_SCALE * Math.abs(x));
  const fit = ERF_FIT.reduce((total, coefficient) => total * t + coefficient, 0) * t;
  return Math.sign(x) * (1 - fit * Math.exp(-x * x));
}

const sum = (items, valueOf) => items.reduce((total, item) => total + valueOf(item), 0);
const pulseShapes = new WeakMap();

function pulseShape(pulses) {
  if (pulseShapes.has(pulses)) return pulseShapes.get(pulses);
  const peaks = pulses.peaks.map(({ phase, height, halfHeightWidth }) => ({ phase, height, sigma: halfHeightWidth / FWHM_PER_SIGMA }));
  const level = (turn) => pulses.between + sum(peaks, ({ phase, height, sigma }) => sum(NEIGHBOUR_TURNS, (k) => height * Math.exp(-((turn - phase - k) ** 2) / (2 * sigma * sigma))));
  const risenWithinTurn = (turn) =>
    pulses.between * turn +
    sum(peaks, ({ phase, height, sigma }) =>
      sum(NEIGHBOUR_TURNS, (k) => height * sigma * Math.sqrt(Math.PI / 2) * (erf((turn - phase - k) / (sigma * Math.SQRT2)) - erf((-phase - k) / (sigma * Math.SQRT2))))
    );
  const perTurn = risenWithinTurn(1);
  const shape = { risenWithinTurn, perTurn, peak: Math.max(...peaks.map(({ phase }) => level(phase))) / perTurn };
  pulseShapes.set(pulses, shape);
  return shape;
}

export function visibleFlash(pulsar, fromMs, toMs) {
  const shape = pulseShape(pulsar.visiblePulses);
  const [start, end] = [fromMs, toMs].map((ms) => ms / 1000 / pulsar.periodSeconds).sort((a, b) => a - b);
  if (end === start) return { share: 1, peak: shape.peak };
  const wholeTurns = Math.floor(end) - Math.floor(start);
  const risen = wholeTurns * shape.perTurn + shape.risenWithinTurn(end - Math.floor(end)) - shape.risenWithinTurn(start - Math.floor(start));
  return { share: risen / ((end - start) * shape.perTurn), peak: shape.peak };
}

const yearAt = (ms) => 2000 + (ms - YEAR_2000_MS) / MS_PER_YEAR;

function precessingSpin({ tiltDegrees, degreesPerYear, phaseDegreesIn2008, year }, orbitPole, towardEarth, ms) {
  const inPlane = normalize(subtract(towardEarth, scale(orbitPole, dot(towardEarth, orbitPole))));
  const aside = cross(orbitPole, inPlane);
  const phase = (phaseDegreesIn2008 - degreesPerYear * (yearAt(ms) - year)) * DEGREES;
  const tilt = tiltDegrees * DEGREES;
  return add(scale(orbitPole, Math.cos(tilt)), scale(add(scale(inPlane, Math.cos(phase)), scale(aside, Math.sin(phase))), Math.sin(tilt)));
}

function beamCone(pulsar, spinPole, towardEarth, ms) {
  if (pulsar.precession) {
    const { magneticTiltDegrees, beamDegrees } = pulsar.precession;
    return { spin: precessingSpin(pulsar.precession, spinPole, towardEarth, ms), tilt: magneticTiltDegrees * DEGREES, halfWidth: beamDegrees * DEGREES };
  }
  const tilt = Math.acos(Math.max(-1, Math.min(1, dot(spinPole, towardEarth))));
  return { spin: spinPole, tilt, halfWidth: rankinBeamDegrees(pulsar.periodSeconds) * DEGREES };
}

export function beamReaches(pulsar, spinPole, towardEarth, toward, ms) {
  const { spin, tilt, halfWidth } = beamCone(pulsar, spinPole, towardEarth, ms);
  const fromSpin = Math.acos(Math.max(-1, Math.min(1, dot(spin, normalize(toward)))));
  return Math.abs(fromSpin - tilt) < halfWidth || Math.abs(fromSpin - (Math.PI - tilt)) < halfWidth;
}
