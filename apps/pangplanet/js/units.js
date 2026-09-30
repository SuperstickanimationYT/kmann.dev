import { SPEED_LIMIT, TICKS_PER_SECOND } from './world.js';

const METRES_PER_UNIT = 0.1;
const METRES_PER_KM = 1000;
const ONE_DECIMAL_BELOW = 10;

function withUnit(amount, unit) {
  const rounded = amount < ONE_DECIMAL_BELOW ? Math.round(amount * 10) / 10 : Math.round(amount);
  return `${rounded.toLocaleString()} ${unit}`;
}

function metresOrKm(metres, perSecond = '') {
  if (metres < METRES_PER_KM) return `${Math.round(metres)} m${perSecond}`;
  return withUnit(metres / METRES_PER_KM, `km${perSecond}`);
}

export const formatDistance = (units) => metresOrKm(units * METRES_PER_UNIT);

export const formatSpeed = (unitsPerTick) => metresOrKm(unitsPerTick * TICKS_PER_SECOND * METRES_PER_UNIT, '/s');

export const formatLightSpeed = (unitsPerTick) => `${(Math.round((unitsPerTick / SPEED_LIMIT) * 10) / 10).toLocaleString()}c`;
