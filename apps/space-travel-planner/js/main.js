import { createView } from './view.js';
import { createPorkchopPlot } from './porkchop-plot.js';
import { directTransferOrNull } from './transfer.js';
import { PLANETS, PLANET_LOOKS, hohmannFlightDays, synodicPeriodDays, yearsFromDays } from './planets.js';
import { DAYS_PER_YEAR, isoDate, julianFromIsoDate, julianFromUtcMs } from './time.js';
import { LAUNCHERS } from './launchers.js';
import { defaultApoapsisAltitude, defaultPeriapsisAltitude } from './bodies.js';
import { simulateMission } from './mission.js';
import { renderReport } from './mission-report.js';
import { createRocketEditor } from './rocket-editor.js';

const GRID = { columns: 140, rows: 110 };
const RECOMPUTE_DELAY_MS = 250;
const PLAY_SECONDS = 8;
const SHORTEST_OVER_HOHMANN = 0.4;
const LONGEST_OVER_HOHMANN = 1.3;
const WINDOW_OVER_SYNODIC = 1.25;
const WINDOW_YEARS_RANGE = [1, 6];
const CAPE_CANAVERAL_LATITUDE = 28.5;
const NEAR_HALF_ORBIT_DEGREES = [150, 210];
const STEEP_PLANE_DEGREES = 5;
const LONG_CRUISE_YEARS = 8;
const HUGE_C3 = 100;
const DEGREES = 180 / Math.PI;
const DEFAULT_ROCKET = {
  launcher: 'vulcanVc2',
  payload: 1000,
  goal: 'orbit',
  stages: [{ kind: 'liquid', engine: 'aj10', engines: 1, propellant: 900, insulation: 'sunshade' }],
};

const METRICS = {
  c3: { label: 'C3', format: (value) => `${value.toFixed(1)} km²/s²` },
  arrivalSpeed: { label: 'arrival speed', format: (value) => `${value.toFixed(2)} km/s` },
};

const form = document.querySelector('[data-controls]');
const readout = document.querySelector('[data-readout]');
const facts = document.querySelector('[data-facts]');
const notes = document.querySelector('[data-notes]');
const missionTime = document.querySelector('[data-mission-time]');
const missionDate = document.querySelector('[data-mission-date]');
const playButton = document.querySelector('[data-play]');
const bestButton = document.querySelector('[data-best]');
const rocketForm = document.querySelector('[data-rocket]');
const report = document.querySelector('[data-report]');
const verdict = document.querySelector('[data-verdict]');
const tabs = document.querySelectorAll('[data-tab]');
const tabPanels = document.querySelectorAll('[data-tab-panel]');
const rocketEditor = createRocketEditor(document.querySelector('[data-stages]'), document.querySelectorAll('[data-add-stage]'), updateMission);

const view = createView(document.querySelector('[data-view]'));
const plot = createPorkchopPlot(document.querySelector('[data-porkchop]'), { onPick: choose, onHover: describeHover });
const worker = new Worker(new URL('./porkchop-worker.js', import.meta.url), { type: 'module' });

let latestRequest = 0;
let grid = null;
let chosen = null;
let recomputeTimer = 0;
let playing = 0;

rocketForm.elements.launcher.append(...Object.entries(LAUNCHERS).map(([key, launcher]) => new Option(launcher.name, key)));

for (const picker of document.querySelectorAll('[data-planet-picker]')) {
  picker.append(...PLANETS.map((planet) => new Option(PLANET_LOOKS[planet].name, planet)));
}

function suggestRanges() {
  const { from, to } = form.elements;
  if (from.value === to.value) return;
  const today = julianFromUtcMs(Date.now());
  const hohmann = hohmannFlightDays(from.value, to.value, today);
  const synodicYears = yearsFromDays(synodicPeriodDays(from.value, to.value, today));
  const windowYears = Math.min(WINDOW_YEARS_RANGE[1], Math.max(WINDOW_YEARS_RANGE[0], synodicYears * WINDOW_OVER_SYNODIC));
  form.elements.windowYears.value = Math.round(windowYears * 4) / 4;
  form.elements.flightMin.value = Math.round(hohmann * SHORTEST_OVER_HOHMANN);
  form.elements.flightMax.value = Math.round(hohmann * LONGEST_OVER_HOHMANN);
  rocketForm.elements.periapsisAltitude.value = defaultPeriapsisAltitude(to.value);
  rocketForm.elements.apoapsisAltitude.value = defaultApoapsisAltitude(to.value);
  const fromEarth = from.value === 'earth';
  rocketForm.elements.launcher.disabled = !fromEarth;
  rocketForm.elements.launcher.title = fromEarth ? '' : 'Launchers lift off from Earth. Away from Earth the spacecraft starts in a low orbit.';
}

