import { ALIENS } from './world.js';

export const SPECIES = [
  { key: 'zorani', name: 'Zorani', colour: 'rgba(141, 255, 193, 0.9)', startingRelation: 40, wants: 'gold' },
  { key: 'quillith', name: 'Quillith', colour: 'rgba(255, 211, 110, 0.9)', startingRelation: 0, wants: 'crystals' },
  { key: 'vessk', name: 'Vessk', colour: 'rgba(255, 122, 138, 0.9)', startingRelation: -40, wants: 'batteries' },
];

export const speciesByKey = Object.fromEntries(SPECIES.map((species) => [species.key, species]));

export const startingRelations = () => Object.fromEntries(SPECIES.map(({ key, startingRelation }) => [key, startingRelation]));

export function mood(relation) {
  if (relation >= ALIENS.friendlyAt) return 'friendly';
  if (relation <= ALIENS.hostileAt) return 'hostile';
  return 'wary';
}

export function shiftRelation(relations, key, change) {
  relations[key] = Math.max(-ALIENS.limit, Math.min(ALIENS.limit, relations[key] + change));
}

export const priceFromAliens = (relation, marketPrice) => (mood(relation) === 'friendly' ? Math.round(marketPrice * ALIENS.friendlyPremium) : marketPrice);

export const goodwillFor = (marketValue) => marketValue / ALIENS.tokensPerRelation;

export function tipPrice(relation) {
  const warmth = Math.max(0, (relation - ALIENS.friendlyAt) / (100 - ALIENS.friendlyAt));
  return Math.round((ALIENS.tip.science * (1 - ALIENS.tip.maxDiscount * warmth)) / 10) * 10;
}
