import { partBounds } from './fleet.js';
import { NUMBERS, drawSpace, drawWord, glossOf, readLine } from './gct.js';
import { drawPortrait } from './portraits.js';
import { bindShipBuilder, wedgeClip } from './ship-builder.js';
import { formatDistance, formatLightSpeed, formatSpeed } from './units.js';
import { GCT, GOLD, MAX_BATTERY_SLOTS } from './world.js';

const DIM_SATELLITE_LIGHT = 0.05;
const TOAST_MS = 4500;
const QUEUED_TOAST_MS = 2500;
const MAX_QUEUED_TOASTS = 3;
const BECKON_MS = 6000;
const FULLSCREEN_HINT_MS = 10000;
const UPGRADE_TEXT = {
  batterySlots: { name: 'Battery rack', describe: (value) => `${value} slots` },
  panels: { name: 'Solar panels', describe: (value) => `${value}× charging` },
  tank: { name: 'Fuel tank', describe: (value) => `${value} fuel` },
  engine: { name: 'Engine', describe: (value) => `${value}× thrust` },
  hull: { name: 'Landing legs', describe: (value) => `land under ${formatSpeed(value)}` },
  telescope: { name: 'Telescope', describe: (value) => `${formatDistance(value)} range` },
  timewarp: { name: 'Time warp', describe: (value) => `up to ${value}x` },
  warpRange: { name: 'Warp range', describe: (value) => `${formatDistance(value)} jumps` },
};

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

