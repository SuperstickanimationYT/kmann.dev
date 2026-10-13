import { copyBars, deleteBars, emptyBars, insertBars, pasteBars, setBars, setBeatsPerBar, setScale, setStepsPerBeat, surprise } from './arrange.js';
import { el, find } from './dom.js';
import { DEMOS } from './demos.js';
import { createPlayer, renderSong, wavBlob } from './engine.js';
import { createGrid, noteAt } from './grid.js';
import { INSTRUMENTS } from './instruments.js';
import { NOTE_NAMES, SCALES } from './music.js';
import { MAX_SECONDS, MAX_TRACKS, barSteps, blankSong, createStore, decodeShare, encodeShare, hasNotes, maxBars, minTempo, newTrack, songSeconds, trackRows } from './song.js';

const LIVE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];

const store = createStore(DEMOS[0].build);
const player = createPlayer(() => store.song, (step) => grid.setPlayStep(step));
const grid = createGrid({ labels: find('[data-labels]'), ruler: find('[data-ruler]'), canvas: find('[data-grid]'), lane: find('[data-lane]'), scroller: find('[data-scroller]') }, store, {
  onPreview: (track, row) => player.preview(track, row),
  onPlayRow: playLive,
  onPickBars: (selection) => {
    store.selection = selection;
    render();
  },
});

const controls = {
  play: find('[data-play]'),
  playLabel: find('[data-play-label]'),
  record: find('[data-record]'),
  tempo: find('[data-tempo]'),
  tempoValue: find('[data-tempo-value]'),
  name: find('[data-name]'),
  undo: find('[data-undo]'),
  redo: find('[data-redo]'),
  key: find('[data-key]'),
  scale: find('[data-scale]'),
  bars: find('[data-bars]'),
  length: find('[data-length]'),
  beats: find('[data-beats]'),
  steps: find('[data-steps]'),
  swing: find('[data-swing]'),
  reverb: find('[data-reverb]'),
  tracks: find('[data-tracks]'),
  addMelody: find('[data-add-melody]'),
  addDrums: find('[data-add-drums]'),
  trackName: find('[data-track-name]'),
  instrument: find('[data-instrument]'),
  octaveValue: find('[data-octave-value]'),
  chords: find('[data-chords]'),
  wav: find('[data-wav]'),
  sectionLabel: find('[data-section-label]'),
  copy: find('[data-copy]'),
  paste: find('[data-paste]'),
  insert: find('[data-insert]'),
  empty: find('[data-empty]'),
  deleteBars: find('[data-delete-bars]'),
  status: find('[data-status]'),
};

controls.key.append(...NOTE_NAMES.map((name, index) => el('option', { value: index }, name)));
controls.scale.append(...Object.entries(SCALES).map(([id, scale]) => el('option', { value: id }, scale.label)));
controls.instrument.append(...Object.entries(INSTRUMENTS).map(([id, instrument]) => el('option', { value: id }, instrument.label)));

let recording = false;
let statusTimer = 0;
let clip = null;

function say(message) {
  controls.status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (controls.status.textContent = ''), 4000);
}

