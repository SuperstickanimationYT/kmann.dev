import { createRandom } from './random.js';
import { speculationShown } from './speculation.js';

const MAP_SIZE = [4096, 2048];
const DEGREES = Math.PI / 180;
const MS_PER_YEAR = 365.25 * 86400000;
const PEOPLE_PER_SQUARE_KM = 3000;
const PEOPLE_FOR_FULL_GLOW = 2000;
const GLOW_GROWTH = 0.3;
const SMALLEST_DOT_TEXELS = 1.4;
const DOT_REACH = 2.6;
const RANK_STEEPNESS = 0.9;
const REPAINT_AFTER_YEARS = 1;
const REPAINT_AFTER_MS = 250;
const MARS_SEED = 4096;
const MARS_TOWNS = 520;
const MARS_FARTHEST_LATITUDE = 52;
const MARS_TOWN_SPACING_KM = [90, 420];
const MARS_TOO_HIGH = [
  { lat: 18.6, lon: -133.8, km: 340 },
  { lat: -1, lon: -112, km: 1150 },
  { lat: 25, lon: 147, km: 180 },
  { lat: 40, lon: -110, km: 420 },
];
const LED_LAMPS = { dim: [1, 0.82, 0.62], bright: [1, 0.95, 0.86] };

const MOON_STATIONS = [
  [-89.45, 222.7], [-88.7, 292], [-85.4, 31.8], [88.6, 33], [-86, 2.9], [8.3, 33.2], [14.1, -56.8], [23.7, -47.4], [-87.4, -8],
  [0.7, 23.5], [-84.9, 120], [26.1, 3.6], [73.5, -10], [-43.3, -11.2], [20.2, 30.8], [-8.5, -15], [45, -31], [9.6, -20.1],
  [16, 59], [-3, 87], [-20, -70], [-58, 14], [5.5, 4.6], [32, -18], [-5.4, -68],
];

const MARS_HUBS = [
  [39.8, -157.9], [38.5, 165], [40.5, 21.5], [12.9, 87], [-5.4, 137.8], [18.4, 77.5], [46.5, 112], [-40, 62], [22.5, -48],
  [-11, -72], [-2, -6], [44, -35], [3, 155], [-14, 175], [30, 60], [-46, 85],
];

function unit(lat, lon) {
  return [Math.cos(lat * DEGREES) * Math.cos(lon * DEGREES), Math.cos(lat * DEGREES) * Math.sin(lon * DEGREES), Math.sin(lat * DEGREES)];
}

function kmBetween([latA, lonA], [latB, lonB], radiusKm) {
  const [a, b] = [unit(latA, lonA), unit(latB, lonB)];
  return radiusKm * Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
}

function marsTowns(radiusKm) {
  const random = createRandom(MARS_SEED);
  const towns = [...MARS_HUBS];
  while (towns.length < MARS_TOWNS) {
    const [fromLat, fromLon] = towns[Math.floor(towns.length * random.next() ** 1.5)];
    const km = MARS_TOWN_SPACING_KM[0] - MARS_TOWN_SPACING_KM[1] * Math.log(1 - 0.98 * random.next());
    const heading = random.between(0, 2 * Math.PI);
    const lat = fromLat + ((km * Math.sin(heading)) / radiusKm) / DEGREES;
    if (Math.abs(lat) > MARS_FARTHEST_LATITUDE) continue;
    const lon = fromLon + ((km * Math.cos(heading)) / radiusKm / Math.cos(lat * DEGREES)) / DEGREES;
    const town = [lat, ((lon + 540) % 360) - 180];
    if (MARS_TOO_HIGH.some((high) => kmBetween(town, [high.lat, high.lon], radiusKm) < high.km)) continue;
    if (towns.some((other) => kmBetween(town, other, radiusKm) < MARS_TOWN_SPACING_KM[0] / 2)) continue;
    towns.push(town);
  }
  return towns;
}

