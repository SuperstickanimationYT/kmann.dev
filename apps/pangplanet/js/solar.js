import { bodies } from './universe.js';
import { BATTERY, CHARGE_PER_SECOND_AT_STAR_SURFACE, TICKS_PER_SECOND } from './world.js';

export function createPower() {
  return { ownsPanels: false, panelsDeployed: false, batteries: [] };
}

// Inverse square falloff, 1 at a star's surface.
export function sunlight(x, y) {
  const stars = bodies.filter((body) => body.kind === 'star');
  return Math.max(0, ...stars.map((star) => Math.min(1, (star.radius / Math.hypot(x - star.x, y - star.y)) ** 2)));
}

export const chargedBatteries = (power) => power.batteries.filter((charge) => charge >= 1).length;
export const freeBatterySlots = (power) => BATTERY.slots - power.batteries.length;

export function togglePanels(power, rocket) {
  if (!power.ownsPanels || rocket.destroyed) return;
  power.panelsDeployed = !power.panelsDeployed;
  if (power.panelsDeployed) rocket.engineOn = false;
}

export function losePowerCargo(power) {
  power.panelsDeployed = false;
  power.batteries = [];
}

// Runs on wall-clock ticks so time warp cannot shortcut a trip to the star.
export function chargeBatteries(power, rocket, wallTicks) {
  if (!power.panelsDeployed) return;
  let energy = sunlight(rocket.x, rocket.y) * CHARGE_PER_SECOND_AT_STAR_SURFACE * (wallTicks / TICKS_PER_SECOND);
  for (let i = 0; i < power.batteries.length && energy > 0; i++) {
    const room = 1 - power.batteries[i];
    const added = Math.min(room, energy);
    power.batteries[i] += added;
    energy -= added;
  }
}