function trackCard(track) {
  const selected = track.id === store.track.id;
  const toggle = (field, label, title) =>
    el('button', { type: 'button', class: `ss-toggle ss-${field}`, 'aria-pressed': String(track[field]), title, onclick: (event) => {
      event.stopPropagation();
      store.edit(() => (track[field] = !track[field]));
    } }, label);
  return el(
    'div',
    { class: `ss-track${selected ? ' is-selected' : ''}${track.muted ? ' is-muted' : ''}`, style: `--track: ${track.color}`, onclick: () => select(track.id) },
    el('button', { type: 'button', class: 'ss-track-pick', 'aria-pressed': String(selected) },
      el('span', { class: 'ss-track-swatch', 'aria-hidden': 'true' }),
      el('span', { class: 'ss-track-title' }, track.name || 'Untitled'),
      el('span', { class: 'ss-track-meta' }, track.kind === 'drums' ? 'Drum kit' : `${INSTRUMENTS[track.instrument].label}${track.chords ? ' chords' : ''}`),
    ),
    el('div', { class: 'ss-track-controls' },
      el('input', { type: 'range', min: 0, max: 1, step: 0.05, value: track.volume, 'aria-label': `${track.name} volume`, title: 'Volume', onclick: (event) => event.stopPropagation(),
        onpointerdown: () => store.checkpoint(),
        oninput: (event) => {
          track.volume = Number(event.target.value);
          store.save();
        } }),
      toggle('muted', 'M', 'Mute'),
      toggle('solo', 'S', 'Solo: hear only this track'),
      el('button', { type: 'button', class: 'ss-toggle', title: 'Remove track', 'aria-label': `Remove ${track.name}`, disabled: store.song.tracks.length === 1, onclick: (event) => {
        event.stopPropagation();
        store.edit((song) => song.tracks.splice(song.tracks.indexOf(track), 1));
      } }, '×'),
    ),
  );
}

function select(id) {
  if (store.selectedId === id) return;
  store.selectedId = id;
  render();
}

function clock(seconds) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const barRange = ({ start, end }) => (end - start === 1 ? `Bar ${start + 1}` : `Bars ${start + 1}–${end}`);
const barCount = (bars) => `${bars} bar${bars === 1 ? '' : 's'}`;

function renderLength() {
  const { song } = store;
  controls.length.textContent = `${clock(songSeconds(song))} of ${clock(MAX_SECONDS)}`;
  controls.bars.max = maxBars(song);
  controls.tempo.min = minTempo(song);
}

function renderSection() {
  const { song, selection } = store;
  const label = selection
    ? [el('strong', {}, barRange(selection)), ' picked, on every track.']
    : ['Pick bars with the numbers above the grid to copy, paste or insert them.'];
  if (clip) label.push(` ${barCount(clip.bars)} copied.`);
  controls.sectionLabel.replaceChildren(...label);
  controls.copy.disabled = controls.empty.disabled = !selection;
  controls.paste.disabled = controls.insert.disabled = !selection || !clip;
  controls.deleteBars.disabled = !selection || selection.end - selection.start >= song.bars;
}

function render() {
  const { song, track } = store;
  if (store.selection?.start >= song.bars) store.selection = null;
  else if (store.selection) store.selection.end = Math.min(store.selection.end, song.bars);
  controls.tempo.value = song.tempo;
  controls.tempoValue.textContent = song.tempo;
  if (document.activeElement !== controls.name) controls.name.value = song.name;
  controls.undo.disabled = !store.canUndo;
  controls.redo.disabled = !store.canRedo;
  controls.key.value = song.key;
  controls.scale.value = song.scale;
  controls.bars.value = song.bars;
  controls.beats.value = song.beatsPerBar;
  controls.steps.value = song.stepsPerBeat;
  controls.swing.value = song.swing;
  controls.reverb.value = song.reverb;
  renderLength();
  renderSection();
  controls.tracks.replaceChildren(...song.tracks.map(trackCard));
  controls.addMelody.disabled = controls.addDrums.disabled = song.tracks.length >= MAX_TRACKS;
  if (document.activeElement !== controls.trackName) controls.trackName.value = track.name;
  for (const node of document.querySelectorAll('[data-melody-only]')) node.hidden = track.kind === 'drums';
  controls.instrument.value = track.instrument;
  controls.octaveValue.textContent = track.octave;
  controls.chords.checked = track.chords;
  grid.draw();
}

function togglePlay() {
  if (player.playing) player.stop();
  else player.start(store.selection ? store.selection.start * barSteps(store.song) : 0);
  controls.play.setAttribute('aria-pressed', String(player.playing));
  controls.playLabel.textContent = player.playing ? 'Stop' : 'Play';
}

function editSong(mutate) {
  return (event) => store.edit((song) => mutate(song, event.target.value));
}

