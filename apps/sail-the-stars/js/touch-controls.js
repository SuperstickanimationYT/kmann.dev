const STICK_DEAD_ZONE = 0.12;
const KNOB_TRAVEL = 0.6;
const DIAL_PIXELS_PER_TEN_TIMES = 40;
const DIAL_TAP_FACTOR = 2;
const DIAL_TAP_PIXELS = 8;

export const touchScreen = window.matchMedia('(pointer: coarse)');

export function createThumbStick(base) {
  const knob = base.querySelector('[data-knob]');
  const push = { across: 0, along: 0 };
  let finger = null;

  function follow({ clientX, clientY }) {
    const box = base.getBoundingClientRect();
    const reach = box.width / 2;
    const right = (clientX - box.left) / reach - 1;
    const up = 1 - (clientY - box.top) / reach;
    const length = Math.max(Math.hypot(right, up), Number.EPSILON);
    const held = Math.min(1, length);
    const strength = (Math.max(0, held - STICK_DEAD_ZONE) / (1 - STICK_DEAD_ZONE)) ** 2;
    push.across = (right / length) * strength;
    push.along = (up / length) * strength;
    const travel = (held / length) * reach * KNOB_TRAVEL;
    knob.style.transform = `translate(${right * travel}px, ${-up * travel}px)`;
  }

  function release() {
    finger = null;
    push.across = 0;
    push.along = 0;
    knob.style.transform = '';
  }

  base.addEventListener('pointerdown', (event) => {
    if (finger !== null) return;
    event.preventDefault();
    finger = event.pointerId;
    base.setPointerCapture(finger);
    follow(event);
  });
  base.addEventListener('pointermove', (event) => event.pointerId === finger && follow(event));
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) base.addEventListener(type, (event) => event.pointerId === finger && release());
  return { push, release };
}

export function createSpeedDial(dial, changeSpeed) {
  const readout = dial.querySelector('[data-dial-speed]');
  let drag = null;

  dial.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dial.setPointerCapture(event.pointerId);
    drag = { y: event.clientY, startY: event.clientY, farthest: 0 };
  });
  dial.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.farthest = Math.max(drag.farthest, Math.abs(event.clientY - drag.startY));
    if (drag.farthest < DIAL_TAP_PIXELS) return;
    changeSpeed(10 ** ((drag.y - event.clientY) / DIAL_PIXELS_PER_TEN_TIMES));
    drag.y = event.clientY;
  });
  dial.addEventListener('pointerup', (event) => {
    if (drag && drag.farthest < DIAL_TAP_PIXELS) {
      const { top, height } = dial.getBoundingClientRect();
      changeSpeed(event.clientY < top + height / 2 ? DIAL_TAP_FACTOR : 1 / DIAL_TAP_FACTOR);
    }
    drag = null;
  });
  dial.addEventListener('pointercancel', () => (drag = null));
  dial.addEventListener('keydown', (event) => {
    if (event.code !== 'ArrowUp' && event.code !== 'ArrowDown') return;
    event.preventDefault();
    event.stopPropagation();
    changeSpeed(event.code === 'ArrowUp' ? DIAL_TAP_FACTOR : 1 / DIAL_TAP_FACTOR);
  });

  return function show(speed, { slowest, top, label }) {
    if (readout.textContent !== label) {
      readout.textContent = label;
      dial.setAttribute('aria-valuetext', label);
    }
    const decades = Math.log10(Math.max(speed, Number.MIN_VALUE));
    dial.setAttribute('aria-valuemin', Math.log10(slowest).toFixed(1));
    dial.setAttribute('aria-valuemax', Math.log10(top).toFixed(1));
    dial.setAttribute('aria-valuenow', decades.toFixed(1));
    dial.style.setProperty('--turned', `${decades * DIAL_PIXELS_PER_TEN_TIMES}px`);
  };
}

const TWIST_BEGINS_AT = 0.18;

export function createTwoFingerGesture({ zoomBy, rollBy }) {
  const fingers = new Map();
  let grip = null;

  function currentGrip() {
    const [first, second] = [...fingers.values()];
    return { spread: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), angle: Math.atan2(second.y - first.y, second.x - first.x) };
  }

  const regrip = () => (grip = fingers.size === 2 ? { ...currentGrip(), twist: 0 } : null);

  return {
    put({ pointerId, clientX, clientY }) {
      fingers.set(pointerId, { x: clientX, y: clientY });
      regrip();
      return fingers.size;
    },
    move({ pointerId, clientX, clientY }) {
      if (!fingers.has(pointerId)) return;
      fingers.set(pointerId, { x: clientX, y: clientY });
      if (!grip) return;
      const now = currentGrip();
      zoomBy(now.spread / grip.spread);
      const turned = Math.atan2(Math.sin(now.angle - grip.angle), Math.cos(now.angle - grip.angle));
      const twisting = Math.abs(grip.twist) > TWIST_BEGINS_AT;
      if (twisting) rollBy(turned);
      grip = { ...now, twist: twisting ? grip.twist : grip.twist + turned };
    },
    lift({ pointerId }) {
      fingers.delete(pointerId);
      regrip();
      return fingers.size === 1 ? [...fingers.entries()].map(([id, place]) => ({ id, ...place }))[0] : null;
    },
  };
}
