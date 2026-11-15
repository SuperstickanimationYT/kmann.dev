function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEMO_TRUTH = { tilt: 60, angleDegrees: 32 };

const COMPANION = { x: 0.78, y: 0.78, scale: 13, ratio: 0.7, angle: 0.6, brightness: 1.3 };
const SPIKE_ANGLES = [0.2, 0.2 + Math.PI / 2];
const SPIKY_BRIGHTNESS = 2;

function companionLight(x, y, width, height) {
  const dx = x - COMPANION.x * width;
  const dy = y - COMPANION.y * height;
  const along = dx * Math.cos(COMPANION.angle) + dy * Math.sin(COMPANION.angle);
  const across = (-dx * Math.sin(COMPANION.angle) + dy * Math.cos(COMPANION.angle)) / COMPANION.ratio;
  return COMPANION.brightness * Math.exp(-Math.hypot(along, across) / COMPANION.scale);
}

function galaxyLight(gx, gy, gz) {
  const r = Math.hypot(gx, gy);
  const phi = Math.atan2(gy, gx);
  const pitch = Math.tan((16 * Math.PI) / 180);
  const wind = 2 * (phi - Math.log(Math.max(r, 0.02)) / pitch);
  const arms = 0.5 + 0.5 * Math.cos(wind);
  const disk = Math.exp(-r / 0.28) * Math.exp(-Math.abs(gz) / 0.025);
  const bulge = Math.exp(-Math.hypot(gx, gy, gz) / 0.05);
  const armLight = disk * (0.25 + 1.6 * arms ** 3);
  return {
    r: 1.4 * bulge + 0.8 * armLight,
    g: 1.15 * bulge + 0.85 * armLight,
    b: 0.7 * bulge + 1.15 * armLight,
  };
}

export function demoGalaxy(width = 1200, height = 900) {
  const rand = random(6744);
  const tilt = (DEMO_TRUTH.tilt * Math.PI) / 180;
  const angle = (DEMO_TRUTH.angleDegrees * Math.PI) / 180;
  const scale = Math.min(width, height) * 0.42;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const tone = (v) => 1 - Math.exp(-v * 1.6);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - width / 2) / scale;
      const dy = (y - height / 2) / scale;
      const along = dx * Math.cos(angle) + dy * Math.sin(angle);
      const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
      let r = 0;
      let g = 0;
      let b = 0;
      for (const gz of [-0.04, 0, 0.04]) {
        const light = galaxyLight(along, across / Math.cos(tilt) + gz * Math.tan(tilt), gz);
        r += light.r / 3;
        g += light.g / 3;
        b += light.b / 3;
      }
      const companion = companionLight(x, y, width, height);
      r += companion;
      g += companion * 0.9;
      b += companion * 0.75;
      const noise = (rand() - 0.5) * 0.03;
      const o = (y * width + x) * 4;
      pixels[o] = 255 * tone(r + 0.02 + noise);
      pixels[o + 1] = 255 * tone(g + 0.025 + noise);
      pixels[o + 2] = 255 * tone(b + 0.035 + noise);
      pixels[o + 3] = 255;
    }
  }
  const image = new ImageData(pixels, width, height);
  for (let n = 0; n < 260; n += 1) addStar(image, rand() * width, rand() * height, 0.15 + rand() ** 4 * 2.5, 0.7 + rand() ** 2 * 4, rand());
  return image;
}

function starGlow(dx, dy, brightness, sigma) {
  const core = brightness * Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
  if (brightness < SPIKY_BRIGHTNESS) return core;
  const length = 25 * brightness;
  let spikes = 0;
  for (const angle of SPIKE_ANGLES) {
    const along = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
    const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
    spikes += 0.25 * brightness * Math.exp(-along / length) * Math.exp(-(across * across) / 0.9);
  }
  return core + spikes;
}

function addStar(image, sx, sy, brightness, sigma, hue) {
  const { width, height, data } = image;
  const reach = brightness < SPIKY_BRIGHTNESS ? Math.ceil(sigma * 4) : Math.ceil(100 * brightness);
  const tint = [1, 0.9 + hue * 0.1, 0.75 + hue * 0.3];
  for (let y = Math.max(0, Math.floor(sy - reach)); y < Math.min(height, sy + reach); y += 1) {
    for (let x = Math.max(0, Math.floor(sx - reach)); x < Math.min(width, sx + reach); x += 1) {
      const glow = starGlow(x - sx, y - sy, brightness, sigma);
      if (glow < 0.002) continue;
      const o = (y * width + x) * 4;
      for (let k = 0; k < 3; k += 1) {
        const base = data[o + k] / 255;
        data[o + k] = 255 * (1 - (1 - base) * (1 - Math.min(1, glow * tint[k])));
      }
    }
  }
}
