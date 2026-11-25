import { HORIZON_KM_PER_SUN } from './black-holes.js';
import { LY_PER_PC } from './milky-way.js';
import { formatDistance } from './practice.js';
import { settlementShown } from './settlements.js';
import { KM_PER_PC } from './solar-system.js';
import { simNow } from './sim-clock.js';
import { flightDates } from './spacecraft.js';
import { KIND } from './stars.js';
import { speculationShown } from './speculation.js';
import { temperatureFromColour } from './stellar-properties.js';
import { spokenHost } from './wormholes.js';

const SUN_ABSOLUTE_MAGNITUDE = 4.83;
const SUN_KELVIN = 5772;
const SHOW_PARSECS_FROM = 0.02;
const UNNAMED_STAR = 'Unnamed star';
const KM_PER_AU = 149597870.7;
const ESTIMATED_MASS = { measured: '', least: 'at least ', guessed: 'about ' };
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

const spectralClass = (kelvin) => SPECTRAL_CLASSES.find(([floor]) => kelvin >= floor)[1];
const magnitude = (value) => value.toFixed(2);

const visualLuminosity = (absolute) => 10 ** (0.4 * (SUN_ABSOLUTE_MAGNITUDE - absolute));
const totalLuminosity = ({ radius, kelvin }) => radius ** 2 * (kelvin / SUN_KELVIN) ** 4;

