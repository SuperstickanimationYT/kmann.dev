const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const splitList = (text) => text.split(/[\s,]+/).filter(Boolean);
const MAX_SUGGESTIONS = 3;

export const WORD_ORDERS = ['SVO', 'SOV', 'VSO', 'VOS', 'OVS', 'OSV'];

function categoryMap(categories) {
  const map = new Map();
  for (const { symbol, members } of categories) {
    const list = splitList(members).sort((a, b) => b.length - a.length);
    if (symbol && list.length) map.set(symbol, `(?:${list.map(escapeRegex).join('|')})`);
  }
  return map;
}

export function patternSource(pattern, categories) {
  const map = categoryMap(categories);
  return [...pattern.replace(/\s+/g, '')].map((character) => map.get(character) ?? escapeRegex(character.toLowerCase())).join('');
}

export function syllableRegex(language) {
  const shapes = splitList(language.syllables);
  if (!shapes.length) return null;
  return new RegExp(`^(?:${shapes.map((shape) => patternSource(shape, language.categories)).join('|')})+$`);
}

export function fitsSyllables(word, language) {
  const regex = syllableRegex(language);
  return !regex || regex.test(word.toLowerCase());
}

export const posList = (rule) => splitList(rule.pos.toLowerCase());
export const ruleAppliesTo = (rule, word) => !posList(rule).length || posList(rule).includes(word.pos.trim().toLowerCase());

export function applyRule(form, rule, language) {
  for (const inflection of rule.cases) {
    const ending = inflection.ending.trim();
    const match = ending ? new RegExp(`(${patternSource(ending, language.categories)})$`).exec(form) : null;
    if (ending && !match) continue;
    const stem = match && inflection.swap ? form.slice(0, match.index) + inflection.replace : form;
    return `${inflection.prefix}${stem}${inflection.suffix}`;
  }
  return form;
}

export function formOf(word, tags, language) {
  const combined = tags.join('.');
  if (word.irregular?.[combined]) return word.irregular[combined];
  let form = word.roman;
  for (const [index, tag] of tags.entries()) {
    const soFar = tags.slice(0, index + 1).join('.');
    if (word.irregular?.[soFar]) {
      form = word.irregular[soFar];
      continue;
    }
    const rule = language.rules.find((candidate) => candidate.tag.toUpperCase() === tag.toUpperCase());
    if (!rule) throw new Error(`No rule is tagged ${tag}`);
    if (!ruleAppliesTo(rule, word)) throw new Error(`${rule.name} (${rule.tag}) doesn't apply to ${word.pos || 'untyped'} words like "${word.roman}"`);
    form = applyRule(form, rule, language);
  }
  return form;
}

const meanings = (word) => word.meaning.toLowerCase().split(/[,;/]/).map((meaning) => meaning.trim().replace(/^to /, '')).filter(Boolean);

export function lookUp(lemma, language) {
  const wanted = lemma.toLowerCase().replace(/^to /, '').replace(/_/g, ' ');
  return language.words.find((word) => meanings(word).includes(wanted)) || language.words.find((word) => word.roman.toLowerCase() === wanted);
}

export function glossWord(token, language) {
  const [lemma, ...tags] = token.split('.');
  const word = lookUp(lemma, language);
  if (!word) return { token, error: `No word means "${lemma}"` };
  try {
    return { token, word, tags, form: formOf(word, tags, language) };
  } catch (error) {
    return { token, word, tags, error: error.message };
  }
}

export const glossLine = (text, language) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => glossWord(token, language));

export function arrange(parts, order) {
  return [...order].map((role) => parts[role]).filter((part) => part && part.trim()).join(' ');
}

export function tagCombinations(word, language) {
  const tags = language.rules.filter((rule) => ruleAppliesTo(rule, word)).map((rule) => rule.tag).filter(Boolean);
  const combinations = tags.map((tag) => [tag]);
  for (const first of tags) for (const second of tags) if (first !== second) combinations.push([first, second]);
  for (const key of Object.keys(word.irregular || {})) if (!combinations.some((tagsSoFar) => tagsSoFar.join('.') === key)) combinations.push(key.split('.'));
  return combinations;
}

export function paradigm(word, language) {
  const rows = [];
  for (const tags of tagCombinations(word, language)) {
    try {
      rows.push({ tags, form: formOf(word, tags, language) });
    } catch {}
  }
  return rows;
}

function everyForm(language) {
  const forms = new Map();
  const note = (form, entry) => {
    const key = form.toLowerCase();
    if (!forms.has(key)) forms.set(key, []);
    forms.get(key).push(entry);
  };
  for (const word of language.words) {
    note(word.roman, { word, tags: [] });
    for (const { tags, form } of paradigm(word, language)) note(form, { word, tags });
  }
  return forms;
}

export function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

export function checkText(text, language) {
  const forms = everyForm(language);
  return text.split(/(\s+|[.,!?;:"()]+)/).map((piece) => {
    if (!piece || !/\p{L}/u.test(piece)) return { text: piece };
    const readings = forms.get(piece.toLowerCase());
    if (readings) return { text: piece, readings, fits: fitsSyllables(piece, language) };
    const limit = Math.max(1, Math.floor(piece.length / 3));
    const suggestions = [...forms.keys()]
      .map((form) => ({ form, distance: editDistance(piece.toLowerCase(), form) }))
      .filter(({ distance }) => distance <= limit)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_SUGGESTIONS)
      .map(({ form }) => ({ form, readings: forms.get(form) }));
    return { text: piece, unknown: true, suggestions, fits: fitsSyllables(piece, language) };
  });
}

export const describeReading = ({ word, tags }) => `${word.meaning}${tags.length ? `.${tags.join('.')}` : ''} (${word.roman})`;
