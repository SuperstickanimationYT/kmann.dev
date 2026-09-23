const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

export function abbreviate(value, decimals = 1) {
  let tier = 0;
  let scaled = value;
  while (Math.abs(scaled) >= 1000 && tier < SUFFIXES.length - 1) {
    scaled /= 1000;
    tier++;
  }
  const factor = 10 ** (tier === 0 ? 0 : decimals);
  return `${Math.floor(scaled * factor) / factor}${SUFFIXES[tier]}`;
}

function setText(element, text) {
  if (element.textContent !== text) element.textContent = text;
}

function setHidden(element, hidden) {
  if (element.hidden !== hidden) element.hidden = hidden;
}

export function createHud(root, actions) {
  const find = (selector) => root.querySelector(selector);
  const parts = {
    tokens: find('[data-tokens]'),
    fuel: find('[data-fuel]'),
    fuelBar: find('[data-fuel-bar]'),
    warp: find('[data-warp]'),
    warpKnob: find('[data-warp-knob]'),
    location: find('[data-location]'),
    altitude: find('[data-altitude]'),
    speed: find('[data-speed]'),
    throttle: find('[data-throttle]'),
    engine: find('[data-engine]'),
    dockPrompt: find('[data-dock-prompt]'),
    crash: find('[data-crash]'),
    mine: find('[data-mine]'),
    stopDrill: find('[data-stop-drill]'),
    drillHint: find('[data-drill-hint]'),
    buy: find('[data-buy]'),
    marketNote: find('[data-market-note]'),
    panels: Object.fromEntries([...root.querySelectorAll('[data-panel]')].map((panel) => [panel.dataset.panel, panel])),
  };

  root.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', actions.closePanels));
  parts.mine.addEventListener('click', actions.mine);
  parts.stopDrill.addEventListener('click', actions.stopDrill);
  parts.buy.addEventListener('click', actions.buyFuel);
  find('[data-help-toggle]').addEventListener('click', actions.toggleHelp);
  find('[data-fullscreen]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.();
  });

  function showPanel(name) {
    for (const [key, panel] of Object.entries(parts.panels)) setHidden(panel, key !== name);
  }

  function update(status) {
    setText(parts.tokens, String(status.galactokens));
    setText(parts.fuel, String(Math.floor(status.fuel)));
    parts.fuelBar.style.width = `${status.fuel}%`;
    setText(parts.warp, `${status.timewarp}x`);
    parts.warpKnob.style.bottom = `${((status.timewarp - 1) / 99) * 100}%`;
    setText(parts.location, status.location);
    setText(parts.altitude, status.altitude === null ? '—' : abbreviate(status.altitude));
    setText(parts.speed, abbreviate(status.speed));
    setText(parts.throttle, `${Math.round(status.throttle)}%`);
    setText(parts.engine, status.engineOn ? 'on' : 'off');
    parts.engine.classList.toggle('is-on', status.engineOn);
    setHidden(parts.dockPrompt, !status.canDock);
    setHidden(parts.crash, !status.destroyed);
    setHidden(parts.mine, !status.canMine);
    setHidden(parts.stopDrill, !status.drillBusy);
    setHidden(parts.drillHint, !status.drillAwaitingClick);
    parts.buy.disabled = !status.canBuy;
    setText(parts.marketNote, status.marketNote);
  }

  return { showPanel, update };
}
