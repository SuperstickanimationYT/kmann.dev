import { V, add, mul, scaleOf, IDENTITY } from './geom.js';
import { eachLayer } from './view.js';
import { POST_RADIUS, regionPath, worldCurve, postPoints, handlePoint, isPassable, frontNormal } from './portals.js';
import { allEnds, buildCopies, bodyMatrix, castLaser, isOpen } from './physics.js';

export const ROOM = { width: 24, height: 13.5 };
const BIG = 1e4;
const POCKET_GRID = 80;

export function fitView(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const scale = Math.min(w / (ROOM.width + 1.2), h / (ROOM.height + 1.2));
  return {
    dpr,
    scale,
    ox: (w - ROOM.width * scale) / 2,
    oy: (h + ROOM.height * scale) / 2,
  };
}

export const toWorld = (view, sx, sy) => V((sx - view.ox) / view.scale, (view.oy - sy) / view.scale);

function tracePath(ctx, pts, close = true) {
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

function clipTo(ctx, region, invert) {
  ctx.beginPath();
  if (region.complement !== invert) ctx.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  tracePath(ctx, region.points);
  ctx.clip('evenodd');
}

function drawBodyShape(ctx, body, px) {
  ctx.save();
  const m = bodyMatrix(body);
  ctx.transform(m.a, m.c, m.b, m.d, m.x, m.y);
  ctx.beginPath();
  if (body.kind === 'ball') ctx.arc(0, 0, body.radius, 0, 2 * Math.PI);
  else tracePath(ctx, body.verts);
  ctx.fillStyle = body.color;
  ctx.fill();
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.stroke();
  if (body.generation > 0) {
    ctx.setLineDash([4 * px, 3 * px]);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  ctx.restore();
}

function drawBody(ctx, world, body, px, selected, level) {
  for (const copy of buildCopies(world, body)) {
    if (copy.level !== level) continue;
    const grown = scaleOf(copy.T);
    ctx.save();
    if (copy.from) {
      clipTo(ctx, regionPath(copy.to, copy.exitSide, body.r * 3 * grown), false);
      ctx.transform(copy.T.a, copy.T.c, copy.T.b, copy.T.d, copy.T.x, copy.T.y);
    } else {
      for (const { end, side } of copy.straddles) clipTo(ctx, regionPath(end, -side, body.r * 3), true);
    }
    drawBodyShape(ctx, body, px / grown);
    if (selected) {
      ctx.save();
      const m = bodyMatrix(body);
      ctx.transform(m.a, m.c, m.b, m.d, m.x, m.y);
      ctx.beginPath();
      if (body.kind === 'ball') ctx.arc(0, 0, body.radius + 4 * px, 0, 2 * Math.PI);
      else tracePath(ctx, body.verts);
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.lineWidth = 2 * px;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

function drawLabel(ctx, text, at, px, color) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(px, -px);
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function timeLabel(end) {
  const shift = end.pair.delay;
  return `${end.index === 0 ? '−' : '+'}${shift} s`;
}

function drawEnd(ctx, end, px, selected, time) {
  const color = end.pair.colors[end.index];
  const curve = worldCurve(end);
  ctx.save();
  if (!isOpen(end, time)) ctx.globalAlpha = 0.3;
  for (const side of [1, -1]) {
    if (!isPassable(end, side)) continue;
    const region = regionPath(end, side, 0.35);
    ctx.save();
    clipTo(ctx, region, false);
    ctx.beginPath();
    tracePath(ctx, curve, end.closed);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = color + '30';
    ctx.stroke();
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = color + '40';
    ctx.stroke();
    ctx.restore();
  }
  if (!end.closed && end.pair.kind === 'wall') {
    const back = regionPath(end, -end.plusYSide, 0.14);
    ctx.beginPath();
    tracePath(ctx, back.points);
    ctx.fillStyle = '#2a3b4f';
    ctx.fill();
  }
  ctx.beginPath();
  tracePath(ctx, curve, end.closed);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 0.07;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.shadowBlur = 0;
  for (const p of postPoints(end)) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, POST_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = '#e8eef5';
    ctx.fill();
  }
  ctx.restore();
  if (end.pair.delay > 0) drawLabel(ctx, timeLabel(end), add(handlePoint(end), mul(frontNormal(end), 0.9)), px, color);
  if (selected) {
    ctx.beginPath();
    tracePath(ctx, curve, end.closed);
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.lineWidth = 2 * px;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.setLineDash([]);
    drawHandle(ctx, V(end.pose.x, end.pose.y), handlePoint(end), px);
    drawMotionPath(ctx, end, px);
  }
}

function drawHandle(ctx, from, to, px) {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(to.x, to.y, 7 * px, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
}

function drawMotionPath(ctx, end, px) {
  const m = end.motion;
  const b = end.base;
  ctx.beginPath();
  if (m.type === 'slide') {
    const dir = (m.direction * Math.PI) / 180;
    const d = mul(V(Math.cos(dir), Math.sin(dir)), m.distance);
    ctx.moveTo(b.x - d.x, b.y - d.y);
    ctx.lineTo(b.x + d.x, b.y + d.y);
  } else if (m.type === 'orbit') {
    ctx.arc(b.x, b.y, m.distance, 0, 2 * Math.PI);
  } else {
    return;
  }
  ctx.setLineDash([4 * px, 6 * px]);
  ctx.lineWidth = 1.5 * px;
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGrid(ctx) {
  ctx.fillStyle = '#0a1826';
  ctx.fillRect(0, 0, ROOM.width, ROOM.height);
  ctx.beginPath();
  for (let x = 1; x < ROOM.width; x++) { ctx.moveTo(x, 0); ctx.lineTo(x, ROOM.height); }
  for (let y = 1; y < ROOM.height; y++) { ctx.moveTo(0, y); ctx.lineTo(ROOM.width, y); }
  ctx.lineWidth = 0.015;
  ctx.strokeStyle = 'rgba(95,227,255,0.07)';
  ctx.stroke();
}

function drawPocket(ctx) {
  ctx.fillStyle = '#100c24';
  ctx.fillRect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  ctx.beginPath();
  for (let i = -POCKET_GRID; i <= POCKET_GRID; i += 2) {
    ctx.moveTo(i, -POCKET_GRID); ctx.lineTo(i, POCKET_GRID);
    ctx.moveTo(-POCKET_GRID, i); ctx.lineTo(POCKET_GRID, i);
  }
  ctx.lineWidth = 0.015;
  ctx.strokeStyle = 'rgba(190,150,255,0.08)';
  ctx.stroke();
}

function drawScene(ctx, world, ui, px, level) {
  if (level === 0) drawGrid(ctx);
  else drawPocket(ctx);

  for (const wall of world.walls) {
    if (wall.level !== level) continue;
    ctx.beginPath();
    tracePath(ctx, wall.shape.v);
    ctx.fillStyle = ui.selected?.wall === wall ? '#3f5f80' : '#24384d';
    ctx.fill();
    ctx.lineWidth = 1.5 * px;
    ctx.strokeStyle = '#3d6187';
    ctx.stroke();
  }

  for (const body of world.bodies) drawBody(ctx, world, body, px, ui.selected?.body === body, level);

  for (const laser of world.lasers) {
    ctx.beginPath();
    for (const [a, b, at] of castLaser(world, laser)) {
      if (at === level) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
    }
    ctx.lineCap = 'round';
    ctx.shadowColor = laser.color;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = laser.color;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (laser.level !== level) continue;
    ctx.save();
    ctx.translate(laser.x, laser.y);
    ctx.rotate(laser.angle);
    ctx.fillStyle = '#9aa8b8';
    ctx.fillRect(-0.45, -0.15, 0.5, 0.3);
    ctx.restore();
    if (ui.selected?.laser === laser) {
      const tip = add(V(laser.x, laser.y), mul(V(-Math.sin(laser.angle), Math.cos(laser.angle)), 0.8));
      drawHandle(ctx, V(laser.x, laser.y), tip, px);
    }
  }

}

function drawEnds(ctx, world, ui, px, level, cameFrom) {
  for (const end of allEnds(world)) {
    if (end.level === level && end !== cameFrom) drawEnd(ctx, end, px, ui.selected?.end === end, world.time);
  }
}

function drawEye(ctx, eye, px) {
  ctx.beginPath();
  ctx.ellipse(eye.x, eye.y, 13 * px, 8 * px, 0, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(eye.x, eye.y, 4.5 * px, 0, 2 * Math.PI);
  ctx.fillStyle = '#0a1826';
  ctx.fill();
}

const transformBy = (ctx, m) => ctx.transform(m.a, m.c, m.b, m.d, m.x, m.y);

export function render(ctx, view, world, ui) {
  const { dpr, scale, ox, oy } = view;
  const camera = ui.camera ?? IDENTITY;
  const px = 1 / (scale * scaleOf(camera));
  const toScreen = (map) => {
    ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, dpr * ox, dpr * oy);
    transformBy(ctx, camera);
    transformBy(ctx, map);
  };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#03080f';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const layers = [];
  if (ui.eye) eachLayer(world, ui.eye, ui.eyeLevel, (layer) => layers.push(layer));
  else layers.push({ map: IDENTITY, depth: 0, clips: [], level: 0 });
  for (const pass of [drawScene, drawEnds]) {
    for (const { map, depth, clips, level, cameFrom } of layers) {
      ctx.save();
      for (const clip of clips) {
        toScreen(clip.map);
        ctx.beginPath();
        tracePath(ctx, clip.region);
        ctx.clip();
      }
      toScreen(map);
      if (depth > 0 && pass === drawScene) {
        ctx.fillStyle = '#03080f';
        ctx.fillRect(-BIG, -BIG, 2 * BIG, 2 * BIG);
      }
      pass(ctx, world, ui, px / scaleOf(map), level, cameFrom);
      ctx.restore();
    }
  }

  toScreen(IDENTITY);
  if (ui.eye) drawEye(ctx, ui.eye, px);
  if (ui.preview) ui.preview(ctx, px);
}
