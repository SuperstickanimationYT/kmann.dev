import { createModelBuilder, FINISH, MODEL_FLOATS } from './model-builder.js';
import { LANDER_MODELS } from './lander-models.js';

const { white, grey, dark, steel, gold, amber, silver, black, mirror, glass, red, tan, cells } = FINISH;
const BOTH_SIDES = [-1, 1];
const thin = { sides: 6 };
const turnedBy = (angle, radius, z = 0) => [radius * Math.cos(angle), radius * Math.sin(angle), z];
const evenly = (count, build) => Array.from({ length: count }, (_, k) => build((2 * Math.PI * k) / count, k));

function wings(b, { from, length, width, panels = 1, gap = 0.1, y = 0, z = 0, ...look }) {
  b.turning([y, z], () => {
    for (const side of BOTH_SIDES) {
      b.tube([side * from * 0.5, y, z], [side * (from + 0.1), y, z], 0.05, grey, thin);
      for (let k = 0; k < panels; k++) b.panel([side * (from + (k + 0.5) * length + k * gap), y, z], [length, width], look);
    }
  });
}

function highGain(b, { radius, depth = radius * 0.35, z, front = white, back = white }) {
  b.dish([0, 0, z], [0, 0, 1], radius, depth, front, back);
  for (const [angle] of evenly(3, (angle) => [angle])) b.tube(turnedBy(angle, radius * 0.75, z + depth * 0.56), turnedBy(angle, radius * 0.08, z + depth * 2.1), radius * 0.012 + 0.01, grey, thin);
  b.tube([0, 0, z + depth * 2], [0, 0, z + depth * 2.3], radius * 0.12, front);
}

function generator(b, from, to, radius) {
  b.tube(from, to, radius, dark);
  const along = to.map((value, i) => value - from[i]);
  for (let k = 0; k < 3; k++) {
    const at = (share) => from.map((value, i) => value + along[i] * share);
    b.tube(at(0.08 + k * 0.32), at(0.2 + k * 0.32), radius * 1.5, grey, { sides: 8 });
  }
}

function voyager(b) {
  b.tube([0, 0, -0.35], [0, 0, 0.1], 0.9, black, { sides: 10 });
  b.tube([0, 0, 0.1], [0, 0, 0.35], 0.7, silver, { sides: 10 });
  b.ball([0, 0, -0.5], 0.36, silver);
  highGain(b, { radius: 1.83, depth: 0.5, z: 0.35 });
  b.truss([0.8, 0, -0.1], [3.2, 0, 0.1], 0.18, grey, 8);
  b.box([3.4, 0, 0.1], [0.7, 0.5, 0.4], black);
  b.tube([3.5, 0, 0.3], [3.5, 0.6, 0.3], 0.13, white);
  b.tube([3.6, 0.1, -0.1], [3.6, 0.8, -0.1], 0.2, dark);
  b.tube([-0.8, 0, -0.1], [-1.6, 0, -0.5], 0.05, grey, thin);
  for (let k = 0; k < 3; k++) generator(b, [-1.6 - k * 0.6, 0, -0.5 - k * 0.1], [-2.1 - k * 0.6, 0, -0.6 - k * 0.1], 0.2);
  b.truss([0, -0.8, -0.1], [0, -13, 0.6], 0.16, steel, 26);
  b.box([0, -13, 0.6], [0.2, 0.2, 0.2], white);
  for (const side of BOTH_SIDES) b.tube([0.2 * side, 0.7, -0.4], [6.5 * side, 7.5, -1.4], 0.02, steel, thin);
  b.disc([0.46, 0.78, -0.1], [0.5, 0.86, 0], 0.15, mirror);
}

function pioneer(b) {
  b.tube([0, 0, -0.35], [0, 0, 0.1], 0.7, amber, { sides: 6 });
  highGain(b, { radius: 1.37, z: 0.1 });
  for (const angle of [0.6, 0.6 + (2 * Math.PI) / 3]) {
    b.truss(turnedBy(angle, 0.7, -0.15), turnedBy(angle, 3, -0.15), 0.14, steel, 8);
    generator(b, turnedBy(angle, 3, -0.4), turnedBy(angle, 3, 0.15), 0.16);
  }
  b.truss(turnedBy(0.6 + (4 * Math.PI) / 3, 0.7, -0.15), turnedBy(0.6 + (4 * Math.PI) / 3, 6.5, -0.15), 0.08, steel, 20);
  b.box([0.3, -0.5, -0.45], [0.4, 0.3, 0.3], black);
}

