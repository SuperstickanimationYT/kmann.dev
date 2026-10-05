import { lightingOf } from '../galaxy.js';
import { MERGER_RMAX } from './density.js';
import { simSecondsAt } from './timeline.js';

const DEGREES = Math.PI / 180;
const FIELD_SCALE = 2.3;
const ZMAX_PER_TALL_HEIGHT = 6;
const ARM_PATTERN_TURN_PER_SIM_SECOND = 0.6;
const DISK_ORDER = { gone: 0.2, intact: 0.8 };
const TAIL_ORDER = { gone: 0.1, intact: 0.4 };

const share = (value) => value / 100;
const ramp = (value, { gone, intact }) => Math.min(1, Math.max(0, (value - gone) / (intact - gone)));
const coldFromOrder = (order) => ramp(order, DISK_ORDER);

const patternTurnAt = (field) => ARM_PATTERN_TURN_PER_SIM_SECOND * simSecondsAt(field.index);

export function mergerMorphologyOf(settings, field) {
  return {
    uRmax: MERGER_RMAX,
    uSeed: { uint: settings.seed },
    uArms: settings.arms,
    uPitch: settings.pitch * DEGREES,
    uArmContrast: share(settings.armContrast),
    uArmTurn: patternTurnAt(field),
    uYoung: share(settings.young),
    uGas: share(settings.gas),
    uDust: share(settings.dust),
    uSharpDensity: field.sharpDensity,
    uCoreA: field.cores[0],
    uCoreB: field.cores[1],
    uColdA: coldFromOrder(field.order[0]),
    uColdB: coldFromOrder(field.order[1]),
    uTailYouth: ramp(Math.max(...field.order), TAIL_ORDER),
    uSpinA: field.spins[0],
    uSpinB: field.spins[1],
  };
}

export function mergerLightingOf(settings, field) {
  const single = lightingOf(settings);
  const fieldHeight = single.uFieldHeight * FIELD_SCALE;
  return {
    ...single,
    uRmax: MERGER_RMAX,
    uZmax: Math.min(MERGER_RMAX, ZMAX_PER_TALL_HEIGHT * Math.max(field.tallHeight, 1)),
    uThickness: Math.max(0.3, field.typicalHeight),
    uFieldHeight: fieldHeight,
    uCentre: [(settings.offsetX ?? 0) * fieldHeight, (settings.offsetY ?? 0) * fieldHeight],
    uBulgeLight: 2 * single.uBulgeLight,
    uNucleusLight: 2 * single.uNucleusLight,
    uBarLight: 0,
    uBarLength: 0,
    uCoreA: field.cores[0],
    uCoreB: field.cores[1],
    uFrameTurnA: field.spins[0] * patternTurnAt(field),
    uFrameTurnB: field.spins[1] * patternTurnAt(field),
  };
}
