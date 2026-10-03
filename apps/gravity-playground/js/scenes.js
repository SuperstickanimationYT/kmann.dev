import { circularVelocity, createBody, INVERSE_SQUARE_STRENGTH, KINDS, pullAt, updatePulls } from './physics.js';

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

export const GALAXY = { stars: 700, diskMass: 840, diskScale: 50, diskCutoff: 0.98, starStirring: 0.1, starSoftening: 24, darkParticles: 500, darkSoftening: 60, haloMass: 4000, haloRadius: 350 };
const MERGER = { darkParticlesEach: 300, separation: 1100, offset: 350, closingSpeed: 160 };

export const CLOUD = { particles: 2000, mass: 1000, radius: 400, spin: 0.5, warmth: 0.3, concentration: 1, smoothingPerSpacing: 1.3 };

function gasCloud() {
  const spin = CLOUD.spin * Math.sqrt((INVERSE_SQUARE_STRENGTH * CLOUD.mass) / CLOUD.radius ** 3);
  const soundSpeed = Math.sqrt((CLOUD.warmth * INVERSE_SQUARE_STRENGTH * CLOUD.mass) / CLOUD.radius);
  const smoothing = CLOUD.smoothingPerSpacing * Math.sqrt((Math.PI * CLOUD.radius ** 2) / CLOUD.particles);
  return Array.from({ length: CLOUD.particles }, () => {
    const { x, y } = pointAt(CLOUD.radius * Math.random() ** CLOUD.concentration, Math.random() * Math.PI * 2);
    const parcel = createBody({ x, y, vx: -spin * y, vy: spin * x, mass: CLOUD.mass / CLOUD.particles, kind: KINDS.gas, softening: smoothing });
    return Object.assign(parcel, { smoothing, soundSpeed });
  });
}

const COSMOS = { particles: 4000, radius: 1500, collapseSeconds: 4, hubblePerCollapse: 1, darkEnergyTakesOverAtSize: 2, seedWaves: 300, seedContrast: 0.5, shortestWaveSpacings: 6, softeningPerSpacing: 0.5 };
const TRUE_2D_GRAVITY = 1;
const collapseRate = 1 / COSMOS.collapseSeconds ** 2;
export const COSMIC_DARK_ENERGY = collapseRate / COSMOS.darkEnergyTakesOverAtSize ** 2;

function seedWaves(spacing) {
  const [longest, shortest] = [2 * COSMOS.radius, COSMOS.shortestWaveSpacings * spacing];
  const contrast = COSMOS.seedContrast * Math.sqrt(2 / COSMOS.seedWaves);
  return Array.from({ length: COSMOS.seedWaves }, () => {
    const wavenumber = (2 * Math.PI) / (longest * (shortest / longest) ** Math.random());
    const heading = Math.random() * Math.PI * 2;
    return { kx: Math.cos(heading) * wavenumber, ky: Math.sin(heading) * wavenumber, phase: Math.random() * Math.PI * 2, reach: contrast / wavenumber };
  });
}

function seedShift(waves, x, y) {
  let [shiftX, shiftY] = [0, 0];
  for (const { kx, ky, phase, reach } of waves) {
    const along = reach * Math.sin(kx * x + ky * y + phase) / Math.hypot(kx, ky);
    shiftX += kx * along;
    shiftY += ky * along;
  }
  return [shiftX, shiftY];
}

function cosmicWeb() {
  const spacing = Math.sqrt((Math.PI * COSMOS.radius ** 2) / COSMOS.particles);
  const mass = (collapseRate * COSMOS.radius) / pullAt(1, COSMOS.radius, TRUE_2D_GRAVITY);
  const hubble = COSMOS.hubblePerCollapse * Math.sqrt(collapseRate);
  const growthRate = Math.sqrt(1 + 2 / COSMOS.hubblePerCollapse ** 2) - 1;
  const softening = COSMOS.softeningPerSpacing * spacing;
  const waves = seedWaves(spacing);
  const grid = [];
  for (let x = -COSMOS.radius; x <= COSMOS.radius; x += spacing) {
    for (let y = -COSMOS.radius; y <= COSMOS.radius; y += spacing) if (Math.hypot(x, y) <= COSMOS.radius) grid.push([x, y]);
  }
  return grid.map(([x, y]) => {
    const [shiftX, shiftY] = seedShift(waves, x, y);
    const [px, py] = [x + shiftX, y + shiftY];
    const [vx, vy] = [hubble * (px + growthRate * shiftX), hubble * (py + growthRate * shiftY)];
    return createBody({ x: px, y: py, vx, vy, mass: mass / grid.length, kind: KINDS.darkMatter, softening });
  });
}

