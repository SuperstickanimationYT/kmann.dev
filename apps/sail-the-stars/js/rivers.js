import { lattice } from './terrain.js';

export const RIBBON_FLOATS = 11;
const CHUNK_SEGMENTS = 4;
const RIPPLE_PERIOD_METRES = 409.6;
const VALLEY_METRES = 5000;
const CELL_RADIANS = 0.03;
const CELLS_PER_SIDE = 1024;
const FINEST_SPACING_METRES = 25;
const SPACING_PER_WIDTH = 0.15;
const MOST_STEPS = 2048;
const MEANDER_SHARE = 0.09;
const SHORTEST_MEANDER_WIDTHS = 7;
const MEANDER_SALT = 5000;
const SWING_REACH = 0.2;
const FADED_FROM_ENDS = 0.12;
const COARSEST_VALLEY_FOOTPRINT_METRES = 2500;
const PATHS_KEPT = 160;
const PIECE = 10;
const SHALLOWEST_BED_METRES = 0.6;
const BED_PER_HALF_WIDTH = 0.06;
const BANK_METRES = 0.5;
const BANK_RUN_METRES = 12;
const FLOODPLAIN_SLOPE = 0.012;

const smooth = (t) => t * t * (3 - 2 * t);
const clamped = (t) => Math.min(1, Math.max(0, t));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => {
  const length = Math.hypot(...v) || 1;
  return v.map((value) => value / length);
};
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const directionAt = (longitude, latitude) => [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];

const COORDINATE_SCALE = Math.PI / 32767;

export function unpackRivers(buffer) {
  const packed = new DataView(buffer);
  const courses = [];
  for (let at = 0; at < buffer.byteLength; ) {
    const count = packed.getUint16(at, true);
    const course = { ups: [], levels: [], widths: [] };
    for (let k = 0; k < count; k++) {
      const point = at + 2 + k * 8;
      course.ups.push(directionAt(packed.getInt16(point, true) * COORDINATE_SCALE, (packed.getInt16(point + 2, true) * COORDINATE_SCALE) / 2));
      course.levels.push(packed.getInt16(point + 4, true));
      course.widths.push(packed.getUint16(point + 6, true));
    }
    courses.push(course);
    at += 2 + count * 8;
  }
  return { courses, molten: false };
}

function tangents({ ups }, radiusMetres) {
  const places = ups.map((up) => up.map((value) => value * radiusMetres));
  return places.map((_, k) => {
    const before = places[Math.max(0, k - 1)];
    const after = places[Math.min(places.length - 1, k + 1)];
    const run = (k > 0 ? apart(places[k], before) : 0) + (k < places.length - 1 ? apart(after, places[k]) : 0);
    return after.map((value, axis) => (value - before[axis]) / Math.max(run, 1));
  });
}

function segmentsOf(courses, radiusMetres) {
  return courses.flatMap((course, courseNumber) => {
    const leaving = tangents(course, radiusMetres);
    return course.ups.slice(1).map((up, k) => {
      const start = course.ups[k].map((value) => value * radiusMetres);
      const end = up.map((value) => value * radiusMetres);
      const length = apart(start, end);
      const narrowest = Math.min(course.widths[k], course.widths[k + 1]);
      const steps = Math.min(MOST_STEPS, 2 ** Math.max(1, Math.ceil(Math.log2(length / Math.max(FINEST_SPACING_METRES, SPACING_PER_WIDTH * narrowest)))));
      return {
        key: `${courseNumber} ${k}`,
        courseNumber,
        k,
        start,
        end,
        startTangent: leaving[k].map((value) => value * length),
        endTangent: leaving[k + 1].map((value) => value * length),
        length,
        steps,
        meanders: Math.max(0, Math.floor(Math.log2(length / (SHORTEST_MEANDER_WIDTHS * narrowest)))),
        levels: [course.levels[k], course.levels[k + 1]],
        widths: [course.widths[k], course.widths[k + 1]],
        middle: start.map((value, axis) => (value + end[axis]) / 2),
      };
    });
  });
}

const indexes = new WeakMap();
const cellOf = (metres, radiusMetres) => Math.floor(metres / (radiusMetres * CELL_RADIANS)) + CELLS_PER_SIDE / 2;
const cellKey = (x, y, z) => (x * CELLS_PER_SIDE + y) * CELLS_PER_SIDE + z;

