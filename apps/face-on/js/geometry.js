import { median, smooth } from './filters.js';
import { luminance } from './stars.js';

const FIT_SIZE = 512;
const MAX_TILT = 80;

export function tiltFromRatio(ratio, thickness) {
  const q2 = Math.min(1, ratio) ** 2;
  const t2 = thickness ** 2;
  const cos2 = Math.max(0, (q2 - t2) / (1 - t2));
  return Math.min(MAX_TILT, (Math.acos(Math.sqrt(cos2)) * 180) / Math.PI);
}

export function ratioFromTilt(tilt, thickness) {
  const cos = Math.cos((tilt * Math.PI) / 180);
  return Math.sqrt(cos * cos * (1 - thickness ** 2) + thickness ** 2);
}

function shrink(light, width, height) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / FIT_SIZE));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      for (let dy = 0; dy < step; dy += 1) {
        const row = (y * step + dy) * width + x * step;
        for (let dx = 0; dx < step; dx += 1) sum += light[row + dx];
      }
      out[y * w + x] = sum / (step * step);
    }
  }
  return { light: out, width: w, height: h, step };
}

function borderLevel(light, width, height) {
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const values = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      if (x < band || y < band || x >= width - band || y >= height - band) values.push(light[y * width + x]);
    }
  }
  return median(values);
}

function brightestNearMiddle(light, width, height) {
  let best = -Infinity;
  let at = 0;
  for (let y = Math.floor(height * 0.2); y < height * 0.8; y += 1) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x += 1) {
      const i = y * width + x;
      if (light[i] > best) {
        best = light[i];
        at = i;
      }
    }
  }
  return { at, peak: best };
}

function floodAbove(light, width, height, start, level) {
  const inside = new Uint8Array(light.length);
  const stack = new Int32Array(light.length);
  let top = 0;
  stack[top++] = start;
  inside[start] = 1;
  let touchesEdge = false;
  while (top) {
    const i = stack[--top];
    const x = i % width;
    const y = (i - x) / width;
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
    const neighbours = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const j of neighbours) {
      if (j >= 0 && !inside[j] && light[j] > level) {
        inside[j] = 1;
        stack[top++] = j;
      }
    }
  }
  return { inside, touchesEdge };
}

function ellipseFromRegion(inside, width) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < inside.length; i += 1) {
    if (!inside[i]) continue;
    n += 1;
    sx += i % width;
    sy += Math.floor(i / width);
  }
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let i = 0; i < inside.length; i += 1) {
    if (!inside[i]) continue;
    const dx = (i % width) - cx;
    const dy = Math.floor(i / width) - cy;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= n;
  yy /= n;
  xy /= n;
  const mean = (xx + yy) / 2;
  const split = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  const major = mean + split;
  const minor = Math.max(1e-6, mean - split);
  return {
    cx: cx + 0.5,
    cy: cy + 0.5,
    a: 2 * Math.sqrt(major),
    ratio: Math.sqrt(minor / major),
    angle: 0.5 * Math.atan2(2 * xy, xx - yy),
    area: n,
  };
}

export function fitOutline(image, reach) {
  const small = shrink(luminance(image), image.width, image.height);
  const { width, height, step } = small;
  const light = smooth(small.light, width, height, Math.max(1, Math.round(Math.max(width, height) / 200)));
  const floor = borderLevel(light, width, height);
  const { at, peak } = brightestNearMiddle(light, width, height);
  const level = floor + (peak - floor) * reach;
  const { inside, touchesEdge } = floodAbove(light, width, height, at, level);
  const fit = ellipseFromRegion(inside, width);
  return {
    outline: { cx: fit.cx * step, cy: fit.cy * step, a: fit.a * step, ratio: fit.ratio, angle: fit.angle },
    touchesEdge,
    tooSmall: fit.area < 30,
  };
}

function logLight(image) {
  const small = shrink(luminance(image), image.width, image.height);
  const { width, height } = small;
  const light = smooth(small.light, width, height, 1);
  const floor = borderLevel(light, width, height);
  const { peak } = brightestNearMiddle(light, width, height);
  const soft = Math.max(1e-4, (peak - floor) * 0.003);
  const out = new Float32Array(light.length);
  for (let i = 0; i < light.length; i += 1) out[i] = Math.log(Math.max(0, light[i] - floor) + soft);
  return { ...small, light: out };
}

const RINGS = 32;
const INNER = 0.2;
const OUTER = 1.6;
const SPOKES = 48;

