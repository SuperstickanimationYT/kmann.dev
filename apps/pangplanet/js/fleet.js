import { ftlSpeed } from './ftl.js';
import { chargeRate, fillBatteries, roomToCharge, storedCharge } from './solar.js';
import { formatLightSpeed } from './units.js';
import { placeVessel } from './vessels.js';
import { CRASH_SPEED, FUSION, HULL_PAINTS, SHIP, SHIP_BLOCKS } from './world.js';

const OLD_LAYOUT_COLUMNS = 2;
const WEDGE_TURNS = 4;
const SIDES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const cellKey = (col, row) => `${col},${row}`;
const countParts = (ship, type) => ship.parts.filter((part) => part.type === type).length;
const startingParts = () => SHIP.startingParts.map((part) => ({ ...part }));

export function createShip(spot) {
  const ship = { deployed: false, x: 0, y: 0, vx: 0, vy: 0, parts: startingParts(), batteries: [], heading: 0, fuel: 0, riderFuel: 0, ftlTier: 0, hydrogen: 0 };
  placeVessel(ship, spot);
  ship.fuel = flightStats(ship).fuelCapacity;
  return ship;
}

function packListedBlocks(blocks) {
  const ordered = [...blocks.filter((type) => type !== 'engine'), ...blocks.filter((type) => type === 'engine')];
  return ordered.map((type, index) => ({ type, col: index % OLD_LAYOUT_COLUMNS, row: Math.floor(index / OLD_LAYOUT_COLUMNS) }));
}

export function shipFromSave({ blocks, ...saved }) {
  const parts = saved.parts ?? (blocks ? packListedBlocks(blocks) : startingParts());
  return { ftlTier: 0, hydrogen: 0, batteries: [], heading: 0, fuel: 0, riderFuel: 0, ...saved, parts };
}

export const shipMass = (ship) => ship.parts.reduce((mass, part) => mass + SHIP_BLOCKS[part.type].mass, SHIP.hullMass);

export const flightStats = (ship) => ({
  thrust: (countParts(ship, 'engine') * SHIP.engineForce) / shipMass(ship),
  burnRate: countParts(ship, 'engine'),
  fuelCapacity: countParts(ship, 'tank') * SHIP.fuelPerTank,
  crashSpeed: CRASH_SPEED,
  armor: countParts(ship, 'armor'),
});

export function breakArmor(ship) {
  const armor = ship.parts.find((part) => part.type === 'armor');
  if (armor) Object.assign(armor, { type: 'plate', paint: 'steel' });
}

export const hasFtl = (ship) => countParts(ship, 'ftl') > 0;

export const canFit = (ship, type) => !(SHIP_BLOCKS[type].onePerShip && countParts(ship, type) > 0);

export function openSpots(ship) {
  const taken = new Set(ship.parts.map(({ col, row }) => cellKey(col, row)));
  const spots = new Map();
  for (const { col, row } of ship.parts) {
    for (const [dc, dr] of SIDES) {
      const key = cellKey(col + dc, row + dr);
      if (!taken.has(key)) spots.set(key, { col: col + dc, row: row + dr });
    }
  }
  return [...spots.values()];
}

export const canPlace = (ship, type, { col, row }) => canFit(ship, type) && openSpots(ship).some((spot) => spot.col === col && spot.row === row);

function newPart(type, { col, row }, { paint, turn }) {
  const part = { type, col, row };
  if (SHIP_BLOCKS[type].structural) part.paint = paint in HULL_PAINTS ? paint : 'steel';
  if (type === 'wedge') part.turn = Number.isInteger(turn) && turn >= 0 && turn < WEDGE_TURNS ? turn : 0;
  return part;
}

export function addPart(ship, type, spot, look = {}) {
  ship.parts.push(newPart(type, spot, look));
  if (type === 'battery') ship.batteries.push(0);
}

function allConnected(parts) {
  const unreached = new Map(parts.map((part) => [cellKey(part.col, part.row), part]));
  const frontier = [parts[0]];
  unreached.delete(cellKey(parts[0].col, parts[0].row));
  while (frontier.length) {
    const { col, row } = frontier.pop();
    for (const [dc, dr] of SIDES) {
      const key = cellKey(col + dc, row + dr);
      if (!unreached.has(key)) continue;
      frontier.push(unreached.get(key));
      unreached.delete(key);
    }
  }
  return unreached.size === 0;
}

export function canRemove(ship, index) {
  const rest = ship.parts.filter((_, other) => other !== index);
  return rest.length > 0 && allConnected(rest);
}

