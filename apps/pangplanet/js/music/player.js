import { DRUMS } from './drums.js';
import { INSTRUMENTS } from './instruments.js';
import { chordSemitones, midiFrequency, rowMidi, stepSeconds, totalSteps } from './theory.js';

const LOOKAHEAD = 0.15;
const SCHEDULE_MS = 30;
const REVERB_SECONDS = 2.5;
const START_DELAY = 0.08;
const CLIP_RANGE = 3;
const CLIP_KNEE = 0.8;

function impulse(context) {
  const length = Math.round(context.sampleRate * REVERB_SECONDS);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function softLimit(sample) {
  const level = Math.abs(sample);
  return level < CLIP_KNEE ? sample : Math.sign(sample) * (CLIP_KNEE + (1 - CLIP_KNEE) * Math.tanh((level - CLIP_KNEE) / (1 - CLIP_KNEE)));
}

function limiter(context) {
  const squeeze = context.createGain();
  squeeze.gain.value = 1 / CLIP_RANGE;
  const shaper = context.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 4097 }, (_, i) => softLimit(((i - 2048) / 2048) * CLIP_RANGE));
  squeeze.connect(shaper).connect(context.destination);
  return squeeze;
}

function playNote(context, output, song, track, row, time, duration) {
  if (track.volume <= 0) return;
  if (track.kind === 'drums') {
    DRUMS[row].play(context, output, time, track.volume);
    return;
  }
  const midi = rowMidi(song, track, row);
  const voices = track.chords ? chordSemitones(song.scale, row) : [0];
  for (const offset of voices) INSTRUMENTS[track.instrument].play(context, output, time, midiFrequency(midi + offset), duration, track.volume / Math.sqrt(voices.length));
}

function playStep(context, output, song, step, time) {
  const swing = step % 2 ? song.swing * stepSeconds(song) * 0.5 : 0;
  for (const track of song.tracks) {
    for (const note of track.notes) {
      if (note.step === step) playNote(context, output, song, track, note.row, time + swing, note.length * stepSeconds(song) * 0.95);
    }
  }
}

function createMix(context) {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.ratio.value = 12;
  compressor.attack.value = 0.002;
  compressor.connect(limiter(context));
  const reverb = context.createConvolver();
  reverb.buffer = impulse(context);
  const wet = context.createGain();
  reverb.connect(wet).connect(compressor);
  return { compressor, reverb, wet };
}

export function createMusicPlayer() {
  let context = null;
  let mix = null;
  const buses = {};
  const volumes = {};
  const playbacks = new Set();
  let timer = 0;

  function bus(name) {
    if (!buses[name]) {
      buses[name] = context.createGain();
      buses[name].gain.value = volumes[name] ?? 1;
      buses[name].connect(mix.compressor);
      buses[name].connect(mix.reverb);
    }
    return buses[name];
  }

  function schedule() {
    for (const playback of playbacks) playback.advance(context.currentTime);
    if (!playbacks.size) {
      clearInterval(timer);
      timer = 0;
    }
  }

  return {
    get ready() {
      return context?.state === 'running';
    },
    unlock() {
      if (!context) {
        context = new AudioContext();
        mix = createMix(context);
      }
      if (context.state === 'suspended') context.resume();
    },
    pause() {
      if (context?.state === 'running') context.suspend();
    },
    setVolume(name, volume) {
      volumes[name] = volume;
      if (buses[name]) buses[name].gain.setTargetAtTime(volume, context.currentTime, 0.1);
    },
    play(song, busName, { loops = 1, onEnd = () => {} } = {}) {
      const gain = context.createGain();
      gain.connect(bus(busName));
      mix.wet.gain.value = song.reverb;
      const steps = totalSteps(song);
      let step = 0;
      let loop = 0;
      let nextTime = context.currentTime + START_DELAY;
      let endsAt = Infinity;
      const playback = {
        advance(now) {
          while (endsAt === Infinity && nextTime < now + LOOKAHEAD) {
            playStep(context, gain, song, step, nextTime);
            nextTime += stepSeconds(song);
            if (++step < steps) continue;
            step = 0;
            if (++loop >= loops) endsAt = nextTime + REVERB_SECONDS;
          }
          if (now >= endsAt) finish();
        },
        fadeOut(seconds) {
          endsAt = Math.min(endsAt, context.currentTime + seconds);
          gain.gain.setTargetAtTime(0, context.currentTime, seconds / 4);
        },
      };
      function finish() {
        playbacks.delete(playback);
        gain.disconnect();
        onEnd();
      }
      playbacks.add(playback);
      playback.advance(context.currentTime);
      if (!timer) timer = setInterval(schedule, SCHEDULE_MS);
      return playback;
    },
  };
}
