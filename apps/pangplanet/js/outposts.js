import { drainBatteries, fillBatteries, storedCharge, sunlight, transferCharge } from './solar.js';
import { chargeFromPanels, createVessel, placeVessel, vesselFromSave } from './vessels.js';
import { BATTERY_BANK, MINING_RIG, OBSERVATORY, SATELLITE } from './world.js';

export const createSatellite = () => ({ ...createVessel(SATELLITE.blocks), light: 0 });
export const satelliteFromSave = (saved) => vesselFromSave(saved, SATELLITE.blocks);

export function deploySatellite(satellite, spot) {
  placeVessel(satellite, spot);
  satellite.light = sunlight(spot.x, spot.y);
}

export function chargeSatellite(satellite, seconds) {
  if (satellite?.deployed) chargeFromPanels(satellite, satellite.light, seconds);
}

export function takeSatelliteCharge(satellite, power) {
  transferCharge(satellite.batteries, power.batteries);
}

export const createBank = () => createVessel(BATTERY_BANK.blocks);
export const bankFromSave = (saved) => vesselFromSave(saved, BATTERY_BANK.blocks);
export const deployBank = placeVessel;

export const createObservatory = () => ({ ...createVessel(OBSERVATORY.blocks), light: 0 });
export const observatoryFromSave = (saved) => vesselFromSave(saved, OBSERVATORY.blocks);

export function deployObservatory(observatory, spot) {
  placeVessel(observatory, spot);
  observatory.light = sunlight(spot.x, spot.y);
}

export const runsOnStarlight = (observatory) => observatory.light >= OBSERVATORY.minLight;

export const observatorySecondsLeft = (observatory) => storedCharge(observatory.batteries) * OBSERVATORY.secondsPerBattery;

export function runObservatory(observatory, seconds) {
  if (!observatory.deployed) return 0;
  if (runsOnStarlight(observatory)) return seconds;
  const powered = Math.min(seconds, observatorySecondsLeft(observatory));
  drainBatteries(observatory.batteries, powered / OBSERVATORY.secondsPerBattery);
  return powered;
}

export const createRig = () => ({ ...createVessel(MINING_RIG.blocks), heading: 0, site: '', gold: 0 });

export function rigFromSave({ charge, ...saved }) {
  const rig = vesselFromSave(saved, MINING_RIG.blocks);
  if (charge) fillBatteries(rig.batteries, charge);
  return rig;
}

export function deployRig(rig, rocket) {
  placeVessel(rig, rocket);
  Object.assign(rig, { heading: rocket.heading, site: rocket.soi.name, territory: rocket.soi.territory ?? null });
}

export function loadRig(rig, power, keep = 0) {
  transferCharge(power.batteries, rig.batteries, keep);
}

export const rigCharge = (rig) => storedCharge(rig.batteries);

export function runRig(rig, seconds) {
  if (!rig?.deployed) return;
  const poweredSeconds = Math.min(seconds, rigSecondsLeft(rig));
  drainBatteries(rig.batteries, poweredSeconds / MINING_RIG.secondsPerBattery);
  rig.gold += (poweredSeconds / 60) * MINING_RIG.goldPerMinute;
}

export function collectGold(rig) {
  const collected = Math.floor(rig.gold);
  rig.gold -= collected;
  return collected;
}

export const rigSecondsLeft = (rig) => rigCharge(rig) * MINING_RIG.secondsPerBattery;

export const withinReach = (rocket, outpost, range) => outpost?.deployed && Math.hypot(rocket.x - outpost.x, rocket.y - outpost.y) < range;
