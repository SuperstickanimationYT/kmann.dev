import { newTrack } from './song.js';

const KICK = 0;
const TOM = 1;
const SNARE = 2;
const CLAP = 3;
const HAT = 4;
const OPEN_HAT = 5;
const CRASH = 6;

function song(settings) {
  return { swing: 0, reverb: 0.25, beatsPerBar: 4, stepsPerBeat: 4, ...settings, tracks: [] };
}

function addTrack(target, kind, instrument, notes, options = {}) {
  const track = Object.assign(newTrack(target, kind, instrument), options);
  track.notes = notes.map(([row, step, length = 1]) => ({ row, step, length }));
  target.tracks.push(track);
}

const hits = (row, steps, length = 1) => steps.map((step) => [row, step, length]);
const spaced = (from, to, gap) => Array.from({ length: Math.ceil((to - from) / gap) }, (_, i) => from + i * gap);
const eachBar = (bars, barLength, pattern) => Array.from({ length: bars }, (_, bar) => pattern(bar).map(([row, step, length]) => [row, bar * barLength + step, length])).flat();

function sunnyLoop() {
  const target = song({ name: 'Sunny loop', tempo: 100, key: 0, scale: 'majorPentatonic', bars: 2, swing: 0.2, reverb: 0.3 });
  addTrack(target, 'melody', 'marimba', [[7, 0, 2], [5, 2, 2], [4, 4, 2], [5, 6, 2], [7, 8, 3], [8, 11, 1], [7, 12, 4], [5, 16, 2], [4, 18, 2], [3, 20, 2], [4, 22, 2], [5, 24, 6], [3, 30, 2]]);
  addTrack(target, 'melody', 'pad', [[0, 0, 8], [4, 8, 8], [1, 16, 8], [3, 24, 8]], { name: 'Chords', chords: true, volume: 0.6 });
  addTrack(target, 'melody', 'bass', [[0, 0, 4], [5, 6, 2], [4, 8, 4], [4, 14, 2], [1, 16, 4], [6, 22, 2], [3, 24, 4], [3, 30, 2]]);
  addTrack(target, 'drums', 'piano', [...hits(KICK, [0, 6, 10, 16, 22, 26]), ...hits(SNARE, [4, 12, 20, 28]), ...hits(HAT, spaced(0, 30, 2)), [OPEN_HAT, 30]], { volume: 0.7 });
  return target;
}

function nightDrive() {
  const target = song({ name: 'Night drive', tempo: 92, key: 9, scale: 'minorPentatonic', bars: 4, reverb: 0.35 });
  const roots = [0, 1, 4, 3];
  addTrack(target, 'melody', 'lead', [
    [5, 0, 3], [6, 3, 3], [7, 6, 2], [8, 8, 6], [7, 14, 2],
    [6, 16, 3], [5, 19, 3], [4, 22, 2], [5, 24, 8],
    [5, 32, 3], [6, 35, 3], [7, 38, 2], [9, 40, 4], [8, 44, 2], [7, 46, 2],
    [8, 48, 3], [7, 51, 3], [6, 54, 2], [5, 56, 8],
  ], { volume: 0.7 });
  addTrack(target, 'melody', 'pad', roots.map((root, bar) => [root, bar * 16, 16]), { name: 'Chords', chords: true, volume: 0.45 });
  addTrack(target, 'melody', 'bass', eachBar(4, 16, (bar) => spaced(0, 16, 2).map((step) => [step % 8 === 6 ? roots[bar] + 5 : roots[bar], step, 2])));
  addTrack(target, 'drums', 'piano', [[CRASH, 0], ...eachBar(4, 16, () => [...hits(KICK, [0, 10]), ...hits(CLAP, [4, 12]), ...hits(HAT, spaced(0, 14, 1)), [OPEN_HAT, 14]])], { volume: 0.65 });
  return target;
}

function bellWaltz() {
  const target = song({ name: 'Bell waltz', tempo: 132, key: 5, scale: 'major', bars: 4, beatsPerBar: 3, stepsPerBeat: 2, reverb: 0.45 });
  const roots = [0, 3, 4, 0];
  addTrack(target, 'melody', 'bell', [[4, 0, 2], [7, 2, 2], [6, 4, 2], [5, 6, 4], [4, 10, 2], [3, 12, 2], [5, 14, 2], [4, 16, 2], [2, 18, 2], [1, 20, 2], [0, 22, 2]], { octave: 4 });
  addTrack(target, 'melody', 'piano', eachBar(4, 6, (bar) => [[roots[bar], 2, 2], [roots[bar], 4, 2]]), { name: 'Chords', chords: true, octave: 3, volume: 0.5 });
  addTrack(target, 'melody', 'bass', eachBar(4, 6, (bar) => [[roots[bar], 0, 2]]), { volume: 0.7 });
  return target;
}

