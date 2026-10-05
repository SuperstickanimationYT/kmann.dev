export const DEGREES = Math.PI / 180;
export const LY_PER_PC = 3.26156;
export const PC_PER_YEAR_PER_KM_S = 1.02271e-6;

export const SUN_RADIUS = 8150;
export const SUN_HEIGHT = 5.5;
export const SUN_POSITION = [0, SUN_RADIUS, SUN_HEIGHT];
export const SUN_PECULIAR = [11.1, 12.24, 7.25];

const FLAT_SPEED = 236;
const RISE_SCALE = 900;
export const BAR_ANGLE = 28 * DEGREES;
const BAR_PATTERN_SPEED = 39;

export const MAP_HALF_WIDTH = 26000;
export const MAP_SIZE = 1024;
export const GALAXY_RADIUS = 28000;
export const GALAXY_HALF_HEIGHT = 6000;

export const DISK = {
  midplane: 1,
  scaleLength: 2600,
  scaleHeight: 300,
  thick: 0.078,
  thickScaleLength: 2000,
  thickScaleHeight: 900,
  youngPerArm: 2,
  youngScaleHeight: 60,
  bulge: 78,
  bulgeScales: [700, 290, 250],
  longBar: 5.5,
  longBarScales: [4300, 500, 180],
  dustPerPc: 0.0011,
  dustScaleLength: 3500,
  dustScaleHeight: 95,
};

export const fromGalactic = (l, b, distance) => {
  const along = distance * Math.cos(b * DEGREES);
  return [along * Math.sin(l * DEGREES), SUN_RADIUS - along * Math.cos(l * DEGREES), SUN_HEIGHT + distance * Math.sin(b * DEGREES)];
};

export const fromHeliocentric = ([towardCentre, towardRotation, north]) => [towardRotation, SUN_RADIUS - towardCentre, SUN_HEIGHT + north];

export const velocityFromHeliocentric = ([towardCentre, towardRotation, north]) => [towardRotation, -towardCentre, north];

export const circularSpeed = (radius) => FLAT_SPEED * (1 - Math.exp(-radius / RISE_SCALE));

export const angularSpeed = (radius) => (circularSpeed(radius) * PC_PER_YEAR_PER_KM_S) / Math.max(radius, 50);

export const BAR_ANGULAR_SPEED = (BAR_PATTERN_SPEED * PC_PER_YEAR_PER_KM_S) / 1000;

export function turnAzimuth([x, y, z], angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [x * cos + y * sin, -x * sin + y * cos, z];
}

export function positionSeenAt(present, peculiar, delayYears) {
  const radius = Math.hypot(present[0], present[1]);
  const [x, y, z] = turnAzimuth(present, -angularSpeed(radius) * delayYears);
  const drift = PC_PER_YEAR_PER_KM_S * delayYears;
  return [x - peculiar[0] * drift, y - peculiar[1] * drift, z - peculiar[2] * drift];
}

const ARMS = [
  { name: '3-kpc near', kinkAzimuth: 15, kinkRadius: 3520, pitchBefore: -4.2, pitchAfter: -4.2, width: 180, from: -40, to: 60, strength: 0.5 },
  { name: '3-kpc far', kinkAzimuth: 195, kinkRadius: 3520, pitchBefore: -4.2, pitchAfter: -4.2, width: 180, from: 140, to: 240, strength: 0.4 },
  { name: 'Norma', kinkAzimuth: 18, kinkRadius: 4460, pitchBefore: -1, pitchAfter: 19.5, width: 140, from: -60, to: 140, strength: 0.9 },
  { name: 'Scutum-Centaurus', kinkAzimuth: 23, kinkRadius: 4910, pitchBefore: 14.1, pitchAfter: 12.1, width: 230, from: -90, to: 240, strength: 1 },
  { name: 'Sagittarius-Carina', kinkAzimuth: 24, kinkRadius: 6040, pitchBefore: 17.1, pitchAfter: 1, width: 270, from: -110, to: 150, strength: 1 },
  { name: 'Local', kinkAzimuth: 9, kinkRadius: 8260, pitchBefore: 11.4, pitchAfter: 11.4, width: 310, from: -40, to: 70, strength: 0.6 },
  { name: 'Perseus', kinkAzimuth: 40, kinkRadius: 8870, pitchBefore: 10.3, pitchAfter: 8.7, width: 350, from: -120, to: 200, strength: 1 },
  { name: 'Outer', kinkAzimuth: 18, kinkRadius: 12240, pitchBefore: 3, pitchAfter: 9.4, width: 650, from: -90, to: 180, strength: 0.7 },
];
const FITTED_AZIMUTHS = {
  '3-kpc near': [15, 18], '3-kpc far': [195, 198], Norma: [5, 54], 'Scutum-Centaurus': [0, 104],
  'Sagittarius-Carina': [2, 97], Local: [-8, 34], Perseus: [-23, 115], Outer: [-16, 71],
};
const WIDTH_GROWTH = 0.042;
const ARM_TAPER = 35;

function armRadius(arm, azimuth) {
  const pitch = (azimuth <= arm.kinkAzimuth ? arm.pitchBefore : arm.pitchAfter) * DEGREES;
  return arm.kinkRadius * Math.exp(-(azimuth - arm.kinkAzimuth) * DEGREES * Math.tan(pitch));
}

