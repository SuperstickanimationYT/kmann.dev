import { galaxyAt, outsideGalaxy } from './universe.js';
import { FAR_SHORE } from './world.js';

const studied = (game, prefix) => [...game.studies].some((key) => key.startsWith(prefix));
const goalDone = (key) => (game) => game.goalsDone.has(key);

export const MILESTONES = [
  { key: 'liftOff', reached: goalDone('liftOff') },
  { key: 'moonLanding', reached: goalDone('moonLanding') },
  { key: 'reachSun', reached: goalDone('reachSun') },
  { key: 'otherStar', reached: goalDone('otherStar') },
  { key: 'aliens', reached: goalDone('aliens') },
  { key: 'leviathan', reached: (game) => studied(game, `visit:${FAR_SHORE.name}@`), toast: `You reached ${FAR_SHORE.name}, the black hole past Saturn's wormhole.` },
  { key: 'galacticCore', reached: (game) => studied(game, 'visit:Galactic Core@'), toast: 'You reached the heart of the galaxy.' },
  { key: 'leftGalaxy', reached: (game) => outsideGalaxy(game.rocket.x, game.rocket.y), toast: 'You left the galaxy. All of its stars are behind you now.' },
  { key: 'dwarfGalaxy', reached: (game) => Boolean(galaxyAt(game.rocket.x, game.rocket.y)?.name), toast: (game) => `Welcome to the ${galaxyAt(game.rocket.x, game.rocket.y).name}, a small galaxy of its own.` },
];

export function newlyReachedMilestones(game) {
  return MILESTONES.filter((milestone) => !game.milestonesHeard.has(milestone.key) && milestone.reached(game));
}

export const milestoneToast = (milestone, game) => (typeof milestone.toast === 'function' ? milestone.toast(game) : milestone.toast);
