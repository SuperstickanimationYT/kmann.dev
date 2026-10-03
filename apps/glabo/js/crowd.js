import { understand } from './understand.js';
import { PIECES, cloneWorld, randomWorld } from './world.js';

export const CROWD_WORDS = {
  crimson: { meaning: 'red', kind: 'color', trolls: ['green', 'blue'] },
  scarlet: { meaning: 'red', kind: 'color', trolls: ['yellow'] },
  azure: { meaning: 'blue', kind: 'color', trolls: ['green', 'red'] },
  emerald: { meaning: 'green', kind: 'color', trolls: ['blue', 'yellow'] },
  golden: { meaning: 'yellow', kind: 'color', trolls: ['red', 'green'] },
  huge: { meaning: 'big', kind: 'size', trolls: ['small'] },
  tiny: { meaning: 'small', kind: 'size', trolls: ['big'] },
  brick: { meaning: 'cube', kind: 'shape', trolls: ['pyramid'] },
  cone: { meaning: 'pyramid', kind: 'shape', trolls: ['cube'] },
  steeple: { meaning: 'pyramid on a cube', kind: 'phrase', trolls: ['cube on a cube', 'pyramid on the table'] },
  plonk: { meaning: 'put', kind: 'verb', trolls: ['clear'] },
  atop: { meaning: 'on', kind: 'prep', trolls: ['under', 'beside'] },
};

const HAPPY_LINES = ['thanks', 'nice', 'ok', 'good'];
const UNHAPPY_LINES = ["that's wrong", 'what do you mean?', 'no', 'huh?'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function truthLookup(word) {
  const known = CROWD_WORDS[word] ?? (word.endsWith('s') ? CROWD_WORDS[word.slice(0, -1)] : undefined);
  return known ? { word, meaning: known.meaning, status: 'confident', source: 'the crowd' } : null;
}

function slangFor(kind, value) {
  return Object.entries(CROWD_WORDS).filter(([, info]) => info.kind === kind && info.meaning === value).map(([word]) => word);
}

function phraseFor(piece, primary) {
  const swap = (kind) => {
    const options = slangFor(kind, piece[kind]);
    if (primary && options.includes(primary)) return primary;
    return options.length && Math.random() < 0.2 ? pick(options) : piece[kind];
  };
  const size = Math.random() < 0.5 || slangFor('size', piece.size).includes(primary) ? `${swap('size')} ` : '';
  return `the ${size}${swap('color')} ${swap('shape')}`;
}

function draft(primary) {
  const info = CROWD_WORDS[primary];
  const other = (piece) => pick(PIECES.filter((candidate) => candidate !== piece));
  const plain = (piece) => `the ${piece.size} ${piece.color} ${piece.shape}`;
  if (info.kind === 'phrase') {
    return pick(['is there a steeple?', 'how many steeples are there?', 'where is the steeple?', 'what color is the steeple?', 'put the steeple on the table']);
  }
  if (info.kind === 'verb') {
    const piece = pick(PIECES);
    return pick([`plonk ${plain(piece)} on ${plain(other(piece))}`, `plonk ${plain(piece)} on the table`]);
  }
  if (info.kind === 'prep') {
    const piece = pick(PIECES);
    return pick([`put ${plain(piece)} atop ${plain(other(piece))}`, `what is atop ${plain(piece)}?`, `is ${plain(piece)} atop ${plain(other(piece))}?`]);
  }
  const fitting = PIECES.filter((piece) => piece[info.kind] === info.meaning);
  const piece = pick(fitting);
  const phrase = phraseFor(piece, primary);
  return pick([`where is ${phrase}?`, `put ${phrase} on the table`, `what is on ${phrase}?`, `what color is ${phrase}?`, `put ${phrase} on ${plain(other(piece))}`]);
}

function compose(primary) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const world = randomWorld();
    const text = draft(primary);
    const truth = understand(text, { world: cloneWorld(world), lookup: truthLookup, ctx: { lastRefs: [] }, allowUncertain: true });
    if (truth.kind === 'done') return { world, text, truth };
  }
  return null;
}

function pickWord(knowledge) {
  const staged = knowledge.entries().filter((entry) => entry.status === 'uncertain' && CROWD_WORDS[entry.word]);
  if (staged.length && Math.random() < 0.5) return pick(staged).word;
  return pick(Object.keys(CROWD_WORDS));
}

const sameOutcome = (a, b) => a.reply === b.reply && JSON.stringify(a.world?.stacks ?? null) === JSON.stringify(b.world?.stacks ?? null);

export function simulateConversation(knowledge, settings, speakerNumber) {
  const speaker = `user#${speakerNumber}`;
  const troll = Math.random() < settings.trollShare;
  const composed = compose(pickWord(knowledge));
  if (!composed) return null;
  const { world, text, truth } = composed;
  const allowUncertain = Math.random() < settings.trialShare;
  const result = understand(text, { world, lookup: (word) => knowledge.find(word), ctx: { lastRefs: [] }, allowUncertain });
  const base = { speaker, troll, text };

  if (result.kind === 'unknown') {
    const known = CROWD_WORDS[result.word] ?? CROWD_WORDS[result.word.replace(/s$/, '')];
    const word = CROWD_WORDS[result.word] ? result.word : result.word.replace(/s$/, '');
    const meaning = troll ? pick(known.trolls) : known.meaning;
    knowledge.learn(word, meaning, speaker, { troll });
    return { ...base, outcome: 'taught', word, meaning };
  }
  if (result.kind === 'held') return { ...base, outcome: 'held', words: result.words };

  const staged = [...new Set(result.used.filter((entry) => entry.status === 'uncertain'))];
  const confident = [...new Set(result.used.filter((entry) => entry.status === 'confident'))];
  const correct = sameOutcome(result, truth);
  const happy = troll ? Math.random() < 0.5 : correct;
  const verdicts = staged.map((entry) => ({ word: entry.word, verdict: knowledge.record(entry, happy, settings) }));
  return {
    ...base,
    outcome: 'tested',
    reply: result.reply,
    expected: truth.reply,
    correct,
    happy,
    reaction: pick(happy ? HAPPY_LINES : UNHAPPY_LINES),
    staged: verdicts,
    confident: confident.map((entry) => entry.word),
  };
}

