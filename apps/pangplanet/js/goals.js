import { sunlight } from './solar.js';
import { FAR_SHORE } from './world.js';

const NEAR_THE_SUN_LIGHT = 0.1;

const studied = (game, prefix) => [...game.studies].some((key) => key.startsWith(prefix));
const HOME_REACHES = ['Sun', FAR_SHORE.name].map((name) => `visit:${name}@`);
const visitedBeyondHome = (game) => [...game.studies].some((key) => key.startsWith('visit:') && !HOME_REACHES.some((home) => key.startsWith(home)));

export const GOALS = [
  { key: 'liftOff', text: 'Lift off from Earth', reached: (game) => !game.rocket.landed },
  { key: 'moonLanding', text: 'Land on the Moon under 30 m/s', reached: (game) => studied(game, 'landing:Moon@') },
  { key: 'drill', text: 'Drill while landed: tap the rocket, then Mine fuel', reached: (game) => studied(game, 'sample:') },
  { key: 'market', text: 'Dock at the market beside Earth', reached: (game) => game.panel === 'market' },
  { key: 'panels', text: 'Buy solar panels at the market', reached: (game) => game.power.ownsPanels },
  { key: 'reachSun', text: 'Take the Sun Wormhole past the Moon to the Sun', reached: (game) => sunlight(game.rocket.x, game.rocket.y) >= NEAR_THE_SUN_LIGHT },
  { key: 'chargeBattery', text: 'Charge a battery full with your solar panels', reached: (game) => game.power.batteries.some((charge) => charge >= 1) },
  { key: 'sellBattery', text: 'Sell a charged battery at the market' },
  { key: 'savings', text: 'Save up 1,000 galactokens', reached: (game) => game.galactokens >= 1000 },
  { key: 'rig', text: 'Set up a mining rig on a planet or moon', reached: (game) => Boolean(game.rig?.deployed) },
  { key: 'telescope', text: 'Buy a telescope to find more stars', reached: (game) => game.ownsTelescope },
  { key: 'boardShip', text: 'Buy a ship hull at the market, then fly to it and board it', reached: (game) => game.boarded !== null },
  { key: 'warpDrive', text: 'Buy the warp drive', reached: (game) => game.ownsWarpDrive },
  { key: 'otherStar', text: 'Reach another star system', reached: visitedBeyondHome },
  { key: 'sellScience', text: 'Sell science at the market: every new landing and sample earns it' },
  { key: 'crystal', text: 'Drill a crystal on a crystal world: observatories spot them', reached: (game) => game.crystals > 0 },
  { key: 'aliens', text: 'Meet an alien species', reached: (game) => studied(game, 'contact:') },
  { key: 'stardust', text: 'Drill stardust: friendly aliens know where to find it', reached: (game) => game.stardust > 0 },
];

export function newlyReachedGoals(game) {
  return GOALS.filter((goal) => !game.goalsDone.has(goal.key) && goal.reached?.(game));
}

export const currentGoal = (done) => GOALS.find((goal) => !done.has(goal.key)) ?? null;
