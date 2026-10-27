import { parseBlueprint } from './blueprint.js';
import { el, find } from './dom.js';
import { bestAscent, shortfallAtApoapsis } from './ascent.js';
import { EARTH, PARKING_ORBIT_CLEARANCE, destinations, earthEscape } from './bodies.js';
import { simulateFlight, stageDoesSomething } from './flight.js';
import { burnColour, drawRocket, droppedAfterBurn } from './view.js';

const fileInput = find('[data-file]');
const dropZone = find('[data-drop]');
const pasteBox = find('[data-paste]');
const stagingFieldset = find('[data-staging]');
const fileStagingInput = find('[data-staging-file]');
const autoStagingInput = find('[data-staging-auto]');
const stagingHint = find('[data-staging-hint]');
const unknownFieldset = find('[data-unknown]');
const unknownList = find('[data-unknown-list]');
const statusLine = find('[data-status]');
const results = find('[data-results]');
const canvas = find('[data-rocket]');

const state = { rocket: null, useFileStaging: false, unknownPartMass: {}, lastResult: null };

const tons = (value) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })} t`;
const metresPerSecond = (value) => Math.round(value).toLocaleString();
const seconds = (value) => (value >= 100 ? `${Math.round(value)} s` : `${value.toFixed(1)} s`);

function showStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle('is-error', isError);
  statusLine.hidden = !message;
}

function loadBlueprint(text, source) {
  try {
    state.rocket = parseBlueprint(text);
  } catch (error) {
    state.rocket = null;
    results.hidden = true;
    stagingFieldset.hidden = true;
    unknownFieldset.hidden = true;
    showStatus(error.message, true);
    return;
  }
  state.useFileStaging = playerStages().length > 0;
  showStatus(`Loaded ${source}: ${state.rocket.parts.length} parts.`);
  renderUnknownParts();
  render();
}

function playerStages() {
  return state.rocket.stages.filter((stage) => stageDoesSomething(state.rocket, stage));
}

function renderStaging() {
  const usable = playerStages().length;
  const skipped = state.rocket.stages.length - usable;
  stagingFieldset.hidden = false;
  fileStagingInput.disabled = usable === 0;
  fileStagingInput.checked = state.useFileStaging;
  autoStagingInput.checked = !state.useFileStaging;
  if (state.useFileStaging) {
    const skippedNote = skipped ? `, skipping ${skipped} that don't fire an engine, separator, docking port or fairing` : '';
    stagingHint.textContent = `Using ${usable} stages from the file${skippedNote}. Each one fires as soon as an engine runs dry.`;
  } else {
    const reason = usable === 0 ? 'The file has no stages set, so they are worked out. ' : '';
    stagingHint.textContent = `${reason}Engines with open nozzles light at liftoff. A separator fires once everything beyond it is out of fuel, and any engine it uncovers lights. Fairings drop after the first burn.`;
  }
}

function renderUnknownParts() {
  const names = [...new Set(state.rocket.parts.filter((p) => !p.known).map((p) => p.name))];
  unknownFieldset.hidden = names.length === 0;
  unknownList.replaceChildren(
    ...names.map((name) => {
      const count = state.rocket.parts.filter((p) => p.name === name).length;
      const input = el('input', {
        type: 'number',
        class: 'dv-input',
        min: 0,
        step: 0.01,
        value: state.unknownPartMass[name] ?? 0,
        'aria-label': `Mass of one ${name} in tons`,
        oninput: () => {
          state.unknownPartMass[name] = Math.max(0, Number(input.value) || 0);
          render();
        },
      });
      return el('label', { class: 'dv-unknown' }, el('span', {}, count > 1 ? `${name} (× ${count})` : name), input);
    }),
  );
}

function render() {
  if (!state.rocket) return;
  renderStaging();
  const result = simulateFlight(state.rocket, state);
  state.lastResult = result;
  results.hidden = false;

  find('[data-total]').textContent = metresPerSecond(result.totalDeltaV);
  find('[data-launch]').textContent = result.liftoffThrust
    ? `Launch mass ${tons(result.launchMass)}, liftoff thrust ${tons(result.liftoffThrust)}, thrust / weight ${(result.liftoffThrust / result.launchMass).toFixed(2)}. These should match the numbers under the rocket in the build screen.`
    : `Launch mass ${tons(result.launchMass)}. No engine is lit at liftoff.`;

  find('[data-warnings]').replaceChildren(...warningsFor(result).map((text) => el('li', {}, text)));
  const ascent = bestAscent(state.rocket, state);
  renderOrbitCheck(result, ascent);
  renderDestinations(ascent.reached ? ascent.leftInOrbit : null);
  find('[data-timeline]').replaceChildren(...result.timeline.map(timelineEntry));
  renderLegend(result);
  drawRocket(canvas, state.rocket, result.droppedAt);
}

