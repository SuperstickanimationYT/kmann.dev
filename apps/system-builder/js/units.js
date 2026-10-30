export const G = 6.6743e-11;
export const AU = 1.495978707e11;
export const KM = 1000;
export const DAY = 86400;
export const YEAR = 365.25 * DAY;
export const SUN_MASS = 1.98847e30;
export const SUN_RADIUS = 6.957e8;
export const EARTH_MASS = 5.9722e24;
export const EARTH_RADIUS = 6.371e6;
export const STANDARD_GRAVITY = 9.80665;
export const ATM = 101325;
export const EARTH_SCALE_HEIGHT = 8.5 * KM;

export const KINDS = {
  star: 'Star',
  planet: 'Planet',
  moon: 'Moon',
};

const SUN_MASSES = { label: 'Sun masses', si: SUN_MASS };
const EARTH_MASSES = { label: 'Earth masses', si: EARTH_MASS };
const SUN_RADII = { label: 'Sun radii', si: SUN_RADIUS };
const EARTH_RADII = { label: 'Earth radii', si: EARTH_RADIUS };
const KILOMETRES = { label: 'km', si: KM };
const ASTRONOMICAL_UNITS = { label: 'AU', si: AU };

export const UNITS = {
  star: { mass: SUN_MASSES, radius: SUN_RADII, distance: ASTRONOMICAL_UNITS },
  planet: { mass: EARTH_MASSES, radius: EARTH_RADII, distance: ASTRONOMICAL_UNITS },
  moon: { mass: EARTH_MASSES, radius: KILOMETRES, distance: KILOMETRES },
};

export function significant(value, digits = 3) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e6 || magnitude < 1e-3) return value.toExponential(digits - 1).replace('e+', 'e');
  return String(Number(value.toPrecision(digits)));
}

export function duration(seconds) {
  if (seconds >= YEAR) return `${significant(seconds / YEAR)} years`;
  if (seconds >= DAY) return `${significant(seconds / DAY)} days`;
  return `${significant(seconds / 3600)} hours`;
}

export function distance(metres) {
  if (metres >= 0.01 * AU) return `${significant(metres / AU)} AU`;
  return `${significant(metres / KM)} km`;
}