function newHorizons(b) {
  b.tube([0, 0, -0.35], [0, 0, 0.35], 1.1, amber, { sides: 3 });
  b.box([0, 0, 0], [1.5, 1.2, 0.66], gold);
  highGain(b, { radius: 1.05, z: 0.36 });
  generator(b, [1, 0, -0.05], [2, 0, -0.05], 0.22);
  b.tube([-0.7, 0.3, 0], [-0.7, 1.1, 0], 0.16, black);
  b.box([-0.7, -0.5, 0.1], [0.5, 0.3, 0.3], white);
}

function galileo(b) {
  b.tube([0, 0, -0.6], [0, 0, 0.4], 0.85, black, { sides: 8 });
  b.tube([0, 0, -1.6], [0, 0, -0.6], 0.6, gold, { sides: 8 });
  b.dish([0, 0, -2.3], [0, 0, -1], 0.6, 0.35, amber, amber);
  for (const [angle] of evenly(18, (angle) => [angle])) b.tube([0, 0, 0.9], turnedBy(angle, 0.9, 2.9), 0.02, gold, thin);
  b.tube([0, 0, 0.4], [0, 0, 3.2], 0.12, gold);
  for (const side of BOTH_SIDES) {
    b.truss([0, side * 0.8, -0.2], [0, side * 4, -0.2], 0.16, steel, 10);
    generator(b, [0, side * 4, -0.5], [0, side * 4, 0.4], 0.2);
  }
  b.truss([0.8, 0, 0.1], [10.5, 0, 0.1], 0.14, steel, 24);
  b.tube([-0.7, 0, -1.5], [-1.3, 0, -1.5], 0.3, black);
}

function cassini(b) {
  b.tube([0, 0, -2.2], [0, 0, 1.4], 0.95, gold, { sides: 12 });
  b.tube([0, 0, 1.4], [0, 0, 2], 1, black, { sides: 12 });
  highGain(b, { radius: 2, depth: 0.6, z: 2 });
  for (const side of BOTH_SIDES) b.tube([side * 0.35, 0, -2.2], [side * 0.35, 0, -2.9], 0.18, dark, { end: 0.38, open: true });
  for (const [angle] of evenly(3, (angle) => [angle + 0.5])) generator(b, turnedBy(angle, 0.9, -1.9), turnedBy(angle, 1.8, -2.1), 0.22);
  b.box([1.15, 0.2, 0.3], [0.7, 1.3, 1.2], black);
  b.box([-1.1, 0, 0.6], [0.6, 1.2, 0.8], amber);
  b.truss([0, 0.9, 1], [0, 11, 1], 0.16, steel, 24);
  for (const angle of [-0.5, -1.2, -2.6]) b.tube(turnedBy(angle, 0.9, 1.2), turnedBy(angle, 9, 2.5), 0.025, steel, thin);
  b.dish([0, -1.1, -0.4], [0, -1, 0], 1.3, 0.35, amber, amber);
}

function juno(b) {
  b.tube([0, 0, -0.6], [0, 0, 0.6], 1.1, gold, { sides: 6 });
  b.box([0, 0, 0.9], [0.8, 0.8, 0.6], silver);
  highGain(b, { radius: 1.25, z: 1.2 });
  for (const [angle] of evenly(3, (angle) => [angle])) {
    const across = turnedBy(angle, 1);
    for (let k = 0; k < 4; k++) {
      if (angle === 0 && k === 3) {
        b.truss(turnedBy(angle, 8), turnedBy(angle, 10.6), 0.35, steel, 4);
        b.box(turnedBy(angle, 10.4), [0.5, 0.4, 0.4], white);
        continue;
      }
      b.panel(turnedBy(angle, 2.1 + k * 2.1), [2.05, k ? 2.65 : 2.1], { across, back: white });
    }
  }
}

