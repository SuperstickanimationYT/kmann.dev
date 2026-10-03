export const BUILT_IN = {};

const add = (cat, words, value) => {
  for (const word of words) BUILT_IN[word] = { cat, value: value ?? word };
};

add('det', ['the'], 'the');
add('det', ['a', 'an', 'any', 'some'], 'a');
for (const color of ['red', 'green', 'blue', 'yellow']) add('adj', [color], { kind: 'color', value: color });
add('adj', ['big', 'large'], { kind: 'size', value: 'big' });
add('adj', ['small', 'little'], { kind: 'size', value: 'small' });
add('noun', ['cube', 'cubes'], 'cube');
add('noun', ['pyramid', 'pyramids'], 'pyramid');
add('noun', ['block', 'blocks', 'thing', 'things', 'object', 'objects', 'one', 'ones'], 'block');
add('noun', ['table'], 'table');
add('pron', ['it', 'them'], 'it');
add('prep', ['on', 'onto'], 'on');
add('prep', ['under', 'underneath', 'beneath'], 'under');
add('prep', ['below'], 'below');
add('prep', ['above', 'over'], 'above');
add('prep', ['beside', 'next_to'], 'beside');
add('prep', ['left_of'], 'left_of');
add('prep', ['right_of'], 'right_of');
add('verb', ['put', 'place', 'set', 'move', 'stack', 'drop'], 'put');
add('verb', ['take', 'remove', 'lift'], 'take');
add('verb', ['clear'], 'clear');
add('word', [
  'what', 'where', 'which', 'is', 'are', 'there', 'that', 'off', 'of', 'to', 'top', 'next', 'left', 'right',
  'how', 'many', 'color', 'colour', 'how_many', 'what_color', 'is_there', 'are_there',
  'please', 'can', 'could', 'would', 'will', 'you', 'i', 'me', 'not', 'do', 'now', 'then',
  'means', 'mean', 'why', 'forget', 'help', 'wrong', 'no', 'yes', 'thanks', 'thank', 'good', 'correct', 'and',
]);

const CATEGORY_NAMES = { det: 'Det', adj: 'Adj', noun: 'N', pron: 'Pron', prep: 'P', verb: 'V', word: 'W', unknown: '?' };
export const categoryName = (cat) => CATEGORY_NAMES[cat];

const CONTRACTIONS = {
  "what's": ['what', 'is'], "where's": ['where', 'is'], "that's": ['that', 'is'], "it's": ['it', 'is'],
  "there's": ['there', 'is'], "you're": ['you', 'are'], "isn't": ['is', 'not'], "don't": ['do', 'not'], thats: ['that', 'is'],
};

export function tokenize(text) {
  const words = text.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  return words.flatMap((word) => CONTRACTIONS[word] ?? [word.replace(/'s$/, '')]);
}

const PHRASES = [
  [['on', 'top', 'of'], 'on'],
  [['to', 'the', 'left', 'of'], 'left_of'],
  [['left', 'of'], 'left_of'],
  [['to', 'the', 'right', 'of'], 'right_of'],
  [['right', 'of'], 'right_of'],
  [['next', 'to'], 'next_to'],
  [['how', 'many'], 'how_many'],
  [['what', 'color'], 'what_color'],
  [['what', 'colour'], 'what_color'],
  [['is', 'there'], 'is_there'],
  [['are', 'there'], 'are_there'],
];

export function mergePhrases(words) {
  const out = [];
  for (let i = 0; i < words.length; ) {
    const hit = PHRASES.find(([phrase]) => phrase.every((word, k) => words[i + k] === word));
    if (hit) {
      out.push(hit[1]);
      i += hit[0].length;
    } else {
      out.push(words[i]);
      i += 1;
    }
  }
  return out;
}

const POLITE = new Set(['please', 'can', 'could', 'would', 'will', 'you', 'now', 'then']);

export function stripPoliteness(words) {
  let start = 0;
  while (start < words.length - 1 && POLITE.has(words[start])) start++;
  const end = words.at(-1) === 'please' ? words.length - 1 : words.length;
  return words.slice(start, end);
}

export const isKnown = (word, lookup) => Boolean(BUILT_IN[word] || lookup(word));

export function expandLearned(words, lookup, allowUncertain, depth = 0) {
  const result = { words: [], used: [], held: [] };
  for (const word of words) {
    const entry = BUILT_IN[word] ? null : lookup(word);
    if (!entry || depth > 4) {
      result.words.push(word);
      continue;
    }
    if (entry.status === 'uncertain' && !allowUncertain) {
      result.held.push(entry);
      result.words.push(word);
      continue;
    }
    const inner = expandLearned(tokenize(entry.meaning), lookup, allowUncertain, depth + 1);
    result.used.push(entry, ...inner.used);
    result.held.push(...inner.held);
    result.words.push(...inner.words);
  }
  return result;
}

export function classify(words) {
  return words.map((w) => {
    const known = BUILT_IN[w];
    return known ? { w, cat: known.cat, value: known.value } : { w, cat: 'unknown', value: null };
  });
}
