import { fft2d } from './fft.js';
import { gaussian, seededRandom } from './noise.js';

export const ARCSEC = Math.PI / (180 * 3600);
export const REFERENCE_NM = 555;

const BK7 = [[1.03961212, 0.00600069867], [0.231792344, 0.0200179144], [1.01046945, 103.560653]];
const F2 = [[1.34533359, 0.00997743871], [0.209073176, 0.0470450767], [0.937357162, 111.886764]];

function sellmeier(glass, nm) {
  const um2 = (nm / 1000) ** 2;
  let sum = 1;
  for (const [b, c] of glass) sum += (b * um2) / (um2 - c);
  return Math.sqrt(sum);
}

function crownFlintPowerAt(nm) {
  const nC = [sellmeier(BK7, 656.3), sellmeier(F2, 656.3)];
  const nF = [sellmeier(BK7, 486.1), sellmeier(F2, 486.1)];
  const nd = [sellmeier(BK7, 587.6), sellmeier(F2, 587.6)];
  const abbe = [0, 1].map((g) => (nd[g] - 1) / (nF[g] - nC[g]));
  const crownPower = abbe[0] / (abbe[0] - abbe[1]);
  const flintPower = -abbe[1] / (abbe[0] - abbe[1]);
  const shape = [crownPower / (nd[0] - 1), flintPower / (nd[1] - 1)];
  return (sellmeier(BK7, nm) - 1) * shape[0] + (sellmeier(F2, nm) - 1) * shape[1];
}

export const SECONDARY_SPECTRUM = { none: 0, achromat: 1, ed: 0.25, apo: 0.06 };

export function chromaticFocusShiftMm(nm, focalLengthMm, correction) {
  const scale = SECONDARY_SPECTRUM[correction] ?? 0;
  if (scale === 0) return 0;
  const shiftFraction = crownFlintPowerAt(REFERENCE_NM) / crownFlintPowerAt(nm) - 1;
  return shiftFraction * focalLengthMm * scale;
}

function airRefractivity(nm) {
  const sigma2 = (1000 / nm) ** 2;
  return (64.328 + 29498.1 / (146 - sigma2) + 255.4 / (41 - sigma2)) * 1e-6;
}

export function atmosphericLiftRad(nm, altitudeDeg) {
  const zenith = ((90 - Math.max(altitudeDeg, 5)) * Math.PI) / 180;
  return (airRefractivity(nm) - airRefractivity(REFERENCE_NM)) * Math.tan(zenith);
}

export function friedParameterM(seeingArcsec) {
  return (0.98 * 500e-9) / (seeingArcsec * ARCSEC);
}

export function kolmogorovScreen(size, widthM, seed) {
  const random = seededRandom(seed);
  const re = new Float64Array(size * size);
  const im = new Float64Array(size * size);
  const df = 1 / widthM;
  for (let y = 0; y < size; y++) {
    const fy = (y < size / 2 ? y : y - size) * df;
    for (let x = 0; x < size; x++) {
      const fx = (x < size / 2 ? x : x - size) * df;
      const f = Math.hypot(fx, fy);
      if (f === 0) continue;
      const amplitude = Math.sqrt(0.023) * f ** (-11 / 6) * df;
      re[y * size + x] = amplitude * gaussian(random);
      im[y * size + x] = amplitude * gaussian(random);
    }
  }
  fft2d(re, im, size, false);
  const opdNmAtUnitR0 = new Float64Array(size * size);
  const radiansToNm = 500 / (2 * Math.PI);
  for (let i = 0; i < size * size; i++) opdNmAtUnitR0[i] = re[i] * radiansToNm;
  return { size, widthM, opdNmAtUnitR0 };
}

