function arc(cx, cy, r, fromDegrees, toDegrees, steps = 16) {
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((fromDegrees + ((toDegrees - fromDegrees) * i) / steps) * Math.PI) / 180;
    points.push([Math.round(cx + r * Math.cos(angle)), Math.round(cy + r * Math.sin(angle))]);
  }
  return points;
}

const GLYPHS = {
  a: [arc(50, 55, 22, 0, 360)],
  e: [[[40, 25], [40, 80]], [[40, 52], [66, 52]]],
  i: [[[50, 35], [50, 80]], [[50, 20], [51, 20]]],
  o: [arc(50, 55, 22, 0, 360), [[50, 55], [51, 55]]],
  u: [arc(50, 45, 22, 0, 180)],
  k: [[[30, 25], [30, 80]], [[70, 25], [30, 52], [70, 80]]],
  t: [[[25, 28], [75, 28]], [[50, 28], [50, 80]]],
  n: [[[25, 80], [25, 28], [75, 80], [75, 28]]],
  s: [[...arc(40, 40, 14, 0, -270, 10), ...arc(60, 66, 14, -90, 180, 10)]],
  m: [[[20, 80], [35, 28], [50, 64], [65, 28], [80, 80]]],
  l: [[[35, 25], [35, 80], [70, 80]]],
  r: [[[30, 80], [30, 28], [65, 28], [65, 52], [30, 52], [70, 80]]],
};

const WORDS = [
  ['kana', 'person', 'noun', { PL: 'kanten' }],
  ['kiro', 'cat', 'noun'],
  ['olu', 'fish', 'noun'],
  ['tala', 'house', 'noun'],
  ['sema', 'water', 'noun'],
  ['ile', 'tree', 'noun'],
  ['ren', 'I, me', 'pronoun'],
  ['noka', 'see', 'verb'],
  ['milo', 'eat', 'verb'],
  ['suri', 'sleep', 'verb'],
  ['taso', 'big', 'adjective'],
  ['mena', 'good', 'adjective'],
];

export function exampleLanguage(id) {
  return {
    id,
    name: 'Velari (example)',
    script: { mode: 'custom', direction: 'ltr' },
    letters: Object.entries(GLYPHS).map(([roman, strokes], index) => ({ id: `ex${index}`, roman, strokes })),
    categories: [
      { symbol: 'C', members: 'k t n s m l r' },
      { symbol: 'V', members: 'a e i o u' },
    ],
    syllables: 'CV CVC V VC',
    wordOrder: 'SOV',
    words: WORDS.map(([roman, meaning, pos, irregular = {}], index) => ({ id: `w${index}`, roman, meaning, pos, notes: '', irregular })),
    rules: [
      { id: 'r0', name: 'Plural', tag: 'PL', pos: 'noun', cases: [{ ending: 'V', swap: false, replace: '', prefix: '', suffix: 'n' }, { ending: '', swap: false, replace: '', prefix: '', suffix: 'en' }] },
      { id: 'r1', name: 'Object', tag: 'ACC', pos: 'noun, pronoun', cases: [{ ending: 'V', swap: false, replace: '', prefix: '', suffix: 's' }, { ending: '', swap: false, replace: '', prefix: '', suffix: 'es' }] },
      { id: 'r2', name: 'Past', tag: 'PST', pos: 'verb', cases: [{ ending: 'a', swap: true, replace: 'e', prefix: '', suffix: 't' }, { ending: '', swap: false, replace: '', prefix: '', suffix: 'et' }] },
      { id: 'r3', name: 'Future', tag: 'FUT', pos: 'verb', cases: [{ ending: '', swap: false, replace: '', prefix: 'el', suffix: '' }] },
      { id: 'r4', name: 'Negative', tag: 'NEG', pos: 'verb', cases: [{ ending: '', swap: false, replace: '', prefix: 'mo', suffix: '' }] },
    ],
  };
}
