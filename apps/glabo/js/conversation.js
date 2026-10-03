import { BUILT_IN, isKnown, tokenize } from './lexicon.js';
import { understand } from './understand.js';

const NEGATIVE = new Set([
  'that is wrong', 'wrong', 'no', 'nope', 'incorrect', 'that is not right', 'not right', 'you are wrong',
  'what do you mean', 'huh', 'that is not what i meant', 'no that is wrong', 'bad',
]);
const POSITIVE = new Set(['thanks', 'thank you', 'good', 'correct', 'yes', 'right', 'nice', 'great', 'perfect', 'ok', 'okay', 'cool', 'good job', 'that is right']);
const CANCEL = new Set(['never mind', 'nevermind', 'cancel', 'forget it', 'skip', 'nothing', 'no', 'nope']);
const ANSWER_LEADS = [['it', 'means'], ['means'], ['it', 'is'], ['the', 'same', 'as'], ['same', 'as'], ['like']];
const ARTICLES = new Set(['a', 'an', 'the']);

const HELP = [
  'Commands: put the red pyramid on the table · take the small cube off · clear the big blue cube',
  'Questions: what is on the big red cube? · where is the green pyramid? · how many cubes are there? · is there a pyramid on a cube?',
  'Teaching: crimson means red · a steeple is a pyramid on a cube · forget crimson',
  'Feedback: that\'s wrong · thanks · why?',
].join('\n');

function startsWithWords(words, lead) {
  return lead.every((word, k) => words[k] === word);
}

function stripArticle(words) {
  return ARTICLES.has(words[0]) ? words.slice(1) : words;
}

export function definitionProblem(word, meaningWords, lookup) {
  if (BUILT_IN[word]) return `"${word}" is built in, and built-in words are fixed.`;
  if (!meaningWords.length) return `I need words to define "${word}" with.`;
  if (meaningWords.includes(word)) return `"${word}" can't be defined by itself.`;
  const unknown = meaningWords.filter((w) => !isKnown(w, lookup));
  if (unknown.length) return `I don't know "${unknown.join('", "')}" either. Define ${unknown.length > 1 ? 'those' : 'it'} first, or use words I know.`;
  return null;
}

function definitionIn(words) {
  if (words.length > 2 && words[1] === 'means') return { word: words[0], meaning: stripArticle(words.slice(2)) };
  if (words.length > 3 && ARTICLES.has(words[0]) && (words[2] === 'is' || words[2] === 'means')) return { word: words[1], meaning: stripArticle(words.slice(3)) };
  return null;
}

function answeredMeaning(words, word) {
  let rest = words;
  if (rest[0] === word && (rest[1] === 'means' || rest[1] === 'is')) rest = rest.slice(2);
  else if (ARTICLES.has(rest[0]) && rest[1] === word && rest[2] === 'is') rest = rest.slice(3);
  else {
    const lead = ANSWER_LEADS.find((candidate) => startsWithWords(rest, candidate));
    if (lead) rest = rest.slice(lead.length);
  }
  return stripArticle(rest);
}

