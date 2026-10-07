export const STARS = {
  sun: { name: 'The Sun', massSun: 1, luminositySun: 1, radiusSun: 1, temperatureK: 5772, ageGyr: 4.6 },
  alphaCenA: { name: 'Alpha Centauri A', massSun: 1.079, luminositySun: 1.519, radiusSun: 1.2175, temperatureK: 5790, ageGyr: 5.3 },
  tauCeti: { name: 'Tau Ceti', massSun: 0.783, luminositySun: 0.52, radiusSun: 0.793, temperatureK: 5344, ageGyr: 5.8 },
  epsEridani: { name: 'Epsilon Eridani', massSun: 0.82, luminositySun: 0.32, radiusSun: 0.735, temperatureK: 5084, ageGyr: 0.6 },
  proxima: { name: 'Proxima Centauri', massSun: 0.122, luminositySun: 0.00155, radiusSun: 0.154, temperatureK: 3042, ageGyr: 4.85 },
  trappist1: { name: 'TRAPPIST-1', massSun: 0.0898, luminositySun: 0.000553, radiusSun: 0.1192, temperatureK: 2566, ageGyr: 7.6 },
  sirius: { name: 'Sirius A', massSun: 2.063, luminositySun: 25.4, radiusSun: 1.711, temperatureK: 9940, ageGyr: 0.24 },
};

export const CUSTOM_STAR = 'custom';

export const WORLDS = {
  earth: {
    name: 'Earth',
    star: 'sun',
    planet: { massEarth: 1, radiusEarth: 1, albedo: 0.3, greenhouseK: 33, tiltDeg: 23.4 },
    orbit: { distanceAu: 1, eccentricity: 0.017 },
    rotation: { locked: false, hours: 23.93 },
  },
  mars: {
    name: 'Mars',
    star: 'sun',
    planet: { massEarth: 0.107, radiusEarth: 0.532, albedo: 0.25, greenhouseK: 5, tiltDeg: 25.2 },
    orbit: { distanceAu: 1.524, eccentricity: 0.093 },
    rotation: { locked: false, hours: 24.62 },
  },
  jupiter: {
    name: 'Jupiter',
    star: 'sun',
    planet: { massEarth: 317.8, radiusEarth: 11.21, albedo: 0.5, greenhouseK: 0, tiltDeg: 3.1 },
    orbit: { distanceAu: 5.204, eccentricity: 0.049 },
    rotation: { locked: false, hours: 9.93 },
  },
  proximaB: {
    name: 'Proxima Centauri b',
    star: 'proxima',
    planet: { massEarth: 1.07, radiusEarth: 1.03, albedo: 0.3, greenhouseK: 33, tiltDeg: 0 },
    orbit: { distanceAu: 0.0486, eccentricity: 0.02 },
    rotation: { locked: true, hours: 24 },
  },
  trappist1e: {
    name: 'TRAPPIST-1e',
    star: 'trappist1',
    planet: { massEarth: 0.692, radiusEarth: 0.92, albedo: 0.3, greenhouseK: 33, tiltDeg: 0 },
    orbit: { distanceAu: 0.02925, eccentricity: 0.005 },
    rotation: { locked: true, hours: 24 },
  },
};

export const STARTING_WORLD = 'earth';
