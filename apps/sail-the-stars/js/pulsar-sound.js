import { FWHM_PER_SIGMA } from './pulsars.js';

const LOOP_SECONDS = 2;
const TYPICAL_PULSE_WIDTH_TURNS = 0.03;
const RECEIVER_HISS = 0.08;
const NOISE_SMOOTHING = 0.6;
const WEAKEST_PULSE = 0.4;
const PULSE_TO_PULSE_SPREAD = 1.2;
const LOUDNESS = 0.3;
const FADE_SECONDS = 0.15;
const SIGMAS_KEPT = 4;

const radioPeaks = (pulsar) => pulsar.visiblePulses?.peaks ?? [{ phase: 0, height: 1, halfHeightWidth: TYPICAL_PULSE_WIDTH_TURNS }];

function pulseEnvelope(pulsar, sampleRate) {
  const turns = Math.max(1, Math.round(LOOP_SECONDS / pulsar.periodSeconds));
  const samplesPerTurn = pulsar.periodSeconds * sampleRate;
  const envelope = new Float32Array(Math.round(turns * samplesPerTurn));
  for (let turn = 0; turn < turns; turn++) {
    const strength = WEAKEST_PULSE + PULSE_TO_PULSE_SPREAD * Math.random();
    for (const { phase, height, halfHeightWidth } of radioPeaks(pulsar)) {
      const centre = Math.round((turn + phase) * samplesPerTurn);
      const sigma = Math.max(1, (halfHeightWidth / FWHM_PER_SIGMA) * samplesPerTurn);
      const reach = Math.ceil(SIGMAS_KEPT * sigma);
      for (let k = -reach; k <= reach; k++) {
        const index = (((centre + k) % envelope.length) + envelope.length) % envelope.length;
        envelope[index] += strength * height * Math.exp(-(k * k) / (2 * sigma * sigma));
      }
    }
  }
  return envelope;
}

function radioRecording(pulsar, sampleRate) {
  const envelope = pulseEnvelope(pulsar, sampleRate);
  const samples = new Float32Array(envelope.length);
  let noise = 0;
  let loudest = 0;
  for (let i = 0; i < samples.length; i++) {
    noise += NOISE_SMOOTHING * (2 * Math.random() - 1 - noise);
    samples[i] = noise * (RECEIVER_HISS + envelope[i]);
    loudest = Math.max(loudest, Math.abs(samples[i]));
  }
  return samples.map((sample) => sample / loudest);
}

export function createPulsarSound() {
  let context = null;
  const playing = new Map();

  function begin(pulsar) {
    const samples = radioRecording(pulsar, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(LOUDNESS, context.currentTime + FADE_SECONDS);
    source.connect(gain).connect(context.destination);
    source.start();
    playing.set(pulsar, { source, gain });
  }

  function end(pulsar) {
    const { source, gain } = playing.get(pulsar);
    gain.gain.setValueAtTime(gain.gain.value, context.currentTime);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + FADE_SECONDS);
    source.stop(context.currentTime + FADE_SECONDS);
    playing.delete(pulsar);
  }

  return {
    wake() {
      context ??= new AudioContext();
      context.resume();
    },
    hear(pulsars) {
      if (!context) return;
      for (const pulsar of [...playing.keys()]) if (!pulsars.includes(pulsar)) end(pulsar);
      for (const pulsar of pulsars) if (!playing.has(pulsar)) begin(pulsar);
    },
  };
}
