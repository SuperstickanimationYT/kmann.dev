import { makePair } from './portals.js';
import { createWorld, makeWall, makeLaser, makeFromSpec, settleEnds } from './physics.js';

export function toData(world) {
  return {
    gravity: world.gravity,
    walls: world.walls.map(({ x, y, length, thickness, angle, fixed }) => ({ x, y, length, thickness, angle, fixed })),
    lasers: world.lasers.map(({ x, y, angle, color }) => ({ x, y, angle, color })),
    bodies: world.bodies.map(bodyState),
    pairs: world.pairs.map((p) => ({
      shape: p.shape,
      width: p.width,
      kind: p.kind,
      mirror: p.mirror,
      delay: p.delay,
      colors: p.colors,
      ends: p.ends.map((e) => ({ base: { ...e.base }, motion: { ...e.motion } })),
    })),
  };
}

export function bodyState(body) {
  const { spec, x, y, angle, flip, vx, vy, w } = body;
  return { spec, x, y, angle, flip, vx, vy, w, generation: body.generation ?? 0 };
}

export function placeBody(world, state) {
  const body = makeFromSpec(state.spec, state.x, state.y);
  Object.assign(body, { angle: state.angle, flip: state.flip, vx: state.vx, vy: state.vy, w: state.w, generation: state.generation });
  world.bodies.push(body);
  return body;
}

export function fromData(data) {
  const world = createWorld();
  world.gravity = data.gravity;
  world.idealized = data.idealized ?? false;
  for (const w of data.walls) {
    const wall = makeWall(w.x, w.y, w.length, w.thickness, w.angle);
    wall.fixed = w.fixed;
    world.walls.push(wall);
  }
  for (const l of data.lasers) world.lasers.push(makeLaser(l.x, l.y, l.angle, l.color));
  for (const p of data.pairs) {
    const [a, b] = p.ends.map((e) => ({ ...e.base, motion: e.motion }));
    world.pairs.push(makePair({ ...p, a, b }));
  }
  for (const state of data.bodies) placeBody(world, state);
  settleEnds(world);
  return world;
}
