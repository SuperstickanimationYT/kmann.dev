export const RULE_110_ETHER = '10011011111000';

export const LINE_PATTERNS = [
  { name: 'Glider A (moves right 2 cells every 3 generations)', cells: '1001101111100010011011111000111010011011101001101111100010011011111000' },
  { name: 'Glider B (moves left 1 cell every 2 generations)', cells: '100110111110001001101111100011111010111001100011111010111001101111100010011011111000' },
  { name: 'Glider C (stays still)', cells: '1001101111100010011011111000000111000110001001101111100010011011111000' },
  { name: 'Glider E (moves left 4 cells every 15 generations)', cells: '100110111110001001101111100001000111110101111100111000001001101111100010011011111000' },
  { name: 'Glider G (moves left 1 cell every 3 generations)', cells: '10011011111000100110111110001001100110001111110111100001100011111010111001101111100010011011111000' },
].map((pattern) => ({ ...pattern, rule: 110, ether: RULE_110_ETHER, width: pattern.cells.length, height: 1, cells: Uint8Array.from(pattern.cells, Number), opaque: true }));

const LIFE = 'B3/S23';
const HIGHLIFE = 'B36/S23';

export const PLANE_PATTERNS = [
  { name: 'Glider', rule: LIFE, rle: 'bob$2bo$3o!' },
  { name: 'Lightweight spaceship', rule: LIFE, rle: 'bo2bo$o4b$o3bo$4o!' },
  { name: 'Middleweight spaceship', rule: LIFE, rle: '3bo2b$bo3bo$o5b$o4bo$5o!' },
  { name: 'Heavyweight spaceship', rule: LIFE, rle: '3b2o2b$bo4bo$o6b$o5bo$6o!' },
  { name: 'Copperhead (slow spaceship)', rule: LIFE, rle: 'b2o2b2o$3b2o$3b2o$obo2bobo$o6bo2$o6bo$b2o2b2o$2b4o2$3b2o$3b2o!' },
  { name: 'Gosper glider gun', rule: LIFE, rle: '24bo11b$22bobo11b$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o14b$2o8bo3bob2o4bobo11b$10bo5bo7bo11b$11bo3bo20b$12b2o!' },
  { name: 'Eater (eats gliders)', rule: LIFE, rle: '2o2b$obob$2bob$2b2o!' },
  { name: 'Pulsar (oscillator)', rule: LIFE, rle: '2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!' },
  { name: 'Pentadecathlon (oscillator)', rule: LIFE, rle: '2bo4bo2b$2ob4ob2o$2bo4bo!' },
  { name: 'R-pentomino (lasts 1103 generations)', rule: LIFE, rle: 'b2o$2o$bo!' },
  { name: 'Acorn (lasts 5206 generations)', rule: LIFE, rle: 'bo5b$3bo3b$2o2b3o!' },
  { name: 'Diehard (vanishes after 130 generations)', rule: LIFE, rle: '6bob$2o6b$bo3b3o!' },
  { name: 'Replicator', rule: HIGHLIFE, rle: '2b3o$bo2bo$o3bo$o2bo$3o!' },
].map(({ name, rule, rle }) => ({ name, rule, ...parseRle(rle), opaque: false }));

export function parseRle(text) {
  const rows = [[]];
  let count = '';
  for (const char of text.replace(/\s+/g, '')) {
    if (char === '!') break;
    if (/\d/.test(char)) {
      count += char;
      continue;
    }
    const times = count ? Number(count) : 1;
    count = '';
    if (char === '$') {
      for (let i = 0; i < times; i += 1) rows.push([]);
    } else {
      rows.at(-1).push(...Array(times).fill(char === 'b' || char === '.' ? 0 : 1));
    }
  }
  const width = Math.max(...rows.map((row) => row.length));
  const cells = new Uint8Array(width * rows.length);
  rows.forEach((row, y) => row.forEach((value, x) => { cells[y * width + x] = value; }));
  return { width, height: rows.length, cells };
}

export function toRle({ width, height, cells }) {
  const lines = [];
  for (let y = 0; y < height; y += 1) {
    let line = '';
    let x = 0;
    while (x < width) {
      const value = cells[y * width + x];
      let run = 1;
      while (x + run < width && cells[y * width + x + run] === value) run += 1;
      if (value || x + run < width) line += `${run > 1 ? run : ''}${value ? 'o' : 'b'}`;
      x += run;
    }
    lines.push(line);
  }
  const body = lines.join('$').replace(/\$+$/, '').replace(/\$\$+/g, (run) => `${run.length}$`);
  return `x = ${width}, y = ${height}\n${body}!`;
}

export function parseClipboardText(text) {
  const body = text.split('\n').filter((line) => !line.startsWith('#') && !/^\s*x\s*=/.test(line)).join('');
  if (/^[\dbo$!]+$/.test(body) && body.includes('o')) {
    const pattern = parseRle(body);
    if (pattern.cells.some(Boolean)) return pattern;
  }
  const plain = text.split(/\r?\n/).filter((line) => !line.startsWith('!') && line.length);
  if (plain.length && plain.every((line) => /^[.O*o]+$/.test(line))) {
    return parseRle(plain.map((line) => line.replace(/[.]/g, 'b').replace(/[O*]/g, 'o')).join('$'));
  }
  return null;
}

export function rotate({ width, height, cells, ...rest }) {
  const turned = new Uint8Array(cells.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) turned[x * height + (height - 1 - y)] = cells[y * width + x];
  }
  return { ...rest, width: height, height: width, cells: turned };
}

export function flip({ width, height, cells, ...rest }) {
  const flipped = new Uint8Array(cells.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) flipped[y * width + (width - 1 - x)] = cells[y * width + x];
  }
  return { ...rest, width, height, cells: flipped };
}