controls.play.addEventListener('click', togglePlay);
controls.record.addEventListener('click', () => {
  recording = !recording;
  controls.record.setAttribute('aria-pressed', String(recording));
  if (recording && !player.playing) togglePlay();
});
controls.tempo.addEventListener('pointerdown', () => store.checkpoint());
controls.tempo.addEventListener('input', () => {
  store.song.tempo = Number(controls.tempo.value);
  controls.tempoValue.textContent = store.song.tempo;
  renderLength();
  store.save();
});
for (const slider of [controls.swing, controls.reverb]) {
  slider.addEventListener('pointerdown', () => store.checkpoint());
  slider.addEventListener('input', () => {
    store.song[slider === controls.swing ? 'swing' : 'reverb'] = Number(slider.value);
    store.save();
  });
}
controls.name.addEventListener('input', () => {
  store.song.name = controls.name.value;
  store.save();
});
controls.undo.addEventListener('click', () => store.undo());
controls.redo.addEventListener('click', () => store.redo());
controls.key.addEventListener('change', editSong((song, value) => (song.key = Number(value))));
controls.scale.addEventListener('change', editSong((song, value) => setScale(song, value)));
controls.bars.addEventListener('change', () => {
  const song = store.song;
  const wanted = Math.round(Number(controls.bars.value));
  const bars = Math.min(wanted, maxBars(song));
  if (!(bars >= 1) || bars === song.bars) {
    render();
    return;
  }
  if (wanted > bars) say(`At this tempo, ${bars} bars is 10 minutes, the longest a song can be.`);
  store.edit(() => setBars(song, bars));
});
controls.beats.addEventListener('change', editSong((song, value) => setBeatsPerBar(song, Number(value))));
controls.steps.addEventListener('change', editSong((song, value) => setStepsPerBeat(song, Number(value))));

controls.addMelody.addEventListener('click', () => {
  const track = newTrack(store.song, 'melody', 'piano');
  store.selectedId = track.id;
  store.edit((song) => song.tracks.push(track));
});
controls.addDrums.addEventListener('click', () => {
  const track = newTrack(store.song, 'drums');
  store.selectedId = track.id;
  store.edit((song) => song.tracks.push(track));
});
controls.trackName.addEventListener('input', () => {
  store.track.name = controls.trackName.value;
  store.save();
  controls.tracks.querySelector('.is-selected .ss-track-title').textContent = controls.trackName.value || 'Untitled';
});
controls.instrument.addEventListener('change', () =>
  store.edit(() => {
    const track = store.track;
    const renamed = track.name === INSTRUMENTS[track.instrument].label;
    track.instrument = controls.instrument.value;
    track.octave = INSTRUMENTS[track.instrument].octave;
    if (renamed) track.name = INSTRUMENTS[track.instrument].label;
    player.preview(track, 0);
  }),
);
for (const button of document.querySelectorAll('[data-octave]')) {
  button.addEventListener('click', () => {
    const octave = store.track.octave + Number(button.dataset.octave);
    if (octave >= 1 && octave <= 6) store.edit(() => (store.track.octave = octave));
  });
}
controls.chords.addEventListener('change', () => store.edit(() => (store.track.chords = controls.chords.checked)));
find('[data-surprise]').addEventListener('click', () => store.edit((song) => surprise(song, store.track)));
find('[data-clear]').addEventListener('click', () => store.edit(() => (store.track.notes = [])));
find('[data-new]').addEventListener('click', () => {
  store.replace(blankSong());
  say('Started a new song. Undo brings the old one back.');
});
const demoPicker = find('[data-demo]');
demoPicker.append(...DEMOS.map((demo, index) => el('option', { value: index }, demo.name)));
demoPicker.addEventListener('change', () => {
  store.replace(DEMOS[demoPicker.value].build());
  demoPicker.value = '';
  say('Loaded a demo. Undo brings back your song.');
});

find('[data-share]').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#s=${await encodeShare(store.song)}`;
  try {
    await navigator.clipboard.writeText(url);
    say('Link copied. Anyone who opens it hears this song.');
  } catch {
    window.prompt('Copy this link:', url);
  }
});