function ulysses(b) {
  b.box([0, 0, 0], [3, 3.2, 0.9], gold);
  highGain(b, { radius: 0.82, z: 0.45 });
  generator(b, [1.5, 0, 0], [2.7, 0, 0], 0.22);
  b.truss([-1.5, 0, 0], [-7, 0, 0], 0.1, steel, 16);
  for (const side of BOTH_SIDES) b.tube([0, side * 1.6, 0], [0, side * 16, 0], 0.02, steel, thin);
}

function messenger(b) {
  b.box([0, 0, -0.2], [1.3, 1.3, 1.9], black);
  b.tube([0, -1.2, -1.2], [0, -1.2, 1.2], 1.25, white, { sides: 6, open: true });
  b.disc([0, -1, 0], [0, -1, 0], 1.25, white);
  wings(b, { from: 0.8, length: 1.5, width: 1.7 });
  b.truss([0, 0.6, -1], [0, 4, -1], 0.08, steel, 10);
  b.tube([0, 0, -1.1], [0, 0, -1.5], 0.14, dark, { end: 0.3, open: true });
}

function dawn(b) {
  b.box([0, 0, 0], [1.64, 1.27, 1.77], gold);
  highGain(b, { radius: 0.76, z: 0.9 });
  wings(b, { from: 1.2, length: 1.6, width: 2.27, panels: 5, gap: 0.05 });
  for (const x of [-0.5, 0, 0.5]) b.tube([x, 0, -0.88], [x, 0, -1.15], 0.15, grey, { end: 0.2, open: true });
  b.box([0.3, 0.8, 0.3], [0.35, 0.5, 0.35], black);
}

function rosetta(b) {
  b.box([0, 0, 0], [2.8, 2.1, 2], black);
  b.box([0, 1.15, -0.2], [1, 0.3, 1], gold);
  b.dish([0, -1.3, 0.6], [0, -0.4, 1], 1.1, 0.3, white, gold);
  wings(b, { from: 1.6, length: 2.7, width: 2.25, panels: 5, gap: 0.1 });
  b.tube([0.4, 1, 0.6], [0.4, 1.5, 0.6], 0.2, dark);
}

function parker(b) {
  b.disc([0, 0, 1.5], [0, 0, 1], 1.15, white, { sides: 48 });
  b.tube([0, 0, 1.38], [0, 0, 1.49], 1.15, dark, { sides: 48 });
  b.tube([0, 0, -0.5], [0, 0, 1], 0.5, silver, { sides: 6 });
  b.truss([0, 0, 0.6], [0, 0, 1.4], 0.7, grey, 2);
  for (const side of BOTH_SIDES) {
    b.panel([side * 0.95, 0, 0.1], [0.7, 0.7], { normal: [side * 0.8, 0, 0.6], across: [0, 1, 0] });
    b.tube([0, side * 0.5, 0.8], [side * 1.2, side * 1.6, -0.4], 0.03, steel, thin);
  }
  b.truss([0, 0, -0.5], [0, 0, -3.2], 0.12, steel, 8);
  b.dish([0.5, 0, 0], [1, 0, 0], 0.3, 0.08, white);
}

function solarOrbiter(b) {
  b.box([0, 0, -0.3], [2, 1.7, 2.2], amber);
  b.box([0, 0, 1.1], [3, 2.4, 0.35], black);
  wings(b, { from: 1.3, length: 2.1, width: 1.2, panels: 3, gap: 0.05, z: -0.6 });
  b.dish([0, -1.4, -0.6], [0, -1, 0], 0.55, 0.12, silver, silver);
  b.truss([0, 0, -1.4], [0, 0, -5.8], 0.1, steel, 14);
  for (const [angle] of evenly(3, (angle) => [angle + 0.5])) b.tube(turnedBy(angle, 1, 0.8), turnedBy(angle, 6, 0.3), 0.02, steel, thin);
}

