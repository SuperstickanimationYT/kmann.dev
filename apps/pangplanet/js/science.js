import { systemsWithin } from './universe.js';
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

function outwardFrom(star, from) {
  const distance = Math.hypot(from.x - star.x, from.y - star.y);
  return { x: (from.x - star.x) / distance, y: (from.y - star.y) / distance };
}

export const sailReach = (star, from) => cruiseSpeed(star, from) * SOLAR_SAIL.lifeSeconds;

export function starAhead(entries, star, from) {
  const direction = outwardFrom(star, from);
  const reach = sailReach(star, from);
  let best = null;
  for (const entry of entries) {
    const [dx, dy] = [entry.x - from.x, entry.y - from.y];
    const along = dx * direction.x + dy * direction.y;
    const aside = Math.abs(dx * direction.y - dy * direction.x);
    if (along <= 0 || along > reach || aside > SOLAR_SAIL.flybyRadius) continue;
    if (!best || along < best.along) best = { entry, along };
  }
  return best?.entry ?? null;
}

export function launchSail(star, from, launchStarKey, target) {
  return {
    from: { x: from.x, y: from.y },
    direction: outwardFrom(star, from),
    speed: cruiseSpeed(star, from),
    elapsed: 0,
    scannedTo: 0,
    life: SOLAR_SAIL.lifeSeconds,
    launchStarKey,
    target: target?.name ?? null,
    charted: 0,
    flybys: 0,
  };
}

export function sailFromOldSave(sail) {
  if (sail.direction) return sail;
  const { from, to, total, left } = sail;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const elapsed = total - left;
  const direction = { x: (to.x - from.x) / distance, y: (to.y - from.y) / distance };
  return { from, direction, speed: distance / total, elapsed, scannedTo: elapsed, life: SOLAR_SAIL.lifeSeconds, launchStarKey: null, target: to.name, charted: 0, flybys: 0 };
}

const positionAt = (sail, elapsed) => ({ x: sail.from.x + sail.direction.x * sail.speed * elapsed, y: sail.from.y + sail.direction.y * sail.speed * elapsed });

export const sailPose = (sail) => ({ ...positionAt(sail, sail.elapsed), heading: Math.atan2(sail.direction.x, sail.direction.y) });

export const sailDead = (sail) => sail.elapsed >= sail.life;

export function flySail(sail, seconds) {
  sail.elapsed = Math.min(sail.life, sail.elapsed + seconds);
}

function distanceToStretch(point, start, end) {
  const [sx, sy] = [end.x - start.x, end.y - start.y];
  const lengthSquared = sx * sx + sy * sy;
  const along = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * sx + (point.y - start.y) * sy) / lengthSquared)) : 0;
  return Math.hypot(point.x - (start.x + sx * along), point.y - (start.y + sy * along));
}

export function systemsPassed(sail) {
  if (sail.elapsed - sail.scannedTo < SOLAR_SAIL.scanEverySeconds && !sailDead(sail)) return [];
  const start = positionAt(sail, sail.scannedTo);
  const end = positionAt(sail, sail.elapsed);
  sail.scannedTo = sail.elapsed;
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const halfLength = Math.hypot(end.x - start.x, end.y - start.y) / 2;
  return systemsWithin(middle.x, middle.y, halfLength + SOLAR_SAIL.sensorRange)
    .map((system) => ({ ...system, distance: distanceToStretch(system.star, start, end) }))
    .filter(({ distance }) => distance <= SOLAR_SAIL.sensorRange);
}
