import { solve } from './timetravel.js';

self.onmessage = ({ data }) => {
  const result = solve(data.world, {
    duration: data.duration,
    attempts: data.attempts,
    onProgress: (progress) => self.postMessage({ type: 'progress', ...progress }),
    onFound: (history) => self.postMessage({ type: 'found', history }),
  });
  self.postMessage({ type: 'done', ...result });
};