export function riverIndex(rivers, radiusMetres) {
  if (indexes.has(rivers)) return indexes.get(rivers);
  const segments = segmentsOf(rivers.courses, radiusMetres);
  const cells = new Map();
  segments.forEach((segment) => {
    const reach = VALLEY_METRES + segment.length * SWING_REACH;
    const ranges = [0, 1, 2].map((axis) => [Math.min(segment.start[axis], segment.end[axis]) - reach, Math.max(segment.start[axis], segment.end[axis]) + reach].map((value) => cellOf(value, radiusMetres)));
    for (let x = ranges[0][0]; x <= ranges[0][1]; x++) for (let y = ranges[1][0]; y <= ranges[1][1]; y++) for (let z = ranges[2][0]; z <= ranges[2][1]; z++) {
      const key = cellKey(x, y, z);
      const there = cells.get(key);
      if (there) there.push(segment);
      else cells.set(key, [segment]);
    }
  });
  const chunks = [];
  segments.forEach((segment) => {
    const last = chunks[chunks.length - 1];
    if (last && last.segments[0].courseNumber === segment.courseNumber && last.segments.length < CHUNK_SEGMENTS) last.segments.push(segment);
    else chunks.push({ number: chunks.length, segments: [segment] });
  });
  chunks.forEach((chunk) => {
    chunk.centre = [0, 1, 2].map((axis) => chunk.segments.reduce((sum, { middle }) => sum + middle[axis], 0) / chunk.segments.length);
    chunk.bound = Math.max(...chunk.segments.flatMap(({ start, end, length }) => [apart(start, chunk.centre) + SWING_REACH * length, apart(end, chunk.centre) + SWING_REACH * length]));
    chunk.widest = Math.max(...chunk.segments.flatMap(({ widths }) => widths));
  });
  const index = { radiusMetres, segments, cells, chunks, paths: new Map() };
  indexes.set(rivers, index);
  return index;
}

function valueNoise(position, courseNumber, k, octave) {
  const cell = Math.floor(position);
  const at = (i) => 2 * lattice(courseNumber, k, i, MEANDER_SALT + octave) - 1;
  return at(cell) + (at(cell + 1) - at(cell)) * smooth(position - cell);
}

function pointAlong(segment, t, radiusMetres) {
  const { start, end, startTangent, endTangent, length, meanders } = segment;
  const [t2, t3] = [t * t, t * t * t];
  const weights = [2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, 3 * t2 - 2 * t3, t3 - t2];
  const onCurve = [0, 1, 2].map((axis) => weights[0] * start[axis] + weights[1] * startTangent[axis] + weights[2] * end[axis] + weights[3] * endTangent[axis]);
  const chord = [0, 1, 2].map((axis) => end[axis] - start[axis]);
  const aside = unit(cross(onCurve, chord));
  const held = smooth(clamped(t / FADED_FROM_ENDS)) * smooth(clamped((1 - t) / FADED_FROM_ENDS));
  let swing = 0;
  for (let octave = 1; octave <= meanders; octave++) swing += (MEANDER_SHARE * length * valueNoise(t * 2 ** octave, segment.courseNumber, segment.k, octave)) / 2 ** (octave - 1) * 0.6;
  const swung = onCurve.map((value, axis) => value + aside[axis] * swing * held);
  const distance = Math.hypot(...swung);
  return swung.map((value) => (value / distance) * radiusMetres);
}

function pathOf(index, segment) {
  const kept = index.paths.get(segment.key);
  if (kept) return kept;
  if (index.paths.size >= PATHS_KEPT) index.paths.delete(index.paths.keys().next().value);
  const path = new Float64Array((segment.steps + 1) * 3);
  for (let step = 0; step <= segment.steps; step++) path.set(pointAlong(segment, step / segment.steps, index.radiusMetres), step * 3);
  index.paths.set(segment.key, path);
  return path;
}

const strideFor = (segment, spacing) => Math.min(segment.steps / 2, 2 ** Math.max(0, Math.floor(Math.log2(spacing / (segment.length / segment.steps)))));
const between = ([from, to], t) => from + (to - from) * t;

function segmentsNear(index, centre, reach) {
  const ranges = centre.map((value) => [cellOf(value - reach, index.radiusMetres), cellOf(value + reach, index.radiusMetres)]);
  const found = new Set();
  for (let x = ranges[0][0]; x <= ranges[0][1]; x++) for (let y = ranges[1][0]; y <= ranges[1][1]; y++) for (let z = ranges[2][0]; z <= ranges[2][1]; z++) {
    index.cells.get(cellKey(x, y, z))?.forEach((segment) => found.add(segment));
  }
  return found;
}

export function riversNear(rivers, radiusMetres, up, boundMetres, footprint) {
  if (!rivers || footprint > COARSEST_VALLEY_FOOTPRINT_METRES) return null;
  const index = riverIndex(rivers, radiusMetres);
  const centre = up.map((value) => value * radiusMetres);
  const reach = boundMetres + VALLEY_METRES;
  const found = [];
  let nearest = Infinity;
  for (const segment of segmentsNear(index, centre, boundMetres)) {
    if (apart(segment.middle, centre) - segment.length * 0.7 > reach) continue;
    const path = pathOf(index, segment);
    const stride = strideFor(segment, footprint);
    for (let step = 0; step < segment.steps; step += stride) {
      const a = step * 3;
      const b = (step + stride) * 3;
      const away = distanceToPiece(centre, path[a], path[a + 1], path[a + 2], path[b], path[b + 1], path[b + 2]).distance;
      if (away > reach) continue;
      nearest = Math.min(nearest, away);
      const [t0, t1] = [step / segment.steps, (step + stride) / segment.steps];
      found.push({ away, piece: [path[a], path[a + 1], path[a + 2], path[b], path[b + 1], path[b + 2], between(segment.levels, t0), between(segment.levels, t1), between(segment.widths, t0) / 2, between(segment.widths, t1) / 2] });
    }
  }
  if (!found.length) return null;
  const pieces = found.filter(({ away }) => away <= nearest + 2 * boundMetres);
  return { radiusMetres, pieces: Float64Array.from(pieces.flatMap(({ piece }) => piece)) };
}

