import { fft2d, splitPackedSpectrum } from './fft.js';
import {
  ARCSEC,
  REFERENCE_NM,
  atmosphericLiftRad,
  chromaticFocusShiftMm,
  friedParameterM,
  kolmogorovScreen,
  psfForWavelength,
} from './optics.js';
import { TARGETS, buildSource, extentArcsec } from './targets.js';

const WAVELENGTHS_NM = [420, 450, 485, 520, 555, 595, 640];
const SHORTEST_NM = WAVELENGTHS_NM[0];
const PSF_GRID = 256;
const MAX_GRID = 512;
const SCREEN_GRID = 256;
const WIND_M_PER_S = [7, 2.5];

function bell(nm, center, width) {
  return Math.exp(-0.5 * ((nm - center) / width) ** 2);
}

const CHANNEL_WEIGHTS = WAVELENGTHS_NM.map((nm) => [
  bell(nm, 600, 42) + 0.12 * bell(nm, 425, 18),
  bell(nm, 545, 38),
  bell(nm, 455, 30),
]);

let sourceCache = { key: '', spectra: null };
let screenCache = { key: '', screen: null };

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 1)));
}

function samplingFor(params) {
  const finestRad = (SHORTEST_NM * 1e-9) / (2.2 * (params.scope.apertureMm / 1000));
  const neededRad = extentArcsec(params.targetId, params.separationArcsec) * 1.3 * ARCSEC;
  const n = Math.min(nextPowerOfTwo(neededRad / finestRad + PSF_GRID), MAX_GRID);
  return { n, pixelRad: Math.max(finestRad, neededRad / (n - PSF_GRID)) };
}

function sourceSpectra(params, n, pixelRad) {
  const key = JSON.stringify([params.targetId, params.separationArcsec, params.ringTiltDeg, params.venusPhase, params.scope.apertureMm, n, pixelRad]);
  if (sourceCache.key === key) return sourceCache.spectra;
  const [r, g, b] = buildSource({ ...params, n, pixelArcsec: pixelRad / ARCSEC, apertureMm: params.scope.apertureMm });
  const packedRe = r;
  const packedIm = g;
  fft2d(packedRe, packedIm, n);
  const rg = splitPackedSpectrum(packedRe, packedIm, n);
  const blueIm = new Float64Array(n * n);
  fft2d(b, blueIm, n);
  const spectra = { red: [rg.aRe, rg.aIm], green: [rg.bRe, rg.bIm], blue: [b, blueIm] };
  sourceCache = { key, spectra };
  return spectra;
}

function seeingScreen(apertureMm) {
  const widthM = Math.max((4 * apertureMm) / 1000, 2);
  const key = String(widthM);
  if (screenCache.key !== key) screenCache = { key, screen: kolmogorovScreen(SCREEN_GRID, widthM, 1234) };
  return screenCache.screen;
}

function seeingAt(params) {
  if (params.seeingArcsec <= 0) return { screen: null, screenScale: 0, windOffsetM: [0, 0] };
  const t = params.timeS;
  const drift = 1 + 0.22 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3);
  const r0 = friedParameterM(params.seeingArcsec) * drift;
  return {
    screen: seeingScreen(params.scope.apertureMm),
    screenScale: r0 ** (-5 / 6),
    windOffsetM: [WIND_M_PER_S[0] * t, WIND_M_PER_S[1] * t],
  };
}

const workspaces = new Map();

function workspaceFor(n) {
  if (!workspaces.has(n)) {
    const grid = () => new Float64Array(n * n);
    workspaces.set(n, { rgRe: grid(), rgIm: grid(), bRe: grid(), bIm: grid(), outRe: grid(), outIm: grid() });
  }
  return workspaces.get(n);
}

const PSF_EDGE_TAPER = (() => {
  const window = new Float64Array(PSF_GRID * PSF_GRID);
  const half = PSF_GRID / 2;
  for (let y = 0; y < PSF_GRID; y++) {
    const dy = y < half ? y : PSF_GRID - y;
    for (let x = 0; x < PSF_GRID; x++) {
      const dx = x < half ? x : PSF_GRID - x;
      const r = Math.hypot(dx, dy) / half;
      window[y * PSF_GRID + x] = r < 0.7 ? 1 : r >= 1 ? 0 : Math.cos(((r - 0.7) / 0.3) * (Math.PI / 2)) ** 2;
    }
  }
  return window;
})();

const channelPsfBuffers = [0, 1, 2].map(() => new Float64Array(PSF_GRID * PSF_GRID));

function channelPsfs(params, pixelRad) {
  const focusMm = (params.focusWaves * 8 * (params.scope.focalLengthMm / params.scope.apertureMm) ** 2 * REFERENCE_NM) / 1e6;
  const seeing = seeingAt(params);
  for (const channel of channelPsfBuffers) channel.fill(0);
  WAVELENGTHS_NM.forEach((nm, w) => {
    const psf = psfForWavelength({
      size: PSF_GRID,
      nm,
      pixelRad,
      scope: params.scope,
      focusShiftMm: focusMm + chromaticFocusShiftMm(nm, params.scope.focalLengthMm, params.scope.correction),
      liftRad: atmosphericLiftRad(nm, params.altitudeDeg),
      ...seeing,
    });
    for (let c = 0; c < 3; c++) {
      const weight = CHANNEL_WEIGHTS[w][c];
      const channel = channelPsfBuffers[c];
      for (let i = 0; i < psf.length; i++) channel[i] += psf[i] * weight;
    }
  });
  for (const channel of channelPsfBuffers) {
    let total = 0;
    for (let i = 0; i < channel.length; i++) {
      channel[i] *= PSF_EDGE_TAPER[i];
      total += channel[i];
    }
    for (let i = 0; i < channel.length; i++) channel[i] /= total;
  }
  return channelPsfBuffers;
}

