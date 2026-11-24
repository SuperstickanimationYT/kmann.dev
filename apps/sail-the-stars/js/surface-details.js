import { CUBE_FACES, patchCorners, patchEdgeMetres } from './terrain.js';
import { SCATTER_LAYERS, scatterLevel } from './surface-scatter.js';

const BUILDS_QUEUED = 6;
const KEPT_TILES = 1500;
const SMALLEST_ROCK_SHADOW_HALF_METRES = 14;
const LARGEST_ROCK_SHADOW_HALF_METRES = 120;
const ROCK_SHADOW_HALF_PER_ALTITUDE = 4;
const SMALLEST_CASTER_IN_FAR_SHADOW_METRES = 0.5;
const NOTHING = { drawn: [], casters: [], largeCasters: [], shadowHalfKm: 0 };

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const between = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

function faceCoordinates(direction) {
  const face = CUBE_FACES.reduce((best, { normal }, index) => (dot(normal, direction) > dot(CUBE_FACES[best].normal, direction) ? index : best), 0);
  const { normal, across, along } = CUBE_FACES[face];
  const ahead = dot(normal, direction);
  return { face, s: (Math.atan(dot(across, direction) / ahead) * 4) / Math.PI, t: (Math.atan(dot(along, direction) / ahead) * 4) / Math.PI };
}

function tilesAround(radiusKm, layerIndex, up) {
  const layer = SCATTER_LAYERS[layerIndex];
  const level = scatterLevel(radiusKm, layer);
  const tilesPerFace = 2 ** level;
  const { face, s, t } = faceCoordinates(up);
  const { span } = patchCorners({ level, ix: 0, iy: 0 });
  const [x, y] = [(s + 1) / span, (t + 1) / span];
  const shortestEdge = patchEdgeMetres(radiusKm, level) / Math.SQRT2;
  const steps = Math.ceil(layer.reachMetres / shortestEdge);
  const tiles = [];
  for (let iy = Math.max(0, Math.floor(y) - steps); iy <= Math.min(tilesPerFace - 1, y + steps); iy++) {
    for (let ix = Math.max(0, Math.floor(x) - steps); ix <= Math.min(tilesPerFace - 1, x + steps); ix++) {
      const reachShare = (Math.max(0, Math.hypot(ix + 0.5 - x, iy + 0.5 - y) - Math.SQRT1_2) * shortestEdge) / layer.reachMetres;
      if (reachShare < 1) tiles.push({ key: `${layerIndex} ${face} ${level} ${ix} ${iy}`, layer: layerIndex, face, level, ix, iy, reachShare });
    }
  }
  return tiles;
}

function growsOn({ vegetation, vegetationShare, rocks }, { kind }, index) {
  return kind === 'grass' ? !!vegetation && vegetationShare > 0 : rocks?.cover[index] > 0;
}

export function createSurfaceDetails(release) {
  const builder = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
  const tiles = new Map();
  const building = new Set();
  let body = null;
  let settings = null;
  let settingsCount = 0;
  let seenFrame = 0;

  builder.onmessage = ({ data }) => {
    if (data.settingsCount === settingsCount && building.delete(data.key)) tiles.set(data.key, { ...data, seenFrame });
  };

  function switchTo(ground) {
    tiles.forEach(release);
    tiles.clear();
    building.clear();
    body = ground.body.name;
    settings = ground.settings;
    settingsCount++;
    builder.postMessage({ body, ground: settings });
  }

  function evictUnseen() {
    if (tiles.size <= KEPT_TILES) return;
    const oldest = [...tiles.values()].filter((tile) => tile.seenFrame < seenFrame).sort((a, b) => a.seenFrame - b.seenFrame);
    for (const tile of oldest.slice(0, tiles.size - KEPT_TILES)) {
      tiles.delete(tile.key);
      release(tile);
    }
  }

  function tilesInReach(ground, layers) {
    const camera = ground.cameraLocalKm;
    const { radiusKm } = ground.body;
    const wanted = [];
    const ready = [];
    for (const tile of layers.flatMap((index) => tilesAround(radiusKm, index, ground.frame.up))) {
      const built = tiles.get(tile.key);
      if (!built) {
        if (!building.has(tile.key)) wanted.push(tile);
        continue;
      }
      built.seenFrame = seenFrame;
      const nearestKm = Math.max(0, Math.hypot(...between(built.centreKm, camera)) - built.boundKm);
      if (built.count && nearestKm * 1000 < SCATTER_LAYERS[tile.layer].reachMetres) ready.push(Object.assign(built, { layer: tile.layer, nearestKm }));
    }
    wanted.sort((a, b) => a.reachShare - b.reachShare);
    for (const tile of wanted.slice(0, Math.max(0, BUILDS_QUEUED - building.size))) {
      building.add(tile.key);
      builder.postMessage({ ...tile, scatter: true, settingsCount, body, radiusKm });
    }
    return ready;
  }

  function visible(ground, { withinView, light }) {
    const aboveGroundMetres = ground.aboveGroundKm * 1000;
    const layers = SCATTER_LAYERS.flatMap((layer, index) => (aboveGroundMetres < layer.reachMetres && growsOn(ground.settings, layer, index) ? [index] : []));
    if (!layers.length) return NOTHING;
    if (ground.body.name !== body || ground.settings !== settings) switchTo(ground);
    seenFrame++;
    const inReach = tilesInReach(ground, layers);
    evictUnseen();
    const shadowHalfKm = Math.min(LARGEST_ROCK_SHADOW_HALF_METRES, Math.max(SMALLEST_ROCK_SHADOW_HALF_METRES, aboveGroundMetres * ROCK_SHADOW_HALF_PER_ALTITUDE)) / 1000;
    const castsWithin = (tile, halfKm) => {
      const offset = between(tile.centreKm, ground.cameraLocalKm);
      const along = dot(offset, light.sun);
      return Math.sqrt(Math.max(0, dot(offset, offset) - along * along)) - tile.boundKm < halfKm * Math.SQRT2;
    };
    const rocks = light ? inReach.filter((tile) => SCATTER_LAYERS[tile.layer].kind === 'rocks') : [];
    const large = rocks.filter((tile) => SCATTER_LAYERS[tile.layer].sizes[0] >= SMALLEST_CASTER_IN_FAR_SHADOW_METRES);
    return {
      drawn: inReach.filter(withinView).sort((a, b) => a.nearestKm - b.nearestKm),
      casters: rocks.filter((tile) => castsWithin(tile, shadowHalfKm)),
      largeCasters: large.filter((tile) => castsWithin(tile, light.halvesKm[0])),
      shadowHalfKm,
    };
  }

  return { visible };
}
