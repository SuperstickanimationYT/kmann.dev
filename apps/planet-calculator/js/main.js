import { el, find } from './dom.js';
import { describeWorld, mainSequenceStar, typicalRadiusEarth } from './physics.js';
import { CUSTOM_STAR, STARS, STARTING_WORLD, WORLDS } from './presets.js';
import { plainText, resultSections, significant } from './results.js';
import { drawSky, drawZone } from './views.js';

const FIELDS = {
  starMass: { label: 'Mass (Sun = 1)', min: 0.08, max: 50, step: 0.01 },
  age: { label: 'Age (billion years)', min: 0.01, max: 13.8, step: 0.1 },
  planetMass: { label: 'Mass (Earth = 1)', min: 0.01, max: 4000, step: 0.01 },
  planetRadius: { label: 'Radius (Earth = 1)', min: 0.1, max: 25, step: 0.01 },
  albedo: { label: 'Reflectivity (albedo, 0 to 1)', min: 0, max: 0.95, step: 0.01, hint: 'Earth 0.3, fresh snow 0.8, bare rock 0.1.' },
  greenhouse: { label: 'Greenhouse warming (°C)', min: 0, max: 600, step: 1, hint: 'Earth 33, Mars 5, Venus about 500, none 0.' },
  tilt: { label: 'Axial tilt (°)', min: 0, max: 90, step: 0.1 },
  distance: { label: 'Distance from its star (AU)', min: 0.001, max: 1000, step: 0.001, hint: '1 AU is Earth’s distance from the Sun.' },
  eccentricity: { label: 'Eccentricity (0 is a circle)', min: 0, max: 0.95, step: 0.01 },
  rotation: { label: 'Rotation period (hours)', min: 1, max: 100000, step: 0.1 },
};

const HASH_KEYS = {
  star: 'star',
  starMass: 'm',
  age: 'age',
  planetMass: 'pm',
  planetRadius: 'pr',
  albedo: 'alb',
  greenhouse: 'gh',
  tilt: 'tilt',
  distance: 'a',
  eccentricity: 'e',
  rotation: 'rot',
  locked: 'lock',
  name: 'name',
};

const inputs = {};
const starSelect = el('select', { class: 'pc-input', 'aria-label': 'Primary star' });
const worldSelect = el('select', { class: 'pc-input', 'aria-label': 'Start from' });
const nameInput = el('input', { type: 'text', class: 'pc-input', autocomplete: 'off', placeholder: 'Unnamed world' });
const lockedInput = el('input', { type: 'checkbox' });
const starFacts = el('p', { class: 'pc-note' });
const results = find('[data-results]');
const zoneCanvas = find('[data-zone]');
const skyCanvas = find('[data-sky]');
const status = find('[data-status]');

let currentWorld = null;

function numberField(key) {
  const spec = FIELDS[key];
  const input = el('input', { type: 'number', class: 'pc-input', min: spec.min, max: spec.max, step: spec.step, inputmode: 'decimal' });
  inputs[key] = input;
  return el(
    'label',
    { class: 'pc-field' },
    el('span', {}, spec.label),
    input,
    spec.hint ? el('small', { class: 'pc-hint' }, spec.hint) : null,
  );
}

function readNumber(key) {
  const spec = FIELDS[key];
  const value = Number(inputs[key].value);
  if (!Number.isFinite(value) || inputs[key].value === '') return null;
  return Math.min(spec.max, Math.max(spec.min, value));
}

function selectedStar() {
  if (starSelect.value !== CUSTOM_STAR) return STARS[starSelect.value];
  return mainSequenceStar(readNumber('starMass') ?? 1);
}

function describeStar(star) {
  return `Radius ${significant(star.radiusSun)} × the Sun, luminosity ${significant(star.luminositySun)} × the Sun, ${Math.round(star.temperatureK).toLocaleString('en')} K.`;
}

function setValue(key, value) {
  inputs[key].value = String(value);
}

function loadWorld(id) {
  const world = WORLDS[id];
  const star = STARS[world.star];
  starSelect.value = world.star;
  setValue('starMass', star.massSun);
  setValue('age', star.ageGyr);
  setValue('planetMass', world.planet.massEarth);
  setValue('planetRadius', world.planet.radiusEarth);
  setValue('albedo', world.planet.albedo);
  setValue('greenhouse', world.planet.greenhouseK);
  setValue('tilt', world.planet.tiltDeg);
  setValue('distance', world.orbit.distanceAu);
  setValue('eccentricity', world.orbit.eccentricity);
  setValue('rotation', world.rotation.hours);
  lockedInput.checked = world.rotation.locked;
  nameInput.value = world.name;
}

function loadHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (!params.has(HASH_KEYS.distance)) return false;
  const star = params.get(HASH_KEYS.star);
  starSelect.value = star in STARS || star === CUSTOM_STAR ? star : CUSTOM_STAR;
  for (const key of Object.keys(FIELDS)) {
    if (params.has(HASH_KEYS[key])) setValue(key, params.get(HASH_KEYS[key]));
  }
  lockedInput.checked = params.get(HASH_KEYS.locked) === '1';
  nameInput.value = params.get(HASH_KEYS.name) ?? '';
  return true;
}

