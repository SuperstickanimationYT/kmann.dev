const EM = 100;
const GLYPH_GAP = 14;
const EMPTY_GLYPH_WIDTH = 40;
const SPACE_WIDTH = 50;
const STROKE_WIDTH = 7;

const escapeXml = (text) => text.replace(/[<>&"']/g, (character) => `&#${character.charCodeAt(0)};`);

export function spellOut(text, letters) {
  const byLength = letters.filter((letter) => letter.roman).sort((a, b) => b.roman.length - a.roman.length);
  const lower = text.toLowerCase();
  const tokens = [];
  let at = 0;
  while (at < lower.length) {
    const letter = byLength.find((candidate) => lower.startsWith(candidate.roman.toLowerCase(), at));
    if (letter) {
      tokens.push({ letter });
      at += letter.roman.length;
    } else {
      tokens.push({ character: text[at], space: /\s/.test(text[at]) });
      at += 1;
    }
  }
  return tokens;
}

export const unknownCharacters = (text, letters) =>
  letters.length ? [...new Set(spellOut(text, letters).filter((token) => !token.letter && !token.space && /\p{L}/u.test(token.character)).map((token) => token.character))] : [];

function horizontalExtent(strokes) {
  const xs = strokes.flat().map(([x]) => x);
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

const strokePath = (strokes, dx, dy) =>
  strokes
    .map((stroke) => stroke.map(([x, y], index) => `${index ? 'L' : 'M'}${(x + dx).toFixed(1)} ${(y + dy).toFixed(1)}`).join(''))
    .join('');

function layoutTokens(tokens, direction) {
  const visualOrder = direction === 'rtl' ? [...tokens].reverse() : tokens;
  const placed = [];
  let pen = 0;
  for (const token of visualOrder) {
    if (token.space) {
      pen += SPACE_WIDTH;
      continue;
    }
    const extent = token.letter ? horizontalExtent(token.letter.strokes) : null;
    if (direction === 'ttb') {
      placed.push({ token, x: extent ? (EM - extent[0] - extent[1]) / 2 : EM * 0.2, y: pen });
      pen += EM * 0.9;
      continue;
    }
    const advance = extent ? extent[1] - extent[0] + GLYPH_GAP : token.letter ? EMPTY_GLYPH_WIDTH : EM * 0.6;
    placed.push({ token, x: pen - (extent ? extent[0] : 0) + GLYPH_GAP / 2, y: 0 });
    pen += advance;
  }
  const length = Math.max(pen, 1);
  return direction === 'ttb' ? { placed, width: EM, height: length + EM * 0.1 } : { placed, width: length, height: EM };
}

export function scriptSvg(text, language, { height = 48, color = 'currentColor' } = {}) {
  const { placed, width: units, height: unitsHigh } = layoutTokens(spellOut(text, language.letters), language.script.direction);
  const scale = height / EM;
  const body = placed
    .map(({ token, x, y }) =>
      token.letter
        ? `<path d="${strokePath(token.letter.strokes, x, y)}"/>`
        : `<text x="${(x + EM * 0.3).toFixed(1)}" y="${y + EM * 0.72}" text-anchor="middle" font-size="${EM * 0.6}" fill="${color}" stroke="none" font-family="sans-serif">${escapeXml(token.character)}</text>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${units.toFixed(1)} ${unitsHigh.toFixed(1)}" width="${(units * scale).toFixed(1)}" height="${(unitsHigh * scale).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export function glyphSvg(letter, size = 48) {
  return `<svg viewBox="0 0 ${EM} ${EM}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"><path d="${strokePath(letter.strokes, 0, 0)}"/></svg>`;
}

export const usesDrawnScript = (language) => language.script.mode === 'custom';

export function renderScript(text, language, { size = 40 } = {}) {
  const box = document.createElement('span');
  box.className = `cl-script cl-script-${language.script.direction}`;
  box.setAttribute('aria-label', text);
  if (!usesDrawnScript(language)) {
    box.classList.add('cl-script-latin');
    box.textContent = text;
    return box;
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const wordBox = document.createElement('span');
    wordBox.className = 'cl-script-word';
    wordBox.innerHTML = scriptSvg(word, language, { height: size });
    box.append(wordBox);
  }
  return box;
}
