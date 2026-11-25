import { add, cross, dot, normalize, orthonormal, scale, subtract } from './vectors.js';

export const MODEL_ATTRIBUTES = [['aPosition', 3], ['aNormal', 3], ['aColour', 3], ['aSurface', 3], ['aCell', 2], ['aHinge', 3]];
export const MODEL_FLOATS = MODEL_ATTRIBUTES.reduce((sum, [, size]) => sum + size, 0);
export const SURFACE = { plain: 0, foil: 1, cells: 2 };

const surface = (colour, kind = SURFACE.plain, gloss = 0.2, metal = 0) => ({ colour, kind, gloss, metal });
export const FINISH = {
  white: surface([0.82, 0.82, 0.8]),
  grey: surface([0.45, 0.46, 0.47], SURFACE.plain, 0.4, 0.4),
  dark: surface([0.09, 0.09, 0.1], SURFACE.plain, 0.3),
  steel: surface([0.6, 0.61, 0.62], SURFACE.plain, 0.6, 0.8),
  gold: surface([0.86, 0.58, 0.18], SURFACE.foil, 0.75, 0.8),
  amber: surface([0.7, 0.38, 0.12], SURFACE.foil, 0.6, 0.6),
  silver: surface([0.78, 0.78, 0.8], SURFACE.foil, 0.75, 0.8),
  black: surface([0.05, 0.05, 0.055], SURFACE.foil, 0.45),
  mirror: surface([0.95, 0.76, 0.34], SURFACE.plain, 0.95, 1),
  glass: surface([0.12, 0.16, 0.22], SURFACE.plain, 0.95, 0.4),
  red: surface([0.5, 0.03, 0.03], SURFACE.plain, 0.8),
  tan: surface([0.62, 0.52, 0.38]),
  cells: surface([0.035, 0.05, 0.16], SURFACE.cells, 0.8, 0.2),
  brownCells: surface([0.3, 0.16, 0.06], SURFACE.cells, 0.6, 0.3),
};

const BOX_FACES = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
const SMOOTH_SIDES = 24;
const DISH_SIDES = 48;
const FACETED_BELOW_SIDES = 12;
const DISH_RINGS = 6;
const CELL_METRES = 0.4;
const PANEL_HALF_THICKNESS = 0.015;

