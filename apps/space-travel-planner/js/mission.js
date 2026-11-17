import { BODIES, defaultPeriapsisAltitude } from './bodies.js';
import { boilsOff, massAfterCruise } from './boiloff.js';
import {
  captureIntoOrbit,
  deltaVFromPropellant,
  escapeFromCircularOrbit,
  exhaustSpeed,
  propellantForDeltaV,
  raiseC3AtPeriapsis,
} from './burns.js';
import { LAUNCHERS, LAUNCH_SITE_LATITUDE, PARKING_ORBIT_ALTITUDE_KM, bestC3For, payloadAt } from './launchers.js';
import { ENGINES, PROPELLANTS, SOLID_MOTORS } from './parts.js';
import { legsOf, sunDistancesAlong } from './transfer.js';
import { PLANET_LOOKS } from './planets.js';

const SEA_LEVEL_GRAVITY = 9.80665;
const CRUISE_SAMPLES = 200;
const LONG_BURN_SECONDS = 20 * 60;
const SPENT = 1e-9;
const DEGREES = 180 / Math.PI;

export function buildStage(spec, index) {
  if (spec.kind === 'solid') {
    const motor = SOLID_MOTORS[spec.motor];
    return { index, label: motor.name, kind: 'solid', isp: motor.isp, thrust: motor.thrust, inert: motor.inert, solid: motor.propellant, fuel: 0, oxidizer: 0, mixture: 0 };
  }
  const engine = ENGINES[spec.engine];
  const propellant = PROPELLANTS[engine.propellant];
  const tankShare = spec.tankShare ?? propellant.tankShare;
  return {
    index,
    label: `${spec.engines > 1 ? `${spec.engines}× ` : ''}${engine.name} stage`,
    kind: 'liquid',
    isp: engine.isp,
    thrust: engine.thrust * spec.engines,
    inert: engine.mass * spec.engines + spec.propellant * tankShare,
    solid: 0,
    fuel: spec.propellant / (1 + engine.mixture),
    oxidizer: (spec.propellant * engine.mixture) / (1 + engine.mixture),
    mixture: engine.mixture,
    fuelName: propellant.fuel,
    oxidizerName: propellant.oxidizer,
    insulation: spec.insulation,
  };
}

export function stageMass(stage) {
  return stage.inert + stage.solid + stage.fuel + stage.oxidizer;
}

export function usablePropellant(stage) {
  if (stage.kind === 'solid') return stage.solid;
  return Math.min(stage.fuel * (1 + stage.mixture), (stage.oxidizer * (1 + stage.mixture)) / stage.mixture);
}

export function stackDeltaV(payload, stages) {
  let total = 0;
  stages.forEach((stage, position) => {
    const above = payload + stages.slice(position).reduce((sum, each) => sum + stageMass(each), 0);
    total += deltaVFromPropellant(above, usablePropellant(stage), stage.isp);
  });
  return total;
}

function burnSeconds(stage, propellant) {
  return (propellant * stage.isp * SEA_LEVEL_GRAVITY) / stage.thrust;
}

function consume(stage, propellant) {
  if (stage.kind === 'solid') {
    stage.solid -= propellant;
    return;
  }
  stage.fuel -= propellant / (1 + stage.mixture);
  stage.oxidizer -= (propellant * stage.mixture) / (1 + stage.mixture);
}

