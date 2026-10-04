const DISK_SCALE = 3;
const RMAX = DISK_SCALE * 5.4;
const VISIBLE_RADIUS = DISK_SCALE * 4.2;
const DEGREES = Math.PI / 180;

const share = (value) => value / 100;

export const TELESCOPES = {
  hubble: {
    psfSigma: 0.0011, haloRadius: 0.004, haloFraction: 0.07,
    spikeLength: 0.003, spikeWidth: 0.0008, spikeStrength: 0.6, spikeDirections: 2, crossbar: 0,
    seeing: 0.0007, sky: 0.01, noise: 1,
  },
  jwst: {
    psfSigma: 0.001, haloRadius: 0.0035, haloFraction: 0.1,
    spikeLength: 0.004, spikeWidth: 0.0007, spikeStrength: 0.9, spikeDirections: 3, crossbar: 0.35,
    seeing: 0.0006, sky: 0.008, noise: 0.8,
  },
  roman: {
    psfSigma: 0.0013, haloRadius: 0.004, haloFraction: 0.07,
    spikeLength: 0.003, spikeWidth: 0.0008, spikeStrength: 0.5, spikeDirections: 3, crossbar: 0,
    seeing: 0.0009, sky: 0.01, noise: 1,
  },
  ground: {
    psfSigma: 0.0032, haloRadius: 0.012, haloFraction: 0.16,
    spikeLength: 0, spikeWidth: 0, spikeStrength: 0, spikeDirections: 0, crossbar: 0,
    seeing: 0.0028, sky: 0.03, noise: 1.9,
  },
};

export function morphologyOf(settings) {
  const barShare = share(settings.bar);
  return {
    uRmax: RMAX,
    uSeed: { uint: settings.seed },
    uArms: settings.arms,
    uPitch: settings.pitch * DEGREES,
    uArmContrast: share(settings.armContrast),
    uFlocculence: share(settings.flocculence),
    uBarLength: barShare > 0.04 ? DISK_SCALE * (0.45 + 0.85 * barShare) : 0,
    uDiskScale: DISK_SCALE,
    uYoung: share(settings.young),
    uGas: share(settings.gas),
    uDust: share(settings.dust),
  };
}

export function lightingOf(settings) {
  const bulge = share(settings.bulge);
  const barShare = share(settings.bar);
  const thickness = 0.12 + 0.55 * share(settings.thickness);
  const bulgeRadius = 0.35 + 2.4 * bulge;
  const bulgeFlattening = 1 - 0.68 * share(settings.flattening);
  return {
    uRmax: RMAX,
    uZmax: Math.min(RMAX, Math.max(14 * thickness, 5 * bulgeRadius * bulgeFlattening)),
    uFieldHeight: (2 * VISIBLE_RADIUS) / (0.15 + 0.95 * share(settings.size)),
    uInclination: settings.inclination * DEGREES,
    uPositionAngle: settings.angle * DEGREES,
    uDiskLight: 1.6 * share(settings.disk),
    uYoungLight: 2.4,
    uGasLight: 2.2,
    uClusterLight: 4,
    uThickness: thickness,
    uDustOpacity: 30,
    uBulgeLight: 0.012 + 0.1 * bulge * bulge,
    uBulgeRadius: bulgeRadius,
    uBulgeFlattening: bulgeFlattening,
    uBulgeIndex: 1.4 + 2.6 * bulge,
    uBarLight: barShare > 0.04 ? 1.6 * barShare : 0,
    uBarLength: barShare > 0.04 ? DISK_SCALE * (0.45 + 0.85 * barShare) : 0,
    uNucleusLight: 0.4 * bulge,
  };
}

export function projectToFrame(point, settings) {
  const { uInclination, uPositionAngle, uFieldHeight } = lightingOf(settings);
  const [x, y, z] = point;
  const viewY = y * Math.cos(uInclination) + z * Math.sin(uInclination);
  const cosAngle = Math.cos(uPositionAngle);
  const sinAngle = Math.sin(uPositionAngle);
  const screenX = cosAngle * x + sinAngle * viewY;
  const screenY = -sinAngle * x + cosAngle * viewY;
  return [screenX / uFieldHeight, screenY / uFieldHeight];
}

export const galaxyExtent = () => ({ diskScale: DISK_SCALE, visibleRadius: VISIBLE_RADIUS });