function bepiColombo(b) {
  b.box([0, 0, -1.9], [2.4, 2.2, 2], white);
  b.box([0, 0, 0.2], [2.2, 1.9, 1.7], white);
  b.tube([0, 0, 1.1], [0, 0, 2], 0.9, silver, { sides: 8 });
  wings(b, { from: 1.4, length: 2.3, width: 1.9, panels: 5, gap: 0.1, z: -1.9 });
  b.turning([0, 0.2], () => b.panel([3, 0, 0.2], [3.6, 1.2]));
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) b.tube([x, y, -2.9], [x, y, -3.2], 0.16, dark, { end: 0.2, open: true });
  b.dish([0, 1.3, 0.6], [0, 1, 0.5], 0.5, 0.12, white);
}

function juice(b) {
  b.box([0, 0, 0], [2.6, 2.9, 3.6], gold);
  highGain(b, { radius: 1.27, depth: 0.3, z: 1.8 });
  wings(b, { from: 1.8, length: 2.5, width: 3.5, panels: 3 });
  b.turning([0, 0], () => {
    for (const side of BOTH_SIDES) for (const y of BOTH_SIDES) b.panel([side * 5.7, y * 3.6, 0], [2.5, 3.5]);
  });
  b.truss([0, -1.4, -1], [0, -12, -1], 0.14, steel, 24);
  b.tube([0, 1.5, 0.5], [8, 2, 0.5], 0.03, steel, thin);
  b.tube([0, 1.5, 0.5], [-8, 2, 0.5], 0.03, steel, thin);
}

function europaClipper(b) {
  b.tube([0, 0, -2.4], [0, 0, 1.4], 0.8, silver, { sides: 12 });
  b.box([0, 0, 1.7], [1.8, 1.8, 1], gold);
  highGain(b, { radius: 1.5, depth: 0.45, z: 2.2 });
  wings(b, { from: 1.6, length: 2.45, width: 4.1, panels: 5, gap: 0.05, z: -1 });
  for (const side of BOTH_SIDES) for (const y of BOTH_SIDES) b.tube([side * 8, 0, -1], [side * 8, y * 8.5, -1], 0.04, steel, thin);
  b.truss([0, 0.9, 1.4], [0, 8.5, 1.4], 0.12, steel, 18);
  b.box([0.9, -0.7, 1.4], [0.6, 0.6, 0.8], black);
}

function lucy(b) {
  b.box([0, 0, -0.2], [1.4, 1.4, 1.9], gold);
  highGain(b, { radius: 1, z: 0.8 });
  for (const side of BOTH_SIDES) {
    b.tube([side * 0.7, 0, 0], [side * 1.2, 0, 0], 0.06, grey, thin);
    for (let k = 0; k < 10; k++) {
      const [a, c] = [(2 * Math.PI * k) / 10, (2 * Math.PI * (k + 1)) / 10];
      const centre = [side * 4.85, 0, 0];
      const edge = (angle) => [centre[0] + 3.6 * Math.cos(angle), 3.6 * Math.sin(angle), 0];
      b.turning([0, 0], () => {
        b.quad([centre, edge(a), edge(c), centre], [0, 0, 1], cells, [[0, 0], [0, 9], [5.6, 9], [5.6, 0]]);
        b.quad([centre, edge(c), edge(a), centre].map(([x, y, z]) => [x, y, z - 0.03]), [0, 0, -1], tan);
      });
    }
  }
  b.tube([0.4, -0.8, -0.8], [0.4, -0.8, -1.5], 0.2, black);
}

function psyche(b) {
  b.box([0, 0, 0], [2.2, 2.4, 3], gold);
  highGain(b, { radius: 1, z: 1.5 });
  wings(b, { from: 1.6, length: 2.4, width: 2.2, panels: 4 });
  b.turning([0, 0], () => {
    for (const side of BOTH_SIDES) for (const y of BOTH_SIDES) b.panel([side * 5.3, y * 2.3, 0], [2.4, 2.2]);
  });
  b.tube([0, 1.2, -1], [0, 3.4, -1.4], 0.05, steel, thin);
  for (const x of BOTH_SIDES) b.tube([x * 0.7, 0, -1.5], [x * 0.7, 0, -1.8], 0.14, dark, { end: 0.18, open: true });
}

