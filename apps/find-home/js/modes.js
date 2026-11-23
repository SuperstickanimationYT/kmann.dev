import { SHIP } from './ship.js';

const EXPLORE_TOP_SPEED = 1e6;
const THRUSTER_SLOWEST_SPEED = 0.001;
const EXPLORE_SLOWEST_SPEED = 1e-16;

export const MODES = {
  mission: {
    scored: true,
    labels: false,
    goTo: false,
    longExposure: false,
    clockLabel: 'Mission clock',
    sunButton: 'Give up',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    slowestSpeed: THRUSTER_SLOWEST_SPEED,
    solarSystem: false,
    cockpit: true,
    instantWarp: false,
    dragSteersShip: false,
    greeting: () => null,
  },
  practice: {
    scored: false,
    labels: true,
    goTo: false,
    longExposure: false,
    clockLabel: 'Practice',
    sunButton: 'Face the Sun',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    slowestSpeed: THRUSTER_SLOWEST_SPEED,
    solarSystem: false,
    cockpit: true,
    instantWarp: false,
    dragSteersShip: false,
    greeting: (labelsOn) =>
      labelsOn ? 'Practice: labels on. Click any star to identify it.' : 'Practice: labels hidden. Click a star to check whether it is the Sun.',
  },
  explore: {
    scored: false,
    labels: true,
    goTo: true,
    longExposure: true,
    clockLabel: 'Explore',
    sunButton: 'Face the Sun',
    restartButton: 'Random start',
    topSpeed: EXPLORE_TOP_SPEED,
    slowestSpeed: EXPLORE_SLOWEST_SPEED,
    solarSystem: true,
    cockpit: false,
    instantWarp: true,
    dragSteersShip: true,
    greeting: () => 'Explore: no goal, no fuel limit. Thrusters go from 1 m/s to a million ly/s. Pick a place under Go to, planets included.',
  },
};

export const modeFromName = (name) => (name in MODES ? name : 'mission');
