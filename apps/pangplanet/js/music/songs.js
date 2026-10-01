import { INSTRUMENTS } from './instruments.js';

const KICK = 0;
const TOM = 1;
const SNARE = 2;
const CLAP = 3;
const HAT = 4;
const OPEN_HAT = 5;
const CRASH = 6;

function song(settings, ...tracks) {
  return { swing: 0, reverb: 0.25, beatsPerBar: 4, stepsPerBeat: 4, ...settings, tracks };
}

function track(instrument, notes, options = {}) {
  const kind = instrument === 'drums' ? 'drums' : 'melody';
  return {
    kind,
    instrument,
    octave: INSTRUMENTS[instrument]?.octave ?? 0,
    chords: false,
    volume: 0.8,
    ...options,
    notes: notes.map(([row, step, length = 1]) => ({ row, step, length })),
  };
}

const hits = (row, steps, length = 1) => steps.map((step) => [row, step, length]);
const spaced = (from, to, gap) => Array.from({ length: Math.ceil((to - from) / gap) }, (_, i) => from + i * gap);
const eachBar = (bars, barLength, pattern) => Array.from({ length: bars }, (_, bar) => pattern(bar).map(([row, step, length]) => [row, bar * barLength + step, length])).flat();
const perBar = (roots, barLength, shape) => eachBar(roots.length, barLength, (bar) => shape(roots[bar]));

const drift = song(
  { tempo: 64, key: 2, scale: 'minorPentatonic', bars: 8, stepsPerBeat: 2, reverb: 0.6 },
  track('pad', [[0, 0, 16], [4, 16, 16], [2, 32, 16], [3, 48, 16]], { chords: true, volume: 0.72 }),
  track('bell', [[5, 0, 4], [7, 6, 2], [8, 8, 8], [6, 20, 4], [5, 24, 8], [4, 36, 4], [5, 40, 6], [3, 48, 4], [4, 52, 4], [5, 56, 8]], { octave: 4, volume: 0.51 }),
  track('flute', [[3, 34, 6], [2, 40, 4], [1, 44, 4], [0, 48, 12]], { volume: 0.43 }),
);

const starlightRoots = [0, 4, 3, 1, 0, 4, 3, 2];
const starlight = song(
  { tempo: 70, key: 7, scale: 'majorPentatonic', bars: 8, stepsPerBeat: 2, reverb: 0.55 },
  track('pluck', perBar(starlightRoots, 8, (root) => [0, 2, 4, 5, 4, 2, 1, 2].map((offset, step) => [root + offset, step])), { volume: 0.65 }),
  track('pad', perBar(starlightRoots, 8, (root) => [[root, 0, 8]]), { chords: true, volume: 0.51 }),
  track('flute', [[4, 16, 6], [3, 22, 2], [2, 24, 8], [1, 32, 4], [2, 36, 4], [4, 40, 8], [3, 48, 6], [2, 54, 2], [0, 56, 8]], { octave: 4, volume: 0.43 }),
);

const nebula = song(
  { tempo: 60, key: 9, scale: 'hirajoshi', bars: 8, stepsPerBeat: 2, reverb: 0.7 },
  track('pad', [[0, 0, 32], [0, 32, 32]], { octave: 2, volume: 0.65 }),
  track('bell', [[5, 0, 6], [7, 8, 4], [8, 12, 8], [7, 24, 4], [6, 28, 4], [5, 32, 8], [3, 44, 4], [4, 48, 6], [3, 56, 8]], { octave: 4, volume: 0.51 }),
  track('pluck', [8, 24, 40, 56].flatMap((bar) => [0, 3, 5, 3].map((row, i) => [row, bar + i * 2, 2])), { volume: 0.43 }),
);

export const AMBIENT_SONGS = [drift, starlight, nebula];

const liftOffRoots = [0, 4, 3, 0];
const liftOff = song(
  { tempo: 120, key: 0, scale: 'majorPentatonic', bars: 4, reverb: 0.3 },
  track('lead', [
    [0, 0, 2], [1, 2, 2], [2, 4, 2], [3, 6, 2], [4, 8, 2], [5, 10, 2], [6, 12, 2], [7, 14, 2],
    [8, 16, 6], [7, 22, 2], [8, 24, 4], [9, 28, 4],
    [10, 32, 6], [9, 38, 2], [8, 40, 4], [7, 44, 4],
    [8, 48, 4], [9, 52, 4], [10, 56, 8],
  ], { volume: 0.6 }),
  track('pad', perBar(liftOffRoots, 16, (root) => [[root, 0, 16]]), { chords: true, volume: 0.5 }),
  track('bass', perBar(liftOffRoots, 16, (root) => spaced(0, 16, 2).map((step) => [step % 8 === 6 ? root + 5 : root, step, 2]))),
  track('drums', [
    ...hits(KICK, [0, 4, 8, 12]), ...hits(HAT, spaced(0, 16, 2)),
    [CRASH, 16], ...eachBar(2, 16, () => [...hits(KICK, [0, 8, 10]), ...hits(SNARE, [4, 12]), ...hits(HAT, spaced(0, 16, 2))]).map(([row, step]) => [row, step + 16]),
    [CRASH, 48], ...hits(KICK, [48, 56]), ...hits(SNARE, [52, 58, 60, 62]),
  ], { volume: 0.7 }),
);