const WORLDS = {
  Moon: {
    radiusKm: 1737.4,
    people: [[2032, 4], [2036, 20], [2060, 200], [2100, 1500], [2200, 8000], [2400, 20000], [3000, 25000]],
    peoplePerFirstTown: 25,
    spread: 0.46,
    towns: () => MOON_STATIONS,
  },
  Mars: {
    radiusKm: 3389.5,
    people: [[2045, 6], [2060, 60], [2100, 1500], [2150, 12000], [2200, 1e5], [2300, 1.5e6], [2500, 2e7], [2750, 6e7], [3000, 1e8]],
    peoplePerFirstTown: 3000,
    spread: 0.6,
    towns: marsTowns,
  },
};

const yearOf = (ms) => 2000 + (ms - Date.UTC(2000, 0, 1)) / MS_PER_YEAR;

function peopleIn({ people }, year) {
  if (year < people[0][0]) return 0;
  const next = people.findIndex(([from]) => from > year);
  if (next < 0) return people.at(-1)[1];
  const [[earlier, few], [later, many]] = [people[next - 1], people[next]];
  return few * (many / few) ** ((year - earlier) / (later - earlier));
}

export function settlementOf(name, ms) {
  const world = WORLDS[name];
  if (!world) return {};
  const year = yearOf(ms);
  return { settlement: { year, people: peopleIn(world, year), lamps: LED_LAMPS } };
}

export const settlementShown = ({ settlement }) => Boolean(settlement) && settlement.people > 0 && speculationShown();

function townsIn(world, people) {
  const towns = (world.placed ??= world.towns(world.radiusKm));
  const reached = Math.min(towns.length, Math.max(1, (people / world.peoplePerFirstTown) ** world.spread));
  const weights = towns.slice(0, Math.ceil(reached)).map((_, rank) => Math.min(1, reached - rank) / (rank + 1) ** RANK_STEEPNESS);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight, rank) => ({ lat: towns[rank][0], lon: towns[rank][1], people: (people * weight) / total }));
}

function paintTown(pixels, radiusKm, { lat, lon, people }) {
  const [width, height] = MAP_SIZE;
  const texelKm = (Math.PI * radiusKm) / height;
  const spreadKm = Math.max(SMALLEST_DOT_TEXELS * texelKm, Math.sqrt(people / PEOPLE_PER_SQUARE_KM / Math.PI));
  const glow = Math.min(1, (people / PEOPLE_FOR_FULL_GLOW) ** GLOW_GROWTH);
  const centre = unit(lat, lon);
  const rows = (DOT_REACH * spreadKm) / texelKm;
  const row = ((90 - lat) / 180) * height;
  const column = ((lon + 180) / 360) * width;
  for (let j = Math.max(0, Math.floor(row - rows)); j <= Math.min(height - 1, Math.ceil(row + rows)); j++) {
    const pixelLat = 90 - ((j + 0.5) / height) * 180;
    const columns = Math.min(width / 2, rows / Math.max(1e-6, Math.cos(pixelLat * DEGREES)));
    for (let k = Math.floor(column - columns); k < column + columns; k++) {
      const there = unit(pixelLat, ((k + 0.5) / width) * 360 - 180);
      const apart = (radiusKm * Math.hypot(there[0] - centre[0], there[1] - centre[1], there[2] - centre[2])) / spreadKm;
      const index = j * width + (((k % width) + width) % width);
      pixels[index] = Math.min(255, pixels[index] + 255 * glow * Math.exp(-apart * apart));
    }
  }
}

export function createSettlementPainter(gl, textureUnit) {
  let texture = null;
  let pixels = null;
  let painted = { name: null, year: 0, at: 0 };

  function prepare() {
    pixels = new Uint8ClampedArray(MAP_SIZE[0] * MAP_SIZE[1]);
    texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, Math.log2(MAP_SIZE[0]) + 1, gl.R8, ...MAP_SIZE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
  }

  function isFresh(name, year) {
    if (painted.name !== name) return false;
    return Math.abs(painted.year - year) < REPAINT_AFTER_YEARS || performance.now() - painted.at < REPAINT_AFTER_MS;
  }

  function paint({ name, settlement: { year, people } }) {
    if (isFresh(name, year)) return;
    if (!texture) prepare();
    pixels.fill(0);
    const world = WORLDS[name];
    for (const town of townsIn(world, people)) paintTown(pixels, world.radiusKm, town);
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ...MAP_SIZE, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(pixels.buffer));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.activeTexture(gl.TEXTURE0);
    painted = { name, year, at: performance.now() };
  }

  return { paint };
}
