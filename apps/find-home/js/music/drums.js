const noiseBuffers = new WeakMap();

function noise(context) {
  if (!noiseBuffers.has(context)) {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noiseBuffers.set(context, buffer);
  }
  const source = context.createBufferSource();
  source.buffer = noiseBuffers.get(context);
  source.loop = true;
  return source;
}

function filter(context, type, frequency, q = 0.7) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function decayingGain(context, time, peak, decay) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(peak, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  return gain;
}

function fire(source, time, length, output, ...chain) {
  let node = source;
  for (const next of chain) node = node.connect(next);
  node.connect(output);
  source.start(time);
  source.stop(time + length);
  source.onended = () => chain.at(-1).disconnect();
}

function burst(context, output, time, velocity, { type, frequency, q, peak, decay }) {
  fire(noise(context), time, decay + 0.05, output, filter(context, type, frequency, q), decayingGain(context, time, peak * velocity, decay));
}

function thump(context, output, time, velocity, { from, to, sweep, peak, decay }) {
  const body = context.createOscillator();
  body.frequency.setValueAtTime(from, time);
  body.frequency.exponentialRampToValueAtTime(to, time + sweep);
  fire(body, time, decay + 0.05, output, decayingGain(context, time, peak * velocity, decay));
}

export const DRUMS = [
  { label: 'Kick', color: '#ff6b6b', play: (context, output, time, velocity) => thump(context, output, time, velocity, { from: 150, to: 42, sweep: 0.12, peak: 1, decay: 0.45 }) },
  { label: 'Tom', color: '#ffa94d', play: (context, output, time, velocity) => thump(context, output, time, velocity, { from: 220, to: 110, sweep: 0.2, peak: 0.7, decay: 0.4 }) },
  {
    label: 'Snare',
    color: '#ffd43b',
    play(context, output, time, velocity) {
      burst(context, output, time, velocity, { type: 'highpass', frequency: 1200, peak: 0.5, decay: 0.18 });
      thump(context, output, time, velocity, { from: 240, to: 170, sweep: 0.05, peak: 0.4, decay: 0.1 });
    },
  },
  {
    label: 'Clap',
    color: '#69db7c',
    play(context, output, time, velocity) {
      for (const offset of [0, 0.012, 0.024]) burst(context, output, time + offset, velocity, { type: 'bandpass', frequency: 1500, q: 1.2, peak: 0.6, decay: offset ? 0.03 : 0.22 });
    },
  },
  { label: 'Hi-hat', color: '#4dabf7', play: (context, output, time, velocity) => burst(context, output, time, velocity, { type: 'highpass', frequency: 7500, peak: 0.28, decay: 0.05 }) },
  { label: 'Open hat', color: '#9775fa', play: (context, output, time, velocity) => burst(context, output, time, velocity, { type: 'highpass', frequency: 7000, peak: 0.22, decay: 0.32 }) },
  { label: 'Crash', color: '#f783ac', play: (context, output, time, velocity) => burst(context, output, time, velocity, { type: 'highpass', frequency: 4500, peak: 0.2, decay: 1.3 }) },
];
