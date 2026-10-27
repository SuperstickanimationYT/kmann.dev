export const PARKING_ORBIT_CLEARANCE = 5000;

const AIRLESS_ORBIT_HEIGHT_SHARE = 0.05;
const AIRLESS_ORBIT_MIN_HEIGHT = 2000;

const BODIES = {
  Sun: { radius: 34817000, gravity: 274 },
  Mercury: { parent: 'Sun', radius: 122000, gravity: 3.7, orbitRadius: 2895000000 },
  Venus: { parent: 'Sun', radius: 300000, gravity: 8.87, orbitRadius: 5410000000, atmosphere: { height: 40000, density: 0.025, curve: 13 } },
  Earth: { parent: 'Sun', radius: 314970, gravity: 9.8, orbitRadius: 7480000000, atmosphere: { height: 30000, density: 0.005, curve: 10 } },
  Moon: { parent: 'Earth', radius: 86500, gravity: 1.42, orbitRadius: 1120000 },
  'Captured Asteroid': { parent: 'Earth', radius: 100, gravity: 0.034, orbitRadius: 37200000 },
  Mars: { parent: 'Sun', radius: 169500, gravity: 3.61, orbitRadius: 11395000000, atmosphere: { height: 20000, density: 0.0008, curve: 9 }, thinAtmosphere: true },
  Phobos: { parent: 'Mars', radius: 1000, gravity: 0.087, orbitRadius: 469000 },
  Deimos: { parent: 'Mars', radius: 600, gravity: 0.054, orbitRadius: 1173000 },
  Jupiter: { parent: 'Sun', radius: 3500000, gravity: 24.8, orbitRadius: 38930000000, gasGiant: true, atmosphere: { height: 100000, density: 0.025, curve: 15 } },
  Io: { parent: 'Jupiter', radius: 91000, gravity: 1.796, orbitRadius: 16868000 },
  Europa: { parent: 'Jupiter', radius: 78000, gravity: 1.314, orbitRadius: 33545000 },
  Ganymede: { parent: 'Jupiter', radius: 132000, gravity: 1.428, orbitRadius: 53520000 },
  Callisto: { parent: 'Jupiter', radius: 120000, gravity: 1.235, orbitRadius: 94136000 },
  Saturn: { parent: 'Sun', radius: 2911600, gravity: 10.44, orbitRadius: 71676500000, gasGiant: true, atmosphere: { height: 100000, curve: 15 } },
  Titan: { parent: 'Saturn', radius: 128700, gravity: 1.35, orbitRadius: 48874800, atmosphere: { height: 40000, curve: 13 } },
  Uranus: { parent: 'Sun', radius: 1268100, gravity: 8.69, orbitRadius: 143548581600, gasGiant: true, atmosphere: { height: 100000, density: 0.025, curve: 15 } },
  Neptune: { parent: 'Sun', radius: 1238200, gravity: 11.15, orbitRadius: 224920500000, gasGiant: true, atmosphere: { height: 100000, density: 0.025, curve: 15 } },
  Pluto: { parent: 'Sun', radius: 59400, gravity: 0.62, orbitRadius: 295321156550 },
};

export const EARTH = BODIES.Earth;

export const gravitationalParameter = (body) => body.gravity * body.radius * body.radius;

export function lowOrbitRadius(body) {
  if (body.atmosphere) return body.radius + body.atmosphere.height + PARKING_ORBIT_CLEARANCE;
  return body.radius + Math.max(AIRLESS_ORBIT_MIN_HEIGHT, body.radius * AIRLESS_ORBIT_HEIGHT_SHARE);
}

const circularSpeed = (mu, r) => Math.sqrt(mu / r);
const speedOnEllipse = (mu, r, semiMajorAxis) => Math.sqrt(mu * (2 / r - 1 / semiMajorAxis));

function hohmannExcessSpeeds(mu, fromRadius, toRadius) {
  const semiMajorAxis = (fromRadius + toRadius) / 2;
  return {
    leaving: Math.abs(speedOnEllipse(mu, fromRadius, semiMajorAxis) - circularSpeed(mu, fromRadius)),
    arriving: Math.abs(circularSpeed(mu, toRadius) - speedOnEllipse(mu, toRadius, semiMajorAxis)),
  };
}

function burnFromCircularOrbit(body, orbitRadius, excessSpeed) {
  const mu = gravitationalParameter(body);
  return Math.sqrt(excessSpeed * excessSpeed + (2 * mu) / orbitRadius) - circularSpeed(mu, orbitRadius);
}

function arrivalExcessSpeed(name) {
  const body = BODIES[name];
  const earthRadius = lowOrbitRadius(EARTH);
  if (body.parent === 'Earth') {
    const semiMajorAxis = (earthRadius + body.orbitRadius) / 2;
    const mu = gravitationalParameter(EARTH);
    return {
      departure: speedOnEllipse(mu, earthRadius, semiMajorAxis) - circularSpeed(mu, earthRadius),
      excess: Math.abs(circularSpeed(mu, body.orbitRadius) - speedOnEllipse(mu, body.orbitRadius, semiMajorAxis)),
      leavePlanet: 0,
    };
  }
  const planetName = body.parent === 'Sun' ? name : body.parent;
  const planet = BODIES[planetName];
  const { leaving, arriving } = hohmannExcessSpeeds(gravitationalParameter(BODIES.Sun), EARTH.orbitRadius, planet.orbitRadius);
  const departure = burnFromCircularOrbit(EARTH, earthRadius, leaving);
  if (body.parent === 'Sun') return { departure, excess: arriving, leavePlanet: 0 };
  const moonOrbitCapture = burnFromCircularOrbit(planet, body.orbitRadius, arriving);
  return { departure: departure + moonOrbitCapture, excess: 0, leavePlanet: moonOrbitCapture };
}

function destination(name) {
  const body = BODIES[name];
  const { departure, excess, leavePlanet } = arrivalExcessSpeed(name);
  const orbitRadius = lowOrbitRadius(body);
  const capture = burnFromCircularOrbit(body, orbitRadius, excess);
  const orbit = departure + capture;
  if (body.gasGiant) return { name, orbit, land: null, landAndReturn: null, note: 'No surface' };
  if (body.atmosphere) {
    const landingNote = body.thinAtmosphere ? 'Thin air: parachutes alone may not slow it enough' : 'Lands on parachutes';
    return { name, orbit, land: orbit, landAndReturn: null, note: `${landingNote}. Takeoff not estimated` };
  }
  const descent = circularSpeed(gravitationalParameter(body), orbitRadius);
  const land = orbit + descent;
  return { name, orbit, land, landAndReturn: land + descent + capture + leavePlanet, note: '' };
}

export function earthEscape() {
  const r = lowOrbitRadius(EARTH);
  return burnFromCircularOrbit(EARTH, r, 0);
}

export const DESTINATION_ORDER = [
  'Moon', 'Captured Asteroid', 'Mercury', 'Venus', 'Mars', 'Phobos', 'Deimos', 'Jupiter',
  'Io', 'Europa', 'Ganymede', 'Callisto', 'Saturn', 'Titan', 'Uranus', 'Neptune', 'Pluto',
];

export function destinations() {
  return DESTINATION_ORDER.map((name) => ({ ...destination(name), parent: BODIES[name].parent }));
}
