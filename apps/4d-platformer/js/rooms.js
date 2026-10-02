const LEG_HALF_WIDTH = 0.04;
const ROOM = { min: [-4.5, 0, -4.5, -7], max: [4.5, 3, 4.5, 7] };
const LIVING_ANA = 3.5;
const KITCHEN_ANA = -3.5;
const HUES = { wood: 30, couch: 200, screen: 260, lamp: 50, counter: 330, fridge: 180, chair: 120 };

const slab = (x, y, z, w, [hx, hy, hz, hw]) => ({ center: [x, y, z, w], half: [hx, hy, hz, hw] });

function legsUnder({ center, half }, inset) {
  const legs = [];
  const height = center[1] - half[1];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (const sw of [-1, 1]) {
        const at = [center[0] + sx * (half[0] - inset), height / 2, center[2] + sz * (half[2] - inset), center[3] + sw * (half[3] - inset)];
        legs.push({ center: at, half: [LEG_HALF_WIDTH, height / 2, LEG_HALF_WIDTH, LEG_HALF_WIDTH], post: true });
      }
    }
  }
  return legs;
}

function table(name, hue, [x, z, w], half, height) {
  const top = slab(x, height - half[1], z, w, half);
  return { name, hue, parts: [top, ...legsUnder(top, 0.08)] };
}

function chair(name, [x, z, w], backSide) {
  const seat = slab(x, 0.45, z, w, [0.32, 0.04, 0.32, 0.32]);
  const [axis, sign] = backSide;
  const backCenter = [x, 0.85, z, w];
  backCenter[axis] += sign * 0.3;
  const backHalf = [0.32, 0.36, 0.32, 0.32];
  backHalf[axis] = 0.03;
  return { name, hue: HUES.chair, parts: [seat, ...legsUnder(seat, 0.05), { center: backCenter, half: backHalf }] };
}

function couch([x, z, w]) {
  return {
    name: 'couch',
    hue: HUES.couch,
    parts: [
      slab(x, 0.22, z, w, [0.55, 0.22, 1.4, 1.4]),
      slab(x - 0.5, 0.7, z, w, [0.07, 0.48, 1.4, 1.4]),
      slab(x, 0.4, z - 1.35, w, [0.55, 0.4, 0.07, 1.4]),
      slab(x, 0.4, z + 1.35, w, [0.55, 0.4, 0.07, 1.4]),
      slab(x, 0.4, z, w - 1.35, [0.55, 0.4, 1.4, 0.07]),
      slab(x, 0.4, z, w + 1.35, [0.55, 0.4, 1.4, 0.07]),
    ],
  };
}

function floorLamp([x, z, w]) {
  return {
    name: 'lamp',
    hue: HUES.lamp,
    parts: [slab(x, 1.85, z, w, [0.28, 0.2, 0.28, 0.28]), { center: [x, 0.83, z, w], half: [LEG_HALF_WIDTH, 0.83, LEG_HALF_WIDTH, LEG_HALF_WIDTH], post: true }],
  };
}

export const ROOM_4D = {
  n: 4,
  start: [0, 0, -1.5, KITCHEN_ANA],
  room: ROOM,
  eyeView: true,
  objects: [
    couch([-3.2, 2.4, LIVING_ANA]),
    table('coffee table', HUES.wood, [-1.2, 2.4, LIVING_ANA], [0.45, 0.05, 0.8, 0.8], 0.45),
    { name: 'TV', hue: HUES.screen, parts: [slab(3.6, 0.25, 2.4, LIVING_ANA, [0.3, 0.25, 1, 1]), slab(3.6, 1.1, 2.4, LIVING_ANA, [0.04, 0.6, 1.1, 1.1])] },
    floorLamp([-3.2, 4.1, LIVING_ANA + 1.8]),
    { name: 'counter', hue: HUES.counter, parts: [slab(0, 0.45, 3.9, KITCHEN_ANA, [2.2, 0.45, 0.55, 1.4])] },
    { name: 'fridge', hue: HUES.fridge, parts: [slab(3.6, 1, 3.8, KITCHEN_ANA, [0.6, 1, 0.6, 0.6])] },
    table('table', HUES.wood, [0, 1.5, KITCHEN_ANA], [0.9, 0.05, 0.6, 0.9], 0.75),
    chair('chair', [-1.4, 1.5, KITCHEN_ANA], [0, -1]),
    chair('chair', [1.4, 1.5, KITCHEN_ANA], [0, 1]),
    chair('chair', [0, 1.5, KITCHEN_ANA - 1.4], [3, -1]),
    chair('chair', [0, 1.5, KITCHEN_ANA + 1.4], [3, 1]),
  ],
};