export function armTraces(stepDegrees = 1) {
  return ARMS.map((arm) => {
    const [fittedFrom, fittedTo] = FITTED_AZIMUTHS[arm.name];
    const points = [];
    for (let azimuth = arm.from; azimuth <= arm.to; azimuth += stepDegrees) {
      const radius = armRadius(arm, azimuth);
      const outside = Math.max(fittedFrom - azimuth, azimuth - fittedTo, 0);
      const fade = Math.max(0.35, 1 - outside / (2 * ARM_TAPER)) * Math.min(1, (azimuth - arm.from) / ARM_TAPER, (arm.to - azimuth) / ARM_TAPER);
      points.push({
        x: radius * Math.sin(azimuth * DEGREES),
        y: radius * Math.cos(azimuth * DEGREES),
        width: arm.width + WIDTH_GROWTH * (radius - arm.kinkRadius),
        strength: arm.strength * Math.max(0, fade),
        fitted: outside === 0,
      });
    }
    return { name: arm.name, points };
  });
}

export function buildArmMap() {
  const map = new Float32Array(MAP_SIZE * MAP_SIZE);
  const texel = (2 * MAP_HALF_WIDTH) / MAP_SIZE;
  for (const { points } of armTraces(0.5)) {
    for (const point of points) {
      if (point.strength <= 0) continue;
      const reach = 3 * point.width;
      const column0 = Math.max(0, Math.floor((point.x - reach + MAP_HALF_WIDTH) / texel));
      const column1 = Math.min(MAP_SIZE - 1, Math.ceil((point.x + reach + MAP_HALF_WIDTH) / texel));
      const row0 = Math.max(0, Math.floor((point.y - reach + MAP_HALF_WIDTH) / texel));
      const row1 = Math.min(MAP_SIZE - 1, Math.ceil((point.y + reach + MAP_HALF_WIDTH) / texel));
      const spread = 2 * point.width * point.width;
      for (let row = row0; row <= row1; row++) {
        const dy = (row + 0.5) * texel - MAP_HALF_WIDTH - point.y;
        for (let column = column0; column <= column1; column++) {
          const dx = (column + 0.5) * texel - MAP_HALF_WIDTH - point.x;
          const value = point.strength * Math.exp(-(dx * dx + dy * dy) / spread);
          const index = row * MAP_SIZE + column;
          if (value > map[index]) map[index] = value;
        }
      }
    }
  }
  return map;
}

export function sampleArmMap(map, x, y) {
  const column = ((x + MAP_HALF_WIDTH) / (2 * MAP_HALF_WIDTH)) * MAP_SIZE - 0.5;
  const row = ((y + MAP_HALF_WIDTH) / (2 * MAP_HALF_WIDTH)) * MAP_SIZE - 0.5;
  const c = Math.floor(column);
  const r = Math.floor(row);
  if (c < 0 || r < 0 || c >= MAP_SIZE - 1 || r >= MAP_SIZE - 1) return 0;
  const fx = column - c;
  const fy = row - r;
  const at = r * MAP_SIZE + c;
  return (map[at] * (1 - fx) + map[at + 1] * fx) * (1 - fy) + (map[at + MAP_SIZE] * (1 - fx) + map[at + MAP_SIZE + 1] * fx) * fy;
}

const sech2 = (value) => {
  const c = Math.cosh(Math.min(Math.abs(value), 40));
  return 1 / (c * c);
};

export function youngRadialTaper(radius) {
  const inner = 1 / (1 + Math.exp(-(radius - 3000) / 400));
  const outer = 1 / (1 + Math.exp((radius - 15000) / 1200));
  return inner * outer;
}

function bulgeShape(x, y, z, [a, b, c]) {
  const cos = Math.cos(BAR_ANGLE);
  const sin = Math.sin(BAR_ANGLE);
  const along = x * sin + y * cos;
  const across = x * cos - y * sin;
  return Math.hypot(along / a, across / b, z / c);
}

export function oldShape([x, y, z], arm) {
  const radius = Math.hypot(x, y);
  const thin = DISK.midplane * Math.exp(-(radius - SUN_RADIUS) / DISK.scaleLength) * sech2(z / DISK.scaleHeight) * (0.85 + 0.3 * arm);
  const thick = DISK.thick * Math.exp(-(radius - SUN_RADIUS) / DISK.thickScaleLength) * Math.exp(-Math.abs(z) / DISK.thickScaleHeight);
  const bulge = DISK.bulge * Math.exp(-bulgeShape(x, y, z, DISK.bulgeScales));
  const longBar = DISK.longBar * Math.exp(-(bulgeShape(x, y, z, DISK.longBarScales) ** 4));
  const outerEdge = 1 / (1 + Math.exp((radius - 16000) / 1500));
  return (thin + thick) * outerEdge + bulge + longBar;
}

export function youngShape([x, y, z], arm) {
  if (arm <= 0 || Math.abs(z) > 20 * DISK.youngScaleHeight) return 0;
  const radius = Math.hypot(x, y);
  return DISK.youngPerArm * arm * youngRadialTaper(radius) * Math.exp(-Math.abs(z) / DISK.youngScaleHeight);
}

export const toLightYears = (parsecs) => parsecs * LY_PER_PC;
