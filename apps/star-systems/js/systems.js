export const AU_KM = 149597870.7;
export const SUN_KM = 695700;
export const EARTH_KM = 6371;
export const JUPITER_KM = 69911;

const YEAR_DAYS = 365.25;

function conservativeHabitableZone(around, luminositySun) {
  const root = Math.sqrt(luminositySun);
  return { kind: 'habitable', around, inner: 0.99 * root, outer: 1.7 * root, label: 'Habitable zone' };
}

const solarSystem = {
  id: 'solar',
  name: 'Solar System',
  distance: 'Home',
  blurb: 'Our own system: one G-type star, eight planets, and belts of rock and ice. Planet positions start at their real places for today\'s date, flattened onto one plane.',
  homeAU: 34,
  speed: 10,
  bodies: [
    { name: 'Sun', kind: 'star', radiusKm: SUN_KM, massSun: 1, temperatureK: 5772, spectral: 'G2V', color: '#fff1d6',
      note: 'About 4.6 billion years old. Holds 99.86% of the system\'s mass.' },
    { name: 'Mercury', kind: 'planet', parent: 'Sun', radiusKm: 2439.7, massEarth: 0.0553, color: '#9a8f87',
      orbit: { a: 0.3871, e: 0.2056, periodDays: 87.969, periapsisDeg: 77.46, meanAnomalyDeg: 174.79 },
      note: 'Smallest planet. Almost no atmosphere, so days reach 430 °C and nights drop to −180 °C.' },
    { name: 'Venus', kind: 'planet', parent: 'Sun', radiusKm: 6051.8, massEarth: 0.815, color: '#e3c58f',
      orbit: { a: 0.7233, e: 0.0068, periodDays: 224.701, periapsisDeg: 131.57, meanAnomalyDeg: 50.41 },
      note: 'A thick CO₂ atmosphere traps heat, making it the hottest planet at about 465 °C.' },
    { name: 'Earth', kind: 'planet', parent: 'Sun', radiusKm: EARTH_KM, massEarth: 1, color: '#3f7fd6',
      orbit: { a: 1, e: 0.0167, periodDays: 365.256, periapsisDeg: 102.94, meanAnomalyDeg: -2.48 },
      note: 'The only place life is known to exist.' },
    { name: 'Moon', kind: 'moon', parent: 'Earth', radiusKm: 1737.4, massEarth: 0.0123, color: '#b9b5ad',
      orbit: { a: 384400 / AU_KM, e: 0.0549, periodDays: 27.3217, periapsisDeg: 83.35, meanAnomalyDeg: 134.96 },
      note: 'Probably formed from debris after a Mars-sized body hit the young Earth.' },
    { name: 'Mars', kind: 'planet', parent: 'Sun', radiusKm: 3389.5, massEarth: 0.107, color: '#c1532f',
      orbit: { a: 1.5237, e: 0.0934, periodDays: 686.98, periapsisDeg: 336.04, meanAnomalyDeg: 19.41 },
      note: 'A cold desert with the tallest volcano in the Solar System, Olympus Mons.' },
    { name: 'Jupiter', kind: 'planet', parent: 'Sun', radiusKm: JUPITER_KM, massEarth: 317.8, color: '#d8b48a',
      orbit: { a: 5.2026, e: 0.0485, periodDays: 4332.59, periapsisDeg: 14.75, meanAnomalyDeg: 19.65 },
      note: 'More than twice the mass of all the other planets combined.' },
    { name: 'Saturn', kind: 'planet', parent: 'Sun', radiusKm: 58232, massEarth: 95.2, color: '#e2cf98',
      rings: { innerKm: 74500, outerKm: 136780 },
      orbit: { a: 9.5549, e: 0.0555, periodDays: 10759.22, periapsisDeg: 92.43, meanAnomalyDeg: -42.49 },
      note: 'Its main rings span about 270,000 km but are mostly only tens of metres thick.' },
    { name: 'Uranus', kind: 'planet', parent: 'Sun', radiusKm: 25362, massEarth: 14.5, color: '#9fd8e0',
      orbit: { a: 19.218, e: 0.0463, periodDays: 30688.5, periapsisDeg: 170.96, meanAnomalyDeg: 142.27 },
      note: 'Spins on its side, tilted 98°.' },
    { name: 'Neptune', kind: 'planet', parent: 'Sun', radiusKm: 24622, massEarth: 17.1, color: '#4a6fe0',
      orbit: { a: 30.11, e: 0.009, periodDays: 60195, periapsisDeg: 44.97, meanAnomalyDeg: 259.91 },
      note: 'Has the fastest winds measured in the Solar System, over 2,000 km/h.' },
    { name: 'Pluto', kind: 'dwarf planet', parent: 'Sun', radiusKm: 1188.3, massEarth: 0.0022, color: '#c9a98a',
      orbit: { a: 39.48, e: 0.2488, periodDays: 90560, periapsisDeg: 224.07, meanAnomalyDeg: 14.86 },
      note: 'A Kuiper belt dwarf planet whose orbit dips inside Neptune\'s.' },
  ],
  zones: [
    conservativeHabitableZone('Sun', 1),
    { kind: 'belt', around: 'Sun', inner: 2.1, outer: 3.3, label: 'Asteroid belt' },
    { kind: 'belt', around: 'Sun', inner: 30, outer: 50, label: 'Kuiper belt' },
  ],
};

