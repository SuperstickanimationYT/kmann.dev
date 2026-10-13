import {
  AIR_WATER_CAPACITY, BARREL_CAPACITY, BLURBS, BUILDINGS, CARRY_LIMIT, HOPPER_CAPACITY, MAX_TANKS, RECIPES, RESOURCES,
} from './items.js';
import {
  airGeneratorRunning, canAfford, carried, collectOutput, count, craft, drainRocket, fillAirWater, fuelRocket, insertBattery,
  installPart, loadHopper, processBlocked, removePart, setAirLevel, storeInBarrel, storedTotal, takeBattery, takeFromBarrel,
} from './base.js';
import {
  DELTA_V_NEEDED, PROPELLANT_UNIT, dryMass, isFlyable, propellantCapacity, rocketDeltaV,
} from './rocket.js';

const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar(fraction, tone = 'good') {
  const percent = Math.max(0, Math.min(100, fraction * 100));
  return `<span class="mb-bar mb-bar-${tone}"><span style="width:${percent.toFixed(1)}%"></span></span>`;
}

function button(action, label, enabled = true, extra = '') {
  return `<button type="button" data-action="${action}" ${extra} ${enabled ? '' : 'disabled'}>${label}</button>`;
}

function batteryRow(game, b) {
  if (b.battery == null) {
    const n = game.inventory.batteries.length;
    return `<div class="mb-row"><span>Battery: none</span>${button('insert-battery', n ? 'Insert battery' : 'No battery carried', n > 0)}</div>`;
  }
  return `<div class="mb-row"><span>Battery ${Math.floor(b.battery)}%</span>${bar(b.battery / 100, b.battery > 20 ? 'good' : 'bad')}${button('take-battery', 'Take')}</div>`;
}

function airGeneratorMenu(game, b) {
  const rate = (0.15 * b.level).toFixed(2);
  const water = b.water + Math.max(0, b.waterUse);
  return `
    ${batteryRow(game, b)}
    <div class="mb-row"><span>Water ${water.toFixed(1)} / ${AIR_WATER_CAPACITY}</span>${bar(water / AIR_WATER_CAPACITY, 'water')}${button('fill-water', 'Fill', count(game, 'Water') > 0 && b.water < AIR_WATER_CAPACITY)}</div>
    <div class="mb-row"><span>Output</span>${button('air-down', '&minus;', b.level > 0)}<output>${b.level}</output>${button('air-up', '+', b.level < 4)}</div>
    <p class="mb-note">${airGeneratorRunning(b) ? `Running: O₂ +${rate}/s, CO₂ −${rate}/s.` : 'Stopped.'} Breathing uses 0.30/s, so output 2 holds you steady. Keep O₂ between 80 and 120 and CO₂ under 10.</p>`;
}

function solarMenu(game, b) {
  return `${batteryRow(game, b)}<p class="mb-note">Charges a battery at 1% a second. A battery left here is full in under two minutes.</p>`;
}

function processMenu(game, b) {
  const spec = BUILDINGS[b.type].process;
  const blocked = processBlocked(b);
  return `
    ${spec.drain ? batteryRow(game, b) : ''}
    <div class="mb-row"><span>${spec.input} ${b.hopper} / ${HOPPER_CAPACITY}</span>${button('load', `Load ${spec.input.toLowerCase()}`, count(game, spec.input) > 0 && b.hopper < HOPPER_CAPACITY)}</div>
    <div class="mb-row"><span>Working</span>${bar(b.progress)}</div>
    <div class="mb-row"><span>${spec.output} ready: ${b.output}</span>${button('collect', 'Collect', b.output > 0)}</div>
    <p class="mb-note">${spec.inputPer} ${spec.input.toLowerCase()} → 1 ${spec.output.toLowerCase()} every ${spec.seconds} s${spec.drain ? `, using ${spec.drain}% battery` : ''}. ${blocked ? `<strong>${blocked}.</strong>` : ''}</p>`;
}

function barrelMenu(game, b) {
  const carriedRows = RESOURCES.filter((name) => count(game, name) > 0)
    .map((name) => `<div class="mb-row"><span>${name} ×${count(game, name)}</span>${button('store', 'Store', storedTotal(b) < BARREL_CAPACITY, `data-item="${escape(name)}"`)}</div>`).join('');
  const storedRows = Object.entries(b.store)
    .map(([name, n]) => `<div class="mb-row"><span>${name} ×${n}</span>${button('take', 'Take', true, `data-item="${escape(name)}"`)}</div>`).join('');
  return `
    <p class="mb-note">Holds ${storedTotal(b)} / ${BARREL_CAPACITY}.</p>
    <h4>In the barrel</h4>${storedRows || '<p class="mb-note">Empty.</p>'}
    <h4>You carry</h4>${carriedRows || '<p class="mb-note">No resources.</p>'}`;
}

function fabricatorMenu(game) {
  const rows = RECIPES.map((recipe, index) => {
    const cost = Object.entries(recipe.cost).map(([name, n]) => `${n} ${name.toLowerCase()}`).join(' + ');
    return `<div class="mb-recipe"><div><strong>${recipe.item}</strong><small>${BLURBS[recipe.item]}</small></div><span>${cost}</span>${button('craft', 'Build', canAfford(game, recipe), `data-index="${index}"`)}</div>`;
  }).join('');
  return `<p class="mb-note">The lander's workshop builds from what you carry.</p>${rows}`;
}

function partRow(game, label, installed, part, canInstall) {
  return `<div class="mb-row"><span>${label}</span>${button('install', 'Install', canInstall && count(game, part) > 0, `data-item="${part}"`)}${button('remove', 'Remove', installed, `data-item="${part}"`)}</div>`;
}

