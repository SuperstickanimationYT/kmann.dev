const plans = new Map();

function planFor(n) {
  let plan = plans.get(n);
  if (plan) return plan;
  const bits = Math.log2(n);
  const reversed = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reversed[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  plan = { reversed, cos, sin };
  plans.set(n, plan);
  return plan;
}

function transform1d(re, im, offset, stride, n, inverse, plan, bufRe, bufIm) {
  const { reversed, cos, sin } = plan;
  for (let i = 0; i < n; i++) {
    const src = offset + reversed[i] * stride;
    bufRe[i] = re[src];
    bufIm[i] = im[src];
  }
  const sign = inverse ? 1 : -1;
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sign * sin[k * step];
        const a = start + k;
        const b = a + half;
        const tr = bufRe[b] * wr - bufIm[b] * wi;
        const ti = bufRe[b] * wi + bufIm[b] * wr;
        bufRe[b] = bufRe[a] - tr;
        bufIm[b] = bufIm[a] - ti;
        bufRe[a] += tr;
        bufIm[a] += ti;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    const dst = offset + i * stride;
    re[dst] = bufRe[i];
    im[dst] = bufIm[i];
  }
}

export function fft2d(re, im, n, inverse = false) {
  const plan = planFor(n);
  const bufRe = new Float64Array(n);
  const bufIm = new Float64Array(n);
  for (let row = 0; row < n; row++) transform1d(re, im, row * n, 1, n, inverse, plan, bufRe, bufIm);
  for (let col = 0; col < n; col++) transform1d(re, im, col, n, n, inverse, plan, bufRe, bufIm);
  if (inverse) {
    const scale = 1 / (n * n);
    for (let i = 0; i < n * n; i++) {
      re[i] *= scale;
      im[i] *= scale;
    }
  }
}

export function splitPackedSpectrum(re, im, n) {
  const aRe = new Float32Array(n * n);
  const aIm = new Float32Array(n * n);
  const bRe = new Float32Array(n * n);
  const bIm = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    const my = (n - y) % n;
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const j = my * n + ((n - x) % n);
      aRe[i] = (re[i] + re[j]) / 2;
      aIm[i] = (im[i] - im[j]) / 2;
      bRe[i] = (im[i] + im[j]) / 2;
      bIm[i] = (re[j] - re[i]) / 2;
    }
  }
  return { aRe, aIm, bRe, bIm };
}
