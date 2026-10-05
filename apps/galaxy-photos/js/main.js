import { createRenderer } from './renderer.js';
import { PRESETS, presetSettings, randomGalaxy } from './presets.js';
import { randomSeed } from './random.js';
import { createMergerTimeline, MERGER_SIMULATION, myrAt } from './merger/timeline.js';
import { recordFrames, videoFormat } from './merger/video.js';

const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 768;
const COPIED_LABEL_MS = 1500;
const PLAY_STEP = 4;
const TEXT_FIELDS = ['telescope', 'scene'];
const SHAPE_NEUTRAL_FIELDS = ['seed', 'scene', 'mergerTime'];
const CAMERA_FIELDS = ['telescope', 'exposure', 'stretch', 'noise', 'saturation', 'stars', 'background', 'resolved'];

const form = document.querySelector('[data-controls]');
const presetPicker = document.querySelector('[data-preset]');
const sizePicker = document.querySelector('[data-size]');
const preview = document.querySelector('[data-preview]');
const status = document.querySelector('[data-status]');
const downloadButton = document.querySelector('[data-download]');
const copyLinkButton = document.querySelector('[data-copy-link]');
const mergerProgress = document.querySelector('[data-merger-progress]');
const playButton = document.querySelector('[data-play]');
const recordButton = document.querySelector('[data-record-video]');

preview.width = PREVIEW_WIDTH;
preview.height = PREVIEW_HEIGHT;

const settingFields = () => [...form.elements].filter((field) => field.name);
const nextFrame = () => new Promise((resolve) => window.requestAnimationFrame(resolve));
const tickChannel = new MessageChannel();
const quickTick = () =>
  new Promise((resolve) => {
    tickChannel.port1.onmessage = resolve;
    tickChannel.port2.postMessage(null);
  });

function readSettings() {
  const settings = {};
  for (const field of settingFields()) {
    settings[field.name] = TEXT_FIELDS.includes(field.name) ? field.value : Number(field.value);
  }
  return settings;
}

function writeSettings(settings) {
  for (const [name, value] of Object.entries(settings)) {
    const field = form.elements[name];
    if (field) field.value = value;
  }
}

function showValues() {
  for (const range of form.querySelectorAll('input[type="range"]')) {
    const output = range.closest('label').querySelector('output');
    output.value = output.hasAttribute('data-myr') ? myrAt(Number(range.value)).toLocaleString() : range.value;
  }
}

function showScene(scene) {
  const merging = scene === 'merger';
  form.querySelectorAll('[data-merger-only]').forEach((element) => (element.hidden = !merging));
  form.querySelectorAll('[data-galaxy-only]').forEach((element) => (element.hidden = merging));
}

function toLink(settings) {
  return `#${new URLSearchParams(Object.entries(settings))}`;
}

function fromLink(hash) {
  const params = new URLSearchParams(hash.slice(1));
  const settings = {};
  for (const field of settingFields()) {
    if (!params.has(field.name)) continue;
    const value = params.get(field.name);
    if (TEXT_FIELDS.includes(field.name)) settings[field.name] = value;
    else if (Number.isFinite(Number(value))) settings[field.name] = Number(value);
  }
  return Object.keys(settings).length ? settings : null;
}

function cameraOf(settings) {
  return Object.fromEntries(CAMERA_FIELDS.map((name) => [name, settings[name]]));
}

function showStatus(message) {
  status.hidden = !message;
  status.textContent = message ?? '';
}

const renderer = createRenderer(preview);
let job = null;
let pumping = false;
let timeline = null;
let mergerField = null;
let fieldInFlight = null;
let drawnMergerIndex = -1;
let drawRequest = 0;
let playing = false;
let recording = null;