const measured = { distance: 0, share: 0 };

function distanceToPiece(point, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const px = point[0] - ax;
  const py = point[1] - ay;
  const pz = point[2] - az;
  const share = clamped((px * dx + py * dy + pz * dz) / Math.max(dx * dx + dy * dy + dz * dz, 1e-6));
  measured.distance = Math.sqrt((px - dx * share) ** 2 + (py - dy * share) ** 2 + (pz - dz * share) ** 2);
  measured.share = share;
  return measured;
}

const nearestRiver = { distance: Infinity, level: 0, halfWidth: 0 };

export function riverAt(near, up) {
  nearestRiver.distance = Infinity;
  if (!near) return nearestRiver;
  const { pieces, radiusMetres } = near;
  const point = [up[0] * radiusMetres, up[1] * radiusMetres, up[2] * radiusMetres];
  for (let at = 0; at < pieces.length; at += PIECE) {
    const { distance, share } = distanceToPiece(point, pieces[at], pieces[at + 1], pieces[at + 2], pieces[at + 3], pieces[at + 4], pieces[at + 5]);
    if (distance >= nearestRiver.distance) continue;
    nearestRiver.distance = distance;
    nearestRiver.level = pieces[at + 6] + (pieces[at + 7] - pieces[at + 6]) * share;
    nearestRiver.halfWidth = pieces[at + 8] + (pieces[at + 9] - pieces[at + 8]) * share;
  }
  return nearestRiver;
}

export function carvedHeight({ distance, level, halfWidth }, natural, texture) {
  if (distance >= VALLEY_METRES) return natural;
  if (distance < halfWidth) return level - (SHALLOWEST_BED_METRES + BED_PER_HALF_WIDTH * halfWidth) * (1 - (distance / halfWidth) ** 2);
  const beyond = distance - halfWidth;
  const bank = 1 - Math.exp(-beyond / BANK_RUN_METRES);
  const floodplain = level + BANK_METRES * bank + FLOODPLAIN_SLOPE * beyond + texture * bank;
  const share = smooth(clamped((distance - 1.5 * halfWidth) / Math.max(VALLEY_METRES - 1.5 * halfWidth, 1)));
  return floodplain + (natural - floodplain) * share;
}

export function buildRibbon(rivers, radiusKm, { chunk: chunkNumber, spacing }) {
  const index = riverIndex(rivers, radiusKm * 1000);
  const chunk = index.chunks[chunkNumber];
  const centre = unit(chunk.centre).map((value) => value * index.radiusMetres);
  const vertices = [];
  const indices = [];
  chunk.segments.forEach((segment) => {
    const path = pathOf(index, segment);
    const stride = strideFor(segment, spacing);
    const alongLength = Math.max(1, Math.round(segment.length / RIPPLE_PERIOD_METRES)) * RIPPLE_PERIOD_METRES;
    const first = vertices.length / RIBBON_FLOATS;
    for (let step = 0; step <= segment.steps; step += stride) {
      const t = step / segment.steps;
      const at = (k) => path.subarray(k * 3, k * 3 + 3);
      const here = at(step);
      const up = unit([...here]);
      const before = step > 0 ? at(step - stride) : pointAlong(segment, -stride / segment.steps, index.radiusMetres);
      const after = step < segment.steps ? at(step + stride) : pointAlong(segment, 1 + stride / segment.steps, index.radiusMetres);
      const tangent = unit([0, 1, 2].map((axis) => after[axis] - before[axis]));
      const level = between(segment.levels, t);
      const place = [0, 1, 2].map((axis) => here[axis] + up[axis] * level - centre[axis]);
      for (const side of [-1, 1]) vertices.push(...place, ...tangent, side, t * alongLength, between(segment.widths, t) / 2, level, 0);
    }
    const points = vertices.length / RIBBON_FLOATS - first;
    for (let k = 0; k + 2 < points; k += 2) indices.push(first + k, first + k + 1, first + k + 2, first + k + 2, first + k + 1, first + k + 3);
  });
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), centreKm: centre.map((value) => value / 1000), boundKm: (chunk.bound + 2 * chunk.widest) / 1000 + Math.max(...chunk.segments.flatMap(({ levels }) => levels.map(Math.abs))) / 1000 };
}
