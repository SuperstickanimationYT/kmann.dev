/*
 * Pack real spacecraft paths into the small files Sail the Stars ships.
 *
 * Usage: node tools/build-spacecraft-paths.mjs <raw-folder>
 *
 * Source: JPL Horizons, ssd.jpl.nasa.gov/api/horizons.api (public domain, no key). Tables missing
 * from the raw folder are fetched, about 15 MB of text. Positions come around the Sun every few
 * days, then around each planet a craft comes close to, found with the game's own planets.
 *
 * data/spacecraft-paths.bin, little-endian, 28 bytes per row: int32 minutes since J2000, then six
 * float32. Rows of a 'states' stretch hold position (km) and velocity (km/s) in the J2000 equator;
 * rows of an 'orbits' stretch hold a (km), e and inclination, node, periapsis argument and mean
 * anomaly (radians). data/spacecraft-paths.json lists the stretches of each craft in file order.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { elementsOf } from '../js/kepler.js';
import { equatorialToFrame } from '../js/milky-way.js';
import { placeBodies } from '../js/solar-system.js';
import { betweenStates, GRAVITY, J2000_MS, MINUTE_MS } from '../js/spacecraft-paths.js';

const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const HOUR = 3600000;
const DAY = 24 * HOUR;
const CRUISE_STEP = 4 * DAY;
const COASTING_STEP = 200 * DAY;
const LOW_ORBIT_STEP = 30 * DAY;
const LONG_STAY = 60 * DAY;
const NEAR_SPHERES = 1.2;
const CRUISE_TOLERANCE = 1e-5;
const STAY_TOLERANCE = 3e-3;
const LEAST_TOLERANCE_KM = 3;
const LONGEST_REACH = 600;
const BYTES_PER_ROW = 28;
const RAW = process.argv[2];
const DATA = new URL('../data/', import.meta.url);

const CENTRES = { Sun: 10, Mercury: 199, Venus: 299, Earth: 399, Moon: 301, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799, Neptune: 899, Pluto: 999, Ceres: 2000001 };
const SPHERES_KM = { Mercury: 112000, Venus: 616000, Earth: 924000, Mars: 576000, Jupiter: 48.2e6, Saturn: 54.5e6, Uranus: 51.8e6, Neptune: 86.8e6, Pluto: 3.1e6 };

const date = (text) => Date.parse(`${text}Z`);

const CRAFT = [
  { name: 'Voyager 1', id: -31, from: '1977-09-05T15:00', to: '2099-12-01T00:00', coastsFrom: '1981-06-01T00:00' },
  { name: 'Voyager 2', id: -32, from: '1977-08-20T17:00', to: '2099-12-01T00:00', coastsFrom: '1990-06-01T00:00' },
  { name: 'Pioneer 10', id: -23, from: '1972-03-03T04:00', to: '2049-12-01T00:00', coastsFrom: '1975-01-01T00:00' },
  { name: 'Pioneer 11', id: -24, from: '1973-04-06T04:00', to: '2049-12-01T00:00', coastsFrom: '1980-06-01T00:00' },
  { name: 'New Horizons', id: -98, from: '2006-01-19T21:00', to: '2049-12-01T00:00', coastsFrom: '2019-06-01T00:00' },
  { name: 'Galileo', id: -77, from: '1989-10-19T02:00', to: '2003-09-21T18:00' },
  { name: 'Cassini', id: -82, from: '1997-10-15T10:00', to: '2017-09-15T10:00' },
  { name: 'Juno', id: -61, from: '2011-08-05T18:00', to: '2028-09-01T00:00' },
  { name: 'Ulysses', id: -55, from: '1990-10-06T20:00', to: '2049-12-01T00:00' },
  { name: 'MESSENGER', id: -236, from: '2004-08-03T08:00', to: '2015-04-30T19:00', orbits: [{ centre: 'Mercury', from: '2011-03-18T06:00' }] },
  { name: 'Dawn', id: -203, from: '2007-09-27T14:00', to: '2043-10-01T00:00', orbits: [{ centre: 'Ceres', from: '2015-05-01T00:00' }] },
  { name: 'Rosetta', id: -226, from: '2004-03-02T10:00', to: '2016-09-30T10:00' },
  { name: 'Parker Solar Probe', id: -96, from: '2018-08-12T09:00', to: '2029-12-30T00:00' },
  { name: 'Solar Orbiter', id: -144, from: '2020-02-10T06:00', to: '2030-11-19T00:00' },
  { name: 'BepiColombo', id: -121, from: '2018-10-20T03:00', to: '2027-04-10T00:00' },
  { name: 'JUICE', id: -28, from: '2023-04-14T14:00', to: '2031-07-20T00:00' },
  { name: 'Europa Clipper', id: -159, from: '2024-10-14T17:00', to: '2034-09-02T00:00' },
  { name: 'Lucy', id: -49, from: '2021-10-16T12:00', to: '2033-03-12T00:00' },
  { name: 'Psyche', id: -255, from: '2023-10-13T17:00', to: '2029-02-24T00:00' },
  { name: 'OSIRIS-REx', id: -64, from: '2016-09-09T00:00', to: '2030-03-22T00:00' },
  { name: 'Hayabusa2', id: -37, from: '2014-12-03T07:00', to: '2027-02-18T00:00' },
  { name: 'Kepler', id: -227, from: '2009-03-07T06:00', to: '2099-12-01T00:00' },
  { name: 'Tesla Roadster', id: -143205, from: '2018-02-07T04:00', to: '2089-12-01T00:00' },
  { name: 'James Webb Space Telescope', id: -170, from: '2021-12-25T14:00', to: '2031-11-15T00:00', around: 'Earth', step: 2 * DAY },
  { name: 'Roman Space Telescope', id: -211, from: '2026-08-30T13:00', to: '2028-11-15T00:00', around: 'Earth', step: 2 * DAY },
  { name: 'SOHO', id: -21, from: '1995-12-02T10:00', to: '2026-12-14T00:00', around: 'Earth', step: 2 * DAY },
  { name: 'Gaia', id: -139479, from: '2013-12-19T11:00', to: '2099-12-01T00:00' },
  { name: 'Artemis II', id: -1024, from: '2026-04-02T02:00', to: '2026-04-10T23:00', around: 'Earth', step: HOUR },
  { name: 'International Space Station', id: -125544, from: '1998-11-20T00:00', to: '2026-12-23T00:00', orbits: [{ centre: 'Earth' }] },
  { name: 'Tiangong', id: -148274, from: '2021-04-29T00:00', to: '2026-12-23T00:00', orbits: [{ centre: 'Earth' }] },
  { name: 'Hubble Space Telescope', id: -48, from: '1990-04-25T03:00', to: '2027-02-01T00:00', orbits: [{ centre: 'Earth' }] },
  { name: 'Lunar Reconnaissance Orbiter', id: -85, from: '2009-06-23T12:00', to: '2028-04-16T00:00', orbits: [{ centre: 'Moon' }] },
  { name: 'Mars Reconnaissance Orbiter', id: -74, from: '2005-08-12T13:00', to: '2027-01-18T00:00', orbits: [{ centre: 'Mars', from: '2006-03-11T00:00' }] },
  { name: 'MAVEN', id: -202, from: '2013-11-18T20:00', to: '2026-02-28T00:00', orbits: [{ centre: 'Mars', from: '2014-09-23T00:00' }] },
].map((craft) => ({
  ...craft,
  from: date(craft.from),
  to: date(craft.to),
  coastsFrom: craft.coastsFrom && date(craft.coastsFrom),
  orbits: craft.orbits?.map((orbit) => ({ ...orbit, from: date(orbit.from ?? craft.from) })),
}));

const JOINS_WITHIN = 3 * DAY;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
let fetchedBytes = 0;

async function tableOf(name, { id }, centre, from, to, step) {
  const file = join(RAW, `${name.replace(/\W+/g, '-')}.csv`);
  if (!existsSync(file)) {
    const query = `format=text&COMMAND='${id}'&OBJ_DATA='NO'&EPHEM_TYPE=VECTORS&CENTER='500@${CENTRES[centre]}'&START_TIME='${isoOf(from)}'&STOP_TIME='${isoOf(to)}'&STEP_SIZE='${step / MINUTE_MS}m'&VEC_TABLE='2'&REF_PLANE='FRAME'&CSV_FORMAT='YES'`;
    const text = await (await fetch(`${API}?${query.replaceAll(' ', '%20')}`)).text();
    fetchedBytes += text.length;
    if (!text.includes('$$SOE')) throw new Error(`${name}: ${text.slice(-500)}`);
    writeFileSync(file, text);
  }
  const body = readFileSync(file, 'utf8').split('$$SOE')[1].split('$$EOE')[0];
  return body.trim().split('\n').map((line) => {
    const cells = line.split(',');
    const [x, y, z, vx, vy, vz] = cells.slice(2, 8).map(Number);
    const ms = Math.round((Number(cells[0]) - 2451545) * 1440) * MINUTE_MS + J2000_MS;
    return { ms, position: [x, y, z], velocity: [vx, vy, vz] };
  });
}

const placed = new Map();
function planetAt(ms, planet) {
  const slot = Math.round(ms / (6 * HOUR));
  if (!placed.has(slot)) placed.set(slot, new Map(placeBodies(slot * 6 * HOUR).map(({ name, fromSunKm }) => [name, fromSunKm])));
  return placed.get(slot).get(planet);
}

const apart = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));

function staysNear(samples, planet) {
  const stays = [];
  const reach = SPHERES_KM[planet] * NEAR_SPHERES;
  for (let k = 0; k + 1 < samples.length; k++) {
    const [a, b] = [samples[k], samples[k + 1]];
    const seconds = (b.ms - a.ms) / 1000;
    const roomKm = reach + 2 * apart(a.position, b.position) + 40 * seconds;
    if (apart(equatorialToFrame(a.position), planetAt(a.ms, planet)) > roomKm) continue;
    for (let ms = a.ms; ms < b.ms; ms += 3 * HOUR) {
      const share = (ms - a.ms) / (b.ms - a.ms);
      const kinkKm = share * (1 - share) * apart(a.velocity, b.velocity) * seconds * 0.5;
      const place = equatorialToFrame(betweenStates(a, b, GRAVITY.Sun, ms));
      if (apart(place, planetAt(ms, planet)) > reach + Math.min(kinkKm, reach)) continue;
      const last = stays.at(-1);
      if (last && ms - last.to < 2 * DAY) last.to = ms;
      else stays.push({ from: ms, to: ms });
    }
  }
  return stays;
}

function keptRows(samples, centre, tolerance) {
  const kept = [samples[0]];
  let start = 0;
  const reaches = (end) => {
    for (let k = start + 1; k < end; k++) {
      const { ms, position } = samples[k];
      const miss = apart(betweenStates(samples[start], samples[end], GRAVITY[centre], ms), position);
      if (!(miss < Math.max(LEAST_TOLERANCE_KM, tolerance * Math.hypot(...position)))) return false;
    }
    return true;
  };
  while (start < samples.length - 1) {
    let good = start + 1;
    let step = 1;
    while (good + step < samples.length && good + step - start < LONGEST_REACH && reaches(good + step)) {
      good += step;
      step *= 2;
    }
    for (; step >= 1; step = Math.floor(step / 2)) if (good + step < samples.length && reaches(good + step)) good += step;
    kept.push(samples[good]);
    start = good;
  }
  return kept;
}

function joined(stays) {
  const kept = [];
  for (const stay of stays.sort((a, b) => a.start - b.start)) {
    const last = kept.findLast(({ planet }) => planet === stay.planet);
    if (last && stay.start - last.end < JOINS_WITHIN) {
      last.samples.push(...stay.samples.filter(({ ms }) => ms > last.samples.at(-1).ms));
      last.end = Math.max(last.end, stay.end);
    } else kept.push(stay);
  }
  return kept;
}

async function stretchesOf(craft) {
  const { name, from, to, coastsFrom, orbits = [], around, step } = craft;
  const stretches = [];
  const addStates = (centre, samples, tolerance) => {
    if (samples.length < 2) return;
    stretches.push({ centre, kind: 'states', rows: keptRows(samples, centre, tolerance).map(({ ms, position, velocity }) => [ms, ...position, ...velocity]) });
  };
  if (around) addStates(around, await tableOf(`${name} ${around}`, craft, around, from, to, step), STAY_TOLERANCE);
  else if (orbits[0]?.from !== from) {
    const cruiseEnds = Math.min(coastsFrom ?? to, orbits[0]?.from ?? to);
    const cruise = await tableOf(`${name} cruise`, craft, 'Sun', from, cruiseEnds, CRUISE_STEP);
    const stays = [];
    for (const planet of Object.keys(SPHERES_KM)) {
      for (const [index, stay] of staysNear(cruise, planet).entries()) {
        const start = Math.max(from, stay.from - DAY);
        const end = Math.min(cruiseEnds, stay.to + DAY);
        if (end - start < 4 * HOUR) continue;
        const samples = await tableOf(`${name} ${planet} ${index}`, craft, planet, start, end, end - start > LONG_STAY ? 6 * HOUR : HOUR);
        stays.push({ planet, start, end, samples });
      }
    }
    const coasting = coastsFrom ? (await tableOf(`${name} coasting`, craft, 'Sun', coastsFrom, to, COASTING_STEP)).slice(1) : [];
    const outside = [...cruise, ...coasting].filter(({ ms }) => !stays.some(({ start, end }) => ms > start + 2 * DAY && ms < end - 2 * DAY));
    addStates('Sun', outside, CRUISE_TOLERANCE);
    for (const { planet, samples } of joined(stays)) addStates(planet, samples, STAY_TOLERANCE);
  }
  for (const orbit of orbits) {
    const samples = await tableOf(`${name} ${orbit.centre} orbit`, craft, orbit.centre, orbit.from, to, LOW_ORBIT_STEP);
    const rows = samples.map((sample) => {
      const { a, e, inclination, node, periapsisArgument, meanAnomaly } = elementsOf(sample, GRAVITY[orbit.centre]);
      return [sample.ms, a, e, inclination, node, periapsisArgument, meanAnomaly];
    });
    stretches.push({ centre: orbit.centre, kind: 'orbits', rows: rows.filter(([, a, e]) => a > 0 && e < 1) });
  }
  return stretches;
}

mkdirSync(RAW, { recursive: true });
const listed = {};
const rows = [];
for (const craft of CRAFT) {
  const stretches = await stretchesOf(craft);
  listed[craft.name] = { from: craft.from, to: craft.to, stretches: stretches.map(({ centre, kind, rows: own }) => [centre, kind, own.length]) };
  rows.push(...stretches.flatMap((stretch) => stretch.rows));
  console.log(craft.name, stretches.map(({ centre, rows: own }) => `${centre} ${own.length}`).join(', '), `| fetched ${(fetchedBytes / 1e6).toFixed(1)} MB`);
}
const packed = Buffer.alloc(rows.length * BYTES_PER_ROW);
rows.forEach(([ms, ...values], index) => {
  packed.writeInt32LE(Math.round((ms - J2000_MS) / MINUTE_MS), index * BYTES_PER_ROW);
  values.forEach((value, k) => packed.writeFloatLE(value, index * BYTES_PER_ROW + 4 + 4 * k));
});
writeFileSync(new URL('spacecraft-paths.bin', DATA), packed);
writeFileSync(new URL('spacecraft-paths.json', DATA), JSON.stringify(listed));
console.log(rows.length, 'rows,', packed.length, 'bytes');
