import { TICKS_PER_SECOND } from './world.js';

const TRAVEL = 36;
const TRAVEL_TICKS = 12;
const PRIMING_TICKS = TICKS_PER_SECOND;
const FADE_TICKS = 20;
const PUMP_WAIT_SECONDS = { min: 5, max: 15 };

export const DRILL_OFFSET_SIDEWAYS = -40;

export function createDrill() {
  return { phase: 'idle', timer: 0, extension: 0, opacity: 1 };
}

export function drillActive(drill) {
  return drill.phase !== 'idle';
}

export function drillAwaitingClick(drill) {
  return drill.phase === 'deployed';
}

export function drillBusy(drill) {
  return ['deployed', 'extending', 'priming', 'pumping'].includes(drill.phase);
}

export function deployDrill(drill, play) {
  if (drillActive(drill)) return;
  Object.assign(drill, { phase: 'deployed', timer: 0, extension: 0, opacity: 1 });
  play('machine');
}

export function startDrilling(drill, play) {
  if (!drillAwaitingClick(drill)) return;
  Object.assign(drill, { phase: 'extending', timer: 0 });
  play('buzzWhir');
}

export function stopDrill(drill, play) {
  if (!drillBusy(drill)) return;
  if (drill.phase === 'deployed') {
    Object.assign(drill, { phase: 'fading', timer: 0 });
    return;
  }
  Object.assign(drill, { phase: 'retracting', timer: 0 });
  play('buzzWhir');
}

function pumpWait() {
  const { min, max } = PUMP_WAIT_SECONDS;
  return (min + Math.random() * (max - min)) * TICKS_PER_SECOND;
}

function pump(drill, rocket, play) {
  play('blender');
  rocket.fuel = Math.min(rocket.fuelCapacity, Math.floor(rocket.fuel) + 1);
  drill.timer = pumpWait();
}

// Animation runs on wall-clock ticks; the pumping wait runs on simulated ticks so time warp speeds it up.
export function updateDrill(drill, rocket, wallTicks, simTicks, play) {
  switch (drill.phase) {
    case 'extending':
      drill.timer += wallTicks;
      drill.extension = Math.min(1, drill.timer / TRAVEL_TICKS) * TRAVEL;
      if (drill.timer >= TRAVEL_TICKS) Object.assign(drill, { phase: 'priming', timer: 0 });
      break;
    case 'priming':
      drill.timer += wallTicks;
      if (drill.timer >= PRIMING_TICKS) {
        drill.phase = 'pumping';
        pump(drill, rocket, play);
      }
      break;
    case 'pumping':
      if (rocket.fuel >= rocket.fuelCapacity) {
        stopDrill(drill, play);
        break;
      }
      drill.timer -= simTicks;
      if (drill.timer <= 0) pump(drill, rocket, play);
      break;
    case 'retracting':
      drill.timer += wallTicks;
      drill.extension = Math.max(0, 1 - drill.timer / TRAVEL_TICKS) * TRAVEL;
      if (drill.timer >= TRAVEL_TICKS) Object.assign(drill, { phase: 'fading', timer: 0 });
      break;
    case 'fading':
      drill.timer += wallTicks;
      drill.opacity = Math.max(0, 1 - drill.timer / FADE_TICKS);
      if (drill.timer >= FADE_TICKS) Object.assign(drill, createDrill());
      break;
  }
}
