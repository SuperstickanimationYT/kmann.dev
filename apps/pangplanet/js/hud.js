import { MAX_BATTERY_SLOTS } from './world.js';

const DIM_SATELLITE_LIGHT = 0.05;
const TOAST_MS = 4500;
const UPGRADE_TEXT = {
  batterySlots: { name: 'Battery rack', describe: (value) => `${value} slots` },
  panels: { name: 'Solar panels', describe: (value) => `${value}× charging` },
  tank: { name: 'Fuel tank', describe: (value) => `${value} fuel` },
  engine: { name: 'Engine', describe: (value) => `${value}× thrust` },
  telescope: { name: 'Telescope', describe: (value) => `${abbreviate(value)} range` },
  timewarp: { name: 'Time warp', describe: (value) => `up to ${value}x` },
};

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
  return Array.from({ length: MAX_BATTERY_SLOTS }, () => {
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
    upgrades: find('[data-upgrades]'),
    toast: find('[data-toast]'),
    buyTelescope: find('[data-buy-telescope]'),
    scan: find('[data-scan]'),
    mapInfo: find('[data-map-info]'),
    warpSlider: find('[data-warp-slider]'),
    mapCloseUp: find('[data-map-close-up]'),
    bountyHere: find('[data-bounty-here]'),
    buyBank: find('[data-buy-bank]'),
    deployBank: find('[data-deploy-bank]'),
    bankStored: find('[data-bank-stored]'),
    depositInBank: find('[data-deposit-in-bank]'),
    takeFromBank: find('[data-take-from-bank]'),
    buyAntenna: find('[data-buy-antenna]'),
    deployAntenna: find('[data-deploy-antenna]'),
    antennasInHold: find('[data-antennas-in-hold]'),
    pickUpAntenna: find('[data-pick-up-antenna]'),
    openDrone: find('[data-open-drone]'),
    buyDrone: find('[data-buy-drone]'),
    deployDrone: find('[data-deploy-drone]'),
    droneStatus: find('[data-drone-status]'),
    recordRoute: find('[data-record-route]'),
    toggleDroneRuns: find('[data-toggle-drone-runs]'),
    pickUpDrone: find('[data-pick-up-drone]'),
    recording: find('[data-recording]'),
    recordingTime: find('[data-recording-time]'),
    recordingHint: find('[data-recording-hint]'),
    finishRecording: find('[data-finish-recording]'),
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
    buyBank: actions.buyBank,
    deployBank: actions.deployBank,
    depositInBank: actions.depositInBank,
    takeFromBank: actions.takeFromBank,
    buyAntenna: actions.buyAntenna,
    deployAntenna: actions.deployAntenna,
    buyDrone: actions.buyDrone,
    deployDrone: actions.deployDrone,
    recordRoute: actions.recordRoute,
    toggleDroneRuns: actions.toggleDroneRuns,
    pickUpDrone: actions.pickUpDrone,
    finishRecording: actions.finishRecording,
  };
  for (const [part, action] of Object.entries(clicks)) parts[part].addEventListener('click', action);
  find('[data-pick-up-satellite]').addEventListener('click', actions.pickUpSatellite);
  find('[data-pick-up-rig]').addEventListener('click', actions.pickUpRig);
  find('[data-pick-up-bank]').addEventListener('click', actions.pickUpBank);
  parts.pickUpAntenna.addEventListener('click', actions.pickUpAntenna);
  parts.openDrone.addEventListener('click', actions.openDrone);
  find('[data-cancel-recording]').addEventListener('click', actions.cancelRecording);
  parts.destinations.addEventListener('click', (event) => {
    const button = event.target.closest('[data-star]');
    if (button) actions.warpTo(button.dataset.star);
  });
  parts.buyTelescope.addEventListener('click', actions.buyTelescope);
  parts.scan.addEventListener('click', actions.scan);
  parts.upgrades.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade]');
    if (button) actions.buyUpgrade(button.dataset.upgrade);
  });
  let shownDestinations = '';
  let shownUpgrades = '';
  let toastTimer = 0;

  function toast(text) {
    setText(parts.toast, text);
    setHidden(parts.toast, false);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setHidden(parts.toast, true), TOAST_MS);
  }

  function showUpgrades(upgrades) {
    const signature = upgrades.map(({ key, current, affordable }) => `${key}:${current}:${affordable}`).join('|');
    if (signature === shownUpgrades) return;
    shownUpgrades = signature;
    parts.upgrades.replaceChildren(
      ...upgrades.map(({ key, current, next, affordable }) => {
        const { name, describe } = UPGRADE_TEXT[key];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pp-action pp-upgrade';
        button.dataset.upgrade = key;
        button.disabled = !affordable;
        button.textContent = next ? `${name}: ${describe(current)} → ${describe(next.value)} · ${next.cost}` : `${name}: ${describe(current)} (max)`;
        return button;
      }),
    );
  }

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
  find('[data-map-toggle]').addEventListener('click', actions.toggleMap);
  find('[data-map]').addEventListener('click', (event) => actions.pickOnMap(event.clientX, event.clientY));
  root.querySelectorAll('[data-map-view]').forEach((button) => button.addEventListener('click', () => actions.mapView(button.dataset.mapView)));
  parts.mapCloseUp.addEventListener('click', actions.mapCloseUp);
  root.querySelectorAll('[data-map-zoom]').forEach((button) => button.addEventListener('click', () => actions.mapZoom(button.dataset.mapZoom)));
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
    parts.fuelBar.style.width = `${status.fuelFraction * 100}%`;
    setText(parts.warp, `${status.timewarp}x`);
    parts.warpKnob.style.bottom = `${((status.timewarp - 1) / (status.timewarpBought - 1)) * 100}%`;
    parts.warpSlider.classList.toggle('is-held', status.timewarpHeld);
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
    showUpgrades(status.upgrades);
    setHidden(parts.buyTelescope, status.ownsTelescope);
    parts.buyTelescope.disabled = !status.canBuyTelescope;
    setHidden(parts.scan, !status.ownsTelescope);
    setText(parts.mapInfo, status.mapInfo);
    setHidden(parts.mapCloseUp, !status.canCloseUp);
    setHidden(parts.bountyHere, !status.bountyHere);
    setText(parts.bountyHere, `Bounty ${status.bountyHere}`);
    updateSatellite(status);
    updateRig(status);
    updateBank(status);
    updateDrones(status);
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

  function updateBank({ bank, canBuyBank, canDeployBank, canDepositInBank, canTakeFromBank }) {
    setHidden(parts.buyBank, Boolean(bank));
    parts.buyBank.disabled = !canBuyBank;
    setHidden(parts.deployBank, !canDeployBank);
    if (!bank) return;
    const stored = bank.batteries.reduce((sum, charge) => sum + charge, 0);
    setText(parts.bankStored, `Stored: ${stored.toFixed(2)} of ${bank.batteries.length} batteries.`);
    parts.depositInBank.disabled = !canDepositInBank;
    parts.takeFromBank.disabled = !canTakeFromBank;
  }

  function updateDrones(status) {
    parts.buyAntenna.disabled = !status.canBuyAntenna;
    setHidden(parts.deployAntenna, !status.canDeployAntenna);
    setText(parts.antennasInHold, String(status.antennasInHold));
    setHidden(parts.pickUpAntenna, !status.canPickUpAntenna);
    setHidden(parts.openDrone, !status.nearDrone);
    setHidden(parts.buyDrone, status.ownsDrone);
    parts.buyDrone.disabled = !status.canBuyDrone;
    setHidden(parts.deployDrone, !status.canDeployDrone);
    setText(parts.droneStatus, status.droneStatus);
    parts.recordRoute.disabled = !status.canRecordRoute;
    setHidden(parts.toggleDroneRuns, !status.canToggleDroneRuns);
    setText(parts.toggleDroneRuns, status.droneRunning ? 'Pause runs' : 'Start runs');
    parts.pickUpDrone.disabled = !status.canPickUpDrone;
    const recording = status.recordingSeconds !== null;
    setHidden(parts.recording, !recording);
    if (!recording) return;
    const seconds = Math.floor(status.recordingSeconds);
    setText(parts.recordingTime, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    setHidden(parts.recordingHint, status.canFinishRecording);
    setHidden(parts.finishRecording, !status.canFinishRecording);
  }

  return { showPanel, update, toast };
}