function updateMission() {
  if (!chosen) return;
  const field = (name) => rocketForm.elements[name].value;
  const payload = Number(field('payload'));
  if (!(payload > 0)) return;
  const mission = simulateMission({
    transfer: chosen,
    launcher: rocketForm.elements.launcher.disabled ? null : field('launcher'),
    payload,
    stages: rocketEditor.get(),
    goal: field('goal'),
    periapsisAltitude: Number(field('periapsisAltitude')),
    apoapsisAltitude: Number(field('apoapsisAltitude')),
  });
  renderReport(report, verdict, mission, chosen);
  rocketForm.querySelector('[data-orbit-only]').hidden = field('goal') !== 'orbit';
}

function showTab(name) {
  tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
  tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== name;
  });
}

function readSpec() {
  const field = (name) => form.elements[name].value;
  const departStart = julianFromIsoDate(field('windowStart'));
  const flightMin = Number(field('flightMin'));
  const flightMax = Number(field('flightMax'));
  if (field('from') === field('to')) return { problem: 'Pick two different planets.' };
  if (!Number.isFinite(departStart)) return { problem: 'Pick a launch date.' };
  if (!(flightMax > flightMin && flightMin > 0)) return { problem: 'The longest trip has to be longer than the shortest.' };
  return {
    spec: { from: field('from'), to: field('to'), departStart, departDays: Number(field('windowYears')) * DAYS_PER_YEAR, flightMin, flightMax, ...GRID },
  };
}

function recompute() {
  window.clearTimeout(recomputeTimer);
  recomputeTimer = window.setTimeout(() => {
    const { spec, problem } = readSpec();
    if (problem) {
      readout.textContent = problem;
      return;
    }
    readout.textContent = 'Computing…';
    latestRequest += 1;
    worker.postMessage({ id: latestRequest, spec });
  }, RECOMPUTE_DELAY_MS);
}

worker.addEventListener('message', ({ data }) => {
  if (data.id !== latestRequest) return;
  grid = data.grid;
  plot.show(grid, form.elements.metric.value);
  choose(plot.cellOf(plot.best()));
  describeHover(null);
});

function choose({ index, departJd, flightDays }) {
  const transfer = directTransferOrNull(grid.from, grid.to, departJd, departJd + flightDays);
  if (!transfer) return;
  chosen = transfer;
  plot.pick(index);
  view.show(transfer);
  showFacts(transfer);
  showMissionDate();
  updateMission();
}

function flightText(days) {
  const years = yearsFromDays(days);
  return years >= 2 ? `${years.toFixed(1)} years` : `${Math.round(days)} days`;
}

function describeHover(cell) {
  if (!grid) return;
  const metric = METRICS[form.elements.metric.value];
  if (cell && Number.isFinite(cell.value)) {
    readout.textContent = `Launch ${isoDate(cell.departJd)}, ${flightText(cell.flightDays)} trip: ${metric.label} ${metric.format(cell.value)}`;
    return;
  }
  readout.textContent = 'Launch date across, trip length up. Brighter is cheaper. Click or drag to pick a trajectory.';
}

function addFact(term, value, title) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  if (title) dt.title = title;
  const dd = document.createElement('dd');
  dd.textContent = value;
  facts.append(dt, dd);
}

function addNote(text) {
  const item = document.createElement('li');
  item.textContent = text;
  notes.append(item);
}