function osirisRex(b) {
  b.box([0, 0, 0], [2.4, 2.4, 1.6], gold);
  highGain(b, { radius: 1, z: 0.8 });
  wings(b, { from: 1.4, length: 1.9, width: 2, panels: 1 });
  b.tube([0, 1.2, 0.3], [0, 2.3, 1.2], 0.06, white, thin);
  b.tube([0, 2.3, 1.2], [0, 3.6, 0.4], 0.06, white, thin);
  b.tube([0, 3.6, 0.3], [0, 3.6, 0.45], 0.16, steel);
  b.tube([0.6, -1.2, -0.3], [0.6, -1.8, -0.3], 0.18, black);
}

function hayabusa2(b) {
  b.box([0, 0, 0], [1, 1.6, 1.25], black);
  b.disc([-0.22, 0.35, 0.65], [0, 0, 1], 0.45, white);
  b.disc([0.22, -0.4, 0.65], [0, 0, 1], 0.45, white);
  wings(b, { from: 0.7, length: 1.15, width: 1.4, panels: 3, gap: 0.05 });
  b.tube([0, 0, -0.62], [0, 0, -1.7], 0.1, silver, { end: 0.2 });
  for (const y of [-0.5, -0.2, 0.2, 0.5]) b.tube([-0.5, y, 0], [-0.65, y, 0], 0.1, grey);
}

function kepler(b) {
  b.tube([0, 0, -2.2], [0, 0, 1.6], 0.75, silver);
  b.tube([0, 0, 1.6], [0, 0, 2.4], 0.75, black, { open: true });
  b.disc([0, 0, 1.7], [0, 0, 1], 0.7, dark);
  b.tube([0, 0, -2.4], [0, 0, -1.4], 1.35, black, { sides: 6 });
  for (const [angle] of evenly(4, (angle) => [angle * 0.5 - 0.6])) {
    const out = turnedBy(angle, 1);
    b.panel(turnedBy(angle, 1, 0), [2.9, 0.75], { normal: out, across: [0, 0, 1], back: white });
  }
  b.dish([0, 0, -2.4], [0, 0, -1], 0.5, 0.15, white);
}

function roadster(b) {
  b.box([0, 0, 0.35], [1.75, 3.9, 0.45], red);
  b.box([0, 0.1, 0.62], [1.6, 2.3, 0.2], red);
  b.box([0, -0.15, 0.68], [1.3, 1.3, 0.12], dark);
  b.box([0, 0.55, 0.85], [1.35, 0.05, 0.4], glass, { forward: [0, 0.5, 0.9] });
  for (const x of BOTH_SIDES) for (const y of [-1.2, 1.25]) b.tube([x * 0.7, y, 0.22], [x * 0.92, y, 0.22], 0.32, dark);
  for (const x of BOTH_SIDES) {
    b.box([x * 0.33, -0.3, 0.8], [0.45, 0.5, 0.4], dark);
    b.ball([x * 0.6, 1.9, 0.42], 0.1, glass);
  }
  b.box([-0.33, -0.2, 0.95], [0.42, 0.3, 0.55], white);
  b.ball([-0.33, -0.15, 1.35], 0.17, white);
  b.tube([0, -1.9, -0.6], [0, -0.4, 0.1], 0.7, dark, { end: 0.9 });
}

function jamesWebb(b) {
  b.box([0, 0, -1.2], [2.2, 2.4, 1.4], amber);
  b.turning([0, -1.4], () => b.panel([0, 2, -2], [2.2, 3.2], { normal: [0, 0, -1], across: [1, 0, 0] }));
  for (let layer = 0; layer < 5; layer++) {
    const z = -0.3 + layer * 0.18;
    const [x, y] = [7.1 - layer * 0.25, 10.6 - layer * 0.35];
    const outline = [[0, -y], [x, -y * 0.45], [x, y * 0.45], [0, y], [-x, y * 0.45], [-x, -y * 0.45]];
    for (const [side, finish] of [[1, silver], [-1, layer ? silver : tan]]) {
      for (let k = 0; k < outline.length; k++) {
        const [a, c] = [outline[k], outline[(k + 1) % outline.length]];
        b.quad([[0, 0, z], [...a, z], [...c, z], [0, 0, z]].map((p) => [p[0], p[1], p[2] + side * 0.01]), [0, 0, side], finish);
      }
    }
  }
  const tile = 1.32;
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) > 2 || (q === 0 && r === 0)) continue;
      const x = tile * 0.75 * q;
      const height = tile * 0.866 * (r + q / 2);
      b.tube([x, 0.25, 4.1 + height], [x, 0.32, 4.1 + height], tile * 0.49, mirror, { sides: 6 });
    }
  }
  b.box([0, -0.5, 4], [3, 1, 4], black);
  b.tube([0, -0.5, 0.6], [0, -0.5, 2.4], 0.5, black);
  for (const [x, z] of [[-2.4, 2.4], [2.4, 2.4], [0, 7]]) b.tube([x, 0.3, z], [0, 6.8, 4.1], 0.06, dark, thin);
  b.tube([0, 6.8, 4.1], [0, 6.9, 4.1], 0.4, dark);
}

