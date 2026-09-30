import { DRUMS } from './drums.js';
import { rowCount, snapRow } from './music.js';
import { totalSteps } from './song.js';

function withoutClashes(notes) {
  const seen = new Set();
  return notes
    .sort((a, b) => a.step - b.step)
    .filter((note) => {
      const key = `${note.row}:${note.step}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function fitLengths(song, notes) {
  const steps = totalSteps(song);
  for (const note of notes) {
    const next = notes.filter((other) => other.row === note.row && other.step > note.step).map((other) => other.step);
    note.length = Math.max(1, Math.min(note.length, steps - note.step, ...next.map((step) => step - note.step)));
  }
  return notes;
}

function eachTrack(song, reshape) {
  for (const track of song.tracks) track.notes = fitLengths(song, withoutClashes(reshape(track).filter((note) => note.step < totalSteps(song))));
}

export function setScale(song, scale) {
  const from = song.scale;
  song.scale = scale;
  eachTrack(song, (track) => (track.kind === 'drums' ? track.notes : track.notes.map((note) => ({ ...note, row: snapRow(note.row, from, scale) }))));
}

export function setBars(song, bars) {
  const oldSteps = totalSteps(song);
  song.bars = bars;
  const copies = Math.ceil(totalSteps(song) / oldSteps);
  eachTrack(song, (track) => Array.from({ length: copies }, (_, copy) => track.notes.map((note) => ({ ...note, step: note.step + copy * oldSteps }))).flat());
}

export function setStepsPerBeat(song, stepsPerBeat) {
  const scale = stepsPerBeat / song.stepsPerBeat;
  song.stepsPerBeat = stepsPerBeat;
  eachTrack(song, (track) => track.notes.map((note) => ({ ...note, step: Math.round(note.step * scale), length: Math.max(1, Math.round(note.length * scale)) })));
}

export function setBeatsPerBar(song, beatsPerBar) {
  const oldBar = song.beatsPerBar * song.stepsPerBeat;
  song.beatsPerBar = beatsPerBar;
  const newBar = beatsPerBar * song.stepsPerBeat;
  eachTrack(song, (track) =>
    track.notes
      .filter((note) => note.step % oldBar < newBar)
      .map((note) => ({ ...note, step: Math.floor(note.step / oldBar) * newBar + (note.step % oldBar) })),
  );
}

const pick = (items) => items[Math.floor(Math.random() * items.length)];
const chance = (probability) => Math.random() < probability;

function surpriseDrums(song) {
  const beat = song.stepsPerBeat;
  const bar = song.beatsPerBar * beat;
  const kick = DRUMS.findIndex((drum) => drum.label === 'Kick');
  const snare = DRUMS.findIndex((drum) => drum.label === (chance(0.5) ? 'Snare' : 'Clap'));
  const hat = DRUMS.findIndex((drum) => drum.label === 'Hi-hat');
  const hatEvery = chance(0.5) ? 1 : Math.max(1, Math.floor(beat / 2));
  const notes = [];
  for (let step = 0; step < totalSteps(song); step++) {
    const inBar = step % bar;
    const onBeat = inBar % beat === 0;
    const beatNumber = inBar / beat;
    if (onBeat && (beatNumber === 0 || (song.beatsPerBar === 4 && beatNumber === 2))) notes.push({ row: kick, step, length: 1 });
    else if (!onBeat && chance(0.12)) notes.push({ row: kick, step, length: 1 });
    if (onBeat && beatNumber % 2 === 1) notes.push({ row: snare, step, length: 1 });
    if (step % hatEvery === 0 && chance(0.9)) notes.push({ row: hat, step, length: 1 });
  }
  return notes;
}

function surpriseChords(song) {
  const span = Math.floor(rowCount(song.scale) / 2);
  const hold = song.stepsPerBeat * Math.min(song.beatsPerBar, 2);
  const roots = [0, ...Array.from({ length: 3 }, () => Math.floor(Math.random() * span))];
  const notes = [];
  for (let step = 0, i = 0; step < totalSteps(song); step += hold, i++) notes.push({ row: roots[i % roots.length], step, length: hold });
  return notes;
}

function surpriseMelody(song, low) {
  const rows = rowCount(song.scale);
  const tonics = [0, (rows - 1) / 2, rows - 1];
  const beat = song.stepsPerBeat;
  const unit = beat === 4 ? 2 : 1;
  const top = low ? Math.floor(rows / 2) : rows - 1;
  let row = low ? 0 : Math.floor(rows / 2);
  const notes = [];
  for (let step = 0; step < totalSteps(song); step += unit) {
    if (!chance(low ? 0.45 : 0.7)) continue;
    row = Math.max(0, Math.min(top, row + pick([-2, -1, -1, 0, 1, 1, 2])));
    notes.push({ row, step, length: chance(0.25) ? unit * 2 : unit });
  }
  const last = notes.at(-1);
  if (last) last.row = tonics.reduce((best, tonic) => (Math.abs(tonic - last.row) < Math.abs(best - last.row) && tonic <= top ? tonic : best), 0);
  return notes;
}

export function surprise(song, track) {
  const notes = track.kind === 'drums' ? surpriseDrums(song) : track.chords ? surpriseChords(song) : surpriseMelody(song, track.octave <= 2);
  track.notes = fitLengths(song, withoutClashes(notes));
}
