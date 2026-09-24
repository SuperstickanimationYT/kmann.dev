import { advance } from './physics.js';
import { ANTENNA, DRONE, FUEL_PACK } from './world.js';

export const inSignal = (antennas, x, y) => antennas.some((antenna) => Math.hypot(x - antenna.x, y - antenna.y) <= ANTENNA.range);

export function createDrone() {
  return { pad: null, route: null, running: false, fuel: 0, flight: null, lost: false, batteries: Array(DRONE.batteries).fill(0) };
}

export const poseOf = (craft) => ({ x: craft.x, y: craft.y, heading: craft.heading, site: craft.soi.name });

export function parkDrone(drone, rocket) {
  Object.assign(drone, { pad: poseOf(rocket), route: null, running: false, flight: null, lost: false });
}

export function stowDrone(drone) {
  Object.assign(drone, { pad: null, route: null, running: false, flight: null, lost: false });
}

export function startRecording(drone, rocket) {
  drone.running = false;
  return { start: poseOf(rocket), steps: 0, controls: [], events: [], fuelBurned: 0 };
}

const controlsOf = (craft) => [craft.engineOn, craft.throttle, craft.heading, craft.thrust];

export function noteControls(recording, rocket) {
  const controls = controlsOf(rocket);
  const last = recording.controls.at(-1);
  if (!last || controls.some((value, i) => value !== last[i + 1])) recording.controls.push([recording.steps, ...controls]);
}

export function noteStep(recording, fuelBefore, rocket) {
  recording.fuelBurned += Math.max(0, fuelBefore - rocket.fuel);
  recording.steps += 1;
}

export const noteEvent = (recording, name) => recording.events.push([recording.steps, name]);

export function finishRecording(drone, recording) {
  const { start, steps, controls, events, fuelBurned } = recording;
  Object.assign(drone, { pad: start, route: { steps, controls, events, fuel: fuelBurned + DRONE.fuelMargin }, running: true });
}

export const refuelCost = (drone) => Math.ceil(Math.max(0, drone.route.fuel - drone.fuel) * (FUEL_PACK.cost / FUEL_PACK.amount));

export function launchDrone(drone) {
  const { pad, route } = drone;
  drone.fuel = route.fuel;
  drone.flight = {
    x: pad.x,
    y: pad.y,
    vx: 0,
    vy: 0,
    heading: pad.heading,
    throttle: 100,
    engineOn: false,
    thrust: 1,
    fuel: route.fuel,
    soi: null,
    landed: true,
    destroyed: false,
    step: 0,
    nextControl: 0,
    nextEvent: 0,
  };
}

function replayStep(drone, act) {
  const { flight, route } = drone;
  while (route.events[flight.nextEvent]?.[0] === flight.step) act(route.events[flight.nextEvent++][1], flight, drone);
  while (route.controls[flight.nextControl]?.[0] === flight.step) {
    const [, engineOn, throttle, heading, thrust] = route.controls[flight.nextControl++];
    Object.assign(flight, { engineOn, throttle, heading, thrust });
  }
}

export function flyDrone(drone, antennas, act, dt) {
  const { flight } = drone;
  if (!drone.lost) replayStep(drone, act);
  const hit = advance(flight, dt);
  if (hit === 'crash') return 'crash';
  if (drone.lost) return null;
  flight.step += 1;
  if (!inSignal(antennas, flight.x, flight.y)) {
    drone.lost = true;
    flight.engineOn = false;
    return 'lost';
  }
  if (flight.step < drone.route.steps) return null;
  drone.fuel = flight.fuel;
  drone.flight = null;
  return 'done';
}

export const dockFlight = (flight) => Object.assign(flight, { vx: 0, vy: 0, engineOn: false });

const PATH_SAMPLE_STEPS = 10;
const WORMHOLE_JUMP = 10000;

const moveOnly = (name, flight) => {
  if (name === 'dock') dockFlight(flight);
};

export function rehearseRoute(drone, antennas, dt) {
  const ghost = { ...drone, lost: false, batteries: [] };
  launchDrone(ghost);
  const segments = [[ghost.flight.x, ghost.flight.y]];
  const handoffs = [];
  const noteHandoff = (name, flight) => {
    moveOnly(name, flight);
    handoffs.push({ step: flight.step, name, at: { x: flight.x, y: flight.y } });
  };
  let { x, y } = ghost.flight;
  for (;;) {
    const flight = ghost.flight;
    const outcome = flyDrone(ghost, antennas, noteHandoff, dt);
    if (Math.hypot(flight.x - x, flight.y - y) > WORMHOLE_JUMP) segments.push([]);
    ({ x, y } = flight);
    if (flight.step % PATH_SAMPLE_STEPS === 0 || outcome) segments.at(-1).push(x, y);
    if (outcome) return { segments, handoffs, outcome, steps: flight.step, flight, fuelLeft: ghost.fuel };
  }
}

export function replayFlight(drone, antennas, steps, dt) {
  launchDrone(drone);
  for (let i = 0; i < steps; i++) flyDrone(drone, antennas, moveOnly, dt);
}

export const routeProgress = (drone) => (drone.flight && drone.route ? drone.flight.step / drone.route.steps : 0);
