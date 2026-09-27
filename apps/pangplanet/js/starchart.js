import { crystalWorlds, homeworldSpecies, stardustWorlds, systemAt, systemsWithin } from './universe.js';

export const VISIT_RANGE = 4e6;
const SUN_FILL = '#fff7dc';
export const OBSERVATION_SECONDS = { planets: 120, crystals: 900, biosignature: 2700 };
export const FULLY_OBSERVED = OBSERVATION_SECONDS.biosignature;
const DETAILS = Object.keys(OBSERVATION_SECONDS);

export const learned = (entry, detail) => entry.visited || entry.watched >= OBSERVATION_SECONDS[detail];

export const starKey = (star) => `${star.name}@${Math.round(star.x)},${Math.round(star.y)}`;

export const createStarChart = () => new Map();

function chartEntry({ star, planets, wormholes }, visited, watched) {
  const entry = { visited, watched: visited ? FULLY_OBSERVED : watched };
  return {
    name: star.name,
    x: star.x,
    y: star.y,
    fill: star.palette?.fill ?? star.mapFill ?? SUN_FILL,
    crystals: learned(entry, 'crystals') ? crystalWorlds(planets) : 0,
    stardust: visited ? stardustWorlds(planets) : 0,
    biosignature: learned(entry, 'biosignature') && Boolean(star.biosignature),
    aliens: visited ? homeworldSpecies(planets) : null,
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
  const before = entry.watched;
  entry.watched = Math.min(FULLY_OBSERVED, before + seconds);
  const newlyLearned = DETAILS.filter((detail) => before < OBSERVATION_SECONDS[detail] && entry.watched >= OBSERVATION_SECONDS[detail]);
  if (!newlyLearned.length) return [];
  const system = systemAt(entry.x, entry.y);
  if (newlyLearned.includes('crystals')) entry.crystals = crystalWorlds(system?.planets ?? []);
  if (newlyLearned.includes('biosignature')) entry.biosignature = Boolean(system?.star.biosignature);
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
