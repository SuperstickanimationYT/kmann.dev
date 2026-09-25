export function hexToRgb(hex) {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const spread = max - Math.min(r, g, b);
  let hue = 0;
  if (spread) {
    if (max === r) hue = ((g - b) / spread + 6) % 6;
    else if (max === g) hue = (b - r) / spread + 2;
    else hue = (r - g) / spread + 4;
  }
  return { hue: hue / 6, saturation: max ? spread / max : 0, value: max };
}

export function hsvToRgb(hue, saturation, value) {
  const sector = (((hue % 1) + 1) % 1) * 6;
  const whole = Math.floor(sector);
  const part = sector - whole;
  const low = value * (1 - saturation);
  const falling = value * (1 - saturation * part);
  const rising = value * (1 - saturation * (1 - part));
  return [
    [value, rising, low],
    [falling, value, low],
    [low, value, rising],
    [low, falling, value],
    [rising, low, value],
    [value, low, falling],
  ][whole];
}

export function mixHue(from, to, t) {
  const turn = ((((to - from) % 1) + 1.5) % 1) - 0.5;
  return from + turn * t;
}

export function mixInto(out, color, t) {
  out[0] += (color[0] - out[0]) * t;
  out[1] += (color[1] - out[1]) * t;
  out[2] += (color[2] - out[2]) * t;
  return out;
}
