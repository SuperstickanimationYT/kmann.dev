export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const SCALES = {
  majorPentatonic: { label: 'Major pentatonic (always sounds good)', steps: [0, 2, 4, 7, 9] },
  minorPentatonic: { label: 'Minor pentatonic (always sounds good)', steps: [0, 3, 5, 7, 10] },
  hirajoshi: { label: 'Japanese (Hirajoshi)', steps: [0, 2, 3, 7, 8] },
  blues: { label: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  chromatic: { label: 'Chromatic (every note, for experts)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

export const DEFAULT_SCALE = 'majorPentatonic';
const OCTAVE_SPAN = 2;

const degreesOf = (scale) => SCALES[scale].steps;

export const rowCount = (scale) => degreesOf(scale).length * OCTAVE_SPAN + 1;

export function rowSemitone(scale, row) {
  const steps = degreesOf(scale);
  return Math.floor(row / steps.length) * 12 + steps[row % steps.length];
}

export const isTonicRow = (scale, row) => row % degreesOf(scale).length === 0;

export const baseMidi = (song, track) => 12 * (track.octave + 1) + song.key;

export const rowMidi = (song, track, row) => baseMidi(song, track) + rowSemitone(song.scale, row);

export const midiFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export const midiName = (midi) => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

export function chordSemitones(scale, row) {
  if (degreesOf(scale).length >= 12) return [0, 4, 7];
  const root = rowSemitone(scale, row);
  return [0, 2, 4].map((offset) => rowSemitone(scale, row + offset) - root);
}

export function snapRow(row, fromScale, toScale) {
  const target = rowSemitone(fromScale, row);
  let best = 0;
  for (let candidate = 0; candidate < rowCount(toScale); candidate++) {
    if (Math.abs(rowSemitone(toScale, candidate) - target) < Math.abs(rowSemitone(toScale, best) - target)) best = candidate;
  }
  return best;
}

export function pitchHue(song, row) {
  return Math.round(((rowSemitone(song.scale, row) % 12) / 12) * 330);
}
