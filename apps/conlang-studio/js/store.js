import { uid } from './dom.js';
import { exampleLanguage } from './example.js';

const STORAGE_KEY = 'conlang-studio';

export function blankLanguage(name = 'New language') {
  return {
    id: uid(),
    name,
    script: { mode: 'latin', direction: 'ltr' },
    letters: [],
    categories: [
      { symbol: 'C', members: 'p t k m n s l r' },
      { symbol: 'V', members: 'a e i o u' },
    ],
    syllables: 'CV CVC',
    wordOrder: 'SVO',
    words: [],
    rules: [],
  };
}

const text = (value) => (typeof value === 'string' ? value : '');
const list = (value) => (Array.isArray(value) ? value : []);

function normalized(language) {
  const blank = blankLanguage(text(language.name) || 'Imported language');
  return {
    ...blank,
    id: text(language.id) || blank.id,
    script: { ...blank.script, ...language.script },
    letters: list(language.letters).map((letter) => ({ id: text(letter.id) || uid(), roman: text(letter.roman), strokes: list(letter.strokes) })),
    categories: Array.isArray(language.categories) ? language.categories.map((category) => ({ symbol: text(category.symbol), members: text(category.members) })) : blank.categories,
    syllables: typeof language.syllables === 'string' ? language.syllables : blank.syllables,
    wordOrder: text(language.wordOrder) || blank.wordOrder,
    words: list(language.words).map((word) => ({ id: text(word.id) || uid(), roman: text(word.roman), meaning: text(word.meaning), pos: text(word.pos), notes: text(word.notes), irregular: word.irregular && typeof word.irregular === 'object' ? word.irregular : {} })),
    rules: list(language.rules).map((rule) => ({
      id: text(rule.id) || uid(),
      name: text(rule.name),
      tag: text(rule.tag),
      pos: text(rule.pos),
      cases: list(rule.cases).map((inflection) => ({ ending: text(inflection.ending), swap: Boolean(inflection.swap), replace: text(inflection.replace), prefix: text(inflection.prefix), suffix: text(inflection.suffix) })),
    })),
  };
}

function readSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.languages) && saved.languages.length) return saved;
  } catch {}
  const example = exampleLanguage(uid());
  return { current: example.id, languages: [example] };
}

export function createStore() {
  const state = readSaved();
  state.languages = state.languages.map(normalized);
  const listeners = new Set();

  const store = {
    get languages() {
      return state.languages;
    },
    get language() {
      return state.languages.find((language) => language.id === state.current) || state.languages[0];
    },
    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    },
    commit() {
      store.save();
      for (const listener of listeners) listener();
    },
    onChange(listener) {
      listeners.add(listener);
    },
    select(id) {
      state.current = id;
      store.commit();
    },
    add(language) {
      const added = normalized({ ...language, id: uid() });
      state.languages.push(added);
      store.select(added.id);
    },
    addExample() {
      store.add(exampleLanguage());
    },
    removeCurrent() {
      state.languages = state.languages.filter((language) => language.id !== store.language.id);
      if (!state.languages.length) state.languages.push(blankLanguage());
      store.select(state.languages[0].id);
    },
  };
  return store;
}

export function downloadFile(filename, text, type) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export const fileSafe = (name) => name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'language';
