import { createMusicPlayer } from './player.js';
import { songFromShareCode } from './share-code.js';
import { AMBIENT_SONGS, MILESTONE_SONGS } from './songs.js';

const FIRST_AMBIENT_AFTER = 20;
const AMBIENT_GAP = { min: 60, max: 150 };
const AMBIENT_LOOPS = 2;
const AFTER_MILESTONE_GAP = 40;
const AMBIENT_FADE = 2.5;

const seconds = () => performance.now() / 1000;
const randomGap = () => AMBIENT_GAP.min + Math.random() * (AMBIENT_GAP.max - AMBIENT_GAP.min);

async function resolve(entry) {
  return entry.shareCode ? songFromShareCode(entry.shareCode) : entry.song;
}

export function createSoundtrack({ ambientVolume, milestoneVolume }) {
  const player = createMusicPlayer();
  const volumes = { ambient: ambientVolume, milestone: milestoneVolume };
  let ambient = null;
  let milestone = null;
  const waiting = [];
  let nextAmbientAt = Infinity;
  let nextAmbientIndex = Math.floor(Math.random() * AMBIENT_SONGS.length);

  function setVolume(bus, volume) {
    volumes[bus] = volume;
    player.setVolume(bus, volume);
  }
  setVolume('ambient', ambientVolume);
  setVolume('milestone', milestoneVolume);

  function startAmbient() {
    const song = AMBIENT_SONGS[nextAmbientIndex];
    nextAmbientIndex = (nextAmbientIndex + 1) % AMBIENT_SONGS.length;
    const playback = player.play(song, 'ambient', {
      loops: AMBIENT_LOOPS,
      onEnd: () => {
        if (ambient !== playback) return;
        ambient = null;
        nextAmbientAt = seconds() + randomGap();
      },
    });
    ambient = playback;
  }

  async function playNextMilestone() {
    const entry = MILESTONE_SONGS[waiting.shift()];
    milestone = entry;
    const song = await resolve(entry).catch(() => null);
    if (!song) {
      milestone = null;
      if (waiting.length) playNextMilestone();
      return;
    }
    ambient?.fadeOut(AMBIENT_FADE);
    ambient = null;
    const playback = player.play(song, 'milestone', {
      loops: entry.loops ?? 1,
      onEnd: () => {
        milestone = null;
        if (waiting.length) playNextMilestone();
        else nextAmbientAt = seconds() + AFTER_MILESTONE_GAP;
      },
    });
    milestone = playback;
  }

  return {
    unlock() {
      player.unlock();
      if (nextAmbientAt === Infinity) nextAmbientAt = seconds() + FIRST_AMBIENT_AFTER;
    },
    pause: () => player.pause(),
    setAmbientVolume: (volume) => setVolume('ambient', volume),
    setMilestoneVolume: (volume) => setVolume('milestone', volume),
    update() {
      if (!player.ready || ambient || milestone || volumes.ambient <= 0 || seconds() < nextAmbientAt) return;
      startAmbient();
    },
    celebrate(key) {
      if (!MILESTONE_SONGS[key] || !player.ready || volumes.milestone <= 0) return;
      waiting.push(key);
      if (!milestone) playNextMilestone();
    },
  };
}
