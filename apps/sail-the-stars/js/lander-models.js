import { FINISH } from './model-builder.js';

const { white, grey, dark, steel, gold, amber, silver, black, glass, tan } = FINISH;
const BOTH_SIDES = [-1, 1];
const thin = { sides: 6 };
const turnedBy = (angle, radius, z = 0) => [radius * Math.cos(angle), radius * Math.sin(angle), z];

function legs(b, count, { body, foot, bodyZ, footRadius, strut = 0.05, finish = gold, turn = 0 }) {
  for (let k = 0; k < count; k++) {
    const angle = turn + (2 * Math.PI * k) / count;
    b.tube(turnedBy(angle, body, bodyZ), turnedBy(angle, foot, 0.1), strut, finish, thin);
    for (const side of BOTH_SIDES) b.tube(turnedBy(angle + side * 0.35, body, bodyZ * 0.5), turnedBy(angle, body + (foot - body) * 0.75, 0.1 + (bodyZ - 0.1) * 0.25), strut * 0.6, finish, thin);
    b.tube(turnedBy(angle, foot, 0), turnedBy(angle, foot, 0.12), footRadius, finish);
  }
}

function wheels(b, { across, along, radius, width }) {
  for (const y of along) {
    for (const side of BOTH_SIDES) {
      const x = side * across;
      b.tube([x - width / 2, y, radius], [x + width / 2, y, radius], radius, grey, { sides: 20 });
      b.tube([x - width / 2 - 0.01, y, radius], [x + width / 2 + 0.01, y, radius], radius * 0.45, dark);
    }
  }
}

function suspension(b, { across, along, radius, height, finish = steel }) {
  const [front, middle, back] = along;
  const tube = (x, y1, z1, y2, z2) => b.tube([x, y1, z1], [x, y2, z2], 0.035, finish, thin);
  for (const side of BOTH_SIDES) {
    const x = side * across * 0.86;
    tube(x, front, radius, (front + middle) / 2, height);
    tube(x, (front + middle) / 2, height, (middle + back) / 2, radius + height * 0.25);
    tube(x, (middle + back) / 2, radius + height * 0.25, middle, radius);
    tube(x, (middle + back) / 2, radius + height * 0.25, back, radius);
  }
}

function flag(b, x, y) {
  b.tube([x, y, 0], [x, y, 2], 0.015, steel, thin);
  b.panel([x + 0.55, y, 1.65], [1.1, 0.7], { normal: [0, 1, 0], across: [1, 0, 0], cells: white, back: white });
}

function descentStage(b) {
  b.tube([0, 0, 1], [0, 0, 2.7], 2.3, gold, { sides: 8 });
  b.tube([0, 0, 2.7], [0, 0, 2.75], 2.1, dark, { sides: 8 });
  b.tube([0, 0, 1], [0, 0, 0.35], 0.35, dark, { end: 0.75, open: true });
  legs(b, 4, { body: 2.2, foot: 4.4, bodyZ: 2.3, footRadius: 0.47, strut: 0.09, turn: Math.PI / 4 });
  for (let k = 0; k < 9; k++) b.box(turnedBy(Math.PI / 4, 2.6 + k * 0.17, 2.4 - k * 0.24), [0.5, 0.04, 0.04], steel, { forward: turnedBy(Math.PI / 4, 1) });
  for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) b.box(turnedBy(angle, 2.05, 1.9), [0.5, 0.9, 1], black, { forward: [0, 0, 1], up: turnedBy(angle + Math.PI / 2, 1) });
}

function apolloSite(b) {
  descentStage(b);
  flag(b, 6, 5);
  b.box([-9, 4, 0.2], [0.5, 0.6, 0.35], gold);
  b.tube([-9, 4, 0.4], [-9, 4, 0.9], 0.04, white, thin);
  b.box([-11, 1, 0.2], [0.7, 0.7, 0.25], silver);
  for (const side of BOTH_SIDES) b.panel([-11 + side * 1, 1, 0.5], [1.1, 0.6], { normal: [side * 0.6, 0, 0.8], across: [0.8, 0, -0.6 * side] });
}

