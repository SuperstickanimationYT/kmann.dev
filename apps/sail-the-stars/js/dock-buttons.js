const TIP_EDGE_PX = 8;
const TIP_LIFT_PX = 14;
const BUTTONS = 'button:not([data-tray])';

export function nameButton(button, name, icon) {
  const label = button.querySelector('.fh-name');
  if (label.textContent !== name) label.textContent = name;
  if (icon) button.querySelector('use').setAttribute('href', `#icon-${icon}`);
}

const nameOf = (button) => button.dataset.tipName ?? button.getAttribute('aria-label') ?? button.querySelector('.fh-name').textContent;
const element = (tag, textContent) => Object.assign(document.createElement(tag), { textContent });

function contentsFor(button) {
  const parts = [element('strong', nameOf(button))];
  const key = button.getAttribute('aria-keyshortcuts');
  if (key) parts.push(' ', element('kbd', key));
  const description = button.getAttribute('aria-description');
  if (description) parts.push(element('span', description));
  return parts;
}

export function showTipsAbove(dock, tip) {
  let pointed = null;

  function hide() {
    pointed = null;
    tip.hidden = true;
  }

  function show(button) {
    pointed = button;
    tip.replaceChildren(...contentsFor(button));
    tip.hidden = false;
    const room = dock.getBoundingClientRect();
    const spot = button.getBoundingClientRect();
    const middle = spot.left + spot.width / 2 - room.left - tip.offsetWidth / 2;
    tip.style.left = `${Math.max(TIP_EDGE_PX, Math.min(room.width - tip.offsetWidth - TIP_EDGE_PX, middle))}px`;
    tip.style.bottom = `${room.bottom - spot.top + TIP_LIFT_PX}px`;
  }

  const buttonAt = (target) => (target instanceof Element && dock.contains(target) ? target.closest(BUTTONS) : null);

  document.addEventListener('pointerover', ({ target, pointerType }) => {
    const button = pointerType === 'touch' ? null : buttonAt(target);
    if (button && button !== pointed) show(button);
    else if (!button) hide();
  });
  dock.addEventListener('focusin', ({ target }) => {
    const button = buttonAt(target);
    if (button?.matches(':focus-visible')) show(button);
  });
  dock.addEventListener('focusout', hide);
  dock.addEventListener('click', ({ target }) => {
    if (!pointed || buttonAt(target) !== pointed) return;
    if (pointed.offsetParent) show(pointed);
    else hide();
  });
  document.addEventListener('keydown', ({ key }) => key === 'Escape' && hide());
}
