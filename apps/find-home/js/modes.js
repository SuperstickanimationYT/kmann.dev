import { SHIP } from './ship.js';

const EXPLORE_TOP_SPEED = 1e6;
const THRUSTER_SLOWEST_SPEED = 0.001;
const EXPLORE_SLOWEST_SPEED = 1e-16;

export const MODES = {
  mission: {
    scored: true,
    labels: false,
    selecting: false,
    longExposure: false,
    clockLabel: 'Mission clock',
    sunButton: 'Give up',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    slowestSpeed: THRUSTER_SLOWEST_SPEED,
    solarSystem: false,
    cockpit: true,
    glideWarp: false,
    dragSteersShip: false,
    picking: false,
    greeting: () => null,
  },
  practice: {
    scored: false,
    labels: true,
    selecting: false,
    longExposure: false,
    clockLabel: 'Practice',
    sunButton: 'Face the Sun',
    restartButton: 'New mission',
    topSpeed: SHIP.thrusterTopSpeed,
    slowestSpeed: THRUSTER_SLOWEST_SPEED,
    solarSystem: false,
    cockpit: true,
    glideWarp: false,
    dragSteersShip: false,
    picking: false,
    greeting: (labelsOn) =>
      labelsOn ? 'Practice: labels on. Click any star to identify it.' : 'Practice: labels hidden. Click a star to check whether it is the Sun.',
  },
  explore: {
    scored: false,
    labels: false,
    selecting: true,
    longExposure: true,
    clockLabel: 'Explore',
    sunButton: 'Face the Sun',
    restartButton: 'Random start',
    topSpeed: EXPLORE_TOP_SPEED,
    slowestSpeed: EXPLORE_SLOWEST_SPEED,
    solarSystem: true,
    cockpit: false,
    glideWarp: true,
    dragSteersShip: true,
    picking: true,
    greeting: () => 'Explore: no goal, no fuel limit. Thrusters go from 1 m/s to a million ly/s. Click anything in view, or type a name under Select, then press Warp to fly there.',
  },
};

export const modeFromName = (name) => (name in MODES ? name : 'mission');
