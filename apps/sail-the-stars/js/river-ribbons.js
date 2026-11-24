import { riverIndex } from './rivers.js';

const BUILDS_QUEUED = 4;
const FINEST_SPACING_METRES = 16;
const SPACING_PER_METRE_AWAY = 0.012;
const NARROWEST_SEEN_PIXELS = 0.3;

export function createRiverRibbons(release) {
  const builder = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
  const ribbons = new Map();
  const building = new Set();
  let rivers = null;
  let riversCount = 0;

  builder.onmessage = ({ data }) => {
    if (data.riversCount !== riversCount) return;
    building.delete(data.chunk);
    const replaced = ribbons.get(data.chunk);
    if (replaced) release(replaced);
    ribbons.set(data.chunk, data);
  };

  function switchTo(ground) {
    ribbons.forEach(release);
    ribbons.clear();
    building.clear();
    rivers = ground.settings.rivers;
    riversCount++;
    builder.postMessage({ body: ground.body.name, ground: { rivers } });
  }

  function visible(ground, { withinView, pixelAngle }) {
    if (!ground.settings.rivers) return [];
    if (ground.settings.rivers !== rivers) switchTo(ground);
    const { radiusKm } = ground.body;
    const camera = ground.cameraLocalKm;
    const drawn = [];
    const wanted = [];
    for (const { number, centre, bound, widest } of riverIndex(rivers, radiusKm * 1000).chunks) {
      const centreKm = centre.map((value) => value / 1000);
      const boundKm = bound / 1000;
      const metresAway = 1000 * Math.max(0, Math.hypot(centreKm[0] - camera[0], centreKm[1] - camera[1], centreKm[2] - camera[2]) - boundKm);
      if (widest < NARROWEST_SEEN_PIXELS * metresAway * pixelAngle || !withinView({ centreKm, boundKm: boundKm + widest / 1000 })) continue;
      const spacing = 2 ** Math.round(Math.log2(Math.max(FINEST_SPACING_METRES, metresAway * SPACING_PER_METRE_AWAY)));
      const ribbon = ribbons.get(number);
      if (ribbon) drawn.push(ribbon);
      if (ribbon?.spacing !== spacing && !building.has(number)) wanted.push({ chunk: number, spacing, metresAway });
    }
    wanted.sort((a, b) => a.metresAway - b.metresAway);
    for (const request of wanted.slice(0, Math.max(0, BUILDS_QUEUED - building.size))) {
      building.add(request.chunk);
      builder.postMessage({ ...request, ribbon: true, riversCount, body: ground.body.name, radiusKm });
    }
    return drawn;
  }

  return { visible };
}

let drainer = null;
const answers = [];

export function drainageOf(ground) {
  if (!drainer) {
    drainer = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
    drainer.onmessage = ({ data }) => {
      answers.shift()(data.rivers);
    };
  }
  return new Promise((resolve) => {
    answers.push(resolve);
    drainer.postMessage({ drain: ground });
  });
}
