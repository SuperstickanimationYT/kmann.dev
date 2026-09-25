import { SECTOR_SIZE } from './universe.js';
import { BUILT_WORMHOLE, WORMHOLE_MOUTH } from './world.js';

const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export const isLinked = (wormhole) => wormhole.ends.length === 2;
export const pendingWormhole = (wormholes) => wormholes.find((wormhole) => !isLinked(wormhole)) ?? null;
export const fareFor = (wormhole) => Math.max(1, Math.round(distance(...wormhole.ends) / SECTOR_SIZE)) * BUILT_WORMHOLE.farePerSector;
export const secondsUntilCollapse = (wormhole) => Math.max(0, BUILT_WORMHOLE.collapseSeconds - wormhole.idleSeconds);

export const mouthSpot = (rocket) => ({
  x: rocket.x + Math.sin(rocket.heading) * BUILT_WORMHOLE.deployAhead,
  y: rocket.y + Math.cos(rocket.heading) * BUILT_WORMHOLE.deployAhead,
});

export function farEnoughFromPending(wormholes, spot) {
  const pending = pendingWormhole(wormholes);
  return !pending || distance(pending.ends[0], spot) >= BUILT_WORMHOLE.minimumGap;
}

export function placeMouth(wormholes, spot) {
  const pending = pendingWormhole(wormholes);
  if (pending) pending.ends.push(spot);
  else wormholes.push({ ends: [spot], idleSeconds: 0 });
}

export function ageWormholes(wormholes, seconds) {
  const collapsed = [];
  for (const wormhole of wormholes.filter(isLinked)) {
    wormhole.idleSeconds += seconds;
    if (secondsUntilCollapse(wormhole) > 0) continue;
    wormholes.splice(wormholes.indexOf(wormhole), 1);
    collapsed.push(wormhole);
  }
  return collapsed;
}

export function mouthBodies(wormholes, canPayFare) {
  return wormholes.flatMap((wormhole) => {
    const mouths = wormhole.ends.map(({ x, y }) => ({
      name: 'Your Wormhole',
      x,
      y,
      ...WORMHOLE_MOUTH,
      wormhole,
      get exit() {
        const other = mouths.find((mouth) => mouth !== this);
        return other && canPayFare(fareFor(wormhole)) ? other : this;
      },
    }));
    return mouths;
  });
}

export const haulerLinks = (wormholes) =>
  wormholes.filter(isLinked).map((wormhole) => ({
    ends: wormhole.ends,
    fare: fareFor(wormhole),
    use: () => (wormhole.idleSeconds = 0),
  }));
