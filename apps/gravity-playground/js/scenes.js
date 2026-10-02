import { circularVelocity, createBody } from './physics.js';

const FIGURE_EIGHT = {
  size: 160,
  mass: 300,
  positions: [
    [0.97000436, -0.24308753],
    [-0.97000436, 0.24308753],
    [0, 0],
  ],
  lastVelocity: [-0.93240737, -0.86473146],
};

function orbiting(centre, distance, bearing, mass, exponent) {
  const x = centre.x + Math.cos(bearing) * distance;
  const y = centre.y + Math.sin(bearing) * distance;
  return createBody({ x, y, mass, ...circularVelocity(centre, x, y, exponent) });
}

function starAndPlanets(exponent) {
  const star = createBody({ x: 0, y: 0, mass: 1000 });
  const planets = [
    [80, 0.3, 0.2],
    [130, 2.4, 0.4],
    [215, 4.1, 0.4],
    [340, 1.2, 0.6],
  ].map(([distance, bearing, mass]) => orbiting(star, distance, bearing, mass, exponent));
  return [star, ...planets];
}

const orbitSpeed = (mass, distance, exponent) => {
  const { vx, vy } = circularVelocity({ x: 0, y: 0, vx: 0, vy: 0, mass }, distance, 0, exponent);
  return Math.hypot(vx, vy);
};

function binaryStars(exponent) {
  const halfGap = 70;
  const [left, right] = [-halfGap, halfGap].map((x) => createBody({ x, y: 0, mass: 500 }));
  const aroundTheMiddle = (body, partner) => {
    const aroundPartner = circularVelocity(partner, body.x, body.y, exponent);
    return { vx: aroundPartner.vx / Math.SQRT2, vy: aroundPartner.vy / Math.SQRT2 };
  };
  Object.assign(left, aroundTheMiddle(left, right));
  Object.assign(right, aroundTheMiddle(right, left));
  const bothStars = createBody({ x: 0, y: 0, mass: left.mass + right.mass });
  return [left, right, orbiting(bothStars, 320, 0.8, 0.5, exponent)];
}

function figureEight(exponent) {
  const { size, mass, positions, lastVelocity } = FIGURE_EIGHT;
  const speedScale = orbitSpeed(mass, size, exponent);
  const [vx, vy] = lastVelocity;
  const velocities = [[-vx / 2, -vy / 2], [-vx / 2, -vy / 2], [vx, vy]];
  return positions.map(([x, y], index) =>
    createBody({ x: x * size, y: y * size, vx: velocities[index][0] * speedScale, vy: velocities[index][1] * speedScale, mass }),
  );
}

const DISK = { starMass: 1000, planetesimals: 1000, planetesimalMass: 0.015, inner: 70, outer: 320, stirring: 0.03 };

function protoplanetaryDisk(exponent) {
  const star = createBody({ x: 0, y: 0, mass: DISK.starMass });
  const planetesimals = Array.from({ length: DISK.planetesimals }, () => {
    const distance = DISK.inner + Math.random() * (DISK.outer - DISK.inner);
    const bearing = Math.random() * Math.PI * 2;
    const planetesimal = orbiting(star, distance, bearing, DISK.planetesimalMass, exponent);
    const speed = Math.hypot(planetesimal.vx, planetesimal.vy);
    planetesimal.vx += (Math.random() - 0.5) * DISK.stirring * speed;
    planetesimal.vy += (Math.random() - 0.5) * DISK.stirring * speed;
    return planetesimal;
  });
  return [star, ...planetesimals];
}

function centredAtRest(bodies) {
  const free = bodies.filter((body) => !body.pinned);
  const mass = bodies.reduce((sum, body) => sum + body.mass, 0);
  const freeMass = free.reduce((sum, body) => sum + body.mass, 0);
  const average = (key, list, total) => list.reduce((sum, body) => sum + body[key] * body.mass, 0) / total;
  const [centreX, centreY] = [average('x', bodies, mass), average('y', bodies, mass)];
  const [driftX, driftY] = freeMass ? [average('vx', free, freeMass), average('vy', free, freeMass)] : [0, 0];
  for (const body of bodies) {
    Object.assign(body, { x: body.x - centreX, y: body.y - centreY });
    if (!body.pinned) Object.assign(body, { vx: body.vx - driftX, vy: body.vy - driftY });
  }
  return bodies;
}

export const SCENES = {
  starAndPlanets: { name: 'Star and planets', build: (exponent) => centredAtRest(starAndPlanets(exponent)) },
  binaryStars: { name: 'Binary stars', build: (exponent) => centredAtRest(binaryStars(exponent)) },
  figureEight: { name: 'Three-body figure eight (1/r²)', build: figureEight },
  protoplanetaryDisk: { name: 'Protoplanetary disk', build: (exponent) => centredAtRest(protoplanetaryDisk(exponent)) },
  empty: { name: 'Empty space', build: () => [] },
};
