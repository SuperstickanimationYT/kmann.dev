import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../js/presets.js';
import { DIRECT_GRID, FLYBY_GRID, departAt, flightAt, lowestIndex, porkchopGrid } from '../js/porkchop.js';
import { routeOrNull } from '../js/transfer.js';
import { simulateMission } from '../js/mission.js';
import { julianFromIsoDate } from '../js/time.js';

const CLEAR_MARGIN_KM_S = 0.2;

function runPreset(preset) {
  const { from, to, via } = preset.trajectory;
  const { windowStart, windowYears, flightMin, flightMax, metric } = preset.search;
  const spec = { from, to, via: via || null, departStart: julianFromIsoDate(windowStart), departDays: windowYears * 365.25, flightMin, flightMax, ...(via ? FLYBY_GRID : DIRECT_GRID) };
  const grid = porkchopGrid(spec);
  const best = lowestIndex(grid[metric]);
  const flybyJd = Number.isFinite(grid.flybyJd[best]) ? grid.flybyJd[best] : null;
  const transfer = routeOrNull({ ...spec, departJd: departAt(grid, best % grid.columns), flightDays: flightAt(grid, Math.floor(best / grid.columns)), flybyJd });
  return { transfer, mission: simulateMission({ transfer, ...preset.rocket }) };
}

for (const [key, preset] of Object.entries(PRESETS)) {
  test(`${preset.name}: the cheapest launch ${preset.expect} by a clear margin`, () => {
    const { mission } = runPreset(preset);
    const margin = mission.ok ? mission.spareDeltaV : mission.failure.missing ?? Infinity;
    assert.ok(margin > CLEAR_MARGIN_KM_S, `${key}: margin ${margin}`);
    assert.equal(mission.ok, preset.expect === 'works', `${key}: ${JSON.stringify(mission.failure)}`);
  });
}

test('the hydrogen Jupiter orbiter fails because its hydrogen boils off', () => {
  const { mission } = runPreset(PRESETS.jupiterHydrogen);
  const cruise = mission.events.find((event) => event.kind === 'cruise');
  const hydrogen = cruise.losses.find((loss) => loss.component === 'hydrogen');
  assert.ok(hydrogen.lost / hydrogen.before > 0.9, `lost ${hydrogen.lost} of ${hydrogen.before}`);
});
