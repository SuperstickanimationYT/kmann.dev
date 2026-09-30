import { createDrawpad } from './drawpad.js';
import { el, uid } from './dom.js';
import { glyphSvg, usesDrawnScript } from './script.js';

const DIRECTIONS = { ltr: 'Left to right', rtl: 'Right to left', ttb: 'Top to bottom' };

export function mountAlphabet(panel, store) {
  let selectedId = null;
  const language = () => store.language;
  const selected = () => language().letters.find((letter) => letter.id === selectedId);

  const tiles = el('div', { class: 'cl-tiles' });
  const romanInput = el('input', { type: 'text', class: 'cl-input', placeholder: 'e.g. sh', 'aria-label': 'Romanization' });
  const canvas = el('canvas', { class: 'cl-drawpad', 'aria-label': 'Draw the glyph here' });
  const drawpad = createDrawpad(canvas, (strokes) => {
    const letter = selected();
    if (!letter) return;
    letter.strokes = strokes;
    store.save();
    refreshTile(letter);
  });

  const editor = el(
    'fieldset',
    { class: 'cl-editor' },
    el('legend', {}, 'Draw glyph'),
    el('label', { class: 'cl-field' }, el('span', {}, 'Written in Latin letters as'), romanInput),
    canvas,
    el(
      'div',
      { class: 'cl-actions' },
      el('button', { type: 'button', onclick: () => drawpad.undo() }, 'Undo stroke'),
      el('button', { type: 'button', onclick: () => drawpad.clear() }, 'Clear'),
      el('button', { type: 'button', onclick: removeSelected }, 'Delete letter'),
    ),
    el('div', { class: 'cl-actions' }, el('button', { type: 'button', class: 'cl-primary', onclick: nextBlank }, 'Next undrawn letter →')),
    el('p', { class: 'cl-note' }, 'Dashed lines are guides: top, middle and baseline. Glyphs are spaced by how wide you draw them.'),
  );

  romanInput.addEventListener('input', () => {
    const letter = selected();
    if (!letter) return;
    letter.roman = romanInput.value.trim().toLowerCase();
    store.save();
    refreshTile(letter);
  });

  const addInput = el('input', { type: 'text', class: 'cl-input', placeholder: 'a e i o u k t sh th', 'aria-label': 'Letters to add' });
  const addLetters = () => {
    const existing = new Set(language().letters.map((letter) => letter.roman));
    const fresh = addInput.value.toLowerCase().split(/[\s,]+/).filter((roman) => roman && !existing.has(roman));
    for (const roman of new Set(fresh)) language().letters.push({ id: uid(), roman, strokes: [] });
    addInput.value = '';
    if (!selectedId && language().letters.length) selectedId = language().letters[0].id;
    store.commit();
  };
  addInput.addEventListener('keydown', (event) => event.key === 'Enter' && (event.preventDefault(), addLetters()));

  function removeSelected() {
    language().letters = language().letters.filter((letter) => letter.id !== selectedId);
    selectedId = language().letters[0]?.id ?? null;
    store.commit();
  }

  function nextBlank() {
    const letters = language().letters;
    const start = letters.findIndex((letter) => letter.id === selectedId);
    const ordered = [...letters.slice(start + 1), ...letters.slice(0, start + 1)];
    const next = ordered.find((letter) => !letter.strokes.length) || ordered[0];
    if (next) select(next.id);
  }

  function select(id) {
    selectedId = id;
    const letter = selected();
    for (const tile of tiles.children) tile.setAttribute('aria-pressed', String(tile.dataset.id === id));
    romanInput.value = letter?.roman ?? '';
    drawpad.load(letter?.strokes ?? []);
  }

  function tileFor(letter) {
    const drawn = usesDrawnScript(language());
    const tile = el('button', { type: 'button', class: 'cl-tile', 'data-id': letter.id, 'aria-pressed': String(letter.id === selectedId), onclick: () => (drawn ? select(letter.id) : null) });
    fillTile(tile, letter);
    return tile;
  }

  function fillTile(tile, letter) {
    tile.replaceChildren();
    if (usesDrawnScript(language())) {
      const glyph = el('span', { class: 'cl-tile-glyph' });
      glyph.innerHTML = letter.strokes.length ? glyphSvg(letter, 40) : '<span class="cl-missing">?</span>';
      tile.append(glyph);
    }
    tile.append(el('span', { class: 'cl-tile-roman' }, letter.roman || '—'));
    if (!usesDrawnScript(language())) tile.append(el('span', { class: 'cl-tile-remove', title: `Remove ${letter.roman}`, onclick: () => ((selectedId = letter.id), removeSelected()) }, '×'));
  }

  function refreshTile(letter) {
    const tile = tiles.querySelector(`[data-id="${letter.id}"]`);
    if (tile) fillTile(tile, letter);
  }

  function scriptSettings() {
    const current = language();
    const modeButton = (mode, label) =>
      el('button', { type: 'button', 'aria-pressed': String(current.script.mode === mode), onclick: () => ((current.script.mode = mode), store.commit()) }, label);
    const direction = el('select', { class: 'cl-input', onchange: (event) => ((current.script.direction = event.target.value), store.commit()) }, Object.entries(DIRECTIONS).map(([value, label]) => el('option', { value, selected: current.script.direction === value }, label)));
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Script'),
      el('div', { class: 'cl-actions cl-toggle-pair' }, modeButton('latin', 'Latin letters'), modeButton('custom', 'Draw my own')),
      usesDrawnScript(current) && el('label', { class: 'cl-field' }, el('span', {}, 'Writing direction'), direction),
      el('p', { class: 'cl-note' }, usesDrawnScript(current) ? 'Each letter gets a glyph you draw and a Latin spelling you type with. Letters can be several characters, like "sh"; the longest match wins.' : 'Your language is written with Latin letters. List the ones it uses and the checker flags any others. Leave the list empty to allow every letter.'),
    );
  }

  function soundSettings() {
    const current = language();
    const rows = current.categories.map((category, index) =>
      el(
        'div',
        { class: 'cl-category' },
        el('input', { type: 'text', class: 'cl-input cl-symbol', value: category.symbol, maxlength: 1, 'aria-label': 'Category symbol', oninput: (event) => ((category.symbol = event.target.value.toUpperCase()), store.save()) }),
        el('input', { type: 'text', class: 'cl-input', value: category.members, 'aria-label': `Members of ${category.symbol}`, oninput: (event) => ((category.members = event.target.value.toLowerCase()), store.save()) }),
        el('button', { type: 'button', class: 'cl-icon', title: 'Remove category', onclick: () => (current.categories.splice(index, 1), store.commit()) }, '×'),
      ),
    );
    return el(
      'fieldset',
      {},
      el('legend', {}, 'Sounds'),
      el('p', { class: 'cl-note' }, 'Name groups of sounds with one capital letter (C = consonants, V = vowels, N = nasals…). Syllable shapes and grammar rules can use them.'),
      rows,
      el('div', { class: 'cl-actions' }, el('button', { type: 'button', onclick: () => (current.categories.push({ symbol: '', members: '' }), store.commit()) }, 'Add category')),
      el(
        'label',
        { class: 'cl-field' },
        el('span', {}, 'Allowed syllable shapes'),
        el('input', { type: 'text', class: 'cl-input', value: current.syllables, placeholder: 'CV CVC V', oninput: (event) => ((current.syllables = event.target.value), store.save()) }),
      ),
      el('p', { class: 'cl-note' }, 'Words must be built from these shapes. The generator follows them and the checker warns about words that break them. Leave empty to skip.'),
    );
  }

  return function render() {
    const current = language();
    if (!current.letters.some((letter) => letter.id === selectedId)) selectedId = current.letters[0]?.id ?? null;
    tiles.replaceChildren(...current.letters.map(tileFor));
    const drawn = usesDrawnScript(current);
    panel.replaceChildren(
      el(
        'div',
        { class: 'cl-columns' },
        el(
          'div',
          { class: 'cl-stack' },
          el(
            'fieldset',
            {},
            el('legend', {}, `Letters (${current.letters.length})`),
            el('div', { class: 'cl-inline' }, addInput, el('button', { type: 'button', class: 'cl-primary', onclick: addLetters }, 'Add')),
            current.letters.length ? tiles : el('p', { class: 'cl-note' }, 'No letters yet. Type them above, separated by spaces.'),
            drawn && current.letters.length > 0 && el('p', { class: 'cl-note' }, 'Click a letter to draw its glyph. A "?" means it has none yet.'),
          ),
          soundSettings(),
        ),
        el('div', { class: 'cl-stack' }, scriptSettings(), drawn && selectedId && editor),
      ),
    );
    if (drawn && selectedId) select(selectedId);
  };
}
