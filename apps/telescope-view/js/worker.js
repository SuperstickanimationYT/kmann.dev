import { candelaPerFlux, luminancePercentile, perceive, photopicLuminance, skyFlux, visionState } from './eye.js';
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
import { TARGETS, adaptationFlux, buildLayerSource, detailExtentArcsec } from './targets.js';

const WAVELENGTHS_NM = [420, 450, 485, 520, 555, 595, 640];
const SHORTEST_NM = WAVELENGTHS_NM[0];
const PSF_GRID = 256;
const MAX_BINNING = 32;
const DETAIL_GRID = 512;
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

const sourceCaches = { wide: { key: '', spectra: null }, detail: { key: '', spectra: null } };
let screenCache = { key: '', screen: null };

function nextPowerOfTwo(value) {
  return 2 ** Math.ceil(Math.log2(Math.max(value, 1)));
}

function finestRad(scope) {
  return (SHORTEST_NM * 1e-9) / (2.2 * (scope.apertureMm / 1000));
}

function magnification(settings) {
  return settings.scope.focalLengthMm / settings.eyepieceMm;
}

function detailSampling(settings) {
  const finest = finestRad(settings.scope);
  const neededRad = detailExtentArcsec(settings) * 1.3 * ARCSEC;
  const n = Math.min(nextPowerOfTwo(neededRad / finest + PSF_GRID), DETAIL_GRID);
  return { n, pixelRad: Math.max(finest, neededRad / (n - PSF_GRID)), binning: 1 };
}

function wideSampling(settings) {
  const finest = finestRad(settings.scope);
  const kind = TARGETS[settings.targetId].kind;
  const n = kind === 'deepsky' || kind === 'moon' ? 1024 : 512;
  const neededRad = ((settings.afovDeg * 3600) / magnification(settings)) * 1.04 * ARCSEC;
  let binning = 1;
  let pixelRad = finest;
  for (let pass = 0; pass < 3; pass++) {
    pixelRad = Math.max(finest, neededRad / (n - PSF_GRID / binning));
    binning = Math.min(Math.max(nextPowerOfTwo(pixelRad / finest), 1), MAX_BINNING);
  }
  return { n, pixelRad, binning };
}

function sourceSpectra(layer, settings, n, pixelRad, pointBoost) {
  const key = JSON.stringify([
    layer, settings.targetId, settings.separationArcsec, settings.ringTiltDeg, settings.venusPhase,
    settings.moonAgeDays, Math.round(settings.epochMs / 60000), n, pixelRad, pointBoost.toPrecision(3),
  ]);
  const cache = sourceCaches[layer];
  if (cache.key === key) return cache.spectra;
  cache.spectra = null;
  const [r, g, b] = buildLayerSource(layer, settings, n, pixelRad / ARCSEC, pointBoost);
  fft2d(r, g, n);
  const rg = splitPackedSpectrum(r, g, n);
  const blueIm = new Float32Array(n * n);
  fft2d(b, blueIm, n);
  cache.spectra = { red: [rg.aRe, rg.aIm], green: [rg.bRe, rg.bIm], blue: [b, blueIm] };
  cache.key = key;
  return cache.spectra;
}

function seeingScreen(apertureMm) {
  const widthM = Math.max((4 * apertureMm) / 1000, 2);
  const key = String(widthM);
  if (screenCache.key !== key) screenCache = { key, screen: kolmogorovScreen(SCREEN_GRID, widthM, 1234) };
  return screenCache.screen;
}

function seeingAt(settings) {
  if (settings.seeingArcsec <= 0) return { screen: null, screenScale: 0, windOffsetM: [0, 0] };
  const t = settings.timeS;
  const drift = 1 + 0.22 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1.3);
  const r0 = friedParameterM(settings.seeingArcsec) * drift;
  return {
    screen: seeingScreen(settings.scope.apertureMm),
    screenScale: r0 ** (-5 / 6),
    windOffsetM: [WIND_M_PER_S[0] * t, WIND_M_PER_S[1] * t],
  };
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

