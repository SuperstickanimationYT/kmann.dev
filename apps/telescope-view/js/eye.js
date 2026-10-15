import { smoothstep } from './noise.js';

const CANDELA_PER_SURFACE_FLUX = 10.8e4;
const NEURAL_NOISE_CD = 6e-4;
const AVERTED_ROD_GAIN = 2.5;
const RESPONSE_EXPONENT = 1.25;
const SCOTOPIC_TINT = [0.82, 0.93, 1.12];
const ACUITY_TABLE = [
  [-5, 25],
  [-4, 14],
  [-3, 7],
  [-2, 3.5],
  [-1, 2],
  [0, 1.3],
  [1, 1],
];

export function photopicness(luminanceCd) {
  return smoothstep(-2.5, 0.5, Math.log10(Math.max(luminanceCd, 1e-12)));
}

export function acuityArcmin(adaptationCd) {
  const x = Math.log10(Math.max(adaptationCd, 1e-12));
  if (x <= ACUITY_TABLE[0][0]) return ACUITY_TABLE[0][1];
  for (let i = 1; i < ACUITY_TABLE.length; i++) {
    const [x1, a1] = ACUITY_TABLE[i];
    const [x0, a0] = ACUITY_TABLE[i - 1];
    if (x <= x1) return 10 ** (Math.log10(a0) + ((x - x0) / (x1 - x0)) * (Math.log10(a1) - Math.log10(a0)));
  }
  return 1;
}

export function candelaPerFlux({ scope, eyepieceMm, eyePupilMm }) {
  const exitPupilMm = scope.apertureMm / (scope.focalLengthMm / eyepieceMm);
  const mirrors = scope.correction === 'none' ? 0.8 : 0.92;
  const transmission = mirrors * (1 - scope.obstruction ** 2);
  return CANDELA_PER_SURFACE_FLUX * transmission * (Math.min(exitPupilMm, eyePupilMm) / eyePupilMm) ** 2;
}

export function skyFlux(sqm) {
  const polluted = smoothstep(21.3, 18, sqm);
  const color = [0.92 + 0.2 * polluted, 0.97 + 0.01 * polluted, 1.08 - 0.3 * polluted];
  const luminance = photopicLuminance(color[0], color[1], color[2]);
  return color.map((v) => (v / luminance) * 10 ** (-0.4 * sqm));
}

export function photopicLuminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function scotopicLuminance(r, g, b) {
  return 0.05 * r + 0.55 * g + 0.4 * b;
}

export function luminancePercentile(channels, sky, candela, fraction) {
  const bins = new Uint32Array(400);
  const [r, g, b] = channels;
  for (let i = 0; i < r.length; i++) {
    const l = candela * photopicLuminance(r[i] + sky[0], g[i] + sky[1], b[i] + sky[2]);
    bins[Math.min(Math.max(Math.round((Math.log10(Math.max(l, 1e-12)) + 8) * 30), 0), 399)]++;
  }
  let remaining = r.length * (1 - fraction);
  for (let bin = 399; bin >= 0; bin--) {
    remaining -= bins[bin];
    if (remaining <= 0) return 10 ** (bin / 30 - 8);
  }
  return 1e-8;
}

const SRGB_STEPS = 4096;
const SRGB_TABLE = Float64Array.from({ length: SRGB_STEPS + 1 }, (_, i) => {
  const v = i / SRGB_STEPS;
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
});

function encode(linear) {
  return SRGB_TABLE[Math.round(Math.min(Math.max(linear, 0), 1) * SRGB_STEPS)];
}

export function visionState(adaptationCd) {
  const day = photopicness(adaptationCd);
  return {
    acuityArcmin: acuityArcmin(adaptationCd),
    noiseAmplitude: 0.03 * (1 - day),
    label: day > 0.8 ? 'Colour (cones)' : day > 0.2 ? 'Mixed (fading colour)' : 'Night (rods, no colour)',
  };
}

export function perceive({ channels, blurredScotopic, sky, candela, adaptationCd, averted }) {
  const [r, g, b] = channels;
  const pixels = new Uint8ClampedArray(r.length * 4);
  const rodGain = averted ? AVERTED_ROD_GAIN : 1;
  const semiSaturation = 1.2 * adaptationCd + NEURAL_NOISE_CD;
  const adaptedDay = photopicness(adaptationCd);
  const skyScotopic = candela * scotopicLuminance(sky[0], sky[1], sky[2]) * rodGain;
  const skyResponse = skyScotopic / semiSaturation;
  for (let i = 0; i < r.length; i++) {
    const lr = candela * (r[i] + sky[0]);
    const lg = candela * (g[i] + sky[1]);
    const lb = candela * (b[i] + sky[2]);
    const photopic = photopicLuminance(lr, lg, lb);
    const day = photopicness(photopic);
    const seen = scotopicLuminance(lr, lg, lb) * rodGain * (1 - day) + photopic * day;
    const pooled = (candela * (blurredScotopic[i] + scotopicLuminance(sky[0], sky[1], sky[2])) * rodGain) / semiSaturation;
    const detected = Math.max(day, smoothstep(0.03, 0.09, pooled - skyResponse));
    const x = ((seen / semiSaturation) * detected + skyResponse * (1 - detected)) ** RESPONSE_EXPONENT;
    const ceiling = 0.28 + 0.72 * Math.max(adaptedDay, day);
    const linear = (ceiling * x) / (1 + x);
    const chroma = photopic > 0 ? [lr / photopic, lg / photopic, lb / photopic] : [1, 1, 1];
    for (let c = 0; c < 3; c++) {
      pixels[i * 4 + c] = encode(linear * (SCOTOPIC_TINT[c] * (1 - day) + chroma[c] * day));
    }
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
