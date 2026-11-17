import { test } from 'node:test';
import { elementsToState, propagate, stateToElements } from '../js/kepler.js';
import { dot, norm } from '../js/vector.js';
import { assertClose } from './assert-close.mjs';

const EARTH_MU = 398600;
const DEG = Math.PI / 180;

test('state to elements matches Curtis example 4.3', () => {
  const elements = stateToElements([-6045, -3490, 2500], [-3.457, 6.618, 2.533], EARTH_MU);
  assertClose(elements.h, 58310, 5, 'h');
  assertClose(elements.e, 0.1712, 1e-4, 'e');
  assertClose(elements.i / DEG, 153.2, 0.05, 'i');
  assertClose(elements.raan / DEG, 255.3, 0.05, 'raan');
  assertClose(elements.argPeriapsis / DEG, 20.07, 0.05, 'argPeriapsis');
  assertClose(elements.trueAnomaly / DEG, 28.45, 0.05, 'trueAnomaly');
});

test('elements round-trip back to the same state', () => {
  const cases = [
    { r: [-6045, -3490, 2500], v: [-3.457, 6.618, 2.533] },
    { r: [7000, 0, 0], v: [0, 9, 4] },
    { r: [7000, 1000, -300], v: [1, 12, 0.5] },
  ];
  for (const { r, v } of cases) {
    const back = elementsToState(stateToElements(r, v, EARTH_MU), EARTH_MU);
    assertClose(back.r, r, 1e-6, 'r');
    assertClose(back.v, v, 1e-9, 'v');
  }
});

test('propagation matches Curtis example 3.7', () => {
  const { r, v } = propagate([7000, -12124, 0], [2.6679, 4.621, 0], 3600, EARTH_MU);
  assertClose(r, [-3297.8, 7413.4, 0], 1, 'r');
  assertClose(v, [-8.2977, -0.96309, 0], 1e-3, 'v');
});

test('propagation forward then back returns to start, conserving energy', () => {
  const cases = [
    { r: [7000, 0, 0], v: [0, 8.5, 1], dt: 20000 },
    { r: [7000, 500, 200], v: [0.3, 12, 1.5], dt: 50000 },
    { r: [-6045, -3490, 2500], v: [-3.457, 6.618, 2.533], dt: -7000 },
  ];
  const energy = (r, v) => dot(v, v) / 2 - EARTH_MU / norm(r);
  for (const { r, v, dt } of cases) {
    const there = propagate(r, v, dt, EARTH_MU);
    assertClose(energy(there.r, there.v), energy(r, v), 1e-9, 'energy');
    const back = propagate(there.r, there.v, -dt, EARTH_MU);
    assertClose(back.r, r, 1e-5, 'r');
    assertClose(back.v, v, 1e-9, 'v');
  }
});