function chiptuneQuest() {
  const target = song({ name: 'Chiptune quest', tempo: 150, key: 7, scale: 'majorPentatonic', bars: 2, reverb: 0.1 });
  const roots = [0, 4, 3, 0];
  addTrack(target, 'melody', 'chip', [
    [5, 0], [7, 1], [8, 2, 2], [7, 4], [8, 5], [10, 6, 2], [9, 8, 2], [8, 10], [7, 11], [8, 12, 4],
    [5, 16], [7, 17], [8, 18, 2], [9, 20, 2], [8, 22], [7, 23], [6, 24, 2], [5, 26, 2], [3, 28, 2], [5, 30, 2],
  ], { name: 'Hero theme' });
  addTrack(target, 'melody', 'chip', eachBar(4, 8, (half) => [0, 2, 4, 6].map((step) => [step % 4 ? roots[half] + 5 : roots[half], step])), { name: '8-bit bass', octave: 2, volume: 0.7 });
  addTrack(target, 'drums', 'piano', eachBar(2, 16, (bar) => [...hits(KICK, bar ? [0, 8, 14] : [0, 8]), ...hits(SNARE, [4, 12]), ...hits(HAT, spaced(0, 16, 2))]), { volume: 0.7 });
  return target;
}

function rainyBlues() {
  const target = song({ name: 'Rainy blues', tempo: 76, key: 4, scale: 'blues', bars: 4, stepsPerBeat: 3, reverb: 0.3 });
  const shuffle = [0, 2, 3, 5, 6, 8, 9, 11];
  const riffs = [[0, 0, 1, 1, 2, 2, 1, 1], [2, 2, 5, 5, 6, 6, 5, 5], [0, 0, 1, 1, 2, 2, 1, 1], [4, 4, 5, 5, 6, 6, 5, 5]];
  addTrack(target, 'melody', 'piano', [
    [7, 0, 2], [8, 2], [7, 3, 2], [6, 5], [5, 6, 4], [6, 10, 2],
    [9, 12], [10, 13], [11, 14, 4], [10, 18, 2], [8, 20], [7, 21, 3],
    [7, 24, 2], [8, 26], [7, 27, 2], [6, 29], [5, 30, 3], [3, 33, 2], [2, 35],
    [1, 36, 2], [0, 38], [2, 39, 3], [0, 42, 6],
  ]);
  addTrack(target, 'melody', 'bass', eachBar(4, 12, (bar) => shuffle.map((step, i) => [riffs[bar][i], step, i % 2 ? 1 : 2])), { name: 'Boogie bass' });
  addTrack(target, 'drums', 'piano', eachBar(4, 12, () => [...hits(KICK, [0, 6]), ...hits(SNARE, [3, 9]), ...hits(HAT, shuffle)]), { volume: 0.6 });
  return target;
}

function kotoGarden() {
  const target = song({ name: 'Koto garden', tempo: 72, key: 2, scale: 'hirajoshi', bars: 4, stepsPerBeat: 2, reverb: 0.55 });
  const arpeggios = [[0, 3, 5, 6, 7, 6, 5, 3], [1, 3, 5, 7, 8, 7, 5, 3], [2, 4, 5, 7, 9, 7, 5, 4]];
  addTrack(target, 'melody', 'pluck', [
    ...arpeggios.flatMap((rows, bar) => rows.map((row, step) => [row, bar * 8 + step])),
    [0, 24], [3, 25], [5, 26], [6, 27], [5, 28, 4],
  ], { name: 'Koto', octave: 4 });
  addTrack(target, 'melody', 'flute', [[3, 0, 6], [2, 6, 2], [1, 8, 8], [2, 16, 4], [4, 20, 4], [3, 24, 8]], { volume: 0.55 });
  addTrack(target, 'melody', 'pad', [[0, 0, 16], [0, 16, 16]], { name: 'Drone', octave: 2, volume: 0.5 });
  addTrack(target, 'drums', 'piano', [...hits(KICK, [0, 16]), ...hits(TOM, [0, 7, 16, 22, 23])], { name: 'Taiko', volume: 0.6 });
  return target;
}

export const DEMOS = [
  { name: 'Sunny loop', build: sunnyLoop },
  { name: 'Night drive', build: nightDrive },
  { name: 'Chiptune quest', build: chiptuneQuest },
  { name: 'Rainy blues', build: rainyBlues },
  { name: 'Bell waltz', build: bellWaltz },
  { name: 'Koto garden', build: kotoGarden },
];
