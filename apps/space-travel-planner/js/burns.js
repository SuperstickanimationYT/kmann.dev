export const STANDARD_GRAVITY_KM_PER_S2 = 9.80665e-3;

export function hyperbolicPeriapsisSpeed(c3, mu, periapsisRadius) {
  return Math.sqrt(c3 + (2 * mu) / periapsisRadius);
}

export function ellipsePeriapsisSpeed(mu, periapsisRadius, apoapsisRadius) {
  return Math.sqrt(mu * (2 / periapsisRadius - 2 / (periapsisRadius + apoapsisRadius)));
}

export function raiseC3AtPeriapsis(fromC3, toC3, mu, periapsisRadius) {
  return Math.max(0, hyperbolicPeriapsisSpeed(toC3, mu, periapsisRadius) - hyperbolicPeriapsisSpeed(fromC3, mu, periapsisRadius));
}

export function escapeFromCircularOrbit(c3, mu, orbitRadius) {
  return hyperbolicPeriapsisSpeed(c3, mu, orbitRadius) - Math.sqrt(mu / orbitRadius);
}

export function captureIntoOrbit(arrivalSpeed, mu, periapsisRadius, apoapsisRadius) {
  return hyperbolicPeriapsisSpeed(arrivalSpeed ** 2, mu, periapsisRadius) - ellipsePeriapsisSpeed(mu, periapsisRadius, apoapsisRadius);
}

export function exhaustSpeed(isp) {
  return isp * STANDARD_GRAVITY_KM_PER_S2;
}

export function propellantForDeltaV(startMass, deltaV, isp) {
  return startMass * (1 - Math.exp(-deltaV / exhaustSpeed(isp)));
}

export function deltaVFromPropellant(startMass, propellant, isp) {
  return exhaustSpeed(isp) * Math.log(startMass / (startMass - propellant));
}
