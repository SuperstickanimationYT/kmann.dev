import { DX, DY, NX, NY, wrapColumn } from './grid.js';

const DEEPEST_FIRST_SCAN = 4;
const SHALLOWEST_LOW = -12;
const WEAKEST_DEPRESSION = 12;
const WIND_REACH_CELLS = 7;
const MATCH_KM = 350;
const FORGET_AFTER_SECONDS = 12 * 3600;
const KEEP_GONE_TRACKS = 40;

export const CATEGORIES = [
  { label: 'Tropical depression', short: 'TD', from: 0, colour: '#5ebaff' },
  { label: 'Tropical storm', short: 'TS', from: 17.5, colour: '#00faf4' },
  { label: 'Category 1 hurricane', short: 'Cat 1', from: 33, colour: '#ffffcc' },
  { label: 'Category 2 hurricane', short: 'Cat 2', from: 43, colour: '#ffe775' },
  { label: 'Category 3 hurricane', short: 'Cat 3', from: 50, colour: '#ffc140' },
  { label: 'Category 4 hurricane', short: 'Cat 4', from: 58, colour: '#ff8f20' },
  { label: 'Category 5 hurricane', short: 'Cat 5', from: 70, colour: '#ff6060' },
];

const NAMES = ['Ada', 'Bruno', 'Clara', 'Dmitri', 'Elena', 'Felix', 'Greta', 'Hugo', 'Iris', 'Jonas', 'Kira', 'Leo', 'Mila', 'Nico', 'Olga', 'Pablo', 'Rosa', 'Sami', 'Tara', 'Victor', 'Wren'];

export const categoryOf = (wind) => CATEGORIES.findLast((category) => wind >= category.from);

function findLows(model) {
  const lows = [];
  for (let j = DEEPEST_FIRST_SCAN; j < NY - DEEPEST_FIRST_SCAN; j++) {
    for (let i = 0; i < NX; i++) {
      const cell = j * NX + i;
      const anomaly = model.anomalyAt(cell, j);
      if (anomaly > SHALLOWEST_LOW) continue;
      let deepest = true;
      for (let dj = -DEEPEST_FIRST_SCAN; dj <= DEEPEST_FIRST_SCAN && deepest; dj++) {
        for (let di = -DEEPEST_FIRST_SCAN; di <= DEEPEST_FIRST_SCAN; di++) {
          if (!di && !dj) continue;
          const other = (j + dj) * NX + wrapColumn(i + di);
          if (model.anomalyAt(other, j + dj) < anomaly) {
            deepest = false;
            break;
          }
        }
      }
      if (deepest) lows.push({ i, j, cell, anomaly });
    }
  }
  return lows;
}

function spinAround(model, { i, j }) {
  const { u, v } = model;
  const reach = 2;
  const eastOfCentre = 0.5 * (v[j * NX + wrapColumn(i + reach)] + v[(j + 1) * NX + wrapColumn(i + reach)]);
  const westOfCentre = 0.5 * (v[j * NX + wrapColumn(i - reach)] + v[(j + 1) * NX + wrapColumn(i - reach)]);
  const northOfCentre = 0.5 * (u[(j + reach) * NX + i] + u[(j + reach) * NX + wrapColumn(i + 1)]);
  const southOfCentre = 0.5 * (u[(j - reach) * NX + i] + u[(j - reach) * NX + wrapColumn(i + 1)]);
  return (eastOfCentre - westOfCentre) / (2 * reach * DX) - (northOfCentre - southOfCentre) / (2 * reach * DY);
}

function strongestWindNear(model, { i, j }) {
  let strongest = 0;
  for (let dj = -WIND_REACH_CELLS; dj <= WIND_REACH_CELLS; dj++) {
    const row = j + dj;
    if (row < 0 || row >= NY) continue;
    for (let di = -WIND_REACH_CELLS; di <= WIND_REACH_CELLS; di++) {
      if (di * di + dj * dj > WIND_REACH_CELLS * WIND_REACH_CELLS) continue;
      strongest = Math.max(strongest, model.speed[row * NX + wrapColumn(i + di)]);
    }
  }
  return strongest;
}

const distanceKm = (a, b) => {
  const across = Math.abs(a.i - b.i);
  return Math.hypot(Math.min(across, NX - across) * DX, (a.j - b.j) * DY) / 1000;
};

export function createTracker() {
  let storms = [];
  let named = 0;
  let lastUpdate = null;

  function update(model, seconds) {
    lastUpdate = seconds;
    model.measureWind();
    const sightings = findLows(model)
      .filter((low) => spinAround(model, low) > 0)
      .map((low) => ({ ...low, wind: strongestWindNear(model, low), pressure: model.pressureAt(low.cell) }))
      .filter((low) => low.wind >= WEAKEST_DEPRESSION)
      .sort((a, b) => a.anomaly - b.anomaly);
    const unclaimed = new Set(storms.filter((storm) => storm.active));
    for (const sighting of sightings) {
      const nearest = [...unclaimed].sort((a, b) => distanceKm(a, sighting) - distanceKm(b, sighting))[0];
      const storm = nearest && distanceKm(nearest, sighting) < MATCH_KM ? nearest : null;
      if (storm) unclaimed.delete(storm);
      const tracked = storm ?? { id: storms.length, name: null, track: [], peakWind: 0, lowestPressure: Infinity, active: true, born: seconds };
      if (!storm) storms.push(tracked);
      const step = { i: sighting.i, j: sighting.j, wind: sighting.wind, seconds };
      const previous = tracked.track.at(-1);
      Object.assign(tracked, { i: sighting.i, j: sighting.j, wind: sighting.wind, pressure: sighting.pressure, seen: seconds, category: categoryOf(sighting.wind) });
      tracked.motion = previous ? { di: sighting.i - previous.i, dj: sighting.j - previous.j, seconds: seconds - previous.seconds } : null;
      tracked.track.push(step);
      tracked.peakWind = Math.max(tracked.peakWind, sighting.wind);
      tracked.lowestPressure = Math.min(tracked.lowestPressure, sighting.pressure);
      if (!tracked.name && sighting.wind >= CATEGORIES[1].from) tracked.name = NAMES[named++ % NAMES.length];
    }
    for (const storm of unclaimed) if (seconds - storm.seen > FORGET_AFTER_SECONDS) storm.active = false;
    const gone = storms.filter((storm) => !storm.active);
    if (gone.length > KEEP_GONE_TRACKS) storms = storms.filter((storm) => storm.active || gone.indexOf(storm) >= gone.length - KEEP_GONE_TRACKS);
  }

  return {
    update,
    get storms() {
      return storms;
    },
    showing: () => storms.filter((storm) => storm.active && storm.seen === lastUpdate),
    clear() {
      storms = [];
      named = 0;
    },
    clearGone() {
      storms = storms.filter((storm) => storm.active);
    },
  };
}