function saveHash() {
  const params = new URLSearchParams();
  params.set(HASH_KEYS.star, starSelect.value);
  for (const key of Object.keys(FIELDS)) params.set(HASH_KEYS[key], inputs[key].value);
  params.set(HASH_KEYS.locked, lockedInput.checked ? '1' : '0');
  if (nameInput.value.trim()) params.set(HASH_KEYS.name, nameInput.value.trim());
  window.history.replaceState(null, '', `#${params}`);
}

function readWorld() {
  const star = selectedStar();
  const planetMass = readNumber('planetMass') ?? 1;
  return {
    star,
    ageGyr: readNumber('age') ?? 4.6,
    planet: {
      massEarth: planetMass,
      radiusEarth: readNumber('planetRadius') ?? typicalRadiusEarth(planetMass),
      albedo: readNumber('albedo') ?? 0.3,
      greenhouseK: readNumber('greenhouse') ?? 0,
      tiltDeg: readNumber('tilt') ?? 0,
    },
    orbit: { distanceAu: readNumber('distance') ?? 1, eccentricity: readNumber('eccentricity') ?? 0 },
    rotation: { locked: lockedInput.checked, hours: readNumber('rotation') ?? 24 },
  };
}

function renderRow(row) {
  return el(
    'div',
    { class: `pc-row${row.tone ? ` pc-${row.tone}` : ''}` },
    el('dt', {}, row.label),
    el(
      'dd',
      {},
      row.swatch ? el('span', { class: 'pc-swatch', style: `background:${row.swatch}`, title: row.swatch }) : null,
      el('span', {}, row.value),
      row.note ? el('small', { class: 'pc-hint' }, row.note) : null,
    ),
  );
}

function worldName() {
  return nameInput.value.trim() || 'Unnamed world';
}

function update() {
  const chosen = readWorld();
  starFacts.textContent = describeStar(chosen.star);
  inputs.rotation.disabled = lockedInput.checked;
  currentWorld = describeWorld(chosen);
  const sections = resultSections(currentWorld);
  results.replaceChildren(
    ...sections.map((section) =>
      el('section', { class: 'pc-card' }, el('h3', {}, section.title), el('dl', {}, section.rows.map(renderRow))),
    ),
  );
  drawZone(zoneCanvas, currentWorld);
  drawSky(skyCanvas, currentWorld);
  zoneCanvas.setAttribute('aria-label', sections[1].rows.find((row) => row.label === 'Habitable zone').value);
  saveHash();
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
  for (const [id, star] of Object.entries(STARS)) starSelect.append(el('option', { value: id }, star.name));
  starSelect.append(el('option', { value: CUSTOM_STAR }, 'Custom main-sequence star'));
  worldSelect.append(el('option', { value: '' }, 'Choose a real world…'));
  for (const [id, world] of Object.entries(WORLDS)) worldSelect.append(el('option', { value: id }, world.name));

  const typicalRadius = el('button', { type: 'button', class: 'pc-button' }, 'Typical for this mass');
  typicalRadius.addEventListener('click', () => {
    setValue('planetRadius', significant(typicalRadiusEarth(readNumber('planetMass') ?? 1)));
    update();
  });

  const form = find('[data-form]');
  form.append(
    el(
      'fieldset',
      {},
      el('legend', {}, 'World'),
      el('label', { class: 'pc-field' }, el('span', {}, 'Name'), nameInput),
      el('label', { class: 'pc-field' }, el('span', {}, 'Start from'), worldSelect),
    ),
    el(
      'fieldset',
      {},
      el('legend', {}, 'Primary star'),
      el('label', { class: 'pc-field' }, el('span', {}, 'Star'), starSelect),
      el('div', { class: 'pc-pair' }, numberField('starMass'), numberField('age')),
      starFacts,
    ),
    el(
      'fieldset',
      {},
      el('legend', {}, 'Planet'),
      el('div', { class: 'pc-pair' }, numberField('planetMass'), numberField('planetRadius')),
      typicalRadius,
      numberField('albedo'),
      numberField('greenhouse'),
    ),
    el('fieldset', {}, el('legend', {}, 'Orbit'), numberField('distance'), numberField('eccentricity')),
    el(
      'fieldset',
      {},
      el('legend', {}, 'Spin'),
      el('label', { class: 'pc-check' }, lockedInput, el('span', {}, 'Tidally locked (one side always faces its star)')),
      el('div', { class: 'pc-pair' }, numberField('rotation'), numberField('tilt')),
    ),
  );

  worldSelect.addEventListener('change', () => {
    if (!worldSelect.value) return;
    loadWorld(worldSelect.value);
    worldSelect.value = '';
    update();
  });
  starSelect.addEventListener('change', () => {
    if (starSelect.value !== CUSTOM_STAR) {
      setValue('starMass', STARS[starSelect.value].massSun);
      setValue('age', STARS[starSelect.value].ageGyr);
    }
    update();
  });
  inputs.starMass.addEventListener('input', () => {
    starSelect.value = CUSTOM_STAR;
  });
  form.addEventListener('input', update);

  find('[data-copy-text]').addEventListener('click', () =>
    copy(plainText(worldName(), resultSections(currentWorld)), 'Summary copied.'),
  );
  find('[data-copy-link]').addEventListener('click', () => copy(window.location.href, 'Link copied. It opens this exact world.'));
}

buildForm();
if (!loadHash()) loadWorld(STARTING_WORLD);
update();
new ResizeObserver(() => {
  if (!currentWorld) return;
  drawZone(zoneCanvas, currentWorld);
  drawSky(skyCanvas, currentWorld);
}).observe(zoneCanvas.parentElement);