const kilometres = (metres) => `${Math.round(metres / 1000)} km`;
const PARKING_HEIGHT = EARTH.atmosphere.height + PARKING_ORBIT_CLEARANCE;
const TIGHT_MARGIN = 150;

function orbitVerdict(result, ascent) {
  if (ascent.reached) {
    const left = ascent.leftInOrbit;
    if (left < TIGHT_MARGIN) {
      return ['dv-close', `Reaches orbit, but only just: ${metresPerSecond(left)} m/s to spare. It takes a near-perfect flight.`];
    }
    return ['dv-yes', `Reaches a ${kilometres(PARKING_HEIGHT)} orbit with ${metresPerSecond(left)} m/s to spare.`];
  }
  if (ascent.reason === 'weight') {
    const ratio = result.liftoffThrust / result.launchMass;
    return ['dv-no', `Can't leave the pad. Thrust / weight is ${ratio.toFixed(2)} and needs to be above 1.`];
  }
  const shortBy = shortfallAtApoapsis(ascent);
  if (shortBy !== null) {
    return ['dv-no', `Can't reach orbit, even with a perfect flight. It runs out of fuel about ${metresPerSecond(shortBy)} m/s short.`];
  }
  return ['dv-no', `Can't reach orbit, even with a perfect flight. The best try tops out at ${kilometres(ascent.maxHeight)} and falls back.`];
}

function orbitAdvice(result, ascent) {
  if (ascent.reached) {
    const orbitalSpeed = ascent.speed;
    const gravityLoss = Math.max(0, ascent.spent - orbitalSpeed - ascent.dragLoss);
    return `The best flight uses ${metresPerSecond(ascent.spent)} m/s of Δv: ${metresPerSecond(orbitalSpeed)} m/s of orbital speed, about ${metresPerSecond(gravityLoss)} m/s lost to gravity and ${metresPerSecond(ascent.dragLoss)} m/s to air. It starts tilting right after liftoff and flies sideways by ${kilometres(ascent.turnEndHeight)}. If you can't get to orbit with this rocket, the flight needs work, not the rocket: tilt over gradually, and once the apoapsis is above ${kilometres(EARTH.atmosphere.height)}, coast up to it and burn sideways there.`;
  }
  if (ascent.reason === 'weight') {
    return 'Add engines or take off weight. Around 1.3 or more climbs well, and below that much of the fuel goes into fighting gravity.';
  }
  return 'The rocket design is the problem, not the flying. Add fuel or a stage, or give the upper stage a higher-Isp engine such as the Valiant or Frontier.';
}

function renderOrbitCheck(result, ascent) {
  const [tone, verdict] = orbitVerdict(result, ascent);
  const verdictLine = find('[data-orbit-verdict]');
  verdictLine.className = `dv-verdict ${tone}`;
  verdictLine.textContent = verdict;
  find('[data-orbit-detail]').textContent = orbitAdvice(result, ascent);
}

function destinationCell(needed, available) {
  if (needed === null) return el('td', {}, '–');
  const reachable = available !== null && needed <= available;
  return el(
    'td',
    { class: available === null ? '' : reachable ? 'dv-yes' : 'dv-no', title: reachable ? 'Enough Δv' : 'Not enough Δv' },
    `${reachable ? '✓ ' : ''}${metresPerSecond(needed)}`,
  );
}

function renderDestinations(available) {
  find('[data-destinations-intro]').textContent = available === null
    ? 'It has to reach orbit first. These are the Δv figures for later.'
    : `With ${metresPerSecond(available)} m/s left in low Earth orbit, it can do everything marked ✓.`;
  const escape = earthEscape();
  const rows = [
    el('tr', {}, el('td', { class: 'dv-place' }, 'Leave Earth for good'), destinationCell(escape, available), el('td', {}, '–'), el('td', {}, '–')),
    ...destinations().map((place) => el(
      'tr',
      { class: place.parent === 'Sun' ? '' : 'dv-moon' },
      el('td', { class: 'dv-place' }, place.parent === 'Sun' || place.parent === 'Earth' ? place.name : `${place.name} (${place.parent})`, place.note ? el('small', {}, place.note) : null),
      destinationCell(place.orbit, available),
      destinationCell(place.land, available),
      destinationCell(place.landAndReturn, available),
    )),
  ];
  find('[data-destinations]').replaceChildren(...rows);
}

