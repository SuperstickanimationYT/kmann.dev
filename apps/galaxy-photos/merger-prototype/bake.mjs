import { writeFileSync } from 'node:fs';
import { SCENES } from '../../gravity-playground/js/scenes.js';
import { leapfrogStep, STEP_SECONDS } from '../../gravity-playground/js/physics.js';
import { KINDS } from '../../gravity-playground/js/physics.js';

const STARS_EACH = 3000;
const SECONDS = 30;
const SNAPSHOT_EVERY_SECONDS = 0.5;

const law = { exponent: 2, mond: false, darkEnergy: 0, merge: false, galaxyStars: STARS_EACH };
const bodies = SCENES.galaxyMerger.build(law);
const half = bodies.length / 2;
const stars = bodies.map((body, index) => ({ body, galaxy: index < half ? 0 : 1 })).filter(({ body }) => body.kind === KINDS.star);

const stepsPerSnapshot = Math.round(SNAPSHOT_EVERY_SECONDS / STEP_SECONDS);
const snapshots = Math.round(SECONDS / SNAPSHOT_EVERY_SECONDS) + 1;
const floats = new Float32Array(snapshots * stars.length * 4);
for (let snapshot = 0; snapshot < snapshots; snapshot++) {
  stars.forEach(({ body }, index) => floats.set([body.x, body.y, body.vx, body.vy], (snapshot * stars.length + index) * 4));
  for (let step = 0; step < stepsPerSnapshot && snapshot < snapshots - 1; step++) leapfrogStep(bodies, law);
  console.log(`snapshot ${snapshot + 1}/${snapshots}`);
}
const galaxies = Uint8Array.from(stars, ({ galaxy }) => galaxy);
writeFileSync(new URL('./merger.bin', import.meta.url), Buffer.concat([Buffer.from(galaxies.buffer), Buffer.from(floats.buffer)]));
writeFileSync(new URL('./merger.json', import.meta.url), JSON.stringify({ stars: stars.length, snapshots, secondsPerSnapshot: SNAPSHOT_EVERY_SECONDS }));