function showMergerProgress() {
  const ready = timeline?.ready() ?? 0;
  const done = Math.round((100 * ready) / MERGER_SIMULATION.snapshots);
  const wanted = readSettings().mergerTime;
  const behind = drawnMergerIndex >= 0 && drawnMergerIndex < wanted;
  mergerProgress.hidden = ready >= MERGER_SIMULATION.snapshots;
  mergerProgress.textContent = behind
    ? `Loading the collision: ${done}%. Showing ${myrAt(drawnMergerIndex).toLocaleString()} million years until it reaches ${myrAt(wanted).toLocaleString()}.`
    : `Loading the collision: ${done}%. Later times unlock as it loads.`;
}

function onMergerProgress(ready) {
  showMergerProgress();
  const settings = readSettings();
  if (settings.scene === 'merger' && drawnMergerIndex < Math.min(settings.mergerTime, ready - 1)) redraw();
}

function onMergerFailure() {
  mergerProgress.hidden = false;
  mergerProgress.textContent = "Couldn't load the collision. Check your connection and reload the page.";
}

function mergerTimeline() {
  timeline ??= createMergerTimeline(onMergerProgress, onMergerFailure);
  return timeline;
}

function buildField(index) {
  fieldInFlight ??= timeline.fieldAt(index).then((field) => {
    mergerField = field;
    fieldInFlight = null;
  });
  return fieldInFlight;
}

async function mergerFieldFor(settings, stillWanted = () => true) {
  mergerTimeline();
  if (!timeline.ready()) return null;
  const index = Math.min(settings.mergerTime, timeline.ready() - 1);
  while (mergerField?.index !== index) {
    if (!stillWanted()) return null;
    showStatus('Building frame…');
    await buildField(index);
  }
  return mergerField;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (job) {
    const current = job;
    const { done } = current.next();
    if (done && job === current) job = null;
    await nextFrame();
  }
  pumping = false;
}

async function redraw() {
  const settings = readSettings();
  showValues();
  showScene(settings.scene);
  window.history.replaceState(null, '', toLink(settings));
  if (!renderer || recording) return;
  const request = ++drawRequest;
  const latest = () => request === drawRequest;
  const merger = settings.scene === 'merger' ? await mergerFieldFor(settings, latest) : null;
  if (!latest()) return;
  showStatus(null);
  if (settings.scene === 'merger' && !merger) return;
  drawnMergerIndex = merger?.index ?? -1;
  showMergerProgress();
  job = renderer.render(settings, PREVIEW_WIDTH, PREVIEW_HEIGHT, null, merger);
  pump();
}

function apply(settings) {
  writeSettings(settings);
  redraw();
}

function choosePreset(name) {
  presetPicker.value = name;
  apply({ ...presetSettings(name, readSettings().seed), ...cameraOf(readSettings()) });
}

for (const [name, { label }] of Object.entries(PRESETS)) {
  presetPicker.add(new Option(label, name));
}

presetPicker.addEventListener('change', () => {
  if (presetPicker.value) choosePreset(presetPicker.value);
});

form.addEventListener('input', (event) => {
  if (event.isTrusted) stopPlaying();
  if (event.target === presetPicker) return;
  if (!CAMERA_FIELDS.includes(event.target.name) && !SHAPE_NEUTRAL_FIELDS.includes(event.target.name)) presetPicker.value = '';
  redraw();
});

document.querySelector('[data-randomize]').addEventListener('click', () => {
  presetPicker.value = '';
  apply(randomGalaxy(randomSeed(), cameraOf(readSettings())));
});

document.querySelector('[data-reroll]').addEventListener('click', () => {
  apply({ ...readSettings(), seed: randomSeed() });
});

downloadButton.addEventListener('click', async () => {
  if (!renderer) return;
  const width = Number(sizePicker.value);
  const height = (width * 3) / 4;
  const settings = readSettings();
  downloadButton.disabled = true;
  form.inert = true;
  job = null;
  showStatus(`Rendering ${width} × ${height}…`);
  try {
    const merger = settings.scene === 'merger' ? await mergerFieldFor(settings) : null;
    const blob = await renderer.renderToBlob(settings, width, height, nextFrame, merger);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = merger ? `galaxy-merger-${settings.seed}-${myrAt(merger.index)}myr.png` : `galaxy-${settings.seed}.png`;
    link.click();
    URL.revokeObjectURL(link.href);
  } finally {
    downloadButton.disabled = false;
    form.inert = false;
    showStatus(null);
    redraw();
  }
});

copyLinkButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(window.location.href);
  const label = copyLinkButton.textContent;
  copyLinkButton.textContent = 'Copied';
  window.setTimeout(() => {
    copyLinkButton.textContent = label;
  }, COPIED_LABEL_MS);
});

if (!renderer) {
  showStatus('This page needs WebGL2 with float render targets, which this browser does not offer.');
  downloadButton.disabled = true;
}

const linked = fromLink(window.location.hash);
if (linked) {
  writeSettings({ ...presetSettings('grand', 1), ...linked });
  redraw();
} else {
  presetPicker.value = 'grand';
  apply(presetSettings('grand', 1));
}

const lastMergerIndex = MERGER_SIMULATION.snapshots - 1;

const untilPreviewDrawn = async () => {
  while (job) await nextFrame();
};

function stopPlaying() {
  playing = false;
  playButton.textContent = 'Play';
}

async function play() {
  playing = true;
  playButton.textContent = 'Pause';
  if (Number(form.mergerTime.value) >= lastMergerIndex) form.mergerTime.value = 0;
  while (playing && Number(form.mergerTime.value) < lastMergerIndex) {
    const index = Math.min(Number(form.mergerTime.value) + PLAY_STEP, lastMergerIndex);
    await mergerTimeline().untilReady(index + 1);
    if (!playing) break;
    form.mergerTime.value = index;
    await redraw();
    await untilPreviewDrawn();
  }
  stopPlaying();
}

playButton.addEventListener('click', () => (playing ? stopPlaying() : play()));

function lockControlsExcept(kept, locked) {
  for (const control of document.querySelectorAll('.studio-panel button, .studio-panel input, .studio-panel select')) {
    if (control !== kept) control.disabled = locked;
  }
}

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

const whenAborted = (signal) => new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));

async function recordVideo() {
  stopPlaying();
  recording = new AbortController();
  const { signal } = recording;
  recordButton.textContent = 'Cancel video';
  lockControlsExcept(recordButton, true);
  job = null;
  const settings = readSettings();
  const frames = MERGER_SIMULATION.snapshots;
  const fieldFor = (index) => {
    const field = Promise.race([mergerTimeline().untilReady(index + 1), whenAborted(signal)]).then(() => {
      signal.throwIfAborted();
      return mergerTimeline().fieldAt(index);
    });
    field.catch(() => {});
    return field;
  };
  let upcoming = fieldFor(0);
  const pictureAt = async (index) => {
    const field = await upcoming;
    if (index + 1 < frames) upcoming = fieldFor(index + 1);
    return renderer.renderToCanvas(settings, PREVIEW_WIDTH, PREVIEW_HEIGHT, quickTick, field);
  };
  showStatus('Making the video. Keep this tab in view.');
  try {
    const video = await recordFrames({
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      frames,
      pictureAt,
      onFrame: (made) => showStatus(`Making the video: frame ${made} of ${frames}. Keep this tab in view.`),
      onPlayback: (seconds) => showStatus(`Saving the ${Math.round(seconds)}-second video. Keep this tab in view.`),
      cancelled: () => signal.aborted,
    });
    if (video) downloadBlob(video.blob, `galaxy-merger-${settings.seed}.${video.extension}`);
  } catch (error) {
    if (!signal.aborted) throw error;
  } finally {
    recording = null;
    recordButton.textContent = 'Download video';
    recordButton.disabled = false;
    lockControlsExcept(recordButton, false);
    showStatus(null);
    redraw();
  }
}

recordButton.hidden = !videoFormat();
function cancelVideo() {
  recording.abort();
  recordButton.textContent = 'Cancelling…';
  recordButton.disabled = true;
}

recordButton.addEventListener('click', () => (recording ? cancelVideo() : recordVideo()));
