import { DEGREES, directionFromEquatorial, SUN_POSITION } from './milky-way.js';
import { add, cross, dot, normalize, orthonormal, rotateBasis, scale, subtract } from './vectors.js';

const KM_PER_PC = 3.0857e13;
const EARTH_RADIUS = 6371 / KM_PER_PC;
const ORBIT_RADIUS = 42164 / KM_PER_PC;
const ASTRONOMICAL_UNIT = 1.496e8 / KM_PER_PC;
const EARTH_NORTH = directionFromEquatorial(0, 90);
const EARTH_SPIN_PER_SECOND = 0.04;
const EARTH_FROM_COURSE = 15 * DEGREES;
const FACING_FROM_COURSE = 45 * DEGREES;
const FLYBY_OFFSET = 0.04;
const CRUISE_SPEED = 0.15;
const RAMP_SECONDS = 2.5;
const RUNAWAY_RATE = 2.5;
const TRACK_LEAD = 3;
const TRACK_EASE = 1.5;
const TRACK_HOLD = 0.8;
const TRACK_LIMIT = 100 * DEGREES;
const LOOKING_AHEAD = { yaw: 0, pitch: 0 };

const EARTH_HOLD = 5;
const TURN_SECONDS = 5;
const RUNAWAY_SECONDS = 3;
const BLACKOUT_SECONDS = 12.5;
const WAKE_HOLD = 2.5;
const COME_ABOUT_SECONDS = 7;
const WAKE_SECONDS = 18;

const ease = (x) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

export function createCutscene({ home, alphaCentauri, odometer, energy }) {
  const toStar = normalize(subtract(alphaCentauri, SUN_POSITION));
  const side = normalize(cross(toStar, [0, 0, 1]));
  const tilted = (angle) => add(scale(toStar, Math.cos(angle)), scale(side, Math.sin(angle)));
  const earth = add(SUN_POSITION, scale(tilted(EARTH_FROM_COURSE), ASTRONOMICAL_UNIT));
  const facing = tilted(FACING_FROM_COURSE);
  const start = subtract(earth, scale(facing, ORBIT_RADIUS));
  const flyby = add(alphaCentauri, scale(side, FLYBY_OFFSET));
  const course = normalize(subtract(flyby, start));
  const parked = orthonormal(facing, [0, 0, 1]);
  const turnAxis = normalize(cross(facing, course));
  const turnAngle = Math.acos(Math.min(1, dot(facing, course)));
  const cruising = rotateBasis(parked, turnAxis, turnAngle);
  const passTime = dot(subtract(alphaCentauri, start), course) / CRUISE_SPEED + RAMP_SECONDS / 2;
  const facingAway = { forward: scale(home.ship.forward, -1), right: scale(home.ship.right, -1), up: home.ship.up };

  const departAt = EARTH_HOLD + TURN_SECONDS;
  const passAt = departAt + passTime;
  const blackAt = passAt + RUNAWAY_SECONDS;
  const wakeAt = blackAt + BLACKOUT_SECONDS;
  const duration = wakeAt + WAKE_SECONDS;

  function travelled(seconds) {
    const cruise = seconds < RAMP_SECONDS ? (CRUISE_SPEED * seconds * seconds) / (2 * RAMP_SECONDS) : CRUISE_SPEED * (seconds - RAMP_SECONDS / 2);
    const runaway = seconds > passTime ? (CRUISE_SPEED * (Math.exp(RUNAWAY_RATE * (seconds - passTime)) - 1)) / RUNAWAY_RATE : 0;
    return cruise + runaway;
  }

  const planet = { centre: earth, radius: EARTH_RADIUS, sunward: normalize(subtract(SUN_POSITION, earth)), north: EARTH_NORTH };

  function at(time) {
    if (time >= blackAt) {
      const comingAbout = ease((time - wakeAt - WAKE_HOLD) / COME_ABOUT_SECONDS);
      return { camera: home.camera, ship: rotateBasis(facingAway, home.ship.up, Math.PI * comingAbout), head: LOOKING_AHEAD, planet: null };
    }
    const spun = { ...planet, spin: time * EARTH_SPIN_PER_SECOND };
    if (time < departAt) {
      const ship = rotateBasis(parked, turnAxis, turnAngle * ease((time - EARTH_HOLD) / TURN_SECONDS));
      return { camera: start, ship, head: LOOKING_AHEAD, planet: spun };
    }
    const camera = add(start, scale(course, travelled(time - departAt)));
    const toward = subtract(alphaCentauri, camera);
    const starYaw = Math.atan2(dot(toward, cruising.right), dot(toward, cruising.forward));
    const tracking = ease((time - passAt + TRACK_LEAD) / TRACK_EASE) * (1 - ease((time - passAt - TRACK_HOLD) / TRACK_EASE));
    const yaw = Math.max(-TRACK_LIMIT, Math.min(TRACK_LIMIT, starYaw)) * tracking;
    return { camera, ship: cruising, head: { yaw, pitch: 0 }, planet: spun };
  }

  const captions = [
    { at: 0.5, text: "2150. Humanity's first crewed warp ship leaves Earth for Alpha Centauri, 4.4 light-years away." },
    { at: departAt, text: 'The drive engages.' },
    { at: passAt - 2.5, text: 'Alpha Centauri. The ship should be slowing down.' },
    { at: passAt + 0.5, text: 'It is not.' },
    { at: blackAt, text: '', black: true },
    { at: blackAt + 1, text: 'A bug in the navigation software never sent the stop command.', black: true },
    { at: blackAt + 5.5, text: 'The drive ran until its safety cut-out tripped.', black: true },
    { at: blackAt + 9.5, text: 'You wake to alarms.', black: true },
    { at: wakeAt, text: `The odometer reads ${odometer}. The navigation computer is dead.` },
    { at: wakeAt + WAKE_HOLD + 5, text: 'That is the Milky Way, seen from outside. Home is somewhere in it.' },
    { at: wakeAt + 11.5, text: `${energy} of warp energy left. Enough to get home, if you know the way.` },
  ];

  const captionAt = (time) => captions.findLast((caption) => caption.at <= time) ?? { text: '' };

  return { duration, at, captionAt };
}
