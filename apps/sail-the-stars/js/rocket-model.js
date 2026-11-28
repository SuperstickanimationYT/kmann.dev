import { FINISH } from './model-builder.js';
import { PARTS } from './rocket-stages.js';
import { addModel } from './spacecraft-models.js';

export const FEET_BELOW_ORIGIN_M = 2;

const { white, grey, dark, black, glass } = FINISH;
const BAND_M = 0.14;
const BAND_LIFT_M = 0.015;
const CAPSULE_TOP_SHARE = 0.36;
const ENGINE = { mountShare: 0.3, mountRadiusShare: 0.22, throatShare: 0.2, exitShare: 0.45 };
const PARACHUTE = { radiusShare: 0.4, tipShare: 0.12, wallShare: 0.55 };
const POD_LIFT_SHARE = 0.3;

const centresOf = ({ x, copies }) => Array.from({ length: copies }, (_, k) => [x * Math.cos((2 * Math.PI * k) / copies), x * Math.sin((2 * Math.PI * k) / copies)]);

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

const zOf = (y, bottomM) => y - bottomM - FEET_BELOW_ORIGIN_M;

export function modelOfParts(parts, bottomM) {
  const name = `rocket ${bottomM} ${JSON.stringify(parts.map(({ type, x, y, copies }) => [type, x, y, copies]))}`;
  addModel(name, (b) => {
    for (const part of parts) {
      for (const [cx, cy] of centresOf(part)) SHAPES[part.type](b, (lift) => [cx, cy, zOf(part.y, bottomM) + lift], PARTS[part.type]);
    }
  });
  return name;
}

export function nozzlesOf(engines, bottomM) {
  return engines.flatMap((engine) => centresOf(engine).map(([x, y]) => [x, y, zOf(engine.y, bottomM), PARTS.engine.widthM * ENGINE.exitShare * 0.85]));
}

export function podsOf(top, bottomM) {
  const { widthM, heightM } = PARTS[top.type];
  return [widthM / 2 + 0.12, zOf(top.y, bottomM) + heightM * POD_LIFT_SHARE];
}