const aroundAxis = (axes, angle) => add(scale(axes.right, Math.cos(angle)), scale(axes.up, Math.sin(angle)));
const axesAlong = (direction) => orthonormal(direction, Math.abs(normalize(direction)[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]);

export function createModelBuilder() {
  const floats = [];
  const indices = [];
  let hinge = [0, 0, 0];

  function vertex(position, normal, { colour, kind, gloss, metal }, cell = [0, 0]) {
    floats.push(...position, ...normal, ...colour, kind, gloss, metal, ...cell, ...hinge);
    return floats.length / MODEL_FLOATS - 1;
  }

  function quad(corners, normal, finish, cells = []) {
    const [a, b, c, d] = corners.map((corner, i) => vertex(corner, normal, finish, cells[i]));
    indices.push(a, b, c, a, c, d);
  }

  function box(centre, size, finish, { forward = [0, 0, 1], up = [0, 1, 0] } = {}) {
    const turned = orthonormal(forward, up);
    const axes = [scale(turned.right, -1), turned.up, turned.forward];
    const halves = axes.map((axis, i) => scale(axis, size[i] / 2));
    for (const [n, a, b] of BOX_FACES) {
      for (const side of [-1, 1]) {
        const face = add(centre, scale(halves[n], side));
        const corner = (x, y) => add(face, add(scale(halves[a], x), scale(halves[b], y)));
        quad([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], scale(axes[n], side), finish);
      }
    }
  }

  function ring(centre, axes, radius, sides, push) {
    return Array.from({ length: sides + 1 }, (_, k) => {
      const out = aroundAxis(axes, (2 * Math.PI * k) / sides);
      return push(add(centre, scale(out, radius)), out);
    });
  }

  function stitch(first, second) {
    for (let k = 0; k + 1 < first.length; k++) indices.push(first[k], first[k + 1], second[k + 1], first[k], second[k + 1], second[k]);
  }

  function disc(centre, normal, radius, finish, { sides = SMOOTH_SIDES } = {}) {
    const axes = axesAlong(normal);
    const middle = vertex(centre, axes.forward, finish);
    const edge = ring(centre, axes, radius, sides, (point) => vertex(point, axes.forward, finish));
    for (let k = 0; k + 1 < edge.length; k++) indices.push(middle, edge[k], edge[k + 1]);
  }

  function tube(from, to, radius, finish, { end = radius, sides = SMOOTH_SIDES, open = false } = {}) {
    const along = subtract(to, from);
    const axes = axesAlong(along);
    const slope = (radius - end) / Math.hypot(...along);
    const leaning = (out) => normalize(add(out, scale(axes.forward, slope)));
    if (sides < FACETED_BELOW_SIDES) {
      const point = (centre, r, k) => add(centre, scale(aroundAxis(axes, (2 * Math.PI * k) / sides), r));
      for (let k = 0; k < sides; k++) {
        const normal = leaning(aroundAxis(axes, (2 * Math.PI * (k + 0.5)) / sides));
        quad([point(from, radius, k), point(from, radius, k + 1), point(to, end, k + 1), point(to, end, k)], normal, finish);
      }
    } else {
      const rim = (centre, r) => ring(centre, axes, r, sides, (point, out) => vertex(point, leaning(out), finish));
      stitch(rim(from, radius), rim(to, end));
    }
    if (open) return;
    if (radius > 0) disc(from, scale(along, -1), radius, finish, { sides });
    if (end > 0) disc(to, along, end, finish, { sides });
  }

  function ball(centre, radius, finish, { flat = 1 } = {}) {
    const rows = SMOOTH_SIDES / 2;
    const rings = Array.from({ length: rows + 1 }, (_, row) => {
      const polar = (Math.PI * row) / rows;
      return ring([0, 0, 0], { right: [1, 0, 0], up: [0, 1, 0] }, 1, SMOOTH_SIDES, (_, out) => {
        const unit = [out[0] * Math.sin(polar), out[1] * Math.sin(polar), Math.cos(polar)];
        return vertex(add(centre, [unit[0] * radius, unit[1] * radius, unit[2] * radius * flat]), normalize([unit[0], unit[1], unit[2] / flat]), finish);
      });
    });
    for (let row = 0; row < rows; row++) stitch(rings[row], rings[row + 1]);
  }

  function dish(centre, direction, radius, depth, front, back = front) {
    const axes = axesAlong(direction);
    const rings = Array.from({ length: DISH_RINGS + 1 }, (_, step) => {
      const share = step / DISH_RINGS;
      const at = add(centre, scale(axes.forward, depth * share * share));
      const tilt = (2 * depth * share) / radius;
      return [[front, 1], [back, -1]].map(([finish, side]) =>
        ring(at, axes, radius * share, DISH_SIDES, (point, out) => vertex(point, scale(normalize(subtract(axes.forward, scale(out, tilt))), side), finish)));
    });
    for (let step = 0; step < DISH_RINGS; step++) for (const side of [0, 1]) stitch(rings[step][side], rings[step + 1][side]);
  }

  function panel(centre, [width, height], { across = [1, 0, 0], normal = [0, 0, 1], cells = FINISH.cells, back = FINISH.grey } = {}) {
    const n = normalize(normal);
    const x = normalize(subtract(across, scale(n, dot(across, n))));
    const y = cross(n, x);
    const corners = (lift) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(add(centre, scale(n, lift)), add(scale(x, (a * width) / 2), scale(y, (b * height) / 2))));
    const [columns, rows] = [width / CELL_METRES, height / CELL_METRES];
    quad(corners(PANEL_HALF_THICKNESS), n, cells, [[0, 0], [columns, 0], [columns, rows], [0, rows]]);
    quad(corners(-PANEL_HALF_THICKNESS), scale(n, -1), back);
  }

  function truss(from, to, width, finish, bays) {
    const axes = axesAlong(subtract(to, from));
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => scale(add(scale(axes.right, x), scale(axes.up, y)), width / 2));
    const thin = { sides: 5, open: true };
    const at = (share) => add(from, scale(subtract(to, from), share));
    corners.forEach((corner, k) => {
      tube(add(from, corner), add(to, corner), width * 0.06, finish, thin);
      const next = corners[(k + 1) % 4];
      for (let bay = 0; bay < bays; bay++) {
        tube(add(at(bay / bays), corner), add(at((bay + 1) / bays), next), width * 0.035, finish, thin);
        tube(add(at(bay / bays), corner), add(at(bay / bays), next), width * 0.035, finish, thin);
      }
    });
  }

  function turning([y, z], build) {
    hinge = [y, z, 1];
    build();
    hinge = [0, 0, 0];
  }

  return { box, disc, tube, ball, dish, panel, truss, turning, quad, finished: () => ({ vertices: new Float32Array(floats), indices: new Uint32Array(indices) }) };
}