export function createHud(root, actions, { cheats }) {
  const find = (selector) => root.querySelector(selector);
  const parts = {
    tokens: find('[data-tokens]'),
    balances: [...root.querySelectorAll('[data-balance]')],
    charging: find('[data-charging]'),
    fuel: find('[data-fuel]'),
    fuelBar: find('[data-fuel-bar]'),
    warp: find('[data-warp]'),
    warpKnob: find('[data-warp-knob]'),
    location: find('[data-location]'),
    altitude: find('[data-altitude]'),
    speed: find('[data-speed]'),
    throttle: find('[data-throttle]'),
    engine: find('[data-engine]'),
    engineButtons: [...root.querySelectorAll('[data-engine-button]')],
    throttleKnob: find('[data-throttle-knob]'),
    throttleLabel: find('[data-throttle-label]'),
    volume: find('[data-volume]'),
    goal: find('[data-goal]'),
    goalCount: find('[data-goal-count]'),
    goalText: find('[data-goal-text]'),
    goalList: find('[data-goal-list]'),
    showGoals: find('[data-show-goals]'),
    touchControls: [...root.querySelectorAll('[data-touch-controls]')],
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
    buyAutopilot: find('[data-buy-autopilot]'),
    toggleAutopilot: find('[data-toggle-autopilot]'),
    autopilotLabel: find('[data-autopilot-label]'),
    autopilotLanding: find('[data-autopilot-landing]'),
    autopilotBody: find('[data-autopilot-body]'),
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
    mapBookmark: find('[data-map-bookmark]'),
    mapBookmarksOnly: find('[data-map-bookmarks-only]'),
    bountyHere: find('[data-bounty-here]'),
    buyBank: find('[data-buy-bank]'),
    buyShip: find('[data-buy-ship]'),
    openShip: find('[data-open-ship]'),
    leaveShip: find('[data-leave-ship]'),
    toggleFtl: find('[data-toggle-ftl]'),
    ftlLabel: find('[data-ftl-label]'),
    upgradeFtl: find('[data-upgrade-ftl]'),
    shipTitle: find('[data-ship-title]'),
    shipStats: find('[data-ship-stats]'),
    shipPlan: find('[data-ship-plan]'),
    shipyardNote: find('[data-shipyard-note]'),
    openBuilder: find('[data-open-builder]'),
    boardShip: find('[data-board-ship]'),
    takeShipCharge: find('[data-take-ship-charge]'),
    leaveShipPanel: find('[data-leave-ship-panel]'),
    deployBank: find('[data-deploy-bank]'),
    bankStored: find('[data-bank-stored]'),
    buyObservatory: find('[data-buy-observatory]'),
    deployObservatory: find('[data-deploy-observatory]'),
    observatoriesInHold: find('[data-observatories-in-hold]'),
    observatoryStatus: find('[data-observatory-status]'),
    chargeObservatory: find('[data-charge-observatory]'),
    depositInBank: find('[data-deposit-in-bank]'),
    takeFromBank: find('[data-take-from-bank]'),
    buyPad: find('[data-buy-pad]'),
    deployPad: find('[data-deploy-pad]'),
    padsInHold: find('[data-pads-in-hold]'),
    pickUpPad: find('[data-pick-up-pad]'),
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
    droneWaitPicker: find('[data-drone-wait-picker]'),
    droneWait: find('[data-drone-wait]'),
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
    buyWormhole: find('[data-buy-wormhole]'),
    placeMouth: find('[data-place-mouth]'),
    mouthNote: find('[data-mouth-note]'),
    wormholeNote: find('[data-wormhole-note]'),
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
    tollGct: find('[data-toll-gct]'),
    alienGct: find('[data-alien-gct]'),
    openLexicon: [...root.querySelectorAll('[data-open-lexicon]')],
    lexiconWhenHeard: find('[data-lexicon-when-heard]'),
    lexiconList: find('[data-lexicon-list]'),
    lexiconEmpty: find('[data-lexicon-empty]'),
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
    freighterMarket: find('[data-freighter-market]'),
    freighterBuyBattery: find('[data-freighter-buy-battery]'),
    freighterStock: find('[data-freighter-stock]'),
    raidCost: find('[data-raid-cost]'),
    alienWantsIcon: find('[data-alien-wants-icon]'),
    askToSample: find('[data-ask-to-sample]'),
    paySampleFee: find('[data-pay-sample-fee]'),
    sampleFee: find('[data-sample-fee]'),
    sampleNote: find('[data-sample-note]'),
    confirmBuyText: find('[data-confirm-buy-text]'),
    stopAsking: find('[data-stop-asking]'),
    askBigBuys: find('[data-ask-big-buys]'),
    panels: Object.fromEntries([...root.querySelectorAll('[data-panel]')].map((panel) => [panel.dataset.panel, panel])),
  };

  root.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', actions.closePanels));
  parts.openLexicon.forEach((button) => button.addEventListener('click', actions.toggleLexicon));
  parts.lexiconList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-study-word]');
    if (button) actions.studyWord(button.dataset.studyWord);
  });
  setText(find('[data-lexicon-hearings]'), String(GCT.hearingsToLearn));
  setText(find('[data-lexicon-price]'), String(GCT.studyScience));
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
  parts.buyAutopilot.addEventListener('click', actions.buyAutopilot);
  parts.toggleAutopilot.addEventListener('click', actions.toggleAutopilot);
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
    buyShip: actions.buyShip,
    openShip: actions.openShip,
    leaveShip: actions.leaveShip,
    toggleFtl: actions.toggleFtl,
    upgradeFtl: actions.upgradeFtl,
    leaveShipPanel: actions.leaveShip,
    boardShip: actions.boardShip,
    takeShipCharge: actions.takeShipCharge,
    buyObservatory: actions.buyObservatory,
    deployObservatory: actions.deployObservatory,
    chargeObservatory: actions.chargeObservatory,
    deployBank: actions.deployBank,
    depositInBank: actions.depositInBank,
    takeFromBank: actions.takeFromBank,
    buyPad: actions.buyPad,
    deployPad: actions.deployPad,
    pickUpPad: actions.pickUpPad,
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
    buyWormhole: actions.buyWormhole,
    placeMouth: actions.placeMouth,
    toggleHauler: actions.toggleHauler,
    askForTip: actions.askForTip,
    sellToAliens: actions.sellToAliens,
    payToll: actions.payToll,
    refuseToll: actions.refuseToll,
    raidShip: actions.raidShip,
    alienBuyFuel: actions.alienBuyFuel,
    alienFillTank: actions.alienFillTank,
    alienBuyBattery: actions.alienBuyBattery,
    freighterBuyBattery: actions.freighterBuyBattery,
    askToSample: actions.askToSample,
    paySampleFee: actions.paySampleFee,
  };
  for (const [part, action] of Object.entries(clicks)) parts[part].addEventListener('click', action);
  find('[data-pick-up-satellite]').addEventListener('click', actions.pickUpSatellite);
  find('[data-pick-up-rig]').addEventListener('click', actions.pickUpRig);
  find('[data-pick-up-bank]').addEventListener('click', actions.pickUpBank);
  find('[data-pick-up-observatory]').addEventListener('click', actions.pickUpObservatory);
  parts.pickUpAntenna.addEventListener('click', actions.pickUpAntenna);
  parts.openDrone.addEventListener('click', actions.openDrone);
  find('[data-cancel-recording]').addEventListener('click', actions.cancelRecording);
  parts.cycleHauler.forEach((button) => button.addEventListener('click', () => actions.cycleHauler(Number(button.dataset.cycleHauler))));
  parts.addHaulerStop.forEach((button) => button.addEventListener('click', () => actions.addHaulerStop(button.dataset.addHaulerStop)));
  find('[data-add-stop-choice]').addEventListener('click', () => parts.stopChoice.value && actions.addRemoteStop(parts.stopChoice.value));
  find('[data-add-build-stop]').addEventListener('click', () => parts.buildStar.value && actions.addBuildStop(parts.buildKind.value, parts.buildStar.value));
  const builder = bindShipBuilder(find('[data-ship-builder]'), { addBlock: actions.addShipBlock, removeBlock: actions.removeShipBlock, showOptions });
  parts.openBuilder.addEventListener('click', builder.open);
  parts.shipPlan.addEventListener('click', builder.open);
  find('[data-close-builder]').addEventListener('click', builder.close);
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !builder.isOpen()) return;
      event.stopImmediatePropagation();
      builder.close();
    },
    { capture: true },
  );
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
  parts.droneWait.addEventListener('change', () => actions.setDroneWait(Number(parts.droneWait.value)));
  parts.alienSells.addEventListener('click', (event) => {
    const button = event.target.closest('[data-alien-sell]');
    if (button) actions.alienSell(button.dataset.alienSell);
  });
  find('[data-confirm-buy]').addEventListener('click', () => {
    actions.confirmBuy(parts.stopAsking.checked);
    parts.stopAsking.checked = false;
  });
  find('[data-cancel-buy]').addEventListener('click', () => {
    actions.cancelBuy();
    parts.stopAsking.checked = false;
  });
  parts.askBigBuys.addEventListener('change', () => actions.setAskBeforeBigBuys(parts.askBigBuys.checked));
  parts.upgrades.addEventListener('click', (event) => {
    const button = event.target.closest('[data-upgrade]');
    if (button) actions.buyUpgrade(button.dataset.upgrade);
  });
  let shownDestinations = '';
  let shownUpgrades = '';
  let shownAlienSells = '';
  let shownLexicon = '';
  const shownGct = new Map();
  let shownStops = '';
  let shownPlan = '';
  let shownGoals = '';
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

  function planCell(cell) {
    const block = document.createElement('span');
    block.className = 'pp-plan-block';
    block.style.gridColumn = String(cell.gridColumn);
    block.style.gridRow = String(cell.gridRow);
    block.style.background = cell.colour;
    if (cell.type === 'wedge') block.style.clipPath = wedgeClip(cell.turn);
    return block;
  }

  function showPlan(plan) {
    const shown = plan.filter((cell) => !cell.open);
    const signature = shown.map((cell) => `${cell.col},${cell.row},${cell.colour},${cell.turn}`).join('|');
    if (signature === shownPlan) return;
    shownPlan = signature;
    const { minCol, maxCol, minRow, maxRow } = partBounds(shown);
    const columns = maxCol - minCol + 1;
    const rows = maxRow - minRow + 1;
    parts.shipPlan.style.setProperty('--pp-plan-cell', `min(24px, calc((100cqw - 12px) / ${columns}), calc(140px / ${rows}))`);
    parts.shipPlan.style.gridTemplateColumns = `repeat(${columns}, var(--pp-plan-cell))`;
    parts.shipPlan.style.gridTemplateRows = `repeat(${rows}, var(--pp-plan-cell))`;
    parts.shipPlan.replaceChildren(...shown.map((cell) => planCell({ ...cell, gridColumn: cell.col - minCol + 1, gridRow: cell.row - minRow + 1 })));
  }

  function updateShip({ canBuyShip, piloting, myShip, ftlLabel }) {
    parts.buyShip.disabled = !canBuyShip;
    setHidden(parts.toggleFtl, !ftlLabel);
    setText(parts.ftlLabel, ftlLabel ?? '');
    setHidden(parts.openShip, !piloting);
    setHidden(parts.leaveShip, !piloting);
    if (!myShip) return;
    setText(parts.shipTitle, myShip.title);
    setText(parts.shipStats, myShip.stats);
    showPlan(myShip.plan);
    setHidden(parts.shipyardNote, myShip.shipyard);
    setText(parts.openBuilder, myShip.shipyard ? 'Open ship builder' : 'Inspect ship blocks');
    builder.update(myShip);
    setHidden(parts.upgradeFtl, !myShip.shipyard || !myShip.ftlUpgrade);
    setText(parts.upgradeFtl, myShip.ftlUpgrade?.label ?? '');
    parts.upgradeFtl.disabled = !myShip.ftlUpgrade?.affordable;
    setHidden(parts.boardShip, myShip.piloting);
    setHidden(parts.leaveShipPanel, !myShip.piloting);
    parts.takeShipCharge.disabled = !myShip.canTakeCharge;
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
        button.textContent = `${star.name} · ${formatDistance(distance)} away · ${cost.toFixed(2)} batteries`;
        return button;
      }),
    );
  }
  find('[data-help-toggle]').addEventListener('click', actions.toggleHelp);
  find('[data-start-tour]').addEventListener('click', actions.startTour);
  find('[data-restart]').addEventListener('click', actions.restart);
  find('[data-map-toggle]').addEventListener('click', actions.toggleMap);
  root.querySelectorAll('[data-map-view]').forEach((button) => button.addEventListener('click', () => actions.mapView(button.dataset.mapView)));
  parts.mapCloseUp.addEventListener('click', actions.mapCloseUp);
  parts.mapBookmark.addEventListener('click', actions.toggleBookmark);
  parts.mapBookmarksOnly.addEventListener('click', actions.toggleBookmarksOnly);
  root.querySelectorAll('[data-map-zoom]').forEach((button) => button.addEventListener('click', () => actions.mapZoom(button.dataset.mapZoom)));
  const cheatsToggle = find('[data-cheats-toggle]');
  cheatsToggle.hidden = !cheats;
  find('[data-open-worlds]').addEventListener('click', actions.openWorlds);
  find('[data-settings-toggle]').addEventListener('click', actions.toggleSettings);
  parts.goal.addEventListener('click', actions.toggleGoals);
  parts.showGoals.addEventListener('change', () => actions.setShowGoals(parts.showGoals.checked));
  parts.volume.addEventListener('input', () => actions.setVolume(Number(parts.volume.value) / 100));
  parts.touchControls.forEach((radio) => radio.addEventListener('change', () => actions.setTouchControls(radio.value)));
  cheatsToggle.addEventListener('click', actions.toggleCheats);
  root.querySelectorAll('[data-cheat]').forEach((button) => button.addEventListener('click', () => actions.cheat(button.dataset.cheat)));
  find('[data-fullscreen]').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else root.requestFullscreen?.();
  });
  let fullscreenHintTimer = null;
  document.addEventListener('fullscreenchange', () => {
    window.clearTimeout(fullscreenHintTimer);
    const entered = document.fullscreenElement === root;
    root.classList.toggle('is-clearing-fullscreen-hint', entered);
    if (entered) fullscreenHintTimer = window.setTimeout(() => root.classList.remove('is-clearing-fullscreen-hint'), FULLSCREEN_HINT_MS);
  });

  function showSettings({ volume, touchControls }) {
    parts.volume.value = String(Math.round(volume * 100));
    parts.touchControls.forEach((radio) => (radio.checked = radio.value === touchControls));
  }

  function showPanel(name) {
    for (const [key, panel] of Object.entries(parts.panels)) setHidden(panel, key !== name);
    if (name !== 'myShip') builder.close();
  }

  function update(status) {
    setText(parts.tokens, String(status.galactokens));
    parts.balances.forEach((balance) => setText(balance, status.galactokens.toLocaleString()));
    setHidden(parts.charging, !status.charging);
    parts.charging.classList.toggle('is-dim', status.sunlight < DIM_SATELLITE_LIGHT);
    setText(parts.fuel, String(Math.floor(status.fuel)));
    parts.fuelBar.style.width = `${status.fuelFraction * 100}%`;
    setText(parts.warp, `${status.timewarp}x`);
    parts.warpKnob.style.bottom = `${((status.timewarp - 1) / (status.timewarpBought - 1)) * 100}%`;
    parts.warpSlider.classList.toggle('is-held', status.timewarpHeld);
    setText(parts.location, status.location);
    setText(parts.altitude, status.altitude === null ? '—' : formatDistance(status.altitude));
    const speed = status.inFtl ? `${formatLightSpeed(status.speed)} (FTL)` : `${formatSpeed(status.speed)}${status.atSpeedLimit ? ' (top)' : ''}`;
    setText(parts.speed, speed);
    setText(parts.throttle, `${Math.round(status.throttle)}%`);
    setText(parts.engine, status.engineOn ? 'on' : 'off');
    parts.engine.classList.toggle('is-on', status.engineOn);
    parts.engineButtons.forEach((button) => button.classList.toggle('is-on', status.engineOn));
    parts.throttleKnob.style.bottom = `${status.throttle}%`;
    setText(parts.throttleLabel, `${Math.round(status.throttle)}%`);
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
    setHidden(parts.buyAutopilot, status.ownsAutopilot);
    parts.buyAutopilot.disabled = !status.canBuyAutopilot;
    setHidden(parts.toggleAutopilot, !status.ownsAutopilot);
    setText(parts.autopilotLabel, status.autopilotArmed ? 'Landing autopilot: on' : 'Landing autopilot: off');
    setHidden(parts.autopilotLanding, !status.autopilotLanding);
    setText(parts.autopilotBody, status.autopilotLanding ?? '');
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
    setHidden(parts.mapBookmark, !status.canBookmark);
    setText(parts.mapBookmark, status.bookmarked ? 'Remove bookmark' : 'Bookmark');
    setHidden(parts.mapBookmarksOnly, !status.hasBookmarks && !status.bookmarksOnly);
    setText(parts.mapBookmarksOnly, status.bookmarksOnly ? 'All stars' : 'Bookmarked only');
    parts.mapBookmarksOnly.setAttribute('aria-pressed', String(status.bookmarksOnly));
    setHidden(parts.bountyHere, !status.bountyHere);
    setText(parts.bountyHere, `Bounty ${status.bountyHere}`);
    updateSatellite(status);
    updateRig(status);
    updateBank(status);
    updateShip(status);
    updateObservatory(status);
    updateDrones(status);
    updateHaulers(status);
    updateWormholes(status);
    updateAlien(status.alien, status.gctKnown);
    updateToll(status.toll, status.gctKnown);
    setHidden(parts.lexiconWhenHeard, !status.gctHeard);
    updateLexicon(status.lexicon);
    setText(parts.outpostBan, status.outpostBan);
    setHidden(parts.outpostBan, !status.outpostBan);
    showDestinations(status.warpDestinations);
    updatePendingBuy(status.pendingBuy);
    updateGoals(status.goals);
    parts.askBigBuys.checked = status.askBeforeBigBuys;
    parts.buyPanels.disabled = !status.canBuyPanels;
    parts.buyBattery.disabled = !status.canBuyBattery;
    parts.sellBatteries.disabled = !status.canSellBatteries;
  }

  function updateGoals({ show, current, done, total, list }) {
    parts.showGoals.checked = show;
    setHidden(parts.goal, !show || !current);
    setText(parts.goalCount, `✓ ${done}/${total}`);
    setText(parts.goalText, current ?? '');
    const signature = list.map((goal) => `${goal.done}${goal.current}`).join('');
    if (signature === shownGoals) return;
    shownGoals = signature;
    parts.goalList.replaceChildren(
      ...list.map(({ text, done: finished, current: next }) => {
        const item = document.createElement('li');
        item.classList.toggle('is-done', finished);
        item.classList.toggle('is-next', next);
        item.textContent = text;
        return item;
      }),
    );
  }

  function updatePendingBuy(pendingBuy) {
    if (!pendingBuy) return;
    const { price, balance } = pendingBuy;
    setText(parts.confirmBuyText, `Spend ${price.toLocaleString()} of your ${balance.toLocaleString()} galactokens? That's ${Math.round((price / balance) * 100)}% of what you have.`);
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
    const gold = Math.floor(rig.gold);
    setText(parts.rigStatus, `Power: ${rig.charge.toFixed(2)} batteries (${minutesLeft} min left). Gold waiting: ${gold}, worth ${(gold * GOLD.sellPrice).toLocaleString()} galactokens at the market.`);
    parts.loadRig.disabled = !canLoadRig;
    parts.collectGold.disabled = rig.gold < 1;
  }

  function updateWormholes({ canBuyWormhole, mouthPlacement, placingSecondMouth, wormholesInHold, wormholeNote }) {
    const blocker = mouthPlacement?.blocker ?? null;
    parts.buyWormhole.disabled = !canBuyWormhole;
    setHidden(parts.placeMouth, !mouthPlacement);
    parts.placeMouth.disabled = Boolean(blocker);
    setText(parts.placeMouth, placingSecondMouth ? 'Place the second wormhole mouth here' : `Place a wormhole mouth here (${wormholesInHold} in hold)`);
    setHidden(parts.mouthNote, !blocker);
    setText(parts.mouthNote, blocker ?? '');
    setHidden(parts.wormholeNote, !wormholeNote);
    setText(parts.wormholeNote, wormholeNote);
  }

  function updateObservatory({ observatory, canBuyObservatory, canDeployObservatory, observatoriesInHold }) {
    parts.buyObservatory.disabled = !canBuyObservatory;
    setHidden(parts.deployObservatory, !canDeployObservatory);
    setText(parts.observatoriesInHold, String(observatoriesInHold));
    if (!observatory) return;
    setText(parts.observatoryStatus, observatory.status);
    parts.chargeObservatory.disabled = !observatory.canCharge;
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
    parts.buyPad.disabled = !status.canBuyPad;
    setHidden(parts.deployPad, !status.canDeployPad);
    setText(parts.padsInHold, String(status.padsInHold));
    setHidden(parts.pickUpPad, !status.canPickUpPad);
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
    setHidden(parts.droneWaitPicker, status.droneWaitSeconds === null);
    if (status.droneWaitSeconds !== null && document.activeElement !== parts.droneWait) parts.droneWait.value = String(status.droneWaitSeconds);
    parts.pickUpDrone.disabled = !status.canPickUpDrone;
    const recording = status.recordingSeconds !== null;
    setHidden(parts.recording, !recording);
    if (!recording) return;
    const seconds = Math.floor(status.recordingSeconds);
    setText(parts.recordingTime, `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
    setHidden(parts.recordingHint, status.canFinishRecording);
    setHidden(parts.finishRecording, !status.canFinishRecording);
  }

  function gctWord(token, known) {
    const word = document.createElement('span');
    word.className = 'pp-gct-word';
    const gloss = document.createElement('span');
    gloss.className = 'pp-gct-gloss';
    gloss.textContent = glossOf(token, known);
    word.setAttribute('aria-label', gloss.textContent === '?' ? 'unknown word' : gloss.textContent);
    word.append(drawWord(token.glyphs, token.dotted), gloss);
    return word;
  }

  function gctLine(line, known) {
    const row = document.createElement('p');
    row.className = 'pp-gct-line';
    readLine(line).forEach((token, index) => {
      const chunk = document.createElement('span');
      chunk.className = 'pp-gct-chunk';
      if (index > 0) chunk.append(drawSpace());
      chunk.append(gctWord(token, known));
      row.append(chunk);
    });
    return row;
  }

  function gctCaption(text) {
    const caption = document.createElement('p');
    caption.className = 'pp-gct-caption';
    caption.textContent = text;
    return caption;
  }

  function showGct(container, { species, name, lines }, known) {
    const learned = lines.flatMap(readLine).map((token) => known.has(token.word));
    const signature = `${species}:${lines.join('|')}:${learned.join()}`;
    if (shownGct.get(container) === signature) return;
    shownGct.set(container, signature);
    if (lines.length === 0) return container.replaceChildren();
    const speech = document.createElement('div');
    speech.className = 'pp-gct-speech';
    const said = gctCaption(`The ${name} say, in the Galactic Common Tongue:`);
    const unknownLegend = learned.includes(false) ? [gctCaption("? = a word you haven't learned yet")] : [];
    speech.append(said, ...lines.map((line) => gctLine(line, known)), ...unknownLegend);
    container.replaceChildren(drawPortrait(species), speech);
  }

  function lexiconEntry({ word, heard, meaning, canStudy }) {
    const item = document.createElement('li');
    const glyphs = word === NUMBERS ? drawWord(['0'], true) : drawWord([...word]);
    const label = document.createElement('span');
    label.className = 'pp-lexicon-meaning';
    label.textContent = meaning ?? `??? (heard ${heard} of ${GCT.hearingsToLearn})`;
    item.append(glyphs, label);
    if (meaning) return item;
    const study = document.createElement('button');
    study.type = 'button';
    study.className = 'pp-action pp-buy';
    study.dataset.studyWord = word;
    study.disabled = !canStudy;
    study.textContent = `Study · ${GCT.studyScience}`;
    item.append(study);
    return item;
  }

  function updateLexicon(entries) {
    if (!entries) return;
    const signature = entries.map(({ word, heard, meaning, canStudy }) => `${word}:${heard}:${meaning}:${canStudy}`).join('|');
    if (signature === shownLexicon) return;
    shownLexicon = signature;
    setHidden(parts.lexiconEmpty, entries.length > 0);
    parts.lexiconList.replaceChildren(...entries.map(lexiconEntry));
  }

  function updateAlien(alien, gctKnown) {
    if (!alien) return;
    parts.alienGct.style.color = alien.colour;
    showGct(parts.alienGct, alien, gctKnown);
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
    updateFreighterMarket(alien.freighter);
    updateSampleTerms(alien.name, alien.sample);
  }

  function updateFreighterMarket(freighter) {
    setHidden(parts.freighterMarket, !freighter);
    if (!freighter) return;
    setText(parts.freighterBuyBattery, `Charged battery for ${freighter.batteryCost}`);
    parts.freighterBuyBattery.disabled = !freighter.canBuyBattery;
    setText(parts.freighterStock, freighter.stock > 0 ? `${freighter.stock} charged ${freighter.stock === 1 ? 'battery' : 'batteries'} on board.` : 'Sold out of batteries.');
  }

  function sampleNote(name, { answer, fee, anger }) {
    const unasked = `Drilling without permission: relations -${anger}.`;
    if (answer === 'granted') return `The ${name} let you drill a sample here.`;
    if (answer === 'fee') return `The ${name} want ${fee} galactokens first. ${unasked}`;
    if (answer === 'refused') return `The ${name} refused. ${unasked}`;
    return `Life here makes a sample worth far more science. ${unasked}`;
  }

  function updateSampleTerms(name, sample) {
    setHidden(parts.askToSample, !sample || sample.answer !== null);
    setHidden(parts.paySampleFee, sample?.answer !== 'fee');
    setHidden(parts.sampleNote, !sample);
    if (!sample) return;
    setText(parts.sampleFee, String(sample.fee));
    parts.paySampleFee.disabled = !sample.canPay;
    setText(parts.sampleNote, sampleNote(name, sample));
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

  function updateToll(toll, gctKnown) {
    if (!toll) return;
    parts.tollGct.style.color = toll.colour;
    showGct(parts.tollGct, toll, gctKnown);
    setText(parts.tollDemand, `The ${toll.name} demand ${toll.price} galactokens to pass through their system. Refusing angers them.`);
    parts.payToll.disabled = !toll.canPay;
  }

  function beckonHelp() {
    const help = find('[data-help-toggle]');
    help.classList.add('is-beckoning');
    setTimeout(() => help.classList.remove('is-beckoning'), BECKON_MS);
  }

  return { showPanel, showSettings, update, toast, beckonHelp };
}
