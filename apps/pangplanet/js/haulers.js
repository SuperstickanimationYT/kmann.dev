import { bearingBetween } from './physics.js';
import { drainBatteries, storedCharge } from './solar.js';
import { HAULER, WARP_DRIVE } from './world.js';

export function createHauler(at, builds = false) {
  return { builds, x: at.x, y: at.y, stops: [], next: 0, running: false, leg: null, wait: 0, stalled: null, movedThisLoop: false, batteries: Array(HAULER.batteries).fill(0), gold: 0 };
}

export const secondsUntilDue = (hauler) => (hauler.running ? (hauler.leg?.left ?? hauler.wait) : null);

export function passTime(hauler, seconds) {
  if (!hauler.running) return;
  if (hauler.leg) hauler.leg.left = Math.max(0, hauler.leg.left - seconds);
  else hauler.wait = Math.max(0, hauler.wait - seconds);
}

function stall(hauler, reason, seconds = HAULER.retrySeconds) {
  Object.assign(hauler, { stalled: reason, wait: seconds });
}

const cargoOf = (hauler) => storedCharge(hauler.batteries) + hauler.gold;

function tripCost(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance >= WARP_DRIVE.minimumJump) return { charge: distance * WARP_DRIVE.chargePerUnit, seconds: HAULER.stopSeconds + HAULER.warpSeconds, warp: true };
  return { tokens: Math.ceil(distance * HAULER.tokensPerUnit), seconds: HAULER.stopSeconds + distance / HAULER.speed, warp: false };
}

function depart(hauler, { locate, spend }) {
  const { stops } = hauler;
  let target = null;
  for (let tries = 0; tries < stops.length && !target; tries++) {
    target = locate(stops[hauler.next]);
    if (!target) hauler.next = (hauler.next + 1) % stops.length;
  }
  if (!target) {
    stall(hauler, { kind: 'stops' });
    return;
  }
  const cost = tripCost(hauler, target);
  if (cost.warp && storedCharge(hauler.batteries) < cost.charge) {
    stall(hauler, { kind: 'charge', amount: cost.charge });
    return;
  }
  if (!cost.warp && !spend(cost.tokens)) {
    stall(hauler, { kind: 'tokens', amount: cost.tokens });
    return;
  }
  if (cost.warp) drainBatteries(hauler.batteries, cost.charge);
  hauler.stalled = null;
  hauler.leg = { from: { x: hauler.x, y: hauler.y }, to: { x: target.x, y: target.y }, total: cost.seconds, left: cost.seconds, warp: cost.warp };
}

function chargeForNextWarp(hauler, locate) {
  const after = locate(hauler.stops[(hauler.next + 1) % hauler.stops.length]);
  const cost = after && tripCost(hauler, after);
  return cost?.warp ? cost.charge : 0;
}

function arrive(hauler, { locate, act }) {
  const { to } = hauler.leg;
  Object.assign(hauler, { x: to.x, y: to.y, leg: null });
  const stop = hauler.stops[hauler.next];
  const spot = stop && locate(stop);
  if (!spot || spot.x !== to.x || spot.y !== to.y) return;
  const before = cargoOf(hauler);
  const finished = act(stop, hauler, chargeForNextWarp(hauler, locate));
  if (cargoOf(hauler) !== before || finished) hauler.movedThisLoop = true;
  if (finished) removeStop(hauler, hauler.next);
  else hauler.next = (hauler.next + 1) % hauler.stops.length;
  return hauler.next === 0;
}

export function settleHauler(hauler, world) {
  const loopDone = hauler.leg && arrive(hauler, world);
  if (loopDone && !hauler.movedThisLoop) {
    stall(hauler, { kind: 'idle' }, HAULER.idleSeconds);
    return;
  }
  if (loopDone) hauler.movedThisLoop = false;
  depart(hauler, world);
}

export function haulerPose(hauler) {
  const { leg } = hauler;
  if (!leg) return { x: hauler.x, y: hauler.y, heading: 0, flying: false };
  const heading = bearingBetween(leg.from.x, leg.from.y, leg.to.x, leg.to.y);
  if (leg.warp) return { x: leg.from.x, y: leg.from.y, heading, flying: false };
  const progress = Math.min(1, (leg.total - leg.left) / Math.max(leg.total - HAULER.stopSeconds, 1e-9));
  return { x: leg.from.x + (leg.to.x - leg.from.x) * progress, y: leg.from.y + (leg.to.y - leg.from.y) * progress, heading, flying: progress < 1 };
}

export function removeStop(hauler, index) {
  hauler.stops.splice(index, 1);
  if (index < hauler.next) hauler.next -= 1;
  if (hauler.next >= hauler.stops.length) hauler.next = 0;
}