function embedWrapped(psf, out, n) {
  out.fill(0);
  const half = PSF_GRID / 2;
  for (let y = 0; y < PSF_GRID; y++) {
    const sy = y < half ? y : y - PSF_GRID;
    const ty = (sy + n) % n;
    for (let x = 0; x < PSF_GRID; x++) {
      const sx = x < half ? x : x - PSF_GRID;
      out[ty * n + ((sx + n) % n)] = psf[y * PSF_GRID + x];
    }
  }
}

function convolve(spectra, psfs, n) {
  const { rgRe, rgIm, bRe, bIm, outRe, outIm } = workspaceFor(n);
  embedWrapped(psfs[0], rgRe, n);
  embedWrapped(psfs[1], rgIm, n);
  fft2d(rgRe, rgIm, n);
  embedWrapped(psfs[2], bRe, n);
  bIm.fill(0);
  fft2d(bRe, bIm, n);

  const [srRe, srIm] = spectra.red;
  const [sgRe, sgIm] = spectra.green;
  const [sbRe, sbIm] = spectra.blue;
  for (let y = 0; y < n; y++) {
    const mirrorRow = ((n - y) % n) * n;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const j = mirrorRow + ((n - x) % n);
      const redOtfRe = (rgRe[i] + rgRe[j]) / 2;
      const redOtfIm = (rgIm[i] - rgIm[j]) / 2;
      const greenOtfRe = (rgIm[i] + rgIm[j]) / 2;
      const greenOtfIm = (rgRe[j] - rgRe[i]) / 2;
      const rRe = srRe[i] * redOtfRe - srIm[i] * redOtfIm;
      const rIm = srRe[i] * redOtfIm + srIm[i] * redOtfRe;
      const gRe = sgRe[i] * greenOtfRe - sgIm[i] * greenOtfIm;
      const gIm = sgRe[i] * greenOtfIm + sgIm[i] * greenOtfRe;
      outRe[i] = rRe - gIm;
      outIm[i] = rIm + gRe;
      const blueRe = sbRe[i] * bRe[i] - sbIm[i] * bIm[i];
      bIm[i] = sbRe[i] * bIm[i] + sbIm[i] * bRe[i];
      bRe[i] = blueRe;
    }
  }
  fft2d(outRe, outIm, n, true);
  fft2d(bRe, bIm, n, true);
  return [outRe, outIm, bRe];
}

function strehlRatio(params, pixelRad) {
  const focusMm = (params.focusWaves * 8 * (params.scope.focalLengthMm / params.scope.apertureMm) ** 2 * REFERENCE_NM) / 1e6;
  const common = { size: PSF_GRID, nm: REFERENCE_NM, pixelRad, scope: params.scope, focusShiftMm: focusMm, liftRad: 0 };
  const perfectPeak = psfForWavelength({ ...common, aberrated: false })[0];
  const real = psfForWavelength(common);
  return real.reduce((peak, v) => Math.max(peak, v), 0) / perfectPeak;
}

const SRGB_STEPS = 4096;
const SRGB_TABLE = Float64Array.from({ length: SRGB_STEPS + 1 }, (_, i) => {
  const v = i / SRGB_STEPS;
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
});

function eyeGain(params) {
  if (TARGETS[params.targetId].kind === 'stars') return 1;
  const exitPupilMm = params.scope.apertureMm / (params.scope.focalLengthMm / params.eyepieceMm);
  return (Math.min(exitPupilMm, 7) / 1.5) ** 0.7;
}

function toPixels(channels, n, gain) {
  const pixels = new Uint8ClampedArray(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    for (let c = 0; c < 3; c++) {
      const perceived = 1 - Math.exp(-Math.max(channels[c][i], 0) * gain * 0.8);
      pixels[i * 4 + c] = SRGB_TABLE[Math.round(perceived * SRGB_STEPS)];
    }
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

self.onmessage = ({ data: params }) => {
  try {
    const started = performance.now();
    const { n, pixelRad } = samplingFor(params);
    const spectra = sourceSpectra(params, n, pixelRad);
    const psfs = channelPsfs(params, pixelRad);
    const image = convolve(spectra, psfs, n);
    const pixels = toPixels(image, n, eyeGain(params));
    const strehl = params.wantStrehl ? strehlRatio(params, pixelRad) : null;
    self.postMessage(
      { pixels, n, pixelArcsec: pixelRad / ARCSEC, strehl, renderMs: performance.now() - started, requestId: params.requestId },
      [pixels.buffer],
    );
  } catch (error) {
    self.postMessage({ error: error.message, requestId: params.requestId });
  }
};