const moonLanding = song(
  { tempo: 84, key: 5, scale: 'majorPentatonic', bars: 4, stepsPerBeat: 2, reverb: 0.5 },
  track('bell', [[5, 0, 2], [7, 2, 2], [8, 4, 4], [7, 8, 2], [6, 10, 2], [5, 12, 4], [4, 16, 2], [5, 18, 2], [7, 20, 4], [8, 24, 2], [9, 26, 2], [10, 28, 4]], { octave: 4, volume: 0.8 }),
  track('pad', [[0, 0, 8], [3, 8, 8], [4, 16, 8], [0, 24, 8]], { chords: true, volume: 0.6 }),
  track('bass', [[0, 0, 8], [3, 8, 8], [4, 16, 8], [0, 24, 8]], { volume: 0.65 }),
);

const sunRoots = [0, 4, 3, 0];
const reachSun = song(
  { tempo: 96, key: 2, scale: 'major', bars: 4, stepsPerBeat: 2, reverb: 0.4 },
  track('flute', [[9, 0, 3], [8, 3], [7, 4, 4], [8, 8, 2], [9, 10, 2], [11, 12, 4], [10, 16, 3], [9, 19], [8, 20, 2], [10, 22, 2], [11, 24, 2], [9, 26, 2], [7, 28, 4]], { octave: 4, volume: 0.55 }),
  track('piano', perBar(sunRoots, 8, (root) => [[root, 0, 3], [root, 3, 3], [root, 6, 2]]), { chords: true, octave: 3, volume: 0.5 }),
  track('bass', perBar(sunRoots, 8, (root) => [[root, 0, 8]]), { volume: 0.6 }),
  track('bell', [[7, 0, 2], [11, 8, 2], [10, 16, 2], [14, 24, 8]], { volume: 0.3 }),
  track('drums', [[CRASH, 0], ...eachBar(4, 8, () => [...hits(KICK, [0, 4]), ...hits(HAT, [1, 3, 5, 7])])], { volume: 0.55 }),
);

const otherStarRoots = [0, 4, 3, 1];
const otherStar = song(
  { tempo: 108, key: 4, scale: 'majorPentatonic', bars: 4, reverb: 0.35 },
  track('lead', [[5, 0, 6], [7, 6, 2], [8, 8, 8], [7, 16, 4], [9, 20, 4], [8, 24, 8], [6, 32, 6], [5, 38, 2], [6, 40, 4], [8, 44, 4], [10, 48, 16]], { volume: 0.55 }),
  track('pluck', perBar(otherStarRoots, 16, (root) => spaced(0, 16, 1).map((step) => [root + [0, 2, 4, 5][step % 4], step])), { volume: 0.4 }),
  track('bass', perBar(otherStarRoots, 16, (root) => [[root, 0, 6], [root, 6, 2], [root + 5, 8, 4], [root, 12, 4]])),
  track('drums', [[CRASH, 0], ...eachBar(4, 16, () => [...hits(KICK, [0, 8, 10]), ...hits(SNARE, [4, 12]), ...hits(HAT, spaced(0, 16, 2))])], { volume: 0.65 }),
);

const leviathanRoots = [0, 5, 6, 0];
const leviathan = song(
  { tempo: 60, key: 2, scale: 'minor', bars: 4, stepsPerBeat: 2, reverb: 0.65 },
  track('lead', [[7, 0, 4], [9, 4, 4], [8, 8, 4], [7, 12, 4], [6, 16, 6], [8, 22, 2], [7, 24, 8]], { volume: 0.45 }),
  track('pad', perBar(leviathanRoots, 8, (root) => [[root, 0, 8]]), { chords: true, volume: 0.55 }),
  track('bass', perBar(leviathanRoots, 8, (root) => [[root, 0, 8]]), { volume: 0.7 }),
  track('drums', [...hits(TOM, [0, 6, 8, 16, 22, 24]), ...hits(KICK, [0, 8, 16, 24])], { volume: 0.7 }),
);

