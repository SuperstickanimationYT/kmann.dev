import { AU_KM, DAY_SECONDS, SUN_MU, planetState } from './ephemeris.js';
import { lambert } from './lambert.js';
import { cross, dot, norm, sub } from './vector.js';
import { propagate, wrapAngle } from './kepler.js';

const OBLIQUITY_J2000 = (23.43928 * Math.PI) / 180;

export function eclipticToEquatorial([x, y, z]) {
  const cos = Math.cos(OBLIQUITY_J2000);
  const sin = Math.sin(OBLIQUITY_J2000);
  return [x, cos * y - sin * z, sin * y + cos * z];
}

export function directTransfer(from, to, departJd, arriveJd) {
  const departure = planetState(from, departJd);
  const arrival = planetState(to, arriveJd);
  const { v1, v2 } = lambert(departure.r, arrival.r, (arriveJd - departJd) * DAY_SECONDS, SUN_MU);
  const departureVInf = sub(v1, departure.v);
  const arrivalVInf = sub(v2, arrival.v);
  const equatorial = eclipticToEquatorial(departureVInf);
  const sweep = Math.acos(Math.max(-1, Math.min(1, dot(departure.r, arrival.r) / (norm(departure.r) * norm(arrival.r)))));
  const plane = cross(departure.r, v1);

  return {
    from,
    to,
    departJd,
    arriveJd,
    departure,
    arrival,
    v1,
    v2,
    departureVInf,
    arrivalVInf,
    c3: dot(departureVInf, departureVInf),
    declination: Math.asin(equatorial[2] / norm(equatorial)),
    rightAscension: wrapAngle(Math.atan2(equatorial[1], equatorial[0])),
    arrivalSpeed: norm(arrivalVInf),
    sweep: plane[2] >= 0 === cross(departure.r, arrival.r)[2] >= 0 ? sweep : 2 * Math.PI - sweep,
    inclination: Math.acos(plane[2] / norm(plane)),
  };
}

export function directTransferOrNull(from, to, departJd, arriveJd) {
  try {
    return directTransfer(from, to, departJd, arriveJd);
  } catch {
    return null;
  }
}

export function sunDistancesAlong(transfer, samples) {
  const seconds = (transfer.arriveJd - transfer.departJd) * DAY_SECONDS;
  return Array.from({ length: samples }, (_, step) => {
    const elapsed = (seconds * (step + 0.5)) / samples;
    return norm(propagate(transfer.departure.r, transfer.v1, elapsed, SUN_MU).r) / AU_KM;
  });
}
