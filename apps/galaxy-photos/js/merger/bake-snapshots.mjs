import { writeFileSync } from 'node:fs';
import { KINDS, leapfrogStep, STEP_SECONDS } from '../../../gravity-playground/js/physics.js';
import { SCENES } from '../../../gravity-playground/js/scenes.js';
import { createRandom } from '../random.js';
import { centredOnCores } from './density.js';
import { encodeSnapshots } from './snapshot-file.js';
import { MERGER_SIMULATION, SNAPSHOT_FILE_URL } from './timeline.js';

Math.random = createRandom(MERGER_SIMULATION.seed).next;

function spinTheOtherWay(galaxy) {
  const mass = galaxy.reduce((sum, body) => sum + body.mass, 0);
  const driftX = galaxy.reduce((sum, body) => sum + body.vx * body.mass, 0) / mass;
  const driftY = galaxy.reduce((sum, body) => sum + body.vy * body.mass, 0) / mass;
  for (const body of galaxy) Object.assign(body, { vx: 2 * driftX - body.vx, vy: 2 * driftY - body.vy });
}

const law = { exponent: 2, mond: false, darkEnergy: 0, merge: false, galaxyStars: MERGER_SIMULATION.starsEach };
const bodies = SCENES.galaxyMerger.build(law);
const half = bodies.length / 2;
spinTheOtherWay(bodies.slice(half));
const tracked = bodies.map((body, index) => ({ body, galaxy: index < half ? 0 : 1 })).filter(({ body }) => body.kind === KINDS.star);
const galaxies = Uint8Array.from(tracked, ({ galaxy }) => galaxy);
const stepsPerSnapshot = Math.round(MERGER_SIMULATION.secondsPerSnapshot / STEP_SECONDS);

const snapshots = [];
for (let snapshot = 0; snapshot < MERGER_SIMULATION.snapshots; snapshot++) {
  if (snapshot > 0) for (let step = 0; step < stepsPerSnapshot; step++) leapfrogStep(bodies, law);
  const stars = new Float32Array(tracked.length * 4);
  tracked.forEach(({ body }, index) => stars.set([body.x, body.y, body.vx, body.vy], index * 4));
  snapshots.push(centredOnCores(stars, galaxies));
  process.stdout.write(`\rsnapshot ${snapshot + 1} of ${MERGER_SIMULATION.snapshots}`);
}

const bytes = encodeSnapshots(galaxies, snapshots);
writeFileSync(new URL(SNAPSHOT_FILE_URL, import.meta.url), bytes);
console.log(`\nwrote ${(bytes.length / 1e6).toFixed(1)} MB`);
