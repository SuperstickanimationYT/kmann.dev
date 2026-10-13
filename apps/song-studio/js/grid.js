import { DRUMS } from './drums.js';
import { isTonicRow, midiName, pitchHue, rowMidi } from './music.js';
import { barSteps, totalSteps, trackRows } from './song.js';

const LABEL_WIDTH = 64;
const RULER_HEIGHT = 24;
const BEAT_WIDTH = 112;
const HOLD_MS = 350;
const TOUCH_SLOP = 10;
const coarsePointer = window.matchMedia('(pointer: coarse)');

function fitCanvas(canvas, width, height) {
  const ratio = window.devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return context;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
}

export const noteAt = (track, row, step) => track.notes.find((note) => note.row === row && step >= note.step && step < note.step + note.length);

export function createGrid({ labels, ruler, canvas, lane, scroller }, store, { onPreview, onPlayRow, onPickBars }) {
  let playStep = -1;
  let hover = null;
  let drag = null;
  let heldTouch = null;
  let barDrag = null;
  let frame = 0;
  let layout = { rows: 0, steps: 0, cellWidth: 28, cellHeight: 24, viewWidth: 0 };

  function measure() {
    const { song, track } = store;
    const rows = trackRows(song, track);
    const steps = totalSteps(song);
    const cellWidth = Math.max(BEAT_WIDTH / song.stepsPerBeat, Math.floor(scroller.clientWidth / steps));
    return {
      rows,
      steps,
      cellWidth,
      cellHeight: Math.max(coarsePointer.matches ? 28 : 16, Math.min(34, Math.floor(430 / rows))),
      viewWidth: Math.min(scroller.clientWidth, steps * cellWidth),
    };
  }

  const rowY = (row) => (layout.rows - 1 - row) * layout.cellHeight;

  function visibleSteps() {
    const left = scroller.scrollLeft;
    return { left, first: Math.floor(left / layout.cellWidth), last: Math.min(layout.steps, Math.ceil((left + layout.viewWidth) / layout.cellWidth)) };
  }

  function rowLabel(row) {
    const { song, track } = store;
    return track.kind === 'drums' ? DRUMS[row].label : midiName(rowMidi(song, track, row));
  }

  function drawLabels() {
    const { song, track } = store;
    const context = fitCanvas(labels, LABEL_WIDTH, RULER_HEIGHT + layout.rows * layout.cellHeight);
    context.textBaseline = 'middle';
    context.fillStyle = '#0a1d31';
    context.fillRect(0, 0, LABEL_WIDTH, RULER_HEIGHT);
    context.font = '700 12px Trebuchet MS, Segoe UI, sans-serif';
    context.fillStyle = '#8fb6de';
    context.fillText('Bar', 8, RULER_HEIGHT / 2 + 1);
    context.translate(0, RULER_HEIGHT);
    context.font = `700 ${Math.min(13, layout.cellHeight - 4)}px Trebuchet MS, Segoe UI, sans-serif`;
    for (let row = 0; row < layout.rows; row++) {
      const y = rowY(row);
      const tonic = track.kind !== 'drums' && isTonicRow(song.scale, row);
      context.fillStyle = tonic ? '#12345a' : row % 2 ? '#0a1d31' : '#0c223a';
      context.fillRect(0, y, LABEL_WIDTH, layout.cellHeight);
      context.fillStyle = track.kind === 'drums' ? DRUMS[row].color : tonic ? '#e2effd' : '#8fb6de';
      context.fillText(rowLabel(row), 8, y + layout.cellHeight / 2 + 1);
    }
  }

  function noteColor(row, lightness) {
    const { song, track } = store;
    if (track.kind === 'drums') return DRUMS[row].color;
    return `hsl(${pitchHue(song, row)} 85% ${lightness}%)`;
  }

  function drawRuler() {
    const { song, selection } = store;
    const { left, first, last } = visibleSteps();
    const context = fitCanvas(ruler, layout.viewWidth, RULER_HEIGHT);
    context.translate(-left, 0);
    const barWidth = barSteps(song) * layout.cellWidth;
    context.fillStyle = '#0a1d31';
    context.fillRect(left, 0, layout.viewWidth, RULER_HEIGHT);
    if (selection) {
      context.fillStyle = 'rgba(252, 196, 25, 0.35)';
      context.fillRect(selection.start * barWidth, 0, (selection.end - selection.start) * barWidth, RULER_HEIGHT);
    }
    context.font = '700 12px Trebuchet MS, Segoe UI, sans-serif';
    context.textBaseline = 'middle';
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(125, 185, 245, 0.7)';
    const lastBar = Math.ceil(last / barSteps(song));
    for (let bar = Math.floor(first / barSteps(song)); bar < lastBar; bar++) {
      const x = bar * barWidth;
      context.beginPath();
      context.moveTo(x + 0.5, 0);
      context.lineTo(x + 0.5, RULER_HEIGHT);
      context.stroke();
      const picked = selection && bar >= selection.start && bar < selection.end;
      context.fillStyle = picked ? '#fff3bf' : '#8fb6de';
      context.fillText(String(bar + 1), x + 8, RULER_HEIGHT / 2 + 1);
    }
    if (playStep >= 0) {
      context.fillStyle = '#5fe3ff';
      context.fillRect(playStep * layout.cellWidth, RULER_HEIGHT - 4, layout.cellWidth, 4);
    }
  }

  function drawGrid() {
    const { song, track, selection } = store;
    const { rows, cellWidth, cellHeight, viewWidth } = layout;
    const { left, first, last } = visibleSteps();
    const height = rows * cellHeight;
    const context = fitCanvas(canvas, viewWidth, height);
    context.translate(-left, 0);
    const stepsPerBar = barSteps(song);

    for (let step = first; step < last; step++) {
      const beat = Math.floor(step / song.stepsPerBeat);
      context.fillStyle = beat % 2 ? '#081a2d' : '#0b2238';
      context.fillRect(step * cellWidth, 0, cellWidth, height);
    }
    if (track.kind !== 'drums') {
      context.fillStyle = 'rgba(95, 227, 255, 0.07)';
      for (let row = 0; row < rows; row++) if (isTonicRow(song.scale, row)) context.fillRect(left, rowY(row), viewWidth, cellHeight);
    }
    if (selection) {
      context.fillStyle = 'rgba(252, 196, 25, 0.08)';
      context.fillRect(selection.start * stepsPerBar * cellWidth, 0, (selection.end - selection.start) * stepsPerBar * cellWidth, height);
    }
    if (playStep >= 0) {
      context.fillStyle = 'rgba(95, 227, 255, 0.18)';
      context.fillRect(playStep * cellWidth, 0, cellWidth, height);
    }

    context.lineWidth = 1;
    for (let step = first; step <= last; step++) {
      const x = step * cellWidth + 0.5;
      context.strokeStyle = step % stepsPerBar === 0 ? 'rgba(125, 185, 245, 0.7)' : step % song.stepsPerBeat === 0 ? 'rgba(80, 140, 205, 0.4)' : 'rgba(61, 120, 190, 0.16)';
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    context.strokeStyle = 'rgba(61, 120, 190, 0.2)';
    for (let row = 0; row <= rows; row++) {
      const y = row * cellHeight + 0.5;
      context.beginPath();
      context.moveTo(left, y);
      context.lineTo(left + viewWidth, y);
      context.stroke();
    }

    if (hover && !drag && !noteAt(track, hover.row, hover.step)) {
      context.fillStyle = 'rgba(226, 239, 253, 0.12)';
      roundedRect(context, hover.step * cellWidth + 2, rowY(hover.row) + 2, cellWidth - 4, cellHeight - 4, 5);
    }

    for (const note of track.notes) {
      if (note.step >= last || note.step + note.length <= first) continue;
      const sounding = playStep >= note.step && playStep < note.step + note.length;
      const x = note.step * cellWidth;
      const y = rowY(note.row);
      context.fillStyle = noteColor(note.row, sounding ? 78 : 60);
      if (sounding) {
        context.shadowColor = noteColor(note.row, 70);
        context.shadowBlur = 14;
      }
      if (track.kind === 'drums') {
        context.beginPath();
        context.arc(x + cellWidth / 2, y + cellHeight / 2, Math.min(cellWidth, cellHeight) / 2 - (sounding ? 1 : 3), 0, Math.PI * 2);
        context.fill();
      } else {
        roundedRect(context, x + 1.5, y + 1.5, note.length * cellWidth - 3, cellHeight - 3, 6);
      }
      context.shadowBlur = 0;
    }
  }

  function draw() {
    layout = measure();
    lane.style.width = `${layout.steps * layout.cellWidth}px`;
    drawLabels();
    drawRuler();
    drawGrid();
  }

  function cellAt(event) {
    const box = canvas.getBoundingClientRect();
    const step = Math.floor((event.clientX - box.left + scroller.scrollLeft) / layout.cellWidth);
    const row = layout.rows - 1 - Math.floor((event.clientY - box.top) / layout.cellHeight);
    if (step < 0 || step >= layout.steps || row < 0 || row >= layout.rows) return null;
    return { row, step };
  }

  function roomAfter(track, note) {
    const blockers = track.notes.filter((other) => other !== note && other.row === note.row && other.step > note.step).map((other) => other.step);
    return Math.min(layout.steps, ...blockers) - note.step;
  }

  function addNote(track, row, step) {
    const note = { row, step, length: 1 };
    track.notes.push(note);
    onPreview(track, row);
    return note;
  }

  function removeNote(track, note) {
    track.notes.splice(track.notes.indexOf(note), 1);
  }

  function beginDrag(cell) {
    const track = store.track;
    const hit = noteAt(track, cell.row, cell.step);
    store.checkpoint();
    if (hit) {
      removeNote(track, hit);
      drag = { mode: 'erase' };
    } else {
      const note = addNote(track, cell.row, cell.step);
      drag = track.kind === 'drums' ? { mode: 'paint' } : { mode: 'stretch', note };
    }
    store.changed();
  }

  function toggleNote(cell) {
    const track = store.track;
    const hit = noteAt(track, cell.row, cell.step);
    store.checkpoint();
    if (hit) removeNote(track, hit);
    else addNote(track, cell.row, cell.step);
    store.changed();
  }

  function releaseHeldTouch() {
    clearTimeout(heldTouch?.timer);
    heldTouch = null;
  }

  function holdTouch(event, cell) {
    heldTouch = {
      cell,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        heldTouch = null;
        navigator.vibrate?.(15);
        beginDrag(cell);
      }, HOLD_MS),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const cell = cellAt(event);
    if (!cell) return;
    if (event.pointerType === 'touch') {
      holdTouch(event, cell);
      return;
    }
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    beginDrag(cell);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (heldTouch && Math.hypot(event.clientX - heldTouch.x, event.clientY - heldTouch.y) > TOUCH_SLOP) releaseHeldTouch();
    const cell = cellAt(event);
    const track = store.track;
    if (!drag) {
      if (event.pointerType !== 'mouse') return;
      const moved = cell?.row !== hover?.row || cell?.step !== hover?.step;
      hover = cell;
      if (moved) drawGrid();
      return;
    }
    if (!cell) return;
    const hit = noteAt(track, cell.row, cell.step);
    if (drag.mode === 'stretch') {
      const length = Math.max(1, Math.min(cell.step - drag.note.step + 1, roomAfter(track, drag.note)));
      if (length === drag.note.length) return;
      drag.note.length = length;
    } else if (drag.mode === 'paint' && !hit) {
      addNote(track, cell.row, cell.step);
    } else if (drag.mode === 'erase' && hit) {
      removeNote(track, hit);
    } else {
      return;
    }
    store.changed();
  });

  canvas.addEventListener('pointerup', () => {
    if (heldTouch) toggleNote(heldTouch.cell);
    releaseHeldTouch();
    drag = null;
  });
  canvas.addEventListener('pointercancel', () => {
    releaseHeldTouch();
    drag = null;
  });
  canvas.addEventListener('touchmove', (event) => {
    if (drag) event.preventDefault();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    if (!drag) drawGrid();
  });

  labels.addEventListener('pointerdown', (event) => {
    const box = labels.getBoundingClientRect();
    const row = layout.rows - 1 - Math.floor((event.clientY - box.top - RULER_HEIGHT) / layout.cellHeight);
    if (row >= 0 && row < layout.rows) onPlayRow(row);
  });

  function barAt(event) {
    const box = ruler.getBoundingClientRect();
    const bar = Math.floor((event.clientX - box.left + scroller.scrollLeft) / (barSteps(store.song) * layout.cellWidth));
    return Math.max(0, Math.min(store.song.bars - 1, bar));
  }

  const pickRange = (anchor, bar) => onPickBars({ start: Math.min(anchor, bar), end: Math.max(anchor, bar) + 1 });

  function extendAnchor(bar) {
    const { selection } = store;
    if (!selection) return bar;
    return bar < selection.start ? selection.end - 1 : selection.start;
  }

  ruler.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const bar = barAt(event);
    const { selection } = store;
    if (!event.shiftKey && selection?.start === bar && selection.end === bar + 1) {
      onPickBars(null);
      return;
    }
    ruler.setPointerCapture(event.pointerId);
    barDrag = { anchor: event.shiftKey ? extendAnchor(bar) : bar };
    pickRange(barDrag.anchor, bar);
  });
  ruler.addEventListener('pointermove', (event) => {
    if (barDrag) pickRange(barDrag.anchor, barAt(event));
  });
  ruler.addEventListener('pointerup', () => (barDrag = null));
  ruler.addEventListener('pointercancel', () => (barDrag = null));

  scroller.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      drawRuler();
      drawGrid();
    });
  }, { passive: true });

  new ResizeObserver(() => draw()).observe(scroller);
  coarsePointer.addEventListener('change', draw);

  return {
    draw,
    setPlayStep(step) {
      playStep = step;
      drawRuler();
      drawGrid();
      if (step < 0) return;
      const x = step * layout.cellWidth;
      if (x < scroller.scrollLeft || x > scroller.scrollLeft + scroller.clientWidth - layout.cellWidth) scroller.scrollLeft = Math.max(0, x - layout.cellWidth);
    },
  };
}
