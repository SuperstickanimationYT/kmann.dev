import { SCIENCE, SOLAR_SAIL, TICKS_PER_SECOND } from './world.js';

export const createStudies = () => new Set();

export function study(studies, key, amount) {
  if (studies.has(key)) return 0;
  studies.add(key);
  return amount;
}

export const sampleScience = (resource) => SCIENCE.sample[resource] ?? SCIENCE.sample.other;
export const flybyScience = (planets) => SCIENCE.flyby.base + SCIENCE.flyby.perPlanet * planets;

export function cruiseSpeed(star, from) {
  const release = Math.max(star.radius, Math.hypot(from.x - star.x, from.y - star.y));
  return Math.sqrt((2 * SOLAR_SAIL.pushAtSurface * star.radius * star.radius) / release) * TICKS_PER_SECOND;
}

export function starAhead(entries, star, from) {
  const outward = Math.atan2(from.x - star.x, from.y - star.y);
  const [dirX, dirY] = [Math.sin(outward), Math.cos(outward)];
  let best = null;
  for (const entry of entries) {
    const [dx, dy] = [entry.x - from.x, entry.y - from.y];
    const along = dx * dirX + dy * dirY;
    const aside = Math.abs(dx * dirY - dy * dirX);
    if (along <= 0 || along > SOLAR_SAIL.range || aside > SOLAR_SAIL.aimRadius) continue;
    if (!best || along < best.along) best = { entry, along };
  }
  return best?.entry ?? null;
}

export function launchSail(star, from, target) {
  const seconds = Math.hypot(target.x - from.x, target.y - from.y) / cruiseSpeed(star, from);
  return { from: { x: from.x, y: from.y }, to: { x: target.x, y: target.y, name: target.name }, total: seconds, left: seconds };
}

export function sailPose(sail) {
  const done = 1 - sail.left / sail.total;
  return {
    x: sail.from.x + (sail.to.x - sail.from.x) * done,
    y: sail.from.y + (sail.to.y - sail.from.y) * done,
    heading: Math.atan2(sail.to.x - sail.from.x, sail.to.y - sail.from.y),
  };
}

export function advanceSails(sails, seconds) {
  for (const sail of sails) sail.left = Math.max(0, sail.left - seconds);
  const arrived = sails.filter((sail) => sail.left === 0);
  return { flying: sails.filter((sail) => sail.left > 0), arrived };
}
