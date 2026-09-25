import { ALIENS } from './world.js';

export const SPECIES = [
  { key: 'zorani', name: 'Zorani', colour: 'rgba(141, 255, 193, 0.9)', startingRelation: 40 },
  { key: 'quillith', name: 'Quillith', colour: 'rgba(255, 211, 110, 0.9)', startingRelation: 0 },
  { key: 'vessk', name: 'Vessk', colour: 'rgba(255, 122, 138, 0.9)', startingRelation: -40 },
];

export const speciesByKey = Object.fromEntries(SPECIES.map((species) => [species.key, species]));

export const startingRelations = () => Object.fromEntries(SPECIES.map(({ key, startingRelation }) => [key, startingRelation]));

export function mood(relation) {
  if (relation >= ALIENS.friendlyAt) return 'friendly';
  if (relation <= ALIENS.hostileAt) return 'hostile';
  return 'wary';
}

export function tipPrice(relation) {
  const warmth = Math.max(0, (relation - ALIENS.friendlyAt) / (100 - ALIENS.friendlyAt));
  return Math.round((ALIENS.tip.science * (1 - ALIENS.tip.maxDiscount * warmth)) / 10) * 10;
}