const trappist = {
  id: 'trappist-1',
  name: 'TRAPPIST-1',
  distance: '40.7 light-years',
  blurb: 'An ultracool red dwarf with seven Earth-sized planets, three of them in the habitable zone. All seven would fit well inside Mercury\'s orbit, and they are locked in a chain of orbital resonances.',
  homeAU: 0.075,
  speed: 0.5,
  bodies: [
    { name: 'TRAPPIST-1', kind: 'star', radiusKm: 0.1192 * SUN_KM, massSun: 0.0898, temperatureK: 2566, spectral: 'M8V', color: '#ff7a3c',
      note: 'Barely larger than Jupiter and about 7.6 billion years old, older than the Sun.' },
    { name: 'b', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 1.116 * EARTH_KM, massEarth: 1.374, color: '#a0726a', guess: { airAtMost: 0, dry: true },
      orbit: { a: 0.01154, e: 0, periodDays: 1.51088, periapsisDeg: 0, meanAnomalyDeg: 10 },
      note: 'JWST measured its dayside at about 500 K, consistent with bare rock and no thick atmosphere.' },
    { name: 'c', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 1.097 * EARTH_KM, massEarth: 1.308, color: '#b08a6e', guess: { airAtMost: 15 },
      orbit: { a: 0.0158, e: 0, periodDays: 2.42182, periapsisDeg: 0, meanAnomalyDeg: 120 },
      note: 'JWST rules out a thick Venus-like CO₂ atmosphere.' },
    { name: 'd', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 0.788 * EARTH_KM, massEarth: 0.388, color: '#8f8c9a',
      orbit: { a: 0.02227, e: 0, periodDays: 4.0498, periapsisDeg: 0, meanAnomalyDeg: 230 },
      note: 'Sits at the inner edge of the habitable zone.' },
    { name: 'e', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 0.92 * EARTH_KM, massEarth: 0.692, color: '#5f8fb0',
      orbit: { a: 0.02925, e: 0, periodDays: 6.0996, periapsisDeg: 0, meanAnomalyDeg: 300 },
      note: 'In the habitable zone. Its size and density are the closest of the seven to Earth\'s.' },
    { name: 'f', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 1.045 * EARTH_KM, massEarth: 1.039, color: '#7fa6c2',
      orbit: { a: 0.03849, e: 0, periodDays: 9.20669, periapsisDeg: 0, meanAnomalyDeg: 40 },
      note: 'In the habitable zone; may be an ice-covered world.' },
    { name: 'g', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 1.129 * EARTH_KM, massEarth: 1.321, color: '#9cb8cc',
      orbit: { a: 0.04683, e: 0, periodDays: 12.35294, periapsisDeg: 0, meanAnomalyDeg: 160 },
      note: 'At the outer edge of the habitable zone.' },
    { name: 'h', kind: 'planet', parent: 'TRAPPIST-1', radiusKm: 0.755 * EARTH_KM, massEarth: 0.326, color: '#c2ccd6',
      orbit: { a: 0.06189, e: 0, periodDays: 18.7729, periapsisDeg: 0, meanAnomalyDeg: 270 },
      note: 'Outermost and coldest, beyond the habitable zone.' },
  ],
  zones: [
    { kind: 'habitable', around: 'TRAPPIST-1', inner: 0.024, outer: 0.049, label: 'Habitable zone' },
  ],
};

