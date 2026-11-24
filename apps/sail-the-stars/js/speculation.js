const STORAGE_KEY = 'sail-the-stars-speculation';

let shown = remembered();

function remembered() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export const speculationShown = () => shown;

export function showSpeculation(wanted) {
  shown = wanted;
  try {
    localStorage.setItem(STORAGE_KEY, wanted ? 'on' : 'off');
  } catch {}
}