function lunarRover(b, x, y) {
  const at = (px, py, pz) => [x + px, y + py, pz];
  for (const px of BOTH_SIDES) {
    for (const py of [-1.15, 1.15]) {
      b.tube(at(px * 0.8, py, 0.41), at(px * 1.03, py, 0.41), 0.41, grey, { sides: 20 });
      b.box(at(px * 0.92, py, 0.86), [0.3, 0.8, 0.04], tan);
    }
    b.box(at(px * 0.4, -0.2, 0.85), [0.5, 0.5, 0.06], white);
    b.box(at(px * 0.4, -0.46, 1.1), [0.5, 0.05, 0.55], white);
  }
  b.box(at(0, 0, 0.5), [1.5, 2.9, 0.12], silver);
  b.box(at(0, -1.2, 0.75), [1.2, 0.5, 0.4], gold);
  b.box(at(0, 1.2, 0.7), [0.8, 0.4, 0.35], gold);
  b.tube(at(0.3, 1.4, 0.7), at(0.3, 1.4, 1.9), 0.03, steel, thin);
  b.dish(at(0.3, 1.4, 1.9), [0.3, 0.2, 1], 0.5, 0.15, gold);
}

function apolloRoverSite(b) {
  apolloSite(b);
  lunarRover(b, 14, -6);
}

function luna9(b) {
  b.ball([0, 0, 0.32], 0.3, silver);
  for (let k = 0; k < 4; k++) {
    const angle = (Math.PI * k) / 2;
    b.box(turnedBy(angle, 0.45, 0.16), [0.5, 0.5, 0.04], silver, { forward: [Math.cos(angle) * 0.25, Math.sin(angle) * 0.25, 1], up: turnedBy(angle + Math.PI / 2, 1) });
    b.tube([0, 0, 0.5], turnedBy(angle + 0.8, 0.25, 1.3), 0.008, steel, thin);
  }
  b.tube([0, 0, 0.6], [0, 0, 0.8], 0.05, dark);
}

function surveyor(b) {
  b.truss([0, 0, 0.7], [0, 0, 1.4], 0.9, steel, 1);
  legs(b, 3, { body: 0.6, foot: 2.1, bodyZ: 1.1, footRadius: 0.2, strut: 0.04, finish: steel });
  b.tube([0, 0, 1.4], [0, 0, 3], 0.06, steel, thin);
  b.panel([0.35, 0.2, 3.1], [1.2, 1.1], { normal: [0.4, 0.2, 0.9] });
  b.panel([-0.55, -0.3, 2.8], [1, 1], { normal: [-0.3, 0.4, 0.86], cells: white, back: white });
  b.box([0.6, -0.5, 1.1], [0.4, 0.5, 0.5], white);
  b.box([-0.6, 0.3, 1.1], [0.5, 0.4, 0.5], gold);
  b.tube([0.3, 0.7, 0.9], [0.3, 0.7, 1.6], 0.14, white);
  b.ball([0, 0, 0.75], 0.45, steel);
}

function lunokhod(b) {
  wheels(b, { across: 0.75, along: [-0.83, -0.28, 0.28, 0.83], radius: 0.255, width: 0.2 });
  b.tube([0, 0, 0.45], [0, 0, 0.95], 0.75, silver, { end: 1.05 });
  b.tube([0, 0, 0.95], [0, 0, 1.02], 1.08, steel);
  b.box([0, -1.35, 1.5], [1.9, 0.06, 1.1], grey, { forward: [0, 0.3, 1] });
  b.panel([0, -1.28, 1.5], [1.8, 1], { normal: [0, 0.96, 0.28], across: [1, 0, 0] });
  b.tube([-0.3, 0.9, 0.7], [-0.3, 1.08, 0.7], 0.1, dark);
  b.tube([0.3, 0.9, 0.7], [0.3, 1.08, 0.7], 0.1, dark);
  b.tube([0.6, 0.5, 1], [0.6, 0.6, 1.8], 0.03, steel, thin);
  b.tube([0.6, 0.6, 1.8], [0.6, 0.7, 2.1], 0.06, gold, { end: 0.14 });
  b.box([0, 1.15, 0.85], [0.5, 0.2, 0.12], white);
}

