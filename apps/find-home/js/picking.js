import { LY_PER_PC } from './milky-way.js';
import { formatDistance } from './practice.js';
import { KM_PER_PC } from './solar-system.js';
import { KIND } from './stars.js';

const SUN_ABSOLUTE_MAGNITUDE = 4.83;
export const UNNAMED_STAR = 'Unnamed star';
const KM_PER_AU = 149597870.7;
const SHOW_KM_BELOW_AU = 0.01;
const SHOW_LIGHT_YEARS_FROM_AU = 6000;
const MINUTES_PER_YEAR = 525960;
const MINUTES_PER_DAY = 1440;
const SPECTRAL_CLASSES = [
  [30000, 'O'],
  [10500, 'B'],
  [7500, 'A'],
  [6000, 'F'],
  [5200, 'G'],
  [3700, 'K'],
  [0, 'M'],
];
const BODY_KINDS = {
  star: 'Star',
  rocky: 'Rocky planet',
  clouded: 'Cloud-covered planet',
  ocean: 'Ocean world',
  giant: 'Giant planet',
  hazy: 'Hazy world',
};
const STAR_KINDS = {
  [KIND.sun]: 'Our star',
  [KIND.catalogue]: 'Catalogued star (Hipparcos)',
  [KIND.cluster]: 'Simulated young star',
  [KIND.field]: 'Simulated star',
};

const temperatureFromColour = (colourIndex) => 4600 * (1 / (0.92 * colourIndex + 1.7) + 1 / (0.92 * colourIndex + 0.62));
const spectralClass = (kelvin) => SPECTRAL_CLASSES.find(([floor]) => kelvin >= floor)[1];
const magnitude = (value) => value.toFixed(2);

function formatLuminosity(absolute) {
  const solar = 10 ** (0.4 * (SUN_ABSOLUTE_MAGNITUDE - absolute));
  if (solar >= 100) return `${Math.round(solar).toLocaleString('en')} × Sun`;
  if (solar >= 0.01) return `${solar.toPrecision(2)} × Sun`;
  return `${solar.toExponential(1)} × Sun`;
}

function formatLightTravel(parsecs) {
  const years = parsecs * LY_PER_PC;
  const minutes = years * MINUTES_PER_YEAR;
  if (years >= 100) return `${Math.round(years).toLocaleString('en')} years ago`;
  if (years >= 1) return `${years.toFixed(1)} years ago`;
  if (minutes >= MINUTES_PER_DAY) return `${(minutes / MINUTES_PER_DAY).toFixed(1)} days ago`;
  if (minutes >= 1) return `${minutes.toFixed(1)} minutes ago`;
  return `${(minutes * 60).toFixed(1)} seconds ago`;
}

function formatKm(km) {
  const au = km / KM_PER_AU;
  if (au < SHOW_KM_BELOW_AU) return `${Math.round(km).toLocaleString('en')} km`;
  if (au >= SHOW_LIGHT_YEARS_FROM_AU) return formatDistance(km / KM_PER_PC);
  return au >= 10 ? `${Math.round(au).toLocaleString('en')} AU` : `${au.toFixed(2)} AU`;
}

function starFacts(pick) {
  const apparent = pick.absolute + 5 * Math.log10(pick.distance / 10);
  const kelvin = temperatureFromColour(pick.colour);
  const named = pick.kind === KIND.sun || pick.kind === KIND.catalogue;
  return {
    title: pick.kind === KIND.sun ? 'Sun' : (named && pick.name) || UNNAMED_STAR,
    kind: pick.kind === KIND.cluster ? `${STAR_KINDS[KIND.cluster]} in ${pick.name}` : STAR_KINDS[pick.kind],
    facts: [
      ['Distance', formatDistance(pick.distance)],
      ['Brightness from here', `magnitude ${magnitude(apparent)}`],
      ['Absolute magnitude', magnitude(pick.absolute)],
      ['Luminosity', formatLuminosity(pick.absolute)],
      ['Surface', `${Math.round(kelvin / 100) * 100} K, class ${spectralClass(kelvin)}`],
      ['Light left it', formatLightTravel(pick.distance)],
    ],
  };
}

function bodyFacts(pick) {
  const { body } = pick;
  const facts = [
    ['Distance to centre', formatKm(pick.distanceKm)],
    ['Radius', `${Math.round(body.radiusKm).toLocaleString('en')} km`],
  ];
  if (body.parent) facts.push(['Orbits', body.parent]);
  if (body.kind !== 'star') facts.push(['From the Sun', `${body.sunDistanceAu.toFixed(2)} AU`]);
  const kind = body.parent ? `Moon of ${body.parent}` : BODY_KINDS[body.kind];
  return { title: body.name, kind, facts };
}

function deepSkyFacts(pick) {
  return {
    title: pick.name,
    kind: pick.kind === 'galaxy' ? 'Galaxy' : 'Star-forming nebula',
    facts: [
      ['Distance', formatDistance(pick.distance)],
      ['Light left it', formatLightTravel(pick.distance)],
    ],
  };
}

export function describePick(pick) {
  if (pick.kind === 'body') return bodyFacts(pick);
  if (pick.kind === 'galaxy' || pick.kind === 'nebula') return deepSkyFacts(pick);
  return starFacts(pick);
}
