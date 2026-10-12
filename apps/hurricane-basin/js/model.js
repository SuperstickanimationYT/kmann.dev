import { coriolis, DX, DY, latAt, latAtFace, NX, NY, wrapColumn } from './grid.js';

export const STEP_SECONDS = 160;
const HOUR = 3600;
const DAY = 24 * HOUR;

const BUOYANCY = 12;
const DEPTH = 1000;
const THINNEST = 60;
const TRADE_WIND = -9;
const WESTERLY_WIND = 10;
const RADIATIVE_SECONDS = 2 * DAY;
const OCEAN_DRAG_SECONDS = 4 * DAY;
const LAND_DRAG_SECONDS = 0.5 * DAY;
const SURFACE_DRAG = 1.5e-3;
const STORM_DEPTH = 5000;
const LAND_ROUGHNESS = 4;
const VISCOSITY = 2e4;
const MOISTURE_MIXING = 1e4;
const SATURATION = 1;
const MOISTURE_PER_DEGREE = 0.1;
const STORM_FUEL_FROM = 26.5;
const LAND_MOISTURE = 0.6;
const CALM_EVAPORATION = 1 / (4 * DAY);
const WIND_EVAPORATION = 1 / (80 * HOUR);
const GUSTINESS = 10;
const LAND_EVAPORATION_SHARE = 0.25;
const HEATING_DEPTH = 850;
const FASTEST_HEATING = 0.04;
const DOWNPOUR_EXCESS = 0.1;
const SPONGE_CELLS = 10;
const SPONGE_SECONDS = 6 * HOUR;
const EQUATORIAL_CALM = { below: 7, above: 10 };
const OUTFLOW_BLOCK = 8;
const OUTFLOW_SPREAD_BLOCKS = 4;
const OUTFLOW_RETURN_SHARE = 0.6;
const SINKING_DRYNESS = 1;

