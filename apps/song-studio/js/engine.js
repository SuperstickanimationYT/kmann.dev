import { DRUMS } from './drums.js';
import { INSTRUMENTS } from './instruments.js';
import { chordSemitones, midiFrequency, rowMidi } from './music.js';
import { stepSeconds, totalSteps } from './song.js';

const LOOKAHEAD = 0.12;
const REVERB_TAIL = 2.5;

function impulse(context, seconds) {
  const length = Math.round(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

const CLIP_RANGE = 3;
const CLIP_KNEE = 0.8;

function softLimit(sample) {
  const level = Math.abs(sample);
  return level < CLIP_KNEE ? sample : Math.sign(sample) * (CLIP_KNEE + (1 - CLIP_KNEE) * Math.tanh((level - CLIP_KNEE) / (1 - CLIP_KNEE)));
}

function softClipper(context, input) {
  const squeeze = context.createGain();
  squeeze.gain.value = 1 / CLIP_RANGE;
  const shaper = context.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 4097 }, (_, i) => softLimit(((i - 2048) / 2048) * CLIP_RANGE));
  input.connect(squeeze).connect(shaper);
  return shaper;
}

function createMix(context) {
  const input = context.createGain();
  input.gain.value = 0.5;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.002;
  const reverb = context.createConvolver();
  reverb.buffer = impulse(context, REVERB_TAIL);
  const wet = context.createGain();
  input.connect(compressor);
  input.connect(reverb).connect(wet).connect(compressor);
  softClipper(context, compressor).connect(context.destination);
  return { input, wet };
}

export function playNote(context, output, song, track, row, time, duration, velocity = track.volume) {
  if (velocity <= 0) return;
  if (track.kind === 'drums') {
    DRUMS[row].play(context, output, time, velocity);
    return;
  }
  const instrument = INSTRUMENTS[track.instrument];
  const midi = rowMidi(song, track, row);
  const voices = track.chords ? chordSemitones(song.scale, row) : [0];
  for (const offset of voices) instrument.play(context, output, time, midiFrequency(midi + offset), duration, velocity / Math.sqrt(voices.length));
}

const audibleTracks = (song) => {
  const soloed = song.tracks.some((track) => track.solo);
  return song.tracks.filter((track) => !track.muted && (!soloed || track.solo));
};

const swingOffset = (song, step) => (step % 2 ? song.swing * stepSeconds(song) * 0.5 : 0);

function playStep(context, output, song, step, time) {
  const length = stepSeconds(song);
  for (const track of audibleTracks(song)) {
    for (const note of track.notes) {
      if (note.step === step) playNote(context, output, song, track, note.row, time + swingOffset(song, step), note.length * length * 0.95);
    }
  }
}

export function createPlayer(getSong, onStep) {
  let context = null;
  let mix = null;
  let timer = 0;
  let frame = 0;
  let step = 0;
  let nextTime = 0;
  let shownStep = -1;
  const queue = [];

  function audio() {
    if (!context) {
      context = new AudioContext({ latencyHint: 'interactive' });
      mix = createMix(context);
    }
    if (context.state === 'suspended') context.resume();
    mix.wet.gain.value = getSong().reverb;
    return context;
  }

  function schedule() {
    const song = getSong();
    mix.wet.gain.value = song.reverb;
    while (nextTime < context.currentTime + LOOKAHEAD) {
      if (step >= totalSteps(song)) step = 0;
      playStep(context, mix.input, song, step, nextTime);
      queue.push({ step, time: nextTime + swingOffset(song, step) });
      nextTime += stepSeconds(song);
      step++;
    }
  }

  function currentEntry() {
    while (queue.length > 1 && queue[1].time <= context.currentTime) queue.shift();
    return queue[0] && queue[0].time <= context.currentTime ? queue[0] : null;
  }

  function animate() {
    const entry = currentEntry();
    if (entry && entry.step !== shownStep) {
      shownStep = entry.step;
      onStep(shownStep);
    }
    frame = requestAnimationFrame(animate);
  }

  return {
    get playing() {
      return timer !== 0;
    },
    start() {
      if (timer) return;
      audio();
      step = 0;
      shownStep = -1;
      queue.length = 0;
      nextTime = context.currentTime + 0.06;
      schedule();
      timer = setInterval(schedule, 25);
      animate();
    },
    stop() {
      clearInterval(timer);
      cancelAnimationFrame(frame);
      timer = 0;
      shownStep = -1;
      onStep(-1);
    },
    preview(track, row, duration = 0.35) {
      const ctx = audio();
      playNote(ctx, mix.input, getSong(), track, row, ctx.currentTime + 0.01, duration);
    },
    nearestStep() {
      const entry = currentEntry();
      if (!entry) return null;
      const song = getSong();
      const late = context.currentTime - entry.time > stepSeconds(song) / 2;
      return late ? (entry.step + 1) % totalSteps(song) : entry.step;
    },
  };
}

export async function renderSong(song, loops) {
  const loopLength = totalSteps(song) * stepSeconds(song);
  const sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil((loopLength * loops + REVERB_TAIL) * sampleRate), sampleRate);
  const mix = createMix(context);
  mix.wet.gain.value = song.reverb;
  for (let loop = 0; loop < loops; loop++) {
    for (let step = 0; step < totalSteps(song); step++) playStep(context, mix.input, song, step, loop * loopLength + step * stepSeconds(song));
  }
  return context.startRendering();
}

export function wavBlob(buffer) {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = new DataView(new ArrayBuffer(44 + frames * channels * 2));
  const writeText = (offset, text) => [...text].forEach((char, i) => bytes.setUint8(offset + i, char.charCodeAt(0)));
  writeText(0, 'RIFF');
  bytes.setUint32(4, 36 + frames * channels * 2, true);
  writeText(8, 'WAVEfmt ');
  bytes.setUint32(16, 16, true);
  bytes.setUint16(20, 1, true);
  bytes.setUint16(22, channels, true);
  bytes.setUint32(24, buffer.sampleRate, true);
  bytes.setUint32(28, buffer.sampleRate * channels * 2, true);
  bytes.setUint16(32, channels * 2, true);
  bytes.setUint16(34, 16, true);
  writeText(36, 'data');
  bytes.setUint32(40, frames * channels * 2, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][i]));
      bytes.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
