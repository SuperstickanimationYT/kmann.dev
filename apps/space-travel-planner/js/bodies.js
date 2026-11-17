export const BODY_SOURCE = 'GM and equatorial radius from JPL Solar System Dynamics, Planetary Physical Parameters (ssd.jpl.nasa.gov/planets/phys_par.html).';

const LOWEST_SAFE_ALTITUDE_KM = 300;
const LOWEST_SAFE_ALTITUDE_SHARE = 0.05;
const DEFAULT_APOAPSIS_RADII = 20;

export const BODIES = {
  mercury: { mu: 22031.87, radius: 2440.53 },
  venus: { mu: 324858.59, radius: 6051.8 },
  earth: { mu: 398600.44, radius: 6378.137 },
  mars: { mu: 42828.37, radius: 3396.19 },
  jupiter: { mu: 126686531.9, radius: 71492 },
  saturn: { mu: 37931206.2, radius: 60268 },
  uranus: { mu: 5793951.3, radius: 25559 },
  neptune: { mu: 6835100.0, radius: 24764 },
};

export function defaultPeriapsisAltitude(planet) {
  return Math.round(Math.max(LOWEST_SAFE_ALTITUDE_KM, BODIES[planet].radius * LOWEST_SAFE_ALTITUDE_SHARE));
}

export function defaultApoapsisAltitude(planet) {
  return Math.round(BODIES[planet].radius * DEFAULT_APOAPSIS_RADII);
}
