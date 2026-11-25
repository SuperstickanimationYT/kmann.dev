import { SUN_POSITION } from './milky-way.js';
import { LANDED, SPACECRAFT } from './spacecraft-catalogue.js';
import { loadSpacecraftPaths, placeOnPath } from './spacecraft-paths.js';
import { halfSizeKm } from './spacecraft-models.js';
import { KM_PER_AU, KM_PER_PC, sunShareVisible } from './solar-system.js';
import { groundFrame, groundHeightMetres } from './terrain.js';
import { add, cross, dot, normalize, scale, subtract } from './vectors.js';

const HOLD_KM = 5;
const DEGREES = Math.PI / 180;
const VELOCITY_STEP_MS = 10000;
const STILL_STARS = normalize([0.3, 0.5, 0.81]);
const GROUND_FOOTPRINT_METRES = 0.3;
const LEVELLING_METRES = 1.2;
const ROVER_HEADING_STEP = 1e-6;
const BESIDE = 0.999;

const ALL = [...SPACECRAFT, ...LANDED];
const bodyNamed = (bodies, name) => bodies.find((body) => body.name === name);
let paths = null;
let groundOf = () => null;

export async function loadSpacecraft(folder, groundFor) {
  groundOf = groundFor;
  paths = await loadSpacecraftPaths(folder);
}

const perpendicularTo = (direction, hint) => {
  const other = Math.abs(dot(direction, hint)) > BESIDE ? [hint[1], hint[2], hint[0]] : hint;
  return normalize(cross(other, direction));
};

function attitude({ faces }, { sunward, fromEarth, fromCentre, velocity }) {
  const facing = {
    earth: () => scale(fromEarth, -1),
    sun: () => sunward,
    awayFromSun: () => scale(sunward, -1),
    velocity: () => velocity,
    stars: () => STILL_STARS,
    orbit: () => scale(fromCentre, -1),
  };
  const north = normalize(facing[faces]());
  return { north, meridian: faces === 'orbit' ? normalize(cross(fromCentre, velocity)) : perpendicularTo(north, sunward) };
}

function sunShareBehind({ name, parent, fromSunKm }, bodies) {
  const shading = [bodyNamed(bodies, 'Sun'), bodyNamed(bodies, parent)];
  return sunShareVisible(shading.map((body) => ({ body, offsetKm: subtract(body.fromSunKm, fromSunKm) })), name);
}

function lit(craft, bodies) {
  const sunDistanceKm = Math.hypot(...craft.fromSunKm);
  return {
    ...craft,
    kind: 'craft',
    centre: add(SUN_POSITION, scale(craft.fromSunKm, 1 / KM_PER_PC)),
    radius: craft.radiusKm / KM_PER_PC,
    sunward: scale(craft.fromSunKm, -1 / sunDistanceKm),
    sunDistanceAu: sunDistanceKm / KM_PER_AU,
    sunlitShare: craft.landed || craft.parent === 'Sun' ? 1 : sunShareBehind(craft, bodies),
  };
}

export function flightDates(craft) {
  if (craft.stops) return { from: craft.stops[0].ms, to: Infinity };
  const path = paths?.get(craft.name);
  return path ? { from: path.from, to: craft.drifts || craft.stays ? Infinity : craft.until ?? path.to } : null;
}

export function isOut(craft, ms) {
  const dates = flightDates(craft);
  return Boolean(dates && ms >= dates.from && ms <= dates.to);
}

function flying(craft, ms, bodies) {
  const centreOf = (name) => bodyNamed(bodies, name).fromSunKm;
  const path = paths.get(craft.name);
  const { fromSunKm, stretch } = placeOnPath(path, ms, centreOf);
  const next = placeOnPath(path, ms + VELOCITY_STEP_MS, centreOf);
  const velocity = scale(subtract(next.fromSunKm, fromSunKm), 1000 / VELOCITY_STEP_MS);
  const fromCentre = subtract(fromSunKm, centreOf(stretch.centre));
  const facing = { sunward: scale(normalize(fromSunKm), -1), fromEarth: subtract(fromSunKm, centreOf('Earth')), fromCentre, velocity };
  return { ...craft, ...attitude(craft, facing), fromSunKm, parent: stretch.centre, stretch, kmPerSecond: Math.hypot(...velocity), radiusKm: halfSizeKm(craft.model), holdKm: HOLD_KM };
}

