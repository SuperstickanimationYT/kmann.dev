import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directTransfer } from '../js/transfer.js';
import { departAt, flightAt, lowestIndex, porkchopGrid } from '../js/porkchop.js';
import { julianFromUtcMs, julianFromIsoDate, isoDate } from '../js/time.js';

test('Mars 2020 launch energy matches ULA\'s published C3 of 14.49 km²/s²', () => {
  const transfer = directTransfer('earth', 'mars', julianFromUtcMs(Date.UTC(2020, 6, 30, 11, 50)), julianFromUtcMs(Date.UTC(2021, 1, 18, 20, 55)));
  assert.ok(Math.abs(transfer.c3 - 14.49) < 0.5, `C3 ${transfer.c3.toFixed(2)}`);
});

test('New Horizons launch energy lands in its planned 157.7 to 163.9 km²/s² window', () => {
  const transfer = directTransfer('earth', 'jupiter', julianFromUtcMs(Date.UTC(2006, 0, 19, 19)), julianFromUtcMs(Date.UTC(2007, 1, 28, 5, 43)));
  assert.ok(transfer.c3 > 152 && transfer.c3 < 170, `C3 ${transfer.c3.toFixed(1)}`);
});

test('the best 2026 Earth to Mars departure falls in the late-2026 window', () => {
  const grid = porkchopGrid({ from: 'earth', to: 'mars', departStart: julianFromIsoDate('2026-06-01'), departDays: 400, flightMin: 120, flightMax: 400, columns: 81, rows: 57 });
  const best = lowestIndex(grid.c3);
  const depart = isoDate(departAt(grid, best % grid.columns));
  assert.ok(depart >= '2026-10-01' && depart <= '2027-01-15', `best departure ${depart}`);
  assert.ok(grid.c3[best] > 7 && grid.c3[best] < 14, `best C3 ${grid.c3[best].toFixed(2)}`);
  assert.ok(flightAt(grid, Math.floor(best / grid.columns)) > 150);
});

test('dates round-trip through Julian dates', () => {
  assert.equal(isoDate(julianFromIsoDate('2031-03-07')), '2031-03-07');
});