function warningsFor(result) {
  const warnings = [];
  if (state.rocket.resizedParts > 0) {
    warnings.push(`${state.rocket.resizedParts} parts are resized by blueprint editing. Their attachments may be read wrong, and resized engines and tanks may not weigh or push what the game says.`);
  }
  if (state.rocket.bridgedGaps > 0) {
    warnings.push(`${state.rocket.bridgedGaps === 1 ? 'One piece' : `${state.rocket.bridgedGaps} pieces`} didn't seem to touch the rest of the rocket, probably because of a part whose shape the calculator doesn't know. Each was joined to the nearest part.`);
  }
  if (result.unknown) {
    warnings.push(`No data for: ${result.unknown}. They count as the masses entered on the left, 0 t until you change them.`);
  }
  if (result.leftoverFuel > 0.05) {
    warnings.push(`${tons(result.leftoverFuel)} of fuel is never burned, because no lit engine is connected to it.`);
  }
  if (result.burnCount === 0) {
    warnings.push('No engine ever burns. Check that the engines sit directly under fuel tanks and are in a stage.');
  }
  return warnings;
}

function timelineEntry(entry) {
  if (entry.kind === 'stage') {
    const actions = [];
    if (entry.ignited) actions.push(`lights ${entry.ignited}`);
    if (entry.shutDown) actions.push(`shuts down ${entry.shutDown}`);
    if (entry.droppedCount) {
      const fuelNote = entry.droppedFuel > 0.05 ? `, ${tons(entry.droppedFuel)} of it unburned fuel` : '';
      actions.push(`drops ${entry.droppedCount} parts (${tons(entry.droppedMass)}${fuelNote})`);
    }
    return el('li', { class: 'dv-event' }, el('strong', {}, entry.title), `: ${actions.join(', ')}`);
  }
  const detail = [
    `Burns ${seconds(entry.seconds)}`,
    `${tons(entry.startMass)} → ${tons(entry.endMass)}`,
    `thrust / weight ${(entry.thrust / entry.startMass).toFixed(2)} at the start`,
  ];
  if (entry.burnedOut) detail.push(`then ${entry.burnedOut} ${/[×,]/.test(entry.burnedOut) ? 'run' : 'runs'} dry`);
  return el(
    'li',
    { class: 'dv-burn' },
    el('span', { class: 'dv-burn-swatch', style: `background:${burnColour(entry.burn)}` }),
    el('span', { class: 'dv-burn-engines' }, `Burn ${entry.burn + 1}: ${entry.engines}`),
    el('span', { class: 'dv-burn-dv' }, `${metresPerSecond(entry.deltaV)} m/s`),
    el('span', { class: 'dv-burn-detail' }, detail.join(' · ')),
  );
}

function renderLegend(result) {
  const groups = [...new Set(result.droppedAt.map(droppedAfterBurn))].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  const labelFor = (burn) => {
    if (burn === null) return 'Still attached at the end';
    if (burn < 0) return 'Not attached, or dropped before liftoff';
    return `Falls away after burn ${burn + 1}`;
  };
  find('[data-legend]').replaceChildren(
    ...groups.map((burn) => el('span', { class: 'dv-legend-item' }, el('i', { style: `background:${burnColour(burn)}` }), labelFor(burn))),
  );
}

async function readFile(file) {
  if (!file) return;
  loadBlueprint(await file.text(), file.name);
}

fileInput.addEventListener('change', () => readFile(fileInput.files[0]));

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('is-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-over'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('is-over');
  readFile(event.dataTransfer.files[0]);
});

find('[data-paste-go]').addEventListener('click', () => loadBlueprint(pasteBox.value, 'pasted text'));

find('[data-example]').addEventListener('click', async () => {
  const response = await fetch('samples/side-boosters.txt');
  loadBlueprint(await response.text(), 'the example rocket (two stages, two side boosters)');
});

for (const input of [fileStagingInput, autoStagingInput]) {
  input.addEventListener('change', () => {
    state.useFileStaging = fileStagingInput.checked;
    render();
  });
}

window.addEventListener('resize', () => {
  if (state.rocket && state.lastResult) drawRocket(canvas, state.rocket, state.lastResult.droppedAt);
});
