export const SCALES = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  blues: [0, 3, 5, 6, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export function rowSemitone(scale, row) {
  const steps = SCALES[scale];
  return Math.floor(row / steps.length) * 12 + steps[row % steps.length];
}

export const rowMidi = (song, track, row) => 12 * (track.octave + 1) + song.key + rowSemitone(song.scale, row);

export const midiFrequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function chordSemitones(scale, row) {
  if (SCALES[scale].length >= 12) return [0, 4, 7];
  const root = rowSemitone(scale, row);
  return [0, 2, 4].map((offset) => rowSemitone(scale, row + offset) - root);
}

export const totalSteps = (song) => song.bars * song.beatsPerBar * song.stepsPerBeat;
export const stepSeconds = (song) => 60 / song.tempo / song.stepsPerBeat;
