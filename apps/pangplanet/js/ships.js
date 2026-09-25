import { ALIENS } from './world.js';

const { ships: SHIPS } = ALIENS;

const between = ([min, max]) => min + Math.random() * (max - min);

export const nextShipDelayTicks = () => -Math.log(1 - Math.random()) * SHIPS.meanGapTicks;

export function launchShip(species, star, transitRadius) {
  const bearing = Math.random() * Math.PI * 2;
  const along = { x: Math.sin(bearing), y: Math.cos(bearing) };
  const offset = (Math.random() - 0.5) * transitRadius;
  const halfChord = Math.sqrt(transitRadius * transitRadius - offset * offset);
  const speed = between(SHIPS.speed);
  const stardust = Math.random() < SHIPS.cargo.stardustChance ? 1 : 0;
  return {
    species,
    x: star.x - along.y * offset - along.x * halfChord,
    y: star.y + along.x * offset - along.y * halfChord,
    vx: along.x * speed,
    vy: along.y * speed,
    ticksLeft: (2 * halfChord) / speed,
    starName: star.name,
    cargo: { galactokens: Math.round(between(SHIPS.cargo.galactokens) / 10) * 10, crystals: Math.floor(between(SHIPS.cargo.crystals)), stardust },
  };
}

export function flyShip(ship, dt) {
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.ticksLeft -= dt;
}

export const shipGone = (ship) => ship.ticksLeft <= 0;

export const relativeSpeed = (ship, rocket) => Math.hypot(ship.vx - rocket.vx, ship.vy - rocket.vy);

export const shipHeading = (ship) => Math.atan2(ship.vx, ship.vy);
