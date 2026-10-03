import { CROWD_WORDS } from './crowd.js';
import { el } from './dom.js';
import { confidenceOf } from './knowledge.js';
import { BUILT_IN, categoryName } from './lexicon.js';
import { treeLines } from './parser.js';
import { RANK } from './semantics.js';

const RANK_LABEL = { [RANK.done]: 'works', [RANK.refused]: 'refused by physics', [RANK.unresolved]: 'reference fails' };
const STEP_LABEL = { rule: 'grammar', resolve: 'resolve', physics: 'physics', plan: 'plan' };

const section = (title, ...body) => el('section', { class: 'gb-section' }, el('h3', {}, title), ...body);
const percent = (value) => `${Math.round(value * 100)}%`;

function tokenChip(token) {
  return el('span', { class: `gb-chip gb-cat-${token.cat}` }, el('b', {}, token.w), el('small', {}, categoryName(token.cat)));
}

function entryLine(entry) {
  return el('li', {}, el('code', {}, entry.word), ' ⇒ ', el('code', {}, entry.meaning), el('span', { class: `gb-status gb-${entry.status}` }, entry.status), ` taught by ${entry.source}`);
}

export function renderTrace(root, trace) {
  if (!trace) {
    root.replaceChildren(el('p', { class: 'gb-note' }, 'Say something to GlaBo. Every step it takes to understand you shows up here: the words it knows, the grammar rules that fit, the logic it builds, and what it does with it.'));
    return;
  }
  const blocks = [section('Input', el('p', { class: 'gb-quote' }, `"${trace.input}"`))];
  if (trace.expansion.used.length || trace.expansion.held.length) {
    blocks.push(section('Learned words', el('ul', { class: 'gb-list' }, [...new Set(trace.expansion.used)].map(entryLine)),
      trace.expansion.held.length ? el('p', { class: 'gb-note' }, `Held back as untested: ${trace.expansion.held.map((entry) => entry.word).join(', ')}.`) : null));
  }
  if (trace.tokens.length) {
    blocks.push(section('Lexicon', el('div', { class: 'gb-chips' }, trace.tokens.map(tokenChip))));
  }
  if (trace.parses.length) {
    const chosen = trace.parses[trace.chosen];
    blocks.push(section(`Parses (${trace.parses.length})`,
      el('ol', { class: 'gb-parses' }, trace.parses.map((reading, index) => el('li', { class: index === trace.chosen ? 'gb-chosen' : '' },
        el('div', {}, el('b', {}, reading.parse.rule.id), ' ', el('span', { class: `gb-rank gb-rank-${reading.result.rank}` }, RANK_LABEL[reading.result.rank]), index === trace.chosen ? el('span', { class: 'gb-picked' }, 'chosen') : null),
        el('code', { class: 'gb-lf' }, reading.lf),
        reading.result.rank !== RANK.done ? el('div', { class: 'gb-note' }, reading.result.reply) : null))),
      trace.parses.length > 1 ? el('p', { class: 'gb-note' }, 'H1: prefer a reading that works, then one refused by physics, then attach phrases to the first noun.') : null));
    blocks.push(section('Parse tree', el('pre', { class: 'gb-tree' }, treeLines(chosen.parse.tree).join('\n'))));
    blocks.push(section('Steps', el('ol', { class: 'gb-steps' }, chosen.result.steps.map((step) => el('li', {}, el('span', { class: `gb-step gb-step-${step.kind}` }, STEP_LABEL[step.kind]), step.text)))));
  }
  root.replaceChildren(...blocks);
}

function builtInSummary() {
  const groups = {};
  for (const [word, entry] of Object.entries(BUILT_IN)) {
    if (word.includes('_') || entry.cat === 'word') continue;
    (groups[entry.cat] ??= []).push(word);
  }
  return el('details', { class: 'gb-builtin' },
    el('summary', {}, `Built-in lexicon: ${Object.keys(BUILT_IN).length} words, fixed`),
    el('dl', {}, Object.entries(groups).map(([cat, words]) => [el('dt', {}, categoryName(cat)), el('dd', {}, words.join(', '))])));
}

