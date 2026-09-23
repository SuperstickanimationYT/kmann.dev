import { bearingBetween } from './physics.js';
import { drainBatteries, storedCharge } from './solar.js';
import { starsWithin } from './universe.js';
import { WARP_DRIVE } from './world.js';

export const totalCharge = (power) => storedCharge(power.batteries);

export const canWarpFrom = (rocket) => !rocket.destroyed && !rocket.landed && !rocket.soi;

export function warpDestinations(rocket, power) {
  const charge = totalCharge(power);
  return starsWithin(rocket.x, rocket.y, WARP_DRIVE.range)
    .map((star) => {
      const distance = Math.hypot(star.x - rocket.x, star.y - rocket.y);
      const cost = distance * WARP_DRIVE.chargePerUnit;
      return { star, distance, cost, affordable: cost <= charge };
    })
    .filter(({ distance }) => distance >= WARP_DRIVE.minimumJump);
}

export function jumpTo(rocket, power, { star, cost }) {
  drainBatteries(power.batteries, cost);
  const bearing = bearingBetween(star.x, star.y, rocket.x, rocket.y);
  const standoff = star.radius * WARP_DRIVE.arrivalInStarRadii;
  Object.assign(rocket, {
    x: star.x + Math.sin(bearing) * standoff,
    y: star.y + Math.cos(bearing) * standoff,
    vx: 0,
    vy: 0,
    heading: bearing + Math.PI,
    engineOn: false,
    soi: null,
  });
}