function changE(b) {
  b.box([0, 0, 1.6], [2.2, 2.2, 1.1], gold);
  b.box([0, 0, 2.3], [1.2, 1.2, 0.4], amber);
  legs(b, 4, { body: 1.2, foot: 2.4, bodyZ: 1.5, footRadius: 0.3, strut: 0.07, finish: silver, turn: Math.PI / 4 });
  for (const side of BOTH_SIDES) b.panel([side * 2.3, 0, 2.1], [2.2, 1.9], { normal: [side * 0.2, 0.2, 1] });
  b.tube([0, 0, 1], [0, 0, 0.5], 0.2, dark, { end: 0.4, open: true });
  b.tube([0.5, 0.8, 2.2], [0.5, 0.8, 3.1], 0.04, steel, thin);
  b.dish([0.5, 0.8, 3.1], [0.3, 0.3, 1], 0.3, 0.08, white);
}

function yutu(b) {
  wheels(b, { across: 0.6, along: [-0.55, 0, 0.55], radius: 0.15, width: 0.15 });
  b.box([0, 0, 0.6], [0.9, 1.1, 0.4], gold);
  suspension(b, { across: 0.55, along: [-0.55, 0, 0.55], radius: 0.15, height: 0.5 });
  for (const side of BOTH_SIDES) b.panel([side * 0.95, 0, 0.85], [0.9, 1], { normal: [side * -0.1, 0.1, 1] });
  b.tube([0, 0.4, 0.8], [0, 0.4, 1.4], 0.035, white, thin);
  b.box([0, 0.42, 1.45], [0.4, 0.14, 0.16], white);
  b.dish([0.1, 0.1, 1.3], [0.4, 0.4, 0.8], 0.2, 0.06, gold);
}


