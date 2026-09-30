import { el, uid } from './dom.js';
import { generateWords } from './generator.js';
import { fitsSyllables } from './grammar.js';
import { renderScript, unknownCharacters, usesDrawnScript } from './script.js';

const PARTS_OF_SPEECH = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'particle', 'number'];

const irregularText = (irregular = {}) =>
  Object.entries(irregular)
    .map(([tags, form]) => `${tags}=${form}`)
    .join('; ');

function parseIrregular(text) {
  const irregular = {};
  for (const pair of text.split(';')) {
    const [tags, form] = pair.split('=').map((part) => part?.trim());
    if (tags && form) irregular[tags.toUpperCase()] = form.toLowerCase();
  }
  return irregular;
}

export function mountWords(panel, store) {
  let editingId = null;
  let filter = '';
  let candidates = [];
  const language = () => store.language;

  const fields = {
    roman: el('input', { type: 'text', class: 'cl-input', placeholder: 'tala', autocomplete: 'off' }),
    meaning: el('input', { type: 'text', class: 'cl-input', placeholder: 'house, home', autocomplete: 'off' }),
    pos: el('input', { type: 'text', class: 'cl-input', placeholder: 'noun', list: 'cl-pos-list', autocomplete: 'off' }),
    irregular: el('input', { type: 'text', class: 'cl-input', placeholder: 'PL=kanten; PST=went', autocomplete: 'off' }),
    notes: el('input', { type: 'text', class: 'cl-input', autocomplete: 'off' }),
  };
  const warning = el('p', { class: 'cl-warning', 'aria-live': 'polite' });
  const preview = el('div', { class: 'cl-preview' });
  const submit = el('button', { type: 'submit', class: 'cl-primary' }, 'Add word');
  const cancel = el('button', { type: 'button', onclick: () => startEditing(null) }, 'Cancel');

  function checkDraft() {
    const roman = fields.roman.value.trim().toLowerCase();
    const problems = [];
    const stray = unknownCharacters(roman, language().letters);
    if (stray.length) problems.push(`Not in your alphabet: ${stray.join(' ')}`);
    if (roman && !fitsSyllables(roman, language())) problems.push(`Doesn't fit your syllable shapes (${language().syllables})`);
    const clash = language().words.find((word) => word.roman === roman && word.id !== editingId);
    if (clash) problems.push(`Already in the dictionary as "${clash.meaning}"`);
    warning.textContent = problems.join(' · ');
    preview.replaceChildren(roman && usesDrawnScript(language()) ? renderScript(roman, language(), { size: 36 }) : '');
  }
  fields.roman.addEventListener('input', checkDraft);

  const form = el(
    'form',
    {
      class: 'cl-word-form',
      onsubmit: (event) => {
        event.preventDefault();
        const roman = fields.roman.value.trim().toLowerCase();
        if (!roman) return fields.roman.focus();
        const entry = { roman, meaning: fields.meaning.value.trim(), pos: fields.pos.value.trim().toLowerCase(), irregular: parseIrregular(fields.irregular.value), notes: fields.notes.value.trim() };
        const existing = language().words.find((word) => word.id === editingId);
        if (existing) Object.assign(existing, entry);
        else language().words.push({ id: uid(), ...entry });
        candidates = candidates.filter((candidate) => candidate !== roman);
        startEditing(null, { keepPos: !existing });
        store.commit();
        fields.roman.focus();
      },
    },
    el('label', { class: 'cl-field' }, el('span', {}, 'Word'), fields.roman),
    el('label', { class: 'cl-field' }, el('span', {}, 'Meaning'), fields.meaning),
    el('label', { class: 'cl-field' }, el('span', {}, 'Part of speech'), fields.pos),
    el('label', { class: 'cl-field' }, el('span', {}, 'Irregular forms'), fields.irregular),
    el('label', { class: 'cl-field cl-wide' }, el('span', {}, 'Notes'), fields.notes),
    el('div', { class: 'cl-actions cl-wide' }, submit, cancel),
    el('div', { class: 'cl-wide' }, preview, warning),
    el('datalist', { id: 'cl-pos-list' }, PARTS_OF_SPEECH.map((pos) => el('option', { value: pos }))),
  );

  function startEditing(id, { keepPos = false } = {}) {
    editingId = id;
    const word = language().words.find((candidate) => candidate.id === id);
    const pos = fields.pos.value;
    fields.roman.value = word?.roman ?? '';
    fields.meaning.value = word?.meaning ?? '';
    fields.pos.value = word?.pos ?? (keepPos ? pos : '');
    fields.irregular.value = irregularText(word?.irregular);
    fields.notes.value = word?.notes ?? '';
    submit.textContent = word ? 'Save changes' : 'Add word';
    cancel.hidden = !word;
    checkDraft();
    if (word) fields.roman.focus();
  }

  const generator = { count: 12, minSyllables: 1, maxSyllables: 3 };
  const numberField = (key, label, max) =>
    el('label', { class: 'cl-field cl-small' }, el('span', {}, label), el('input', { type: 'number', class: 'cl-input', min: 1, max, value: generator[key], oninput: (event) => (generator[key] = Math.max(1, Math.min(max, Number(event.target.value) || 1))) }));

  const candidateList = el('div', { class: 'cl-chips' });
  function showCandidates() {
    candidateList.replaceChildren(
      ...candidates.map((roman) =>
        el('button', { type: 'button', class: 'cl-chip', title: 'Use this word', onclick: () => (startEditing(null, { keepPos: true }), (fields.roman.value = roman), checkDraft(), fields.meaning.focus()) }, roman),
      ),
    );
  }

  const generatorBox = el(
    'fieldset',
    {},
    el('legend', {}, 'Word generator'),
    el('p', { class: 'cl-note' }, 'Makes random words from your sounds and syllable shapes (Alphabet tab). Click one to give it a meaning.'),
    el('div', { class: 'cl-inline' }, numberField('count', 'How many', 60), numberField('minSyllables', 'Min syllables', 6), numberField('maxSyllables', 'Max syllables', 6)),
    el(
      'div',
      { class: 'cl-actions' },
      el(
        'button',
        {
          type: 'button',
          class: 'cl-primary',
          onclick: () => {
            const range = [generator.minSyllables, generator.maxSyllables].sort((a, b) => a - b);
            candidates = generateWords(language(), { count: generator.count, minSyllables: range[0], maxSyllables: range[1] });
            showCandidates();
          },
        },
        'Generate',
      ),
    ),
    candidateList,
  );

  const search = el('input', { type: 'search', class: 'cl-input', placeholder: 'Search words or meanings', 'aria-label': 'Search dictionary' });
  const table = el('div', { class: 'cl-table-wrap' });
  search.addEventListener('input', () => ((filter = search.value.trim().toLowerCase()), renderTable()));

  function renderTable() {
    const current = language();
    const words = current.words
      .filter((word) => !filter || word.roman.includes(filter) || word.meaning.toLowerCase().includes(filter) || word.pos.includes(filter))
      .sort((a, b) => a.roman.localeCompare(b.roman));
    const drawn = usesDrawnScript(current);
    table.replaceChildren(
      words.length
        ? el(
            'table',
            { class: 'cl-table' },
            el('thead', {}, el('tr', {}, drawn && el('th', {}, 'Script'), el('th', {}, 'Word'), el('th', {}, 'Meaning'), el('th', {}, 'Type'), el('th', {}, 'Irregular'), el('th', {}, ''))),
            el(
              'tbody',
              {},
              words.map((word) =>
                el(
                  'tr',
                  { class: word.id === editingId ? 'cl-editing' : '' },
                  drawn && el('td', {}, renderScript(word.roman, current, { size: 26 })),
                  el('td', { class: 'cl-strong' }, word.roman),
                  el('td', {}, word.meaning, word.notes && el('span', { class: 'cl-dim' }, ` — ${word.notes}`)),
                  el('td', { class: 'cl-dim' }, word.pos),
                  el('td', { class: 'cl-dim' }, irregularText(word.irregular)),
                  el(
                    'td',
                    { class: 'cl-row-actions' },
                    el('button', { type: 'button', class: 'cl-icon', title: 'Edit', onclick: () => (startEditing(word.id), renderTable()) }, '✎'),
                    el('button', { type: 'button', class: 'cl-icon', title: 'Delete', onclick: () => ((current.words = current.words.filter((other) => other !== word)), editingId === word.id && startEditing(null), store.commit()) }, '×'),
                  ),
                ),
              ),
            ),
          )
        : el('p', { class: 'cl-note' }, current.words.length ? 'No words match.' : 'The dictionary is empty. Add a word above or generate some.'),
    );
  }

  return function render() {
    if (!language().words.some((word) => word.id === editingId)) startEditing(null, { keepPos: true });
    checkDraft();
    showCandidates();
    renderTable();
    panel.replaceChildren(
      el(
        'div',
        { class: 'cl-columns cl-columns-wide' },
        el(
          'div',
          { class: 'cl-stack' },
          el('fieldset', {}, el('legend', {}, 'Add a word'), form),
          el('fieldset', {}, el('legend', {}, `Dictionary (${language().words.length})`), search, table),
        ),
        el('div', { class: 'cl-stack' }, generatorBox),
      ),
    );
  };
}
