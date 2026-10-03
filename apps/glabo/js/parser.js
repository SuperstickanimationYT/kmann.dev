import { categoryName } from './lexicon.js';

const leaf = (token) => ({ label: categoryName(token.cat), word: token.w });
const spanText = (tokens, from, to) => tokens.slice(from, to).map((token) => token.w).join(' ');

function modifier(tokens, i) {
  let j = i;
  const lead = [];
  if (tokens[j]?.w === 'that' || tokens[j]?.w === 'which') lead.push(tokens[j++]);
  if (tokens[j]?.w === 'is' || tokens[j]?.w === 'are') lead.push(tokens[j++]);
  const prep = tokens[j];
  if (prep?.cat !== 'prep') return [];
  return nounPhrase(tokens, j + 1).map(([np, end]) => [
    { label: 'PP', kids: [...lead.map(leaf), leaf(prep), np], sem: { prep: prep.value, np: np.sem } },
    end,
  ]);
}

export function nounPhrase(tokens, i) {
  const out = [];
  if (tokens[i]?.cat === 'pron') {
    out.push([{ label: 'NP', kids: [leaf(tokens[i])], sem: { pronoun: true, adjs: [], text: tokens[i].w } }, i + 1]);
  }
  let j = i;
  const det = tokens[j]?.cat === 'det' ? tokens[j++] : null;
  const adjs = [];
  while (tokens[j]?.cat === 'adj') adjs.push(tokens[j++]);
  const noun = tokens[j];
  if (noun?.cat !== 'noun') return out;
  j += 1;
  const base = {
    label: 'NP',
    kids: [det, ...adjs, noun].filter(Boolean).map(leaf),
    sem: { det: det?.value ?? null, adjs: adjs.map((adj) => adj.value), noun: noun.value, plural: /s$/.test(noun.w), text: spanText(tokens, i, j) },
  };
  out.push([base, j]);
  for (const [pp, end] of modifier(tokens, j)) {
    out.push([{ ...base, kids: [...base.kids, pp], sem: { ...base.sem, pp: pp.sem, text: spanText(tokens, i, end) } }, end]);
  }
  return out;
}

function match(pattern, tokens, i, bound, kids) {
  if (!pattern.length) return [{ bound, kids, end: i }];
  const [head, ...rest] = pattern;
  if (head.optional) return [...match(rest, tokens, i, bound, kids), ...match([...head.optional, ...rest], tokens, i, bound, kids)];
  if (head.np) {
    return nounPhrase(tokens, i).flatMap(([np, end]) => match(rest, tokens, end, { ...bound, [head.np]: np.sem }, [...kids, np]));
  }
  const token = tokens[i];
  if (!token) return [];
  if (head.words && head.words.includes(token.w)) return match(rest, tokens, i + 1, bound, [...kids, leaf(token)]);
  if (head.cat && token.cat === head.cat && (!head.value || head.value === token.value)) {
    const next = head.key ? { ...bound, [head.key]: token.value } : bound;
    return match(rest, tokens, i + 1, next, [...kids, leaf(token)]);
  }
  return [];
}

const np = (name) => ({ np: name });
const words = (...list) => ({ words: list });
const prep = { cat: 'prep', key: 'prep' };

export const GRAMMAR = [
  { id: 'G1', act: 'put', pattern: [{ cat: 'verb', value: 'put' }, np('thing'), { cat: 'prep', value: 'on' }, np('target')], shape: 'S → V(put) NP on NP' },
  { id: 'G2', act: 'take', pattern: [{ cat: 'verb', value: 'take' }, np('thing'), words('off'), { optional: [np('source')] }], shape: 'S → V(take) NP off [NP]' },
  { id: 'G3', act: 'clear', pattern: [{ cat: 'verb', value: 'clear' }, { optional: [words('off')] }, np('thing')], shape: 'S → V(clear) [off] NP' },
  { id: 'G4', act: 'list', pattern: [words('what'), words('is', 'are'), prep, np('ground')], shape: 'S → what is P NP' },
  { id: 'G5', act: 'which', pattern: [words('which'), np('kind'), words('is', 'are'), prep, np('ground')], shape: 'S → which NP is P NP' },
  { id: 'G6', act: 'where', pattern: [words('where'), words('is', 'are'), np('thing')], shape: 'S → where is NP' },
  { id: 'G7', act: 'check', pattern: [words('is', 'are'), np('thing'), prep, np('ground')], shape: 'S → is NP P NP' },
  { id: 'G8', act: 'exists', pattern: [words('is_there', 'are_there'), np('thing')], shape: 'S → is there NP' },
  { id: 'G9', act: 'count', pattern: [words('how_many'), np('thing'), { optional: [words('are_there', 'is_there')] }], shape: 'S → how many NP [are there]' },
  { id: 'G10', act: 'color', pattern: [words('what_color'), words('is', 'are'), np('thing')], shape: 'S → what color is NP' },
  { id: 'G11', act: 'property', pattern: [words('is', 'are'), np('thing'), { cat: 'adj', key: 'property' }], shape: 'S → is NP Adj' },
];

export function parseSentence(tokens) {
  return GRAMMAR.flatMap((rule) =>
    match(rule.pattern, tokens, 0, {}, [])
      .filter((result) => result.end === tokens.length)
      .map((result) => ({ rule, sem: result.bound, tree: { label: `S [${rule.id}]`, kids: result.kids } })),
  );
}

export function treeLines(node, prefix = '', isLast = true, isRoot = true) {
  const branch = isRoot ? '' : isLast ? '└─ ' : '├─ ';
  const line = prefix + branch + (node.word ? `${node.label} "${node.word}"` : node.label);
  const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
  const kids = node.kids ?? [];
  return [line, ...kids.flatMap((kid, k) => treeLines(kid, childPrefix, k === kids.length - 1, false))];
}
