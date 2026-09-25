const LEGACY_SAVE_KEY = 'pangplanet-save';
const WORLDS_KEY = 'pangplanet-worlds';
const SAVE_VERSION = 1;
const LEGACY_WORLD_NAME = 'My world';

const worldSaveKey = (id) => `pangplanet-world-${id}`;
const newWorldId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    return;
  }
}

function adoptLegacySave() {
  const legacy = readJson(LEGACY_SAVE_KEY);
  if (!legacy) return [];
  const world = { id: newWorldId(), name: LEGACY_WORLD_NAME, seed: null, cheats: false, playedAt: legacy.savedAt ?? Date.now() };
  if (!writeJson(worldSaveKey(world.id), legacy) || !writeJson(WORLDS_KEY, [world])) return [];
  removeKey(LEGACY_SAVE_KEY);
  return [world];
}

export function listWorlds() {
  const worlds = readJson(WORLDS_KEY);
  return Array.isArray(worlds) ? worlds : adoptLegacySave();
}

export const findWorld = (id) => listWorlds().find((world) => world.id === id) ?? null;

export function createWorld({ name, seed, cheats }) {
  const world = { id: newWorldId(), name, seed, cheats, playedAt: Date.now() };
  writeJson(WORLDS_KEY, [...listWorlds(), world]);
  return world;
}

export function deleteWorld(id) {
  writeJson(
    WORLDS_KEY,
    listWorlds().filter((world) => world.id !== id),
  );
  removeKey(worldSaveKey(id));
}

export function markPlayed(id) {
  writeJson(
    WORLDS_KEY,
    listWorlds().map((world) => (world.id === id ? { ...world, playedAt: Date.now() } : world)),
  );
}

export function readSave(id) {
  const save = readJson(worldSaveKey(id));
  return save?.version === SAVE_VERSION ? save : null;
}

export function writeSave(id, state) {
  writeJson(worldSaveKey(id), { version: SAVE_VERSION, savedAt: Date.now(), ...state });
}

export const deleteSave = (id) => removeKey(worldSaveKey(id));