export function removePart(ship, index) {
  const [{ type }] = ship.parts.splice(index, 1);
  if (type === 'battery') ship.batteries.pop();
  if (type === 'ftl') ship.ftlTier = 0;
  ship.fuel = Math.min(ship.fuel, flightStats(ship).fuelCapacity);
  ship.hydrogen = Math.min(ship.hydrogen, hydrogenCapacity(ship));
  return type;
}

export function partBounds(parts) {
  const cols = parts.map((part) => part.col);
  const rows = parts.map((part) => part.row);
  return { minCol: Math.min(...cols), maxCol: Math.max(...cols), minRow: Math.min(...rows), maxRow: Math.max(...rows) };
}

export const partColour = (part) => (SHIP_BLOCKS[part.type].structural ? (HULL_PAINTS[part.paint] ?? HULL_PAINTS.steel).colour : SHIP_BLOCKS[part.type].colour);

export function buildPlan(ship) {
  const parts = ship.parts.map((part, index) => ({ ...part, index, colour: partColour(part), label: SHIP_BLOCKS[part.type].label, removable: canRemove(ship, index) }));
  return [...parts, ...openSpots(ship).map((spot) => ({ ...spot, open: true }))];
}

export function engineNozzles(ship) {
  const { minCol, maxCol, minRow, maxRow } = partBounds(ship.parts);
  const [midCol, midRow] = [(minCol + maxCol + 1) / 2, (minRow + maxRow + 1) / 2];
  return ship.parts
    .filter((part) => part.type === 'engine')
    .map((part) => ({ part, forward: -(part.row + 1 - midRow) * SHIP.blockSize, sideways: (part.col + 0.5 - midCol) * SHIP.blockSize }));
}

export const chargeShip = (ship, light, seconds) => fillBatteries(ship.batteries, chargeRate(light) * countParts(ship, 'panel') * seconds);

export const hydrogenCapacity = (ship) => countParts(ship, 'hydrogenTank') * FUSION.tankSize;

export const hydrogenShare = (ship) => (hydrogenCapacity(ship) ? ship.hydrogen / hydrogenCapacity(ship) : null);

export const canScoop = (ship, light) => countParts(ship, 'scoop') > 0 && light >= FUSION.scoopMinLight && ship.hydrogen < hydrogenCapacity(ship);

export function scoopHydrogen(ship, light, seconds) {
  if (!canScoop(ship, light)) return;
  const lifted = countParts(ship, 'scoop') * FUSION.scoopPerSecond * light * seconds;
  ship.hydrogen = Math.min(hydrogenCapacity(ship), ship.hydrogen + lifted);
}

export function runReactor(ship, tank, seconds) {
  const reactors = countParts(ship, 'reactor');
  const fuel = Math.min(flightStats(ship).fuelCapacity - tank.fuel, reactors * FUSION.fuelPerSecond * seconds, ship.hydrogen / FUSION.hydrogenPerFuel);
  if (fuel > 0) {
    tank.fuel += fuel;
    ship.hydrogen -= fuel * FUSION.hydrogenPerFuel;
  }
  const charge = Math.min(roomToCharge(ship.batteries), reactors * FUSION.chargePerSecond * seconds, ship.hydrogen / FUSION.hydrogenPerCharge);
  if (charge <= 0) return;
  fillBatteries(ship.batteries, charge);
  ship.hydrogen -= charge * FUSION.hydrogenPerCharge;
}

export function takeHelm(ship, rocket) {
  ship.riderFuel = rocket.fuel;
  Object.assign(rocket, flightStats(ship), { x: ship.x, y: ship.y, vx: 0, vy: 0, heading: ship.heading, fuel: ship.fuel, engineOn: false });
}

export function moveWithPilot(ship, rocket) {
  Object.assign(ship, { x: rocket.x, y: rocket.y, heading: rocket.heading, fuel: rocket.fuel });
}

export function leaveHelm(ship, rocket) {
  moveWithPilot(ship, rocket);
  rocket.fuel = ship.riderFuel;
  rocket.engineOn = false;
}

export function describeShip(ship) {
  const { thrust, fuelCapacity } = flightStats(ship);
  const charge = ship.batteries.length ? ` · charge ${storedCharge(ship.batteries).toFixed(1)}/${ship.batteries.length}` : '';
  const capacity = hydrogenCapacity(ship);
  const hydrogen = capacity ? ` · hydrogen ${Math.floor(ship.hydrogen)}/${capacity}` : '';
  const ftl = hasFtl(ship) ? ` · FTL tier ${ship.ftlTier}, up to ${formatLightSpeed(ftlSpeed(ship))}` : '';
  return `${ship.parts.length} blocks · mass ${shipMass(ship)} · thrust ${thrust.toFixed(2)}× · fuel ${Math.round(ship.fuel)}/${fuelCapacity}${charge}${hydrogen}${ftl}`;
}