function vikram(b) {
  b.box([0, 0, 1.35], [2, 2, 0.95], gold);
  for (let k = 0; k < 4; k++) b.panel(turnedBy((Math.PI * k) / 2, 1.03, 1.35), [1.5, 0.8], { normal: turnedBy((Math.PI * k) / 2, 1), across: turnedBy((Math.PI * k) / 2 + Math.PI / 2, 1) });
  legs(b, 4, { body: 1.2, foot: 1.9, bodyZ: 1.4, footRadius: 0.22, strut: 0.06, finish: silver, turn: Math.PI / 4 });
  for (const [x, y] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.tube([x, y, 0.9], [x, y, 0.55], 0.1, dark, { end: 0.22, open: true });
  b.tube([0, 0, 1.8], [0, 0, 2.2], 0.3, silver);
  b.box([0, 1.6, 0.6], [0.9, 0.05, 1.6], grey, { forward: [0, 0.8, 0.6], up: [0, -0.6, 0.8] });
}

function slim(b) {
  b.box([0, 0, 0.9], [1.5, 2.4, 1.7], silver, { forward: [0.25, 0, 1] });
  b.tube([-0.9, 0.55, 1.6], [-1.3, 0.55, 1.75], 0.16, dark, { end: 0.35, open: true });
  b.tube([-0.9, -0.55, 1.6], [-1.3, -0.55, 1.75], 0.16, dark, { end: 0.35, open: true });
  b.panel([0.82, 0, 1.1], [1.6, 2], { normal: [1, 0, -0.25], across: [0, 1, 0] });
  for (const y of BOTH_SIDES) b.ball([0.6, y * 0.8, 0.12], 0.16, steel);
}

function novaC(b) {
  const tilt = [0.5, 0, 0.87];
  const at = (along, side = 0) => [along * tilt[0] + 0.1, side, 0.95 + along * tilt[2]];
  b.tube(at(-1.1), at(1.6), 0.8, silver, { sides: 6 });
  b.disc(at(1.62), tilt, 0.8, gold, { sides: 6 });
  b.panel(at(0.4, 0.83), [0.8, 2.2], { normal: [0, 1, 0], across: [0.87, 0, -0.5] });
  b.panel(at(0.4, -0.83), [0.8, 2.2], { normal: [0, -1, 0], across: [0.87, 0, -0.5] });
  for (const angle of [0.4, 1.6, 2.6, 3.7, 4.7, 5.7]) b.tube([Math.cos(angle) * 0.7, Math.sin(angle) * 0.7, 0.7], [Math.cos(angle) * 1.6, Math.sin(angle) * 1.6, 0.05], 0.05, white, thin);
}

function blueGhost(b) {
  b.tube([0, 0, 1], [0, 0, 1.5], 1.5, gold, { sides: 8 });
  b.box([0, 0, 1.7], [2.2, 2.2, 0.4], white);
  for (const [x, y] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.ball([x, y, 1.1], 0.45, silver);
  for (const side of BOTH_SIDES) b.panel([side * 1.5, 0, 1.75], [1, 1.8], { normal: [side * 0.6, 0, 0.8], across: [0.8, 0, -0.6 * side] });
  legs(b, 4, { body: 1.3, foot: 2.1, bodyZ: 1.4, footRadius: 0.3, strut: 0.07, finish: steel, turn: Math.PI / 4 });
  b.tube([0, 0, 1], [0, 0, 0.6], 0.2, dark, { end: 0.35, open: true });
  b.tube([0.6, 0.6, 1.9], [0.6, 0.6, 2.6], 0.04, steel, thin);
}

function viking(b) {
  b.tube([0, 0, 0.6], [0, 0, 1.05], 1.3, grey, { sides: 6 });
  legs(b, 3, { body: 1.1, foot: 1.45, bodyZ: 0.9, footRadius: 0.17, strut: 0.06, finish: grey });
  b.dish([0.1, -0.6, 1.9], [0.2, 0.5, 0.8], 0.38, 0.1, white);
  b.tube([0.1, -0.7, 1.05], [0.1, -0.6, 1.9], 0.04, steel, thin);
  for (const side of BOTH_SIDES) {
    b.box([side * 0.75, -0.3, 1.25], [0.5, 0.6, 0.4], white);
    b.tube([side * 0.4, 0.7, 1.05], [side * 0.4, 0.7, 1.6], 0.1, tan);
    b.ball([side * 1.1, 0.5, 0.85], 0.3, white);
  }
  b.tube([0, 0.9, 1], [0, 3, 0.5], 0.035, steel, thin);
  b.box([0, 3.05, 0.45], [0.14, 0.25, 0.14], steel);
}

function pathfinder(b) {
  b.box([0, 0, 0.35], [0.9, 0.9, 0.35], gold);
  for (let k = 0; k < 3; k++) {
    const angle = (2 * Math.PI * k) / 3 + 0.5;
    b.panel(turnedBy(angle, 1, 0.22), [1.2, 1.1], { normal: turnedBy(angle, -0.06, 1), across: turnedBy(angle, 1) });
    b.ball(turnedBy(angle + 1, 0.9, 0.14), 0.4, tan, { flat: 0.3 });
  }
  b.tube([0, 0, 0.5], [0, 0, 1.4], 0.06, black, thin);
  b.box([0, 0, 1.5], [0.22, 0.14, 0.14], grey);
  b.dish([0.3, 0.2, 0.75], [0.2, 0.3, 1], 0.2, 0.04, gold);
  b.box([2.6, 1.4, 0.2], [0.35, 0.5, 0.1], gold);
  b.panel([2.6, 1.4, 0.28], [0.36, 0.55], {});
  for (const x of BOTH_SIDES) for (const y of [-0.22, 0, 0.22]) b.tube([2.6 + x * 0.2, 1.4 + y, 0.065], [2.6 + x * 0.27, 1.4 + y, 0.065], 0.065, steel);
}

function explorationRover(b) {
  wheels(b, { across: 1, along: [-0.85, -0.05, 0.75], radius: 0.13, width: 0.16 });
  suspension(b, { across: 1, along: [0.75, -0.05, -0.85], radius: 0.13, height: 0.45, finish: grey });
  b.box([0, 0, 0.5], [0.8, 1.2, 0.3], gold);
  b.panel([0, -0.1, 0.72], [0.9, 1.4], {});
  for (const side of BOTH_SIDES) {
    b.panel([side * 0.85, 0.15, 0.72], [0.8, 1.2], { across: [1, 0, 0] });
    b.panel([side * 0.45, -0.95, 0.72], [0.85, 0.6], {});
  }
  b.tube([0.2, 0.55, 0.65], [0.2, 0.55, 1.42], 0.05, white);
  b.box([0.2, 0.58, 1.46], [0.4, 0.12, 0.12], white);
  b.disc([-0.3, 0.1, 0.95], [0.1, 0.2, 1], 0.14, gold);
  b.tube([0, 0.7, 0.45], [-0.2, 1.2, 0.6], 0.03, steel, thin);
  b.tube([-0.2, 1.2, 0.6], [-0.1, 1.35, 0.3], 0.03, steel, thin);
}

function phoenix(b) {
  b.tube([0, 0, 0.75], [0, 0, 0.95], 0.75, gold);
  b.disc([0, 0, 0.96], [0, 0, 1], 0.75, white);
  legs(b, 3, { body: 0.7, foot: 1.1, bodyZ: 0.9, footRadius: 0.15, strut: 0.045, finish: grey, turn: 0.5 });
  for (const side of BOTH_SIDES) {
    b.tube([side * 0.7, 0, 0.9], [side * 1, 0, 1], 0.04, grey, thin);
    b.disc([side * 1.9, 0, 1], [0, 0, 1], 0.95, FINISH.cells, { sides: 10 });
    b.disc([side * 1.9, 0, 0.98], [0, 0, -1], 0.95, grey, { sides: 10 });
  }
  b.box([0.2, 0.2, 1.15], [0.5, 0.4, 0.35], white);
  b.tube([-0.3, 0.2, 0.95], [-0.3, 0.2, 1.8], 0.04, steel, thin);
  b.box([-0.3, 0.2, 1.85], [0.3, 0.14, 0.14], white);
  b.tube([0, 0.6, 1], [0.1, 1.5, 1.3], 0.035, steel, thin);
  b.tube([0.1, 1.5, 1.3], [0.1, 2.1, 0.4], 0.035, steel, thin);
}

function insight(b) {
  phoenix(b);
  b.ball([0.5, 2.2, 0.15], 0.35, white, { flat: 0.6 });
  b.tube([-0.5, 2.4, 0], [-0.5, 2.4, 0.4], 0.07, white);
}

function bigRover(b) {
  wheels(b, { across: 1.2, along: [-1.1, 0, 1.15], radius: 0.26, width: 0.4 });
  suspension(b, { across: 1.15, along: [1.15, 0, -1.1], radius: 0.26, height: 0.85, finish: grey });
  b.box([0, -0.1, 0.95], [1.3, 1.7, 0.5], white);
  b.box([0, -0.1, 1.22], [1.4, 1.8, 0.04], grey);
  b.tube([0, -1.05, 1.15], [0, -1.65, 1.3], 0.32, dark);
  for (let k = 0; k < 8; k++) b.box([Math.cos((k * Math.PI) / 4) * 0.4, -1.35, 1.22 + Math.sin((k * Math.PI) / 4) * 0.4], [0.16, 0.6, 0.03], white, { up: [0, 1, 0], forward: [-Math.sin((k * Math.PI) / 4), 0, Math.cos((k * Math.PI) / 4)] });
  b.tube([0.45, 0.65, 1.2], [0.45, 0.65, 2], 0.07, white);
  b.box([0.45, 0.68, 2.1], [0.55, 0.3, 0.22], white);
  b.ball([0.45, 0.84, 2.14], 0.07, glass);
  for (const x of BOTH_SIDES) b.ball([0.45 + x * 0.17, 0.84, 2.05], 0.04, glass);
  b.disc([-0.4, -0.4, 1.4], [-0.2, 0.2, 1], 0.17, grey, { sides: 6 });
  b.tube([-0.4, 0.75, 0.85], [-0.7, 1.4, 1.35], 0.06, grey);
  b.tube([-0.7, 1.4, 1.35], [0.1, 1.9, 0.8], 0.06, grey);
  b.tube([0.1, 1.9, 0.95], [0.1, 1.9, 0.55], 0.2, steel);
}

function ingenuity(b) {
  b.box([0, 0, 0.24], [0.14, 0.16, 0.2], silver);
  for (let k = 0; k < 4; k++) b.tube([0, 0, 0.3], turnedBy(Math.PI / 4 + (Math.PI * k) / 2, 0.3, 0), 0.008, dark, thin);
  b.tube([0, 0, 0.3], [0, 0, 0.56], 0.02, dark, thin);
  for (const [z, angle] of [[0.42, 0.4], [0.5, 1.3]]) b.box([0, 0, z], [1.2, 0.09, 0.012], dark, { up: turnedBy(angle, 1) });
  b.panel([0, 0, 0.57], [0.16, 0.42], {});
}

function zhurong(b) {
  wheels(b, { across: 0.9, along: [-0.85, 0, 0.85], radius: 0.15, width: 0.2 });
  suspension(b, { across: 0.85, along: [0.85, 0, -0.85], radius: 0.15, height: 0.55 });
  b.box([0, 0, 0.7], [1, 1.2, 0.4], gold);
  for (const side of BOTH_SIDES) {
    b.panel([side * 1.15, 0.35, 0.98], [1.15, 0.85], { normal: [0, 0.1, 1] });
    b.panel([side * 1, -0.55, 0.98], [1.05, 0.85], { normal: [side * 0.1, -0.1, 1], across: [1, side * -0.5, 0] });
  }
  b.tube([0, 0.6, 0.9], [0, 0.6, 1.8], 0.05, white);
  b.box([0, 0.62, 1.85], [0.5, 0.14, 0.18], white);
  b.dish([0.2, 0, 1.25], [0.2, 0.3, 1], 0.28, 0.08, gold);
}

function beagle(b) {
  b.tube([0, 0, 0.02], [0, 0, 0.16], 0.33, grey);
  for (const angle of [0.4, 1.5, 2.6]) {
    b.disc(turnedBy(angle, 0.62, 0.06), [0, 0, 1], 0.28, FINISH.cells);
    b.disc(turnedBy(angle, 0.62, 0.05), [0, 0, -1], 0.28, grey);
  }
}

function venera(b) {
  b.tube([0, 0, 0.1], [0, 0, 0.3], 1.05, grey);
  for (let k = 0; k < 10; k++) b.tube(turnedBy((Math.PI * k) / 5, 0.95, 0.3), turnedBy((Math.PI * k) / 5, 0.55, 0.7), 0.04, steel, thin);
  b.ball([0, 0, 1.05], 0.55, steel);
  b.tube([0, 0, 1.6], [0, 0, 1.75], 1.05, steel);
  b.tube([0, 0, 1.75], [0, 0, 2.2], 0.4, steel);
  for (const side of BOTH_SIDES) b.tube([side * 0.5, 0, 1.25], [side * 0.68, 0, 1.2], 0.1, dark);
}

function veneraSphere(b) {
  b.ball([0, 0, 0.5], 0.5, steel);
  b.tube([0, 0, 0.85], [0, 0, 1.05], 0.3, steel);
}

function huygens(b) {
  b.tube([0, 0, 0.1], [0, 0, 0.35], 0.6, amber, { end: 0.68 });
  b.tube([0, 0, 0.35], [0, 0, 0.5], 0.68, gold);
  b.disc([0, 0, 0.51], [0, 0, 1], 0.66, silver);
  for (let k = 0; k < 8; k++) b.box(turnedBy((Math.PI * k) / 4, 0.7, 0.3), [0.12, 0.03, 0.08], dark);
  b.tube([0.2, 0.2, 0.5], [0.2, 0.2, 0.75], 0.02, steel, thin);
}

export const LANDER_MODELS = {
  apolloSite, apolloRoverSite, luna9, surveyor, lunokhod, changE, yutu, vikram, slim, novaC, blueGhost, viking, pathfinder, explorationRover, phoenix, insight, bigRover, ingenuity, zhurong,
  beagle, venera, veneraSphere, huygens,
};