function roman(b) {
  b.tube([0, 0, -3], [0, 0, 5], 1.6, silver);
  b.tube([0, 0, 5], [0, 0, 7], 1.75, black, { open: true });
  b.disc([0, 0, 5.2], [0, 0, 1], 1.5, dark);
  b.tube([0, 0, -5], [0, 0, -3], 2.1, gold, { sides: 8 });
  for (const x of [-2.4, 0, 2.4]) b.panel([x, 2.2, 0.8], [2.2, 8], { normal: [x * 0.12, 1, 0], across: [1, 0, 0] });
  b.dish([0, -2.3, -4], [0, -1, 0], 0.9, 0.2, white);
}

function soho(b) {
  b.box([0, 0, 0], [2.7, 2.7, 2.6], gold);
  b.box([0, 0, 1.5], [1.6, 1.6, 1.2], silver);
  wings(b, { from: 1.7, length: 1.5, width: 1.5, panels: 2 });
  for (const y of BOTH_SIDES) b.tube([0.3, y * 0.4, 2], [0.3, y * 0.4, 2.8], 0.2, black);
  b.dish([0, -1.7, -0.6], [0, -1, -0.3], 0.4, 0.1, white);
}

function gaia(b) {
  b.disc([0, 0, -0.6], [0, 0, 1], 5.1, gold, { sides: 12 });
  b.disc([0, 0, -0.62], [0, 0, -1], 5.1, silver, { sides: 12 });
  for (const [angle] of evenly(6, (angle) => [angle])) b.panel(turnedBy(angle, 2.1, -0.75), [1.6, 2], { normal: [0, 0, -1], across: turnedBy(angle, 1) });
  b.tube([0, 0, -0.5], [0, 0, 0.8], 1.5, black, { sides: 12 });
  b.tube([0, 0, 0.8], [0, 0, 2.6], 1.5, white, { sides: 12 });
  b.disc([0, 0, -0.8], [0, 0, -1], 1, white);
}

function orion(b) {
  b.tube([0, 0, 0.8], [0, 0, 3.4], 2.5, black, { end: 0.7 });
  b.disc([0, 0, 3.41], [0, 0, 1], 0.7, white);
  b.tube([0, 0, -3], [0, 0, 0.8], 2.5, white);
  b.tube([0, 0, -3], [0, 0, -4.2], 0.3, dark, { end: 0.75, open: true });
  for (const [angle] of evenly(4, (angle) => [angle + Math.PI / 4])) {
    const across = turnedBy(angle, 1);
    for (let k = 0; k < 3; k++) b.panel(turnedBy(angle, 3.6 + k * 2.15, -2.4), [2.05, 2], { across, normal: [0, 0, -1] });
  }
}

const ISS_WING_X = [-48, -33, 33, 48];

