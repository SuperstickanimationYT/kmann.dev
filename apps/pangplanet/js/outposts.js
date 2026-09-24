import { chargeRate, drainBatteries, fillBatteries, storedCharge, sunlight, transferCharge } from './solar.js';
import { BATTERY_BANK, MINING_RIG, SATELLITE } from './world.js';

export function createSatellite() {
  return { deployed: false, x: 0, y: 0, light: 0, batteries: Array(SATELLITE.batteries).fill(0) };
}

export function deploySatellite(satellite, rocket) {
  Object.assign(satellite, { deployed: true, x: rocket.x, y: rocket.y, light: sunlight(rocket.x, rocket.y) });
}

export function chargeSatellite(satellite, seconds) {
  if (satellite?.deployed) fillBatteries(satellite.batteries, chargeRate(satellite.light) * seconds);
}

export function takeSatelliteCharge(satellite, power) {
  transferCharge(satellite.batteries, power.batteries);
}

export function createBank() {
  return { deployed: false, x: 0, y: 0, batteries: Array(BATTERY_BANK.batteries).fill(0) };
}

export function deployBank(bank, rocket) {
  Object.assign(bank, { deployed: true, x: rocket.x, y: rocket.y });
}

export function createRig() {
  return { deployed: false, x: 0, y: 0, heading: 0, site: '', charge: 0, gold: 0 };
}

export function deployRig(rig, rocket) {
  Object.assign(rig, { deployed: true, x: rocket.x, y: rocket.y, heading: rocket.heading, site: rocket.soi.name });
}

export function loadRig(rig, power, keep = 0) {
  const room = MINING_RIG.batterySlots - rig.charge;
  rig.charge += drainBatteries(power.batteries, Math.max(0, Math.min(room, storedCharge(power.batteries) - keep)));
}

export function runRig(rig, seconds) {
  if (!rig?.deployed || rig.charge <= 0) return;
  const poweredSeconds = Math.min(seconds, rig.charge * MINING_RIG.secondsPerBattery);
  rig.charge = Math.max(0, rig.charge - poweredSeconds / MINING_RIG.secondsPerBattery);
  rig.gold += (poweredSeconds / 60) * MINING_RIG.goldPerMinute;
}

export function collectGold(rig) {
  const collected = Math.floor(rig.gold);
  rig.gold -= collected;
  return collected;
}

export const rigSecondsLeft = (rig) => rig.charge * MINING_RIG.secondsPerBattery;

export const withinReach = (rocket, outpost, range) => outpost?.deployed && Math.hypot(rocket.x - outpost.x, rocket.y - outpost.y) < range;
