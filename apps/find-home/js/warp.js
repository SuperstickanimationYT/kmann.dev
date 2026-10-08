const CMB_KELVIN = 2.725;
const V_MICRONS = 0.551;
const NANOMAGGY_TO_CANDELA = 1.08e-4;
const SECOND_RADIATION_MICRON_KELVIN = 14387.77;
const PLANCK_NANOMAGGY_PREFACTOR = 2.5718e14;

export const WARP_TIMING = {
  spin: 3.5,
  shutter: 0.5,
  cruise: 0.8,
};
const SLOWEST_SHOWN = 0.01;
const SHUTTER_SPEED = 1500;
const FASTEST_TABLED = 3000;
const SPIN_EASE = 1.7;
const ADAPT_ATTACK = 0.15;
const ADAPT_RECOVERY = 5;
const DARK_WHITE_LOG = -0.5;
const ADAPTED_HEADROOM_LOG = 1;
const ADAPTING_SHARE = 0.2;

export function planckNanomaggies(microns, kelvin) {
  const x = SECOND_RADIATION_MICRON_KELVIN / (microns * kelvin);
  if (x > 80) return 0;
  return PLANCK_NANOMAGGY_PREFACTOR / (microns ** 3 * Math.expm1(x));
}

export async function loadWarpOptics(url) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const [speedCount, angleCount] = new Int32Array(bytes, 0, 2);
  const floats = new Float32Array(bytes, 8);
  const speeds = floats.slice(0, speedCount);
  const angles = floats.slice(speedCount, speedCount + angleCount);
  const table = floats.slice(speedCount + angleCount);
  const glare = Float32Array.from(speeds, (_, row) => {
    let lux = 0;
    for (let i = 1; i < angleCount; i++) {
      const shift = 10 ** table[(row * angleCount + i) * 2 + 1];
      const candela = NANOMAGGY_TO_CANDELA * planckNanomaggies(V_MICRONS, CMB_KELVIN * shift);
      lux += candela * 2 * Math.PI * Math.sin(angles[i]) * (angles[i] - angles[i - 1]);
    }
    return lux;
  });
  return { speeds, angles, table, glare, speedCount, angleCount, smallestAngle: angles[1] };
}

export function rowForSpeed(optics, speed) {
  const { speeds, speedCount } = optics;
  if (speed <= speeds[1]) return speed <= 0 ? 0 : speed / speeds[1];
  const step = Math.log(speeds[speedCount - 1] / speeds[1]) / (speedCount - 2);
  return Math.min(speedCount - 1, 1 + Math.log(speed / speeds[1]) / step);
}

export function glareForRow(optics, row) {
  const low = Math.floor(row);
  const high = Math.min(low + 1, optics.speedCount - 1);
  const share = row - low;
  return Math.exp(Math.log(optics.glare[low] + 1e-30) * (1 - share) + Math.log(optics.glare[high] + 1e-30) * share);
}

const spinSpeed = (share) => SLOWEST_SHOWN * (SHUTTER_SPEED / SLOWEST_SHOWN) ** (1 - (1 - Math.min(1, Math.max(0, share))) ** SPIN_EASE);

export const WARP_SECONDS = 2 * (WARP_TIMING.spin + WARP_TIMING.shutter) + WARP_TIMING.cruise;

export function warpStage(seconds) {
  const { spin, shutter, cruise } = WARP_TIMING;
  const closing = spin + shutter;
  const opening = closing + cruise;
  if (seconds < spin) return { speed: spinSpeed(seconds / spin), shutter: 0, arrived: false };
  if (seconds < closing) return { speed: Math.min(FASTEST_TABLED, SHUTTER_SPEED * 2 ** ((seconds - spin) / shutter)), shutter: (seconds - spin) / shutter, arrived: false };
  if (seconds < opening) return { speed: FASTEST_TABLED, shutter: 1, arrived: seconds >= closing };
  const reopened = seconds - opening;
  if (reopened < shutter) return { speed: Math.min(FASTEST_TABLED, SHUTTER_SPEED * 2 ** (1 - reopened / shutter)), shutter: 1 - reopened / shutter, arrived: true };
  return { speed: spinSpeed(1 - (reopened - shutter) / spin), shutter: 0, arrived: true };
}

export function adaptEyes(current, glareLux, seconds) {
  const adaptingLuminance = (glareLux / Math.PI) * ADAPTING_SHARE;
  const target = Math.max(0, Math.log10(Math.max(adaptingLuminance, 1e-9)) + ADAPTED_HEADROOM_LOG - DARK_WHITE_LOG);
  const rate = target > current ? ADAPT_ATTACK : ADAPT_RECOVERY;
  return target + (current - target) * Math.exp(-seconds / rate);
}
