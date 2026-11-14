const FROZEN = '#b4cde3';
const BOILING = '#c0612f';
const BARREN = '#6e5d4c';
const POOREST_FOOD = [18, 58, 54];
const RICHEST_FOOD = [105, 217, 138];
const FOOD_SCALE_FROM_LOG10 = -4;
const FOOD_SCALE_SPAN_LOG10 = 4;
const BACKGROUND = '#060f1c';
const RIM = 'rgba(226, 239, 253, 0.55)';
const CLOUD_STRIPES = 9;

export function zoneColour(zone) {
  if (zone.state === 'frozen') return FROZEN;
  if (zone.state === 'boiling') return BOILING;
  if (zone.state === 'none' || zone.foodWm2 <= 0) return BARREN;
  const t = Math.min(1, Math.max(0, (Math.log10(zone.foodWm2) - FOOD_SCALE_FROM_LOG10) / FOOD_SCALE_SPAN_LOG10));
  const channels = POOREST_FOOD.map((from, index) => Math.round(from + (RICHEST_FOOD[index] - from) * t));
  return `rgb(${channels.join(', ')})`;
}

function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.round(box.width * ratio);
  canvas.height = Math.round(box.height * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: box.width, height: box.height };
}

function latitudeStrips(zones, radius) {
  return zones.flatMap((zone) => {
    const near = radius * Math.sin((zone.fromDeg * Math.PI) / 180);
    const far = radius * Math.sin((zone.toDeg * Math.PI) / 180);
    return [
      { zone, x: -radius, y: -far, width: radius * 2, height: far - near },
      { zone, x: -radius, y: near, width: radius * 2, height: far - near },
    ];
  });
}

const LOCKED_EDGES = { day: [-1, -0.5], twilight: [-0.5, 0.5], night: [0.5, 1] };

function lockedStrips(zones, radius) {
  return zones.map((zone) => {
    const [from, to] = LOCKED_EDGES[zone.id];
    return { zone, x: from * radius, y: -radius, width: (to - from) * radius, height: radius * 2 };
  });
}

function cloudStrips([zone], radius) {
  const height = (radius * 2) / CLOUD_STRIPES;
  return Array.from({ length: CLOUD_STRIPES }, (_, index) => ({
    zone,
    x: -radius,
    y: -radius + index * height,
    width: radius * 2,
    height,
    shade: index % 2 ? 0.82 : 1,
  }));
}

function stripsFor(world, zones, radius) {
  if (world.planet.kind !== 'rocky') return cloudStrips(zones, radius);
  return world.spin.locked ? lockedStrips(zones, radius) : latitudeStrips(zones, radius);
}

export function drawMap(canvas, world, zones) {
  const { context, width, height } = fitCanvas(canvas);
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, width, height);
  const radius = Math.min(width, height) * 0.42;
  context.save();
  context.translate(width / 2, height / 2);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.clip();
  for (const strip of stripsFor(world, zones, radius)) {
    context.globalAlpha = strip.shade ?? 1;
    context.fillStyle = zoneColour(strip.zone);
    context.fillRect(strip.x, strip.y, strip.width, strip.height + 0.5);
  }
  context.globalAlpha = 1;
  context.restore();
  context.strokeStyle = RIM;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
  context.stroke();
  if (world.spin.locked && world.planet.kind === 'rocky') {
    context.fillStyle = '#ffd98a';
    context.beginPath();
    context.arc(width / 2 - radius - 18, height / 2, 7, 0, Math.PI * 2);
    context.fill();
  }
}