function padMenu(game, b) {
  const rocket = b.rocket;
  const capacity = propellantCapacity(rocket);
  const dv = rocketDeltaV(rocket);
  const enough = dv >= DELTA_V_NEEDED;
  return `
    ${partRow(game, `Capsule ${rocket.capsule ? '✓' : '—'}`, rocket.capsule, 'Capsule', !rocket.capsule)}
    ${partRow(game, `Engine ${rocket.engine ? '✓' : '—'}`, rocket.engine, 'Engine', !rocket.engine)}
    ${partRow(game, `Tanks ${rocket.tanks} / ${MAX_TANKS}`, rocket.tanks > 0, 'Tank', rocket.tanks < MAX_TANKS)}
    <div class="mb-row"><span>Propellant ${(rocket.propellant / 1000).toFixed(0)} / ${(capacity / 1000).toFixed(0)} t</span>${bar(capacity ? rocket.propellant / capacity : 0, 'water')}${button('fuel', 'Load', count(game, 'Propellant') > 0 && rocket.propellant + PROPELLANT_UNIT <= capacity)}${button('drain', 'Unload', rocket.propellant >= PROPELLANT_UNIT)}</div>
    <dl class="mb-facts">
      <dt>Mass</dt><dd>${((dryMass(rocket) + rocket.propellant) / 1000).toFixed(2)} t (${(dryMass(rocket) / 1000).toFixed(2)} t empty)</dd>
      <dt>Δv</dt><dd class="${enough ? 'mb-ok' : 'mb-short'}">${Math.round(dv)} m/s</dd>
      <dt>Home needs</dt><dd>about ${DELTA_V_NEEDED} m/s</dd>
    </dl>
    <p class="mb-note">Δv = 4413 m/s × ln(full mass ÷ empty mass). Each tonne of propellant pushes less than the one before, because it has to carry the rest.</p>
    <div class="mb-actions">
      ${button('simulate', 'Simulate', isFlyable(rocket))}
      ${button('launch', 'Launch for real', isFlyable(rocket), 'class="mb-launch"')}
    </div>
    ${isFlyable(rocket) ? '' : '<p class="mb-note">Needs a capsule, an engine, a tank and some propellant.</p>'}`;
}

export function renderMenu(game, target) {
  if (target.kind === 'fabricator') return fabricatorMenu(game);
  const b = target.building;
  if (b.type === 'Air Generator') return airGeneratorMenu(game, b);
  if (b.type === 'Solar Panel') return solarMenu(game, b);
  if (b.type === 'Barrel') return barrelMenu(game, b);
  if (b.type === 'Launch Pad') return padMenu(game, b);
  return processMenu(game, b);
}

export function menuTitle(target) {
  return target.kind === 'fabricator' ? 'Lander workshop' : target.building.type;
}

export function handleMenuAction(game, target, element, launch) {
  const action = element.dataset.action;
  const b = target.building;
  const item = element.dataset.item;
  const actions = {
    'insert-battery': () => insertBattery(game, b),
    'take-battery': () => takeBattery(game, b),
    'fill-water': () => fillAirWater(game, b),
    'air-down': () => setAirLevel(game, b, -1),
    'air-up': () => setAirLevel(game, b, 1),
    load: () => loadHopper(game, b),
    collect: () => collectOutput(game, b),
    store: () => storeInBarrel(game, b, item),
    take: () => takeFromBarrel(game, b, item),
    craft: () => craft(game, RECIPES[Number(element.dataset.index)]),
    install: () => installPart(game, b, item),
    remove: () => removePart(game, b, item),
    fuel: () => fuelRocket(game, b),
    drain: () => drainRocket(game, b),
    simulate: () => launch(b.rocket, true),
    launch: () => launch(b.rocket, false),
  };
  actions[action]?.();
}

export function renderInventory(game) {
  const counts = game.inventory.counts;
  const rows = Object.entries(counts)
    .sort(([a], [b]) => (RESOURCES.includes(b) - RESOURCES.includes(a)) || a.localeCompare(b))
    .map(([name, n]) => `<li><span>${name}</span><b>${n}</b></li>`);
  for (const charge of game.inventory.batteries) rows.push(`<li><span>Battery</span><b>${Math.floor(charge)}%</b></li>`);
  return `<p class="mb-carry">Carrying ${carried(game)} / ${CARRY_LIMIT} resources</p><ul class="mb-inventory">${rows.join('') || '<li>Nothing</li>'}</ul>`;
}

const GOALS = [
  { text: 'Place the Air Generator (Place mode), then give it the battery and water', done: (m) => m.has('air') },
  { text: 'Walk east to the Icy crater and mine ice', done: (m) => m.has('Ice Chunk') },
  { text: 'Melt ice into water in the Water Generator', done: (m) => m.has('Water') },
  { text: 'Walk west to the Regolith Basin and mine regolith', done: (m) => m.has('Regolith') },
  { text: 'Build a Smelter at the lander and make metal', done: (m) => m.has('Metal') },
  { text: 'Build a second battery so one can charge while the other works', done: (m) => m.has('Battery') },
  { text: 'Build an Electrolyzer and make propellant', done: (m) => m.has('Propellant') },
  { text: 'Build a Launch Pad, a capsule, an engine and tanks', done: (m) => m.has('Launch Pad') && m.has('Capsule') && m.has('Engine') && m.has('Tank') },
  { text: 'Fuel up past 2,700 m/s, practise in the simulator, then launch', done: (m) => m.has('launched') },
];

export function renderGoals(game) {
  const firstOpen = GOALS.findIndex((goal) => !goal.done(game.milestones));
  return GOALS.map((goal, index) => {
    const state = goal.done(game.milestones) ? 'done' : index === firstOpen ? 'next' : 'later';
    return `<li class="mb-goal-${state}">${goal.text}</li>`;
  }).join('');
}
