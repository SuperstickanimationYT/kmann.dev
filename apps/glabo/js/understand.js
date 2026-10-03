import { classify, expandLearned, mergePhrases, stripPoliteness, tokenize } from './lexicon.js';
import { parseSentence } from './parser.js';
import { RANK, interpret, logicalForm } from './semantics.js';

const firstNounPhraseDepth = (parse) => {
  const first = Object.values(parse.sem).find((value) => value && typeof value === 'object' && 'text' in value);
  return first?.pp ? 1 : 0;
};

export function understand(text, { world, lookup, ctx, allowUncertain }) {
  const raw = stripPoliteness(tokenize(text));
  const expansion = expandLearned(raw, lookup, allowUncertain);
  const trace = { input: text, raw, expansion, tokens: [], parses: [], chosen: -1 };

  if (expansion.held.length) {
    const words = [...new Set(expansion.held.map((entry) => entry.word))];
    return { kind: 'held', words, reply: `I'm still checking what "${words.join('", "')}" means.`, trace, used: [] };
  }

  const tokens = classify(mergePhrases(expansion.words));
  trace.tokens = tokens;
  const unknown = tokens.find((token) => token.cat === 'unknown');
  if (unknown) return { kind: 'unknown', word: unknown.w, trace, used: expansion.used };

  const parses = parseSentence(tokens);
  if (!parses.length) {
    return { kind: 'noparse', reply: "I know every word, but none of my grammar rules fits that sentence.", trace, used: expansion.used };
  }

  const readings = parses.map((parse) => ({ parse, lf: logicalForm(parse), result: interpret(parse, world, ctx) }));
  const order = readings
    .map((reading, index) => ({ reading, index }))
    .sort((a, b) => a.reading.result.rank - b.reading.result.rank || firstNounPhraseDepth(b.reading.parse) - firstNounPhraseDepth(a.reading.parse) || a.index - b.index);
  const chosen = order[0];
  trace.parses = readings;
  trace.chosen = chosen.index;
  const result = chosen.reading.result;
  return {
    kind: result.rank === RANK.unresolved ? 'unresolved' : result.rank === RANK.refused ? 'refused' : 'done',
    reply: result.reply,
    refs: result.refs,
    world: result.world,
    snapshots: result.snapshots ?? [],
    trace,
    used: expansion.used,
  };
}
