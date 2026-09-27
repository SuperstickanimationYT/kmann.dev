import { drainBatteries, storedCharge } from './solar.js';
import { bodies } from './universe.js';
import { FTL, SPEED_LIMIT } from './world.js';

export const ftlSpeed = (ship) => FTL.tiers[ship.ftlTier].speed;
export const nextFtlTier = (ship) => FTL.tiers[ship.ftlTier + 1] ?? null;

function entryAlong(body, x, y, dx, dy) {
  const reach = body.soi + FTL.dropOutMargin;
  const [fx, fy] = [x - body.x, y - body.y];
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - reach * reach;
  if (c <= 0) return 0;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || a === 0) return null;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1 ? t : null;
}

function firstWellAlong(x, y, dx, dy) {
  let first = null;
  for (const body of bodies) {
    const t = entryAlong(body, x, y, dx, dy);
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}

export const nearWell = (rocket) => firstWellAlong(rocket.x, rocket.y, 0, 0) !== null;

export function dropOut(rocket) {
  rocket.vx = Math.sin(rocket.heading) * SPEED_LIMIT;
  rocket.vy = Math.cos(rocket.heading) * SPEED_LIMIT;
}

export function cruise(rocket, ship, dt) {
  const speed = Math.max(SPEED_LIMIT, (ftlSpeed(ship) * rocket.throttle) / 100);
  const dx = Math.sin(rocket.heading) * speed * dt;
  const dy = Math.cos(rocket.heading) * speed * dt;
  const step = speed * dt;
  const well = firstWellAlong(rocket.x, rocket.y, dx, dy);
  const chargeReach = storedCharge(ship.batteries) / FTL.chargePerUnit / step;
  const share = Math.min(1, well ?? 1, chargeReach);
  rocket.x += dx * share;
  rocket.y += dy * share;
  drainBatteries(ship.batteries, step * share * FTL.chargePerUnit);
  rocket.vx = dx / dt;
  rocket.vy = dy / dt;
  if (share === 1) return null;
  dropOut(rocket);
  return well !== null && well <= chargeReach ? 'well' : 'charge';
}
