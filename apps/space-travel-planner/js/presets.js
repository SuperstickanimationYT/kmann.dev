const storable = (engine, propellant) => ({ kind: 'liquid', engine, engines: 1, propellant, insulation: 'sunshade' });
const STAR_48BV = { kind: 'solid', motor: 'star48bv' };

export const PRESETS = {
  marsOrbiter: {
    name: 'Mars orbiter (works)',
    expect: 'works',
    trajectory: { from: 'earth', to: 'mars', via: '' },
    search: { windowStart: '2028-06-01', windowYears: 1.5, flightMin: 104, flightMax: 337, metric: 'c3' },
    rocket: { launcher: 'vulcanVc2', payload: 1000, goal: 'orbit', periapsisAltitude: 300, apoapsisAltitude: 67900, stages: [storable('aj10', 900)] },
  },
  jupiterOrbiter: {
    name: 'Jupiter orbiter (works)',
    expect: 'works',
    trajectory: { from: 'earth', to: 'jupiter', via: '' },
    search: { windowStart: '2028-06-01', windowYears: 1.5, flightMin: 600, flightMax: 1300, metric: 'totalDeltaV' },
    rocket: { launcher: 'falconHeavyExpendable', payload: 1000, goal: 'orbit', periapsisAltitude: 3575, apoapsisAltitude: 1429840, stages: [storable('aj10', 1150)] },
  },
  jupiterHydrogen: {
    name: 'Jupiter orbiter on hydrogen (boils off)',
    expect: 'fails',
    trajectory: { from: 'earth', to: 'jupiter', via: '' },
    search: { windowStart: '2028-06-01', windowYears: 1.5, flightMin: 600, flightMax: 1300, metric: 'totalDeltaV' },
    rocket: {
      launcher: 'falconHeavyExpendable',
      payload: 1200,
      goal: 'orbit',
      periapsisAltitude: 3575,
      apoapsisAltitude: 1429840,
      stages: [{ kind: 'liquid', engine: 'rl10c1', engines: 1, propellant: 900, insulation: 'upperStage' }],
    },
  },
  neptuneDirect: {
    name: 'Neptune orbiter, direct (fails)',
    expect: 'fails',
    trajectory: { from: 'earth', to: 'neptune', via: '' },
    search: { windowStart: '2030-01-01', windowYears: 2, flightMin: 4000, flightMax: 16000, metric: 'totalDeltaV' },
    rocket: { launcher: 'falconHeavyExpendable', payload: 1000, goal: 'orbit', periapsisAltitude: 1238, apoapsisAltitude: 495280, stages: [STAR_48BV, storable('aj10', 1500)] },
  },
  neptuneFlyby: {
    name: 'Neptune flyby via Jupiter (works)',
    expect: 'works',
    trajectory: { from: 'earth', to: 'neptune', via: 'jupiter' },
    search: { windowStart: '2029-06-01', windowYears: 4, flightMin: 3000, flightMax: 4800, metric: 'totalDeltaV' },
    rocket: { launcher: 'falconHeavyExpendable', payload: 500, goal: 'flyby', periapsisAltitude: 1238, apoapsisAltitude: 495280, stages: [STAR_48BV, storable('r4d', 150)] },
  },
  neptuneOrbiterFlyby: {
    name: 'Neptune orbiter via Jupiter (fails)',
    expect: 'fails',
    trajectory: { from: 'earth', to: 'neptune', via: 'jupiter' },
    search: { windowStart: '2029-06-01', windowYears: 4, flightMin: 3000, flightMax: 4800, metric: 'totalDeltaV' },
    rocket: { launcher: 'falconHeavyExpendable', payload: 1500, goal: 'orbit', periapsisAltitude: 1238, apoapsisAltitude: 495280, stages: [STAR_48BV, storable('aj10', 1500)] },
  },
};
