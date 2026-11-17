import assert from 'node:assert/strict';

export function assertClose(actual, expected, tolerance, label = '') {
  const actualList = [actual].flat();
  const expectedList = [expected].flat();
  actualList.forEach((value, index) => {
    const gap = Math.abs(value - expectedList[index]);
    assert.ok(gap <= tolerance, `${label}[${index}]: ${value} vs ${expectedList[index]} (off by ${gap}, allowed ${tolerance})`);
  });
}
