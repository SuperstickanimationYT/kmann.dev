import { PRICE_GROWTH, UPGRADES } from './world.js';

const bodyKey = (body) => `${body.name}@${Math.round(body.x)},${Math.round(body.y)}`;

export const bountyWaiting = (claimed, body) => (body.bounty && !claimed.has(bodyKey(body)) ? body.bounty : 0);

export function claimBounty(claimed, body) {
  const bounty = body ? bountyWaiting(claimed, body) : 0;
  if (bounty) claimed.add(bodyKey(body));
  return bounty;
}

export const createUpgrades = () => Object.fromEntries(Object.keys(UPGRADES).map((key) => [key, 0]));

export const upgradeValue = (key, level) => (level === 0 ? UPGRADES[key].base : UPGRADES[key].levels[level - 1].value);

export const nextUpgrade = (key, level) => UPGRADES[key].levels[level] ?? null;

export const risingPrice = (base, owned) => Math.round((base * PRICE_GROWTH ** owned) / 10) * 10;

export const canAfford = (upgrade, { galactokens, crystals, stardust }) =>
  galactokens >= upgrade.cost && crystals >= (upgrade.crystals ?? 0) && stardust >= (upgrade.stardust ?? 0);

export function applyUpgrades(upgrades, rocket, power) {
  power.slots = upgradeValue('batterySlots', upgrades.batterySlots);
  power.panelBoost = upgradeValue('panels', upgrades.panels);
  rocket.fuelCapacity = upgradeValue('tank', upgrades.tank);
  rocket.thrust = upgradeValue('engine', upgrades.engine);
}
