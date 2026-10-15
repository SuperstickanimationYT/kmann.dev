export const LINE_PRESETS = [
  { rule: 30, name: 'Rule 30 (chaos)' },
  { rule: 54, name: 'Rule 54 (particles)' },
  { rule: 90, name: 'Rule 90 (Sierpinski triangle)' },
  { rule: 110, name: 'Rule 110 (Turing complete)' },
  { rule: 184, name: 'Rule 184 (traffic)' },
];

export const PLANE_PRESETS = [
  { rule: 'B3/S23', name: "Conway's Life" },
  { rule: 'B36/S23', name: 'HighLife' },
  { rule: 'B3678/S34678', name: 'Day & Night' },
  { rule: 'B2/S', name: 'Seeds' },
  { rule: 'B3/S012345678', name: 'Life without Death' },
  { rule: 'B1357/S1357', name: 'Replicator' },
  { rule: 'B35678/S5678', name: 'Diamoeba' },
  { rule: 'B36/S125', name: '2x2' },
  { rule: 'B368/S245', name: 'Morley' },
  { rule: 'B3/S45678', name: 'Coral' },
];

export function parseLineRule(text) {
  const match = String(text).trim().match(/^(?:rule\s*)?(\d{1,3})$/i);
  if (!match) return null;
  const number = Number(match[1]);
  return number <= 255 ? number : null;
}

export function lineRuleTable(rule) {
  return Uint8Array.from({ length: 8 }, (_, index) => (rule >> index) & 1);
}

export function parsePlaneRule(text) {
  const match = String(text).replace(/\s+/g, '').match(/^B([0-8]*)\/S([0-8]*)$/i);
  if (!match) return null;
  const birth = new Uint8Array(9);
  const survive = new Uint8Array(9);
  for (const digit of match[1]) birth[digit] = 1;
  for (const digit of match[2]) survive[digit] = 1;
  return { birth, survive };
}

export function formatPlaneRule({ birth, survive }) {
  const digits = (table) => [...table.keys()].filter((count) => table[count]).join('');
  return `B${digits(birth)}/S${digits(survive)}`;
}

export function planeRuleTable({ birth, survive }) {
  const table = new Uint8Array(18);
  for (let count = 0; count < 9; count += 1) {
    table[count] = birth[count];
    table[9 + count] = survive[count];
  }
  return table;
}
