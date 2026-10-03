export const DEFAULT_SETTINGS = { trialShare: 0.2, threshold: 0.25, minTrials: 8, trollShare: 0.1 };

const PURGED_KEPT = 30;

export function createKnowledge(saved = {}) {
  const entries = new Map((saved.entries ?? []).map((entry) => [entry.word, entry]));
  const purged = saved.purged ?? [];
  const listeners = new Set();
  const changed = () => listeners.forEach((listener) => listener());

  function find(word) {
    return entries.get(word) ?? (word.length > 3 && word.endsWith('s') ? entries.get(word.slice(0, -1)) : undefined) ?? null;
  }

  function learn(word, meaning, source, { troll = false } = {}) {
    const entry = { word, meaning, status: 'uncertain', trials: 0, errors: 0, source, troll, learnedAt: Date.now() };
    entries.set(word, entry);
    changed();
    return entry;
  }

  function drop(entry, reason) {
    if (entries.get(entry.word) !== entry) return;
    entries.delete(entry.word);
    purged.unshift({ ...entry, reason, purgedAt: Date.now() });
    purged.length = Math.min(purged.length, PURGED_KEPT);
    changed();
  }

  function promote(entry) {
    entry.status = 'confident';
    changed();
  }

  function record(entry, passed, settings) {
    if (entry.status !== 'uncertain' || entries.get(entry.word) !== entry) return null;
    entry.trials += 1;
    if (!passed) entry.errors += 1;
    if (entry.errors > settings.threshold * settings.minTrials) {
      drop(entry, `${entry.errors} of ${entry.trials} trials failed, past the ${Math.round(settings.threshold * 100)}% limit`);
      return 'purged';
    }
    if (entry.trials >= settings.minTrials) {
      entry.status = 'confident';
      changed();
      return 'promoted';
    }
    changed();
    return null;
  }

  return {
    find,
    learn,
    record,
    promote,
    remove: (entry) => drop(entry, 'deleted by hand'),
    entries: () => [...entries.values()],
    purged: () => purged,
    clear() {
      entries.clear();
      purged.length = 0;
      changed();
    },
    subscribe: (listener) => listeners.add(listener),
    serialize: () => ({ entries: [...entries.values()], purged }),
  };
}

export const confidenceOf = (entry, settings) => (entry.status === 'confident' ? 1 : Math.min(1, (entry.trials - entry.errors) / settings.minTrials));
