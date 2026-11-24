function envelope(param, time, duration, { attack, decay, sustain, release, peak }) {
  const held = Math.max(duration, attack);
  param.setValueAtTime(0.0001, time);
  param.linearRampToValueAtTime(peak, time + attack);
  param.setTargetAtTime(Math.max(peak * sustain, 0.0001), time + attack, decay / 3);
  param.setTargetAtTime(0.0001, time + held, release / 3);
  return time + held + release * 2;
}

function oscillator(context, type, frequency, detune = 0) {
  const node = context.createOscillator();
  node.type = type;
  node.frequency.value = frequency;
  node.detune.value = detune;
  return node;
}

function lowpass(context, frequency, q = 0.7) {
  const node = context.createBiquadFilter();
  node.type = 'lowpass';
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function voice(context, output, time, duration, velocity, shape, build) {
  const amp = context.createGain();
  amp.connect(output);
  const end = envelope(amp.gain, time, duration, { ...shape, peak: shape.peak * velocity });
  const sources = build(amp, end);
  for (const source of sources) {
    source.start(time);
    source.stop(end);
  }
  sources[0].onended = () => amp.disconnect();
}

function vibrato(context, time, targets, cents, delay) {
  const lfo = oscillator(context, 'sine', 5.2);
  const depth = context.createGain();
  depth.gain.setValueAtTime(0, time);
  depth.gain.linearRampToValueAtTime(cents, time + delay);
  lfo.connect(depth);
  for (const target of targets) depth.connect(target.detune);
  return lfo;
}

export const INSTRUMENTS = {
  piano: {
    label: 'Piano',
    octave: 4,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.004, decay: 1.8, sustain: 0, release: 0.25, peak: 0.45 }, (amp) => {
        const filter = lowpass(context, Math.min(frequency * 8, 9000));
        const body = oscillator(context, 'triangle', frequency);
        const shimmer = oscillator(context, 'sine', frequency * 2);
        const shimmerLevel = context.createGain();
        shimmerLevel.gain.value = 0.3;
        body.connect(filter);
        shimmer.connect(shimmerLevel).connect(filter);
        filter.connect(amp);
        return [body, shimmer];
      });
    },
  },
  marimba: {
    label: 'Marimba',
    octave: 4,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, Math.min(duration, 0.05), velocity, { attack: 0.002, decay: 0.7, sustain: 0, release: 0.3, peak: 0.7 }, (amp) => {
        const body = oscillator(context, 'sine', frequency);
        const knock = oscillator(context, 'sine', frequency * 4);
        const knockLevel = context.createGain();
        knockLevel.gain.setValueAtTime(0.35, time);
        knockLevel.gain.setTargetAtTime(0.0001, time, 0.02);
        body.connect(amp);
        knock.connect(knockLevel).connect(amp);
        return [body, knock];
      });
    },
  },
  pluck: {
    label: 'Guitar pluck',
    octave: 3,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.002, decay: 1.2, sustain: 0, release: 0.15, peak: 0.4 }, (amp) => {
        const filter = lowpass(context, 5000, 1.5);
        filter.frequency.setValueAtTime(5000, time);
        filter.frequency.setTargetAtTime(frequency * 1.5, time, 0.08);
        const string = oscillator(context, 'sawtooth', frequency);
        string.connect(filter).connect(amp);
        return [string];
      });
    },
  },
  lead: {
    label: 'Synth lead',
    octave: 4,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.01, decay: 0.25, sustain: 0.7, release: 0.12, peak: 0.2 }, (amp) => {
        const filter = lowpass(context, 2600, 2);
        const left = oscillator(context, 'sawtooth', frequency, -7);
        const right = oscillator(context, 'sawtooth', frequency, 7);
        const wobble = vibrato(context, time, [left, right], 12, 0.3);
        left.connect(filter);
        right.connect(filter);
        filter.connect(amp);
        return [left, right, wobble];
      });
    },
  },
  pad: {
    label: 'Soft pad',
    octave: 3,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.35, decay: 0.6, sustain: 0.8, release: 0.9, peak: 0.12 }, (amp) => {
        const filter = lowpass(context, 1500);
        const layers = [-12, 0, 12].map((detune) => oscillator(context, 'sawtooth', frequency, detune));
        for (const layer of layers) layer.connect(filter);
        filter.connect(amp);
        return layers;
      });
    },
  },
  bass: {
    label: 'Bass',
    octave: 2,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.004, decay: 0.3, sustain: 0.6, release: 0.08, peak: 0.4 }, (amp) => {
        const filter = lowpass(context, 1400, 3);
        filter.frequency.setValueAtTime(1400, time);
        filter.frequency.setTargetAtTime(300, time, 0.1);
        const growl = oscillator(context, 'square', frequency);
        const sub = oscillator(context, 'sine', frequency);
        growl.connect(filter);
        sub.connect(filter);
        filter.connect(amp);
        return [growl, sub];
      });
    },
  },
  bell: {
    label: 'Bell',
    octave: 5,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.002, decay: 2.4, sustain: 0, release: 0.5, peak: 0.28 }, (amp) => {
        const carrier = oscillator(context, 'sine', frequency);
        const modulator = oscillator(context, 'sine', frequency * 3.5);
        const index = context.createGain();
        index.gain.setValueAtTime(frequency * 2.5, time);
        index.gain.setTargetAtTime(frequency * 0.2, time, 0.4);
        modulator.connect(index).connect(carrier.frequency);
        carrier.connect(amp);
        return [carrier, modulator];
      });
    },
  },
  flute: {
    label: 'Flute',
    octave: 5,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.07, decay: 0.2, sustain: 0.85, release: 0.12, peak: 0.32 }, (amp) => {
        const tone = oscillator(context, 'sine', frequency);
        const edge = oscillator(context, 'triangle', frequency * 2);
        const edgeLevel = context.createGain();
        edgeLevel.gain.value = 0.12;
        const wobble = vibrato(context, time, [tone, edge], 10, 0.35);
        tone.connect(amp);
        edge.connect(edgeLevel).connect(amp);
        return [tone, edge, wobble];
      });
    },
  },
  chip: {
    label: '8-bit',
    octave: 4,
    play(context, output, time, frequency, duration, velocity) {
      voice(context, output, time, duration, velocity, { attack: 0.002, decay: 0.1, sustain: 0.6, release: 0.03, peak: 0.13 }, (amp) => {
        const square = oscillator(context, 'square', frequency);
        square.connect(amp);
        return [square];
      });
    },
  },
};
