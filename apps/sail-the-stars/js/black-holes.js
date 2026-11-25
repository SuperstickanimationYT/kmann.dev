import { directionFromEquatorial, fromGalactic, fromHeliocentric, oldShape, sampleArmMap, SUN_POSITION, SUN_RADIUS } from './milky-way.js';
import { createRandom } from './random.js';
import { forEachCellInSphere, hashCell, poisson } from './stars.js';
import { normalize, rotateAbout, scale, subtract } from './vectors.js';

export const HORIZON_KM_PER_SUN = 2.95325;
const BLACK_HOLES_IN_GALAXY = 1.2e8;
const OLD_SHAPE_OVER_GALAXY = 8.845e11;
const CELL_PC = 20;
const CELL_SALT = 40127;
const NAME_STEPS_PER_PC = 1024;
const LIGHTEST_BLACK_HOLE = 3;
const PROGENITOR = { suns: [17, 150], power: -2.3 };
const METAL_SHARE = { sun: 0.014, logMean: -0.1, logSpread: 0.25, range: [0.004, 0.03] };
const HEAVIEST_SIZED_SUNS = 100;
const FARTHEST_SEARCH_PC = 40000;

const halfStep = (middle, steepness) => (suns) => 0.5 / (1 + 10 ** ((middle - suns) * steepness));

function remnantSuns(suns, metals) {
  const low = halfStep(45.04 - 2.176e3 * metals + 3.806e4 * metals ** 2, 2.79e-2 - 1.78e-2 * metals + 77.05 * metals ** 2);
  const high = halfStep(138.9 - 4.664e3 * metals + 5.106e4 * metals ** 2, 6.73e-3 + 2.69 * metals - 52.39 * metals ** 2);
  const core = -2 + (61.63 - 2.969e3 * metals + 4.988e4 * metals ** 2) * (low(suns) + high(suns));
  const least = 1.34 - 29.46 / (1 + (metals / 1.11e-3) ** 2.361);
  const most = 80.22 - (74.73 * metals ** 0.965) / (2.72e-3 + metals ** 0.965);
  const middle = 5.683 + 3.533 / (1 + (metals / 7.43e-3) ** 1.993);
  const steepness = 1.066 - 1.121 / (1 + (metals / 2.558e-2) ** 0.609);
  const exploded = least + (most - least) / (1 + 10 ** ((middle - core) * steepness));
  return core < 10 ? exploded : Math.max(exploded, 1.217 * core + 1.061);
}

function largestRadiusSuns(suns) {
  const sized = Math.min(suns, HEAVIEST_SIZED_SUNS);
  return 10 ** (1.143 * Math.log10(276.7 * sized) - 5.825e-3 * sized - 1.129);
}

function progenitorOf(remnant) {
  let [low, high] = PROGENITOR.suns;
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2;
    if (remnantSuns(middle, METAL_SHARE.sun) < remnant) low = middle;
    else high = middle;
  }
  return low;
}

const collapsed = (initialSuns, suns) => ({ suns, star: { suns: initialSuns, largestRadiusSuns: largestRadiusSuns(initialSuns) } });

function drawHole(random) {
  const [from, to] = PROGENITOR.suns.map((suns) => suns ** (PROGENITOR.power + 1));
  const [least, most] = METAL_SHARE.range;
  for (;;) {
    const metals = Math.min(most, Math.max(least, METAL_SHARE.sun * 10 ** (METAL_SHARE.logMean + METAL_SHARE.logSpread * random.normal())));
    const initialSuns = (from + (to - from) * random.next()) ** (1 / (PROGENITOR.power + 1));
    const suns = remnantSuns(initialSuns, metals);
    if (suns >= LIGHTEST_BLACK_HOLE) return collapsed(initialSuns, suns);
  }
}

const UNSEEN = { absolute: 60, colour: 0, velocity: [0, 0, 0] };

const GALAXY_CENTRE = fromGalactic(359.9443, -0.0462, SUN_RADIUS);
const FLOW_TILT = Math.PI / 6;
const turningClockwiseFromSun = rotateAbout(normalize(subtract(GALAXY_CENTRE, SUN_POSITION)), [1, 0, 0], FLOW_TILT);

export const SAGITTARIUS_A = {
  name: 'Sagittarius A*',
  position: GALAXY_CENTRE,
  velocity: [0, 0, 0],
  absolute: 3.8,
  colour: 0.2,
  wellKnown: true,
  hole: { suns: 4.297e6, glowing: true, pole: turningClockwiseFromSun, measured: true },
};

const LONE_BLACK_HOLE = {
  ...UNSEEN,
  name: 'OGLE-2011-BLG-0462',
  position: fromHeliocentric(scale(directionFromEquatorial(267.9179, -29.8873), 1520)),
  wellKnown: true,
  hole: { ...collapsed(progenitorOf(7.15), 7.15), measured: true },
};

export const KNOWN_BLACK_HOLES = [SAGITTARIUS_A, LONE_BLACK_HOLE];

function simulatedHole(position, random) {
  const digits = hashCell(...position.map((value) => Math.round(value * NAME_STEPS_PER_PC)), CELL_SALT).toString(16).toUpperCase().padStart(8, '0');
  return { ...UNSEEN, name: `SIM BH ${digits.slice(0, 4)}-${digits.slice(4)}`, position, hole: drawHole(random) };
}

const simulatedCells = new Map();

function holesInCell(ix, iy, iz, armMap) {
  const key = `${ix},${iy},${iz}`;
  if (!simulatedCells.has(key)) {
    const centre = [ix, iy, iz].map((index) => (index + 0.5) * CELL_PC);
    const density = (BLACK_HOLES_IN_GALAXY / OLD_SHAPE_OVER_GALAXY) * oldShape(centre, sampleArmMap(armMap, centre[0], centre[1]));
    const random = createRandom(hashCell(ix, iy, iz, CELL_SALT));
    const holes = Array.from({ length: poisson(random, density * CELL_PC ** 3) }, () => simulatedHole([ix, iy, iz].map((index) => (index + random.next()) * CELL_PC), random));
    simulatedCells.set(key, holes);
  }
  return simulatedCells.get(key);
}

export function blackHolesWithin(centre, reachPc, armMap) {
  const found = [...KNOWN_BLACK_HOLES];
  forEachCellInSphere(centre, reachPc, CELL_PC, (...cell) => found.push(...holesInCell(...cell, armMap)));
  return found
    .map((star) => ({ star, distance: Math.hypot(...subtract(star.position, centre)) }))
    .filter(({ distance }) => distance <= reachPc)
    .sort((a, b) => a.distance - b.distance)
    .map(({ star }) => star);
}

export function nearestBlackHole(centre, armMap, wanted = () => true) {
  for (let reach = CELL_PC; reach < FARTHEST_SEARCH_PC; reach *= 2) {
    const found = blackHolesWithin(centre, reach, armMap).find(wanted);
    if (found) return found;
  }
  return SAGITTARIUS_A;
}
