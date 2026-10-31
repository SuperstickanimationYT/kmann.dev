import { makePair, PAIR_COLORS } from './portals.js';
import { createWorld, makeBox, makeBall, makeWedge, makeWall, makeLaser, settleEnds } from './physics.js';
import { ROOM } from './render.js';

const UP = 0;
const DOWN = Math.PI;
const FACING_RIGHT = -Math.PI / 2;
const FACING_LEFT = Math.PI / 2;

function room() {
  const world = createWorld();
  const { width: w, height: h } = ROOM;
  world.walls.push(
    makeWall(w / 2, -0.5, w + 2, 1),
    makeWall(w / 2, h + 0.5, w + 2, 1),
    makeWall(-0.5, h / 2, h + 2, 1, Math.PI / 2),
    makeWall(w + 0.5, h / 2, h + 2, 1, Math.PI / 2),
  );
  for (const wall of world.walls) wall.fixed = true;
  return world;
}

export const SCENES = [
  {
    id: 'stamp',
    title: 'Portal drops over a cube',
    note: 'The orange end slides down over a cube resting on a pillar while the blue end stays put. Seen from the blue end, the cube is moving toward it the whole time, so when the pillar under it is gone the cube keeps going and flies out.',
    build() {
      const world = room();
      world.walls.push(makeWall(6, 0.9, 1.0, 1.8));
      world.bodies.push(makeBox(6, 2.2, 0.8, 0.8));
      world.pairs.push(makePair({
        width: 2.2,
        a: { x: 6, y: 3.4, angle: DOWN, motion: { type: 'slide', distance: 2.4, direction: 90, period: 3.5, phase: Math.PI / 2 } },
        b: { x: 13, y: 2.4, angle: (5 * Math.PI) / 6 },
      }));
      return world;
    },
  },
  {
    id: 'fall',
    title: 'Endless fall',
    note: 'One end lies on the floor, the other on the ceiling. Whatever drops into the floor comes out of the ceiling and falls again, faster each lap until it hits the speed cap.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        kind: 'wall', width: 2.4,
        a: { x: 7, y: 0, angle: UP },
        b: { x: 7, y: ROOM.height, angle: DOWN },
      }));
      world.pairs.push(makePair({
        kind: 'wall', width: 2.4,
        a: { x: 16, y: 0, angle: UP },
        b: { x: 0, y: 4, angle: FACING_RIGHT },
      }));
      world.bodies.push(makeBall(7, 6, 0.35), makeBox(7.4, 9, 0.7, 0.7), makeBox(16, 8, 0.8, 0.8, '#e07a5f'));
      return world;
    },
  },
  {
    id: 'doorway',
    title: 'Free-standing doorway',
    note: 'Two open ends stand in the room. Going in either face, you come out the opposite face of the other end, still heading the same way, exactly like walking through a doorway.',
    build() {
      const world = room();
      world.walls.push(makeWall(3, 2.5, 4, 0.3, -0.35));
      world.pairs.push(makePair({
        width: 2.4,
        a: { x: 8, y: 1.0, angle: FACING_RIGHT },
        b: { x: 15, y: 5, angle: FACING_RIGHT - 0.5 },
      }));
      world.bodies.push(makeBall(1.5, 3.6, 0.35), makeBall(2.4, 3.4, 0.3, '#9be38f'), makeBox(12, 0.4, 0.8, 0.8));
      world.bodies[2].vx = -9;
      return world;
    },
  },
  {
    id: 'spin',
    title: 'Spinning portal',
    note: 'Balls rain onto an end that spins. The spin adds to their motion as they pass, so they leave the other end at different speeds and angles each time.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        width: 2.4,
        a: { x: 6, y: 4, angle: 0, motion: { type: 'spin', period: 3 } },
        b: { x: 17, y: 8, angle: Math.PI / 2 },
      }));
      for (let i = 0; i < 6; i++) world.bodies.push(makeBall(5.4 + (i % 3) * 0.6, 8 + i * 0.9, 0.25, i % 2 ? '#9be38f' : '#7fc8ff'));
      return world;
    },
  },
  {
    id: 'rings',
    title: 'Ring portals',
    note: 'Fall into the left ring from outside and you land inside the right ring. Fall out of the right ring and you come out of the left one, from the inside.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        shape: 'ring', width: 2.6,
        a: { x: 7, y: 4.5 },
        b: { x: 17, y: 6.5 },
      }));
      world.bodies.push(makeBall(7, 9, 0.3), makeBox(6.6, 11, 0.6, 0.6), makeWedge(7.3, 12.5, 0.8));
      return world;
    },
  },
  {
    id: 'mirror',
    title: 'Mirror portal',
    note: 'This pair reflects everything on the way through, so each lap of the fall flips which way the wedges lean, along with their spin and sideways drift. In 2D the reflection always runs along the portal: an upright mirror end turns things upside down.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        mirror: true, kind: 'wall', width: 3,
        a: { x: 9, y: 0, angle: UP },
        b: { x: 9, y: ROOM.height, angle: DOWN },
      }));
      const wedges = [makeWedge(8.6, 4, 1), makeWedge(9.6, 7, 0.8, '#f2c14e')];
      wedges[0].vx = 0.4;
      wedges[1].w = 2;
      world.bodies.push(...wedges);
      return world;
    },
  },
  {
    id: 'curved',
    title: 'Curved and bent portals',
    note: 'Ends can be any shape, as long as both ends of a pair match: an object passes wherever it crosses the curve.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        shape: 'arc', width: 2.6,
        a: { x: 5, y: 2.5, angle: 0 },
        b: { x: 12, y: 9, angle: Math.PI },
      }));
      world.pairs.push(makePair({
        shape: 'chevron', kind: 'wall', width: 2.6,
        a: { x: 18, y: 0, angle: UP },
        b: { x: 21.5, y: 9, angle: FACING_LEFT },
      }));
      world.bodies.push(makeBall(5, 7, 0.3), makeBox(18, 5, 0.7, 0.7), makeBall(18.4, 8, 0.3, '#9be38f'));
      return world;
    },
  },
  {
    id: 'lasers',
    title: 'Lasers',
    note: 'Light goes through the doorway too. The far end swings, so the beam sweeps around the room while the near end holds still.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        width: 2.4,
        a: { x: 8, y: 3, angle: FACING_LEFT },
        b: { x: 14, y: 8, angle: FACING_LEFT, motion: { type: 'swing', swing: 40, period: 6 } },
      }));
      world.lasers.push(makeLaser(2, 3, 0), makeLaser(2, 2.4, 0, '#5fe3ff'));
      world.bodies.push(makeBox(20, 0.5, 1, 1), makeBox(20.2, 1.5, 1, 1, '#e07a5f'));
      return world;
    },
  },
  {
    id: 'knock-in',
    title: 'Time travel: knock yourself in',
    gravity: 0,
    note: 'No gravity. The ball rolls under the right-hand end and misses it. Going into that end sends you 3 seconds back, out of the bottom end. Press Solve: one history has nothing come back, and in another the older ball flies up out of the floor end and knocks it into the portal.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        width: 2.4, delay: 3,
        a: { x: 16, y: 6, angle: FACING_LEFT },
        b: { x: 9.3, y: 1, angle: DOWN },
      }));
      const ball = makeBall(4, 4, 0.3);
      ball.vx = 3;
      world.bodies.push(ball);
      return world;
    },
  },
  {
    id: 'paradox',
    title: 'Time travel: billiard paradox',
    gravity: 0,
    note: 'No gravity. The ball heads straight into the right-hand end, which sends it 3¼ seconds back, out of the top end and down across its own path. Hit head-on, the younger ball would be knocked away and never go back. Press Solve to look for a history where the collision works out.',
    build() {
      const world = room();
      world.pairs.push(makePair({
        width: 2.4, delay: 3.25,
        a: { x: 16, y: 6, angle: FACING_LEFT },
        b: { x: 11, y: 10, angle: UP },
      }));
      const ball = makeBall(4, 6, 0.3);
      ball.vx = 3;
      world.bodies.push(ball);
      return world;
    },
  },
  {
    id: 'empty',
    title: 'Empty room',
    note: 'Build your own.',
    build: room,
  },
];

export function loadScene(id) {
  const scene = SCENES.find((s) => s.id === id) ?? SCENES[0];
  const world = scene.build();
  world.pairs.forEach((pair, i) => { pair.colors = PAIR_COLORS[i % PAIR_COLORS.length]; });
  settleEnds(world);
  return world;
}
