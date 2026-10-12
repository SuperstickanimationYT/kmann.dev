import { buildGeography } from './geography.js';
import { columnOf, rowOf } from './grid.js';
import { createModel, STEP_SECONDS } from './model.js';
import { createTracker } from './storms.js';

const HOUR = 3600;
const DAY = 24 * HOUR;
const TRACK_EVERY_SECONDS = 3 * HOUR;
const BUSY_MS = 40;
const WAVE_EVERY_DAYS = { least: 2, most: 4 };
const WAVE_ORIGIN = { lon: -24, lat: 9, spreadLon: 3, spreadLat: 5 };

const SEEDS = {
  disturbance: { depth: 30, radius: 220_000, moisture: 0.12 },
  hurricane: { depth: 420, radius: 110_000, moisture: 0.25 },
};

const geography = buildGeography();
const model = createModel(geography);
const tracker = createTracker();
const clock = { seconds: 0, nextTrack: 0, nextWave: 0, waves: true };

const randomBetween = (low, high) => low + Math.random() * (high - low);
const seed = (kind, lon, lat) => model.addVortex(columnOf(lon), rowOf(lat), SEEDS[kind]);

const SCENARIOS = {
  waves: () => seed('disturbance', -30, 11),
  pair: () => {
    seed('hurricane', -58, 20);
    seed('hurricane', -53.5, 21.5);
  },
  busy: () => {
    seed('disturbance', -30, 11);
    seed('disturbance', -45, 13);
    seed('disturbance', -62, 15);
    seed('disturbance', -86, 24);
  },
  calm: () => {},
};

function scheduleWave() {
  clock.nextWave = clock.seconds + randomBetween(WAVE_EVERY_DAYS.least, WAVE_EVERY_DAYS.most) * DAY;
}

function start(scenario) {
  model.reset();
  tracker.clear();
  Object.assign(clock, { seconds: 0, nextTrack: 0 });
  scheduleWave();
  SCENARIOS[scenario]();
}

function advance(seconds) {
  const deadline = performance.now() + BUSY_MS;
  let done = 0;
  while (done + STEP_SECONDS <= seconds && performance.now() < deadline) {
    model.step();
    clock.seconds += STEP_SECONDS;
    done += STEP_SECONDS;
    if (clock.seconds >= clock.nextTrack) {
      tracker.update(model, clock.seconds);
      clock.nextTrack = clock.seconds + TRACK_EVERY_SECONDS;
    }
    if (clock.waves && clock.seconds >= clock.nextWave) {
      seed('disturbance', WAVE_ORIGIN.lon + randomBetween(-WAVE_ORIGIN.spreadLon, WAVE_ORIGIN.spreadLon), WAVE_ORIGIN.lat + randomBetween(0, WAVE_ORIGIN.spreadLat));
      scheduleWave();
    }
  }
  return done;
}

function sendFrame(advanced) {
  model.measureWind();
  const showing = new Set(tracker.showing());
  const frame = {
    type: 'frame',
    seconds: clock.seconds,
    advanced,
    h: Float32Array.from(model.h),
    q: Float32Array.from(model.q),
    speed: Float32Array.from(model.speed),
    storms: tracker.storms.map((storm) => ({ ...storm, showing: showing.has(storm) })),
  };
  self.postMessage(frame, [frame.h.buffer, frame.q.buffer, frame.speed.buffer]);
}

const COMMANDS = {
  start: ({ scenario }) => start(scenario),
  seed: ({ kind, column, row }) => model.addVortex(column, row, SEEDS[kind]),
  warming: ({ degrees }) => model.setWarming(degrees),
  steering: ({ share }) => model.setSteering(share),
  waves: ({ on }) => {
    clock.waves = on;
    if (on) scheduleWave();
  },
  clearGone: () => tracker.clearGone(),
  advance: ({ seconds }) => sendFrame(advance(seconds)),
};

self.onmessage = ({ data }) => COMMANDS[data.type](data);

start('waves');
self.postMessage({ type: 'ready', land: geography.land, seaTemperature: Float32Array.from(geography.seaTemperature) });