function formatLuminosity(solar) {
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

const GENERATED = 'procedurally generated';
const ONLY_PLAUSIBLE = 'not real, only plausible and consistent with physics.';
const notRealPlanets = ({ planets, madeUp }) => (madeUp && planets.length ? `The planets are ${ONLY_PLAUSIBLE}` : '');
const notRealPlanet = ({ madeUp, civilization }) => (madeUp ? `This planet is ${ONLY_PLAUSIBLE}${civilization && speculationShown() ? ' Its civilization is speculation.' : ''}` : '');

const planetCount = (count, source) => `${count} ${source} planet${count === 1 ? '' : 's'}`;

function holeKind({ hole, planets }) {
  const source = hole.measured ? 'Black hole' : 'Simulated black hole';
  if (hole.glowing) return `${source} at the centre of the Milky Way`;
  return planets.length ? `${source} with ${planetCount(planets.length, GENERATED)}` : source;
}

const KM_PER_SUN_RADIUS = 695700;
const formatSuns = (suns) => `${Number(suns.toPrecision(3)).toLocaleString('en')} × Sun`;

function holeFacts(pick) {
  const { hole } = pick.hostData;
  const former = hole.star && [
    [hole.measured ? 'Was once, if it formed alone' : 'Was once', `a star of ${formatSuns(hole.star.suns)}`],
    ['Largest radius as a star', `about ${formatKm(hole.star.largestRadiusSuns * KM_PER_SUN_RADIUS)}`],
  ];
  return {
    title: pick.name,
    kind: holeKind(pick.hostData),
    facts: [
      ['Distance', pick.distance < SHOW_PARSECS_FROM ? formatKm(pick.distance * KM_PER_PC) : formatDistance(pick.distance)],
      ['Mass', formatSuns(hole.suns)],
      ['Radius of event horizon', formatKm(hole.suns * HORIZON_KM_PER_SUN)],
      ...(former ?? []),
    ],
    note: notRealPlanets(pick.hostData),
  };
}

function starKind(pick) {
  const { planets, madeUp } = pick.hostData ?? { planets: [] };
  if (planets.length && !madeUp) return `Star with ${planetCount(planets.length, 'known')} here`;
  if (planets.length) return `${STAR_KINDS[pick.kind]} with ${planetCount(planets.length, GENERATED)}`;
  return pick.kind === KIND.cluster ? `${STAR_KINDS[KIND.cluster]} in ${pick.name}` : STAR_KINDS[pick.kind];
}

function starFacts(pick) {
  const apparent = pick.absolute + 5 * Math.log10(pick.distance / 10);
  const kelvin = pick.hostData?.kelvin ?? temperatureFromColour(pick.colour);
  const named = pick.hostData || pick.kind === KIND.sun || pick.kind === KIND.catalogue;
  return {
    title: pick.kind === KIND.sun ? 'Sun' : (named && pick.name) || UNNAMED_STAR,
    kind: starKind(pick),
    facts: [
      ['Distance', formatDistance(pick.distance)],
      ['Brightness from here', `magnitude ${magnitude(apparent)}`],
      ['Absolute magnitude', magnitude(pick.absolute)],
      ['Luminosity', formatLuminosity(pick.hostData ? totalLuminosity(pick.hostData) : visualLuminosity(pick.absolute))],
      ['Surface', `${Math.round(kelvin / 100) * 100} K, class ${spectralClass(kelvin)}`],
      ['Light left it', formatLightTravel(pick.distance)],
    ],
    note: pick.hostData && notRealPlanets(pick.hostData),
  };
}

const GENERATED_KINDS = { rocky: 'Procedurally generated rocky planet', hazy: 'Procedurally generated small gas planet', giant: 'Procedurally generated giant planet' };

function exoplanetKind({ kind, invented, civilization, madeUp }) {
  const peopled = civilization && speculationShown();
  if (madeUp) return `${GENERATED_KINDS[kind]}${peopled ? ' with a civilization' : ''}`;
  if (peopled) return 'Rocky planet, surface and civilization made up';
  if (invented) return 'Rocky planet, surface made up';
  return kind === 'hazy' ? 'Small gas planet, clouds made up' : 'Giant planet, clouds made up';
}

function formatPeriod(days) {
  return days < 1000 ? `${days.toPrecision(3)} days` : `${(days / 365.25).toPrecision(3)} years`;
}

function exoplanetFacts(body, facts) {
  const { earthRadii, earthMasses, radiusMeasured, massKnown, periodDays, kelvin } = body.measured;
  return {
    title: body.name,
    kind: exoplanetKind(body),
    facts: [
      facts[0],
      ['Radius', `${radiusMeasured ? '' : 'about '}${earthRadii.toPrecision(3)} × Earth`],
      ['Mass', `${ESTIMATED_MASS[massKnown]}${Number(earthMasses.toPrecision(3)).toLocaleString('en')} × Earth`],
      ['Orbits', body.host],
      [body.litFrom ? 'From the black hole' : 'From its star', `${body.sunDistanceAu.toPrecision(3)} AU`],
      ['Year', formatPeriod(periodDays)],
      ['Temperature', `about ${Math.round(kelvin)} K`],
    ],
    note: notRealPlanet(body),
  };
}

const DWARF_KINDS = { agreed: 'Dwarf planet', likely: 'Likely dwarf planet' };

function dwarfKind({ dwarf, map }) {
  return dwarf && `${DWARF_KINDS[dwarf]}${map ? '' : ', surface made up'}`;
}

const dateOf = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function formatMetres(km) {
  return km < 10 ? `${Math.round(km * 1000).toLocaleString('en')} m` : formatKm(km);
}

function formatPlace({ lat, lon }) {
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
}

function flightFacts(body) {
  const dates = flightDates(body);
  if (!dates) return [];
  const { from, to } = dates;
  if (simNow() < from) return [[body.on ? 'Lands' : 'Leaves Earth', dateOf(from)]];
  if (simNow() > to) return [[body.ended ? 'Flew' : 'In the game', `${dateOf(from)} to ${dateOf(to)}`]];
  if (!body.fromSunKm) return [];
  if (body.landed) return [['Landed', dateOf(from)], ['Stands at', formatPlace(body.stop)]];
  const around = body.parent === 'Sun' ? 'the Sun' : body.parent === 'Moon' ? 'the Moon' : body.parent;
  return [['Flying since', dateOf(from)], ['Speed', `${body.kmPerSecond.toFixed(body.kmPerSecond < 10 ? 2 : 1)} km/s, measured from ${around}`]];
}

function craftFacts({ body, distanceKm }) {
  return {
    title: body.name,
    kind: body.on ? `${body.rover ? 'Rover' : 'Lander'} on ${body.on === 'Moon' ? 'the Moon' : body.on}` : 'Spacecraft',
    facts: [...(body.fromSunKm ? [['Distance', formatMetres(distanceKm)]] : []), ['Sent by', body.agency], ...flightFacts(body), ['', body.did]],
  };
}

function wormholeFacts({ body, distanceKm }) {
  return {
    title: body.name,
    kind: 'Wormhole (made up)',
    facts: [
      ['Distance', formatMetres(distanceKm)],
      ['Radius of throat', formatMetres(body.radiusKm)],
      ['At', `60° ahead of ${body.host === 'Sun' ? body.planet : `${body.host} ${body.planet}`}`],
      ['Leads to', spokenHost(body.leadsTo)],
      ['Built by', body.builders],
      ...(body.opened ? [['Opened', String(body.opened)]] : []),
    ],
  };
}

function bodyFacts(pick) {
  const { body } = pick;
  if (body.kind === 'wormhole') return wormholeFacts(pick);
  if (body.kind === 'craft') return craftFacts(pick);
  const facts = [
    ['Distance to centre', formatKm(pick.distanceKm)],
    ['Radius', `${Math.round(body.radiusKm).toLocaleString('en')} km`],
  ];
  if (body.parent) facts.push(['Orbits', body.parent]);
  if (body.measured) return exoplanetFacts(body, facts);
  if (body.kind !== 'star') facts.push(['From the Sun', `${body.sunDistanceAu.toFixed(2)} AU`]);
  if (settlementShown(body)) facts.push(['People (made up)', `about ${Number(body.settlement.people.toPrecision(2)).toLocaleString('en')}`]);
  if (body.kind === 'mirror') return { title: body.name, kind: 'Swarm of mirrors (made up)', facts };
  if (body.terraforming) {
    const { stage, temperature, people } = body.terraforming;
    facts.push(['Terraforming (made up)', stage], ['Temperature', temperature]);
    if (people > 0) facts.push(['People', `about ${Number(people.toPrecision(2)).toLocaleString('en')}`]);
  }
  const kind = body.parent ? `Moon of ${body.parent}` : dwarfKind(body) ?? BODY_KINDS[body.kind];
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
  return pick.hostData?.hole ? holeFacts(pick) : starFacts(pick);
}
