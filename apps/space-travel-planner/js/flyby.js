import { dot, norm } from './vector.js';

const BISECTION_STEPS = 80;
const FARTHEST_PERIAPSIS_FACTOR = 1e7;

function halfTurn(periapsisRadius, speed, mu) {
  return Math.asin(1 / (1 + (periapsisRadius * speed * speed) / mu));
}

export function turnAngle(periapsisRadius, speedIn, speedOut, mu) {
  return halfTurn(periapsisRadius, speedIn, mu) + halfTurn(periapsisRadius, speedOut, mu);
}

export function poweredFlyby(vInfIn, vInfOut, mu, lowestPeriapsisRadius) {
  const speedIn = norm(vInfIn);
  const speedOut = norm(vInfOut);
  const neededTurn = Math.acos(Math.max(-1, Math.min(1, dot(vInfIn, vInfOut) / (speedIn * speedOut))));
  const tightestTurn = turnAngle(lowestPeriapsisRadius, speedIn, speedOut, mu);

  let periapsisRadius = lowestPeriapsisRadius;
  let missingTurn = 0;
  if (neededTurn > tightestTurn) {
    missingTurn = neededTurn - tightestTurn;
  } else {
    let near = lowestPeriapsisRadius;
    let far = lowestPeriapsisRadius * FARTHEST_PERIAPSIS_FACTOR;
    for (let step = 0; step < BISECTION_STEPS; step++) {
      const middle = Math.sqrt(near * far);
      if (turnAngle(middle, speedIn, speedOut, mu) > neededTurn) near = middle;
      else far = middle;
    }
    periapsisRadius = Math.sqrt(near * far);
  }

  const periapsisBurn = Math.abs(Math.sqrt(speedOut ** 2 + (2 * mu) / periapsisRadius) - Math.sqrt(speedIn ** 2 + (2 * mu) / periapsisRadius));
  const steeringBurn = 2 * speedOut * Math.sin(missingTurn / 2);
  return { deltaV: periapsisBurn + steeringBurn, periapsisBurn, steeringBurn, periapsisRadius, neededTurn, missingTurn, speedIn, speedOut };
}
