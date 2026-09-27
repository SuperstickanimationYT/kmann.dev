import { chargeRate, fillBatteries } from './solar.js';

const blockList = (counts) => Object.entries(counts).flatMap(([type, count]) => Array(count).fill(type));

export const countBlocks = (vessel, type) => vessel.blocks.filter((block) => block === type).length;

export function createVessel(counts) {
  const blocks = blockList(counts);
  return { deployed: false, x: 0, y: 0, vx: 0, vy: 0, blocks, batteries: Array(blocks.filter((block) => block === 'battery').length).fill(0) };
}

export function placeVessel(vessel, spot) {
  Object.assign(vessel, { deployed: true, x: spot.x, y: spot.y, vx: 0, vy: 0 });
}

export const chargeFromPanels = (vessel, light, seconds) => fillBatteries(vessel.batteries, chargeRate(light) * countBlocks(vessel, 'panel') * seconds);

export const vesselFromSave = (saved, counts) => ({ ...createVessel(counts), ...saved });
