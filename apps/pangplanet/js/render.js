import { speciesByKey } from './aliens.js';
import { DRILL_OFFSET_SIDEWAYS } from './drill.js';
import { partBounds, partColour } from './fleet.js';
import { haulerPose } from './haulers.js';
import { floraOf, hasFlora } from './plants.js';
import { runsOnStarlight } from './outposts.js';
import { rocketPoint } from './physics.js';
import { bountyWaiting } from './progression.js';
import { planetTexture } from './textures.js';
import { bodies } from './universe.js';
import { ANTENNA, DRONE_SCALE, FLAME_OFFSET, MARKET, ROCKET_HEIGHT } from './world.js';
import { sailPose } from './science.js';
import { brightestStar, storedCharge } from './solar.js';
import { relativeSpeed, shipHeading } from './ships.js';

const STAGE_HEIGHT_UNITS = 360;
const ROCK_COUNT = 72;
const ROCK_LIFT = 5;
const PLANTS_SHOWN_FROM_PPU = 0.05;
const LABEL_BELOW_PX = 40;
const LABEL_LINE_PX = 14;
const LABEL_GAP_PX = 6;
const LABEL_SEPARATOR = ', ';
const LABEL_SEPARATOR_COLOUR = 'rgba(185, 214, 245, 0.6)';
const SHOWN_FROM_PPU = { minor: 3e-3, intermediate: 1e-3, major: 0 };
const CLEAR_OF_MAJOR_BODY_PX = 12;
const ORBIT_RING = { colour: 'rgba(185, 214, 245, 0.14)', shownFromPx: 16, shownUpToPx: 50000 };
const CLOUD_TURN_TICKS = 30 * 60 * 5;
const HUGE_DISC_PX = 60000;
const TEXTURE_OVERSCAN = 1.04;
const TEXTURED_ABOVE_PX = 6;
const WARP_STREAKS = 90;
const RING_BANDS = [[0, 1], [0.35, 1], [0.4, 0], [0.45, 1], [0.8, 1], [1, 0]];
const STAR_TILE = 640;
const STAR_PARALLAX = 0.04;
const SOLAR_PANEL = { reach: 55, width: 22, inset: 8, cells: 4 };
const SATELLITE_SHAPE = { core: 30, panelReach: 60, panelWidth: 18 };
const RIG_SHAPE = { base: 50, height: 80, besideRocket: 75 };
const OUTPOST_DOT_BELOW_PX = 8;
const ANTENNA_SHAPE = { height: 110, dish: 22, besideRocket: -75 };
const BANK_SHAPE = { width: 56, height: 36, cells: 5 };
const OBSERVATORY_SHAPE = { width: 48, height: 26, dome: 22, tube: 34, tubeWidth: 9, tilt: -0.6, lamp: 4 };
const SIGNAL_RING_MAX_PX = 50000;
const PROMINENCE = { count: 7, height: 0.14, span: 0.22, ticksPerCycle: 1200, shownAbovePx: 25 };
const SCOOP_STREAM = { dots: 24, ticksPerTrip: 75, sway: 0.05, sizePx: 3 };
const SHIP_BLOCK = { size: 22, outline: '#0b1a2e' };
const HAULER_SCALE = 0.8;
const SHIP_SCALE = 1.4;
const SHIP_SPEED_SHOWN_WITHIN = 60000;
const SAIL_COLOUR = '#9dffb0';
const HAULER_LOOKS = { hauler: { label: 'Hauler', colour: '#6dff8c' }, builder: { label: 'Builder', colour: '#ffc933' } };
const FLICKER_WAVES = [[0.9, 0.07], [2.3, 0.05], [5.1, 0.03]];
const RESOURCE_LABELS = {
  crystals: { text: 'crystals', colour: 'rgba(125, 243, 255, 0.9)' },
  stardust: { text: 'stardust', colour: 'rgba(226, 201, 255, 0.9)' },
};
const FLAME_CORE = { length: 0.55, width: 0.5 };
const FLAME_GLOW = { behind: 20, radius: 30, colour: 'rgba(255, 170, 60, 0.35)' };
const SMOKE_ALPHA = 0.35;

const LOOKS = {
  earth: { fill: '#2b6fb0', rock: '#3fbf2a', atmosphere: 'rgba(110, 180, 255, 0.35)' },
  moon: { fill: '#bdbdbd', rock: '#8a8a8a' },
  wormhole: { fill: '#0c0c0c', rim: 'rgba(170, 120, 255, 0.55)' },
  blackhole: { fill: '#000', dot: '#ff963c', rim: 'rgba(255, 200, 120, 0.9)', glow: 'rgba(255, 140, 60, 0.3)' },
  sun: { fill: '#fff7dc', glow: 'rgba(255, 236, 170, 0.45)' },
};

