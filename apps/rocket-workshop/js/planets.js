export const SCALE_DOWN = 20;

const EARTH_SCALE_HEIGHT_RATIO = 4500 / 8500;
const AIR_TOP_SCALE_HEIGHTS = 35000 / 4500;
const DEGREES = Math.PI / 180;

function air(seaLevelDensity, realScaleHeightKm, sky) {
  const scaleHeight = realScaleHeightKm * 1000 * EARTH_SCALE_HEIGHT_RATIO;
  return { seaLevelDensity, scaleHeight, top: scaleHeight * AIR_TOP_SCALE_HEIGHTS, sky };
}

function body(name, realRadiusKm, surfaceGravity, color, orbit = null, atmosphere = null) {
  const radius = (realRadiusKm * 1000) / SCALE_DOWN;
  return {
    name,
    radius,
    mu: surfaceGravity * radius ** 2,
    color,
    atmosphere,
    parent: orbit?.parent ?? null,
    orbitRadius: orbit ? (orbit.realDistanceKm * 1000) / SCALE_DOWN : 0,
    startAngle: orbit ? orbit.startDegrees * DEGREES : 0,
  };
}

export const SUN = body('Sun', 696000, 274, '#ffd27a');
const around = (parent, realDistanceKm, startDegrees) => ({ parent, realDistanceKm, startDegrees });

const MERCURY = body('Mercury', 2439.7, 3.7, '#8c8c8c', around(SUN, 57.91e6, 252));
const VENUS = body('Venus', 6051.8, 8.87, '#d9b77a', around(SUN, 108.21e6, 182), air(65, 15.9, [184, 148, 90]));
export const EARTH = body('Earth', 6371, 9.8, '#2c6e49', around(SUN, 149.6e6, 100), air(1.225, 8.5, [40, 92, 150]));
export const MOON = body('Moon', 1737.4, 1.62, '#8b929c', around(EARTH, 384400, 45));
const MARS = body('Mars', 3389.5, 3.72, '#b5552f', around(SUN, 227.94e6, 355), air(0.02, 11.1, [176, 106, 72]));
const PHOBOS = body('Phobos', 11.27, 0.0057, '#7a6a5e', around(MARS, 9376, 0));
const DEIMOS = body('Deimos', 6.2, 0.003, '#8a7a6e', around(MARS, 23463, 120));
const JUPITER = body('Jupiter', 69911, 24.79, '#c9a27a', around(SUN, 778.57e6, 34), air(0.16, 27, [160, 136, 104]));
const IO = body('Io', 1821.6, 1.796, '#d9c75a', around(JUPITER, 421700, 0));
const EUROPA = body('Europa', 1560.8, 1.314, '#c8bfae', around(JUPITER, 671034, 90));
const GANYMEDE = body('Ganymede', 2634.1, 1.428, '#9a8f82', around(JUPITER, 1070412, 180));
const CALLISTO = body('Callisto', 2410.3, 1.235, '#6e655c', around(JUPITER, 1882709, 270));
const SATURN = body('Saturn', 58232, 10.44, '#d9c48f', around(SUN, 1433.53e6, 50), air(0.19, 59.5, [184, 168, 120]));
const TITAN = body('Titan', 2574.7, 1.352, '#c79a4a', around(SATURN, 1221870, 0), air(5.3, 21, [160, 122, 58]));
const URANUS = body('Uranus', 25362, 8.87, '#9fd6df', around(SUN, 2872.46e6, 314), air(0.42, 27.7, [127, 184, 200]));
const NEPTUNE = body('Neptune', 24622, 11.15, '#4a6fd1', around(SUN, 4495.06e6, 304), air(0.45, 19.7, [79, 111, 192]));
const TRITON = body('Triton', 1353.4, 0.779, '#c7b9b0', around(NEPTUNE, 354759, 0));
const PLUTO = body('Pluto', 1188.3, 0.62, '#c9b39a', around(SUN, 5906.4e6, 238));

export const BODIES = [SUN, MERCURY, VENUS, EARTH, MOON, MARS, PHOBOS, DEIMOS, JUPITER, IO, EUROPA, GANYMEDE, CALLISTO, SATURN, TITAN, URANUS, NEPTUNE, TRITON, PLUTO];
export const AIRY_BODIES = BODIES.filter((b) => b.atmosphere);

for (const b of BODIES) {
  b.angularSpeed = b.parent ? Math.sqrt(b.parent.mu / b.orbitRadius ** 3) : 0;
  b.sphereOfInfluence = b.parent ? b.orbitRadius * (b.mu / b.parent.mu) ** 0.4 : Infinity;
  b.children = BODIES.filter((other) => other.parent === b);
}

function aroundSun(target, time) {
  if (!target.parent) return { x: 0, y: 0, vx: 0, vy: 0 };
  const parent = aroundSun(target.parent, time);
  const angle = target.startAngle + target.angularSpeed * time;
  const speed = target.angularSpeed * target.orbitRadius;
  return {
    x: parent.x + target.orbitRadius * Math.cos(angle),
    y: parent.y + target.orbitRadius * Math.sin(angle),
    vx: parent.vx - speed * Math.sin(angle),
    vy: parent.vy + speed * Math.cos(angle),
  };
}

const EARTH_AT_LAUNCH = aroundSun(EARTH, 0);
const PAD_OFFSET = { x: -EARTH_AT_LAUNCH.x, y: -EARTH.radius - EARTH_AT_LAUNCH.y };

let cachedTime = NaN;
const cache = new Map();

export function bodyState(target, time) {
  if (time !== cachedTime) {
    cachedTime = time;
    cache.clear();
  }
  let state = cache.get(target);
  if (!state) {
    const sunward = aroundSun(target, time);
    state = { x: sunward.x + PAD_OFFSET.x, y: sunward.y + PAD_OFFSET.y, vx: sunward.vx, vy: sunward.vy };
    cache.set(target, state);
  }
  return state;
}

export function dominantBody(x, y, time) {
  let current = SUN;
  for (;;) {
    const inside = current.children.find((child) => {
      const state = bodyState(child, time);
      return Math.hypot(x - state.x, y - state.y) < child.sphereOfInfluence;
    });
    if (!inside) return current;
    current = inside;
  }
}

export function airDensity(target, altitude) {
  const { seaLevelDensity, scaleHeight, top } = target.atmosphere;
  if (altitude >= top) return 0;
  return seaLevelDensity * Math.exp(-Math.max(0, altitude) / scaleHeight);
}

export function airAround(x, y, time) {
  for (const target of AIRY_BODIES) {
    const state = bodyState(target, time);
    const altitude = Math.hypot(x - state.x, y - state.y) - target.radius;
    if (altitude < target.atmosphere.top) return { body: target, altitude, thickness: airDensity(target, altitude) / target.atmosphere.seaLevelDensity };
  }
  return null;
}
