import { KINDS, leapfrogStep, STEP_SECONDS } from '../../../gravity-playground/js/physics.js';
import { SCENES } from '../../../gravity-playground/js/scenes.js';
import { createRandom } from '../random.js';
import { buildStarField, heightCalibration } from './density.js';
import { MERGER_SIMULATION } from './timeline.js';

const STEPS_BETWEEN_YIELDS = 6;

Math.random = createRandom(MERGER_SIMULATION.seed).next;

const law = { exponent: 2, mond: false, darkEnergy: 0, merge: false, galaxyStars: MERGER_SIMULATION.starsEach };
const bodies = SCENES.galaxyMerger.build(law);
const half = bodies.length / 2;
const tracked = bodies.map((body, index) => ({ body, galaxy: index < half ? 0 : 1 })).filter(({ body }) => body.kind === KINDS.star);
const galaxies = Uint8Array.from(tracked, ({ galaxy }) => galaxy);
const snapshots = [];
let kpcPerRoughHeight = 0;

function takeSnapshot() {
  const stars = new Float32Array(tracked.length * 4);
  tracked.forEach(({ body }, index) => stars.set([body.x, body.y, body.vx, body.vy], index * 4));
  snapshots.push(stars);
  if (snapshots.length === 1) kpcPerRoughHeight = heightCalibration(stars, galaxies);
  self.postMessage({ type: 'progress', ready: snapshots.length });
}

const unthrottledYield = new MessageChannel();
const breather = () =>
  new Promise((resolve) => {
    unthrottledYield.port1.onmessage = resolve;
    unthrottledYield.port2.postMessage(null);
  });

async function simulate() {
  const stepsPerSnapshot = Math.round(MERGER_SIMULATION.secondsPerSnapshot / STEP_SECONDS);
  takeSnapshot();
  while (snapshots.length < MERGER_SIMULATION.snapshots) {
    for (let step = 1; step <= stepsPerSnapshot; step++) {
      leapfrogStep(bodies, law);
      if (step % STEPS_BETWEEN_YIELDS === 0) await breather();
    }
    takeSnapshot();
  }
}

self.addEventListener('message', ({ data }) => {
  if (data.type !== 'field') return;
  const index = Math.min(data.index, snapshots.length - 1);
  const field = buildStarField(snapshots[index], galaxies, kpcPerRoughHeight);
  self.postMessage({ type: 'field', request: data.request, index, field }, [field.light.buffer, field.members.buffer]);
});

simulate();
