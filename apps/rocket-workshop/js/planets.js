export const SCALE_DOWN = 20;

const EARTH_RADIUS = 6371000 / SCALE_DOWN;
const MOON_RADIUS = 1737400 / SCALE_DOWN;
const MOON_ORBIT_RADIUS = 384400000 / SCALE_DOWN;
const MOON_START_ANGLE = Math.PI / 4;

export const EARTH = {
  name: 'Earth',
  radius: EARTH_RADIUS,
  mu: 9.8 * EARTH_RADIUS ** 2,
  atmosphere: { seaLevelDensity: 1.225, scaleHeight: 4500, top: 35000 },
  color: '#2c6e49',
};

export const MOON = {
  name: 'Moon',
  radius: MOON_RADIUS,
  mu: 1.62 * MOON_RADIUS ** 2,
  atmosphere: null,
  color: '#8b929c',
};

export const BODIES = [EARTH, MOON];

const EARTH_CENTER = { x: 0, y: -EARTH_RADIUS };
const MOON_ANGULAR_SPEED = Math.sqrt(EARTH.mu / MOON_ORBIT_RADIUS ** 3);
const MOON_SPHERE_OF_INFLUENCE = MOON_ORBIT_RADIUS * (MOON.mu / EARTH.mu) ** 0.4;

export function bodyState(body, time) {
  if (body === EARTH) return { ...EARTH_CENTER, vx: 0, vy: 0 };
  const angle = MOON_START_ANGLE + MOON_ANGULAR_SPEED * time;
  const speed = MOON_ANGULAR_SPEED * MOON_ORBIT_RADIUS;
  return {
    x: EARTH_CENTER.x + MOON_ORBIT_RADIUS * Math.cos(angle),
    y: EARTH_CENTER.y + MOON_ORBIT_RADIUS * Math.sin(angle),
    vx: -speed * Math.sin(angle),
    vy: speed * Math.cos(angle),
  };
}

export function dominantBody(x, y, time) {
  const moon = bodyState(MOON, time);
  return Math.hypot(x - moon.x, y - moon.y) < MOON_SPHERE_OF_INFLUENCE ? MOON : EARTH;
}

export function airDensity(altitude) {
  const { seaLevelDensity, scaleHeight, top } = EARTH.atmosphere;
  if (altitude >= top) return 0;
  return seaLevelDensity * Math.exp(-Math.max(0, altitude) / scaleHeight);
}
