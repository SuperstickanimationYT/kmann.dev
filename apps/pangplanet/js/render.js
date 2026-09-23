import { DRILL_OFFSET_SIDEWAYS } from './drill.js';
import { BODIES, MARKET, ROCKET_HEIGHT } from './world.js';

const STAGE_HEIGHT_UNITS = 360;
const FLAME_OFFSET = 50;
const ROCK_COUNT = 72;
const ROCK_LIFT = 5;
const LABEL_BELOW_PX = 40;
const HUGE_DISC_PX = 60000;
const TEXTURE_OVERSCAN = 1.04;
const STAR_TILE = 640;
const STAR_PARALLAX = 0.04;

const LOOKS = {
  earth: { fill: '#2b6fb0', rock: '#3fbf2a', atmosphere: 'rgba(110, 180, 255, 0.35)' },
  moon: { fill: '#bdbdbd', rock: '#8a8a8a' },
  wormhole: { fill: '#0c0c0c', rim: 'rgba(170, 120, 255, 0.55)' },
  sun: { fill: '#fff7dc', glow: 'rgba(255, 236, 170, 0.45)' },
};

function scatterStars() {
  const stars = [];
  let seed = 69420;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 170; i++) {
    stars.push({ x: random() * STAR_TILE, y: random() * STAR_TILE, size: random() < 0.85 ? 1 : 2, alpha: 0.25 + random() * 0.6 });
  }
  return stars;
}

const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus;

