import { DAY_SECONDS } from './ephemeris.js';

const UNIX_EPOCH_JULIAN = 2440587.5;
const TT_MINUS_UTC_SECONDS = 69.184;
export const DAYS_PER_YEAR = 365.25;

export function julianFromUtcMs(ms) {
  return UNIX_EPOCH_JULIAN + (ms / 1000 + TT_MINUS_UTC_SECONDS) / DAY_SECONDS;
}

export function utcMsFromJulian(julianDate) {
  return ((julianDate - UNIX_EPOCH_JULIAN) * DAY_SECONDS - TT_MINUS_UTC_SECONDS) * 1000;
}

export function julianFromIsoDate(iso) {
  return julianFromUtcMs(Date.parse(iso));
}

export function isoDate(julianDate) {
  return new Date(utcMsFromJulian(julianDate)).toISOString().slice(0, 10);
}
