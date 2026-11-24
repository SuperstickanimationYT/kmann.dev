const SECONDS_PER_DAY = 86400;
const SECONDS_PER_YEAR = 365.25 * SECONDS_PER_DAY;
export const EARLIEST_MS = Date.UTC(1800, 0, 1);
export const LATEST_MS = Date.UTC(2050, 0, 1);

const RATES = [
  [SECONDS_PER_YEAR, '1 year'],
  [SECONDS_PER_YEAR / 12, '1 month'],
  [7 * SECONDS_PER_DAY, '1 week'],
  [SECONDS_PER_DAY, '1 day'],
  [3600, '1 hour'],
  [60, '1 minute'],
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

export function backToNow() {
  reanchor(Date.now());
  step = REAL_TIME_STEP;
}

export function describeRate() {
  const [value, label] = LADDER[step];
  const backward = value < 0 ? ', backward' : '';
  if (Math.abs(value) <= 1) return `${label}${backward}`;
  return `${label} per second${backward}`;
}
