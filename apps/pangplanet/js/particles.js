import { rocketPoint } from './physics.js';
import { FLAME_OFFSET } from './world.js';

const MAX_PARTICLES = 900;
const SPARK = { speed: 7, spread: 0.18, life: 14, size: 5, growth: -0.2 };
const SMOKE = { speed: 3.5, spread: 0.35, life: 70, size: 9, growth: 0.45, drag: 0.97 };
const SPARKS_PER_TICK = 1.2;
const SMOKE_PER_TICK = 0.5;
const BLAST = { sparks: 70, smoke: 35, sparkSpeed: 9, smokeSpeed: 3 };

export const createParticles = () => [];

const jitter = (amount) => (Math.random() * 2 - 1) * amount;

function spawn(particles, particle) {
  if (particles.length >= MAX_PARTICLES) particles.shift();
  particles.push({ age: 0, ...particle });
}

function spewFrom(particles, pose, kind, look, scale, strength) {
  const [x, y] = rocketPoint(pose, -FLAME_OFFSET * scale, 0);
  const bearing = pose.heading + Math.PI + jitter(look.spread);
  const speed = look.speed * scale * strength * (0.7 + Math.random() * 0.6);
  spawn(particles, {
    kind,
    x: x + jitter(4 * scale),
    y: y + jitter(4 * scale),
    vx: pose.vx + Math.sin(bearing) * speed,
    vy: pose.vy + Math.cos(bearing) * speed,
    life: look.life * (0.7 + Math.random() * 0.6),
    size: look.size * scale,
    growth: look.growth * scale,
    drag: look.drag ?? 1,
  });
}

const randomCount = (expected) => Math.floor(expected + Math.random());

export function exhaust(particles, pose, ticks, scale = 1) {
  if (!pose.engineOn || pose.throttle <= 0 || pose.destroyed) return;
  const strength = pose.throttle / 100;
  const output = ticks * (0.4 + strength);
  for (let i = randomCount(SPARKS_PER_TICK * output); i > 0; i--) spewFrom(particles, pose, 'spark', SPARK, scale, strength);
  for (let i = randomCount(SMOKE_PER_TICK * output); i > 0; i--) spewFrom(particles, pose, 'smoke', SMOKE, scale, strength);
}

function burst(particles, { x, y }, kind, count, speed, look) {
  for (let i = 0; i < count; i++) {
    const bearing = Math.random() * Math.PI * 2;
    const pace = speed * Math.sqrt(Math.random());
    spawn(particles, {
      kind,
      x,
      y,
      vx: Math.sin(bearing) * pace,
      vy: Math.cos(bearing) * pace,
      life: look.life * (1 + Math.random()),
      size: look.size * (1 + Math.random()),
      growth: look.growth,
      drag: look.drag ?? 0.95,
    });
  }
}

export function blast(particles, at) {
  burst(particles, at, 'spark', BLAST.sparks, BLAST.sparkSpeed, SPARK);
  burst(particles, at, 'smoke', BLAST.smoke, BLAST.smokeSpeed, SMOKE);
}

export function drift(particles, ticks) {
  let kept = 0;
  for (const particle of particles) {
    particle.age += ticks;
    if (particle.age >= particle.life) continue;
    const slowdown = particle.drag ** ticks;
    particle.vx *= slowdown;
    particle.vy *= slowdown;
    particle.x += particle.vx * ticks;
    particle.y += particle.vy * ticks;
    particle.size = Math.max(0, particle.size + particle.growth * ticks);
    particles[kept++] = particle;
  }
  particles.length = kept;
}
