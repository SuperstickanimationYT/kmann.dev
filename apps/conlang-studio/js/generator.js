import { fitsSyllables } from './grammar.js';

const MAX_TRIES_PER_WORD = 40;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function syllable(shape, categories) {
  const members = new Map(categories.map(({ symbol, members: list }) => [symbol, list.split(/[\s,]+/).filter(Boolean)]));
  return [...shape].map((character) => (members.get(character)?.length ? pick(members.get(character)) : character.toLowerCase())).join('');
}

export function generateWords(language, { count, minSyllables, maxSyllables }) {
  const shapes = language.syllables.split(/[\s,]+/).filter(Boolean);
  if (!shapes.length) return [];
  const taken = new Set(language.words.map((word) => word.roman.toLowerCase()));
  const found = new Set();
  for (let tries = 0; found.size < count && tries < count * MAX_TRIES_PER_WORD; tries++) {
    const length = minSyllables + Math.floor(Math.random() * (maxSyllables - minSyllables + 1));
    const word = Array.from({ length }, () => syllable(pick(shapes), language.categories)).join('');
    if (!taken.has(word) && fitsSyllables(word, language)) found.add(word);
  }
  return [...found];
}
