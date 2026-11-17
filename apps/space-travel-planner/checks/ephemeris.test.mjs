import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AU_KM, DAY_SECONDS, planetState, usesPreciseTable } from '../js/ephemeris.js';
import { norm, sub, unit, dot } from '../js/vector.js';
import horizons from './horizons-vectors.mjs';

const ARCSEC = Math.PI / 180 / 3600;

const PUBLISHED_ERROR = {
  precise: {
    mercury: { longitude: 15, latitude: 1, distance: 1e3 },
    venus: { longitude: 20, latitude: 1, distance: 4e3 },
    earth: { longitude: 20, latitude: 8, distance: 6e3 },
    mars: { longitude: 40, latitude: 2, distance: 25e3 },
    jupiter: { longitude: 400, latitude: 10, distance: 600e3 },
    saturn: { longitude: 600, latitude: 25, distance: 1500e3 },
    uranus: { longitude: 50, latitude: 2, distance: 1000e3 },
    neptune: { longitude: 10, latitude: 1, distance: 200e3 },
  },
  longRange: {
    mercury: { longitude: 20, latitude: 15, distance: 1e3 },
    venus: { longitude: 40, latitude: 30, distance: 8e3 },
    earth: { longitude: 40, latitude: 15, distance: 15e3 },
    mars: { longitude: 100, latitude: 40, distance: 30e3 },
    jupiter: { longitude: 600, latitude: 100, distance: 1000e3 },
    saturn: { longitude: 1000, latitude: 100, distance: 4000e3 },
    uranus: { longitude: 2000, latitude: 30, distance: 8000e3 },
    neptune: { longitude: 400, latitude: 15, distance: 4000e3 },
  },
};
const SLACK = 3;
const SUN_WOBBLE_AROUND_BARYCENTER_KM = 0.01 * AU_KM;

const longitude = ([x, y]) => Math.atan2(y, x);
const latitude = (r) => Math.asin(r[2] / norm(r));
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

for (const row of horizons.rows) {
  test(`${row.planet} at JD ${row.julianDate} is within ${SLACK}x JPL's published error or the Sun's wobble`, () => {
    const expected = row.positionAu.map((au) => au * AU_KM);
    const { r, v } = planetState(row.planet, row.julianDate);
    const allowed = PUBLISHED_ERROR[usesPreciseTable(row.julianDate) ? 'precise' : 'longRange'][row.planet];

    const longitudeArcsec = angleGap(longitude(r), longitude(expected)) / ARCSEC;
    const latitudeArcsec = angleGap(latitude(r), latitude(expected)) / ARCSEC;
    const distanceKm = Math.abs(norm(r) - norm(expected));
    const wobbleArcsec = SUN_WOBBLE_AROUND_BARYCENTER_KM / norm(expected) / ARCSEC;
    assert.ok(longitudeArcsec <= Math.max(allowed.longitude * SLACK, wobbleArcsec), `longitude off ${longitudeArcsec.toFixed(1)}"`);
    assert.ok(latitudeArcsec <= allowed.latitude * SLACK, `latitude off ${latitudeArcsec.toFixed(1)}"`);
    assert.ok(distanceKm <= allowed.distance * SLACK, `distance off ${distanceKm.toFixed(0)} km`);

    const expectedVelocity = row.velocityAuPerDay.map((value) => (value * AU_KM) / DAY_SECONDS);
    const velocityGap = norm(sub(v, expectedVelocity)) / norm(expectedVelocity);
    assert.ok(velocityGap < 0.01, `velocity off ${(velocityGap * 100).toFixed(2)}%`);
    assert.ok(dot(unit(v), unit(expectedVelocity)) > Math.cos(0.5 * Math.PI / 180), 'velocity direction off by over 0.5 deg');
  });
}
