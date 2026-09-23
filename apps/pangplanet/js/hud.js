import { BATTERY } from './world.js';

const DIM_SATELLITE_LIGHT = 0.05;

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

function createBatteryCells(container) {
  return Array.from({ length: BATTERY.slots }, () => {
    const cell = document.createElement('span');
    cell.className = 'pp-battery';
    container.append(cell);
    return cell;
  });
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
    engineButton: find('[data-engine-button]'),
    dockPrompt: find('[data-dock-prompt]'),
    crash: find('[data-crash]'),
    mine: find('[data-mine]'),
    stopDrill: find('[data-stop-drill]'),
    drillHint: find('[data-drill-hint]'),
    buy: find('[data-buy]'),
    marketNote: find('[data-market-note]'),
    sunlight: find('[data-sunlight]'),
    batteryCells: createBatteryCells(find('[data-batteries]')),
    panelsToggle: find('[data-panels-toggle]'),
    panelsLabel: find('[data-panels-label]'),
    buyPanels: find('[data-buy-panels]'),
    buyBattery: find('[data-buy-battery]'),
    sellBatteries: find('[data-sell-batteries]'),
    buyWarpDrive: find('[data-buy-warp-drive]'),
    openWarp: find('[data-open-warp]'),
    warpNote: find('[data-warp-note]'),
    destinations: find('[data-destinations]'),
    dockActions: [...root.querySelectorAll('[data-dock-action]')],
    goldCounter: find('[data-gold-counter]'),
    gold: find('[data-gold]'),
    buySatellite: find('[data-buy-satellite]'),
    buyRig: find('[data-buy-rig]'),
    sellGold: find('[data-sell-gold]'),
    deploySatellite: find('[data-deploy-satellite]'),
    deployRig: find('[data-deploy-rig]'),
    satelliteLight: find('[data-satellite-light]'),
    satelliteStored: find('[data-satellite-stored]'),
    satelliteDim: find('[data-satellite-dim]'),
    takeCharge: find('[data-take-charge]'),
    rigSite: find('[data-rig-site]'),
    rigStatus: find('[data-rig-status]'),
    loadRig: find('[data-load-rig]'),
    collectGold: find('[data-collect-gold]'),
    panels: Object.fromEntries([...root.querySelectorAll('[data-panel]')].map((panel) => [panel.dataset.panel, panel])),
  };

  root.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', actions.closePanels));
  parts.mine.addEventListener('click', actions.mine);
  parts.stopDrill.addEventListener('click', actions.stopDrill);
  parts.buy.addEventListener('click', actions.buyFuel);
  parts.panelsToggle.addEventListener('click', actions.togglePanels);
  parts.buyPanels.addEventListener('click', actions.buyPanels);
  parts.buyBattery.addEventListener('click', actions.buyBattery);
  parts.sellBatteries.addEventListener('click', actions.sellBatteries);
  parts.buyWarpDrive.addEventListener('click', actions.buyWarpDrive);
  parts.openWarp.addEventListener('click', actions.openWarp);
  const clicks = {
    buySatellite: actions.buySatellite,
    buyRig: actions.buyRig,
    sellGold: actions.sellGold,
    deploySatellite: actions.deploySatellite,
    deployRig: actions.deployRig,
    takeCharge: actions.takeSatelliteCharge,
    loadRig: actions.loadRig,
    collectGold: actions.collectGold,
  };
  for (const [part, action] of Object.entries(clicks)) parts[part].addEventListener('click', action);
  find('[data-pick-up-satellite]').addEventListener('click', actions.pickUpSatellite);
  find('[data-pick-up-rig]').addEventListener('click', actions.pickUpRig);
  parts.destinations.addEventListener('click', (event) => {
    const button = event.target.closest('[data-star]');
    if (button) actions.warpTo(button.dataset.star);
  });
  let shownDestinations = '';

  function showDestinations(destinations) {
    const signature = destinations.map(({ star, affordable }) => `${star.name}:${affordable}`).join('|');
    if (signature === shownDestinations) return;
    shownDestinations = signature;
    parts.destinations.replaceChildren(
      ...destinations.map(({ star, distance, cost, affordable }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pp-action pp-destination';
        button.dataset.star = star.name;
        button.disabled = !affordable;
        button.textContent = `${star.name} · ${abbreviate(distance)} away · ${cost.toFixed(2)} batteries`;
        return button;
      }),
    );
  }
  find('[data-help-toggle]').addEventListener('click', actions.toggleHelp);
  find('[data-restart]').addEventListener('click', actions.restart);
  const cheatsToggle = find('[data-cheats-toggle]');
  cheatsToggle.hidden = !new URLSearchParams(window.location.search).has('cheats');
  cheatsToggle.addEventListener('click', actions.toggleCheats);
  root.querySelectorAll('[data-cheat]').forEach((button) => button.addEventListener('click', () => actions.cheat(button.dataset.cheat)));
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
    parts.engineButton.classList.toggle('is-on', status.engineOn);
    setHidden(parts.dockPrompt, !status.canDock);
    setHidden(parts.crash, !status.destroyed);
    setHidden(parts.mine, !status.canMine);
    setHidden(parts.stopDrill, !status.drillBusy);
    setHidden(parts.drillHint, !status.drillAwaitingClick);
    parts.buy.disabled = !status.canBuy;
    setText(parts.marketNote, status.marketNote);
    setText(parts.sunlight, `${Math.round(status.sunlight * 100)}%`);
    parts.batteryCells.forEach((cell, slot) => {
      const charge = status.batteries[slot];
      setHidden(cell, charge === undefined);
      cell.style.setProperty('--charge', `${(charge ?? 0) * 100}%`);
      cell.classList.toggle('is-full', charge >= 1);
    });
    setHidden(parts.panelsToggle, !status.ownsPanels);
    setText(parts.panelsLabel, status.panelsDeployed ? 'Stow solar panels' : 'Deploy solar panels');
    setHidden(parts.buyPanels, status.ownsPanels);
    setHidden(parts.buyWarpDrive, status.ownsWarpDrive);
    parts.buyWarpDrive.disabled = !status.canBuyWarpDrive;
    setHidden(parts.openWarp, !status.ownsWarpDrive);
    setText(parts.warpNote, status.warpNote);
    parts.dockActions.forEach((action) => setText(action, status.dockAction));
    setHidden(parts.goldCounter, status.gold === 0 && !status.rig);
    setText(parts.gold, String(status.gold));
    setHidden(parts.buySatellite, Boolean(status.satellite));
    parts.buySatellite.disabled = !status.canBuySatellite;
    setHidden(parts.buyRig, Boolean(status.rig));
    parts.buyRig.disabled = !status.canBuyRig;
    setHidden(parts.sellGold, !status.rig && status.gold === 0);
    parts.sellGold.disabled = status.gold === 0;
    setHidden(parts.deploySatellite, !status.canDeploySatellite);
    setHidden(parts.deployRig, !status.canDeployRig);
    updateSatellite(status);
    updateRig(status);
    showDestinations(status.warpDestinations);
    parts.buyPanels.disabled = !status.canBuyPanels;
    parts.buyBattery.disabled = !status.canBuyBattery;
    parts.sellBatteries.disabled = !status.canSellBatteries;
  }

  function updateSatellite({ satellite, canTakeSatelliteCharge }) {
    if (!satellite) return;
    const stored = satellite.batteries.reduce((sum, charge) => sum + charge, 0);
    setText(parts.satelliteLight, satellite.light < 0.01 ? 'under 1%' : `${Math.round(satellite.light * 100)}%`);
    setHidden(parts.satelliteDim, satellite.light >= DIM_SATELLITE_LIGHT);
    setText(parts.satelliteStored, `Stored: ${stored.toFixed(2)} of ${satellite.batteries.length} batteries.`);
    parts.takeCharge.disabled = !canTakeSatelliteCharge;
  }

  function updateRig({ rig, canLoadRig }) {
    if (!rig) return;
    const minutesLeft = Math.ceil(rig.secondsLeft / 60);
    setText(parts.rigSite, rig.site);
    setText(parts.rigStatus, `Power: ${rig.charge.toFixed(2)} batteries (${minutesLeft} min left). Gold waiting: ${Math.floor(rig.gold)}.`);
    parts.loadRig.disabled = !canLoadRig;
    parts.collectGold.disabled = rig.gold < 1;
  }

  return { showPanel, update };
}
