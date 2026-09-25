import { bodies } from './universe.js';
import { BATTERY, CHARGE_PER_SECOND_AT_STAR_SURFACE, TICKS_PER_SECOND } from './world.js';

export function createPower() {
  return { ownsPanels: false, panelsDeployed: false, batteries: [], slots: BATTERY.slots, panelBoost: 1 };
}

const lightFrom = (star, x, y) => Math.min(1, (star.radius / Math.hypot(x - star.x, y - star.y)) ** 2);
const loadedStars = () => bodies.filter((body) => body.kind === 'star');

export const sunlight = (x, y) => Math.max(0, ...loadedStars().map((star) => lightFrom(star, x, y)));

export const brightestStar = (x, y) => loadedStars().reduce((best, star) => (!best || lightFrom(star, x, y) > lightFrom(best, x, y) ? star : best), null);

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

export function transferCharge(from, to, keep = 0) {
  fillBatteries(to, drainBatteries(from, Math.max(0, Math.min(roomToCharge(to), storedCharge(from) - keep))));
}

// Runs on wall-clock ticks so time warp cannot shortcut a trip to the star.
export function chargeBatteries(power, rocket, wallTicks) {
  if (!power.panelsDeployed) return;
  fillBatteries(power.batteries, chargeRate(sunlight(rocket.x, rocket.y)) * power.panelBoost * (wallTicks / TICKS_PER_SECOND));
}