function focusShiftMm(settings) {
  return (settings.focusWaves * 8 * (settings.scope.focalLengthMm / settings.scope.apertureMm) ** 2 * REFERENCE_NM) / 1e6;
}

function channelPsfs(settings, finePixelRad) {
  const seeing = seeingAt(settings);
  const channels = [0, 1, 2].map(() => new Float64Array(PSF_GRID * PSF_GRID));
  WAVELENGTHS_NM.forEach((nm, w) => {
    const psf = psfForWavelength({
      size: PSF_GRID,
      nm,
      pixelRad: finePixelRad,
      scope: settings.scope,
      focusShiftMm: focusShiftMm(settings) + chromaticFocusShiftMm(nm, settings.scope.focalLengthMm, settings.scope.correction),
      liftRad: atmosphericLiftRad(nm, settings.altitudeDeg),
      ...seeing,
    });
    for (let c = 0; c < 3; c++) {
      const weight = CHANNEL_WEIGHTS[w][c];
      const channel = channels[c];
      for (let i = 0; i < psf.length; i++) channel[i] += psf[i] * weight;
    }
  });
  for (const channel of channels) {
    let total = 0;
    for (let i = 0; i < channel.length; i++) {
      channel[i] *= PSF_EDGE_TAPER[i];
      total += channel[i];
    }
    for (let i = 0; i < channel.length; i++) channel[i] /= total;
  }
  return channels;
}

function signed(index, size) {
  return index < size / 2 ? index : index - size;
}

function binPsf(psf, binning) {
  if (binning === 1) return psf;
  const size = PSF_GRID / binning;
  const out = new Float64Array(size * size);
  for (let y = 0; y < PSF_GRID; y++) {
    const cy = (Math.round(signed(y, PSF_GRID) / binning) + size) % size;
    for (let x = 0; x < PSF_GRID; x++) {
      const cx = (Math.round(signed(x, PSF_GRID) / binning) + size) % size;
      out[cy * size + cx] += psf[y * PSF_GRID + x];
    }
  }
  return out;
}

const workspaces = new Map();

function workspaceFor(n) {
  if (!workspaces.has(n)) {
    const grid = () => new Float32Array(n * n);
    workspaces.set(n, { rgRe: grid(), rgIm: grid(), bRe: grid(), bIm: grid(), outRe: grid(), outIm: grid() });
  }
  return workspaces.get(n);
}

function embedWrapped(psf, size, out, n) {
  out.fill(0);
  for (let y = 0; y < size; y++) {
    const ty = (signed(y, size) + n) % n;
    for (let x = 0; x < size; x++) {
      out[ty * n + ((signed(x, size) + n) % n)] = psf[y * size + x];
    }
  }
}

