export const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const scale = (a, k) => a.map(v => v * k);
export const range = n => [...Array(n).keys()];
export const lerpPoint = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
export const normalize = v => scale(v, 1 / Math.hypot(...v));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
