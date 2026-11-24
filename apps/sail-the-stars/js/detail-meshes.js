import { createRandom } from './random.js';

export const ROCK_SHAPES = 4;
export const MESH_FLOATS = 6;
const ROCK_PLANES = 14;
const BLADES_PER_TUFT = 11;
const BLADE_STEPS = [0, 0.5];
const GOLDEN = (1 + Math.sqrt(5)) / 2;

const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((value) => value / length);
};

function icosphere(subdivisions) {
  const points = [[-1, GOLDEN, 0], [1, GOLDEN, 0], [-1, -GOLDEN, 0], [1, -GOLDEN, 0], [0, -1, GOLDEN], [0, 1, GOLDEN], [0, -1, -GOLDEN], [0, 1, -GOLDEN], [GOLDEN, 0, -1], [GOLDEN, 0, 1], [-GOLDEN, 0, -1], [-GOLDEN, 0, 1]].map(unit);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let k = 0; k < subdivisions; k++) {
    const middles = new Map();
    const middle = (a, b) => {
      const key = a < b ? `${a} ${b}` : `${b} ${a}`;
      if (!middles.has(key)) middles.set(key, points.push(unit(points[a].map((value, axis) => value + points[b][axis]))) - 1);
      return middles.get(key);
    };
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [middle(a, b), middle(b, c), middle(c, a)];
      return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    });
  }
  return { points, indices: new Uint16Array(faces.flat()) };
}

function rockPlanes(shape) {
  const random = createRandom(7919 * (shape + 1));
  return Array.from({ length: ROCK_PLANES }, () => ({ normal: unit([random.normal(), random.normal(), random.normal()]), distance: random.between(0.7, 1) }));
}

function rockPoint(planes, sharpness, direction) {
  let total = 1;
  const gradient = [...direction];
  for (const { normal, distance } of planes) {
    const reached = (normal[0] * direction[0] + normal[1] * direction[1] + normal[2] * direction[2]) / distance;
    if (reached <= 0) continue;
    const pressed = reached ** sharpness;
    total += pressed;
    normal.forEach((value, axis) => (gradient[axis] += (pressed / reached) * (value / distance)));
  }
  const radius = total ** (-1 / sharpness);
  return [...direction.map((value) => value * radius), ...unit(gradient)];
}

export function rockMesh(shape, subdivisions, sharpness) {
  const planes = rockPlanes(shape);
  const { points, indices } = icosphere(subdivisions);
  return { vertices: new Float32Array(points.flatMap((point) => rockPoint(planes, sharpness, point))), indices };
}

export function grassMesh() {
  const random = createRandom(31);
  const vertices = [];
  const indices = [];
  for (let blade = 0; blade < BLADES_PER_TUFT; blade++) {
    const angle = random.next() * 2 * Math.PI;
    const root = Math.sqrt(random.next()) * 0.8;
    const rootAngle = random.next() * 2 * Math.PI;
    const tall = random.between(0.6, 1);
    const lean = random.between(0.1, 0.5);
    const [towardX, towardY] = [Math.cos(angle), Math.sin(angle)];
    const first = vertices.length / MESH_FLOATS;
    const at = (climb, edge) => vertices.push(
      Math.cos(rootAngle) * root + towardX * lean * climb * climb,
      Math.sin(rootAngle) * root + towardY * lean * climb * climb,
      tall * (climb - 0.25 * lean * climb * climb),
      -towardY * edge,
      towardX * edge,
      climb,
    );
    for (const climb of BLADE_STEPS) [-1, 1].forEach((edge) => at(climb, edge * (1 - 0.5 * climb)));
    at(1, 0);
    indices.push(first, first + 1, first + 2, first + 2, first + 1, first + 3, first + 2, first + 3, first + 4);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}
