import { createConversation } from './conversation.js';
import { simulateConversation } from './crowd.js';
import { el, find } from './dom.js';
import { DEFAULT_SETTINGS, createKnowledge } from './knowledge.js';
import { createRenderer } from './render.js';
import { mountChat, mountCrowd, renderKnowledge, renderTrace } from './views.js';
import { createWorld, isValidStacks } from './world.js';

const STORAGE_KEY = 'glabo';
const TAB_KEY = 'glabo-tab';
const AUTO_MS = 350;
const EXAMPLES = [
  'what is on the big blue cube?',
  'put the small red cube on the big yellow cube',
  'put the red cube on the table',
  'put the crimson pyramid on the table',
  'a steeple is a pyramid on a cube',
  'how many steeples are there?',
  "that's wrong",
  'why?',
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

const saved = load();
const knowledge = createKnowledge(saved.knowledge);
let settings = { ...DEFAULT_SETTINGS, ...saved.settings };
let world = createWorld(isValidStacks(saved.stacks) ? saved.stacks : undefined);
const crowdStats = { total: 0, taught: 0, tested: 0, held: 0 };

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ knowledge: knowledge.serialize(), settings, stacks: world.stacks }));
  } catch {}
}

const renderer = createRenderer(find('[data-stage]'));
renderer.show(world.stacks);

const conversation = createConversation({
  knowledge,
  getWorld: () => world,
  setWorld(next, snapshots) {
    world = next;
    renderer.animate(snapshots);
    save();
  },
  getSettings: () => settings,
});

const chat = mountChat(find('[data-log]'));
const tracePanel = find('[data-panel="trace"]');
const knowledgePanel = find('[data-panel="knowledge"]');
const input = find('[data-input]');

renderTrace(tracePanel, null);
renderKnowledge(knowledgePanel, knowledge, settings);
knowledge.subscribe(() => {
  renderKnowledge(knowledgePanel, knowledge, settings);
  save();
});

function send(text) {
  if (!text.trim()) return;
  chat.say('you', text);
  const result = conversation.handle(text);
  for (const reply of result.replies) chat.say('glabo', reply);
  if (result.trace) renderTrace(tracePanel, result.trace);
  if (result.refs?.length) renderer.highlight(result.refs);
  input.placeholder = conversation.pendingWord() ? `What does "${conversation.pendingWord()}" mean?` : 'Ask or tell GlaBo something';
}

find('[data-form]').addEventListener('submit', (event) => {
  event.preventDefault();
  send(input.value);
  input.value = '';
});

find('[data-examples]').append(...EXAMPLES.map((text) => el('button', { type: 'button', onclick: () => send(text) }, text)));

function runBatch(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const item = simulateConversation(knowledge, settings, crowdStats.total + 1);
    if (!item) continue;
    crowdStats.total += 1;
    crowdStats[item.outcome] += 1;
    items.push(item);
  }
  crowd.add(items);
  save();
}

let autoTimer = null;
const crowd = mountCrowd(find('[data-panel="crowd"]'), {
  getSettings: () => settings,
  setSetting(key, value) {
    settings = { ...settings, [key]: value };
    renderKnowledge(knowledgePanel, knowledge, settings);
    save();
  },
  runBatch,
  toggleAuto() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    } else {
      autoTimer = setInterval(() => runBatch(1), AUTO_MS);
    }
  },
  isAuto: () => Boolean(autoTimer),
  stats: () => crowdStats,
});

function showTab(tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}
  for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-selected', String(button.dataset.tab === tab));
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
}

for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => showTab(button.dataset.tab));
let firstTab = 'trace';
try {
  firstTab = localStorage.getItem(TAB_KEY) ?? firstTab;
} catch {}
showTab(document.querySelector(`[data-tab="${firstTab}"]`) ? firstTab : 'trace');

find('[data-reset-world]').addEventListener('click', () => {
  world = createWorld();
  renderer.show(world.stacks);
  save();
});

find('[data-reset-knowledge]').addEventListener('click', () => {
  knowledge.clear();
});

chat.say('glabo', 'Hi, I\'m GlaBo. I understand English with grammar rules and logic, no neural network. Ask me about the blocks or tell me to move them. If you use a word I don\'t know, I\'ll ask you what it means. Type "help" for examples.');
