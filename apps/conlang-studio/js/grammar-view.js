import { el, uid } from './dom.js';
import { applyRule, ruleAppliesTo, WORD_ORDERS } from './grammar.js';

const PREVIEW_WORDS = 4;
const ORDER_EXAMPLES = { S: 'the cat', V: 'sees', O: 'the fish' };
const blankCase = () => ({ ending: '', swap: false, replace: '', prefix: '', suffix: '' });

export function mountGrammar(panel, store) {
  const language = () => store.language;

  function previewOf(rule) {
    const words = language().words.filter((word) => ruleAppliesTo(rule, word)).slice(0, PREVIEW_WORDS);
    if (!words.length) return el('p', { class: 'cl-note' }, `No ${rule.pos || ''} words in the dictionary to try it on.`);
    return el(
      'ul',
      { class: 'cl-preview-list' },
      words.map((word) => el('li', {}, el('span', { class: 'cl-dim' }, `${word.roman} → `), el('strong', {}, word.irregular?.[rule.tag] ?? applyRule(word.roman, rule, language())), word.irregular?.[rule.tag] && el('span', { class: 'cl-dim' }, ' (irregular)'))),
    );
  }

  function caseRow(rule, inflection, index, refresh) {
    const input = (key, label, width) =>
      el('input', { type: 'text', class: `cl-input ${width}`, value: inflection[key], 'aria-label': label, placeholder: '—', oninput: (event) => ((inflection[key] = event.target.value.trim()), store.save(), refresh()) });
    const swapToggle = el('input', { type: 'checkbox', checked: inflection.swap, 'aria-label': 'Change the ending', onchange: (event) => ((inflection.swap = event.target.checked), (replace.disabled = !inflection.swap), store.save(), refresh()) });
    const replace = input('replace', 'New ending', 'cl-narrow');
    replace.disabled = !inflection.swap;
    return el(
      'div',
      { class: 'cl-case' },
      el('span', { class: 'cl-case-label' }, index ? 'else if it ends in' : 'If it ends in'),
      input('ending', 'Ending to match', 'cl-narrow'),
      el('label', { class: 'cl-case-label cl-swap' }, swapToggle, 'change it to'),
      replace,
      el('span', { class: 'cl-case-label' }, 'then add prefix'),
      input('prefix', 'Prefix', 'cl-narrow'),
      el('span', { class: 'cl-case-label' }, '…'),
      input('suffix', 'Suffix', 'cl-narrow'),
      el('button', { type: 'button', class: 'cl-icon', title: 'Remove this case', onclick: () => (rule.cases.splice(index, 1), store.commit()) }, '×'),
    );
  }

  function ruleCard(rule, index) {
    const current = language();
    const preview = el('div');
    const refresh = () => preview.replaceChildren(previewOf(rule));
    refresh();
    const text = (key, label, placeholder, transform = (value) => value) =>
      el('label', { class: 'cl-field' }, el('span', {}, label), el('input', { type: 'text', class: 'cl-input', value: rule[key], placeholder, oninput: (event) => ((rule[key] = transform(event.target.value)), store.save(), refresh()) }));
    return el(
      'fieldset',
      { class: 'cl-rule' },
      el('legend', {}, rule.name || 'Unnamed rule'),
      el('div', { class: 'cl-rule-head' }, text('name', 'Name', 'Plural'), text('tag', 'Gloss tag', 'PL', (value) => value.trim().toUpperCase()), text('pos', 'Applies to', 'noun (empty = all)', (value) => value.toLowerCase())),
      el('div', { class: 'cl-cases' }, rule.cases.map((inflection, caseIndex) => caseRow(rule, inflection, caseIndex, refresh))),
      el(
        'div',
        { class: 'cl-actions' },
        el('button', { type: 'button', onclick: () => (rule.cases.push(blankCase()), store.commit()) }, 'Add case'),
        index > 0 && el('button', { type: 'button', onclick: () => (current.rules.splice(index - 1, 0, ...current.rules.splice(index, 1)), store.commit()) }, 'Move up'),
        el('button', { type: 'button', onclick: () => ((current.rules = current.rules.filter((other) => other !== rule)), store.commit()) }, 'Delete rule'),
      ),
      preview,
    );
  }

  return function render() {
    const current = language();
    const orderSelect = el(
      'select',
      { class: 'cl-input', onchange: (event) => ((current.wordOrder = event.target.value), store.commit()) },
      WORD_ORDERS.map((order) => el('option', { value: order, selected: current.wordOrder === order }, `${order} — ${[...order].map((role) => ORDER_EXAMPLES[role]).join(' ')}`)),
    );
    panel.replaceChildren(
      el(
        'div',
        { class: 'cl-columns cl-columns-wide' },
        el(
          'div',
          { class: 'cl-stack' },
          current.rules.map(ruleCard),
          el(
            'div',
            { class: 'cl-actions' },
            el('button', { type: 'button', class: 'cl-primary', onclick: () => (current.rules.push({ id: uid(), name: '', tag: '', pos: '', cases: [blankCase()] }), store.commit()) }, 'Add a rule'),
          ),
        ),
        el(
          'div',
          { class: 'cl-stack' },
          el('fieldset', {}, el('legend', {}, 'Word order'), orderSelect, el('p', { class: 'cl-note' }, 'The sentence builder on the Write tab puts subject, verb and object in this order.')),
          el(
            'fieldset',
            {},
            el('legend', {}, 'How rules work'),
            el(
              'ul',
              { class: 'cl-help' },
              el('li', {}, 'A rule turns a dictionary word into another form, like a plural or past tense. Its gloss tag (PL, PST…) is how you ask for it: ', el('code', {}, 'cat.PL'), '.'),
              el('li', {}, 'Cases are tried top to bottom and the first match wins. Leave "ends in" empty for "anything else".'),
              el('li', {}, 'Endings can use sound categories: ', el('code', {}, 'V'), ' matches any vowel, ', el('code', {}, 'Ca'), ' a consonant then "a".'),
              el('li', {}, 'Tick "change it to" to replace the matched ending; leave the box after it empty to just remove it.'),
              el('li', {}, 'Stack tags to apply rules in order: ', el('code', {}, 'cat.PL.ACC'), '. Words with irregular forms (', el('code', {}, 'PL=mice'), ') skip the rule.'),
            ),
          ),
        ),
      ),
    );
  };
}