const sunnyLoop = song(
  { tempo: 100, key: 0, scale: 'majorPentatonic', bars: 2, swing: 0.2, reverb: 0.3 },
  track('marimba', [[7, 0, 2], [5, 2, 2], [4, 4, 2], [5, 6, 2], [7, 8, 3], [8, 11, 1], [7, 12, 4], [5, 16, 2], [4, 18, 2], [3, 20, 2], [4, 22, 2], [5, 24, 6], [3, 30, 2]]),
  track('pad', [[0, 0, 8], [4, 8, 8], [1, 16, 8], [3, 24, 8]], { chords: true, volume: 0.6 }),
  track('bass', [[0, 0, 4], [5, 6, 2], [4, 8, 4], [4, 14, 2], [1, 16, 4], [6, 22, 2], [3, 24, 4], [3, 30, 2]]),
  track('drums', [...hits(KICK, [0, 6, 10, 16, 22, 26]), ...hits(SNARE, [4, 12, 20, 28]), ...hits(HAT, spaced(0, 30, 2)), [OPEN_HAT, 30]], { volume: 0.7 }),
);

const kotoArpeggios = [[0, 3, 5, 6, 7, 6, 5, 3], [1, 3, 5, 7, 8, 7, 5, 3], [2, 4, 5, 7, 9, 7, 5, 4]];
const kotoGarden = song(
  { tempo: 72, key: 2, scale: 'hirajoshi', bars: 4, stepsPerBeat: 2, reverb: 0.55 },
  track('pluck', [...kotoArpeggios.flatMap((rows, bar) => rows.map((row, step) => [row, bar * 8 + step])), [0, 24], [3, 25], [5, 26], [6, 27], [5, 28, 4]], { octave: 4 }),
  track('flute', [[3, 0, 6], [2, 6, 2], [1, 8, 8], [2, 16, 4], [4, 20, 4], [3, 24, 8]], { volume: 0.55 }),
  track('pad', [[0, 0, 16], [0, 16, 16]], { octave: 2, volume: 0.5 }),
  track('drums', [...hits(KICK, [0, 16]), ...hits(TOM, [0, 7, 16, 22, 23])], { volume: 0.6 }),
);

const nightDriveRoots = [0, 1, 4, 3];
const nightDrive = song(
  { tempo: 92, key: 9, scale: 'minorPentatonic', bars: 4, reverb: 0.35 },
  track('lead', [
    [5, 0, 3], [6, 3, 3], [7, 6, 2], [8, 8, 6], [7, 14, 2],
    [6, 16, 3], [5, 19, 3], [4, 22, 2], [5, 24, 8],
    [5, 32, 3], [6, 35, 3], [7, 38, 2], [9, 40, 4], [8, 44, 2], [7, 46, 2],
    [8, 48, 3], [7, 51, 3], [6, 54, 2], [5, 56, 8],
  ], { volume: 0.7 }),
  track('pad', perBar(nightDriveRoots, 16, (root) => [[root, 0, 16]]), { chords: true, volume: 0.45 }),
  track('bass', perBar(nightDriveRoots, 16, (root) => spaced(0, 16, 2).map((step) => [step % 8 === 6 ? root + 5 : root, step, 2]))),
  track('drums', [[CRASH, 0], ...eachBar(4, 16, () => [...hits(KICK, [0, 10]), ...hits(CLAP, [4, 12]), ...hits(HAT, spaced(0, 14, 1)), [OPEN_HAT, 14]])], { volume: 0.65 }),
);

const islandRoots = [0, 4, 3, 0];
const dwarfGalaxy = song(
  { tempo: 100, key: 7, scale: 'majorPentatonic', bars: 4, reverb: 0.45 },
  track('marimba', [
    [5, 0, 2], [7, 2, 2], [8, 4, 2], [7, 6, 2], [5, 8, 4], [4, 12, 4],
    [3, 16, 2], [4, 18, 2], [5, 20, 4], [7, 24, 8],
    [8, 32, 2], [9, 34, 2], [10, 36, 4], [9, 40, 2], [8, 42, 2], [7, 44, 4],
    [8, 48, 4], [7, 52, 2], [6, 54, 2], [5, 56, 8],
  ]),
  track('bell', [[10, 0, 4], [9, 16, 4], [10, 32, 4], [10, 56, 8]], { octave: 4, volume: 0.3 }),
  track('pad', perBar(islandRoots, 16, (root) => [[root, 0, 16]]), { chords: true, volume: 0.45 }),
  track('bass', perBar(islandRoots, 16, (root) => [[root, 0, 8], [root, 8, 8]]), { volume: 0.6 }),
  track('drums', [[CRASH, 0], ...eachBar(4, 16, () => [...hits(KICK, [0, 8]), ...hits(HAT, [2, 6, 10, 14]), ...hits(CLAP, [4, 12])])], { volume: 0.5 }),
);

export const MILESTONE_SONGS = {
  liftOff: { song: liftOff },
  moonLanding: { song: moonLanding },
  reachSun: { song: reachSun },
  otherStar: { song: otherStar },
  aliens: { song: sunnyLoop, loops: 3 },
  leviathan: { song: leviathan },
  galacticCore: { song: kotoGarden },
  leftGalaxy: { song: nightDrive, loops: 2 },
  dwarfGalaxy: { song: dwarfGalaxy },
};