function spaceStation(b) {
  b.truss([-52, 0, -4], [52, 0, -4], 4, steel, 26);
  b.turning([0, -4], () => {
    for (const x of ISS_WING_X) {
      for (const y of BOTH_SIDES) {
        b.tube([x, y * 1, -4], [x, y * 36, -4], 0.35, grey, thin);
        for (const side of BOTH_SIDES) b.panel([x + side * 3, y * 19, -4], [5, 33], { across: [1, 0, 0], back: FINISH.brownCells });
      }
    }
  });
  for (const x of [-12, 12]) for (const z of [-1, 0, 1]) b.panel([x + z * 3.6, -12, -4], [3.3, 20], { cells: white, back: white, normal: [0.15, 0, 1] });
  const modules = [[0, -20, 8.5], [0, -10, 10], [0, 0.5, 9], [0, 10, 8], [0, 20, 10], [0, 30, 12]];
  for (const [x, y, length] of modules) b.tube([x, y - length / 2, 0], [x, y + length / 2, 0], 2.2, y > 15 ? white : silver);
  b.tube([-11, -20.5, 0], [11, -20.5, 0], 2.2, white);
  b.tube([-9, -14, 0], [-4, -10, 0], 1.8, white);
  b.tube([0, 0, 1], [0, 0, 7], 2, white);
  b.tube([0, 22, 2], [0, 22, 8], 1.5, dark, { end: 1.2 });
  for (const [x, y, z] of [[4, 2, 0], [0, 38, 0]]) {
    b.tube([x, y, z], [x, y + 7, z], 1.3, grey);
    b.turning([y + 5, z], () => {
      for (const side of BOTH_SIDES) b.panel([x + side * 4, y + 5, z], [5, 1.5]);
    });
  }
  b.turning([27, 0], () => {
    for (const side of BOTH_SIDES) b.panel([side * 8, 27, 0], [11, 3]);
  });
  b.tube([2.4, -5, -2], [9, -8, 4], 0.2, white, thin);
  b.tube([9, -8, 4], [14, -2, 1], 0.2, white, thin);
}

function tiangong(b) {
  b.tube([0, -7, 0], [0, 5, 0], 2.1, white);
  b.tube([0, 5, 0], [0, 8, 0], 1.4, white);
  b.ball([0, 9.2, 0], 1.6, white);
  for (const side of BOTH_SIDES) {
    b.tube([side * 1.5, 9.2, 0], [side * 18, 9.2, 0], 2.1, white);
    b.turning([9.2, 0], () => {
      for (const y of BOTH_SIDES) b.panel([side * 19.5, 9.2 + y * 16, 0], [4.2, 26], { cells: FINISH.brownCells });
    });
  }
  b.turning([-5, 0], () => {
    for (const side of BOTH_SIDES) b.panel([side * 8, -5, 0], [11, 2.8], { cells: FINISH.brownCells });
  });
  b.tube([0, -18, 0], [0, -7.5, 0], 1.6, white);
  b.tube([0, 10.8, 0], [0, 18, 0], 1.4, white);
}

function hubble(b) {
  b.tube([0, 0, -2.6], [0, 0, 1.6], 1.5, silver);
  b.tube([0, 0, 1.6], [0, 0, 6.6], 1.2, silver, { open: true });
  b.disc([0, 0, 5.6], [0, 0, 1], 1.15, dark);
  b.tube([0, 0, -6.6], [0, 0, -2.6], 2.1, silver);
  b.disc([0, 2.1, 7.4], [0, -0.7, 0.7], 1.25, silver);
  b.disc([0, 2.12, 7.4], [0, 0.7, -0.7], 1.25, silver);
  wings(b, { from: 1.9, length: 2.6, width: 7.1, panels: 1, z: 1 });
  for (const side of BOTH_SIDES) {
    b.tube([0, side * 1.6, 0.5], [0, side * 4, 0.5], 0.07, grey, thin);
    b.dish([0, side * 4, 0.5], [0, side, 0.4], 0.65, 0.15, white);
  }
}

function lunarOrbiter(b) {
  b.box([0, 0, 0], [1.9, 1.5, 2.2], gold);
  b.turning([0, 0.4], () => {
    b.tube([0.9, 0, 0.4], [1.6, 0, 0.4], 0.06, grey, thin);
    for (let k = 0; k < 3; k++) b.panel([2.4 + k * 1.45, 0, 0.4], [1.4, 3.2]);
  });
  b.tube([-0.9, 0, -0.6], [-2.8, 0, -1], 0.05, grey, thin);
  b.dish([-2.9, 0, -1], [0, 0, -1], 0.45, 0.14, white);
  for (const x of BOTH_SIDES) b.tube([x * 0.4, 0.8, 0.4], [x * 0.4, 0.8, 1.6], 0.2, black);
}

