import { DEGREES, directionFromEquatorial, fromHeliocentric, velocityFromHeliocentric } from './milky-way.js';
import { bandFluxes, luminosityOf } from './population.js';

export const GALAXIES = [
  {
    name: 'Andromeda Galaxy',
    shortName: 'M31',
    ra: 10.6847, dec: 41.269, kpc: 765,
    absolute: -21.5, colour: 0.92,
    diskShare: 0.7, scaleLength: 5300, coreSigma: 1000,
    inclination: 77, positionAngle: 38,
  },
  {
    name: 'Large Magellanic Cloud',
    shortName: 'LMC',
    ra: 80.894, dec: -69.756, kpc: 49.6,
    absolute: -18.1, colour: 0.5,
    diskShare: 0.75, scaleLength: 1500, coreSigma: 700,
    inclination: 35, positionAngle: 170,
  },
  {
    name: 'Small Magellanic Cloud',
    shortName: 'SMC',
    ra: 13.187, dec: -72.829, kpc: 62.4,
    absolute: -16.8, colour: 0.45,
    diskShare: 0.5, scaleLength: 900, coreSigma: 700,
    inclination: 65, positionAngle: 45,
  },
];

const CELESTIAL_POLE = directionFromEquatorial(0, 90);

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a) => a.map((value) => value / Math.hypot(...a));

function diskNormal(sightline, inclination, positionAngle) {
  const east = normalize(cross(CELESTIAL_POLE, sightline));
  const north = cross(sightline, east);
  const angle = positionAngle * DEGREES;
  const minorAxis = north.map((n, i) => -Math.sin(angle) * n + Math.cos(angle) * east[i]);
  const tilt = inclination * DEGREES;
  return sightline.map((s, i) => -Math.cos(tilt) * s + Math.sin(tilt) * minorAxis[i]);
}

export function placeGalaxies(galaxies) {
  return galaxies.map((galaxy) => {
    const sightline = directionFromEquatorial(galaxy.ra, galaxy.dec);
    const luminosity = luminosityOf(galaxy.absolute);
    return {
      ...galaxy,
      centre: fromHeliocentric(sightline.map((s) => s * galaxy.kpc * 1000)),
      normal: velocityFromHeliocentric(diskNormal(sightline, galaxy.inclination, galaxy.positionAngle)),
      diskLight: luminosity * galaxy.diskShare,
      coreLight: luminosity * (1 - galaxy.diskShare),
      tint: bandFluxes(galaxy.colour),
    };
  });
}
