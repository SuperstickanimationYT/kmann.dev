export const WORLD_SHORT_SIDE = 480;
export const SEGMENT_COUNT = 10;
export const BODY_WIDTH = 15;
export const GRAIN_RADIUS = 5;
export const FOOD_RADIUS = 3.5;

const SEGMENT_GAP = 10;
const NEED_TICK_SECONDS = 2;
const CRAWL_SPEED = 150;
const TURN_RATE = 5.2;
const WIGGLE = 0.6;
const WIGGLE_RATE = 8.7;
const DRINK_WIGGLE = 6;
const EAT_REACH = 20;
const FOOD_VALUE = 5;
const DRINK_PER_SECOND = 5;
const BED_REACH = 10;
const WAKE_BELOW = 50;
const COLLAPSE_RECOVERY = 40;
const EDGE_MARGIN = 20;
const POND_RADIUS = 110;
const TRACK_SPACING = 4;
const TRACK_LIMIT = 500;
const GRAIN_RELAX_PASSES = 2;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const wrapAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

export function pondReach(pond, angle) {
  return pond.radius * (1 + 0.16 * Math.sin(3 * angle + pond.phaseA) + 0.08 * Math.sin(5 * angle + pond.phaseB));
}

export function insidePond(pond, x, y) {
  const dx = x - pond.x;
  const dy = y - pond.y;
  return Math.hypot(dx, dy) < pondReach(pond, Math.atan2(dy, dx));
}

function randomSpot(world, avoidPond = true) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const x = EDGE_MARGIN + Math.random() * (world.width - 2 * EDGE_MARGIN);
    const y = EDGE_MARGIN + Math.random() * (world.height - 2 * EDGE_MARGIN);
    if (!avoidPond || !insidePond(world.pond, x, y)) return { x, y };
  }
  return { x: world.width / 2, y: world.height / 2 };
}

function placePond(world) {
  world.pond.x = world.width - POND_RADIUS * 0.75;
  world.pond.y = world.height - POND_RADIUS * 0.6;
}

function placeHome(world) {
  const { x, y } = randomSpot(world);
  world.home = {
    x: clamp(x, world.width / 2 - 100, world.width / 2 + 100),
    y: clamp(y, world.height / 2 - 100, world.height / 2 + 100),
  };
  if (insidePond(world.pond, world.home.x, world.home.y)) world.home = { x: world.width / 3, y: world.height / 3 };
}

export function scatterGrains(world, count) {
  world.grains = Array.from({ length: count }, () => randomSpot(world));
}

function topUpFood(world) {
  while (world.foods.length < world.foodTarget) world.foods.push(randomSpot(world));
}

export function createWorld(width, height, { foodCount, grainCount }) {
  const world = {
    width,
    height,
    time: 0,
    tickClock: 0,
    needs: { fullness: 20, hydration: 51, stamina: 100 },
    mode: 'drink',
    collapsed: false,
    drinking: false,
    death: null,
    pond: { x: 0, y: 0, radius: POND_RADIUS, phaseA: Math.random() * 6.28, phaseB: Math.random() * 6.28 },
    home: null,
    bed: null,
    wanderTarget: null,
    steerTarget: null,
    foods: [],
    foodTarget: foodCount,
    grains: [],
    tracks: [],
    worm: { segments: [], heading: 0, wigglePhase: 0 },
  };
  placePond(world);
  placeHome(world);
  const startX = Math.min(width / 2 - 20, 120);
  world.worm.segments = Array.from({ length: SEGMENT_COUNT }, (_, index) => ({ x: startX - index * SEGMENT_GAP, y: height / 2 }));
  scatterGrains(world, grainCount);
  topUpFood(world);
  return world;
}

export function resizeWorld(world, width, height) {
  world.width = width;
  world.height = height;
  placePond(world);
  const keepInside = (point) => {
    point.x = clamp(point.x, 0, width);
    point.y = clamp(point.y, 0, height);
  };
  world.worm.segments.forEach(keepInside);
  world.grains.forEach(keepInside);
  world.tracks.length = 0;
  world.foods = world.foods.filter((food) => food.x < width && food.y < height && !insidePond(world.pond, food.x, food.y));
  topUpFood(world);
  if (world.home.x > width || world.home.y > height || insidePond(world.pond, world.home.x, world.home.y)) placeHome(world);
  if (!world.collapsed) world.bed = world.home;
}

