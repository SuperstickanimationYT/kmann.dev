const RADIANS_PER_STEP = 0.03;
const MOST_STEPS = 700;
const WEAK_IMPACT = 3000;
const LEAST_EXCESS = 1e-5;
const CRITICAL_IMPACT = 3 * Math.sqrt(3);
const PHOTON_SPHERE = 3;
const HORIZON = 2;
const STEEPEST_REFINED = 0.5;
const REFINING_PASSES = 3;

export const DEFLECTION_SAMPLES = 192;
export const IMAGE_SAMPLES = 512;

function endAzimuth(startInverse, startSlope) {
  const bend = (u) => 3 * u * u - u;
  const h = RADIANS_PER_STEP;
  let u = startInverse;
  let slope = startSlope;
  for (let step = 0; step < MOST_STEPS; step++) {
    const a1 = bend(u);
    const a2 = bend(u + 0.5 * h * slope);
    const a3 = bend(u + 0.5 * h * (slope + 0.5 * h * a1));
    const a4 = bend(u + h * (slope + 0.5 * h * a2));
    const next = u + h * (slope + (h / 6) * (a1 + a2 + a3));
    slope += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    if (next <= 0) return (step + u / (u - next)) * h;
    if (next > 1 / HORIZON) return Infinity;
    u = next;
  }
  return Infinity;
}

export function shadowAngle(radius) {
  const angle = Math.asin(Math.min(1, (CRITICAL_IMPACT * Math.sqrt(1 - HORIZON / radius)) / radius));
  return radius >= PHOTON_SPHERE ? angle : Math.PI - angle;
}

function deflection(radius, angle) {
  const impact = (radius * Math.sin(angle)) / Math.sqrt(1 - HORIZON / radius);
  if (impact > WEAK_IMPACT) return (2 * (1 + Math.cos(angle))) / impact;
  const u = 1 / radius;
  const slope = Math.sqrt(Math.max(0, 1 / impact ** 2 - u * u + 2 * u ** 3));
  return angle - Math.PI + endAzimuth(u, angle < Math.PI / 2 ? slope : -slope);
}

export function bendingAt(radius) {
  const shadow = shadowAngle(radius);
  const leastLog = Math.log(LEAST_EXCESS * shadow);
  const logSpan = Math.log(0.9999 * (Math.PI - shadow)) - leastLog;
  const angles = Array.from({ length: DEFLECTION_SAMPLES }, (_, k) => shadow + Math.exp(leastLog + (logSpan * k) / (DEFLECTION_SAMPLES - 1)));
  const deflections = Float32Array.from(angles, (angle) => deflection(radius, angle));
  for (let k = DEFLECTION_SAMPLES - 2; k >= 0; k--) if (!Number.isFinite(deflections[k])) deflections[k] = 2 * Math.PI + deflections[k + 1];
  return { radius, shadow, leastLog, logSpan, angles, deflections };
}

function angleSeenAt({ angles, deflections, shadow }, skyAngle) {
  const skyAngleOf = (k) => angles[k] - deflections[k];
  let low = 0;
  let high = angles.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (skyAngleOf(middle) <= skyAngle) low = middle;
    else high = middle;
  }
  const [from, to] = [skyAngleOf(low), skyAngleOf(high)];
  const share = Math.min(1, Math.max(0, (skyAngle - from) / (to - from)));
  const [near, far] = [low, high].map((k) => Math.log(angles[k] - shadow));
  const steepness = (deflections[high] - deflections[low]) / (angles[high] - angles[low]);
  let seen = shadow + Math.exp(near + share * (far - near));
  if (Math.abs(steepness) > STEEPEST_REFINED) return { seen, slope: (angles[high] - angles[low]) / (to - from) };
  for (let pass = 0; pass < REFINING_PASSES; pass++) {
    const along = (Math.log(seen - shadow) - near) / (far - near);
    seen = skyAngle + deflections[low] + along * (deflections[high] - deflections[low]);
  }
  return { seen, slope: 1 / (1 - steepness) };
}

const skyAngleOfSample = (k) => Math.PI * ((k + 0.5) / IMAGE_SAMPLES) ** 3;

export function starImages(bending) {
  const images = new Float32Array(2 * 2 * IMAGE_SAMPLES);
  for (const second of [0, 1]) {
    for (let k = 0; k < IMAGE_SAMPLES; k++) {
      const skyAngle = skyAngleOfSample(k);
      const { seen, slope } = angleSeenAt(bending, second ? -skyAngle : skyAngle);
      const at = 2 * (second * IMAGE_SAMPLES + k);
      images[at] = seen;
      images[at + 1] = Math.abs((Math.sin(seen) * slope) / Math.sin(skyAngle));
    }
  }
  return images;
}