function gridMismatch() {
  if (clip.barSteps === barSteps(store.song)) return false;
  say('The beats or grid changed since you copied. Copy the bars again.');
  return true;
}

function copySection() {
  const { start, end } = store.selection;
  clip = copyBars(store.song, start, end);
  renderSection();
  say(`Copied ${barCount(clip.bars)}.`);
}

function pasteSection() {
  if (gridMismatch()) return;
  const start = store.selection.start;
  if (start + clip.bars > maxBars(store.song)) {
    say('That would make the song longer than 10 minutes.');
    return;
  }
  store.selection = { start, end: start + clip.bars };
  store.edit((song) => pasteBars(song, clip, start));
}

function insertSection() {
  if (gridMismatch()) return;
  const start = store.selection.start;
  if (store.song.bars + clip.bars > maxBars(store.song)) {
    say('That would make the song longer than 10 minutes.');
    return;
  }
  store.selection = { start, end: start + clip.bars };
  store.edit((song) => insertBars(song, clip, start));
}

controls.copy.addEventListener('click', copySection);
controls.paste.addEventListener('click', pasteSection);
controls.insert.addEventListener('click', insertSection);
controls.empty.addEventListener('click', () => store.edit((song) => emptyBars(song, store.selection.start, store.selection.end)));
controls.deleteBars.addEventListener('click', () => {
  const { start, end } = store.selection;
  store.selection = { start, end: start + 1 };
  store.edit((song) => deleteBars(song, start, end));
});

function fileSafe(name) {
  return (name.trim() || 'song').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase();
}

controls.wav.addEventListener('click', async () => {
  const song = structuredClone(store.song);
  if (!hasNotes(song)) {
    say('Add some notes first.');
    return;
  }
  controls.wav.disabled = true;
  controls.wav.textContent = 'Rendering…';
  try {
    const loopSeconds = songSeconds(song);
    const loops = Math.min(8, Math.max(1, Math.ceil(15 / loopSeconds)));
    const link = el('a', { href: URL.createObjectURL(wavBlob(await renderSong(song, loops))), download: `${fileSafe(song.name)}.wav` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    say(loops > 1 ? `Saved ${loops} loops of your song.` : 'Saved.');
  } catch {
    say('Could not render the song in this browser.');
  } finally {
    controls.wav.disabled = false;
    controls.wav.textContent = 'Save as WAV';
  }
});

function playLive(row) {
  const track = store.track;
  player.preview(track, row);
  const step = recording && player.playing ? player.nearestStep() : null;
  if (step !== null && !noteAt(track, row, step)) store.edit(() => track.notes.push({ row, step, length: 1 }));
}

const typing = (target) => target.matches('input[type="text"], textarea, select');

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey) {
    const key = event.key.toLowerCase();
    if (typing(event.target)) return;
    if (key === 'z' && !event.shiftKey) store.undo();
    else if (key === 'y' || (key === 'z' && event.shiftKey)) store.redo();
    else if (key === 'c' && store.selection) copySection();
    else if (key === 'v' && store.selection && clip) pasteSection();
    else return;
    event.preventDefault();
    return;
  }
  if (event.altKey || typing(event.target)) return;
  if (event.key === 'Escape' && store.selection) {
    store.selection = null;
    render();
    return;
  }
  if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) togglePlay();
    return;
  }
  const row = LIVE_KEYS.indexOf(event.code);
  if (row < 0 || row >= trackRows(store.song, store.track)) return;
  event.preventDefault();
  if (!event.repeat) playLive(row);
});

store.onChange(render);

async function openSharedSong() {
  const code = location.hash.startsWith('#s=') ? location.hash.slice(3) : '';
  if (!code) return;
  history.replaceState(null, '', location.pathname);
  try {
    store.replace(await decodeShare(code));
    say('Loaded a shared song. Undo brings back yours.');
  } catch {
    say('That share link looks broken.');
  }
}

render();
openSharedSong();
