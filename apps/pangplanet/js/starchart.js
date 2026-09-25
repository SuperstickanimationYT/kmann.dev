import { crystalWorlds, stardustWorlds, systemsWithin } from './universe.js';

export const VISIT_RANGE = 4e6;
const SUN_FILL = '#fff7dc';

export const starKey = (star) => `${star.name}@${Math.round(star.x)},${Math.round(star.y)}`;

export const createStarChart = () => new Map();

function chartEntry({ star, planets }, visited) {
  return {
    name: star.name,
    x: star.x,
    y: star.y,
    fill: star.palette?.fill ?? SUN_FILL,
    planets: planets.length,
    bounty: planets.reduce((sum, planet) => sum + (planet.bounty ?? 0), 0),
    crystals: crystalWorlds(planets),
    stardust: visited ? stardustWorlds(planets) : 0,
    visited,
  };
}

function chartSystems(chart, systems, visited) {
  let added = 0;
  for (const system of systems) {
    const key = starKey(system.star);
    const known = chart.get(key);
    if (known && (known.visited || !visited)) continue;
    if (!known) added += 1;
    chart.set(key, chartEntry(system, visited));
  }
  return added;
}

export const chartVisitsNear = (chart, x, y) => chartSystems(chart, systemsWithin(x, y, VISIT_RANGE), true);

export const scanFrom = (chart, x, y, range) => chartSystems(chart, systemsWithin(x, y, range), false);

export const isCharted = (chart, star) => chart.has(starKey(star));
