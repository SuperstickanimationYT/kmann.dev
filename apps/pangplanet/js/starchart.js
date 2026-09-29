import { crystalWorlds, homeworldSpecies, livingWorlds, stardustWorlds, systemAt, systemsWithin } from './universe.js';

export const VISIT_RANGE = 4e6;
const SUN_FILL = '#fff7dc';
export const OBSERVATION_SECONDS = { crystals: 900, biosignature: 2700 };
export const FULLY_OBSERVED = OBSERVATION_SECONDS.biosignature;
const PLANET_SEARCH_SECONDS = { quickest: 60, slowest: FULLY_OBSERVED };
const TRANSIT_DIFFICULTY = { easiest: 0.25, hardest: 1500 };
const REFERENCE_ORBIT = 300000;
const REFERENCE_RADIUS = 16000;

export const learned = (entry, detail) => entry.visited || entry.watched >= OBSERVATION_SECONDS[detail];

function secondsToFind(planet) {
  const orbit = Math.hypot(planet.x - planet.orbitCenter.x, planet.y - planet.orbitCenter.y);
  const difficulty = (orbit / REFERENCE_ORBIT) ** 1.5 / (planet.radius / REFERENCE_RADIUS) ** 2;
  const { easiest, hardest } = TRANSIT_DIFFICULTY;
  const along = Math.min(1, Math.max(0, Math.log(difficulty / easiest) / Math.log(hardest / easiest)));
  const { quickest, slowest } = PLANET_SEARCH_SECONDS;
  return quickest * (slowest / quickest) ** along;
}

export const foundPlanets = (entry, bodies) => bodies.filter((body) => !body.moon && (entry.visited || secondsToFind(body) <= entry.watched));

export function crystalsSeen(entry, bodies) {
  if (entry.visited) return crystalWorlds(bodies);
  return learned(entry, 'crystals') ? crystalWorlds(foundPlanets(entry, bodies)) : 0;
}

export const starKey = (star) => `${star.name}@${Math.round(star.x)},${Math.round(star.y)}`;

export const createStarChart = () => new Map();

function chartEntry({ star, planets, wormholes }, visited, watched) {
  const entry = { visited, watched: visited ? FULLY_OBSERVED : watched };
  return {
    name: star.name,
    x: star.x,
    y: star.y,
    fill: star.palette?.fill ?? star.mapFill ?? SUN_FILL,
    crystals: crystalsSeen(entry, planets),
    stardust: visited ? stardustWorlds(planets) : 0,
    biosignature: learned(entry, 'biosignature') && Boolean(star.biosignature),
    aliens: visited ? homeworldSpecies(planets) : null,
    life: visited ? livingWorlds(planets) : 0,
    wormhole: visited && wormholes.length > 0,
    ...entry,
  };
}

function chartSystems(chart, systems, visited, watched = 0) {
  let added = 0;
  for (const system of systems) {
    const key = starKey(system.star);
    const known = chart.get(key);
    if (known && (known.visited || (!visited && known.watched >= watched))) continue;
    if (!known) added += 1;
    chart.set(key, chartEntry(system, visited, watched));
  }
  return added;
}

export const chartVisitsNear = (chart, x, y) => chartSystems(chart, systemsWithin(x, y, VISIT_RANGE), true);

export const scanFrom = (chart, x, y, range, watched = 0) => chartSystems(chart, systemsWithin(x, y, range), false, watched);

export function observe(entry, seconds) {
  if (entry.visited || entry.watched >= FULLY_OBSERVED) return [];
  const system = systemAt(entry.x, entry.y);
  const bodies = system?.planets ?? [];
  const planetsBefore = foundPlanets(entry, bodies).length;
  const crystalsBefore = entry.crystals;
  const sawBiosignature = learned(entry, 'biosignature');
  entry.watched = Math.min(FULLY_OBSERVED, entry.watched + seconds);
  entry.crystals = crystalsSeen(entry, bodies);
  const newlyLearned = [];
  if (foundPlanets(entry, bodies).length > planetsBefore) newlyLearned.push('planets');
  if (entry.crystals > crystalsBefore) newlyLearned.push('crystals');
  if (!sawBiosignature && learned(entry, 'biosignature')) {
    entry.biosignature = Boolean(system?.star.biosignature);
    newlyLearned.push('biosignature');
  }
  return newlyLearned;
}

export const isCharted = (chart, star) => chart.has(starKey(star));

export function stardustTip(chart, homeworld, range) {
  const unknownStardust = ({ star, planets }) => {
    const known = chart.get(starKey(star));
    return stardustWorlds(planets) > 0 && !known?.visited && !known?.stardust;
  };
  const system = systemsWithin(homeworld.x, homeworld.y, range).find(unknownStardust);
  if (!system) return null;
  const key = starKey(system.star);
  chart.set(key, { ...(chart.get(key) ?? chartEntry(system, false, 0)), stardust: stardustWorlds(system.planets) });
  return system.star.name;
}
