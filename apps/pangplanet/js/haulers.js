import { bearingBetween } from './physics.js';
import { drainBatteries, storedCharge } from './solar.js';
import { ALIENS, HAULER, WARP_DRIVE } from './world.js';

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

const distance = (from, to) => Math.hypot(to.x - from.x, to.y - from.y);

function hopCost(from, to) {
  const gap = distance(from, to);
  if (gap >= WARP_DRIVE.minimumJump) return { charge: gap * WARP_DRIVE.chargePerUnit, tokens: 0, seconds: HAULER.stopSeconds + HAULER.warpSeconds, warp: true };
  return { charge: 0, tokens: Math.ceil(gap * HAULER.tokensPerUnit), seconds: HAULER.stopSeconds + gap / HAULER.speed, warp: false };
}

function throughLink(from, to, link, [entry, exit]) {
  const [inbound, outbound] = [hopCost(from, entry), hopCost(exit, to)];
  return {
    charge: inbound.charge + outbound.charge,
    tokens: inbound.tokens + outbound.tokens + link.fare,
    seconds: inbound.seconds + outbound.seconds - HAULER.stopSeconds,
    warp: true,
    link,
    travelled: distance(from, entry) + distance(exit, to),
  };
}

function tripCost(from, to, links) {
  const routes = links.flatMap((link) => [link.ends, [...link.ends].reverse()].map((ends) => throughLink(from, to, link, ends)));
  const direct = { ...hopCost(from, to), link: null, travelled: distance(from, to) };
  return routes.reduce((best, route) => (route.travelled < best.travelled ? route : best), direct);
}

function depart(hauler, { locate, spend, wormholes }) {
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
  const cost = tripCost(hauler, target, wormholes());
  if (storedCharge(hauler.batteries) < cost.charge) {
    stall(hauler, { kind: 'charge', amount: cost.charge });
    return;
  }
  if (cost.tokens && !spend(cost.tokens)) {
    stall(hauler, { kind: 'tokens', amount: cost.tokens });
    return;
  }
  drainBatteries(hauler.batteries, cost.charge);
  cost.link?.use();
  hauler.stalled = null;
  hauler.leg = { from: { x: hauler.x, y: hauler.y }, to: { x: target.x, y: target.y }, total: cost.seconds, left: cost.seconds, warp: cost.warp, wormhole: Boolean(cost.link) };
}

function chargeForNextWarp(hauler, { locate, wormholes }) {
  const after = locate(hauler.stops[(hauler.next + 1) % hauler.stops.length]);
  return after ? tripCost(hauler, after, wormholes()).charge : 0;
}

function arrive(hauler, world) {
  const { locate, act, raid } = world;
  const { to } = hauler.leg;
  Object.assign(hauler, { x: to.x, y: to.y, leg: null });
  const stop = hauler.stops[hauler.next];
  const spot = stop && locate(stop);
  if (!spot || spot.x !== to.x || spot.y !== to.y) return;
  const raider = raid(spot, hauler);
  if (raider) stall(hauler, { kind: 'raided', species: raider }, ALIENS.raid.pauseSeconds);
  const before = cargoOf(hauler);
  const finished = act(stop, hauler, chargeForNextWarp(hauler, world));
  if (cargoOf(hauler) !== before || finished) hauler.movedThisLoop = true;
  if (finished) removeStop(hauler, hauler.next);
  else hauler.next = (hauler.next + 1) % hauler.stops.length;
  return hauler.next === 0;
}

export function settleHauler(hauler, world) {
  const loopDone = hauler.leg && arrive(hauler, world);
  if (hauler.stalled?.kind === 'raided' && hauler.wait > 0) return;
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