function convolve(spectra, psfs, psfSize, n, poolingSigmaPx) {
  const { rgRe, rgIm, bRe, bIm, outRe, outIm } = workspaceFor(n);
  embedWrapped(psfs[0], psfSize, rgRe, n);
  embedWrapped(psfs[1], psfSize, rgIm, n);
  fft2d(rgRe, rgIm, n);
  embedWrapped(psfs[2], psfSize, bRe, n);
  bIm.fill(0);
  fft2d(bRe, bIm, n);

  const [srRe, srIm] = spectra.red;
  const [sgRe, sgIm] = spectra.green;
  const [sbRe, sbIm] = spectra.blue;
  const poolingFactor = -2 * Math.PI ** 2 * poolingSigmaPx ** 2;
  for (let y = 0; y < n; y++) {
    const mirrorRow = ((n - y) % n) * n;
    const fy = signed(y, n) / n;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const j = mirrorRow + ((n - x) % n);
      const fx = signed(x, n) / n;
      const redOtfRe = (rgRe[i] + rgRe[j]) / 2;
      const redOtfIm = (rgIm[i] - rgIm[j]) / 2;
      const greenOtfRe = (rgIm[i] + rgIm[j]) / 2;
      const greenOtfIm = (rgRe[j] - rgRe[i]) / 2;
      const rRe = srRe[i] * redOtfRe - srIm[i] * redOtfIm;
      const rIm = srRe[i] * redOtfIm + srIm[i] * redOtfRe;
      const gRe = sgRe[i] * greenOtfRe - sgIm[i] * greenOtfIm;
      const gIm = sgRe[i] * greenOtfIm + sgIm[i] * greenOtfRe;
      const blueRe = sbRe[i] * bRe[i] - sbIm[i] * bIm[i];
      const blueIm = sbRe[i] * bIm[i] + sbIm[i] * bRe[i];
      const pooling = Math.exp(poolingFactor * (fx * fx + fy * fy));
      const rodRe = (0.05 * rRe + 0.55 * gRe + 0.4 * blueRe) * pooling;
      const rodIm = (0.05 * rIm + 0.55 * gIm + 0.4 * blueIm) * pooling;
      outRe[i] = rRe - gIm;
      outIm[i] = rIm + gRe;
      bRe[i] = blueRe - rodIm;
      bIm[i] = blueIm + rodRe;
    }
  }
  fft2d(outRe, outIm, n, true);
  fft2d(bRe, bIm, n, true);
  return { channels: [outRe, outIm, bRe], blurredScotopic: bIm };
}

function strehlRatio(settings) {
  const common = { size: PSF_GRID, nm: REFERENCE_NM, pixelRad: finestRad(settings.scope), scope: settings.scope, focusShiftMm: focusShiftMm(settings), liftRad: 0 };
  const perfectPeak = psfForWavelength({ ...common, aberrated: false })[0];
  const real = psfForWavelength(common);
  return real.reduce((peak, v) => Math.max(peak, v), 0) / perfectPeak;
}

function render(settings) {
  const { layer } = settings;
  const { n, pixelRad, binning } = layer === 'wide' ? wideSampling(settings) : detailSampling(settings);
  const pixelArcsec = pixelRad / ARCSEC;
  const candela = candelaPerFlux(settings);
  const sky = skyFlux(settings.sqm);
  const fixedAdaptation = adaptationFlux(settings, photopicLuminance(...sky));
  const provisional = visionState(candela * (fixedAdaptation ?? photopicLuminance(...sky)));
  const eyeBlurArcsec = (provisional.acuityArcmin * 60) / magnification(settings);
  const poolingSigmaPx = eyeBlurArcsec / 2.355 / pixelArcsec;
  const pointBoost = Math.max(1, pixelArcsec ** 2 / (1.133 * eyeBlurArcsec ** 2));

  const spectra = sourceSpectra(layer, settings, n, pixelRad, pointBoost);
  const psfSize = PSF_GRID / binning;
  const psfs = channelPsfs(layer === 'wide' ? { ...settings, timeS: 0 } : settings, pixelRad / binning).map((psf) => binPsf(psf, binning));
  const { channels, blurredScotopic } = convolve(spectra, psfs, psfSize, n, poolingSigmaPx);
  const adaptationCd = fixedAdaptation === null ? luminancePercentile(channels, sky, candela, 0.99) : candela * fixedAdaptation;
  const pixels = perceive({ channels, blurredScotopic, sky, candela, adaptationCd, averted: settings.averted });
  return { layer, targetId: settings.targetId, pixels, n, pixelArcsec, vision: visionState(adaptationCd), adaptationCd };
}

self.onmessage = ({ data: settings }) => {
  try {
    const started = performance.now();
    const result = render(settings);
    const strehl = settings.wantStrehl ? strehlRatio(settings) : null;
    self.postMessage({ ...result, strehl, renderMs: performance.now() - started, requestId: settings.requestId }, [result.pixels.buffer]);
  } catch (error) {
    self.postMessage({ layer: settings.layer, error: error.message, requestId: settings.requestId });
  }
};
