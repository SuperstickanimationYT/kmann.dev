export const add = (a, b) => a.map((value, i) => value + b[i]);
export const subtract = (a, b) => a.map((value, i) => value - b[i]);
export const scale = (a, factor) => a.map((value) => value * factor);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a) => scale(a, 1 / Math.hypot(...a));

export function rotateAbout(vector, axis, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(add(scale(vector, cos), scale(cross(axis, vector), sin)), scale(axis, dot(axis, vector) * (1 - cos)));
}

export function orthonormal(forward, upHint) {
  const f = normalize(forward);
  const right = normalize(cross(f, upHint));
  return { forward: f, right, up: cross(right, f) };
}

export const rotateBasis = (basis, axis, angle) => ({
  forward: rotateAbout(basis.forward, axis, angle),
  right: rotateAbout(basis.right, axis, angle),
  up: rotateAbout(basis.up, axis, angle),
});
