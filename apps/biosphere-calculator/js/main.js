import { el, find } from './dom.js';
import { GAS_CHOICES, SOLVENTS, assessLife, significant } from './life.js';
import { drawMap, zoneColour } from './map.js';
import { describeWorld } from './physics.js';
import { WORLDS } from './presets.js';
import { plainText, reportSections } from './report.js';
import { LIFE_FIELDS, presetParams, readLife, readParams, readPlanet, writeLife } from './world.js';

const AUTO_SOLVENT = 'auto';
const KIND_NAMES = { rocky: 'rocky planet', neptune: 'mini-Neptune', giant: 'gas giant' };

const inputs = {};
const gasSelect = el('select', { class: 'bio-input', 'aria-label': 'Main gas' });
const solventSelect = el('select', { class: 'bio-input', 'aria-label': 'Liquid life uses' });
const worldSelect = el('select', { class: 'bio-input', 'aria-label': 'Start from' });
const worldName = el('strong', { class: 'bio-world-name' });
const worldFacts = el('p', { class: 'bio-note' });
const editPlanet = el('a', { class: 'bio-button bio-link-button' }, 'Change the planet in Planet Calculator');
const results = find('[data-results]');
const mapCanvas = find('[data-map]');
const legend = find('[data-legend]');
const status = find('[data-status]');

let params = readParams(window.location.hash);
let current = null;

function numberField(field) {
  const spec = LIFE_FIELDS[field];
  const input = el('input', { type: 'number', class: 'bio-input', min: spec.min, max: spec.max, step: spec.step, inputmode: 'decimal' });
  inputs[field] = input;
  return el('label', { class: 'bio-field' }, el('span', {}, spec.label), input, el('small', { class: 'bio-hint' }, spec.hint));
}

function labelled(text, control, hint) {
  return el('label', { class: 'bio-field' }, el('span', {}, text), control, hint ? el('small', { class: 'bio-hint' }, hint) : null);
}

function fillForm(life) {
  for (const field of Object.keys(LIFE_FIELDS)) inputs[field].value = String(life[field]);
  gasSelect.value = life.mainGas;
  solventSelect.value = life.solvent in SOLVENTS ? life.solvent : AUTO_SOLVENT;
}

function readForm() {
  const life = {};
  for (const [field, spec] of Object.entries(LIFE_FIELDS)) {
    const value = Number(inputs[field].value);
    life[field] = inputs[field].value === '' || !Number.isFinite(value) ? spec.min : Math.min(spec.max, Math.max(spec.min, value));
  }
  life.mainGas = gasSelect.value;
  life.solvent = solventSelect.value;
  return life;
}

function describePlanet(world) {
  const { star, planet, orbit, spin } = world;
  return `${star.spectral}-type star · ${KIND_NAMES[planet.kind]} · ${significant(planet.gravityG, 2)} g · ${significant(orbit.distanceAu)} AU${spin.locked ? ' · tidally locked' : ''}`;
}

function renderRow(row) {
  return el(
    'div',
    { class: `bio-row${row.tone ? ` bio-${row.tone}` : ''}` },
    el('dt', {}, row.label),
    el('dd', {}, el('span', {}, row.value), row.note ? el('small', { class: 'bio-hint' }, row.note) : null),
  );
}

function renderLegend(zones) {
  legend.replaceChildren(
    ...zones.map((zone) =>
      el('span', { class: 'bio-key' }, el('span', { class: 'bio-swatch', style: `background:${zoneColour(zone)}` }), zone.name),
    ),
    el('small', { class: 'bio-hint' }, 'Brighter green makes more food. Pale blue is frozen, orange too hot, brown has no liquid.'),
  );
}

function render() {
  const planet = readPlanet(params);
  const world = describeWorld(planet.chosen);
  const life = assessLife(world, readLife(params));
  const sections = reportSections(planet.name, world, life);
  current = { sections, world, life };
  worldName.textContent = planet.name;
  worldFacts.textContent = describePlanet(world);
  editPlanet.href = `../planet-calculator/#${params}`;
  results.replaceChildren(
    ...sections.map((section) =>
      el(
        'section',
        { class: `bio-card${section.wide ? ' bio-wide' : ''}` },
        el('h3', {}, section.title),
        el('dl', {}, section.rows.map(renderRow)),
      ),
    ),
  );
  drawMap(mapCanvas, world, life.zones);
  mapCanvas.setAttribute('aria-label', `Zones of ${planet.name}: ${life.zones.map((zone) => `${zone.name}, ${zone.state}`).join('; ')}`);
  renderLegend(life.zones);
}

function save() {
  window.history.replaceState(null, '', `#${params}`);
}

async function copy(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = done;
  } catch {
    status.textContent = 'Copying was blocked by the browser.';
  }
}

function buildForm() {
  worldSelect.append(el('option', { value: '' }, 'Choose a known world…'));
  for (const [id, world] of Object.entries(WORLDS)) worldSelect.append(el('option', { value: id }, world.name));
  for (const gas of GAS_CHOICES) gasSelect.append(el('option', { value: gas.id }, `${gas.name} (${gas.formula})`));
  solventSelect.append(el('option', { value: AUTO_SOLVENT }, 'Whichever stays liquid most'));
  for (const [id, solvent] of Object.entries(SOLVENTS)) solventSelect.append(el('option', { value: id }, solvent.name));

  const form = find('[data-form]');
  form.append(
    el(
      'fieldset',
      {},
      el('legend', {}, 'Planet'),
      worldName,
      worldFacts,
      labelled('Start from', worldSelect),
      editPlanet,
      el('small', { class: 'bio-hint' }, 'Planet Calculator has a link back here, so you can tune the star and orbit there and return.'),
    ),
    el('fieldset', {}, el('legend', {}, 'Air'), numberField('pressureBar'), labelled('Main gas', gasSelect), numberField('oxygenBar')),
    el(
      'fieldset',
      {},
      el('legend', {}, 'Surface'),
      numberField('oceanPercent'),
      labelled('Liquid life uses', solventSelect, 'Water on Earth. Ammonia, ethane and methane stay liquid on far colder worlds.'),
    ),
  );

  worldSelect.addEventListener('change', () => {
    if (!worldSelect.value) return;
    params = presetParams(worldSelect.value);
    worldSelect.value = '';
    fillForm(readLife(params));
    save();
    render();
  });
  form.addEventListener('input', (event) => {
    if (event.target === worldSelect) return;
    writeLife(params, readForm());
    save();
    render();
  });

  find('[data-copy-text]').addEventListener('click', () => copy(plainText(current.sections), 'Summary copied.'));
  find('[data-copy-link]').addEventListener('click', () => copy(window.location.href, 'Link copied. It opens this exact world.'));
}

buildForm();
fillForm(readLife(params));
save();
render();
window.addEventListener('hashchange', () => {
  params = readParams(window.location.hash);
  fillForm(readLife(params));
  render();
});
new ResizeObserver(() => {
  if (current) drawMap(mapCanvas, current.world, current.life.zones);
}).observe(mapCanvas.parentElement);
