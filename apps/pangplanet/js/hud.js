import { MAX_BATTERY_SLOTS } from './world.js';

const DIM_SATELLITE_LIGHT = 0.05;
const TOAST_MS = 4500;
const QUEUED_TOAST_MS = 2500;
const MAX_QUEUED_TOASTS = 3;
const BECKON_MS = 6000;
const UPGRADE_TEXT = {
  batterySlots: { name: 'Battery rack', describe: (value) => `${value} slots` },
  panels: { name: 'Solar panels', describe: (value) => `${value}× charging` },
  tank: { name: 'Fuel tank', describe: (value) => `${value} fuel` },
  engine: { name: 'Engine', describe: (value) => `${value}× thrust` },
  telescope: { name: 'Telescope', describe: (value) => `${abbreviate(value)} range` },
  timewarp: { name: 'Time warp', describe: (value) => `up to ${value}x` },
  warpRange: { name: 'Warp range', describe: (value) => `${abbreviate(value)} jumps` },
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
    dockSlow: find('[data-dock-slow]'),
    crash: find('[data-crash]'),
    abandon: find('[data-abandon]'),
    mine: find('[data-mine]'),
    stopDrill: find('[data-stop-drill]'),
    drillHint: find('[data-drill-hint]'),
    buy: find('[data-buy]'),
    fillTank: find('[data-fill-tank]'),
    fillTankCost: find('[data-fill-tank-cost]'),
    marketNote: find('[data-market-note]'),
    sunlight: find('[data-sunlight]'),
    batteryCells: createBatteryCells(find('[data-batteries]')),
    panelsToggle: find('[data-panels-toggle]'),
    panelsLabel: find('[data-panels-label]'),
    buyPanels: find('[data-buy-panels]'),
    buyBattery: find('[data-buy-battery]'),
    sellBatteries: find('[data-sell-batteries]'),
    buyWarpDrive: find('[data-buy-warp-drive]'),
    buyRescueModule: find('[data-buy-rescue-module]'),
    openWarp: find('[data-open-warp]'),
    warpNote: find('[data-warp-note]'),
    destinations: find('[data-destinations]'),
    dockActions: [...root.querySelectorAll('[data-dock-action]')],
    goldCounter: find('[data-gold-counter]'),
    gold: find('[data-gold]'),
    crystalCounter: find('[data-crystal-counter]'),
    crystals: find('[data-crystals]'),
    sellCrystals: find('[data-sell-crystals]'),
    stardustCounter: find('[data-stardust-counter]'),
    stardust: find('[data-stardust]'),
    sellStardust: find('[data-sell-stardust]'),
    scienceCounter: find('[data-science-counter]'),
    science: find('[data-science]'),
    sellScience: find('[data-sell-science]'),
    buySail: find('[data-buy-sail]'),
    launchSail: find('[data-launch-sail]'),
    sailsInHold: find('[data-sails-in-hold]'),
    sailNote: find('[data-sail-note]'),
    buySatellite: find('[data-buy-satellite]'),
    prices: [...root.querySelectorAll('[data-price]')],
    satellitesInHold: find('[data-satellites-in-hold]'),
    banksInHold: find('[data-banks-in-hold]'),
    dronesInHold: find('[data-drones-in-hold]'),
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
    openHaulers: find('[data-open-haulers]'),
    buyHauler: find('[data-buy-hauler]'),
    haulerTitle: find('[data-hauler-title]'),
    haulerStatus: find('[data-hauler-status]'),
    haulerStops: find('[data-hauler-stops]'),
    toggleHauler: find('[data-toggle-hauler]'),
    cycleHauler: [...root.querySelectorAll('[data-cycle-hauler]')],
    addHaulerStop: [...root.querySelectorAll('[data-add-hauler-stop]')],
    buyBuilder: find('[data-buy-builder]'),
    builderNote: find('[data-builder-note]'),
    stopChoice: find('[data-stop-choice]'),
    buildPicker: find('[data-build-picker]'),
    buildKind: find('[data-build-kind]'),
    buildStar: find('[data-build-star]'),
    alienName: find('[data-alien-name]'),
    alienMood: find('[data-alien-mood]'),
    askForTip: find('[data-ask-for-tip]'),
    tipPrice: find('[data-tip-price]'),
    alienNote: find('[data-alien-note]'),
    sellToAliens: find('[data-sell-to-aliens]'),
    alienOffer: find('[data-alien-offer]'),
    tollDemand: find('[data-toll-demand]'),
    payToll: find('[data-pay-toll]'),
    refuseToll: find('[data-refuse-toll]'),
    outpostBan: find('[data-outpost-ban]'),
    raidShip: find('[data-raid-ship]'),
    alienMarket: find('[data-alien-market]'),
    alienRefusal: find('[data-alien-refusal]'),
    alienBuyFuel: find('[data-alien-buy-fuel]'),
    alienFillTank: find('[data-alien-fill-tank]'),
    alienBuyBattery: find('[data-alien-buy-battery]'),
    alienSells: find('[data-alien-sells]'),
    raidCost: find('[data-raid-cost]'),
    alienWantsIcon: find('[data-alien-wants-icon]'),
    panels: Object.fromEntries([...root.querySelectorAll('[data-panel]')].map((panel) => [panel.dataset.panel, panel])),
  };

  root.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', actions.closePanels));
  parts.mine.addEventListener('click', actions.mine);
  parts.stopDrill.addEventListener('click', actions.stopDrill);
  parts.buy.addEventListener('click', actions.buyFuel);
  parts.fillTank.addEventListener('click', actions.fillTank);
  parts.panelsToggle.addEventListener('click', actions.togglePanels);
  parts.buyPanels.addEventListener('click', actions.buyPanels);
  parts.buyBattery.addEventListener('click', actions.buyBattery);
  parts.sellBatteries.addEventListener('click', actions.sellBatteries);
  parts.buyWarpDrive.addEventListener('click', actions.buyWarpDrive);
  parts.buyRescueModule.addEventListener('click', actions.buyRescueModule);
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
    sellCrystals: actions.sellCrystals,
    sellStardust: actions.sellStardust,
    sellScience: actions.sellScience,
    buySail: actions.buySail,
    launchSail: actions.launchSail,
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
    openHaulers: actions.openHaulers,
    buyHauler: actions.buyHauler,
    buyBuilder: actions.buyBuilder,
    toggleHauler: actions.toggleHauler,
    askForTip: actions.askForTip,
    sellToAliens: actions.sellToAliens,
    payToll: actions.payToll,
    refuseToll: actions.refuseToll,
    raidShip: actions.raidShip,
    alienBuyFuel: actions.alienBuyFuel,
    alienFillTank: actions.alienFillTank,
    alienBuyBattery: actions.alienBuyBattery,
  };
  for (const [part, action] of Object.entries(clicks)) parts[part].addEventListener('click', action);
  find('[data-pick-up-satellite]').addEventListener('click', actions.pickUpSatellite);
  find('[data-pick-up-rig]').addEventListener('click', actions.pickUpRig);
  find('[data-pick-up-bank]').addEventListener('click', actions.pickUpBank);
  parts.pickUpAntenna.addEventListener('click', actions.pickUpAntenna);
  parts.openDrone.addEventListener('click', actions.openDrone);
  find('[data-cancel-recording]').addEventListener('click', actions.cancelRecording);
  parts.cycleHauler.forEach((button) => button.addEventListener('click', () => actions.cycleHauler(Number(button.dataset.cycleHauler))));
  parts.addHaulerStop.forEach((button) => button.addEventListener('click', () => actions.addHaulerStop(button.dataset.addHaulerStop)));
  find('[data-add-stop-choice]').addEventListener('click', () => parts.stopChoice.value && actions.addRemoteStop(parts.stopChoice.value));
  find('[data-add-build-stop]').addEventListener('click', () => parts.buildStar.value && actions.addBuildStop(parts.buildKind.value, parts.buildStar.value));
  parts.haulerStops.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-stop]');
    if (button) actions.removeHaulerStop(Number(button.dataset.removeStop));
  });
  parts.destinations.addEventListener('click', (event) => {
    const button = event.target.closest('[data-star]');
    if (button) actions.warpTo(button.dataset.star);
  });
  parts.buyTelescope.addEventListener('click', actions.buyTelescope);
  parts.scan.addEventListener('click', actions.scan);
  parts.alienSells.addEventListener('click', (event) => {
    const button = event.target.closest('[data-alien-sell]');
    if (button) actions.alienSell(button.dataset.alienSell);
  });
  parts.upgrades.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade]');
    if (button) actions.buyUpgrade(button.dataset.upgrade);
  });
  let shownDestinations = '';
  let shownUpgrades = '';
  let shownAlienSells = '';
  let shownStops = '';
  const shownOptions = new Map();

  function showOptions(select, choices) {
    const signature = choices.map(({ value, label }) => `${value}=${label}`).join('|');
    if (shownOptions.get(select) === signature) return;
    shownOptions.set(select, signature);
    const picked = select.value;
    select.replaceChildren(...choices.map(({ value, label }) => new Option(label, value)));
    if (choices.some(({ value }) => value === picked)) select.value = picked;
  }
  let toastTimer = 0;
  let toastShownAt = 0;
  const toastQueue = [];

  function hideToastAfter(ms) {
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(showNextToast, ms);
  }

  function showToast(text) {
    setText(parts.toast, text);
    setHidden(parts.toast, false);
    toastShownAt = Date.now();
    hideToastAfter(toastQueue.length ? QUEUED_TOAST_MS : TOAST_MS);
  }

  function showNextToast() {
    if (toastQueue.length) showToast(toastQueue.shift());
    else setHidden(parts.toast, true);
  }

  function toast(text) {
    if (parts.toast.hidden) {
      showToast(text);
      return;
    }
    if (text === parts.toast.textContent || toastQueue.includes(text)) return;
    toastQueue.push(text);
    if (toastQueue.length > MAX_QUEUED_TOASTS) toastQueue.shift();
    hideToastAfter(Math.max(0, QUEUED_TOAST_MS - (Date.now() - toastShownAt)));
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
        const crystals = next?.crystals ? ` + ${next.crystals} crystals` : '';
        const stardust = next?.stardust ? ` + ${next.stardust} stardust` : '';
        button.textContent = next ? `${name}: ${describe(current)} → ${describe(next.value)} · ${next.cost}${crystals}${stardust}` : `${name}: ${describe(current)} (max)`;
        return button;
      }),
    );
  }

  function showStops(stops) {
    const signature = stops.map(({ label, next, missing }) => `${label}:${next}:${missing}`).join('|');
    if (signature === shownStops) return;
    shownStops = signature;
    parts.haulerStops.replaceChildren(
      ...stops.map(({ label, next, missing }, index) => {
        const item = document.createElement('li');
        item.classList.toggle('is-next', next);
        item.classList.toggle('is-missing', missing);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'pp-action';
        remove.dataset.removeStop = String(index);
        remove.textContent = 'Remove';
        item.append(label, remove);
        return item;
      }),
    );
  }

  function updateHaulers({ hauler, canBuyHauler, canBuyBuilder, haulerStopsHere, stopChoices, buildChoices }) {
    parts.buyHauler.disabled = !canBuyHauler;
    parts.buyBuilder.disabled = !canBuyBuilder;
    setHidden(parts.openHaulers, !hauler);
    parts.addHaulerStop.forEach((button) => setHidden(button, !haulerStopsHere.includes(button.dataset.addHaulerStop)));
    if (!hauler) return;
    setText(parts.haulerTitle, hauler.title);
    setText(parts.haulerStatus, hauler.status);
    showStops(hauler.stops);
    setHidden(parts.builderNote, !hauler.builds);
    setHidden(parts.buildPicker, !hauler.builds);
    showOptions(parts.stopChoice, stopChoices);
    showOptions(parts.buildStar, buildChoices);
    setText(parts.toggleHauler, hauler.running ? 'Pause' : 'Start');
    parts.toggleHauler.disabled = hauler.stops.length === 0;
    parts.cycleHauler.forEach((button) => setHidden(button, hauler.count < 2));
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
  find('[data-start-tour]').addEventListener('click', actions.startTour);
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
    setHidden(parts.dockSlow, !status.tooFastToDock);
    setHidden(parts.crash, !status.destroyed);
    setHidden(parts.abandon, !status.stranded);
    setHidden(parts.mine, !status.canMine);
    setHidden(parts.stopDrill, !status.drillBusy);
    setHidden(parts.drillHint, !status.drillAwaitingClick);
    parts.buy.disabled = !status.canBuy;
    parts.fillTank.disabled = !status.canFillTank;
    setText(parts.fillTankCost, status.fillTankCost.toLocaleString());
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
    setHidden(parts.buyRescueModule, !status.offersRescueModule);
    parts.buyRescueModule.disabled = !status.canBuyRescueModule;
    setHidden(parts.openWarp, !status.ownsWarpDrive);
    setText(parts.warpNote, status.warpNote);
    parts.dockActions.forEach((action) => setText(action, status.dockAction));
    setHidden(parts.goldCounter, status.gold === 0 && !status.rig);
    setText(parts.gold, String(status.gold));
    setHidden(parts.crystalCounter, status.crystals === 0);
    setText(parts.crystals, String(status.crystals));
    setHidden(parts.sellCrystals, status.crystals === 0);
    setHidden(parts.stardustCounter, status.stardust === 0);
    setText(parts.stardust, String(status.stardust));
    setHidden(parts.sellStardust, status.stardust === 0);
    setHidden(parts.scienceCounter, status.science === 0);
    setText(parts.science, String(status.science));
    setHidden(parts.sellScience, status.science === 0);
    parts.buySail.disabled = !status.canBuySail;
    setHidden(parts.launchSail, status.sailsInHold === 0);
    parts.launchSail.disabled = !status.canLaunchSail;
    setText(parts.sailsInHold, String(status.sailsInHold));
    setHidden(parts.sailNote, status.sailsInHold === 0);
    setText(parts.sailNote, status.sailNote);
    parts.buySatellite.disabled = !status.canBuySatellite;
    parts.prices.forEach((price) => setText(price, status.prices[price.dataset.price].toLocaleString()));
    setText(parts.satellitesInHold, String(status.satellitesInHold));
    setText(parts.banksInHold, String(status.banksInHold));
    setText(parts.dronesInHold, String(status.dronesInHold));
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
    updateHaulers(status);
    updateAlien(status.alien);
    updateToll(status.toll);
    setText(parts.outpostBan, status.outpostBan);
    setHidden(parts.outpostBan, !status.outpostBan);
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

  function updateAlien(alien) {
    if (!alien) return;
    const signed = alien.relation > 0 ? `+${alien.relation}` : String(alien.relation);
    setText(parts.alienName, alien.title);
    setHidden(parts.raidShip, !alien.raidable);
    setText(parts.raidCost, `Raid it (${alien.raidCost})`);
    setText(parts.alienMood, `The ${alien.name} are ${alien.mood} toward you (${signed}).`);
    setHidden(parts.askForTip, !alien.friendly);
    parts.askForTip.disabled = !alien.canAskForTip;
    setText(parts.tipPrice, String(alien.tipPrice));
    setHidden(parts.alienNote, alien.friendly);
    setText(parts.alienOffer, `Sell ${alien.wantsLabel}, ${alien.sellPrice}`);
    if (parts.alienWantsIcon.getAttribute('src') !== alien.wantsIcon) parts.alienWantsIcon.src = alien.wantsIcon;
    parts.sellToAliens.disabled = !alien.canSell;
    setHidden(parts.alienRefusal, !alien.refusesTrade);
    setText(parts.alienRefusal, `The ${alien.name} won't trade with you, except for ${alien.wantsLabel}.`);
    updateAlienMarket(alien.market);
  }

  function updateAlienMarket(market) {
    setHidden(parts.alienMarket, !market);
    if (!market) return;
    setText(parts.alienBuyFuel, `Buy 5 fuel for ${market.fuelPackCost}`);
    parts.alienBuyFuel.disabled = !market.canBuyFuel;
    setText(parts.alienFillTank, `Fill tank for ${market.fillTankCost.toLocaleString()}`);
    parts.alienFillTank.disabled = !market.canFillTank;
    setText(parts.alienBuyBattery, `Empty battery for ${market.batteryCost}`);
    parts.alienBuyBattery.disabled = !market.canBuyBattery;
    showAlienSells(market.offers);
  }

  function showAlienSells(offers) {
    const signature = offers.map(({ key, price, count }) => `${key}:${price}:${count > 0}`).join('|');
    if (signature === shownAlienSells) return;
    shownAlienSells = signature;
    parts.alienSells.replaceChildren(
      ...offers.map(({ key, label, icon, price, count }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'pp-action pp-sell';
        button.dataset.alienSell = key;
        button.disabled = count === 0;
        const image = document.createElement('img');
        image.src = icon;
        image.alt = '';
        button.append(image, ` Sell ${label}, ${price} each`);
        return button;
      }),
    );
  }

  function updateToll(toll) {
    if (!toll) return;
    setText(parts.tollDemand, `The ${toll.name} demand ${toll.price} galactokens to pass through their system. Refusing angers them.`);
    parts.payToll.disabled = !toll.canPay;
  }

  function beckonHelp() {
    const help = find('[data-help-toggle]');
    help.classList.add('is-beckoning');
    setTimeout(() => help.classList.remove('is-beckoning'), BECKON_MS);
  }

  return { showPanel, update, toast, beckonHelp };
}
