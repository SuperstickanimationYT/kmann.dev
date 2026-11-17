import { PLANETS, SUN_MU, planetElements } from './ephemeris.js';
import { DAYS_PER_YEAR } from './time.js';
import { DAY_SECONDS } from './ephemeris.js';

export const PLANET_LOOKS = {
  mercury: { name: 'Mercury', color: '#a6a6a6' },
  venus: { name: 'Venus', color: '#e3c27f' },
  earth: { name: 'Earth', color: '#4f9be8' },
  mars: { name: 'Mars', color: '#d9623b' },
  jupiter: { name: 'Jupiter', color: '#d9b38c' },
  saturn: { name: 'Saturn', color: '#e8d49b' },
  uranus: { name: 'Uranus', color: '#8fd8e0' },
  neptune: { name: 'Neptune', color: '#5b7cf0' },
};

export { PLANETS };

export function orbitalPeriodDays(planet, julianDate) {
  const { a } = planetElements(planet, julianDate);
  return (2 * Math.PI * Math.sqrt(a ** 3 / SUN_MU)) / DAY_SECONDS;
}

export function hohmannFlightDays(from, to, julianDate) {
  const a1 = planetElements(from, julianDate).a;
  const a2 = planetElements(to, julianDate).a;
  return (Math.PI * Math.sqrt(((a1 + a2) / 2) ** 3 / SUN_MU)) / DAY_SECONDS;
}

export function synodicPeriodDays(from, to, julianDate) {
  const gap = Math.abs(1 / orbitalPeriodDays(from, julianDate) - 1 / orbitalPeriodDays(to, julianDate));
  return gap === 0 ? Infinity : 1 / gap;
}

export const yearsFromDays = (days) => days / DAYS_PER_YEAR;
