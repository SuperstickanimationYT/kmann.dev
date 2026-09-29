const SVG = 'http://www.w3.org/2000/svg';
const BOX = 64;
const FINGER = 3;
const FINGER_SPREAD = 0.6;
const SHELL = { cx: 32, cy: 44, rx: 24, ry: 30 };
const SHELL_OUTLINE = `M${SHELL.cx - SHELL.rx} ${SHELL.cy} A${SHELL.rx} ${SHELL.ry} 0 0 1 ${SHELL.cx + SHELL.rx} ${SHELL.cy} Z`;
const PLATE_RADIUS = 6.5;
const SPINE_LENGTH = 5;
let shellClips = 0;

function shape(name, attributes, className = 'pp-ink') {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (className) element.setAttribute('class', className);
  return element;
}

const stroke = (d, className) => shape('path', { d }, className);
const dot = (cx, cy, r, className) => shape('circle', { cx, cy, r }, className);
const at = (x, y) => `${x.toFixed(1)} ${y.toFixed(1)}`;
const degrees = (value) => (value * Math.PI) / 180;

function hand(x, y, angle) {
  return [-FINGER_SPREAD, 0, FINGER_SPREAD].map((spread) =>
    stroke(`M${at(x, y)} L${at(x + Math.cos(angle + spread) * FINGER, y + Math.sin(angle + spread) * FINGER)}`, 'pp-ink pp-ink-thin'),
  );
}

function trunkmouth() {
  const legs = [
    [20, 36, 14, 46, 11, 58],
    [25, 40, 23, 50, 21, 58],
    [31, 40, 33, 50, 33, 58],
    [35, 35, 42, 46, 44, 58],
  ];
  return [
    ...legs.flatMap(([x1, y1, cx, cy, x2, y2]) => [
      stroke(`M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`),
      stroke(`M${x2 - 3} ${y2} L${x2 + 3} ${y2} M${x2} ${y2} L${x2 + 1} ${y2 - 2}`, 'pp-ink pp-ink-thin'),
    ]),
    stroke('M17 38 L18 16 Q18 5 27 5 Q36 5 36 16 L36 36 Q27 43 17 38 Z', 'pp-ink pp-ink-backed'),
    dot(30, 14, 3.4),
    dot(30.8, 14, 1.3, 'pp-ink-solid'),
    stroke('M36 21 C46 20 49 27 46 32 C43 37 46 41 50 38'),
    stroke('M50 38 L53 35 M50 38 L54 39 M50 38 L51 42', 'pp-ink pp-ink-thin'),
  ];
}

function hexagon(x, y) {
  const corners = Array.from({ length: 6 }, (_, corner) => {
    const angle = Math.PI / 6 + (corner * Math.PI) / 3;
    return at(x + Math.cos(angle) * PLATE_RADIUS, y + Math.sin(angle) * PLATE_RADIUS);
  });
  return stroke(`M${corners.join(' L')} Z`, 'pp-ink pp-ink-thin');
}

function shellPlates() {
  const id = `pp-shell-${shellClips++}`;
  const clip = shape('clipPath', { id }, null);
  clip.append(stroke(SHELL_OUTLINE, null));
  const plates = shape('g', { 'clip-path': `url(#${id})` }, null);
  const spacing = Math.sqrt(3) * PLATE_RADIUS;
  for (let row = 0; row < 6; row++) {
    for (let column = -1; column < 6; column++) {
      plates.append(hexagon(10 + column * spacing + (row % 2 ? spacing / 2 : 0), SHELL.cy - row * PLATE_RADIUS * 1.5));
    }
  }
  return [clip, plates];
}

function shellSpines() {
  return Array.from({ length: 5 }, (_, spine) => {
    const angle = 0.35 + spine * 0.6;
    const x = SHELL.cx + Math.cos(angle) * SHELL.rx;
    const y = SHELL.cy - Math.sin(angle) * SHELL.ry;
    const nx = Math.cos(angle) / SHELL.rx;
    const ny = -Math.sin(angle) / SHELL.ry;
    const length = Math.hypot(nx, ny);
    return stroke(`M${at(x, y)} L${at(x + (nx / length) * SPINE_LENGTH, y + (ny / length) * SPINE_LENGTH)}`);
  });
}

function isomorph() {
  return [
    ...shellSpines(),
    stroke('M13 44 L12 52 M11 52 L15 52 M22 45 L22 53 M20 53 L24 53 M42 45 L42 53 M40 53 L44 53 M51 44 L52 52 M50 52 L54 52'),
    stroke('M9 44 Q3 45 3 39 Q4 34 9 36', 'pp-ink pp-ink-backed'),
    stroke('M5 37 L2 27 M8 35 L10 26', 'pp-ink pp-ink-thin'),
    dot(2, 25.5, 1.8, 'pp-ink-solid'),
    dot(10, 24.5, 1.8, 'pp-ink-solid'),
    stroke(SHELL_OUTLINE, 'pp-ink pp-ink-backed'),
    ...shellPlates(),
    stroke(SHELL_OUTLINE),
  ];
}

function ambusher() {
  const foot = (cx, cy) => shape('ellipse', { cx, cy, rx: 3.2, ry: 1.5 }, 'pp-ink pp-ink-thin');
  return [
    stroke('M30 24 L38 7 L42 24'),
    stroke('M25 33 L13 18 L7 50'),
    stroke('M39 33 L51 18 L57 50'),
    foot(7, 51.5),
    foot(57, 51.5),
    stroke('M26 25 L20 17 L24 11', 'pp-ink pp-ink-thin'),
    ...hand(24, 11, degrees(-70)),
    stroke('M39 26 L44 19 L47 12', 'pp-ink pp-ink-thin'),
    ...hand(47, 12, degrees(-70)),
    dot(32, 30, 8.5, 'pp-ink pp-ink-backed'),
    stroke('M28 22.5 L26.5 19 M32 21.5 L32 17.5', 'pp-ink pp-ink-thin'),
    dot(28.8, 31, 1.6, 'pp-ink-solid'),
    dot(35.2, 31, 1.6, 'pp-ink-solid'),
    stroke('M38 36 L44 41 L40 46', 'pp-ink pp-ink-thin'),
    shape('rect', { x: 36.5, y: 47.5, width: 7, height: 9, rx: 1.2 }, 'pp-ink pp-ink-thin pp-ink-backed'),
    stroke('M38.5 47.5 L38.5 46.3 L41.5 46.3 L41.5 47.5', 'pp-ink pp-ink-thin'),
    stroke('M40.6 49.5 L39 52.3 L41 52.3 L39.4 54.9', 'pp-ink pp-ink-thin'),
    ...hand(40, 46, degrees(120)),
  ];
}

const PORTRAITS = { zorani: trunkmouth, quillith: isomorph, vessk: ambusher };

export function drawPortrait(species) {
  const frame = shape('svg', { viewBox: `0 0 ${BOX} ${BOX}`, 'aria-hidden': 'true' }, 'pp-portrait');
  frame.append(...PORTRAITS[species]());
  return frame;
}
