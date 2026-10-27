import { parseBlueprint } from '../../sfs-delta-v/js/blueprint.js';
import { el, find } from '../../sfs-delta-v/js/dom.js';
import { simulateFlight, stageDoesSomething } from '../../sfs-delta-v/js/flight.js';
import { drawRocket } from '../../sfs-delta-v/js/view.js';
import { convertBlueprint } from './convert.js';

const PAID_COLOUR = '#e8794a';
const STAND_IN_COLOUR = '#6cc46a';
const PLAIN_COLOUR = '#5a6b7d';
const NOTICEABLE_CHANGE = 0.01;

const fileInput = find('[data-file]');
const dropZone = find('[data-drop]');
const pasteBox = find('[data-paste]');
const statusLine = find('[data-status]');
const results = find('[data-results]');
const beforeCanvas = find('[data-before]');
const afterCanvas = find('[data-after]');

const state = { converted: null, before: null, after: null, fileText: '' };

function showStatus(message, isError = false) {
  statusLine.textContent = message;
  statusLine.classList.toggle('is-error', isError);
}

function flightOf(rocket) {
  const useFileStaging = rocket.stages.some((stage) => stageDoesSomething(rocket, stage));
  return simulateFlight(rocket, { useFileStaging, unknownPartMass: {} });
}

function loadBlueprint(text, source) {
  let json;
  let before;
  try {
    before = parseBlueprint(text);
    json = JSON.parse(text.replace(/^﻿/, ''));
  } catch (error) {
    results.hidden = true;
    showStatus(error.message, true);
    return;
  }
  const converted = convertBlueprint(json);
  state.converted = converted;
  state.fileText = `${JSON.stringify(converted.blueprint, null, 2)}\n`;
  state.before = before;
  state.after = parseBlueprint(state.fileText);
  showStatus(`Loaded ${source}: ${before.parts.length} parts.`);
  render();
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function render() {
  const { changes, paidIndexes } = state.converted;
  const removed = changes.filter((change) => change.to === null);
  const paidCount = paidIndexes.size;
  results.hidden = false;
  find('[data-headline]').textContent = paidCount === 0
    ? 'This rocket has no DLC parts, so there is nothing to convert.'
    : `Swapped ${plural(paidCount, 'DLC part')} for free parts.`;
  find('[data-actions]').hidden = paidCount === 0;
  find('[data-changes-card]').hidden = paidCount === 0;

  find('[data-changes]').replaceChildren(...changes.map((change) => el('tr', {},
    el('td', { class: 'dv-place' }, change.from),
    el('td', {}, change.to ?? 'Removed, no free stand-in yet'),
    el('td', {}, String(change.count)),
  )));

  const warnings = removed.map((change) => `${plural(change.count, change.from)} had no free stand-in and ${change.count === 1 ? 'was' : 'were'} removed.`);
  const newGaps = state.after.bridgedGaps - state.before.bridgedGaps;
  if (newGaps > 0) {
    warnings.push(`Without the removed parts, ${plural(newGaps, 'piece')} no longer ${newGaps === 1 ? 'touches' : 'touch'} the rest of the rocket and will fall off in the game.`);
  }
  find('[data-warnings]').replaceChildren(...warnings.map((text) => el('li', {}, text)));

  renderComparison(flightOf(state.before), flightOf(state.after));
  drawBoth();
}

function renderComparison(before, after) {
  const rows = [
    { label: 'Launch mass', unit: 't', digits: 1, before: before.launchMass, after: after.launchMass, higherIsBetter: false },
    { label: 'Thrust at liftoff', unit: 't', digits: 1, before: before.liftoffThrust, after: after.liftoffThrust, higherIsBetter: true },
    { label: 'Δv', unit: 'm/s', digits: 0, before: before.totalDeltaV, after: after.totalDeltaV, higherIsBetter: true },
  ];
  const format = (value, row) => `${value.toLocaleString(undefined, { maximumFractionDigits: row.digits, minimumFractionDigits: row.digits })} ${row.unit}`;
  find('[data-compare]').replaceChildren(...rows.map((row) => {
    const difference = row.after - row.before;
    const noticeable = Math.abs(difference) > NOTICEABLE_CHANGE * Math.max(Math.abs(row.before), 1);
    const better = difference > 0 === row.higherIsBetter;
    const sign = difference > 0 ? '+' : difference < 0 ? '−' : '';
    return el('tr', {},
      el('td', { class: 'dv-place' }, row.label),
      el('td', {}, format(row.before, row)),
      el('td', {}, format(row.after, row)),
      el('td', { class: noticeable ? (better ? 'fp-better' : 'fp-worse') : null }, `${sign}${format(Math.abs(difference), row)}`),
    );
  }));
}

function drawBoth() {
  const { paidIndexes, standInIndexes } = state.converted;
  drawRocket(beforeCanvas, state.before, (part) => (paidIndexes.has(part.index) ? PAID_COLOUR : PLAIN_COLOUR));
  drawRocket(afterCanvas, state.after, (part) => (standInIndexes.has(part.index) ? STAND_IN_COLOUR : PLAIN_COLOUR));
}

function download() {
  const url = URL.createObjectURL(new Blob([state.fileText], { type: 'text/plain' }));
  const link = el('a', { href: url, download: 'Blueprint.txt' });
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(button) {
  await navigator.clipboard.writeText(state.fileText);
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy the text'; }, 1500);
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
  const response = await fetch('samples/mars-lander.txt');
  loadBlueprint(await response.text(), 'the example rocket (a Mars lander with Titan and Frontier engines)');
});

find('[data-download]').addEventListener('click', download);
find('[data-copy]').addEventListener('click', (event) => copyText(event.currentTarget));

window.addEventListener('resize', () => {
  if (state.converted) drawBoth();
});