const tauCeti = {
  id: 'tau-ceti',
  name: 'Tau Ceti',
  distance: '11.9 light-years',
  blurb: 'A lone Sun-like star, older and poorer in metals than the Sun, inside a debris disk with far more dust than our Kuiper belt. Its four planets are radial-velocity candidates: only minimum masses are known, and the sizes shown are estimates.',
  homeAU: 1.6,
  speed: 5,
  bodies: [
    { name: 'Tau Ceti', kind: 'star', radiusKm: 0.793 * SUN_KM, massSun: 0.783, temperatureK: 5344, spectral: 'G8V', color: '#ffe6c2',
      note: 'One of the first two stars searched for alien radio signals, by Project Ozma in 1960.' },
    { name: 'g', kind: 'planet', parent: 'Tau Ceti', candidate: true, radiusKm: 1.17 * EARTH_KM, radiusEstimated: true, massEarth: 1.75, minimumMass: true, color: '#a87d62',
      orbit: { a: 0.133, e: 0.06, periodDays: 20, periapsisDeg: 40, meanAnomalyDeg: 0 },
      note: 'Hot inner candidate.' },
    { name: 'h', kind: 'planet', parent: 'Tau Ceti', candidate: true, radiusKm: 1.18 * EARTH_KM, radiusEstimated: true, massEarth: 1.83, minimumMass: true, color: '#b39375',
      orbit: { a: 0.243, e: 0.23, periodDays: 49.41, periapsisDeg: 160, meanAnomalyDeg: 90 },
      note: 'Hot inner candidate.' },
    { name: 'e', kind: 'planet', parent: 'Tau Ceti', candidate: true, radiusKm: 1.5 * EARTH_KM, radiusEstimated: true, massEarth: 3.93, minimumMass: true, color: '#c4a37a',
      orbit: { a: 0.538, e: 0.18, periodDays: 162.87, periapsisDeg: 260, meanAnomalyDeg: 200 },
      note: 'Inside the inner edge of the habitable zone, so probably too hot for liquid water.' },
    { name: 'f', kind: 'planet', parent: 'Tau Ceti', candidate: true, radiusKm: 1.5 * EARTH_KM, radiusEstimated: true, massEarth: 3.93, minimumMass: true, color: '#8fb0c9',
      orbit: { a: 1.334, e: 0.16, periodDays: 636.13, periapsisDeg: 330, meanAnomalyDeg: 300 },
      note: 'Just past the outer edge of the conservative habitable zone.' },
  ],
  zones: [
    conservativeHabitableZone('Tau Ceti', 0.52),
    { kind: 'belt', around: 'Tau Ceti', inner: 10, outer: 55, label: 'Debris disk' },
  ],
};

const alphaCentauriPeriodDays = 79.76 * YEAR_DAYS;
const alphaCentauriSeparationAU = 23.5;
const alphaCentauriA = 1.0788;
const alphaCentauriB = 0.9092;
const alphaCentauriMeanAnomaly = 200.6;