function scatterStreaks() {
  let seed = 31337;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: WARP_STREAKS }, () => ({ bearing: random() * Math.PI * 2, start: 0.1 + random() * 0.5, length: 0.2 + random() * 0.6 }));
}

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
  const streaks = scatterStreaks();
  const view = { x: 0, y: 0, angle: 0, zoom: 1, width: 0, height: 0, ppu: 1, cos: 1, sin: 0 };
  const flamePhases = new WeakMap();
  let ratio = 1;
  let clock = 0;

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

  function drawRings(sx, sy, radius, { inner, outer, colour }) {
    const gradient = context.createRadialGradient(sx, sy, radius * inner, sx, sy, radius * outer);
    RING_BANDS.forEach(([stop, alpha]) => gradient.addColorStop(stop, alpha ? colour : 'rgba(0, 0, 0, 0)'));
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(sx, sy, radius * outer, 0, Math.PI * 2);
    context.arc(sx, sy, radius * inner, 0, Math.PI * 2, true);
    context.fill();
  }

  function drawTexture(image, sx, sy, radius, fill, overscan, turn = 0) {
    const reach = radius * overscan;
    context.save();
    discPath(sx, sy, radius);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    context.clip();
    context.translate(sx, sy);
    context.rotate(turn - view.angle);
    context.drawImage(image, -reach, -reach, reach * 2, reach * 2);
    context.restore();
  }

  function drawBody(body) {
    const [sx, sy] = toScreen(body.x, body.y);
    const radius = body.radius * view.ppu;
    const look = body.palette ?? LOOKS[body.look];
    if (!onScreen(sx, sy, radius * (body.rings?.outer ?? 1.2))) return;
    if (radius < 1.5) {
      context.fillStyle = look.dot ?? look.fill;
      discPath(sx, sy, 1.5);
      context.fill();
      return;
    }
    if (body.rings) drawRings(sx, sy, radius, body.rings);
    if (look.glow) drawGlow(sx, sy, radius, 1.25, look.glow);
    if (look.atmosphere) drawGlow(sx, sy, radius, 1.04, look.atmosphere);

    const sprite = sprites[body.look];
    const layers = body.planet && radius > TEXTURED_ABOVE_PX ? planetTexture(body, radius) : null;
    const texture = body.planet ? layers?.surface : sprite?.bitmap;
    if (!texture || radius > HUGE_DISC_PX) {
      context.fillStyle = look.fill;
      discPath(sx, sy, radius);
      context.fill();
    } else if (body.look === 'wormhole') {
      withPose(sx, sy, 0, () => drawSprite(sprite, radius / sprite.pivot[0]));
    } else {
      drawTexture(texture, sx, sy, radius, look.fill, body.planet ? 1 : TEXTURE_OVERSCAN);
      if (layers?.sky) drawTexture(layers.sky, sx, sy, radius, null, 1, cloudTurn(body));
    }
    if (look.rim) {
      context.strokeStyle = look.rim;
      context.lineWidth = Math.max(1, radius * 0.01);
      discPath(sx, sy, radius);
      context.stroke();
    }
    if (look.rock) drawRocks(body, look.rock);
    if (hasFlora(body)) drawPlants(body);
  }

  function cloudTurn(body) {
    const direction = body.planet.seed % 2 ? 1 : -1;
    return direction * ((clock / CLOUD_TURN_TICKS) % 1) * Math.PI * 2;
  }

  function drawOrbitRing(body) {
    if (!body.orbitCenter) return;
    const radiusPx = Math.hypot(body.x - body.orbitCenter.x, body.y - body.orbitCenter.y) * view.ppu;
    if (radiusPx < ORBIT_RING.shownFromPx || radiusPx > ORBIT_RING.shownUpToPx) return;
    const [cx, cy] = toScreen(body.orbitCenter.x, body.orbitCenter.y);
    if (!onScreen(cx, cy, radiusPx)) return;
    context.strokeStyle = ORBIT_RING.colour;
    context.lineWidth = 1;
    discPath(cx, cy, radiusPx);
    context.stroke();
  }

  const plantColour = (species, lighten = 0) => `hsl(${species.hue}, ${species.saturation}%, ${species.lightness + lighten}%)`;

  function drawTuft(species, height) {
    context.strokeStyle = plantColour(species);
    context.lineWidth = Math.max(1, height * 0.06);
    for (let blade = 0; blade < species.parts; blade++) {
      const angle = (blade / (species.parts - 1) - 0.5) * species.spread;
      const tipX = Math.sin(angle) * height * 0.7;
      const tipY = -Math.cos(angle) * height;
      context.beginPath();
      context.moveTo(0, 0);
      context.quadraticCurveTo(tipX * 0.2, tipY * 0.6, tipX, tipY);
      context.stroke();
    }
  }

  function drawFern(species, height) {
    context.strokeStyle = plantColour(species);
    context.lineWidth = Math.max(1, height * 0.05);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -height);
    for (let leaf = 1; leaf <= species.parts; leaf++) {
      const y = (-height * leaf) / (species.parts + 1);
      const reach = height * 0.35 * species.spread * (1 - leaf / (species.parts + 1));
      context.moveTo(-reach, y - reach * 0.4);
      context.lineTo(0, y);
      context.lineTo(reach, y - reach * 0.4);
    }
    context.stroke();
  }

  function drawBulb(species, height) {
    const stalk = height * 0.75;
    context.strokeStyle = plantColour(species, -10);
    context.lineWidth = Math.max(1, height * 0.06);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -stalk);
    context.stroke();
    context.fillStyle = plantColour(species, 12);
    context.beginPath();
    context.arc(0, -stalk, height * 0.25 * species.spread, 0, Math.PI * 2);
    context.fill();
  }

  function drawSpire(species, height) {
    context.fillStyle = plantColour(species);
    for (let spike = 0; spike < species.parts; spike++) {
      const offset = (spike / (species.parts - 1) - 0.5) * height * 0.5 * species.spread;
      const tall = height * (1 - Math.abs(offset) / height);
      const base = height * 0.08;
      context.beginPath();
      context.moveTo(offset - base, 0);
      context.lineTo(offset, -tall);
      context.lineTo(offset + base, 0);
      context.closePath();
      context.fill();
    }
  }

  const PLANT_DRAWERS = { tuft: drawTuft, fern: drawFern, bulb: drawBulb, spire: drawSpire };

  function drawPlants(body) {
    const scale = view.ppu;
    if (scale < PLANTS_SHOWN_FROM_PPU) return;
    context.lineCap = 'round';
    for (const { bearing, species, size, phase } of floraOf(body).plants) {
      const [sx, sy] = toScreen(body.x + Math.sin(bearing) * body.radius, body.y + Math.cos(bearing) * body.radius);
      const height = species.height * size * scale;
      if (!onScreen(sx, sy, height)) continue;
      const lean = Math.sin(clock * species.swayPerTick + phase) * species.sway;
      withPose(sx, sy, bearing + lean, () => PLANT_DRAWERS[species.shape](species, height));
    }
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

  let queuedLabels = [];

  function drawLabel(text, sx, sy, colour) {
    queuedLabels.push({ text, sx, sy, colour });
  }

  function mergeOverlapping(labels) {
    const lines = [];
    for (const label of labels) {
      const width = context.measureText(label.text).width;
      const line = lines.find(({ sx, sy, width: lineWidth }) => Math.abs(sy - label.sy) < LABEL_LINE_PX && Math.abs(sx - label.sx) < (lineWidth + width) / 2 + LABEL_GAP_PX);
      if (!line) lines.push({ sx: label.sx, sy: label.sy, width, parts: [label] });
      else {
        line.width += context.measureText(LABEL_SEPARATOR).width + width;
        line.parts.push(label);
      }
    }
    return lines;
  }

  function flushLabels() {
    context.font = '12px "Trebuchet MS", "Segoe UI", sans-serif';
    context.textAlign = 'left';
    for (const { sx, sy, width, parts } of mergeOverlapping(queuedLabels)) {
      let x = sx - width / 2;
      parts.forEach(({ text, colour }, index) => {
        if (index > 0) {
          context.fillStyle = LABEL_SEPARATOR_COLOUR;
          context.fillText(LABEL_SEPARATOR, x, sy);
          x += context.measureText(LABEL_SEPARATOR).width;
        }
        context.fillStyle = colour;
        context.fillText(text, x, sy);
        x += context.measureText(text).width;
      });
    }
    queuedLabels = [];
  }

  function drawBodyLabels(shownBodies, claimedBounties) {
    for (const body of shownBodies) {
      const radius = body.radius * view.ppu;
      if (radius > LABEL_BELOW_PX) continue;
      const [sx, sy] = toScreen(body.x, body.y);
      const offset = Math.max(radius, 2) + (body.kind === 'wormhole' ? -8 : 14);
      const bounty = bountyWaiting(claimedBounties, body);
      const find = RESOURCE_LABELS[body.resource];
      const species = speciesByKey[body.species];
      const label = [body.name, bounty && `${bounty} bounty`, find?.text, species && `${species.name} homeworld`].filter(Boolean).join(' · ');
      const colour = bounty ? 'rgba(255, 214, 110, 0.9)' : (species?.colour ?? find?.colour ?? 'rgba(185, 214, 245, 0.8)');
      if (onScreen(sx, sy, 40)) drawLabel(label, sx, sy + (body.kind === 'wormhole' ? -offset : offset), colour);
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

  function drawOutpostDot(sx, sy, label) {
    context.fillStyle = '#3fe0d0';
    context.fillRect(sx - 2, sy - 2, 4, 4);
    drawLabel(label, sx, sy + 16, 'rgba(63, 224, 208, 0.85)');
  }

  function drawSatellite(satellite) {
    if (!satellite?.deployed) return;
    const [sx, sy] = toScreen(satellite.x, satellite.y);
    const { core, panelReach, panelWidth } = SATELLITE_SHAPE;
    const scale = view.ppu;
    if (!onScreen(sx, sy, (core / 2 + panelReach) * scale + 20)) return;
    if (core * scale < OUTPOST_DOT_BELOW_PX) {
      drawOutpostDot(sx, sy, 'Satellite');
      return;
    }
    withPose(sx, sy, 0, () => {
      context.fillStyle = '#1f4fa8';
      context.fillRect((-core / 2 - panelReach) * scale, (-panelWidth / 2) * scale, panelReach * scale, panelWidth * scale);
      context.fillRect((core / 2) * scale, (-panelWidth / 2) * scale, panelReach * scale, panelWidth * scale);
      context.fillStyle = '#d9dde3';
      context.fillRect((-core / 2) * scale, (-core / 2) * scale, core * scale, core * scale);
      context.fillStyle = '#3fe0d0';
      context.fillRect((-core / 6) * scale, (-core / 6) * scale, (core / 3) * scale, (core / 3) * scale);
    });
  }

  function drawRig(rig) {
    if (!rig?.deployed) return;
    const [sx, sy] = toScreen(...rocketPoint(rig, -ROCKET_HEIGHT / 2, RIG_SHAPE.besideRocket));
    const { base, height } = RIG_SHAPE;
    const scale = view.ppu;
    if (!onScreen(sx, sy, height * scale + 20)) return;
    if (height * scale < OUTPOST_DOT_BELOW_PX) {
      drawOutpostDot(sx, sy, 'Mining rig');
      return;
    }
    withPose(sx, sy, rig.heading, () => {
      context.strokeStyle = '#ffc933';
      context.lineWidth = Math.max(1, 4 * scale);
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo((-base / 2) * scale, 0);
      context.lineTo(0, -height * scale);
      context.lineTo((base / 2) * scale, 0);
      context.moveTo((-base / 3) * scale, (-height / 3) * scale);
      context.lineTo((base / 3) * scale, (-height / 3) * scale);
      context.moveTo((-base / 6) * scale, ((-2 * height) / 3) * scale);
      context.lineTo((base / 6) * scale, ((-2 * height) / 3) * scale);
      context.stroke();
      context.fillStyle = '#7a5200';
      context.fillRect((-base / 2) * scale, -6 * scale, base * scale, 6 * scale);
    });
  }

  function drawSignal(antennas) {
    const radius = ANTENNA.range * view.ppu;
    if (radius > SIGNAL_RING_MAX_PX) return;
    context.save();
    context.strokeStyle = 'rgba(255, 150, 90, 0.35)';
    context.lineWidth = 1.5;
    context.setLineDash([6, 6]);
    for (const antenna of antennas) {
      const [sx, sy] = toScreen(antenna.x, antenna.y);
      discPath(sx, sy, radius);
      context.stroke();
    }
    context.restore();
  }

  function drawAntenna(antenna) {
    const [sx, sy] = toScreen(...rocketPoint(antenna, -ROCKET_HEIGHT / 2, ANTENNA_SHAPE.besideRocket));
    const { height, dish } = ANTENNA_SHAPE;
    const scale = view.ppu;
    if (!onScreen(sx, sy, height * scale + 20)) return;
    if (height * scale < OUTPOST_DOT_BELOW_PX) {
      drawOutpostDot(sx, sy, 'Antenna');
      return;
    }
    withPose(sx, sy, antenna.heading, () => {
      context.strokeStyle = '#d9dde3';
      context.lineWidth = Math.max(1, 4 * scale);
      context.beginPath();
      context.moveTo(0, 0);
      context.lineTo(0, -height * scale);
      context.stroke();
      context.strokeStyle = '#ff965a';
      context.beginPath();
      context.arc(0, (-height + dish) * scale, dish * scale, Math.PI * 1.15, Math.PI * 1.85);
      context.stroke();
    });
  }

  function drawBank(bank) {
    if (!bank?.deployed) return;
    const [sx, sy] = toScreen(bank.x, bank.y);
    const { width, height, cells } = BANK_SHAPE;
    const scale = view.ppu;
    if (!onScreen(sx, sy, width * scale + 20)) return;
    if (width * scale < OUTPOST_DOT_BELOW_PX) {
      drawOutpostDot(sx, sy, 'Battery bank');
      return;
    }
    withPose(sx, sy, 0, () => {
      context.fillStyle = '#d9dde3';
      context.fillRect((-width / 2) * scale, (-height / 2) * scale, width * scale, height * scale);
      const stored = bank.batteries.reduce((sum, charge) => sum + charge, 0) / bank.batteries.length;
      const cellWidth = width / cells;
      for (let i = 0; i < cells; i++) {
        context.fillStyle = (i + 0.5) / cells <= stored ? '#6dff8c' : '#2c3a33';
        context.fillRect((-width / 2 + i * cellWidth + 3) * scale, (-height / 2 + 5) * scale, (cellWidth - 6) * scale, (height - 10) * scale);
      }
    });
  }

  function drawObservatory(observatory) {
    if (!observatory?.deployed) return;
    const [sx, sy] = toScreen(observatory.x, observatory.y);
    const { width, height, dome, tube, tubeWidth, tilt, lamp } = OBSERVATORY_SHAPE;
    const scale = view.ppu;
    if (!onScreen(sx, sy, (height + dome + tube) * scale + 20)) return;
    if (width * scale < OUTPOST_DOT_BELOW_PX) {
      drawOutpostDot(sx, sy, 'Observatory');
      return;
    }
    const running = runsOnStarlight(observatory) || storedCharge(observatory.batteries) > 0;
    withPose(sx, sy, 0, () => {
      context.save();
      context.translate(0, (-height / 2) * scale);
      context.rotate(tilt);
      context.fillStyle = '#3fe0d0';
      context.fillRect((-tubeWidth / 2) * scale, -(dome + tube) * scale, tubeWidth * scale, (dome + tube) * scale);
      context.restore();
      context.fillStyle = '#d9dde3';
      context.beginPath();
      context.arc(0, (-height / 2) * scale, dome * scale, Math.PI, 0);
      context.fill();
      context.fillRect((-width / 2) * scale, (-height / 2) * scale, width * scale, height * scale);
      context.fillStyle = running ? '#6dff8c' : '#ff5b4a';
      context.beginPath();
      context.arc(0, 0, lamp * scale, 0, Math.PI * 2);
      context.fill();
    });
  }

  function shipLayout(parts) {
    const { size } = SHIP_BLOCK;
    const { minCol, maxCol, minRow, maxRow } = partBounds(parts);
    const [midCol, midRow] = [(minCol + maxCol + 1) / 2, (minRow + maxRow + 1) / 2];
    const cells = parts.map((part) => ({ ...part, x: (part.col - midCol) * size, y: (part.row - midRow) * size }));
    return { cells, width: (maxCol - minCol + 1) * size, height: (maxRow - minRow + 1) * size };
  }

  function tracePart({ type, turn, x, y }, scale) {
    const size = SHIP_BLOCK.size * scale;
    const [left, top] = [x * scale, y * scale];
    const corners = [
      [left, top],
      [left + size, top],
      [left + size, top + size],
      [left, top + size],
    ];
    const outline = type === 'wedge' ? corners.filter((_, corner) => corner !== turn) : corners;
    context.beginPath();
    outline.forEach(([cx, cy], index) => (index ? context.lineTo(cx, cy) : context.moveTo(cx, cy)));
    context.closePath();
  }

  function drawFleetShip(ship, pilot) {
    const [sx, sy] = toScreen(ship.x, ship.y);
    const { cells, width, height } = shipLayout(ship.parts);
    const scale = view.ppu;
    const span = Math.max(width, height);
    if (!onScreen(sx, sy, span * scale + 20)) return;
    if (span * scale < OUTPOST_DOT_BELOW_PX) {
      if (pilot) drawMarker(sx, sy, ship.heading, '#e2effd', 5);
      else drawOutpostDot(sx, sy, 'Ship');
      return;
    }
    if (pilot?.engineOn && pilot.throttle > 0) drawFlame({ ...pilot, heading: ship.heading }, Math.max(height / 2, FLAME_OFFSET / 2) / FLAME_OFFSET, ship);
    withPose(sx, sy, ship.heading, () => {
      context.lineWidth = Math.max(1, 2 * scale);
      context.strokeStyle = SHIP_BLOCK.outline;
      for (const cell of cells) {
        context.fillStyle = partColour(cell);
        tracePart(cell, scale);
        context.fill();
        context.stroke();
      }
    });
  }

  function seededRandom(name) {
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return (i, k) => {
      const value = Math.sin(hash + i * 12.9898 + k * 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
  }

  const surfacePoint = (body, bearing, lift = 0) => [body.x + Math.sin(bearing) * (body.radius + lift), body.y + Math.cos(bearing) * (body.radius + lift)];

  function drawProminences(star) {
    const radiusPx = star.radius * view.ppu;
    if (radiusPx < PROMINENCE.shownAbovePx) return;
    const random = seededRandom(star.name);
    const { count, height, span, ticksPerCycle } = PROMINENCE;
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const phase = (clock / ticksPerCycle + random(i, 1)) % 1;
      const rise = Math.sin(phase * Math.PI);
      const bearing = random(i, 2) * Math.PI * 2 + phase * 0.3;
      const width = span * (0.5 + random(i, 3));
      const lift = star.radius * height * rise * (0.5 + random(i, 4));
      const [ax, ay] = toScreen(...surfacePoint(star, bearing - width / 2));
      const [bx, by] = toScreen(...surfacePoint(star, bearing + width / 2));
      const [cx, cy] = toScreen(...surfacePoint(star, bearing, lift * 2));
      const green = Math.round(110 + 60 * random(i, 5));
      const thickness = Math.max(2, radiusPx * 0.035 * (0.6 + random(i, 6)));
      context.beginPath();
      context.moveTo(ax, ay);
      context.quadraticCurveTo(cx, cy, bx, by);
      context.strokeStyle = `rgba(255, ${green}, 40, ${0.25 * rise})`;
      context.lineWidth = thickness * 3;
      context.stroke();
      context.strokeStyle = `rgba(255, ${green + 40}, 90, ${0.85 * rise})`;
      context.lineWidth = thickness;
      context.stroke();
    }
    context.restore();
  }

  function drawScoopStream(scene) {
    const ship = scene.fleet[scene.boarded];
    if (!scene.scooping || !ship) return;
    const star = brightestStar(ship.x, ship.y);
    if (!star) return;
    const gap = Math.hypot(ship.x - star.x, ship.y - star.y);
    const [ux, uy] = [(ship.x - star.x) / gap, (ship.y - star.y) / gap];
    const [fromX, fromY] = [star.x + ux * star.radius, star.y + uy * star.radius];
    const reach = gap - star.radius;
    const { dots, ticksPerTrip, sway, sizePx } = SCOOP_STREAM;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let i = 0; i < dots; i++) {
      const t = (clock / ticksPerTrip + i / dots) % 1;
      const along = t * t * reach;
      const side = Math.sin(t * Math.PI * 3 + i * 1.7) * reach * sway * (1 - t);
      const [sx, sy] = toScreen(fromX + ux * along - uy * side, fromY + uy * along + ux * side);
      context.fillStyle = `rgba(255, ${Math.round(120 + 70 * t)}, ${Math.round(40 + 60 * t)}, ${0.3 + 0.4 * t})`;
      discPath(sx, sy, sizePx * (1.3 - t * 0.6));
      context.fill();
    }
    context.restore();
  }

  function drawMarker(sx, sy, heading, colour, size) {
    withPose(sx, sy, heading, () => {
      context.fillStyle = colour;
      context.beginPath();
      context.moveTo(0, -1.3 * size);
      context.lineTo(size, size);
      context.lineTo(-size, size);
      context.closePath();
      context.fill();
    });
  }

  function drawSail(sail) {
    const pose = sailPose(sail);
    const [sx, sy] = toScreen(pose.x, pose.y);
    if (!onScreen(sx, sy, 40)) return;
    drawMarker(sx, sy, pose.heading, SAIL_COLOUR, 4);
    drawLabel('Solar sail', sx, sy + 16, SAIL_COLOUR);
  }

  function drawHauler(hauler) {
    const pose = haulerPose(hauler);
    const { label, colour } = HAULER_LOOKS[hauler.builds ? 'builder' : 'hauler'];
    const [sx, sy] = toScreen(pose.x, pose.y);
    const scale = view.ppu * HAULER_SCALE;
    if (!onScreen(sx, sy, ROCKET_HEIGHT * scale + 60)) return;
    if (ROCKET_HEIGHT * scale < 10) {
      drawMarker(sx, sy, pose.heading, colour, 4);
      drawLabel(label, sx, sy + 16, colour);
      return;
    }
    if (pose.flying) drawFlame({ ...pose, throttle: 100 }, HAULER_SCALE, hauler);
    withPose(sx, sy, pose.heading, () => drawSprite(sprites.rocket, scale));
    drawLabel(label, sx, sy + (ROCKET_HEIGHT / 2) * scale + 16, colour);
  }

  function drawShip(ship, rocket) {
    if (!ship) return;
    const [sx, sy] = toScreen(ship.x, ship.y);
    const scale = view.ppu * SHIP_SCALE;
    if (!onScreen(sx, sy, ROCKET_HEIGHT * scale + 60)) return;
    const { name, colour } = speciesByKey[ship.species];
    const nearby = Math.hypot(ship.x - rocket.x, ship.y - rocket.y) < SHIP_SPEED_SHOWN_WITHIN;
    const label = nearby ? `${name} freighter · relative speed ${Math.round(relativeSpeed(ship, rocket))}` : `${name} freighter`;
    if (ROCKET_HEIGHT * scale < 10) {
      drawMarker(sx, sy, shipHeading(ship), colour, 5);
      drawLabel(label, sx, sy + 16, colour);
      return;
    }
    withPose(sx, sy, shipHeading(ship), () => drawSprite(sprites.freighters[ship.species], scale));
    drawLabel(label, sx, sy + (ROCKET_HEIGHT / 2) * scale + 16, colour);
  }

  function drawDrone(drone) {
    const pose = drone?.rescue ?? drone?.flight ?? drone?.pad;
    if (!pose) return;
    const label = drone.lost ? 'Drone · no signal' : drone.rescue ? 'Drone · rescue' : 'Drone';
    const [sx, sy] = toScreen(...rocketPoint(pose, (-ROCKET_HEIGHT * (1 - DRONE_SCALE)) / 2, 0));
    if (ROCKET_HEIGHT * DRONE_SCALE * view.ppu < 10) {
      drawMarker(sx, sy, pose.heading, '#ff965a', 4);
      drawLabel(label, sx, sy + 16, 'rgba(255, 150, 90, 0.85)');
      return;
    }
    const scale = view.ppu * DRONE_SCALE;
    if (pose.engineOn && pose.throttle > 0) {
      drawFlame(pose, DRONE_SCALE, drone);
    }
    withPose(sx, sy, pose.heading, () => drawSprite(sprites.rocket, scale));
    drawLabel(label, sx, sy + (ROCKET_HEIGHT / 2) * scale + 16, 'rgba(255, 150, 90, 0.85)');
  }

  function drawPath(segments, colour, dash) {
    context.save();
    context.strokeStyle = colour;
    context.lineWidth = 1.5;
    context.lineJoin = 'round';
    context.setLineDash(dash);
    for (const points of segments) {
      if (points.length < 4) continue;
      context.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const [sx, sy] = toScreen(points[i], points[i + 1]);
        if (i === 0) context.moveTo(sx, sy);
        else context.lineTo(sx, sy);
      }
      context.stroke();
    }
    context.restore();
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

  function drawDrill(rocket, drill) {
    if (drill.phase === 'idle') return;
    const [sx, sy] = toScreen(...rocketPoint(rocket, -drill.extension, DRILL_OFFSET_SIDEWAYS));
    context.globalAlpha = drill.opacity;
    withPose(sx, sy, rocket.heading, () => drawSprite(sprites.drill, view.ppu));
    context.globalAlpha = 1;
  }

  function drawSolarPanels(rocket, power) {
    if (!power.panelsDeployed || rocket.destroyed || ROCKET_HEIGHT * view.ppu < 10) return;
    const [sx, sy] = toScreen(rocket.x, rocket.y);
    const { reach, width, inset, cells } = SOLAR_PANEL;
    const scale = view.ppu;
    withPose(sx, sy, rocket.heading, () => {
      for (const side of [-1, 1]) {
        const left = side > 0 ? inset * scale : -(inset + reach) * scale;
        context.fillStyle = '#1f4fa8';
        context.fillRect(left, (-width / 2) * scale, reach * scale, width * scale);
        context.strokeStyle = '#7fb4ff';
        context.lineWidth = Math.max(1, scale);
        for (let i = 1; i < cells; i++) {
          const x = left + (reach * scale * i) / cells;
          context.beginPath();
          context.moveTo(x, (-width / 2) * scale);
          context.lineTo(x, (width / 2) * scale);
          context.stroke();
        }
      }
    });
  }

  function drawRocket(rocket) {
    if (rocket.destroyed) return;
    const [sx, sy] = toScreen(rocket.x, rocket.y);
    if (ROCKET_HEIGHT * view.ppu < 10) {
      drawMarker(sx, sy, rocket.heading, '#e2effd', 5);
      return;
    }
    if (rocket.engineOn && rocket.throttle > 0) drawFlame(rocket, 1, rocket);
    withPose(sx, sy, rocket.heading, () => drawSprite(sprites.rocket, view.ppu));
  }

  function flicker(phase) {
    return FLICKER_WAVES.reduce((sum, [speed, depth]) => sum + Math.sin(clock * speed + phase * speed) * depth, 0);
  }

  function drawFlame(pose, size, identity) {
    const phase = flamePhases.get(identity) ?? flamePhases.set(identity, Math.random() * 100).get(identity);
    const scale = view.ppu * size;
    const length = (scale * pose.throttle) / 100;
    const [fx, fy] = toScreen(...rocketPoint(pose, -FLAME_OFFSET * size, 0));
    const [gx, gy] = toScreen(...rocketPoint(pose, -(FLAME_OFFSET + FLAME_GLOW.behind * (pose.throttle / 100)) * size, 0));
    const glowRadius = FLAME_GLOW.radius * scale * (1 + flicker(phase + 7) * 0.5);
    const glow = context.createRadialGradient(gx, gy, 0, gx, gy, glowRadius);
    glow.addColorStop(0, FLAME_GLOW.colour);
    glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
    context.save();
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = glow;
    discPath(gx, gy, glowRadius);
    context.fill();
    context.restore();
    withPose(fx, fy, pose.heading - Math.PI / 2, () => {
      drawSprite(sprites.flame, length * (1 + flicker(phase)), scale * (1 + flicker(phase + 3) * 0.4));
      context.globalCompositeOperation = 'lighter';
      context.globalAlpha = 0.55 + flicker(phase + 5);
      drawSprite(sprites.flame, length * FLAME_CORE.length * (1 + flicker(phase + 11)), scale * FLAME_CORE.width);
    });
  }

  function drawParticles(particles) {
    if (ROCKET_HEIGHT * view.ppu < 10) return;
    context.save();
    for (const particle of particles) {
      const radius = particle.size * view.ppu;
      if (radius < 0.3) continue;
      const [sx, sy] = toScreen(particle.x, particle.y);
      if (!onScreen(sx, sy, radius)) continue;
      const fade = 1 - particle.age / particle.life;
      if (particle.kind === 'spark') {
        context.globalCompositeOperation = 'lighter';
        context.fillStyle = `rgba(255, ${Math.round(120 + 120 * fade)}, ${Math.round(60 * fade)}, ${fade})`;
      } else {
        context.globalCompositeOperation = 'source-over';
        context.fillStyle = `rgba(150, 150, 158, ${SMOKE_ALPHA * fade})`;
      }
      discPath(sx, sy, radius);
      context.fill();
    }
    context.restore();
  }

  function drawExplosion(explosion) {
    if (!explosion) return;
    const [sx, sy] = toScreen(explosion.x, explosion.y);
    context.globalAlpha = Math.max(0, 1 - explosion.ghost);
    withPose(sx, sy, 0, () => drawSprite(sprites.explosion, explosion.size * view.ppu));
    context.globalAlpha = 1;
  }

  function drawWarp(warp) {
    if (!warp) return;
    const surge = Math.sin(warp.progress * Math.PI);
    const reach = Math.hypot(view.width, view.height) / 2;
    context.save();
    context.translate(view.width / 2, view.height / 2);
    context.strokeStyle = `rgba(200, 225, 255, ${0.8 * surge})`;
    context.lineWidth = 1.5;
    context.beginPath();
    for (const { bearing, start, length } of streaks) {
      const inner = start * reach;
      const outer = inner + length * reach * surge;
      context.moveTo(Math.sin(bearing) * inner, Math.cos(bearing) * inner);
      context.lineTo(Math.sin(bearing) * outer, Math.cos(bearing) * outer);
    }
    context.stroke();
    context.fillStyle = `rgba(220, 235, 255, ${0.85 * surge ** 6})`;
    context.fillRect(-view.width / 2, -view.height / 2, view.width, view.height);
    context.restore();
  }

  const tierOf = (body) => (body.moon || body.kind === 'wormhole' ? 'intermediate' : 'major');
  const shownAtZoom = (tier) => view.ppu >= SHOWN_FROM_PPU[tier];

  function standsApart(body, majorBodies) {
    const gap = Math.min(...majorBodies.map((major) => Math.hypot(major.x - body.x, major.y - body.y) - major.radius));
    return gap * view.ppu >= CLEAR_OF_MAJOR_BODY_PX;
  }

  function bodiesToShow() {
    const majorBodies = bodies.filter((body) => tierOf(body) === 'major');
    if (shownAtZoom('intermediate')) return bodies;
    return [...majorBodies, ...bodies.filter((body) => tierOf(body) === 'intermediate' && standsApart(body, majorBodies))];
  }

  function draw(scene, routePath) {
    aim(scene.camera);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = '#000';
    context.fillRect(0, 0, view.width, view.height);
    drawStars();
    const shownBodies = bodiesToShow();
    shownBodies.forEach(drawOrbitRing);
    shownBodies.forEach(drawBody);
    shownBodies.filter((body) => body.kind === 'star').forEach(drawProminences);
    drawBodyLabels(shownBodies, scene.claimedBounties);
    if (shownAtZoom('minor')) {
      drawMarket();
      scene.satellites.forEach(drawSatellite);
      drawRig(scene.rig);
      scene.banks.forEach(drawBank);
      scene.observatories.forEach(drawObservatory);
      scene.fleet.filter((ship) => ship !== scene.fleet[scene.boarded]).forEach((ship) => drawFleetShip(ship, null));
      scene.antennas.forEach(drawAntenna);
    }
    drawSignal(scene.antennas);
    drawPath(routePath, 'rgba(255, 150, 90, 0.55)', [8, 6]);
    clock = scene.clock;
    drawParticles(scene.particles);
    drawScoopStream(scene);
    scene.drones.forEach(drawDrone);
    scene.haulers.forEach(drawHauler);
    scene.sails.forEach(drawSail);
    drawShip(scene.ship, scene.rocket);
    drawForecast(scene.forecast);
    drawDrill(scene.rocket, scene.drill);
    drawSolarPanels(scene.rocket, scene.power);
    const piloted = scene.fleet[scene.boarded];
    if (piloted) drawFleetShip(piloted, scene.rocket);
    else drawRocket(scene.rocket);
    drawExplosion(scene.explosion);
    flushLabels();
    drawWarp(scene.warp);
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

  const zoomShowing = (units) => STAGE_HEIGHT_UNITS / units;

  return { resize, draw, hitsRocket, hitsDrill, zoomShowing, get pixelsPerUnit() { return view.ppu; } };
}
