import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAUNCHERS, bestC3For, payloadAt } from '../js/launchers.js';
import { captureIntoOrbit, deltaVFromPropellant, escapeFromCircularOrbit, propellantForDeltaV } from '../js/burns.js';
import { dailyLossFraction, massAfterCruise, oxygenOverHydrogenLoss } from '../js/boiloff.js';
import { buildStage, simulateMission, stackDeltaV, usablePropellant } from '../js/mission.js';
import { directTransfer } from '../js/transfer.js';
import { julianFromIsoDate } from '../js/time.js';
import { assertClose } from './assert-close.mjs';

test('launcher curves interpolate and invert', () => {
  const heavy = LAUNCHERS.falconHeavyExpendable;
  assert.equal(payloadAt(heavy, 10), 12345);
  assertClose(payloadAt(heavy, 11.25), (12345 + 11765) / 2, 1e-9, 'midpoint');
  assert.equal(payloadAt(heavy, 101), 0);
  assertClose(bestC3For(heavy, payloadAt(heavy, 33)), 33, 1e-9, 'inverse');
  assert.equal(bestC3For(heavy, 20000), null);
  assert.equal(bestC3For(heavy, 100), 100);
});

test('leaving a 185 km Earth orbit at C3 0 takes about 3.2 km/s', () => {
  assertClose(escapeFromCircularOrbit(0, 398600.44, 6378.137 + 185), 3.22, 0.01, 'escape');
});

test('capture from a parabolic approach into a circular orbit matches vis-viva', () => {
  const mu = 42828.37;
  const radius = 3696;
  assertClose(captureIntoOrbit(0, mu, radius, radius), Math.sqrt((2 * mu) / radius) - Math.sqrt(mu / radius), 1e-12, 'capture');
});

test('rocket equation round-trips', () => {
  const used = propellantForDeltaV(5000, 2.5, 316);
  assertClose(deltaVFromPropellant(5000, used, 316), 2.5, 1e-12, 'delta-v');
});

test('hydrogen boils off faster than oxygen, and storables not at all', () => {
  assert.ok(oxygenOverHydrogenLoss(1000, 1000) < 0.5);
  assert.ok(dailyLossFraction('hydrogen', 1000, 'sunshade', 1) > dailyLossFraction('oxygen', 1000, 'sunshade', 1));
  assert.equal(dailyLossFraction('mmh', 1000, 'upperStage', 1), 0);
  assert.ok(dailyLossFraction('hydrogen', 1000, 'sunshade', 30) < dailyLossFraction('hydrogen', 1000, 'sunshade', 1) / 3);
});

test('a Centaur-size hydrolox load on upper-stage foam loses about 2% of its propellant per day', () => {
  const hydrogen = 20830 / 6.5;
  const oxygen = 20830 - hydrogen;
  const lost = hydrogen - massAfterCruise('hydrogen', hydrogen, 'upperStage', [1], 1) + oxygen - massAfterCruise('oxygen', oxygen, 'upperStage', [1], 1);
  assertClose(lost / 20830, 0.02, 0.0005, 'daily share');
});

test('once hydrogen runs short, leftover oxygen is dead weight', () => {
  const stage = buildStage({ kind: 'liquid', engine: 'rl10c1', engines: 1, propellant: 6500, insulation: 'sunshade' }, 0);
  stage.fuel /= 2;
  assertClose(usablePropellant(stage), 3250, 1e-9, 'usable');
});

const mars2028 = () => directTransfer('earth', 'mars', julianFromIsoDate('2028-11-29'), julianFromIsoDate('2029-10-08'));

test('a Mars orbiter on Vulcan VC2 with a storable stage arrives with fuel to spare', () => {
  const mission = simulateMission({
    transfer: mars2028(),
    launcher: 'vulcanVc2',
    payload: 1000,
    stages: [{ kind: 'liquid', engine: 'aj10', engines: 1, propellant: 900 }],
    goal: 'orbit',
    periapsisAltitude: 300,
    apoapsisAltitude: 67900,
  });
  assert.ok(mission.ok, JSON.stringify(mission.failure));
  const insertion = mission.events.find((event) => event.label === 'Orbit insertion');
  assert.ok(insertion.deltaV > 0.7 && insertion.deltaV < 1.3, `insertion ${insertion.deltaV}`);
  assert.ok(mission.spareDeltaV > 0);
});

test('a stack heavier than the launcher can lift fails at launch', () => {
  const mission = simulateMission({ transfer: mars2028(), launcher: 'falcon9Rtls', payload: 3000, stages: [], goal: 'flyby', periapsisAltitude: 300, apoapsisAltitude: 300 });
  assert.equal(mission.failure.kind, 'tooHeavy');
});

test('a direct Neptune orbiter falls short and says by how much', () => {
  const transfer = directTransfer('earth', 'neptune', julianFromIsoDate('2031-07-10'), julianFromIsoDate('2031-07-10') + 30 * 365.25);
  const mission = simulateMission({
    transfer,
    launcher: 'falconHeavyExpendable',
    payload: 1500,
    stages: [{ kind: 'solid', motor: 'star48bv' }, { kind: 'liquid', engine: 'aj10', engines: 1, propellant: 1000 }],
    goal: 'orbit',
    periapsisAltitude: 1238,
    apoapsisAltitude: 495000,
  });
  assert.equal(mission.ok, false);
  assert.ok(mission.failure.missing > 0);
});

test('hydrogen stages lose propellant on a long cruise, storables keep theirs', () => {
  const transfer = directTransfer('earth', 'jupiter', julianFromIsoDate('2030-01-01'), julianFromIsoDate('2032-09-01'));
  const mission = simulateMission({
    transfer,
    launcher: 'falconHeavyExpendable',
    payload: 1000,
    stages: [
      { kind: 'liquid', engine: 'rl10c1', engines: 1, propellant: 3000, insulation: 'sunshade' },
      { kind: 'liquid', engine: 'aj10', engines: 1, propellant: 1000 },
    ],
    goal: 'flyby',
    periapsisAltitude: 3575,
    apoapsisAltitude: 3575,
  });
  const cruise = mission.events.find((event) => event.kind === 'cruise');
  assert.ok(cruise.losses.some((loss) => loss.component === 'hydrogen' && loss.lost > 0));
  assert.ok(cruise.losses.every((loss) => loss.component !== 'mmh'));
});

test('stack delta-v adds stage by stage', () => {
  const stages = [buildStage({ kind: 'solid', motor: 'star48bv' }, 0)];
  const expected = deltaVFromPropellant(500 + stages[0].inert + stages[0].solid, stages[0].solid, stages[0].isp);
  assertClose(stackDeltaV(500, stages), expected, 1e-12, 'delta-v');
});
