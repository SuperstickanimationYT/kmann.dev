import { BUILDINGS } from './items.js';
import {
  CHUNKS, COLS, ROWS, TILE_SIZE, airGeneratorRunning, currentGrid, exposed, processBlocked, tileAt, tileCenter,
} from './base.js';
import { drawCostume } from './sprites.js';

const MODE_ART = { play: 'mode-play', build: 'mode-build', place: 'mode-place' };
export const MODE_BADGE = { x: -193, y: 140, left: -236, right: -150, bottom: 120, top: 178 };

function toCanvas(x, y) {
  return { x: 240 + x, y: 180 - y };
}

function drawTiles(context, game) {
  const grid = currentGrid(game);
  for (let j = 0; j < ROWS; j += 1) {
    for (let i = 0; i < COLS; i += 1) {
      const tile = grid[j][i];
      const { x, y } = tileCenter(i, j);
      const art = tile.building ? BUILDINGS[tile.building.type].art : tile.kind;
      drawCostume(context, art, x, y, { size: TILE_SIZE });
      if (tile.building) drawBuildingStatus(context, tile.building, x, y);
    }
  }
}

function isWorking(b) {
  if (b.type === 'Air Generator') return airGeneratorRunning(b);
  if (b.type === 'Solar Panel') return b.battery != null && b.battery < 100;
  if (BUILDINGS[b.type].process) return !processBlocked(b);
  return null;
}

function drawBuildingStatus(context, b, x, y) {
  const at = toCanvas(x, y);
  if (b.battery != null) {
    context.fillStyle = '#111';
    context.fillRect(at.x + 13, at.y - 16, 5, 30);
    context.fillStyle = b.battery > 20 ? '#00ff08' : '#ff4040';
    const h = (28 * b.battery) / 100;
    context.fillRect(at.x + 14, at.y + 13 - h, 3, h);
  }
  const working = isWorking(b);
  if (working !== null) {
    context.fillStyle = working ? '#4dff6a' : '#ff5a4d';
    context.beginPath();
    context.arc(at.x - 14, at.y - 14, 3, 0, Math.PI * 2);
    context.fill();
  }
  if (b.rocket) drawRocket(context, b.rocket, at.x, at.y);
}

function drawRocket(context, rocket, cx, baseY) {
  let top = baseY + 8;
  const width = 12;
  if (rocket.engine) {
    context.fillStyle = '#444';
    context.beginPath();
    context.moveTo(cx - 3, top - 8);
    context.lineTo(cx + 3, top - 8);
    context.lineTo(cx + 6, top);
    context.lineTo(cx - 6, top);
    context.closePath();
    context.fill();
    top -= 8;
  }
  for (let t = 0; t < rocket.tanks; t += 1) {
    context.fillStyle = '#f2f2f2';
    context.strokeStyle = '#545454';
    context.lineWidth = 1.5;
    context.fillRect(cx - width / 2, top - 14, width, 14);
    context.strokeRect(cx - width / 2, top - 14, width, 14);
    top -= 14;
  }
  if (rocket.capsule) {
    context.fillStyle = '#d9d9d9';
    context.strokeStyle = '#545454';
    context.beginPath();
    context.moveTo(cx - width / 2, top);
    context.lineTo(cx + width / 2, top);
    context.lineTo(cx + 2, top - 12);
    context.lineTo(cx - 2, top - 12);
    context.closePath();
    context.fill();
    context.stroke();
  }
}

function drawHighlight(context, game) {
  if (game.phase !== 'playing' || game.mode === 'play' || game.chunk !== CHUNKS.main) return;
  const hit = tileAt(game.pointer.x, game.pointer.y);
  if (!hit) return;
  const { x, y } = toCanvas(tileCenter(hit.i, hit.j).x, tileCenter(hit.i, hit.j).y);
  context.strokeStyle = game.mode === 'build' ? '#ffffff' : '#ffd23f';
  context.lineWidth = 2;
  context.strokeRect(x - 20, y - 20, 40, 40);
}