function sampleScreen(screen, xM, yM) {
  const { size, widthM, opdNmAtUnitR0 } = screen;
  const gx = (((xM / widthM) % 1) + 1) % 1 * size;
  const gy = (((yM / widthM) % 1) + 1) % 1 * size;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const x1 = (x0 + 1) % size;
  const y1 = (y0 + 1) % size;
  const top = opdNmAtUnitR0[y0 * size + x0] * (1 - fx) + opdNmAtUnitR0[y0 * size + x1] * fx;
  const bottom = opdNmAtUnitR0[y1 * size + x0] * (1 - fx) + opdNmAtUnitR0[y1 * size + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function spiderTransmission(x, y, vanes, widthM, stepM) {
  let transmission = 1;
  for (let v = 0; v < vanes; v++) {
    const angle = (v * 2 * Math.PI) / vanes + Math.PI / 2;
    const along = x * Math.cos(angle) + y * Math.sin(angle);
    const across = -x * Math.sin(angle) + y * Math.cos(angle);
    if (along <= 0) continue;
    const distance = Math.abs(across);
    const covered = Math.min(distance + stepM / 2, widthM / 2) - Math.max(distance - stepM / 2, -widthM / 2);
    transmission -= Math.min(Math.max(covered, 0), stepM) / stepM;
  }
  return Math.max(transmission, 0);
}

export function staticWavefrontNm(rho, theta, scope) {
  const sphere = Math.sqrt(5) * (6 * rho ** 4 - 6 * rho ** 2 + 1);
  const coma = Math.sqrt(8) * (3 * rho ** 3 - 2 * rho) * Math.cos(theta);
  const astig = Math.sqrt(6) * rho ** 2 * Math.cos(2 * theta);
  return (scope.sphericalWaves * sphere + scope.comaWaves * coma + scope.astigWaves * astig) * REFERENCE_NM;
}

export function defocusPeakNm(focusShiftMm, focalRatio) {
  return (focusShiftMm / (8 * focalRatio * focalRatio)) * 1e6;
}

const scratch = new Map();

function scratchFor(size) {
  if (!scratch.has(size)) scratch.set(size, { re: new Float64Array(size * size), im: new Float64Array(size * size) });
  return scratch.get(size);
}

export function psfForWavelength(options) {
  const { size, nm, pixelRad, scope, focusShiftMm, liftRad, screen, screenScale, windOffsetM, aberrated = true } = options;
  const apertureM = scope.apertureMm / 1000;
  const lambdaM = nm * 1e-9;
  const stepM = lambdaM / (size * pixelRad);
  const radiusM = apertureM / 2;
  const obstruction = scope.obstruction;
  const focalRatio = scope.focalLengthMm / scope.apertureMm;
  const defocusNm = defocusPeakNm(focusShiftMm, focalRatio);
  const liftCyclesPerM = liftRad / lambdaM;
  const { re, im } = scratchFor(size);
  re.fill(0);
  im.fill(0);
  const reach = Math.ceil(radiusM / stepM) + 1;
  for (let py = -reach; py <= reach; py++) {
    const yM = py * stepM;
    for (let px = -reach; px <= reach; px++) {
      const xM = px * stepM;
      const rho = Math.hypot(xM, yM) / radiusM;
      if (rho > 1 || rho < obstruction) continue;
      let opdNm = 0;
      if (aberrated) {
        const theta = Math.atan2(yM, xM);
        opdNm = staticWavefrontNm(rho, theta, scope) + defocusNm * rho * rho;
        if (screen) opdNm += screenScale * sampleScreen(screen, xM + windOffsetM[0], yM + windOffsetM[1]);
      }
      const phase = (2 * Math.PI * opdNm) / nm - 2 * Math.PI * liftCyclesPerM * yM;
      const amplitude = spiderTransmission(xM, yM, scope.vanes, scope.vaneWidthMm / 1000, stepM);
      const index = ((py + size) % size) * size + ((px + size) % size);
      re[index] = amplitude * Math.cos(phase);
      im[index] = amplitude * Math.sin(phase);
    }
  }
  if (reach * 2 >= size) throw new Error('pupil does not fit the grid');
  fft2d(re, im, size, false);
  let total = 0;
  for (let i = 0; i < size * size; i++) {
    re[i] = re[i] * re[i] + im[i] * im[i];
    total += re[i];
  }
  for (let i = 0; i < size * size; i++) re[i] /= total;
  return re;
}
