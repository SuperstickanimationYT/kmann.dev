import { setBars, setBeatsPerBar, setScale, setStepsPerBeat, surprise } from './arrange.js';
import { el, find } from './dom.js';
import { DEMOS } from './demos.js';
import { createPlayer, renderSong, wavBlob } from './engine.js';
import { createGrid, noteAt } from './grid.js';
import { INSTRUMENTS } from './instruments.js';
import { NOTE_NAMES, SCALES } from './music.js';
import { BAR_CHOICES, MAX_TRACKS, blankSong, createStore, decodeShare, encodeShare, hasNotes, newTrack, stepSeconds, totalSteps, trackRows } from './song.js';

const LIVE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];

const store = createStore(DEMOS[0].build);
const player = createPlayer(() => store.song, (step) => grid.setPlayStep(step));
const grid = createGrid({ labels: find('[data-labels]'), canvas: find('[data-grid]'), scroller: find('[data-scroller]') }, store, {
  onPreview: (track, row) => player.preview(track, row),
  onPlayRow: playLive,
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
  status: find('[data-status]'),
};

controls.key.append(...NOTE_NAMES.map((name, index) => el('option', { value: index }, name)));
controls.scale.append(...Object.entries(SCALES).map(([id, scale]) => el('option', { value: id }, scale.label)));
controls.bars.append(...BAR_CHOICES.map((bars) => el('option', { value: bars }, String(bars))));
controls.instrument.append(...Object.entries(INSTRUMENTS).map(([id, instrument]) => el('option', { value: id }, instrument.label)));

let recording = false;
let statusTimer = 0;

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

function render() {
  const { song, track } = store;
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
  else player.start();
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
controls.bars.addEventListener('change', editSong((song, value) => setBars(song, Number(value))));
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
  say('Rendering…');
  try {
    const loopSeconds = totalSteps(song) * stepSeconds(song);
    const loops = Math.min(8, Math.max(1, Math.ceil(15 / loopSeconds)));
    const link = el('a', { href: URL.createObjectURL(wavBlob(await renderSong(song, loops))), download: `${fileSafe(song.name)}.wav` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    say(loops > 1 ? `Saved ${loops} loops of your song.` : 'Saved.');
  } catch {
    say('Could not render the song in this browser.');
  } finally {
    controls.wav.disabled = false;
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
    else return;
    event.preventDefault();
    return;
  }
  if (event.altKey || typing(event.target)) return;
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