const standing = new Map();

const directionAt = ({ lat, lon }) => [Math.cos(lat * DEGREES) * Math.cos(lon * DEGREES), Math.cos(lat * DEGREES) * Math.sin(lon * DEGREES), Math.sin(lat * DEGREES)];

function stopAt(stops, ms) {
  const index = stops.findLastIndex((stop) => stop.ms <= ms);
  const [from, to] = [stops[index], stops[index + 1] ?? stops[index]];
  const share = to === from ? 0 : (ms - from.ms) / (to.ms - from.ms);
  return { lat: from.lat + (to.lat - from.lat) * share, lon: from.lon + (to.lon - from.lon) * share, heading: headingOf(from, to === from ? stops[index - 1] ?? from : to, to === from) };
}

function headingOf(from, to, reversed) {
  const east = (to.lon - from.lon) * Math.cos(from.lat * DEGREES) * (reversed ? -1 : 1);
  const north = (to.lat - from.lat) * (reversed ? -1 : 1);
  return Math.hypot(east, north) < ROVER_HEADING_STEP ? 0 : Math.atan2(north, east);
}

function surfaceLocalKm(ground, radiusKm, direction) {
  const { up, anchor, surfaceOffset } = groundFrame(scale(direction, radiusKm), radiusKm);
  return scale(direction, radiusKm + groundHeightMetres(ground, up, anchor, surfaceOffset, GROUND_FOOTPRINT_METRES).height / 1000);
}

function stand(craft, body, ground, stop) {
  const up = directionAt(stop);
  const east = normalize(cross([0, 0, 1], up));
  const north = cross(up, east);
  const beside = (x, y) => surfaceLocalKm(ground, body.radiusKm, normalize(add(up, scale(add(scale(east, x), scale(north, y)), LEVELLING_METRES / 1000 / body.radiusKm))));
  const [e, w, n, s] = [beside(1, 0), beside(-1, 0), beside(0, 1), beside(0, -1)];
  const level = normalize(cross(subtract(e, w), subtract(n, s)));
  const middle = scale([e, w, n, s].reduce((sum, point) => add(sum, point), [0, 0, 0]), 0.25);
  const ahead = add(scale(east, Math.cos(stop.heading)), scale(north, Math.sin(stop.heading)));
  return { localKm: middle, north: level, meridian: normalize(cross(ahead, level)) };
}

function standingPlace(craft, body, ground, stop) {
  const key = `${stop.lat} ${stop.lon}`;
  const kept = standing.get(craft.name);
  if (kept?.key === key && kept.ground === ground) return kept.place;
  const place = stand(craft, body, ground, stop);
  standing.set(craft.name, { key, ground, place });
  return place;
}

function landed(craft, ms, bodies) {
  const body = bodyNamed(bodies, craft.on);
  const ground = groundOf(body);
  if (!ground) return null;
  const stop = stopAt(craft.stops, ms);
  const { localKm, north, meridian } = standingPlace(craft, body, ground, stop);
  const bodyEast = cross(body.north, body.meridian);
  const outward = ([x, y, z]) => add(add(scale(body.meridian, x), scale(bodyEast, y)), scale(body.north, z));
  const fromSunKm = add(body.fromSunKm, outward(localKm));
  return { ...craft, landed: true, stop, parent: craft.on, fromSunKm, localKm, north: outward(north), meridian: outward(meridian), radiusKm: halfSizeKm(craft.model) };
}

export function placeSpacecraft(ms, bodies, wanted = ALL) {
  return wanted
    .filter((craft) => isOut(craft, ms))
    .map((craft) => (craft.stops ? landed : flying)(craft, ms, bodies))
    .filter(Boolean)
    .map((craft) => lit(craft, bodies));
}