function showFacts(transfer) {
  const flightDays = transfer.arriveJd - transfer.departJd;
  const declination = transfer.declination * DEGREES;
  const sweep = transfer.sweep * DEGREES;
  const tilt = transfer.inclination * DEGREES;
  const fromName = PLANET_LOOKS[transfer.from].name;

  facts.replaceChildren();
  addFact('Launch', isoDate(transfer.departJd));
  addFact('Arrival', isoDate(transfer.arriveJd));
  addFact('Trip', flightText(flightDays));
  addFact('Launch energy (C3)', `${transfer.c3.toFixed(2)} km²/s²`, `Twice the energy per kilogram left over after escaping ${fromName}. The launcher has to supply it.`);
  addFact('Speed leaving', `${Math.sqrt(transfer.c3).toFixed(2)} km/s`, `Speed relative to ${fromName} once clear of its gravity.`);
  addFact('Launch direction (DLA)', `${declination.toFixed(1)}°`, `How far north or south of ${fromName}'s equator the departure points.`);
  addFact('Arrival speed', `${transfer.arrivalSpeed.toFixed(2)} km/s`, `Speed relative to ${PLANET_LOOKS[transfer.to].name} on approach. Getting into orbit means cancelling most of it.`);
  addFact('Trip angle', `${sweep.toFixed(0)}°`, 'How far around the Sun the spacecraft travels.');
  addFact('Plane tilt', `${tilt.toFixed(2)}°`, 'Tilt of the trajectory from the plane of Earth\'s orbit.');

  notes.replaceChildren();
  if (transfer.from === 'earth' && Math.abs(declination) > CAPE_CANAVERAL_LATITUDE) {
    addNote(
      `The departure points ${Math.abs(declination).toFixed(0)}° ${declination > 0 ? 'north' : 'south'} of the equator. From Cape Canaveral (28.5° N) the parking orbit must tilt at least that far, which costs the launcher payload.`,
    );
  }
  if (sweep > NEAR_HALF_ORBIT_DEGREES[0] && sweep < NEAR_HALF_ORBIT_DEGREES[1] && tilt > STEEP_PLANE_DEGREES) {
    addNote(
      `This path goes almost exactly halfway around the Sun. There, the planets' small tilts force the whole trajectory plane to tilt ${tilt.toFixed(0)}°, and that costs extra speed. A 2D planner would not show this.`,
    );
  }
  if (transfer.c3 > HUGE_C3) {
    addNote('A C3 above 100 km²/s² is out of reach for nearly every launcher. New Horizons needed 158 to send a 478 kg probe, using an Atlas V 551 plus an extra solid rocket stage.');
  }
  if (yearsFromDays(flightDays) > LONG_CRUISE_YEARS) {
    addNote('Trips this long are why outer-planet missions use gravity assists. Voyager 2 reached Neptune in 12 years by swinging past Jupiter, Saturn and Uranus.');
  }
}

function showMissionDate() {
  if (!chosen) return;
  const fraction = Number(missionTime.value) / Number(missionTime.max);
  missionDate.textContent = isoDate(chosen.departJd + (chosen.arriveJd - chosen.departJd) * fraction);
  view.setFraction(fraction);
}

function stopPlaying() {
  window.cancelAnimationFrame(playing);
  playing = 0;
  playButton.textContent = 'Play';
}

function play() {
  if (playing) {
    stopPlaying();
    return;
  }
  if (Number(missionTime.value) >= Number(missionTime.max)) missionTime.value = 0;
  playButton.textContent = 'Pause';
  let last = performance.now();
  const step = (now) => {
    const advance = ((now - last) / 1000 / PLAY_SECONDS) * Number(missionTime.max);
    last = now;
    missionTime.value = Math.min(Number(missionTime.max), Number(missionTime.value) + advance);
    showMissionDate();
    if (Number(missionTime.value) >= Number(missionTime.max)) stopPlaying();
    else playing = window.requestAnimationFrame(step);
  };
  playing = window.requestAnimationFrame(step);
}

form.addEventListener('input', (event) => {
  if (event.target.name === 'metric') {
    if (grid) {
      plot.show(grid, event.target.value);
      choose(plot.cellOf(plot.best()));
    }
    return;
  }
  if (event.target.name === 'from' || event.target.name === 'to') suggestRanges();
  recompute();
});
form.addEventListener('submit', (event) => event.preventDefault());
missionTime.addEventListener('input', showMissionDate);
rocketForm.addEventListener('input', (event) => {
  if (!event.target.closest('[data-stages]')) updateMission();
});
rocketForm.addEventListener('submit', (event) => event.preventDefault());
tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.tab)));
playButton.addEventListener('click', play);
bestButton.addEventListener('click', () => grid && choose(plot.cellOf(plot.best())));

rocketForm.elements.launcher.value = DEFAULT_ROCKET.launcher;
rocketForm.elements.payload.value = DEFAULT_ROCKET.payload;
rocketForm.elements.goal.value = DEFAULT_ROCKET.goal;
rocketEditor.set(DEFAULT_ROCKET.stages);
form.elements.from.value = 'earth';
form.elements.to.value = 'mars';
const today = new Date();
form.elements.windowStart.value = [today.getFullYear(), today.getMonth() + 1, today.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
suggestRanges();
recompute();
