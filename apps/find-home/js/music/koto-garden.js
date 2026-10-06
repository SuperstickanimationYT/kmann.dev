import { INSTRUMENTS } from './instruments.js';

const KICK = 0;
const TOM = 1;

const track = (instrument, notes, options = {}) => ({
  kind: instrument === 'drums' ? 'drums' : 'melody',
  instrument,
  octave: INSTRUMENTS[instrument]?.octave ?? 0,
  chords: false,
  volume: 0.8,
  ...options,
  notes: notes.map(([row, step, length = 1]) => ({ row, step, length })),
});

const hits = (row, steps) => steps.map((step) => [row, step]);
const arpeggios = [[0, 3, 5, 6, 7, 6, 5, 3], [1, 3, 5, 7, 8, 7, 5, 3], [2, 4, 5, 7, 9, 7, 5, 4]];

export const KOTO_GARDEN = {
  tempo: 72,
  key: 2,
  scale: 'hirajoshi',
  bars: 4,
  beatsPerBar: 4,
  stepsPerBeat: 2,
  swing: 0,
  reverb: 0.55,
  tracks: [
    track('pluck', [...arpeggios.flatMap((rows, bar) => rows.map((row, step) => [row, bar * 8 + step])), [0, 24], [3, 25], [5, 26], [6, 27], [5, 28, 4]], { octave: 4 }),
    track('flute', [[3, 0, 6], [2, 6, 2], [1, 8, 8], [2, 16, 4], [4, 20, 4], [3, 24, 8]], { volume: 0.55 }),
    track('pad', [[0, 0, 16], [0, 16, 16]], { octave: 2, volume: 0.5 }),
    track('drums', [...hits(KICK, [0, 16]), ...hits(TOM, [0, 7, 16, 22, 23])], { volume: 0.6 }),
  ],
};