const CELLS = NX * NY;
const BLOCKS_X = NX / OUTFLOW_BLOCK;
const BLOCKS_Y = NY / OUTFLOW_BLOCK;
const OUTFLOW_KERNEL = (() => {
  const reach = Math.ceil(OUTFLOW_SPREAD_BLOCKS * 2.5);
  const weights = Array.from({ length: 2 * reach + 1 }, (_, k) => Math.exp(-((k - reach) ** 2) / (2 * OUTFLOW_SPREAD_BLOCKS ** 2)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return { reach, weights: weights.map((weight) => weight / total) };
})();
const FACES = NX * (NY + 1);
const WEST = Int32Array.from({ length: NX }, (_, i) => wrapColumn(i - 1));
const EAST = Int32Array.from({ length: NX }, (_, i) => wrapColumn(i + 1));

const smoothstep = (low, high, x) => {
  const t = Math.max(0, Math.min(1, (x - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

export const backgroundWind = (lat, steering) => steering * (TRADE_WIND + (WESTERLY_WIND - TRADE_WIND) * smoothstep(25, 40, lat));

const minmod = (a, b) => (a * b <= 0 ? 0 : Math.abs(a) < Math.abs(b) ? a : b);

function limitedFace(speed, farUpwind, upwind, downwind, farDownwind) {
  return speed > 0 ? upwind + 0.5 * minmod(upwind - farUpwind, downwind - upwind) : downwind - 0.5 * minmod(downwind - upwind, farDownwind - downwind);
}

function restingMoisture(target, evaporation) {
  if (target <= SATURATION) return target;
  let low = SATURATION;
  let high = target;
  for (let k = 0; k < 40; k++) {
    const q = (low + high) / 2;
    const rain = (FASTEST_HEATING * Math.min(1, (q - SATURATION) / DOWNPOUR_EXCESS)) / HEATING_DEPTH;
    if (evaporation * (target - SATURATION) > rain) low = q;
    else high = q;
  }
  return (low + high) / 2;
}

function spongeRate(i, j) {
  const fromEdge = Math.min(i, NX - 1 - i, SPONGE_CELLS * 0.6 + Math.min(j, NY - 1 - j));
  return fromEdge >= SPONGE_CELLS ? 0 : (1 - fromEdge / SPONGE_CELLS) ** 2 / SPONGE_SECONDS;
}

const UPSAMPLE = (() => {
  const blockOf = (index) => (index + 0.5) / OUTFLOW_BLOCK - 0.5;
  const west = new Int32Array(NX);
  const east = new Int32Array(NX);
  const eastShare = new Float64Array(NX);
  for (let i = 0; i < NX; i++) {
    const x = blockOf(i);
    const left = Math.floor(x);
    west[i] = (left + BLOCKS_X) % BLOCKS_X;
    east[i] = (left + 1) % BLOCKS_X;
    eastShare[i] = x - left;
  }
  const row = new Int32Array(NY);
  const rowShare = new Float64Array(NY);
  for (let j = 0; j < NY; j++) {
    const y = Math.max(0, Math.min(BLOCKS_Y - 1, blockOf(j)));
    row[j] = Math.min(BLOCKS_Y - 2, Math.floor(y));
    rowShare[j] = y - row[j];
  }
  return { west, east, eastShare, row, rowShare };
})();

const fields = () => ({ h: new Float64Array(CELLS), u: new Float64Array(CELLS), v: new Float64Array(FACES), q: new Float64Array(CELLS) });

function copyInto(target, source) {
  target.h.set(source.h);
  target.u.set(source.u);
  target.v.set(source.v);
  target.q.set(source.q);
}

export function createModel({ land, seaTemperature }) {
  const now = fields();
  const start = fields();
  const stage = fields();
  const change = fields();
  const resting = fields();
  const restingChange = fields();
  const noChange = fields();
  const speed = new Float64Array(CELLS);
  const work = {
    speed: new Float64Array(CELLS),
    energy: new Float64Array(CELLS),
    heat: new Float64Array(CELLS),
    massEast: new Float64Array(CELLS),
    massNorth: new Float64Array(FACES),
    spin: new Float64Array(FACES),
    moistureEast: new Float64Array(CELLS),
    moistureNorth: new Float64Array(FACES),
    stormWind: new Float64Array(CELLS),
  };
  const restingH = new Float64Array(NY);
  const restingU = new Float64Array(NY);
  const oceanMoisture = new Float64Array(CELLS);
  const evaporationShare = Float64Array.from(land, (isLand) => (isLand ? LAND_EVAPORATION_SHARE : 1));
  const linearDrag = Float64Array.from(land, (isLand) => 1 / (isLand ? LAND_DRAG_SECONDS : OCEAN_DRAG_SECONDS));
  const surfaceDrag = Float64Array.from(land, (isLand) => ((isLand ? LAND_ROUGHNESS : 1) * SURFACE_DRAG) / STORM_DEPTH);
  const sponge = new Float64Array(CELLS);
  const restingHeat = new Float64Array(CELLS);
  const outflow = new Float64Array(BLOCKS_X * BLOCKS_Y);
  const outflowSpread = new Float64Array(BLOCKS_X * BLOCKS_Y);
  const fAtRow = Float64Array.from({ length: NY }, (_, j) => coriolis(latAt(j)));
  const fAtFace = Float64Array.from({ length: NY + 1 }, (_, j) => coriolis(latAtFace(j)));
  const heatingShare = Float64Array.from({ length: NY }, (_, j) => smoothstep(EQUATORIAL_CALM.below, EQUATORIAL_CALM.above, latAt(j)));
  let warming = 0;
  let steering = 1;

  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) sponge[j * NX + i] = spongeRate(i, j);

  function tendency(state, out, settled) {
    const { h, u, v, q } = state;
    const minus = settled ? restingChange : noChange;
    const { speed: wind, stormWind, energy, heat, massEast, massNorth, spin, moistureEast, moistureNorth } = work;

    for (let j = 0; j < NY; j++) {
      const row = j * NX;
      for (let i = 0; i < NX; i++) {
        const cell = row + i;
        const east = row + EAST[i];
        const eastward = 0.5 * (u[cell] + u[east]);
        const northward = 0.5 * (v[cell] + v[cell + NX]);
        wind[cell] = Math.sqrt(eastward * eastward + northward * northward);
        const ownEastward = eastward - restingU[j];
        stormWind[cell] = Math.sqrt(ownEastward * ownEastward + northward * northward);
        energy[cell] = 0.25 * (u[cell] * u[cell] + u[east] * u[east] + v[cell] * v[cell] + v[cell + NX] * v[cell + NX]);
        massEast[cell] = u[cell] * 0.5 * (h[row + WEST[i]] + h[cell]);
        moistureEast[cell] = u[cell] * limitedFace(u[cell], q[row + WEST[WEST[i]]], q[row + WEST[i]], q[cell], q[east]);
        const downpour = Math.min(1, Math.max(0, (q[cell] - SATURATION) / DOWNPOUR_EXCESS));
        heat[cell] = FASTEST_HEATING * downpour * (h[cell] / DEPTH);
      }
    }
    for (let i = 0; i < NX; i++) {
      massNorth[i] = moistureNorth[i] = 0;
      massNorth[NY * NX + i] = moistureNorth[NY * NX + i] = 0;
      spin[i] = fAtFace[0] / h[i];
      spin[NY * NX + i] = fAtFace[NY] / h[(NY - 1) * NX + i];
    }
    for (let j = 1; j < NY; j++) {
      const row = j * NX;
      for (let i = 0; i < NX; i++) {
        const face = row + i;
        const west = row + WEST[i];
        massNorth[face] = v[face] * 0.5 * (h[face - NX] + h[face]);
        moistureNorth[face] = v[face] * limitedFace(v[face], q[j > 1 ? face - 2 * NX : face - NX], q[face - NX], q[face], q[j < NY - 1 ? face + NX : face]);
        const vorticity = (v[face] - v[west]) / DX - (u[face] - u[face - NX]) / DY;
        const cornerDepth = 0.25 * (h[face] + h[west] + h[face - NX] + h[west - NX]);
        spin[face] = (fAtFace[j] + vorticity) / cornerDepth;
      }
    }

    for (let j = 0; j < NY; j++) {
      const row = j * NX;
      const south = j === 0 ? row : row - NX;
      const north = j === NY - 1 ? row : row + NX;
      for (let i = 0; i < NX; i++) {
        const cell = row + i;
        const iw = WEST[i];
        const ie = EAST[i];
        const west = row + iw;
        const east = row + ie;
        const precipitation = heat[cell] / HEATING_DEPTH;

        const smoothedHeat = (4 * heat[cell] + 2 * (heat[west] + heat[east] + heat[south + i] + heat[north + i]) + heat[south + iw] + heat[south + ie] + heat[north + iw] + heat[north + ie]) / 16;
        const massIn = -(massEast[east] - massEast[cell]) / DX - (massNorth[cell + NX] - massNorth[cell]) / DY;
        out.h[cell] = massIn - heatingShare[j] * smoothedHeat + (resting.h[cell] - h[cell]) * (1 / RADIATIVE_SECONDS + sponge[cell]) - minus.h[cell];

        const moistureIn = -(moistureEast[east] - moistureEast[cell]) / DX - (moistureNorth[cell + NX] - moistureNorth[cell]) / DY;
        const qMixing = MOISTURE_MIXING * ((q[west] + q[east] - 2 * q[cell]) / (DX * DX) + (q[south + i] + q[north + i] - 2 * q[cell]) / (DY * DY));
        const evaporation = (CALM_EVAPORATION + WIND_EVAPORATION * Math.max(0, stormWind[cell] - GUSTINESS)) * evaporationShare[cell] * Math.max(0, oceanMoisture[cell] - Math.min(q[cell], SATURATION));
        out.q[cell] = moistureIn + qMixing + evaporation - precipitation + sponge[cell] * (resting.q[cell] - q[cell]) - minus.q[cell];

        const vortexDrift = 0.5 * (spin[cell] + spin[cell + NX]) * 0.25 * (massNorth[cell] + massNorth[west] + massNorth[cell + NX] + massNorth[west + NX]);
        const uPush = -(BUOYANCY * (h[cell] - h[west]) + energy[cell] - energy[west]) / DX;
        const uViscous = VISCOSITY * ((u[west] + u[east] - 2 * u[cell]) / (DX * DX) + (u[south + i] + u[north + i] - 2 * u[cell]) / (DY * DY));
        const uWind = 0.5 * (wind[cell] + wind[west]);
        const uRelative = u[cell] - restingU[j];
        out.u[cell] = vortexDrift + uPush + uViscous - uRelative * (linearDrag[cell] + surfaceDrag[cell] * uWind + sponge[cell]) - minus.u[cell];

        if (j === 0) continue;
        const swirlDrift = -0.5 * (spin[cell] + spin[row + ie]) * 0.25 * (massEast[cell] + massEast[east] + massEast[cell - NX] + massEast[east - NX]);
        const vPush = -(BUOYANCY * (h[cell] - h[cell - NX]) + energy[cell] - energy[cell - NX]) / DY;
        const vSouth = j === 1 ? cell : cell - NX;
        const vNorth = j === NY - 1 ? cell : cell + NX;
        const vViscous = VISCOSITY * ((v[west] + v[east] - 2 * v[cell]) / (DX * DX) + (v[vSouth] + v[vNorth] - 2 * v[cell]) / (DY * DY));
        const vWind = 0.5 * (wind[cell] + wind[cell - NX]);
        out.v[cell] = swirlDrift + vPush + vViscous - v[cell] * (linearDrag[cell] + surfaceDrag[cell] * vWind + sponge[cell]) - minus.v[cell];
      }
    }
    for (let i = 0; i < NX; i++) out.v[i] = out.v[NY * NX + i] = 0;
  }

  function blend(target, keep, base, moved, dt) {
    const mix = (to, from, plus, rate) => {
      for (let k = 0; k < to.length; k++) to[k] = keep * from[k] + (1 - keep) * (plus[k] + dt * rate[k]);
    };
    mix(target.h, base.h, moved.h, change.h);
    mix(target.u, base.u, moved.u, change.u);
    mix(target.v, base.v, moved.v, change.v);
    mix(target.q, base.q, moved.q, change.q);
    for (let k = 0; k < CELLS; k++) if (target.h[k] < THINNEST) target.h[k] = THINNEST;
  }

  function spreadOutflow() {
    const { reach, weights } = OUTFLOW_KERNEL;
    for (let by = 0; by < BLOCKS_Y; by++) {
      for (let bx = 0; bx < BLOCKS_X; bx++) {
        let total = 0;
        for (let k = -reach; k <= reach; k++) total += weights[k + reach] * outflow[by * BLOCKS_X + ((bx + k + BLOCKS_X) % BLOCKS_X)];
        outflowSpread[by * BLOCKS_X + bx] = total;
      }
    }
    for (let by = 0; by < BLOCKS_Y; by++) {
      for (let bx = 0; bx < BLOCKS_X; bx++) {
        let total = 0;
        let used = 0;
        for (let k = -reach; k <= reach; k++) {
          const row = by + k;
          if (row < 0 || row >= BLOCKS_Y) continue;
          total += weights[k + reach] * outflowSpread[row * BLOCKS_X + bx];
          used += weights[k + reach];
        }
        outflow[by * BLOCKS_X + bx] = total / used;
      }
    }
  }


  function sinkOutflow(dt) {
    const { heat } = work;
    outflow.fill(0);
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cell = j * NX + i;
        const lifted = heatingShare[j] * heat[cell] - restingHeat[cell];
        if (lifted > 0) outflow[Math.floor(j / OUTFLOW_BLOCK) * BLOCKS_X + Math.floor(i / OUTFLOW_BLOCK)] += lifted;
      }
    }
    let anyLifted = false;
    for (let block = 0; block < outflow.length; block++) {
      outflow[block] *= OUTFLOW_RETURN_SHARE / (OUTFLOW_BLOCK * OUTFLOW_BLOCK);
      if (outflow[block] > 0) anyLifted = true;
    }
    if (!anyLifted) return;
    spreadOutflow();
    const { h, q } = now;
    for (let j = 0; j < NY; j++) {
      const lower = UPSAMPLE.row[j] * BLOCKS_X;
      const upper = lower + BLOCKS_X;
      const northShare = UPSAMPLE.rowShare[j];
      for (let i = 0; i < NX; i++) {
        const cell = j * NX + i;
        const [west, east, eastShare] = [UPSAMPLE.west[i], UPSAMPLE.east[i], UPSAMPLE.eastShare[i]];
        const spread = (1 - northShare) * ((1 - eastShare) * outflow[lower + west] + eastShare * outflow[lower + east]) + northShare * ((1 - eastShare) * outflow[upper + west] + eastShare * outflow[upper + east]);
        const clearSky = 1 - Math.min(1, Math.max(0, (q[cell] - SATURATION) / DOWNPOUR_EXCESS));
        const sinking = dt * clearSky * spread;
        q[cell] *= Math.max(0, 1 - (SINKING_DRYNESS * sinking) / h[cell]);
        h[cell] += sinking;
      }
    }
  }

  function step(dt = STEP_SECONDS) {
    copyInto(start, now);
    tendency(now, change, true);
    blend(stage, 0, start, now, dt);
    tendency(stage, change, true);
    blend(stage, 3 / 4, start, stage, dt);
    tendency(stage, change, true);
    blend(now, 1 / 3, start, stage, dt);
    sinkOutflow(dt);
  }

  function settle() {
    for (let j = 0; j < NY; j++) restingU[j] = backgroundWind(latAt(j), steering);
    restingH[0] = DEPTH;
    for (let j = 1; j < NY; j++) restingH[j] = restingH[j - 1] - (fAtFace[j] * backgroundWind(latAtFace(j), steering) * DY) / BUOYANCY;
    const middle = restingH[NY >> 1];
    for (let j = 0; j < NY; j++) restingH[j] += DEPTH - middle;

    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cell = j * NX + i;
        oceanMoisture[cell] = land[cell] ? LAND_MOISTURE : SATURATION + MOISTURE_PER_DEGREE * (seaTemperature[cell] + warming - STORM_FUEL_FROM);
        const evaporation = (CALM_EVAPORATION + WIND_EVAPORATION * Math.max(0, Math.abs(restingU[j]) - GUSTINESS)) * evaporationShare[cell];
        const target = oceanMoisture[cell];
        resting.q[cell] = restingMoisture(target, evaporation);
        resting.h[cell] = restingH[j];
        resting.u[cell] = restingU[j];
      }
    }
    resting.v.fill(0);
    tendency(resting, restingChange, false);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) restingHeat[j * NX + i] = heatingShare[j] * work.heat[j * NX + i];
  }

  function reset() {
    settle();
    copyInto(now, resting);
    measureWind();
  }

  function measureWind() {
    const { u, v } = now;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const cell = j * NX + i;
        const eastward = 0.5 * (u[cell] + u[j * NX + EAST[i]]);
        const northward = 0.5 * (v[cell] + v[cell + NX]);
        speed[cell] = Math.sqrt(eastward * eastward + northward * northward);
      }
    }
  }

  function addVortex(column, row, { depth, radius, moisture }) {
    const { h, u, v, q } = now;
    const swirl = (distance, f) => {
      if (distance === 0) return 0;
      const slope = (depth * 2 * distance * Math.exp(-(distance * distance) / (radius * radius))) / (radius * radius);
      return (-f * distance + Math.sqrt(f * f * distance * distance + 4 * BUOYANCY * distance * slope)) / 2;
    };
    const reach = Math.ceil((3 * radius) / Math.min(DX, DY));
    const [centreI, centreJ] = [Math.round(column), Math.round(row)];
    for (let dj = -reach; dj <= reach + 1; dj++) {
      const j = centreJ + dj;
      if (j < 0 || j >= NY) continue;
      for (let di = -reach; di <= reach + 1; di++) {
        const cell = j * NX + wrapColumn(centreI + di);
        const [x, y] = [(centreI + di - column) * DX, (j - row) * DY];
        const closeness = Math.exp(-(x * x + y * y) / (radius * radius));
        h[cell] = Math.max(THINNEST, h[cell] - depth * closeness);
        q[cell] += moisture * closeness;
        const [ux, uy] = [x - DX / 2, y];
        const uDistance = Math.hypot(ux, uy);
        if (uDistance) u[cell] -= (swirl(uDistance, fAtRow[j]) * uy) / uDistance;
        const [vx, vy] = [x, y - DY / 2];
        const vDistance = Math.hypot(vx, vy);
        if (vDistance && j > 0) v[cell] += (swirl(vDistance, fAtFace[j]) * vx) / vDistance;
      }
    }
  }

  function setWarming(degrees) {
    warming = degrees;
    settle();
  }

  function setSteering(share) {
    steering = share;
    settle();
  }

  reset();

  return {
    h: now.h, q: now.q, u: now.u, v: now.v, speed, land, seaTemperature, restingH,
    get warming() {
      return warming;
    },
    reset, step, addVortex, setWarming, setSteering, measureWind,
    pressureAt: (cell) => 1012 + 0.11 * (now.h[cell] - DEPTH),
    anomalyAt: (cell, j) => now.h[cell] - restingH[j],
  };
}
