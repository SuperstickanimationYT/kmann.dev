import { SHIP } from './ship.js';

const EXPLORE_TOP_SPEED = 1e6;

export const MODES = {
  mission: {
    scored: true,
    labels: false,
    goTo: false,
    clockLabel: 'Mission clock',
    sunButton: 'Give up',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    greeting: () => null,
  },
  practice: {
    scored: false,
    labels: true,
    goTo: false,
    clockLabel: 'Practice',
    sunButton: 'Face the Sun',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    greeting: (labelsOn) =>
      labelsOn ? 'Practice: labels on. Click any star to identify it.' : 'Practice: labels hidden. Click a star to check whether it is the Sun.',
  },
  explore: {
    scored: false,
    labels: true,
    goTo: true,
    clockLabel: 'Explore',
    sunButton: 'Face the Sun',
    restartButton: 'Random start',
    topSpeed: EXPLORE_TOP_SPEED,
    greeting: () => 'Explore: no goal, no fuel limit. Thrusters reach a million ly/s. Pick a place under Go to.',
  },
};

export const modeFromName = (name) => (name in MODES ? name : 'mission');
