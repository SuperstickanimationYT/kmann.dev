import { bodies } from './universe.js';
import { BATTERY, CHARGE_PER_SECOND_AT_STAR_SURFACE, TICKS_PER_SECOND } from './world.js';

export function createPower() {
  return { ownsPanels: false, panelsDeployed: false, batteries: [], slots: BATTERY.slots, panelBoost: 1 };
}

// Inverse square falloff, 1 at a star's surface.
export function sunlight(x, y) {
  const stars = bodies.filter((body) => body.kind === 'star');
  return Math.max(0, ...stars.map((star) => Math.min(1, (star.radius / Math.hypot(x - star.x, y - star.y)) ** 2)));
}

export const chargedBatteries = (power) => power.batteries.filter((charge) => charge >= 1).length;
export const freeBatterySlots = (power) => power.slots - power.batteries.length;

export function togglePanels(power, rocket) {
  if (!power.ownsPanels || rocket.destroyed) return;
  power.panelsDeployed = !power.panelsDeployed;
  if (power.panelsDeployed) rocket.engineOn = false;
}

export function losePowerCargo(power) {
  power.panelsDeployed = false;
  power.batteries = [];
}

export const chargeRate = (light) => light * CHARGE_PER_SECOND_AT_STAR_SURFACE;

export function fillBatteries(batteries, energy) {
  let left = energy;
  for (let i = 0; i < batteries.length && left > 0; i++) {
    const added = Math.min(1 - batteries[i], left);
    batteries[i] += added;
    left -= added;
  }
  return energy - left;
}

export function drainBatteries(batteries, amount) {
  let owed = amount;
  for (let i = batteries.length - 1; i >= 0 && owed > 0; i--) {
    const taken = Math.min(batteries[i], owed);
    batteries[i] -= taken;
    owed -= taken;
  }
  return amount - owed;
}

export const storedCharge = (batteries) => batteries.reduce((sum, charge) => sum + charge, 0);
export const roomToCharge = (batteries) => batteries.length - storedCharge(batteries);

export function transferCharge(from, to) {
  fillBatteries(to, drainBatteries(from, Math.min(roomToCharge(to), storedCharge(from))));
}

// Runs on wall-clock ticks so time warp cannot shortcut a trip to the star.
export function chargeBatteries(power, rocket, wallTicks) {
  if (!power.panelsDeployed) return;
  fillBatteries(power.batteries, chargeRate(sunlight(rocket.x, rocket.y)) * power.panelBoost * (wallTicks / TICKS_PER_SECOND));
}
