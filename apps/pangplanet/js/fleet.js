import { ftlSpeed } from './ftl.js';
import { abbreviate } from './hud.js';
import { fillBatteries, roomToCharge, storedCharge } from './solar.js';
import { countBlocks, createVessel, placeVessel, vesselFromSave } from './vessels.js';
import { CRASH_SPEED, FUSION, SHIP, SHIP_BLOCKS } from './world.js';

export function createShip(spot) {
  const ship = { ...createVessel(SHIP.startingBlocks), heading: 0, fuel: 0, riderFuel: 0, ftlTier: 0, hydrogen: 0 };
  placeVessel(ship, spot);
  ship.fuel = flightStats(ship).fuelCapacity;
  return ship;
}

export const shipFromSave = (saved) => ({ ftlTier: 0, hydrogen: 0, ...vesselFromSave(saved, SHIP.startingBlocks) });

export const shipMass = (ship) => ship.blocks.reduce((mass, block) => mass + SHIP_BLOCKS[block].mass, SHIP.hullMass);

export const flightStats = (ship) => ({
  thrust: (countBlocks(ship, 'engine') * SHIP.engineForce) / shipMass(ship),
  burnRate: countBlocks(ship, 'engine'),
  fuelCapacity: countBlocks(ship, 'tank') * SHIP.fuelPerTank,
  crashSpeed: CRASH_SPEED,
});

export const hasRoom = (ship) => ship.blocks.length < SHIP.maxBlocks;

export const canFit = (ship, type) => hasRoom(ship) && !(SHIP_BLOCKS[type].onePerShip && ship.blocks.includes(type));

export const hasFtl = (ship) => ship.blocks.includes('ftl');

export function addBlock(ship, type) {
  ship.blocks.push(type);
  if (type === 'battery') ship.batteries.push(0);
}

export function removeBlock(ship, index) {
  const [type] = ship.blocks.splice(index, 1);
  if (type === 'battery') ship.batteries.pop();
  if (type === 'ftl') ship.ftlTier = 0;
  ship.fuel = Math.min(ship.fuel, flightStats(ship).fuelCapacity);
  ship.hydrogen = Math.min(ship.hydrogen, hydrogenCapacity(ship));
  return type;
}

export const hydrogenCapacity = (ship) => countBlocks(ship, 'hydrogenTank') * FUSION.tankSize;

export const canScoop = (ship, light) => countBlocks(ship, 'scoop') > 0 && light >= FUSION.scoopMinLight && ship.hydrogen < hydrogenCapacity(ship);

export function scoopHydrogen(ship, light, seconds) {
  if (!canScoop(ship, light)) return;
  const lifted = countBlocks(ship, 'scoop') * FUSION.scoopPerSecond * light * seconds;
  ship.hydrogen = Math.min(hydrogenCapacity(ship), ship.hydrogen + lifted);
}

export function runReactor(ship, seconds) {
  const charge = Math.min(roomToCharge(ship.batteries), countBlocks(ship, 'reactor') * FUSION.chargePerSecond * seconds, ship.hydrogen / FUSION.hydrogenPerCharge);
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
  const ftl = hasFtl(ship) ? ` · FTL tier ${ship.ftlTier}, up to ${abbreviate(ftlSpeed(ship))}` : '';
  return `Mass ${shipMass(ship)} · thrust ${thrust.toFixed(2)}× · fuel ${Math.round(ship.fuel)}/${fuelCapacity}${charge}${hydrogen}${ftl}`;
}