export function simulateMission({ transfer, launcher, payload, stages: specs, goal, periapsisAltitude, apoapsisAltitude }) {
  const stack = specs.map(buildStage);
  const events = [];
  const warnings = [];
  const mass = () => payload + stack.reduce((sum, stage) => sum + stageMass(stage), 0);
  const result = (failure = null) => ({ ok: !failure, failure, events, warnings, arrivedMass: mass(), spareDeltaV: failure ? 0 : stackDeltaV(payload, stack) });

  function cruise(leg) {
    const days = leg.arriveJd - leg.departJd;
    const distances = sunDistancesAlong(leg, CRUISE_SAMPLES);
    const losses = [];
    for (const stage of stack.filter((each) => each.kind === 'liquid')) {
      for (const [component, nameKey] of [['fuel', 'fuelName'], ['oxidizer', 'oxidizerName']]) {
        if (!boilsOff(stage[nameKey])) continue;
        const after = massAfterCruise(stage[nameKey], stage[component], stage.insulation, distances, days / CRUISE_SAMPLES);
        losses.push({ stage: stage.label, component: stage[nameKey], lost: stage[component] - after, before: stage[component] });
        stage[component] = after;
      }
    }
    events.push({ kind: 'cruise', days, losses });
  }

  function burn(label, deltaV) {
    const startMass = mass();
    const parts = [];
    let remaining = deltaV;
    let lastIsp = stack[0]?.isp ?? null;
    while (remaining > SPENT && stack.length) {
      const stage = stack[0];
      const usable = usablePropellant(stage);
      if (usable <= SPENT) {
        stack.shift();
        continue;
      }
      const before = mass();
      const available = deltaVFromPropellant(before, usable, stage.isp);
      const used = stage.kind === 'solid' || available <= remaining ? usable : propellantForDeltaV(before, remaining, stage.isp);
      const gained = deltaVFromPropellant(before, used, stage.isp);
      consume(stage, used);
      parts.push({ stage: stage.label, propellant: used, deltaV: gained, seconds: burnSeconds(stage, used) });
      if (stage.kind === 'solid' && gained > remaining * 1.01) {
        warnings.push(`The ${stage.label} burns all at once, giving ${(gained - remaining).toFixed(2)} km/s more than the ${label.toLowerCase()} needs. The extra is wasted.`);
      }
      remaining = Math.max(0, remaining - gained);
      lastIsp = stage.isp;
      if (usablePropellant(stage) <= SPENT) stack.shift();
    }
    for (const part of parts.filter((each) => each.seconds > LONG_BURN_SECONDS)) {
      warnings.push(
        `The ${part.stage} fires for ${Math.round(part.seconds / 60)} minutes during the ${label.toLowerCase()}. This planner treats burns as instant, so a burn that long really costs more, because some thrust goes into fighting gravity.`,
      );
    }
    const event = { kind: 'burn', label, deltaV, parts, startMass, endMass: mass(), missing: remaining };
    events.push(event);
    if (remaining <= SPENT) return null;
    return {
      kind: 'shortfall',
      label,
      deltaV,
      missing: remaining,
      neededMassRatio: lastIsp ? Math.exp(deltaV / exhaustSpeed(lastIsp)) : null,
      isp: lastIsp,
    };
  }

  const fromBody = BODIES[transfer.from];
  if (transfer.from === 'earth' && launcher) {
    const vehicle = LAUNCHERS[launcher];
    const stackMass = mass();
    const bestC3 = bestC3For(vehicle, stackMass);
    if (bestC3 === null) {
      events.push({ kind: 'launch', launcher: vehicle.name, stackMass, capacity: payloadAt(vehicle, 0), c3: null });
      return result({ kind: 'tooHeavy', launcher: vehicle.name, stackMass, capacity: payloadAt(vehicle, 0) });
    }
    const launchC3 = Math.min(bestC3, transfer.c3);
    events.push({ kind: 'launch', launcher: vehicle.name, stackMass, capacity: payloadAt(vehicle, launchC3), c3: launchC3 });
    if (Math.abs(transfer.declination * DEGREES) > LAUNCH_SITE_LATITUDE) {
      warnings.push(
        `NASA's launcher numbers hold for launch directions within ${LAUNCH_SITE_LATITUDE}° of the equator. This trajectory needs ${Math.abs(transfer.declination * DEGREES).toFixed(0)}°, so the real launcher carries less than shown.`,
      );
    }
    const topUp = raiseC3AtPeriapsis(launchC3, transfer.c3, fromBody.mu, fromBody.radius + PARKING_ORBIT_ALTITUDE_KM);
    if (topUp > SPENT) {
      const failure = burn('Departure burn', topUp);
      if (failure) return result(failure);
    }
  } else {
    const orbitRadius = fromBody.radius + defaultPeriapsisAltitude(transfer.from);
    events.push({ kind: 'start', orbitAltitude: orbitRadius - fromBody.radius, stackMass: mass() });
    const failure = burn('Departure burn', escapeFromCircularOrbit(transfer.c3, fromBody.mu, orbitRadius));
    if (failure) return result(failure);
  }

  const legs = legsOf(transfer);
  for (const [legIndex, leg] of legs.entries()) {
    cruise(leg);
    if (legIndex === legs.length - 1) break;
    const { flyby, via } = transfer;
    const name = PLANET_LOOKS[via].name;
    events.push({ kind: 'flyby', planet: via, periapsisAltitude: flyby.periapsisRadius - BODIES[via].radius, deltaV: flyby.deltaV });
    if (flyby.missingTurn > 0) {
      warnings.push(`${name} can't bend the path far enough, even skimming past at the lowest safe height. The planner adds a ${flyby.steeringBurn.toFixed(2)} km/s burn to steer the rest of the way.`);
    }
    if (flyby.deltaV > SPENT) {
      const failure = burn(`Burn at ${name}`, flyby.deltaV);
      if (failure) return result(failure);
    }
  }

  if (goal === 'orbit') {
    const toBody = BODIES[transfer.to];
    const periapsis = toBody.radius + periapsisAltitude;
    const apoapsis = toBody.radius + Math.max(periapsisAltitude, apoapsisAltitude);
    const failure = burn('Orbit insertion', captureIntoOrbit(transfer.arrivalSpeed, toBody.mu, periapsis, apoapsis));
    if (failure) return result(failure);
  }

  events.push({ kind: 'arrive', goal, mass: mass() });
  return result();
}