export function setFoodTarget(world, count) {
  world.foodTarget = count;
  world.foods.length = Math.min(world.foods.length, count);
  topUpFood(world);
}

export function dropFood(world, x, y) {
  if (insidePond(world.pond, x, y)) return;
  world.foods.push({ x, y });
}

const head = (world) => world.worm.segments[0];

function settleNeeds(world) {
  const { needs } = world;
  needs.fullness -= 1;
  needs.hydration -= 1;
  if (world.mode === 'sleep') needs.stamina += 1;
  else if (!world.drinking) needs.stamina -= 1;
  needs.fullness = clamp(needs.fullness, 0, 100);
  needs.hydration = clamp(needs.hydration, 0, 100);
  needs.stamina = clamp(needs.stamina, 0, 100);
  if (needs.fullness <= 0) world.death = 'starved';
  else if (needs.hydration <= 0) world.death = 'dried out';
}

function wake(world, mode) {
  world.collapsed = false;
  world.mode = mode;
}

function goToSleep(world, collapsed) {
  world.mode = 'sleep';
  world.collapsed = collapsed;
  world.bed = collapsed ? { ...head(world) } : world.home;
}

function chooseMode(world) {
  const { fullness, hydration, stamina } = world.needs;
  if (world.mode !== 'sleep' && stamina <= 0) {
    goToSleep(world, true);
    return;
  }
  if (world.mode === 'eat') {
    if (fullness > 80) {
      if (hydration > 50) goToSleep(world, false);
      else world.mode = 'drink';
    }
  } else if (world.mode === 'drink') {
    if (hydration > 80) {
      if (fullness > 50) goToSleep(world, false);
      else world.mode = 'eat';
    }
  } else if (world.collapsed ? stamina >= COLLAPSE_RECOVERY : atBed(world)) {
    if (fullness < WAKE_BELOW) wake(world, 'eat');
    else if (hydration < WAKE_BELOW) wake(world, 'drink');
  }
}

function atBed(world) {
  const { x, y } = head(world);
  return Math.hypot(world.bed.x - x, world.bed.y - y) <= BED_REACH;
}

function nearestFood(world) {
  const { x, y } = head(world);
  let best = null;
  let bestDistance = Infinity;
  for (const food of world.foods) {
    const distance = Math.hypot(food.x - x, food.y - y);
    if (distance < bestDistance) {
      best = food;
      bestDistance = distance;
    }
  }
  return best;
}

function wanderTarget(world) {
  const { x, y } = head(world);
  if (!world.wanderTarget || Math.hypot(world.wanderTarget.x - x, world.wanderTarget.y - y) < 15) {
    world.wanderTarget = randomSpot(world);
  }
  return world.wanderTarget;
}

function waterTarget(world) {
  const { pond } = world;
  const { x, y } = head(world);
  const angle = Math.atan2(y - pond.y, x - pond.x);
  const reach = pondReach(pond, angle) * 0.55;
  return { x: pond.x + Math.cos(angle) * reach, y: pond.y + Math.sin(angle) * reach };
}

function chosenTarget(world) {
  if (world.steerTarget) return world.steerTarget;
  if (world.mode === 'eat') return nearestFood(world) ?? wanderTarget(world);
  if (world.mode === 'drink') return world.drinking ? null : waterTarget(world);
  return atBed(world) ? null : world.bed;
}

function sipInPlace(world) {
  const { worm } = world;
  const lead = head(world);
  const sway = Math.cos(world.time * DRINK_WIGGLE) * 0.6;
  lead.x = clamp(lead.x + Math.cos(worm.heading + Math.PI / 2) * sway, 0, world.width);
  lead.y = clamp(lead.y + Math.sin(worm.heading + Math.PI / 2) * sway, 0, world.height);
}

function crawlToward(world, target, dt) {
  const { worm } = world;
  const lead = head(world);
  const distance = Math.hypot(target.x - lead.x, target.y - lead.y);
  if (distance < 3) return;
  const turn = wrapAngle(Math.atan2(target.y - lead.y, target.x - lead.x) - worm.heading);
  worm.heading = wrapAngle(worm.heading + clamp(turn, -TURN_RATE * dt, TURN_RATE * dt));
  const speed = CRAWL_SPEED * Math.min(1, distance / 40);
  worm.wigglePhase += WIGGLE_RATE * dt;
  const angle = worm.heading + Math.sin(worm.wigglePhase) * WIGGLE;
  lead.x = clamp(lead.x + Math.cos(angle) * speed * dt, 0, world.width);
  lead.y = clamp(lead.y + Math.sin(angle) * speed * dt, 0, world.height);
}

