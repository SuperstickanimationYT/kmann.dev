const SPOT_PADDING_PX = 6;
const ROCKET_SPOT_PX = 90;
const BUBBLE_GAP_PX = 12;
const STAGE_MARGIN_PX = 12;

const STEPS = [
  {
    target: 'rocket',
    text: {
      touch: "This is your rocket. The blue line shows where you'll coast with the engine off. Tap the rocket for its menu: drill for fuel, solar panels, warp.",
      keys: "This is your rocket. The blue line shows where you'll coast with the engine off. Click the rocket for its menu: drill for fuel, solar panels, warp.",
    },
  },
  {
    target: { touch: '.pp-touch-controls', keys: '.pp-telemetry' },
    text: {
      touch: 'Engine switches thrust on and off. Hold ⟲ ⟳ to turn and − + to set the throttle.',
      keys: 'Space switches the engine on and off. Q and E turn, Shift and Ctrl set the throttle.',
    },
  },
  { target: '.pp-telemetry', text: 'Where you are, your altitude and your speed. Touch down slower than 10 or the rocket explodes.' },
  { target: '.pp-fuel', text: 'Fuel. Land on any planet or moon and drill to refill, or buy it at the market beside Earth.' },
  { target: '.pp-tokens', text: 'Galactokens. The first landing on each planet or moon pays a bounty. Spend them at the market.' },
  {
    target: '.pp-warp',
    text: {
      touch: 'Time warp: drag to speed up long coasts through empty space. It locks to 1× near planets and stars.',
      keys: 'Time warp: Shift + scroll, or , and . to speed up long coasts through empty space. It locks to 1× near planets and stars.',
    },
  },
  { target: '[data-map-toggle]', text: "Galaxy map: stars you've found, bounties, crystals and drone routes." },
  { target: '[data-help-toggle]', text: "That's the basics. Press ? any time for the full guide and controls.", last: true },
];

const inputMode = () => (window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys');
const forMode = (value) => (typeof value === 'string' ? value : value[inputMode()]);

function element(tag, className, text = '') {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

export function createTour(stage, { onEnd, openGuide }) {
  const spot = element('div', 'pp-tour-spot');
  const bubble = element('div', 'pp-tour-bubble');
  const text = element('p', 'pp-tour-text');
  const count = element('span', 'pp-tour-count');
  const back = element('button', 'pp-action', 'Back');
  const skip = element('button', 'pp-action', 'Skip');
  const guide = element('button', 'pp-action', 'Open guide');
  const next = element('button', 'pp-action pp-tour-next', 'Next');
  const buttons = element('div', 'pp-tour-buttons');
  buttons.append(count, back, skip, guide, next);
  bubble.append(text, buttons);
  for (const button of [back, skip, guide, next]) button.type = 'button';
  let steps = [];
  let index = -1;

  function targetRect(step) {
    const stageBox = stage.getBoundingClientRect();
    const target = forMode(step.target);
    if (target === 'rocket') {
      const canvasBox = stage.querySelector('canvas').getBoundingClientRect();
      const half = ROCKET_SPOT_PX / 2;
      return { left: canvasBox.left + canvasBox.width / 2 - stageBox.left - half, top: canvasBox.top + canvasBox.height / 2 - stageBox.top - half, width: ROCKET_SPOT_PX, height: ROCKET_SPOT_PX, round: true };
    }
    const box = stage.querySelector(target)?.getBoundingClientRect();
    if (!box?.width) return null;
    return { left: box.left - stageBox.left, top: box.top - stageBox.top, width: box.width, height: box.height, round: false };
  }

  function place() {
    const rect = targetRect(steps[index]);
    if (!rect) return;
    const pad = rect.round ? 0 : SPOT_PADDING_PX;
    Object.assign(spot.style, { left: `${rect.left - pad}px`, top: `${rect.top - pad}px`, width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px` });
    spot.classList.toggle('is-round', rect.round);
    const { clientWidth: stageWidth, clientHeight: stageHeight } = stage;
    const { offsetWidth: width, offsetHeight: height } = bubble;
    const below = rect.top + rect.height + pad + BUBBLE_GAP_PX;
    const above = rect.top - pad - BUBBLE_GAP_PX - height;
    const top = below + height <= stageHeight - STAGE_MARGIN_PX || above < STAGE_MARGIN_PX ? below : above;
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, STAGE_MARGIN_PX), stageWidth - width - STAGE_MARGIN_PX);
    Object.assign(bubble.style, { left: `${left}px`, top: `${Math.min(Math.max(top, STAGE_MARGIN_PX), stageHeight - height - STAGE_MARGIN_PX)}px` });
  }

  function show(at) {
    index = at;
    const step = steps[index];
    text.textContent = forMode(step.text);
    count.textContent = `${index + 1}/${steps.length}`;
    back.hidden = index === 0;
    skip.hidden = Boolean(step.last);
    guide.hidden = !step.last;
    next.textContent = step.last ? 'Done' : 'Next';
    place();
  }

  function stop() {
    if (index < 0) return;
    index = -1;
    spot.remove();
    bubble.remove();
    window.removeEventListener('resize', place);
    onEnd();
  }

  function start() {
    steps = STEPS.filter((step) => targetRect(step));
    if (!steps.length) return;
    stage.append(spot, bubble);
    window.addEventListener('resize', place);
    show(0);
  }

  back.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => (index < steps.length - 1 ? show(index + 1) : stop()));
  skip.addEventListener('click', stop);
  guide.addEventListener('click', () => {
    stop();
    openGuide();
  });

  return { start, stop, running: () => index >= 0 };
}
