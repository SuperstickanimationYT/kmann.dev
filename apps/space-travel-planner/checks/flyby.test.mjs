import { test } from 'node:test';
import assert from 'node:assert/strict';
import { poweredFlyby, turnAngle } from '../js/flyby.js';
import { flybyRoute } from '../js/transfer.js';
import { julianFromIsoDate } from '../js/time.js';
import { assertClose } from './assert-close.mjs';

const JUPITER_RADIUS = 71492;

test('equal speeds in and out need no burn when the planet can bend the path', () => {
  const mu = 126686531.9;
  const flyby = poweredFlyby([10, 0, 0], [0, 10, 0], mu, 75000);
  assertClose(flyby.deltaV, 0, 1e-9, 'delta-v');
  assertClose(turnAngle(flyby.periapsisRadius, 10, 10, mu), Math.PI / 2, 1e-9, 'turn');
});

test('a bend sharper than the planet allows costs a steering burn', () => {
  const flyby = poweredFlyby([10, 0, 0], [-10, 0.01, 0], 42828.37, 3696);
  assert.ok(flyby.missingTurn > 0);
  assert.ok(flyby.steeringBurn > 10);
});

const voyagers = [
  { name: 'Voyager 1', launch: '1977-09-05', jupiter: '1979-03-05', saturn: '1980-11-12', closestKm: 348890 },
  { name: 'Voyager 2', launch: '1977-08-20', jupiter: '1979-07-09', saturn: '1981-08-25', closestKm: 721670 },
];

for (const voyager of voyagers) {
  test(`${voyager.name}'s Jupiter flyby needs almost no burn and passes within 10% of its real closest approach`, () => {
    const route = flybyRoute('earth', 'jupiter', 'saturn', julianFromIsoDate(voyager.launch), julianFromIsoDate(voyager.jupiter), julianFromIsoDate(voyager.saturn));
    assert.ok(route.flyby.deltaV < 0.1, `burn ${route.flyby.deltaV}`);
    const gap = Math.abs(route.flyby.periapsisRadius - voyager.closestKm) / voyager.closestKm;
    assert.ok(gap < 0.1, `periapsis ${(route.flyby.periapsisRadius / JUPITER_RADIUS).toFixed(2)} Jupiter radii`);
  });
}
