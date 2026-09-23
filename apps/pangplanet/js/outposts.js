import { chargeRate, drainBatteries, fillBatteries, roomToCharge, storedCharge, sunlight } from './solar.js';
import { MINING_RIG, SATELLITE } from './world.js';

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
  const wanted = Math.min(roomToCharge(power.batteries), storedCharge(satellite.batteries));
  fillBatteries(power.batteries, drainBatteries(satellite.batteries, wanted));
}

export function createRig() {
  return { deployed: false, x: 0, y: 0, heading: 0, site: '', charge: 0, gold: 0 };
}

export function deployRig(rig, rocket) {
  Object.assign(rig, { deployed: true, x: rocket.x, y: rocket.y, heading: rocket.heading, site: rocket.soi.name });
}

export function loadRig(rig, power) {
  const room = MINING_RIG.batterySlots - rig.charge;
  rig.charge += drainBatteries(power.batteries, Math.min(room, storedCharge(power.batteries)));
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
