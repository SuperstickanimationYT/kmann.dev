import { searchLine, searchPlane } from './ether-search.js';

self.addEventListener('message', ({ data: { key, dimensions, table } }) => {
  const ethers = dimensions === 1 ? searchLine(table) : searchPlane(table);
  self.postMessage({ key, ethers });
});