export function createConversation({ knowledge, getWorld, setWorld, getSettings }) {
  const ctx = { lastRefs: [] };
  let pending = null;
  let unsettled = [];
  let lastTrace = null;
  let lastExplanation = [];

  const lookup = (word) => knowledge.find(word);

  function settle(passed) {
    const outcomes = unsettled.map((entry) => ({ entry, outcome: knowledge.record(entry, passed, getSettings()) }));
    unsettled = [];
    return outcomes;
  }

  function teach(word, meaningWords) {
    const problem = definitionProblem(word, meaningWords, lookup);
    if (problem) return { ok: false, reply: problem };
    const meaning = meaningWords.join(' ');
    knowledge.learn(word, meaning, 'you');
    const { minTrials } = getSettings();
    return { ok: true, reply: `Got it: "${word}" ⇒ "${meaning}". It starts uncertain, at 0% confidence, until it passes ${minTrials} trials.` };
  }

  function explain(result) {
    const lines = [];
    for (const entry of result.used) lines.push(`I read "${entry.word}" as "${entry.meaning}" (${entry.status}, taught by ${entry.source}).`);
    const reading = result.trace.parses[result.trace.chosen];
    if (reading) {
      if (result.trace.parses.length > 1) lines.push(`The sentence had ${result.trace.parses.length} possible parses; I used the one that worked best.`);
      for (const step of reading.result.steps) lines.push(step.text);
    }
    return lines;
  }

  function run(text) {
    const result = understand(text, { world: getWorld(), lookup, ctx, allowUncertain: true });
    lastTrace = result.trace;
    if (result.kind === 'unknown') {
      pending = { word: result.word, text };
      return { replies: [`I don't know the word "${result.word}". What does it mean? (Say something like "it means red", or "never mind".)`], trace: result.trace };
    }
    unsettled = result.used.filter((entry) => entry.status === 'uncertain');
    lastExplanation = explain(result);
    if (result.refs?.length) ctx.lastRefs = result.refs;
    if (result.world) setWorld(result.world, result.snapshots);
    return { replies: [result.reply], trace: result.trace, refs: result.refs ?? [] };
  }

  function feedback(passed) {
    if (!unsettled.length) {
      return passed ? 'Thanks.' : "Everything in my last answer came from built-in or confident knowledge, so there's no learned word to blame. Type \"why?\" to see my reasoning.";
    }
    const outcomes = settle(passed);
    const notes = outcomes.map(({ entry, outcome }) => {
      if (outcome === 'purged') return `That's enough evidence against "${entry.word}", so I dropped it.`;
      if (outcome === 'promoted') return `"${entry.word}" passed its trials and is now confident.`;
      return `"${entry.word}": ${entry.errors} of ${entry.trials} trials failed so far.`;
    });
    return [passed ? 'Thanks, that counts in favour.' : 'Noted, that counts against what I learned.', ...notes].join(' ');
  }

  function handle(text) {
    const words = tokenize(text);
    const phrase = words.join(' ');
    if (!words.length) return { replies: [] };

    const comma = text.indexOf(',');
    if (comma > 0 && NEGATIVE.has(tokenize(text.slice(0, comma)).join(' ')) && tokenize(text.slice(comma + 1)).length) {
      const first = feedback(false);
      const rest = handle(text.slice(comma + 1));
      return { ...rest, replies: [first, ...rest.replies] };
    }

    if (pending) {
      const { word, text: original } = pending;
      if (CANCEL.has(phrase)) {
        pending = null;
        return { replies: [`OK, I'll leave "${word}" undefined.`] };
      }
      const taught = teach(word, answeredMeaning(words, word));
      if (!taught.ok) return { replies: [taught.reply] };
      pending = null;
      const rerun = run(original);
      return { ...rerun, replies: [taught.reply, ...rerun.replies] };
    }

    if (NEGATIVE.has(phrase)) return { replies: [feedback(false)] };
    if (POSITIVE.has(phrase)) return { replies: [feedback(true)] };
    if (phrase === 'why' || phrase === 'why did you do that') {
      return { replies: [lastExplanation.length ? lastExplanation.join('\n') : 'I haven\'t answered anything yet.'] };
    }
    if (phrase === 'help') return { replies: [HELP] };
    if (words[0] === 'forget' && words.length === 2) {
      const entry = knowledge.find(words[1]);
      if (!entry) return { replies: [`I have no learned word "${words[1]}".`] };
      unsettled = unsettled.filter((item) => item !== entry);
      knowledge.remove(entry);
      return { replies: [`Deleted "${entry.word}" ⇒ "${entry.meaning}". It was ${entry.status}, taught by ${entry.source}.`] };
    }

    const definition = definitionIn(words);
    if (definition) {
      settle(true);
      return { replies: [teach(definition.word, definition.meaning).reply] };
    }

    settle(true);
    return run(text);
  }

  return {
    handle,
    lastTrace: () => lastTrace,
    referents: () => ctx.lastRefs,
    pendingWord: () => pending?.word ?? null,
  };
}