export function renderKnowledge(root, knowledge, settings) {
  const entries = knowledge.entries().sort((a, b) => (a.status === b.status ? a.word.localeCompare(b.word) : a.status === 'uncertain' ? -1 : 1));
  const rows = entries.map((entry) => el('tr', {},
    el('td', {}, el('code', {}, entry.word)),
    el('td', {}, el('code', {}, entry.meaning)),
    el('td', {}, el('span', { class: `gb-status gb-${entry.status}` }, entry.status), el('div', { class: 'gb-bar' }, el('i', { style: `width: ${percent(confidenceOf(entry, settings))}` }))),
    el('td', { class: 'gb-num' }, entry.status === 'confident' && !entry.trials ? '–' : `${entry.errors}/${entry.trials}`),
    el('td', {}, entry.source, entry.troll ? el('span', { class: 'gb-troll' }, 'troll') : null),
    el('td', { class: 'gb-row-actions' },
      entry.status === 'uncertain' ? el('button', { type: 'button', title: 'Approve as a human moderator', onclick: () => knowledge.promote(entry) }, 'Approve') : null,
      el('button', { type: 'button', title: 'Delete this node', onclick: () => knowledge.remove(entry) }, 'Delete'))));
  const purged = knowledge.purged();
  root.replaceChildren(...[
    section('Learned words',
      entries.length
        ? el('table', { class: 'gb-table' }, el('thead', {}, el('tr', {}, ['Word', 'Means', 'Status', 'Fails', 'Taught by', ''].map((head) => el('th', {}, head)))), el('tbody', {}, rows))
        : el('p', { class: 'gb-note' }, 'Nothing learned yet. Use a word GlaBo doesn\'t know, or say "crimson means red".'),
      el('p', { class: 'gb-note' }, `New words start uncertain at 0%. Each use is a trial. A word is purged once more than ${percent(settings.threshold)} of ${settings.minTrials} trials fail, and promoted to confident after ${settings.minTrials} trials. "Troll" tags are visible only here, GlaBo never sees them.`)),
    purged.length ? section('Purged', el('ul', { class: 'gb-list' }, purged.map((entry) => el('li', {}, el('code', {}, entry.word), ' ⇒ ', el('code', {}, entry.meaning), ` (${entry.source}${entry.troll ? ', troll' : ''}): ${entry.reason}`)))) : null,
    section('Fixed knowledge', builtInSummary(), el('p', { class: 'gb-note' }, 'Physics: P1 nothing rests on a pyramid. P2 a big block won\'t balance on a small one. P3 moving needs a free spot.')),
  ].filter(Boolean));
}

function slider({ label, min, max, step, value, format, onchange }) {
  const output = el('output', {}, format(value));
  const input = el('input', { type: 'range', min, max, step, value, oninput: () => { output.textContent = format(Number(input.value)); onchange(Number(input.value)); } });
  return el('label', { class: 'gb-slider' }, el('span', {}, label), input, output);
}

function logLine(item) {
  const who = el('span', { class: 'gb-who' }, item.speaker, item.troll ? el('span', { class: 'gb-troll' }, 'troll') : null);
  const said = el('q', {}, item.text);
  if (item.outcome === 'taught') return el('li', { class: 'gb-log-taught' }, who, said, el('div', {}, `GlaBo asked what "${item.word}" means → taught "${item.meaning}"`));
  if (item.outcome === 'held') return el('li', { class: 'gb-log-held' }, who, said, el('div', {}, `"${item.words.join('", "')}" held back (not picked for a trial)`));
  const tested = item.staged.map((s) => `${s.word}${s.verdict ? ` ${s.verdict}` : ''}`).join(', ');
  const lines = [`GlaBo: ${item.reply}`];
  if (!item.correct) lines.push(`meant: ${item.expected}`);
  return el('li', { class: item.happy ? 'gb-log-pass' : 'gb-log-fail' }, who, said,
    el('div', {}, lines.join(' · ')),
    el('div', {}, `"${item.reaction}"`, tested ? ` → trial for ${tested}` : item.confident.length ? ` → ${item.confident.join(', ')} already confident, complaint ignored` : ''));
}

export function mountCrowd(root, { getSettings, setSetting, runBatch, toggleAuto, isAuto, stats }) {
  const log = el('ol', { class: 'gb-crowd-log' });
  const autoButton = el('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { toggleAuto(); autoButton.setAttribute('aria-pressed', String(isAuto())); } }, 'Auto');
  const counter = el('p', { class: 'gb-note' });
  const settings = getSettings();
  root.replaceChildren(
    section('Social immune system',
      el('p', { class: 'gb-note' }, `A simulated crowd chats with GlaBo, each on their own table. They use ${Object.keys(CROWD_WORDS).length} slang words (${Object.keys(CROWD_WORDS).join(', ')}) and teach them when asked. Trolls teach wrong meanings and react at random. Honest users react to the result: "that's wrong" when GlaBo picks the wrong block.`),
      slider({ label: 'Trial share', min: 0.05, max: 1, step: 0.05, value: settings.trialShare, format: percent, onchange: (v) => setSetting('trialShare', v) }),
      slider({ label: 'Purge threshold', min: 0.05, max: 0.75, step: 0.05, value: settings.threshold, format: percent, onchange: (v) => setSetting('threshold', v) }),
      slider({ label: 'Trials to decide', min: 3, max: 30, step: 1, value: settings.minTrials, format: String, onchange: (v) => setSetting('minTrials', v) }),
      slider({ label: 'Trolls in crowd', min: 0, max: 0.8, step: 0.05, value: settings.trollShare, format: percent, onchange: (v) => setSetting('trollShare', v) }),
      el('div', { class: 'gb-actions' },
        el('button', { type: 'button', onclick: () => runBatch(1) }, 'Run 1'),
        el('button', { type: 'button', onclick: () => runBatch(25) }, 'Run 25'),
        autoButton),
      counter),
    section('Conversations', log),
  );
  return {
    add(items) {
      log.prepend(...items.reverse().map(logLine));
      while (log.children.length > 80) log.lastChild.remove();
      const s = stats();
      counter.textContent = `${s.total} conversations: ${s.taught} taught a word, ${s.tested} tested, ${s.held} held back.`;
    },
  };
}

export function mountChat(logRoot) {
  return {
    say(who, text) {
      logRoot.append(el('li', { class: `gb-msg gb-${who}` }, el('span', { class: 'gb-speaker' }, who === 'you' ? 'You' : 'GlaBo'), el('p', {}, text)));
      logRoot.scrollTop = logRoot.scrollHeight;
    },
  };
}
