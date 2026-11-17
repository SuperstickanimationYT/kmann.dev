import { test } from 'node:test';
import { propagate } from '../js/kepler.js';
import { lambert } from '../js/lambert.js';
import { assertClose } from './assert-close.mjs';

const EARTH_MU = 398600;

test('matches Curtis example 5.2', () => {
  const { v1, v2 } = lambert([5000, 10000, 2100], [-14600, 2500, 7000], 3600, EARTH_MU);
  assertClose(v1, [-5.9925, 1.9254, 3.2456], 1e-3, 'v1');
  assertClose(v2, [-3.3125, -4.1966, -0.38529], 1e-3, 'v2');
});

test('flying the solved velocity lands on the target', () => {
  const cases = [
    { r1: [7000, 0, 0], r2: [0, 9000, 1500], tof: 2400 },
    { r1: [7000, 0, 0], r2: [0, 9000, 1500], tof: 300 },
    { r1: [7000, 0, 0], r2: [0, 9000, 1500], tof: 30000 },
    { r1: [7000, 0, 0], r2: [-8000, -2000, 3000], tof: 5000 },
    { r1: [7000, 0, 0], r2: [-8000, -2000, 3000], tof: 5000, prograde: false },
    { r1: [42000, 0, 0], r2: [-7000, 100, 0], tof: 19000 },
    { r1: [5000, 10000, 2100], r2: [-14600, 2500, 7000], tof: 3600, prograde: false },
  ];
  for (const { r1, r2, tof, prograde = true } of cases) {
    const { v1, v2 } = lambert(r1, r2, tof, EARTH_MU, { prograde });
    const arrival = propagate(r1, v1, tof, EARTH_MU);
    assertClose(arrival.r, r2, 1e-4, `r2 for ${JSON.stringify({ r2, tof, prograde })}`);
    assertClose(arrival.v, v2, 1e-8, 'v2');
  }
});
