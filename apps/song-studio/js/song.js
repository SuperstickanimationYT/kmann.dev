import { uid } from './dom.js';
import { DRUMS } from './drums.js';
import { INSTRUMENTS } from './instruments.js';
import { DEFAULT_SCALE, SCALES, rowCount } from './music.js';

export const MAX_TRACKS = 8;
export const BAR_CHOICES = [1, 2, 4, 8];
const TRACK_COLORS = ['#4dabf7', '#ff922b', '#51cf66', '#cc5de8', '#fcc419', '#22b8cf', '#ff6b6b', '#94d82d'];

export const totalSteps = (song) => song.bars * song.beatsPerBar * song.stepsPerBeat;
export const stepSeconds = (song) => 60 / song.tempo / song.stepsPerBeat;
export const trackRows = (song, track) => (track.kind === 'drums' ? DRUMS.length : rowCount(song.scale));
export const hasNotes = (song) => song.tracks.some((track) => track.notes.length);

export function newTrack(song, kind, instrument = 'piano') {
  const color = TRACK_COLORS.find((candidate) => !song.tracks.some((track) => track.color === candidate)) ?? TRACK_COLORS[song.tracks.length % TRACK_COLORS.length];
  return {
    id: uid(),
    kind,
    name: kind === 'drums' ? 'Drums' : INSTRUMENTS[instrument].label,
    instrument,
    octave: INSTRUMENTS[instrument].octave,
    chords: false,
    volume: 0.8,
    muted: false,
    solo: false,
    color,
    notes: [],
  };
}

export function blankSong() {
  const song = { name: 'My song', tempo: 110, key: 0, scale: DEFAULT_SCALE, bars: 2, beatsPerBar: 4, stepsPerBeat: 4, swing: 0, reverb: 0.25, tracks: [] };
  song.tracks.push(newTrack(song, 'melody', 'marimba'), newTrack(song, 'drums'));
  return song;
}

const notesFrom = (rows) => rows.map(([row, step, length]) => ({ row, step, length }));

export function demoSong() {
  const song = { name: 'Sunny loop', tempo: 100, key: 0, scale: 'majorPentatonic', bars: 2, beatsPerBar: 4, stepsPerBeat: 4, swing: 0.2, reverb: 0.3, tracks: [] };
  const melody = newTrack(song, 'melody', 'marimba');
  melody.notes = notesFrom([[7, 0, 2], [5, 2, 2], [4, 4, 2], [5, 6, 2], [7, 8, 3], [8, 11, 1], [7, 12, 4], [5, 16, 2], [4, 18, 2], [3, 20, 2], [4, 22, 2], [5, 24, 6], [3, 30, 2]]);
  song.tracks.push(melody);
  const chords = newTrack(song, 'melody', 'pad');
  chords.name = 'Chords';
  chords.chords = true;
  chords.volume = 0.6;
  chords.notes = notesFrom([[0, 0, 8], [4, 8, 8], [1, 16, 8], [3, 24, 8]]);
  song.tracks.push(chords);
  const bass = newTrack(song, 'melody', 'bass');
  bass.notes = notesFrom([[0, 0, 4], [5, 6, 2], [4, 8, 4], [4, 14, 2], [1, 16, 4], [6, 22, 2], [3, 24, 4], [3, 30, 2]]);
  song.tracks.push(bass);
  const drums = newTrack(song, 'drums');
  drums.volume = 0.7;
  const kicks = [0, 6, 10, 16, 22, 26].map((step) => [0, step, 1]);
  const snares = [4, 12, 20, 28].map((step) => [2, step, 1]);
  const hats = Array.from({ length: 15 }, (_, i) => [4, i * 2, 1]);
  drums.notes = notesFrom([...kicks, ...snares, ...hats, [5, 30, 1]]);
  song.tracks.push(drums);
  return song;
}

const number = (value, min, max, fallback) => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

