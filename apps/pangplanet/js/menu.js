import { createWorld, deleteWorld, exportWorld, importWorld, listWorlds } from './save.js';

const SEED_RANGE = 2 ** 32;
const DEFAULT_WORLD_NAME = 'New world';
const AGO_STEPS = [
  { seconds: 86400, unit: 'day' },
  { seconds: 3600, unit: 'hour' },
  { seconds: 60, unit: 'minute' },
];

export function seedFromText(text) {
  const trimmed = text.trim();
  if (!trimmed) return Math.floor(Math.random() * SEED_RANGE);
  if (/^\d+$/.test(trimmed)) return Number(BigInt(trimmed) % BigInt(SEED_RANGE));
  let hash = 0x811c9dc5;
  for (const char of trimmed) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193);
  return hash >>> 0;
}

function playedAgo(time) {
  const seconds = (Date.now() - time) / 1000;
  const step = AGO_STEPS.find(({ seconds: size }) => seconds >= size);
  if (!step) return 'played just now';
  const count = Math.floor(seconds / step.seconds);
  return `played ${count} ${step.unit}${count === 1 ? '' : 's'} ago`;
}

const describeWorld = (world) => [world.seed === null ? 'Default galaxy' : `Seed ${world.seed}`, world.cheats && 'Cheats', playedAgo(world.playedAt)].filter(Boolean).join(' · ');

function button(label, className, onClick) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `pp-action ${className}`;
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
}

const fileNameFor = (world) => `${world.name.replace(/[^\w -]+/g, '').trim() || 'world'}.pangplanet.json`;

function downloadWorld(world) {
  const file = new Blob([JSON.stringify(exportWorld(world.id))], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = fileNameFor(world);
  link.click();
}

async function readWorldFile(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

export function showWorldMenu(root, play) {
  const menu = root.querySelector('[data-worlds-menu]');
  const list = menu.querySelector('[data-world-list]');
  const empty = menu.querySelector('[data-no-worlds]');
  const form = menu.querySelector('[data-new-world]');
  const seedField = menu.querySelector('[data-seed-field]');
  const importInput = menu.querySelector('[data-import-world]');
  const importError = menu.querySelector('[data-import-error]');
  const { worldName, galaxy, seed, cheats } = form.elements;

  function worldRow(world) {
    const row = document.createElement('li');
    const name = document.createElement('strong');
    const details = document.createElement('span');
    name.textContent = world.name;
    details.textContent = describeWorld(world);
    const remove = () => {
      if (!window.confirm(`Delete "${world.name}"? Its progress will be gone for good.`)) return;
      deleteWorld(world.id);
      render();
    };
    row.append(name, details, button('Play', 'pp-buy', () => play(world)), button('Export', 'pp-export', () => downloadWorld(world)), button('Delete', 'pp-restart', remove));
    return row;
  }

  function render() {
    const worlds = listWorlds().sort((a, b) => b.playedAt - a.playedAt);
    empty.hidden = worlds.length > 0;
    list.replaceChildren(...worlds.map(worldRow));
  }

  importInput.addEventListener('change', async () => {
    const [file] = importInput.files;
    importInput.value = '';
    if (!file) return;
    importError.hidden = Boolean(importWorld(await readWorldFile(file)));
    render();
  });
  form.addEventListener('change', () => (seedField.hidden = galaxy.value !== 'custom'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const custom = galaxy.value === 'custom';
    play(createWorld({ name: worldName.value.trim() || DEFAULT_WORLD_NAME, seed: custom ? seedFromText(seed.value) : null, cheats: cheats.checked }));
  });
  menu.hidden = false;
  render();
}
