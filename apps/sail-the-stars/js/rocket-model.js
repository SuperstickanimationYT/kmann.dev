import { FINISH } from './model-builder.js';
import { PARTS } from './rocket-stages.js';
import { addModel } from './spacecraft-models.js';

export const FEET_BELOW_ORIGIN_M = 2;

const { white, grey, dark, black, glass, steel, red } = FINISH;
const BAND_M = 0.14;
const BAND_LIFT_M = 0.015;
const CAPSULE_TOP_SHARE = 0.36;
const ENGINE = { mountShare: 0.3, mountRadiusShare: 0.22, throatShare: 0.2, exitShare: 0.45 };
const PARACHUTE = { radiusShare: 0.4, tipShare: 0.12, wallShare: 0.55 };
const POD_LIFT_SHARE = 0.3;
const LEG = { strutRadiusM: 0.12, braceRadiusM: 0.07, footRadiusM: 0.4, braceShare: 0.45 };
const CANOPY = { depthShare: 0.45, linesShare: 1.3, lines: 16, lineRadiusM: 0.04, splayRadians: 0.3 };
export const CANOPY_STEPS = 4;

const anglesOf = (copies) => Array.from({ length: copies }, (_, k) => (2 * Math.PI * k) / copies);

const centresOf = ({ x, copies }) => anglesOf(copies).map((angle) => [x * Math.cos(angle), x * Math.sin(angle)]);

const SHAPES = {
  capsule(b, at, { widthM, heightM }) {
    const radius = widthM / 2;
    b.tube(at(0), at(heightM), radius, white, { end: radius * CAPSULE_TOP_SHARE });
    b.tube(at(0), at(BAND_M), radius + BAND_LIFT_M, dark);
    const windowRadius = radius * (1 - (1 - CAPSULE_TOP_SHARE) * 0.45);
    const [x, y, z] = at(heightM * 0.45);
    b.box([x + windowRadius, y, z], [0.08, 0.5, 0.4], glass);
  },
  parachute(b, at, { widthM, heightM }) {
    const radius = widthM * PARACHUTE.radiusShare;
    b.tube(at(0), at(heightM * PARACHUTE.wallShare), radius, grey);
    b.tube(at(heightM * PARACHUTE.wallShare), at(heightM), radius, grey, { end: widthM * PARACHUTE.tipShare });
  },
  heatShield(b, at, { widthM, heightM }) {
    b.tube(at(0), at(heightM), widthM * 0.47, dark, { end: widthM / 2 });
  },
  tank(b, at, { widthM, heightM }) {
    const radius = widthM / 2;
    b.tube(at(0), at(heightM), radius, white);
    b.tube(at(0), at(BAND_M), radius + BAND_LIFT_M, grey);
    b.tube(at(heightM - BAND_M), at(heightM), radius + BAND_LIFT_M, grey);
  },
  engine(b, at, { widthM, heightM }) {
    const mountBottom = heightM * (1 - ENGINE.mountShare);
    b.tube(at(mountBottom), at(heightM), widthM * ENGINE.mountRadiusShare, grey);
    b.tube(at(mountBottom), at(0), widthM * ENGINE.throatShare, dark, { end: widthM * ENGINE.exitShare, open: true });
  },
  separator(b, at, { widthM, heightM }) {
    b.tube(at(0), at(heightM), widthM / 2, black);
  },
  sideSeparator(b, at, { widthM, heightM }) {
    b.box(at(heightM / 2), [widthM, widthM * 1.5, heightM], grey);
  },
};

function legsAt(b, part, bottomZ) {
  const { widthM, heightM } = PARTS.legs;
  for (const angle of anglesOf(part.copies)) {
    const out = (radius, lift) => [radius * Math.cos(angle), radius * Math.sin(angle), bottomZ + lift];
    const foot = out(part.x + widthM / 2, LEG.footRadiusM * 0.2);
    b.tube(out(part.x - widthM / 2, heightM), foot, LEG.strutRadiusM, grey, { sides: 6 });
    b.tube(out(part.x - widthM / 2, heightM * LEG.braceShare), out(part.x + widthM * 0.2, LEG.footRadiusM), LEG.braceRadiusM, grey, { sides: 6 });
    b.disc(foot, [0, 0, 1], LEG.footRadiusM, steel);
  }
}

const zOf = (y, bottomM) => y - bottomM - FEET_BELOW_ORIGIN_M;

export function modelOfParts(parts, bottomM) {
  const name = `rocket ${bottomM} ${JSON.stringify(parts.map(({ type, x, y, copies }) => [type, x, y, copies]))}`;
  addModel(name, (b) => {
    for (const part of parts) {
      if (part.type === 'legs') legsAt(b, part, zOf(part.y, bottomM));
      else for (const [cx, cy] of centresOf(part)) SHAPES[part.type](b, (lift) => [cx, cy, zOf(part.y, bottomM) + lift], PARTS[part.type]);
    }
  });
  return name;
}

export function nozzlesOf(engines, bottomM) {
  return engines.flatMap((engine) => centresOf(engine).map(([x, y]) => [x, y, zOf(engine.y, bottomM), PARTS.engine.widthM * ENGINE.exitShare * 0.85]));
}

export const canopyTopZ = (parachutes, bottomM) => Math.max(...parachutes.map(({ y }) => zOf(y + PARTS.parachute.heightM, bottomM)));

export function canopyModel(count, step) {
  const name = `canopy ${count} ${step}`;
  const radiusM = Math.sqrt(PARTS.parachute.canopyDragAreaM2 / Math.PI) * (step / CANOPY_STEPS);
  const linesM = 2 * Math.sqrt(PARTS.parachute.canopyDragAreaM2 / Math.PI) * CANOPY.linesShare;
  addModel(name, (b) => {
    for (const angle of anglesOf(count)) {
      const splay = count > 1 ? CANOPY.splayRadians : 0;
      const axis = [Math.sin(splay) * Math.cos(angle), Math.sin(splay) * Math.sin(angle), Math.cos(splay)];
      const top = axis.map((value) => value * linesM);
      b.dish(top, axis.map((value) => -value), radiusM, radiusM * CANOPY.depthShare, white, red);
      const rimAxes = [[Math.cos(splay) * Math.cos(angle), Math.cos(splay) * Math.sin(angle), -Math.sin(splay)], [-Math.sin(angle), Math.cos(angle), 0]];
      for (const line of anglesOf(CANOPY.lines)) {
        const rim = top.map((value, i) => value - axis[i] * radiusM * CANOPY.depthShare + radiusM * (Math.cos(line) * rimAxes[0][i] + Math.sin(line) * rimAxes[1][i]));
        b.tube([0, 0, 0], rim, CANOPY.lineRadiusM, white, { sides: 4, open: true });
      }
    }
  });
  return name;
}

export function podsOf(top, bottomM) {
  const { widthM, heightM } = PARTS[top.type];
  return [widthM / 2 + 0.12, zOf(top.y, bottomM) + heightM * POD_LIFT_SHARE];
}
