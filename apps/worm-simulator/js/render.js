import { BODY_WIDTH, FOOD_RADIUS, GRAIN_RADIUS, pondReach } from './world.js';

const SAND = '#e9cf9b';
const TRACK_LIFETIME = 40;
const POND_OUTLINE_POINTS = 72;

function speckledSand() {
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const paint = tile.getContext('2d');
  paint.fillStyle = SAND;
  paint.fillRect(0, 0, tile.width, tile.height);
  const tones = ['rgba(150, 105, 50, 0.22)', 'rgba(255, 245, 215, 0.5)', 'rgba(120, 80, 40, 0.14)'];
  for (let speck = 0; speck < 900; speck += 1) {
    paint.fillStyle = tones[speck % tones.length];
    paint.fillRect(Math.random() * tile.width, Math.random() * tile.height, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
  return tile;
}

function pondOutline(pond, inset = 1) {
  const outline = new Path2D();
  for (let step = 0; step <= POND_OUTLINE_POINTS; step += 1) {
    const angle = (step / POND_OUTLINE_POINTS) * Math.PI * 2;
    const reach = pondReach(pond, angle) * inset;
    const x = pond.x + Math.cos(angle) * reach;
    const y = pond.y + Math.sin(angle) * reach;
    if (step === 0) outline.moveTo(x, y);
    else outline.lineTo(x, y);
  }
  outline.closePath();
  return outline;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const sandPattern = context.createPattern(speckledSand(), 'repeat');

  function drawGround(world) {
    context.fillStyle = sandPattern;
    context.fillRect(0, 0, world.width, world.height);
  }

  function drawTracks(world) {
    context.lineCap = 'round';
    context.lineWidth = BODY_WIDTH - 3;
    for (let index = 1; index < world.tracks.length; index += 1) {
      const point = world.tracks[index];
      if (point.gap) continue;
      const fade = 1 - (world.time - point.born) / TRACK_LIFETIME;
      if (fade <= 0) continue;
      const previous = world.tracks[index - 1];
      context.strokeStyle = `rgba(150, 105, 55, ${0.22 * fade})`;
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    }
  }

  function drawBed(world) {
    const { x, y } = world.home;
    const hollow = context.createRadialGradient(x, y, 2, x, y, 26);
    hollow.addColorStop(0, 'rgba(95, 60, 25, 0.55)');
    hollow.addColorStop(0.7, 'rgba(130, 90, 45, 0.25)');
    hollow.addColorStop(1, 'rgba(130, 90, 45, 0)');
    context.fillStyle = hollow;
    context.beginPath();
    context.ellipse(x, y, 26, 20, 0, 0, Math.PI * 2);
    context.fill();
  }

  function drawGrains(world) {
    const shadow = new Path2D();
    const body = new Path2D();
    const shine = new Path2D();
    for (const { x, y } of world.grains) {
      shadow.moveTo(x + GRAIN_RADIUS + 1, y + 1.5);
      shadow.arc(x + 1, y + 1.5, GRAIN_RADIUS, 0, Math.PI * 2);
      body.moveTo(x + GRAIN_RADIUS, y);
      body.arc(x, y, GRAIN_RADIUS, 0, Math.PI * 2);
      shine.moveTo(x - 1.2 + 1.6, y - 1.6);
      shine.arc(x - 1.2, y - 1.6, 1.6, 0, Math.PI * 2);
    }
    context.fillStyle = 'rgba(110, 70, 25, 0.28)';
    context.fill(shadow);
    context.fillStyle = '#f08a1c';
    context.fill(body);
    context.strokeStyle = '#b8600d';
    context.lineWidth = 1;
    context.stroke(body);
    context.fillStyle = 'rgba(255, 225, 170, 0.75)';
    context.fill(shine);
  }

  function drawPond(world) {
    const { pond, time } = world;
    const water = context.createRadialGradient(pond.x, pond.y, 10, pond.x, pond.y, pond.radius * 1.2);
    water.addColorStop(0, 'rgba(0, 95, 190, 0.94)');
    water.addColorStop(1, 'rgba(0, 150, 255, 0.86)');
    context.fillStyle = 'rgba(120, 85, 40, 0.35)';
    context.fill(pondOutline(pond, 1.07));
    context.fillStyle = water;
    context.fill(pondOutline(pond));
    context.lineWidth = 1.5;
    for (let ring = 0; ring < 3; ring += 1) {
      const swell = ((time * 0.12 + ring / 3) % 1);
      context.strokeStyle = `rgba(200, 235, 255, ${0.35 * (1 - swell)})`;
      context.stroke(pondOutline(pond, 0.35 + swell * 0.6));
    }
    context.strokeStyle = 'rgba(225, 245, 255, 0.7)';
    context.lineWidth = 2;
    context.stroke(pondOutline(pond));
  }

  function drawFood(world) {
    const pulse = 1 + Math.sin(world.time * 4) * 0.15;
    for (const { x, y } of world.foods) {
      context.fillStyle = 'rgba(255, 60, 40, 0.18)';
      context.beginPath();
      context.arc(x, y, FOOD_RADIUS * 2.6 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#a10000';
      context.beginPath();
      context.arc(x, y, FOOD_RADIUS, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255, 170, 160, 0.8)';
      context.beginPath();
      context.arc(x - 1, y - 1, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  function strokeBody(segments, width, colour) {
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.beginPath();
    context.moveTo(segments[0].x, segments[0].y);
    for (let index = 1; index < segments.length - 1; index += 1) {
      const midX = (segments[index].x + segments[index + 1].x) / 2;
      const midY = (segments[index].y + segments[index + 1].y) / 2;
      context.quadraticCurveTo(segments[index].x, segments[index].y, midX, midY);
    }
    context.lineTo(segments.at(-1).x, segments.at(-1).y);
    context.stroke();
  }

  function drawRings(segments) {
    context.strokeStyle = 'rgba(70, 35, 0, 0.45)';
    context.lineWidth = 1.2;
    for (let index = 2; index < segments.length - 1; index += 1) {
      const ahead = segments[index - 1];
      const behind = segments[index + 1];
      const across = Math.atan2(behind.y - ahead.y, behind.x - ahead.x) + Math.PI / 2;
      const reach = BODY_WIDTH / 2 - 1;
      const { x, y } = segments[index];
      context.beginPath();
      context.moveTo(x + Math.cos(across) * reach, y + Math.sin(across) * reach);
      context.lineTo(x - Math.cos(across) * reach, y - Math.sin(across) * reach);
      context.stroke();
    }
  }

  function drawFace(world) {
    const [lead, neck] = world.worm.segments;
    const facing = Math.atan2(lead.y - neck.y, lead.x - neck.x);
    context.fillStyle = '#a05d00';
    context.strokeStyle = '#5c3300';
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(lead.x, lead.y, BODY_WIDTH / 2 + 0.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    const asleep = world.mode === 'sleep' || world.death;
    for (const side of [-1, 1]) {
      const eyeX = lead.x + Math.cos(facing + side * 0.75) * 4.2;
      const eyeY = lead.y + Math.sin(facing + side * 0.75) * 4.2;
      if (asleep) {
        context.strokeStyle = '#2b1600';
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(eyeX - Math.cos(facing) * 1.8, eyeY - Math.sin(facing) * 1.8);
        context.lineTo(eyeX + Math.cos(facing) * 1.8, eyeY + Math.sin(facing) * 1.8);
        context.stroke();
      } else {
        context.fillStyle = '#fff';
        context.beginPath();
        context.arc(eyeX, eyeY, 2.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#1a0d00';
        context.beginPath();
        context.arc(eyeX + Math.cos(facing) * 0.9, eyeY + Math.sin(facing) * 0.9, 1.2, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  function drawSnores(world) {
    if (world.mode !== 'sleep' || world.death) return;
    const lead = world.worm.segments[0];
    context.font = '700 11px "Trebuchet MS", sans-serif';
    for (let index = 0; index < 3; index += 1) {
      const rise = (world.time * 0.5 + index / 3) % 1;
      context.fillStyle = `rgba(40, 60, 110, ${0.8 * (1 - rise)})`;
      context.fillText('z', lead.x + 8 + rise * 14 + Math.sin(rise * 6) * 2, lead.y - 10 - rise * 26);
    }
  }

  function drawWorm(world) {
    const { segments } = world.worm;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    strokeBody(segments.map(({ x, y }) => ({ x: x + 1.5, y: y + 2 })), BODY_WIDTH, 'rgba(90, 55, 15, 0.3)');
    strokeBody(segments, BODY_WIDTH + 3, '#5c3300');
    strokeBody(segments, BODY_WIDTH, world.death ? '#8a6a45' : '#a26600');
    strokeBody(segments, 4, 'rgba(255, 200, 130, 0.28)');
    drawRings(segments);
    drawFace(world);
    drawSnores(world);
  }

  return function draw(world, scale) {
    const ratio = window.devicePixelRatio || 1;
    context.setTransform(scale * ratio, 0, 0, scale * ratio, 0, 0);
    drawGround(world);
    drawTracks(world);
    drawBed(world);
    drawGrains(world);
    drawPond(world);
    drawFood(world);
    drawWorm(world);
  };
}
