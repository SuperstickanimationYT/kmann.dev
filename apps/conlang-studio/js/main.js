import { mountAlphabet } from './alphabet-view.js';
import { el, find } from './dom.js';
import { mountGrammar } from './grammar-view.js';
import { blankLanguage, createStore, downloadFile, fileSafe } from './store.js';
import { mountWords } from './words-view.js';
import { mountWrite } from './write-view.js';

const TAB_KEY = 'conlang-studio-tab';

const store = createStore();
const views = {
  alphabet: mountAlphabet(find('[data-panel="alphabet"]'), store),
  words: mountWords(find('[data-panel="words"]'), store),
  grammar: mountGrammar(find('[data-panel="grammar"]'), store),
  write: mountWrite(find('[data-panel="write"]'), store),
};
let activeTab = 'alphabet';
try {
  activeTab = views[localStorage.getItem(TAB_KEY)] ? localStorage.getItem(TAB_KEY) : activeTab;
} catch {}

const picker = find('[data-language]');
const nameInput = find('[data-name]');
const importInput = find('[data-import-file]');

function renderToolbar() {
  picker.replaceChildren(...store.languages.map((language) => el('option', { value: language.id, selected: language.id === store.language.id }, language.name || 'Untitled')));
  nameInput.value = store.language.name;
}

function showTab(tab) {
  activeTab = tab;
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}
  for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
  views[tab]();
}

function render() {
  renderToolbar();
  showTab(activeTab);
}

picker.addEventListener('change', () => store.select(picker.value));
nameInput.addEventListener('input', () => {
  store.language.name = nameInput.value;
  store.save();
  picker.selectedOptions[0].textContent = nameInput.value || 'Untitled';
});
find('[data-new]').addEventListener('click', () => store.add(blankLanguage()));
find('[data-example]').addEventListener('click', () => store.addExample());
find('[data-delete]').addEventListener('click', () => {
  if (window.confirm(`Delete "${store.language.name}" and all its words and rules? Export it first if you want a copy.`)) store.removeCurrent();
});
find('[data-export]').addEventListener('click', () => downloadFile(`${fileSafe(store.language.name)}.conlang.json`, JSON.stringify(store.language, null, 2), 'application/json'));
find('[data-import]').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  try {
    const language = JSON.parse(await file.text());
    if (!language || !Array.isArray(language.words)) throw new Error('missing words');
    store.add(language);
  } catch {
    window.alert('That file isn\'t a Conlang Studio export.');
  }
});
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));

store.onChange(render);
render();
