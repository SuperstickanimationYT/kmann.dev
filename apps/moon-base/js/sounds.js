const FILES = { place: 'place.wav', hit: 'hit.wav', beep: 'beep.mp3', destroy: 'destroy.wav' };
const sounds = Object.fromEntries(Object.entries(FILES).map(([name, file]) => [name, new Audio(`sounds/${file}`)]));
const walk = new Audio('sounds/walk.wav');
walk.loop = true;
walk.volume = 0.35;

export function playSound(name) {
  const sound = sounds[name].cloneNode();
  sound.volume = 0.6;
  sound.play().catch(() => {});
}

export function setWalking(walking) {
  if (walking && walk.paused) walk.play().catch(() => {});
  if (!walking && !walk.paused) walk.pause();
}
