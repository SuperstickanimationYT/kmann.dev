import { airAround, bodyState } from './planets.js';

const SMOKE = {
  puffsPerSecond: 60,
  lifeSeconds: 5,
  startRadius: 0.7,
  growthPerSecond: 0.9,
  exhaustSpeed: 30,
  spread: 6,
  slowingPerSecond: 1.2,
  mostPuffs: 700,
};

function settleOnGround(puff) {
  const distance = Math.hypot(puff.x, puff.y);
  const floor = puff.body.radius + SMOKE.startRadius;
  if (distance >= floor) return;
  const ux = puff.x / distance;
  const uy = puff.y / distance;
  puff.x = ux * floor;
  puff.y = uy * floor;
  const inward = Math.min(0, puff.vx * ux + puff.vy * uy);
  puff.vx -= inward * ux;
  puff.vy -= inward * uy;
}

export class Exhaust {
  constructor() {
    this.puffs = [];
    this.owed = 0;
  }

  emit(nozzle, velocity, outward, throttle, time, seconds) {
    const air = airAround(nozzle.x, nozzle.y, time);
    if (!air) return;
    this.owed += SMOKE.puffsPerSecond * throttle * Math.min(1, air.thickness * 4) * seconds;
    const anchor = bodyState(air.body, time);
    while (this.owed >= 1) {
      this.owed -= 1;
      const along = Math.random();
      const jitter = () => (Math.random() - 0.5) * SMOKE.spread;
      this.puffs.push({
        body: air.body,
        x: nozzle.x - anchor.x - (velocity.x - anchor.vx) * seconds * along,
        y: nozzle.y - anchor.y - (velocity.y - anchor.vy) * seconds * along,
        vx: outward.x * SMOKE.exhaustSpeed + jitter(),
        vy: outward.y * SMOKE.exhaustSpeed + jitter(),
        age: 0,
        thickness: Math.min(1, air.thickness * 2),
      });
    }
    if (this.puffs.length > SMOKE.mostPuffs) this.puffs.splice(0, this.puffs.length - SMOKE.mostPuffs);
  }

  advance(seconds) {
    const slowing = Math.exp(-SMOKE.slowingPerSecond * seconds);
    for (const puff of this.puffs) {
      puff.age += seconds;
      puff.vx *= slowing;
      puff.vy *= slowing;
      puff.x += puff.vx * seconds;
      puff.y += puff.vy * seconds;
      settleOnGround(puff);
    }
    this.puffs = this.puffs.filter((puff) => puff.age < SMOKE.lifeSeconds);
  }

  *visible(time) {
    for (const puff of this.puffs) {
      const anchor = bodyState(puff.body, time);
      const fade = 1 - puff.age / SMOKE.lifeSeconds;
      yield {
        x: anchor.x + puff.x,
        y: anchor.y + puff.y,
        radius: SMOKE.startRadius + SMOKE.growthPerSecond * puff.age,
        alpha: 0.45 * fade * puff.thickness,
      };
    }
  }
}
