export const G0 = 9.80665;
export const ISP = 450;
export const EXHAUST_VELOCITY = ISP * G0;
export const THRUST = 60000;
export const CAPSULE_MASS = 3000;
export const ENGINE_MASS = 1500;
export const TANK_DRY_MASS = 450;
export const TANK_CAPACITY = 4000;
export const PROPELLANT_UNIT = 1000;
export const DELTA_V_NEEDED = 2700;

export function emptyRocket() {
  return { capsule: false, engine: false, tanks: 0, propellant: 0 };
}

export function dryMass(rocket) {
  return (rocket.capsule ? CAPSULE_MASS : 0) + (rocket.engine ? ENGINE_MASS : 0) + rocket.tanks * TANK_DRY_MASS;
}

export function propellantCapacity(rocket) {
  return rocket.tanks * TANK_CAPACITY;
}

export function deltaV(dry, propellant) {
  if (dry <= 0) return 0;
  return EXHAUST_VELOCITY * Math.log((dry + propellant) / dry);
}

export function rocketDeltaV(rocket) {
  return deltaV(dryMass(rocket), rocket.propellant);
}

export function isFlyable(rocket) {
  return rocket.capsule && rocket.engine && rocket.tanks > 0 && rocket.propellant > 0;
}

export function practiceRocket() {
  return { capsule: true, engine: true, tanks: 2, propellant: 2 * TANK_CAPACITY };
}
