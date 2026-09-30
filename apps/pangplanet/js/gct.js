import { GCT } from './world.js';

export const LEXICON = {
  '00': 'no',
  11: 'yes',
  20: 'not',
  30: '?',
  100: 'stardust',
  110: 'charge',
  120: 'science',
  130: 'gold',
  140: 'galactokens',
  150: 'crystals',
  '010': 'human',
  210: 'outsider',
  310: 'Quillith',
  410: 'Vessk',
  510: 'Zorani',
  200: 'friend',
  215: 'enemy',
  412: 'me',
  413: 'you',
  400: 'territory',
  401: 'ship',
  402: 'leave',
  403: 'planet',
  404: 'star',
  405: 'far',
  414: 'near',
  302: 'is',
  315: "'s",
  3010: 'drill',
  3030: 'ask',
  3040: 'tell',
  3120: 'trade',
  3130: 'want',
  3140: 'pay',
};

export const NUMBERS = '•';
const DOT = '•';
const BASE = 6;
const VOWELS = new Set(['0', '1']);
const PLURAL_GLOSS = 's';
const IRREGULAR_PLURALS = { 412: 'we', 413: 'you all' };
const WANTED = { gold: '130', crystals: '150', batteries: '110' };
const GREETINGS = { friendly: '413 302 200', wary: '413 302 210', hostile: '413 302 215' };

export const pluralOf = (word) => word + (VOWELS.has(word.at(-1)) ? '5' : '05');

export function numberInGct(value) {
  return [...Math.round(value).toString(BASE)].map((digit) => DOT + digit).join('');
}

function readWord(text) {
  if (text in LEXICON) return { word: text, plural: false };
  const root = [text.slice(0, -2), text.slice(0, -1)].find((candidate) => candidate in LEXICON && pluralOf(candidate) === text);
  if (root) return { word: root, plural: true };
  throw new Error(`Not a GCT word: ${text}`);
}

export function readLine(line) {
  return line.split(' ').map((text) => {
    if (!text.startsWith(DOT)) return { glyphs: [...text], ...readWord(text) };
    const digits = text.split(DOT).slice(1);
    return { glyphs: digits, dotted: true, word: NUMBERS, value: parseInt(digits.join(''), BASE) };
  });
}

export const wordsIn = (line) => [...new Set(readLine(line).map(({ word }) => word))];

export function glossOf(token, known) {
  if (!known.has(token.word)) return '?';
  if (token.dotted) return token.value.toLocaleString();
  if (!token.plural) return LEXICON[token.word];
  return IRREGULAR_PLURALS[token.word] ?? LEXICON[token.word] + PLURAL_GLOSS;
}

export function alienLines({ mood, wants, refusesTrade, sample }) {
  const lines = [GREETINGS[mood], `412 3130 ${WANTED[wants]}`];
  if (refusesTrade) lines.push('412 20 3120');
  if (sample?.answer === 'granted') lines.push('11');
  if (sample?.answer === 'refused') lines.push('00');
  if (sample?.answer === 'fee') lines.push(`413 3140 ${numberInGct(sample.fee)} 140`);
  return lines;
}

export const tollLines = (price) => [`413 3140 ${numberInGct(price)} 140 30`, '413 402 41205 315 400'];

export const createGctLog = () => ({ heard: {}, known: new Set(), heardFrom: new Set() });

export const gctLogFromSave = (saved) => ({ heard: { ...saved?.heard }, known: new Set(saved?.known ?? []), heardFrom: new Set(saved?.heardFrom ?? []) });

export const gctLogToSave = (log) => ({ heard: log.heard, known: [...log.known], heardFrom: [...log.heardFrom] });

export function hear(log, lines, speaker) {
  const learned = [];
  for (const word of new Set(lines.flatMap(wordsIn))) {
    const hearing = `${word}@${speaker}`;
    if (log.heardFrom.has(hearing)) continue;
    log.heardFrom.add(hearing);
    log.heard[word] = (log.heard[word] ?? 0) + 1;
    if (!log.known.has(word) && log.heard[word] >= GCT.hearingsToLearn) {
      log.known.add(word);
      learned.push(word);
    }
  }
  return learned;
}

export const canStudy = (log, word, science) => word in log.heard && !log.known.has(word) && science >= GCT.studyScience;

export const meaningOf = (word) => (word === NUMBERS ? 'numbers' : LEXICON[word]);

const SVG = 'http://www.w3.org/2000/svg';
const GLYPH_BOX = 20;
const CENTRE = GLYPH_BOX / 2;
const RADIUS = 7.5;
const DOT_RADIUS = 1.7;
const OPEN_SHAPES = {
  1: [
    [4, 4],
    [10, 16],
    [16, 4],
  ],
  2: [
    [5, 16],
    [5, 4],
    [15, 16],
    [15, 4],
  ],
};
const SPACE_STROKES = [
  [4, 16, 16, 16],
  [10, 16, 10, 5],
];

function svgElement(name, attributes) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function regularPolygon(sides) {
  const start = -Math.PI / 2 + (sides % 2 === 0 ? Math.PI / sides : 0);
  return Array.from({ length: sides }, (_, corner) => {
    const angle = start + (corner * 2 * Math.PI) / sides;
    return [CENTRE + RADIUS * Math.cos(angle), CENTRE + RADIUS * Math.sin(angle)];
  });
}

function shapeFor(digit) {
  const sides = Number(digit);
  if (sides === 0) return svgElement('circle', { cx: CENTRE, cy: CENTRE, r: RADIUS });
  if (OPEN_SHAPES[sides]) return svgElement('polyline', { points: OPEN_SHAPES[sides].join(' ') });
  return svgElement('polygon', { points: regularPolygon(sides).join(' ') });
}

function glyphFrame() {
  return svgElement('svg', { viewBox: `0 0 ${GLYPH_BOX} ${GLYPH_BOX}`, class: 'pp-gct-glyph', 'aria-hidden': 'true' });
}

export function drawGlyph(digit, dotted) {
  const frame = glyphFrame();
  frame.append(shapeFor(digit));
  if (dotted) frame.append(svgElement('circle', { cx: CENTRE, cy: CENTRE, r: DOT_RADIUS, class: 'pp-gct-dot' }));
  return frame;
}

export function drawSpace() {
  const frame = glyphFrame();
  frame.classList.add('pp-gct-space');
  frame.append(...SPACE_STROKES.map(([x1, y1, x2, y2]) => svgElement('line', { x1, y1, x2, y2 })));
  return frame;
}

export function drawWord(glyphs, dotted = false) {
  const span = document.createElement('span');
  span.className = 'pp-gct-glyphs';
  span.append(...glyphs.map((digit) => drawGlyph(digit, dotted)));
  return span;
}