export function normalizeSong(raw) {
  const blank = blankSong();
  const song = {
    name: typeof raw.name === 'string' ? raw.name.slice(0, 60) : blank.name,
    tempo: Math.round(number(raw.tempo, 50, 200, blank.tempo)),
    key: Math.round(number(raw.key, 0, 11, 0)),
    scale: SCALES[raw.scale] ? raw.scale : blank.scale,
    bars: BAR_CHOICES.includes(raw.bars) ? raw.bars : blank.bars,
    beatsPerBar: [3, 4].includes(raw.beatsPerBar) ? raw.beatsPerBar : 4,
    stepsPerBeat: [2, 3, 4].includes(raw.stepsPerBeat) ? raw.stepsPerBeat : 4,
    swing: number(raw.swing, 0, 0.6, 0),
    reverb: number(raw.reverb, 0, 1, blank.reverb),
    tracks: [],
  };
  for (const rawTrack of Array.isArray(raw.tracks) ? raw.tracks.slice(0, MAX_TRACKS) : []) {
    const kind = rawTrack.kind === 'drums' ? 'drums' : 'melody';
    const instrument = INSTRUMENTS[rawTrack.instrument] ? rawTrack.instrument : 'piano';
    const track = newTrack(song, kind, instrument);
    track.name = typeof rawTrack.name === 'string' ? rawTrack.name.slice(0, 30) : track.name;
    track.octave = Math.round(number(rawTrack.octave, 1, 6, track.octave));
    track.chords = kind === 'melody' && Boolean(rawTrack.chords);
    track.volume = number(rawTrack.volume, 0, 1, track.volume);
    track.muted = Boolean(rawTrack.muted);
    track.solo = Boolean(rawTrack.solo);
    const rows = trackRows(song, track);
    const steps = totalSteps(song);
    track.notes = (Array.isArray(rawTrack.notes) ? rawTrack.notes : [])
      .map((note) => (Array.isArray(note) ? { row: note[0], step: note[1], length: note[2] } : note))
      .filter((note) => note && Number.isInteger(note.row) && Number.isInteger(note.step) && note.row >= 0 && note.row < rows && note.step >= 0 && note.step < steps)
      .map((note) => ({ row: note.row, step: note.step, length: Math.round(number(note.length, 1, steps - note.step, 1)) }));
    song.tracks.push(track);
  }
  if (!song.tracks.length) song.tracks = blank.tracks;
  return song;
}

function compact(song) {
  return {
    ...song,
    tracks: song.tracks.map(({ id, color, notes, ...track }) => ({ ...track, notes: notes.map((note) => [note.row, note.step, note.length]) })),
  };
}

async function pipeBytes(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

export async function encodeShare(song) {
  const packed = await pipeBytes(new TextEncoder().encode(JSON.stringify(compact(song))), new CompressionStream('deflate-raw'));
  return btoa(String.fromCharCode(...packed)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function decodeShare(code) {
  const binary = atob(code.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const text = new TextDecoder().decode(await pipeBytes(bytes, new DecompressionStream('deflate-raw')));
  return normalizeSong(JSON.parse(text));
}

const STORAGE_KEY = 'song-studio';
const HISTORY_LIMIT = 100;

export function createStore() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {}
  const listeners = [];
  const undoStack = [];
  const redoStack = [];
  const store = {
    song: saved ? normalizeSong(saved) : demoSong(),
    selectedId: null,
    get track() {
      return store.song.tracks.find((track) => track.id === store.selectedId) ?? store.song.tracks[0];
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    onChange(listener) {
      listeners.push(listener);
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compact(store.song)));
      } catch {}
    },
    changed() {
      store.save();
      for (const listener of listeners) listener();
    },
    checkpoint() {
      undoStack.push(JSON.stringify(store.song));
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
    },
    edit(mutate) {
      store.checkpoint();
      mutate(store.song);
      store.changed();
    },
    replace(song) {
      store.checkpoint();
      store.song = song;
      store.selectedId = song.tracks[0].id;
      store.changed();
    },
    undo() {
      if (!undoStack.length) return;
      redoStack.push(JSON.stringify(store.song));
      store.song = JSON.parse(undoStack.pop());
      store.changed();
    },
    redo() {
      if (!redoStack.length) return;
      undoStack.push(JSON.stringify(store.song));
      store.song = JSON.parse(redoStack.pop());
      store.changed();
    },
  };
  store.selectedId = store.song.tracks[0].id;
  return store;
}
