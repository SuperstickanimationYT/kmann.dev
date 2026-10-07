const PLANCK = 6.626e-34;
const LIGHT_SPEED = 2.998e8;
const BOLTZMANN = 1.380649e-23;
const VISIBLE_FROM_NM = 380;
const VISIBLE_TO_NM = 780;
const STEP_NM = 5;

const lobe = (nm, peak, below, above) => Math.exp(-0.5 * ((nm - peak) / (nm < peak ? below : above)) ** 2);

function eyeResponse(nm) {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}

function blackbody(nm, temperatureK) {
  const metres = nm * 1e-9;
  return 1 / (metres ** 5 * Math.expm1((PLANCK * LIGHT_SPEED) / (metres * BOLTZMANN * temperatureK)));
}

const rayleighScattering = (nm) => nm ** -4;

function perceived(spectrum) {
  const xyz = [0, 0, 0];
  for (let nm = VISIBLE_FROM_NM; nm <= VISIBLE_TO_NM; nm += STEP_NM) {
    const power = spectrum(nm);
    eyeResponse(nm).forEach((response, channel) => {
      xyz[channel] += power * response;
    });
  }
  return xyz;
}

function xyzToLinearRgb([x, y, z]) {
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.204 * y + 1.057 * z,
  ];
}

const gammaEncode = (linear) => (linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055);

function brightestAtFull(linearRgb) {
  const positive = linearRgb.map((channel) => Math.max(0, channel));
  const brightest = Math.max(...positive);
  return positive.map((channel) => Math.round(gammaEncode(channel / brightest) * 255));
}

const toHex = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

export function starColor(temperatureK) {
  return toHex(brightestAtFull(xyzToLinearRgb(perceived((nm) => blackbody(nm, temperatureK)))));
}

export function skyColor(temperatureK) {
  return toHex(brightestAtFull(xyzToLinearRgb(perceived((nm) => blackbody(nm, temperatureK) * rayleighScattering(nm)))));
}
