const LIQUID_WATER_KELVIN = [215, 300];
const LEAST_MASS_FOR_MAGNETIC_FIELD = 0.6;
const COOLEST_QUIET_STAR_KELVIN = 3000;
const STEADY_GYR = 4.5;
const OLDEST_DISK_STAR_GYR = 10;
const SUN_LIFETIME_GYR = 10;
const LIFETIME_POWER = -2.5;
const BRIGHTENING = 0.4;
const SUN_AGE_SHARE = 0.457;

const FLARES_CALM_GYR = [[2810, 7], [3060, 7], [3210, 4.5], [3430, 2], [3560, 1.2], [3850, 0.8], [5770, 0.3]];

export const suitsLife = ({ kelvin, earthMasses }) => kelvin > LIQUID_WATER_KELVIN[0] && kelvin < LIQUID_WATER_KELVIN[1] && earthMasses >= LEAST_MASS_FOR_MAGNETIC_FIELD;

export const isQuiet = ({ kelvin }) => kelvin >= COOLEST_QUIET_STAR_KELVIN;

function calmAfterGyr(kelvin) {
  const next = FLARES_CALM_GYR.findIndex(([warmer]) => warmer >= kelvin);
  if (next === 0) return FLARES_CALM_GYR[0][1];
  if (next < 0) return FLARES_CALM_GYR.at(-1)[1];
  const [[cooler, slow], [warmer, quick]] = [FLARES_CALM_GYR[next - 1], FLARES_CALM_GYR[next]];
  return slow + ((quick - slow) * (kelvin - cooler)) / (warmer - cooler);
}

const brightnessAt = (lifeShare) => 1 / (1 + BRIGHTENING * (1 - lifeShare / SUN_AGE_SHARE));

export function steadyLongEnough({ mass, kelvin, evolved }, random) {
  const lifetime = SUN_LIFETIME_GYR * mass ** LIFETIME_POWER;
  const age = random.between(0, Math.min(OLDEST_DISK_STAR_GYR, lifetime));
  if (evolved || age < STEADY_GYR + calmAfterGyr(kelvin)) return () => false;
  const warmedBy = (brightnessAt(age / lifetime) / brightnessAt((age - STEADY_GYR) / lifetime)) ** 0.25;
  return (planet) => planet.kelvin / warmedBy > LIQUID_WATER_KELVIN[0];
}