function drawMonitor(context, x, y, label, value, danger) {
  context.font = 'bold 11px "Helvetica Neue", Helvetica, Arial, sans-serif';
  const text = value.toFixed(1);
  const labelWidth = context.measureText(label).width;
  const valueWidth = Math.max(32, context.measureText(text).width + 10);
  const width = labelWidth + valueWidth + 16;
  context.fillStyle = '#e6f0ff';
  context.strokeStyle = '#c3ccd9';
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(x, y, width, 22, 4);
  context.fill();
  context.stroke();
  context.fillStyle = '#575e75';
  context.fillText(label, x + 6, y + 15);
  context.fillStyle = danger ? '#e53935' : '#ff8c1a';
  context.beginPath();
  context.roundRect(x + labelWidth + 10, y + 3, valueWidth, 16, 4);
  context.fill();
  context.fillStyle = '#fff';
  context.fillText(text, x + labelWidth + 15, y + 15);
  return width;
}

function drawAirStatus(context, x, open) {
  const label = open ? 'Exposed to vacuum' : 'Sealed in';
  context.font = 'bold 11px "Helvetica Neue", Helvetica, Arial, sans-serif';
  const width = context.measureText(label).width + 12;
  context.fillStyle = open ? '#e53935' : '#2e9d4a';
  context.beginPath();
  context.roundRect(x, 8, width, 16, 4);
  context.fill();
  context.fillStyle = '#fff';
  context.fillText(label, x + 6, 20);
}

function drawHud(context, game) {
  if (!game.showHud || game.phase === 'landing') return;
  const { o2, co2 } = game.vitals;
  const width = drawMonitor(context, 100, 5, 'O2', o2, o2 < 85 || o2 > 115);
  const width2 = drawMonitor(context, 105 + width, 5, 'CO2', co2, co2 > 7);
  if (game.phase === 'playing') drawAirStatus(context, 110 + width + width2, exposed(game));
  context.font = 'bold 12px "Trebuchet MS", sans-serif';
  context.textAlign = 'right';
  context.fillStyle = 'rgba(0, 0, 0, 0.55)';
  const label = game.chunk;
  const w = context.measureText(label).width + 14;
  context.fillRect(475 - w, 5, w, 20);
  context.fillStyle = '#fff';
  context.fillText(label, 468, 19);
  context.textAlign = 'left';
}

function drawToast(context, game) {
  if (!game.toast) return;
  context.font = '13px "Trebuchet MS", sans-serif';
  const width = Math.min(460, context.measureText(game.toast.text).width + 20);
  context.globalAlpha = Math.min(1, 3.5 - game.toast.age);
  context.fillStyle = 'rgba(7, 22, 39, 0.9)';
  context.fillRect(240 - width / 2, 326, width, 26);
  context.fillStyle = '#e2effd';
  context.textAlign = 'center';
  context.fillText(game.toast.text, 240, 344, 450);
  context.textAlign = 'left';
  context.globalAlpha = 1;
}

function drawSteppingHint(context, game) {
  if (game.phase !== 'stepping' || game.steppingShrink > 0) return;
  context.font = 'bold 14px "Trebuchet MS", sans-serif';
  context.textAlign = 'center';
  context.fillStyle = 'rgba(0, 0, 0, 0.6)';
  context.fillRect(120, 300, 240, 26);
  context.fillStyle = '#fff';
  context.fillText('Click where to step out', 240, 318);
  context.textAlign = 'left';
}

export function drawBase(context, game) {
  context.fillStyle = '#5a5a5a';
  context.fillRect(0, 0, 480, 360);
  drawTiles(context, game);
  drawHighlight(context, game);
  if (game.chunk === CHUNKS.main) {
    drawCostume(context, game.lander.costume, 0, game.lander.y);
    for (const bit of game.lander.debris) drawCostume(context, 'debris', bit.x, bit.y);
  }
  if (game.phase !== 'landing') {
    const { player } = game;
    drawCostume(context, 'player', player.x, player.y, { size: player.size / 100, direction: player.direction });
  }
  if (game.phase !== 'landing') drawCostume(context, MODE_ART[game.mode], MODE_BADGE.x, MODE_BADGE.y);
  drawHud(context, game);
  drawSteppingHint(context, game);
  drawToast(context, game);
}
