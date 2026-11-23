import { CUBE_FACES, detailReachKm, PATCH_CELLS, patchEdgeMetres } from './terrain.js';

const BUILDERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
const BUILDS_QUEUED_PER_BUILDER = 2;
const CELL_PIXELS = 8;
const MOST_GRAZING_SHARE = 0.1;
const FINEST_VERTEX_SPACING_METRES = 0.25;
const KEPT_PATCHES = 2500;
export const SHADOW_MAP_SIZE = 1024;
const MOST_OVERCAST_WITH_SHADOWS = 0.8;
const LOWEST_SUN_WITH_SHADOWS = -0.05;
const NEAREST_SHADOW_HALF_KM = 0.3;
const SHADOW_HALF_PER_ALTITUDE = 4;
const FAR_SHADOW_SHARE_OF_NEAR = 10;
const SHADOW_DEPTH_PER_HALF = 2;
const CASTER_SPACING_IN_TEXELS = 6;
const SUN_DISC_RADIANS = 0.0093;
const SUN_DIRECTION_STEP = 1e-4;

const keyOf = (body, face, level, ix, iy) => `${body} ${face} ${level} ${ix} ${iy}`;
const distanceBetween = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function createGroundPatches(release) {
  const builders = Array.from({ length: BUILDERS }, () => new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' }));
  const patches = new Map();
  const building = new Set();
  let body = null;
  let seenFrame = 0;
  let nextBuilder = 0;

  builders.forEach((builder) => {
    builder.onmessage = ({ data }) => {
      if (!building.delete(data.key)) return;
      patches.set(data.key, { ...data, seenFrame });
    };
  });

  function switchTo(ground) {
    patches.forEach(release);
    patches.clear();
    building.clear();
    body = ground.body.name;
    builders.forEach((builder) => builder.postMessage({ body, ground: ground.settings }));
  }

  function evictUnseen() {
    if (patches.size <= KEPT_PATCHES) return;
    const oldest = [...patches.values()].filter((patch) => patch.seenFrame < seenFrame).sort((a, b) => a.seenFrame - b.seenFrame);
    for (const patch of oldest.slice(0, patches.size - KEPT_PATCHES)) {
      patches.delete(patch.key);
      release(patch);
    }
  }

  function lightFrame(ground, exactSun) {
    const steppedSun = exactSun.map((value) => Math.round(value / SUN_DIRECTION_STEP) * SUN_DIRECTION_STEP);
    const sun = steppedSun.map((value) => value / Math.hypot(...steppedSun));
    const sunHeight = sun[0] * ground.frame.up[0] + sun[1] * ground.frame.up[1] + sun[2] * ground.frame.up[2];
    if ((ground.settings.air?.overcast ?? 0) > MOST_OVERCAST_WITH_SHADOWS || sunHeight < LOWEST_SUN_WITH_SHADOWS) return null;
    const across = Math.hypot(sun[0], sun[1]) > 1e-3 ? [sun[1], -sun[0], 0] : [1, 0, 0];
    const acrossLength = Math.hypot(...across);
    const right = across.map((value) => value / acrossLength);
    const up = [right[1] * sun[2] - right[2] * sun[1], right[2] * sun[0] - right[0] * sun[2], right[0] * sun[1] - right[1] * sun[0]];
    const nearHalfKm = Math.max(NEAREST_SHADOW_HALF_KM, ground.aboveGroundKm * SHADOW_HALF_PER_ALTITUDE);
    const halvesKm = [nearHalfKm, nearHalfKm * FAR_SHADOW_SHARE_OF_NEAR];
    return { right, up, sun, halvesKm, depthKm: halvesKm[1] * SHADOW_DEPTH_PER_HALF };
  }

  function visible(ground, { basis, tanHalf, pixelAngle, sun }) {
    if (ground.body.name !== body) switchTo(ground);
    seenFrame++;
    const { radiusKm } = ground.body;
    const camera = ground.cameraLocalKm;
    const cameraFromCentre = Math.hypot(...camera);
    const lowestKm = radiusKm + ground.settings.lowKm - detailReachKm(ground.settings);
    const cameraHorizonKm = cameraFromCentre > lowestKm ? Math.sqrt(cameraFromCentre ** 2 - lowestKm ** 2) : Infinity;
    const { right, up, forward } = basis;
    const sidePlane = (side, tan) => {
      const length = Math.hypot(1, tan);
      return [0, 1, 2].map((axis) => (side[axis] - forward[axis] * tan) / length);
    };
    const [tanX, tanY] = tanHalf;
    const frustum = [sidePlane(right, tanX), sidePlane(right.map((value) => -value), tanX), sidePlane(up, tanY), sidePlane(up.map((value) => -value), tanY)];
    const finestLevel = Math.ceil(Math.log2(patchEdgeMetres(radiusKm, 0) / PATCH_CELLS / FINEST_VERTEX_SPACING_METRES));
    const spacingKm = (level) => patchEdgeMetres(radiusKm, level) / PATCH_CELLS / 1000;
    const wanted = [];

    const gather = (judge) => {
      const chosen = [];
      const visit = (face, level, ix, iy) => {
        const key = keyOf(body, face, level, ix, iy);
        const patch = patches.get(key);
        if (!patch) {
          wanted.push({ key, face, level, ix, iy, distance: 0 });
          return;
        }
        patch.seenFrame = seenFrame;
        const verdict = judge(patch, level);
        if (!verdict) return;
        if (level < finestLevel && verdict.finer) {
          const children = [0, 1, 2, 3].map((child) => ({ face, level: level + 1, ix: ix * 2 + (child & 1), iy: iy * 2 + (child >> 1) }));
          const ready = children.map((child) => patches.get(keyOf(body, face, child.level, child.ix, child.iy)));
          if (ready.every(Boolean)) {
            children.forEach((child) => visit(child.face, child.level, child.ix, child.iy));
            return;
          }
          ready.forEach((child) => child && (child.seenFrame = seenFrame));
          children.forEach((child, i) => !ready[i] && wanted.push({ ...child, key: keyOf(body, face, child.level, child.ix, child.iy), distance: verdict.distance }));
        }
        chosen.push(patch);
      };
      CUBE_FACES.forEach((_, face) => visit(face, 0, 0, 0));
      return chosen;
    };

    const seenFromCamera = (patch, level) => {
      const distance = distanceBetween(patch.centreKm, camera);
      if (distance > patch.boundKm) {
        const farSideKm = Math.sqrt(Math.max(0, (Math.hypot(...patch.centreKm) + patch.boundKm) ** 2 - lowestKm ** 2));
        if (distance - patch.boundKm > cameraHorizonKm + farSideKm) return null;
        const offset = [0, 1, 2].map((axis) => patch.centreKm[axis] - camera[axis]);
        if (frustum.some((plane) => plane[0] * offset[0] + plane[1] * offset[1] + plane[2] * offset[2] > patch.boundKm)) return null;
      }
      const fromCentre = Math.hypot(...patch.centreKm);
      const facing = Math.abs(patch.centreKm.reduce((sum, value, axis) => sum + value * (camera[axis] - value), 0)) / (fromCentre * Math.max(distance, 1e-9));
      const foreshortening = Math.sqrt(Math.max(MOST_GRAZING_SHARE, Math.min(1, facing)));
      return { distance, finer: (distance - patch.boundKm) * pixelAngle * CELL_PIXELS < spacingKm(level) * foreshortening };
    };

    const light = lightFrame(ground, sun);
    const castingShadow = (patch, level) => {
      const offset = [0, 1, 2].map((axis) => patch.centreKm[axis] - camera[axis]);
      const along = offset[0] * light.sun[0] + offset[1] * light.sun[1] + offset[2] * light.sun[2];
      const lateral = Math.sqrt(Math.max(0, offset[0] ** 2 + offset[1] ** 2 + offset[2] ** 2 - along * along)) - patch.boundKm;
      if (lateral > light.halvesKm[1] * Math.SQRT2 || Math.abs(along) - patch.boundKm > light.depthKm) return null;
      const cascade = lateral < light.halvesKm[0] * Math.SQRT2 ? 0 : 1;
      const texelKm = (2 * light.halvesKm[cascade]) / SHADOW_MAP_SIZE;
      const penumbraKm = Math.max(0, Math.hypot(...offset) - patch.boundKm) * SUN_DISC_RADIANS;
      return { distance: lateral, finer: spacingKm(level) > CASTER_SPACING_IN_TEXELS * Math.max(texelKm, penumbraKm) };
    };

    const drawn = gather(seenFromCamera).sort((a, b) => distanceBetween(a.centreKm, camera) - a.boundKm - (distanceBetween(b.centreKm, camera) - b.boundKm));
    const casters = light ? gather(castingShadow) : [];
    wanted.sort((a, b) => a.level - b.level || a.distance - b.distance);
    for (const request of wanted) {
      if (building.size >= BUILDERS * BUILDS_QUEUED_PER_BUILDER) break;
      if (building.has(request.key)) continue;
      building.add(request.key);
      builders[nextBuilder].postMessage({ ...request, body, radiusKm });
      nextBuilder = (nextBuilder + 1) % BUILDERS;
    }
    evictUnseen();
    return { drawn, casters, light };
  }

  return { visible };
}