function followTheLeader(world) {
  const { segments } = world.worm;
  for (let index = 1; index < segments.length; index += 1) {
    const ahead = segments[index - 1];
    const segment = segments[index];
    const dx = ahead.x - segment.x;
    const dy = ahead.y - segment.y;
    const distance = Math.hypot(dx, dy);
    if (distance > SEGMENT_GAP) {
      const pull = (distance - SEGMENT_GAP) / distance;
      segment.x += dx * pull;
      segment.y += dy * pull;
    }
  }
}

function eatWhatIsInReach(world) {
  const { x, y } = head(world);
  const before = world.foods.length;
  world.foods = world.foods.filter((food) => Math.hypot(food.x - x, food.y - y) >= EAT_REACH);
  const eaten = before - world.foods.length;
  if (eaten === 0) return;
  world.needs.fullness = Math.min(100, world.needs.fullness + eaten * FOOD_VALUE);
  topUpFood(world);
}

function pushOutOf(grain, x, y, reach) {
  const dx = grain.x - x;
  const dy = grain.y - y;
  const distance = Math.hypot(dx, dy);
  if (distance >= reach) return;
  if (distance < 1e-6) {
    grain.x += reach;
    return;
  }
  const push = (reach - distance) / distance;
  grain.x += dx * push;
  grain.y += dy * push;
}

function shoveGrains(world) {
  const reach = BODY_WIDTH / 2 + GRAIN_RADIUS;
  for (const grain of world.grains) {
    for (const segment of world.worm.segments) pushOutOf(grain, segment.x, segment.y, reach);
  }
  for (let pass = 0; pass < GRAIN_RELAX_PASSES; pass += 1) separateGrains(world);
  for (const grain of world.grains) {
    grain.x = clamp(grain.x, GRAIN_RADIUS, world.width - GRAIN_RADIUS);
    grain.y = clamp(grain.y, GRAIN_RADIUS, world.height - GRAIN_RADIUS);
  }
}

function separateGrains(world) {
  const cell = GRAIN_RADIUS * 2;
  const columns = Math.ceil(world.width / cell) + 1;
  const buckets = new Map();
  world.grains.forEach((grain, index) => {
    const key = Math.floor(grain.y / cell) * columns + Math.floor(grain.x / cell);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });
  const { grains } = world;
  grains.forEach((grain, index) => {
    const column = Math.floor(grain.x / cell);
    const row = Math.floor(grain.y / cell);
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const bucket = buckets.get((row + dr) * columns + column + dc);
        if (!bucket) continue;
        for (const other of bucket) {
          if (other <= index) continue;
          const neighbour = grains[other];
          const dx = neighbour.x - grain.x;
          const dy = neighbour.y - grain.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= cell || distance < 1e-6) continue;
          const push = (cell - distance) / distance / 2;
          grain.x -= dx * push;
          grain.y -= dy * push;
          neighbour.x += dx * push;
          neighbour.y += dy * push;
        }
      }
    }
  });
}

function layTracks(world) {
  const { x, y } = world.worm.segments.at(-1);
  const last = world.tracks.at(-1);
  if (last && Math.hypot(last.x - x, last.y - y) < TRACK_SPACING) return;
  world.tracks.push({ x, y, born: world.time, gap: !last || Math.hypot(last.x - x, last.y - y) > 3 * TRACK_SPACING });
  if (world.tracks.length > TRACK_LIMIT) world.tracks.shift();
}

export function stepWorld(world, dt) {
  if (world.death) return;
  world.time += dt;
  world.tickClock += dt;
  while (world.tickClock >= NEED_TICK_SECONDS && !world.death) {
    world.tickClock -= NEED_TICK_SECONDS;
    settleNeeds(world);
  }
  if (world.death) return;
  chooseMode(world);
  const target = chosenTarget(world);
  if (target) crawlToward(world, target, dt);
  else if (world.drinking && !world.steerTarget) sipInPlace(world);
  followTheLeader(world);
  world.drinking = world.worm.segments.some((segment) => insidePond(world.pond, segment.x, segment.y));
  if (world.drinking) world.needs.hydration = Math.min(100, world.needs.hydration + DRINK_PER_SECOND * dt);
  eatWhatIsInReach(world);
  shoveGrains(world);
  layTracks(world);
}
