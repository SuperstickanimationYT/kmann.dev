const SAVE_KEY = 'pangplanet-save';
const SAVE_VERSION = 1;

export function readSave() {
  try {
    const save = JSON.parse(window.localStorage.getItem(SAVE_KEY));
    return save?.version === SAVE_VERSION ? save : null;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), ...state }));
  } catch {
    return;
  }
}

export function deleteSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    return;
  }
}