function residualTwoFold(field, cx, cy, a, angle, cosTilt) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const { width, height } = field;
  let re = 0;
  let im = 0;
  let used = 0;
  let possible = 0;
  for (let k = 0; k < RINGS; k += 1) {
    const t = (k + 0.5) / RINGS;
    const weight = Math.sin(Math.PI * t) ** 2;
    const r = a * (INNER + (OUTER - INNER) * t);
    possible += weight;
    let ringRe = 0;
    let ringIm = 0;
    let complete = true;
    for (let s = 0; s < SPOKES && complete; s += 1) {
      const phi = (2 * Math.PI * s) / SPOKES;
      const along = r * Math.cos(phi);
      const across = r * Math.sin(phi) * cosTilt;
      const x = cx + along * ux - across * uy;
      const y = cy + along * uy + across * ux;
      complete = x >= 0 && y >= 0 && x <= width - 1 && y <= height - 1;
      const value = bilinear(field.light, width, height, x, y);
      ringRe += value * Math.cos(2 * phi);
      ringIm += value * Math.sin(2 * phi);
    }
    if (!complete) continue;
    used += weight;
    re += weight * ringRe;
    im += weight * ringIm;
  }
  if (used < possible * 0.4) return Infinity;
  return (re * re + im * im) / (used * used);
}

function bestTwoFold(field, cx, cy, a, angles, tilts) {
  let best = { cost: Infinity };
  for (const angle of angles) {
    for (const tilt of tilts) {
      const cost = residualTwoFold(field, cx, cy, a, angle, Math.cos((tilt * Math.PI) / 180));
      if (cost < best.cost) best = { cost, angle, tilt };
    }
  }
  return best;
}

function steps(from, to, step) {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(v);
  return out;
}

export function refineOutline(image, outline, thickness) {
  const field = logLight(image);
  const { step } = field;
  const cx = outline.cx / step - 0.5;
  const cy = outline.cy / step - 0.5;
  let a = outline.a / step;
  let coarse = { cost: Infinity };
  for (const shrinkBy of [1, 0.75, 0.55, 0.4]) {
    a = (outline.a / step) * shrinkBy;
    coarse = bestTwoFold(field, cx, cy, a, steps(0, Math.PI - 1e-6, Math.PI / 60), steps(0, MAX_TILT - 2, 3));
    if (coarse.cost < Infinity) break;
  }
  if (coarse.cost === Infinity) return outline;
  const degree = Math.PI / 180;
  const fine = bestTwoFold(
    field, cx, cy, a,
    steps(coarse.angle - 3 * degree, coarse.angle + 3 * degree, 0.5 * degree),
    steps(Math.max(0, coarse.tilt - 3), Math.min(MAX_TILT, coarse.tilt + 3), 0.5),
  );
  return { ...outline, angle: fine.angle, ratio: ratioFromTilt(fine.tilt, thickness) };
}

function bilinear(channel, width, height, x, y) {
  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = channel[y0 * width + x0] * (1 - fx) + channel[y0 * width + x1] * fx;
  const bottom = channel[y1 * width + x0] * (1 - fx) + channel[y1 * width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function faceOnSpan(outline, field) {
  return 2 * outline.a * field;
}

export function renderFaceOn(layers, outline, view, size) {
  const { starless, stars } = layers;
  const { width, height } = starless;
  const { cx, cy, a, angle } = outline;
  const cosTilt = Math.cos((view.tilt * Math.PI) / 180);
  const span = faceOnSpan(outline, view.field);
  const scale = span / size;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const spin = (view.spin * Math.PI) / 180;
  const spinCos = Math.cos(spin);
  const spinSin = Math.sin(spin);
  const flip = view.mirror ? -1 : 1;
  const bulge = view.bulge;
  const starGain = view.stars;
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let oy = 0; oy < size; oy += 1) {
    for (let ox = 0; ox < size; ox += 1) {
      const px = (ox + 0.5 - size / 2) * scale;
      const py = (oy + 0.5 - size / 2) * scale;
      const dx = px * spinCos + py * spinSin;
      const dy = -px * spinSin + py * spinCos;
      const along = dx * ux + dy * uy;
      const across = flip * (-dx * uy + dy * ux);
      const radius = Math.hypot(along, across) / a;
      const squash = bulge > 0 ? cosTilt + (1 - cosTilt) * (1 - smoothstep(0, 2 * bulge, radius)) : cosTilt;
      const sqAcross = across * squash;
      const sx = cx + along * ux - sqAcross * uy;
      const sy = cy + along * uy + sqAcross * ux;
      const starX = cx + along * ux - across * uy;
      const starY = cy + along * uy + across * ux;
      const o = (oy * size + ox) * 4;
      let k = 0;
      for (const key of ['r', 'g', 'b']) {
        const base = bilinear(starless[key], width, height, sx - 0.5, sy - 0.5);
        const star = starGain > 0 ? starGain * bilinear(stars[key], width, height, starX - 0.5, starY - 0.5) : 0;
        pixels[o + k] = 255 * (1 - (1 - base) * (1 - Math.min(1, star)));
        k += 1;
      }
      pixels[o + 3] = 255;
    }
  }
  return new ImageData(pixels, size, size);
}
