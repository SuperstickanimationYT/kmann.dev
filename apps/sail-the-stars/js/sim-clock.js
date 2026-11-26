const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
export const EARLIEST_MS = Date.UTC(1800, 0, 1);
export const LATEST_MS = Date.UTC(9999, 0, 1);

const RATES = [
  [100 * SECONDS_PER_YEAR, '100 years'],
  [10 * SECONDS_PER_YEAR, '10 years'],
  [SECONDS_PER_YEAR, '1 year'],
  [SECONDS_PER_YEAR / 4, '3 months'],
  [SECONDS_PER_YEAR / 12, '1 month'],
  [7 * SECONDS_PER_DAY, '1 week'],
  [3 * SECONDS_PER_DAY, '3 days'],
  [SECONDS_PER_DAY, '1 day'],
  [5 * 3600, '5 hours'],
  [3600, '1 hour'],
  [15 * 60, '15 minutes'],
  [5 * 60, '5 minutes'],
  [60, '1 minute'],
  [15, '15 seconds'],
  [5, '5 seconds'],
  [1, 'real time'],
];
const LADDER = [...RATES.map(([rate, label]) => [-rate, label]), [0, 'paused'], ...[...RATES].reverse()];
const REAL_TIME_STEP = LADDER.findIndex(([rate]) => rate === 1);
const PAUSED_STEP = LADDER.findIndex(([rate]) => rate === 0);

let anchorRealMs = Date.now();
let anchorSimMs = anchorRealMs;
let step = REAL_TIME_STEP;
let stepBeforePause = REAL_TIME_STEP;

const rate = () => LADDER[step][0];
const unclamped = () => anchorSimMs + (Date.now() - anchorRealMs) * rate();

function reanchor(simMs) {
  anchorSimMs = Math.min(LATEST_MS, Math.max(EARLIEST_MS, simMs));
  anchorRealMs = Date.now();
}

function setStep(next) {
  reanchor(unclamped());
  step = Math.max(0, Math.min(LADDER.length - 1, next));
}

export const simNow = () => Math.min(LATEST_MS, Math.max(EARLIEST_MS, unclamped()));

export function hitTimeLimit() {
  const now = unclamped();
  if (rate() === 0 || (now > EARLIEST_MS && now < LATEST_MS)) return false;
  setStep(PAUSED_STEP);
  return true;
}

export function capRate(fastest) {
  if (rate() >= 0 && rate() <= fastest) return false;
  setStep(rate() < 0 ? REAL_TIME_STEP : LADDER.findIndex(([value]) => value === fastest));
  return true;
}

export function capRateWithin(simSeconds, realSeconds, slowest) {
  const fitting = RATES.find(([value]) => value <= Math.max(slowest, simSeconds / realSeconds));
  return capRate(fitting ? fitting[0] : slowest);
}

export const slower = () => setStep(step - 1);
export const faster = () => setStep(step + 1);
export const paused = () => rate() === 0;

export function togglePause() {
  if (paused()) {
    setStep(stepBeforePause === PAUSED_STEP ? REAL_TIME_STEP : stepBeforePause);
    return;
  }
  stepBeforePause = step;
  setStep(PAUSED_STEP);
}

export function jumpTo(simMs) {
  reanchor(simMs);
}

export function playFrom(simMs) {
  reanchor(simMs);
  step = REAL_TIME_STEP;
}

export function backToNow() {
  playFrom(Date.now());
}

export function describeRate() {
  const [value, label] = LADDER[step];
  const backward = value < 0 ? ', backward' : '';
  if (Math.abs(value) <= 1) return `${label}${backward}`;
  return `${label} per second${backward}`;
}