const pointAt = (distance, bearing) => ({ x: Math.cos(bearing) * distance, y: Math.sin(bearing) * distance });

const starSofteningFor = (stars) => GALAXY.starSoftening * Math.sqrt(GALAXY.stars / stars);

function scatterGalaxy({ darkMatter, stars, darkParticles }) {
  const softening = starSofteningFor(stars);
  const disk = Array.from({ length: stars }, () => {
    const distance = -GALAXY.diskScale * Math.log(1 - Math.random() * GALAXY.diskCutoff);
    return createBody({ ...pointAt(distance, Math.random() * Math.PI * 2), mass: GALAXY.diskMass / stars, kind: KINDS.star, softening });
  });
  if (!darkMatter) return disk;
  const halo = Array.from({ length: darkParticles }, () =>
    createBody({ ...pointAt(Math.random() * GALAXY.haloRadius, Math.random() * Math.PI * 2), mass: GALAXY.haloMass / darkParticles, kind: KINDS.darkMatter, softening: GALAXY.darkSoftening }),
  );
  return [...disk, ...halo];
}

function setOrbiting(body, clockwise) {
  const distance = Math.hypot(body.x, body.y);
  const inward = -(body.ax * body.x + body.ay * body.y) / distance;
  const speed = Math.sqrt(Math.max(0, inward * distance));
  if (body.kind === KINDS.darkMatter) {
    const heading = Math.random() * Math.PI * 2;
    Object.assign(body, { vx: Math.cos(heading) * speed, vy: Math.sin(heading) * speed });
    return;
  }
  const turn = clockwise ? -1 : 1;
  const stir = () => (Math.random() - 0.5) * 2 * GALAXY.starStirring * speed;
  Object.assign(body, { vx: (-turn * body.y * speed) / distance + stir(), vy: (turn * body.x * speed) / distance + stir() });
}

function galaxy(law, { darkMatter = true, clockwise = false, stars = GALAXY.stars, darkParticles = GALAXY.darkParticles } = {}) {
  const bodies = scatterGalaxy({ darkMatter, stars, darkParticles });
  updatePulls(bodies, law);
  bodies.forEach((body) => setOrbiting(body, clockwise));
  return bodies;
}

function moved(bodies, { x, y, vx, vy }) {
  for (const body of bodies) Object.assign(body, { x: body.x + x, y: body.y + y, vx: body.vx + vx, vy: body.vy + vy });
  return bodies;
}

function galaxyMerger(law, { darkMatter, stars }) {
  const { darkParticlesEach: darkParticles, separation, offset, closingSpeed } = MERGER;
  const first = galaxy(law, { darkMatter, stars, darkParticles });
  const second = galaxy(law, { darkMatter, stars, darkParticles, clockwise: true });
  return [
    ...moved(first, { x: -separation / 2, y: -offset / 2, vx: closingSpeed / 2, vy: 0 }),
    ...moved(second, { x: separation / 2, y: offset / 2, vx: -closingSpeed / 2, vy: 0 }),
  ];
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
  starAndPlanets: { name: 'Star and planets', build: ({ exponent }) => centredAtRest(starAndPlanets(exponent)) },
  binaryStars: { name: 'Binary stars', build: ({ exponent }) => centredAtRest(binaryStars(exponent)) },
  figureEight: { name: 'Three-body figure eight (1/r²)', build: ({ exponent }) => figureEight(exponent) },
  protoplanetaryDisk: { name: 'Protoplanetary disk', build: ({ exponent }) => centredAtRest(protoplanetaryDisk(exponent)) },
  galaxy: { name: 'Galaxy', build: (settings) => centredAtRest(galaxy(settings, { stars: settings.galaxyStars })) },
  bareGalaxy: { name: 'Galaxy without dark matter', build: (settings) => centredAtRest(galaxy(settings, { darkMatter: false, stars: settings.galaxyStars })) },
  galaxyMerger: { name: 'Galaxy merger', build: (settings) => centredAtRest(galaxyMerger(settings, { darkMatter: true, stars: settings.galaxyStars })) },
  bareGalaxyMerger: { name: 'Galaxy merger without dark matter', build: (settings) => centredAtRest(galaxyMerger(settings, { darkMatter: false, stars: settings.galaxyStars })) },
  gasCloud: { name: 'Collapsing gas cloud', build: () => gasCloud() },
  cosmicWeb: { name: 'Cosmic web', law: { exponent: TRUE_2D_GRAVITY, darkEnergy: COSMIC_DARK_ENERGY }, expands: true, build: () => centredAtRest(cosmicWeb()) },
  empty: { name: 'Empty space', build: () => [] },
};
