const PACKING = 'control-changes';
const SAME = 0;
const UP = 1;
const DOWN = 2;
const LITERAL = 3;
const THROTTLE_SHIFT = 2;
const ENGINE_ON = 1 << 4;
const NEW_THRUST = 1 << 5;
const ONE_STEP_LATER = 1 << 6;
const VARINT_MORE = 0x80;
const VARINT_BITS = 0x7f;
const BASE64_CHUNK = 0x8000;

const START = { step: 0, throttle: NaN, heading: NaN, thrust: NaN };

function changeOf(value, previous, nudge) {
  if (value === previous) return SAME;
  if (value === previous + nudge) return UP;
  if (value === previous - nudge) return DOWN;
  return LITERAL;
}

function applyChange(change, previous, nudge, readLiteral) {
  if (change === SAME) return previous;
  if (change === UP) return previous + nudge;
  if (change === DOWN) return previous - nudge;
  return readLiteral();
}

function createWriter() {
  const bytes = [];
  const float = new DataView(new ArrayBuffer(8));
  return {
    bytes,
    byte: (value) => bytes.push(value),
    float(value) {
      float.setFloat64(0, value, true);
      for (let i = 0; i < 8; i++) bytes.push(float.getUint8(i));
    },
    varint(value) {
      let rest = value;
      while (rest > VARINT_BITS) {
        bytes.push((rest & VARINT_BITS) | VARINT_MORE);
        rest = Math.floor(rest / 128);
      }
      bytes.push(rest);
    },
  };
}

function createReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  return {
    byte: () => bytes[at++],
    float() {
      const value = view.getFloat64(at, true);
      at += 8;
      return value;
    },
    varint() {
      let value = 0;
      let scale = 1;
      for (;;) {
        const byte = bytes[at++];
        value += (byte & VARINT_BITS) * scale;
        if (!(byte & VARINT_MORE)) return value;
        scale *= 128;
      }
    },
  };
}

function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) text += String.fromCharCode(...bytes.slice(i, i + BASE64_CHUNK));
  return btoa(text);
}

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

function encode(controls, turn, throttleStep) {
  const out = createWriter();
  let previous = START;
  for (const [step, engineOn, throttle, heading, thrust] of controls) {
    const headingChange = changeOf(heading, previous.heading, turn);
    const throttleChange = changeOf(throttle, previous.throttle, throttleStep);
    const thrustChanged = thrust !== previous.thrust;
    const oneStepLater = step - previous.step === 1;
    out.byte(headingChange | (throttleChange << THROTTLE_SHIFT) | (engineOn ? ENGINE_ON : 0) | (thrustChanged ? NEW_THRUST : 0) | (oneStepLater ? ONE_STEP_LATER : 0));
    if (!oneStepLater) out.varint(step - previous.step);
    if (headingChange === LITERAL) out.float(heading);
    if (throttleChange === LITERAL) out.float(throttle);
    if (thrustChanged) out.float(thrust);
    previous = { step, throttle, heading, thrust };
  }
  return out.bytes;
}

function decode({ turn, throttleStep, count, data }) {
  const read = createReader(fromBase64(data));
  const controls = [];
  let previous = START;
  for (let i = 0; i < count; i++) {
    const flags = read.byte();
    const step = previous.step + (flags & ONE_STEP_LATER ? 1 : read.varint());
    const heading = applyChange(flags & 3, previous.heading, turn, read.float);
    const throttle = applyChange((flags >> THROTTLE_SHIFT) & 3, previous.throttle, throttleStep, read.float);
    const thrust = flags & NEW_THRUST ? read.float() : previous.thrust;
    controls.push([step, Boolean(flags & ENGINE_ON), throttle, heading, thrust]);
    previous = { step, throttle, heading, thrust };
  }
  return controls;
}

const sameControls = (a, b) => a.length === b.length && a.every((entry, i) => entry.every((value, j) => value === b[i][j]));

export function packControls(controls, { turn, throttleChange }) {
  const packed = { packing: PACKING, turn, throttleStep: throttleChange, count: controls.length, data: toBase64(encode(controls, turn, throttleChange)) };
  return sameControls(decode(packed), controls) ? packed : controls;
}

export const unpackControls = (controls) => (controls?.packing === PACKING ? decode(controls) : controls);