export function createRenderer(canvas, sprites) {
  const context = canvas.getContext('2d');
  const stars = scatterStars();
  const view = { x: 0, y: 0, angle: 0, zoom: 1, width: 0, height: 0, ppu: 1, cos: 1, sin: 0 };
  let ratio = 1;

  function resize() {
    ratio = window.devicePixelRatio || 1;
    const box = canvas.getBoundingClientRect();
    view.width = box.width;
    view.height = box.height;
    canvas.width = Math.round(box.width * ratio);
    canvas.height = Math.round(box.height * ratio);
  }

  function aim(camera) {
    Object.assign(view, camera);
    view.ppu = (camera.zoom * view.height) / STAGE_HEIGHT_UNITS;
    view.cos = Math.cos(camera.angle);
    view.sin = Math.sin(camera.angle);
  }

  function toScreen(x, y) {
    const dx = x - view.x;
    const dy = y - view.y;
    return [
      view.width / 2 + (dx * view.cos - dy * view.sin) * view.ppu,
      view.height / 2 - (dx * view.sin + dy * view.cos) * view.ppu,
    ];
  }

  function onScreen(sx, sy, reach) {
    return sx > -reach && sy > -reach && sx < view.width + reach && sy < view.height + reach;
  }

  function withPose(sx, sy, bearing, draw) {
    context.save();
    context.translate(sx, sy);
    context.rotate(bearing - view.angle);
    draw();
    context.restore();
  }

  function drawSprite(sprite, scaleX, scaleY = scaleX) {
    const [px, py] = sprite.pivot;
    context.drawImage(sprite.bitmap, -px * scaleX, -py * scaleY, sprite.width * scaleX, sprite.height * scaleY);
  }

  function drawStars() {
    const skyX = view.x * STAR_PARALLAX;
    const skyY = view.y * STAR_PARALLAX;
    const reach = Math.hypot(view.width, view.height) / 2;
    const tiles = Math.ceil(reach / STAR_TILE) + 1;
    context.save();
    context.translate(view.width / 2, view.height / 2);
    context.rotate(-view.angle);
    for (const star of stars) {
      const baseX = positiveModulo(star.x - skyX, STAR_TILE);
      const baseY = positiveModulo(star.y + skyY, STAR_TILE);
      context.fillStyle = `rgba(220, 235, 255, ${star.alpha})`;
      for (let i = -tiles; i < tiles; i++) {
        for (let j = -tiles; j < tiles; j++) {
          const x = baseX + i * STAR_TILE;
          const y = baseY + j * STAR_TILE;
          if (Math.abs(x) < reach && Math.abs(y) < reach) context.fillRect(x, y, star.size, star.size);
        }
      }
    }
    context.restore();
  }

  function discPath(sx, sy, radius) {
    context.beginPath();
    context.arc(sx, sy, radius, 0, Math.PI * 2);
  }

  function drawGlow(sx, sy, radius, spread, colour) {
    const gradient = context.createRadialGradient(sx, sy, radius, sx, sy, radius * spread);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.fillStyle = gradient;
    discPath(sx, sy, radius * spread);
    context.fill();
  }

  function drawTexture(sprite, sx, sy, radius, fill) {
    const reach = radius * TEXTURE_OVERSCAN;
    context.save();
    discPath(sx, sy, radius);
    context.fillStyle = fill;
    context.fill();
    context.clip();
    context.translate(sx, sy);
    context.rotate(-view.angle);
    context.drawImage(sprite.bitmap, -reach, -reach, reach * 2, reach * 2);
    context.restore();
  }

  function drawBody(body) {
    const [sx, sy] = toScreen(body.x, body.y);
    const radius = body.radius * view.ppu;
    const look = LOOKS[body.look];
    if (!onScreen(sx, sy, radius * 1.2)) return;
    if (radius < 1.5) {
      context.fillStyle = look.fill;
      discPath(sx, sy, 1.5);
      context.fill();
      return;
    }
    if (look.glow) drawGlow(sx, sy, radius, 1.25, look.glow);
    if (look.atmosphere) drawGlow(sx, sy, radius, 1.04, look.atmosphere);

    const sprite = sprites[body.look];
    if (!sprite || radius > HUGE_DISC_PX) {
      context.fillStyle = look.fill;
      discPath(sx, sy, radius);
      context.fill();
    } else if (body.look === 'wormhole') {
      withPose(sx, sy, 0, () => drawSprite(sprite, radius / sprite.pivot[0]));
    } else {
      drawTexture(sprite, sx, sy, radius, look.fill);
    }
    if (look.rim) {
      context.strokeStyle = look.rim;
      context.lineWidth = Math.max(1, radius * 0.01);
      discPath(sx, sy, radius);
      context.stroke();
    }
    if (look.rock) drawRocks(body, look.rock);
  }

  function drawRocks(body, colour) {
    const scale = view.ppu;
    if (scale < 0.02) return;
    const reach = 60 * scale;
    context.fillStyle = colour;
    for (let i = 0; i < ROCK_COUNT; i++) {
      const bearing = ((i + 0.5) / ROCK_COUNT) * Math.PI * 2;
      const lift = body.radius + ROCK_LIFT;
      const [sx, sy] = toScreen(body.x + Math.sin(bearing) * lift, body.y + Math.cos(bearing) * lift);
      if (!onScreen(sx, sy, reach)) continue;
      withPose(sx, sy, bearing, () => {
        context.beginPath();
        context.arc(0, 0, 18.6 * scale, 0, Math.PI * 2);
        context.arc(0, -28.8 * scale, 6 * scale, 0, Math.PI * 2);
        context.fill();
      });
    }
  }

  function drawLabel(text, sx, sy, colour) {
    context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
    context.textAlign = 'center';
    context.fillStyle = colour;
    context.fillText(text, sx, sy);
  }

  function drawBodyLabels() {
    for (const body of BODIES) {
      const radius = body.radius * view.ppu;
      if (radius > LABEL_BELOW_PX) continue;
      const [sx, sy] = toScreen(body.x, body.y);
      const offset = Math.max(radius, 2) + (body.kind === 'wormhole' ? -8 : 14);
      if (onScreen(sx, sy, 40)) drawLabel(body.name, sx, sy + (body.kind === 'wormhole' ? -offset : offset), 'rgba(185, 214, 245, 0.8)');
    }
  }

  function drawMarket() {
    const [sx, sy] = toScreen(MARKET.x, MARKET.y);
    const scale = MARKET.scale * view.ppu;
    const sprite = sprites.market;
    if (!onScreen(sx, sy, sprite.height * scale)) return;
    if (sprite.height * scale < 6) {
      context.fillStyle = '#5fe3ff';
      context.fillRect(sx - 2, sy - 2, 4, 4);
      drawLabel('Market', sx, sy + 16, 'rgba(95, 227, 255, 0.85)');
      return;
    }
    withPose(sx, sy, 0, () => drawSprite(sprite, scale));
  }

  function drawForecast(forecast) {
    if (!forecast) return;
    context.strokeStyle = 'rgba(95, 227, 255, 0.45)';
    context.lineWidth = 1.5;
    context.lineJoin = 'round';
    for (const points of forecast.segments) {
      if (points.length < 4) continue;
      context.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const [sx, sy] = toScreen(points[i], points[i + 1]);
        if (i === 0) context.moveTo(sx, sy);
        else context.lineTo(sx, sy);
      }
      context.stroke();
    }
    const { ending } = forecast;
    if (!ending) return;
    const [sx, sy] = toScreen(ending.x, ending.y);
    context.lineWidth = 2;
    context.beginPath();
    if (ending.kind === 'crash') {
      context.strokeStyle = '#ff5b4a';
      context.moveTo(sx - 6, sy - 6);
      context.lineTo(sx + 6, sy + 6);
      context.moveTo(sx + 6, sy - 6);
      context.lineTo(sx - 6, sy + 6);
    } else {
      context.strokeStyle = '#6dff8c';
      context.arc(sx, sy, 5, 0, Math.PI * 2);
    }
    context.stroke();
  }

  function rocketPoint(rocket, forward, sideways) {
    const { heading } = rocket;
    return [
      rocket.x + Math.sin(heading) * forward + Math.cos(heading) * sideways,
      rocket.y + Math.cos(heading) * forward - Math.sin(heading) * sideways,
    ];
  }

  function drawDrill(rocket, drill) {
    if (drill.phase === 'idle') return;
    const [sx, sy] = toScreen(...rocketPoint(rocket, -drill.extension, DRILL_OFFSET_SIDEWAYS));
    context.globalAlpha = drill.opacity;
    withPose(sx, sy, rocket.heading, () => drawSprite(sprites.drill, view.ppu));
    context.globalAlpha = 1;
  }

  function drawRocket(rocket) {
    if (rocket.destroyed) return;
    const [sx, sy] = toScreen(rocket.x, rocket.y);
    if (ROCKET_HEIGHT * view.ppu < 10) {
      withPose(sx, sy, rocket.heading, () => {
        context.fillStyle = '#e2effd';
        context.beginPath();
        context.moveTo(0, -7);
        context.lineTo(5, 5);
        context.lineTo(-5, 5);
        context.closePath();
        context.fill();
      });
      return;
    }
    if (rocket.engineOn && rocket.throttle > 0) {
      const [fx, fy] = toScreen(...rocketPoint(rocket, -FLAME_OFFSET, 0));
      withPose(fx, fy, rocket.heading - Math.PI / 2, () => drawSprite(sprites.flame, (view.ppu * rocket.throttle) / 100, view.ppu));
    }
    withPose(sx, sy, rocket.heading, () => drawSprite(sprites.rocket, view.ppu));
  }

  function drawExplosion(explosion) {
    if (!explosion) return;
    const [sx, sy] = toScreen(explosion.x, explosion.y);
    context.globalAlpha = Math.max(0, 1 - explosion.ghost);
    withPose(sx, sy, 0, () => drawSprite(sprites.explosion, explosion.size * view.ppu));
    context.globalAlpha = 1;
  }

  function draw(scene) {
    aim(scene.camera);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#000';
    context.fillRect(0, 0, view.width, view.height);
    drawStars();
    BODIES.forEach(drawBody);
    drawMarket();
    drawBodyLabels();
    drawForecast(scene.forecast);
    drawDrill(scene.rocket, scene.drill);
    drawRocket(scene.rocket);
    drawExplosion(scene.explosion);
  }

  function screenDistanceTo(x, y, clientX, clientY) {
    const box = canvas.getBoundingClientRect();
    const [sx, sy] = toScreen(x, y);
    return Math.hypot(clientX - box.left - sx, clientY - box.top - sy);
  }

  function hitsRocket(rocket, clientX, clientY) {
    const reach = Math.max((ROCKET_HEIGHT / 2) * view.ppu, 14);
    return screenDistanceTo(rocket.x, rocket.y, clientX, clientY) <= reach;
  }

  function hitsDrill(rocket, drill, clientX, clientY) {
    const [x, y] = rocketPoint(rocket, -drill.extension - 5, DRILL_OFFSET_SIDEWAYS);
    return screenDistanceTo(x, y, clientX, clientY) <= Math.max(22 * view.ppu, 12);
  }

  return { resize, draw, hitsRocket, hitsDrill, get pixelsPerUnit() { return view.ppu; } };
}
