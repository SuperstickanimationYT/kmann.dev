import { el } from './dom.js';
import { arrange, checkText, describeReading, glossLine, lookUp, paradigm } from './grammar.js';
import { renderScript, scriptSvg, unknownCharacters, usesDrawnScript } from './script.js';
import { downloadFile, fileSafe } from './store.js';

const ROLES = { S: 'Subject', V: 'Verb', O: 'Object' };

export function mountWrite(panel, store) {
  const language = () => store.language;
  const drafts = { lookup: '', gloss: 'cat.PL fish.ACC eat.PST', S: 'cat.PL', V: 'eat.PST', O: 'fish.ACC', check: '' };

  function output(text) {
    const current = language();
    return el(
      'div',
      { class: 'cl-output' },
      usesDrawnScript(current) && el('div', { class: 'cl-output-script' }, renderScript(text, current, { size: 44 })),
      el('div', { class: 'cl-output-roman' }, text),
      el(
        'div',
        { class: 'cl-actions cl-output-actions' },
        el('button', { type: 'button', onclick: () => navigator.clipboard?.writeText(text) }, 'Copy text'),
        usesDrawnScript(current) && el('button', { type: 'button', onclick: () => downloadFile(`${fileSafe(current.name)}-${fileSafe(text)}.svg`, scriptSvg(text, current, { height: 96, color: '#000' }), 'image/svg+xml') }, 'Download SVG'),
      ),
    );
  }

  function glossResult(results) {
    const errors = results.filter((result) => result.error);
    const text = results.map((result) => result.form ?? `[${result.token}]`).join(' ');
    return el(
      'div',
      {},
      results.length > 0 && output(text),
      el(
        'div',
        { class: 'cl-interlinear' },
        results.map((result) => el('span', { class: `cl-gloss-pair${result.error ? ' cl-bad' : ''}` }, el('strong', {}, result.form ?? '?'), el('small', {}, result.token))),
      ),
      errors.map((result) => el('p', { class: 'cl-warning' }, result.error)),
    );
  }

  function lookupSection() {
    const result = el('div');
    const input = el('input', { type: 'text', class: 'cl-input', value: drafts.lookup, placeholder: 'Meaning or word, e.g. cat', list: 'cl-meanings', autocomplete: 'off' });
    const show = () => {
      drafts.lookup = input.value;
      const current = language();
      const word = input.value.trim() && lookUp(input.value.trim(), current);
      if (!word) return result.replaceChildren(input.value.trim() ? el('p', { class: 'cl-warning' }, 'Not in the dictionary.') : '');
      const rows = [{ tags: [], form: word.roman }, ...paradigm(word, current)];
      const drawn = usesDrawnScript(current);
      result.replaceChildren(
        el('p', { class: 'cl-note' }, `${word.roman} — ${word.meaning}${word.pos ? ` (${word.pos})` : ''}`),
        el(
          'table',
          { class: 'cl-table' },
          el('thead', {}, el('tr', {}, el('th', {}, 'Form'), el('th', {}, 'Gloss'), drawn && el('th', {}, 'Script'))),
          el(
            'tbody',
            {},
            rows.map(({ tags, form }) =>
              el('tr', {}, el('td', { class: 'cl-strong' }, form, word.irregular?.[tags.join('.')] && el('span', { class: 'cl-dim' }, ' irregular')), el('td', { class: 'cl-dim' }, tags.length ? `${lookUpGloss(word)}.${tags.join('.')}` : lookUpGloss(word)), drawn && el('td', {}, renderScript(form, current, { size: 26 }))),
            ),
          ),
        ),
      );
    };
    input.addEventListener('input', show);
    show();
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Every form of a word'),
      input,
      el('datalist', { id: 'cl-meanings' }, language().words.map((word) => el('option', { value: word.meaning.split(/[,;/]/)[0].trim() || word.roman }))),
      result,
    );
  }

  const lookUpGloss = (word) => (word.meaning.split(/[,;/]/)[0].trim() || word.roman).replace(/\s+/g, '_');

  function glossSection() {
    const result = el('div');
    const input = el('input', { type: 'text', class: 'cl-input', value: drafts.gloss, autocomplete: 'off', 'aria-label': 'Gloss' });
    const show = () => ((drafts.gloss = input.value), result.replaceChildren(glossResult(glossLine(input.value, language()))));
    input.addEventListener('input', show);
    show();
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Translate a gloss'),
      el('p', { class: 'cl-note' }, 'Type English meanings in your language\'s word order, with tags after dots: ', el('code', {}, 'I.ACC see.PST'), '. Use _ for multi-word meanings.'),
      input,
      result,
    );
  }

  function sentenceSection() {
    const current = language();
    const result = el('div');
    const inputs = {};
    const show = () => {
      for (const role of Object.keys(ROLES)) drafts[role] = inputs[role].value;
      const arranged = arrange(Object.fromEntries(Object.keys(ROLES).map((role) => [role, inputs[role].value])), current.wordOrder);
      result.replaceChildren(el('p', { class: 'cl-note' }, `Arranged ${current.wordOrder}: `, el('code', {}, arranged || '—')), glossResult(glossLine(arranged, current)));
    };
    for (const role of current.wordOrder) inputs[role] = el('input', { type: 'text', class: 'cl-input', value: drafts[role], autocomplete: 'off', oninput: show });
    show();
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Sentence builder'),
      el('div', { class: 'cl-sentence' }, [...current.wordOrder].map((role) => el('label', { class: 'cl-field' }, el('span', {}, ROLES[role]), inputs[role]))),
      el('p', { class: 'cl-note' }, 'Each slot takes a gloss; it can be several words, like ', el('code', {}, 'big cat.PL'), '. Word order is set on the Grammar tab.'),
      result,
    );
  }

  function checkSection() {
    const result = el('div', { class: 'cl-checked', 'aria-live': 'polite' });
    const input = el('textarea', { class: 'cl-input', rows: 3, placeholder: 'Type in your language to check it', 'aria-label': 'Text to check' });
    input.value = drafts.check;
    const show = () => {
      drafts.check = input.value;
      const pieces = checkText(input.value, language());
      const words = pieces.filter((piece) => piece.readings || piece.unknown);
      const unknown = words.filter((piece) => piece.unknown);
      result.replaceChildren(
        el(
          'p',
          { class: 'cl-marked' },
          pieces.map((piece) => {
            if (!piece.readings && !piece.unknown) return piece.text;
            if (piece.readings) return el('span', { class: `cl-known${piece.fits ? '' : ' cl-shape'}`, title: piece.readings.map(describeReading).join('\n') }, piece.text);
            return el('span', { class: 'cl-unknown', title: 'Not a known word or form' }, piece.text);
          }),
        ),
        words.length ? el('p', { class: 'cl-note' }, unknown.length ? `${unknown.length} of ${words.length} words not recognised.` : `All ${words.length} words recognised. Hover a word to see what it means.`) : '',
        el(
          'ul',
          { class: 'cl-help' },
          unknown.map((piece) =>
            el(
              'li',
              {},
              el('strong', {}, piece.text),
              piece.suggestions.length ? ' — did you mean ' : ' — no close match in the dictionary.',
              piece.suggestions.map(({ form, readings }, index) => [index ? ', ' : '', el('button', { type: 'button', class: 'cl-link', title: readings.map(describeReading).join('\n'), onclick: () => ((input.value = input.value.replace(piece.text, form)), show()) }, form), el('span', { class: 'cl-dim' }, ` (${readings.map(describeReading)[0]})`)]),
              !piece.fits && ' It also breaks your syllable shapes.',
              unknownCharacters(piece.text, language().letters).length > 0 && ` Not in your alphabet: ${unknownCharacters(piece.text, language().letters).join(' ')}.`,
            ),
          ),
          words.filter((piece) => piece.readings && !piece.fits).map((piece) => el('li', {}, el('strong', {}, piece.text), ' is known but breaks your syllable shapes.')),
        ),
      );
    };
    input.addEventListener('input', show);
    show();
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Check writing'),
      el('p', { class: 'cl-note' }, 'Recognises dictionary words and every form your rules make (up to two tags). Unknown words are underlined in red, with the closest correct spellings.'),
      input,
      result,
    );
  }

  return function render() {
    panel.replaceChildren(el('div', { class: 'cl-columns cl-columns-even' }, el('div', { class: 'cl-stack' }, glossSection(), sentenceSection()), el('div', { class: 'cl-stack' }, checkSection(), lookupSection())));
  };
}