function marsOrbiter(b) {
  b.box([0, 0, 0], [2, 2, 2.6], black);
  b.tube([0, 1, -1], [0, 1, 1.6], 0.35, silver);
  b.dish([0, -1.4, -1.6], [0, -0.6, -0.8], 1.5, 0.4, white, black);
  for (const side of BOTH_SIDES) {
    b.tube([side, 0, -0.8], [side * 1.6, 0, -1], 0.08, grey, thin);
    b.turning([0, -1], () => b.panel([side * 4.3, 0, -1], [5.3, 2.5]));
  }
  b.tube([0, 1, 1.2], [7, 1.2, 1.2], 0.03, steel, thin);
  b.tube([0, 1, 1.2], [-7, 1.2, 1.2], 0.03, steel, thin);
}

function maven(b) {
  b.box([0, 0, 0], [2.3, 2.3, 2], gold);
  highGain(b, { radius: 1, z: 1 });
  b.turning([0, 0], () => {
    for (const side of BOTH_SIDES) {
      b.panel([side * 2.2, 0, 0], [2, 2.3]);
      b.panel([side * 4.3, 0, 0], [2, 2.3]);
      b.panel([side * 5.6, 0, 0], [0.6, 2.3]);
    }
  });
  b.tube([0, 1.1, -0.8], [0, 3.4, -1.2], 0.06, white, thin);
  for (const side of BOTH_SIDES) b.tube([side * 0.8, -1, 0.8], [side * 4.5, -6, 1.4], 0.03, steel, thin);
}

const MODELS = {
  voyager, pioneer, newHorizons, galileo, cassini, juno, ulysses, messenger, dawn, rosetta, parker, solarOrbiter, bepiColombo, juice, europaClipper, lucy, psyche,
  osirisRex, hayabusa2, kepler, roadster, jamesWebb, roman, soho, gaia, orion, spaceStation, tiangong, hubble, lunarOrbiter, marsOrbiter, maven, ...LANDER_MODELS,
};

const HALF_SIZE_METRES = {
  voyager: 3, pioneer: 2, newHorizons: 1.8, galileo: 4, cassini: 4, juno: 9, ulysses: 2.5, messenger: 2.5, dawn: 6, rosetta: 10, parker: 1.8, solarOrbiter: 5, bepiColombo: 9, juice: 9, europaClipper: 11, lucy: 7, psyche: 9,
  osirisRex: 3, hayabusa2: 3, kepler: 2.4, roadster: 2, jamesWebb: 9, roman: 6, soho: 3.5, gaia: 5, orion: 7, spaceStation: 45, tiangong: 26, hubble: 7, lunarOrbiter: 3.5, marsOrbiter: 5, maven: 5,
  apolloSite: 5, apolloRoverSite: 5, luna9: 0.8, surveyor: 2.2, lunokhod: 1.5, changE: 2.6, yutu: 1.3, vikram: 1.8, slim: 1.6, novaC: 2.2, blueGhost: 1.9, viking: 1.6, pathfinder: 1.5, explorationRover: 1.4, phoenix: 1.8, insight: 2,
  bigRover: 1.9, ingenuity: 0.6, zhurong: 1.5, beagle: 0.7, venera: 1.6, veneraSphere: 0.9, huygens: 0.8,
};

export const halfSizeKm = (name) => HALF_SIZE_METRES[name] / 1000;

export function addModel(name, build) {
  MODELS[name] ??= build;
}

const built = new Map();

export function modelNamed(name) {
  if (!built.has(name)) {
    const builder = createModelBuilder();
    MODELS[name](builder);
    const model = builder.finished();
    let reach = 0;
    for (let i = 0; i < model.vertices.length; i += MODEL_FLOATS) reach = Math.max(reach, Math.hypot(model.vertices[i], model.vertices[i + 1], model.vertices[i + 2]));
    built.set(name, { name, ...model, radiusMetres: reach });
  }
  return built.get(name);
}
