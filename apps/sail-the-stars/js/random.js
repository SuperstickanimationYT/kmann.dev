export function createRandom(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const integer = (min, max) => min + Math.floor(next() * (max - min + 1));
  const between = (min, max) => min + next() * (max - min);
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(next(), 1e-9))) * Math.cos(2 * Math.PI * next());
  const pick = (weighted) => {
    const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [item, weight] of weighted) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return weighted[weighted.length - 1][0];
  };
  return { next, integer, between, normal, pick };
}

export const randomSeed = () => 1 + Math.floor(Math.random() * 999999);