const alphaCentauri = {
  id: 'alpha-centauri',
  name: 'Alpha Centauri',
  distance: '4.37 light-years (Proxima 4.25)',
  blurb: 'The nearest star system: two Sun-like stars orbiting each other every 80 years, and the red dwarf Proxima about 13,000 AU away. Proxima has the nearest known exoplanets; JWST has imaged a giant planet candidate around A. A and B start at their real positions for today, Proxima\'s planets at arbitrary ones.',
  homeAU: 40,
  speed: 200,
  bodies: [
    { name: 'α Cen A', kind: 'star', radiusKm: 1.2175 * SUN_KM, massSun: alphaCentauriA, temperatureK: 5790, spectral: 'G2V', color: '#fff1d6',
      orbit: { a: alphaCentauriSeparationAU * alphaCentauriB / (alphaCentauriA + alphaCentauriB), e: 0.52, periodDays: alphaCentauriPeriodDays, periapsisDeg: 0, meanAnomalyDeg: alphaCentauriMeanAnomaly },
      note: 'Slightly bigger and brighter than the Sun. Together A and B look like the third-brightest star in the night sky.' },
    { name: 'α Cen B', kind: 'star', radiusKm: 0.8591 * SUN_KM, massSun: alphaCentauriB, temperatureK: 5260, spectral: 'K1V', color: '#ffd6a0',
      orbit: { a: alphaCentauriSeparationAU * alphaCentauriA / (alphaCentauriA + alphaCentauriB), e: 0.52, periodDays: alphaCentauriPeriodDays, periapsisDeg: 180, meanAnomalyDeg: alphaCentauriMeanAnomaly },
      note: 'An orange dwarf, a little smaller and cooler than the Sun. A and B swing between 11 and 36 AU apart.' },
    { name: 'Ab', kind: 'planet', parent: 'α Cen A', candidate: true, radiusKm: 1.05 * JUPITER_KM, radiusEstimated: true, massEarth: 100, color: '#cdb38f',
      orbit: { a: 1.7, e: 0.4, periodDays: 2.13 * YEAR_DAYS, periapsisDeg: 60, meanAnomalyDeg: 0 },
      note: 'A gas giant candidate imaged directly by JWST in 2024, in A\'s habitable zone. Mass is roughly 90–150 Earths and the orbit is only loosely known.' },
    { name: 'Proxima', kind: 'star', radiusKm: 0.1542 * SUN_KM, massSun: 0.1221, temperatureK: 2992, spectral: 'M5.5V', color: '#ff8a4c',
      orbit: { a: 8700, e: 0.5, periodDays: 547000 * YEAR_DAYS, periapsisDeg: 300, meanAnomalyDeg: 180 },
      note: 'A flaring red dwarf and the closest star to the Sun. It takes about 550,000 years to orbit A and B.' },
    { name: 'Proxima d', kind: 'planet', parent: 'Proxima', radiusKm: 0.69 * EARTH_KM, radiusEstimated: true, massEarth: 0.26, minimumMass: true, color: '#9a8c84',
      orbit: { a: 0.02885, e: 0, periodDays: 5.122, periapsisDeg: 0, meanAnomalyDeg: 70 },
      note: 'Confirmed in 2022; one of the lightest planets ever found from a star\'s wobble.' },
    { name: 'Proxima b', kind: 'planet', parent: 'Proxima', radiusKm: 1.03 * EARTH_KM, radiusEstimated: true, massEarth: 1.07, minimumMass: true, color: '#b07f5e',
      orbit: { a: 0.04857, e: 0.02, periodDays: 11.1868, periapsisDeg: 0, meanAnomalyDeg: 250 },
      note: 'The nearest known exoplanet, in Proxima\'s habitable zone. Proxima\'s flares may have stripped its atmosphere.' },
    { name: 'Proxima c', kind: 'planet', parent: 'Proxima', candidate: true, radiusKm: 1.8 * EARTH_KM, radiusEstimated: true, massEarth: 7, minimumMass: true, color: '#9fb4c8',
      orbit: { a: 1.489, e: 0.04, periodDays: 1928, periapsisDeg: 0, meanAnomalyDeg: 140 },
      note: 'A super-Earth or mini-Neptune candidate far out at 1.5 AU, around 40 K. Reported in 2020 from the star\'s wobble; a 2025 search with the NIRPS spectrograph could not confirm it.' },
  ],
  zones: [
    conservativeHabitableZone('α Cen A', 1.519),
    conservativeHabitableZone('α Cen B', 0.5),
    { kind: 'habitable', around: 'Proxima', inner: 0.042, outer: 0.082, label: 'Habitable zone' },
  ],
};

const tCrbPeriodDays = 227.57;
const tCrbSeparationAU = 0.99;
const tCrbGiant = 1.12;
const tCrbDwarf = 1.37;

const tCoronaeBorealis = {
  id: 't-crb',
  name: 'T Coronae Borealis',
  distance: 'about 3,000 light-years',
  blurb: 'The Blaze Star: a red giant and a white dwarf in a 228-day orbit. Gas pulled off the giant piles onto the white dwarf until it ignites in a nova about every 80 years, briefly as bright as the North Star. The last one was in 1946; the next is expected around now.',
  homeAU: 1.3,
  speed: 5,
  bodies: [
    { name: 'Red giant', kind: 'star', radiusKm: 75 * SUN_KM, radiusEstimated: true, massSun: tCrbGiant, temperatureK: 3600, spectral: 'M3III', color: '#ff9d5c',
      orbit: { a: tCrbSeparationAU * tCrbDwarf / (tCrbGiant + tCrbDwarf), e: 0, periodDays: tCrbPeriodDays, periapsisDeg: 0, meanAnomalyDeg: 0 },
      note: 'Swollen until it fills its Roche lobe, so gas spills off its near side toward the white dwarf.' },
    { name: 'White dwarf', kind: 'remnant', radiusKm: 2000, radiusEstimated: true, massSun: tCrbDwarf, color: '#e6efff',
      orbit: { a: tCrbSeparationAU * tCrbGiant / (tCrbGiant + tCrbDwarf), e: 0, periodDays: tCrbPeriodDays, periapsisDeg: 180, meanAnomalyDeg: 0 },
      note: 'Close to the 1.4 M☉ limit for a white dwarf, which is why its novas come so often. Earth-sized or smaller, yet heavier than the Sun.' },
  ],
  zones: [
    { kind: 'disk', around: 'White dwarf', inner: 0.01, outer: 0.25, label: 'Accretion disk (size approximate)' },
    { kind: 'stream', from: 'Red giant', to: 'White dwarf', label: 'Gas stream' },
  ],
};

export const SYSTEMS = [solarSystem, trappist, tauCeti, alphaCentauri, tCoronaeBorealis];
