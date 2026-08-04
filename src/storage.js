/**
 * Persistence adapter.
 *
 * The original build called `window.storage`, which only exists inside the Claude
 * Artifact sandbox. Everywhere else those calls threw and were silently swallowed by
 * a `try/catch`, so career stats never persisted and nothing said so.
 *
 * This picks the best backend available and degrades quietly to an in-memory store,
 * so the app works identically whether it is running as an artifact, on a static
 * host, or in a test with no DOM at all.
 */

const KEY = 'career';

/** Final fallback so the app still runs where no persistent backend exists. */
const memory = new Map();

/** @returns {'artifact'|'local'|'memory'} which backend is in use */
export function storageBackend() {
  if (typeof window !== 'undefined' && window.storage?.get && window.storage?.set) return 'artifact';
  try {
    if (typeof localStorage !== 'undefined') {
      // Safari in private mode exposes localStorage but throws on write, so probe it.
      const probe = '__ecu_lab_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return 'local';
    }
  } catch { /* fall through to memory */ }
  return 'memory';
}

/**
 * @typedef {object} Career
 * @property {number} best highest single Pull Score
 * @property {number} total sum of every Pull Score
 * @property {number} pulls how many pulls have been logged
 */

/** @type {Career} */
const EMPTY_CAREER = { best: 0, total: 0, pulls: 0 };

/**
 * Reads saved career stats.
 *
 * @returns {Promise<Career>} saved stats, or zeroes if nothing is stored yet
 */
export async function loadCareer() {
  try {
    let raw = null;
    switch (storageBackend()) {
      case 'artifact': raw = (await window.storage.get(KEY))?.value ?? null; break;
      case 'local': raw = localStorage.getItem(KEY); break;
      default: raw = memory.get(KEY) ?? null;
    }
    if (!raw) return { ...EMPTY_CAREER };
    const parsed = JSON.parse(raw);
    return {
      best: Number(parsed.best) || 0,
      total: Number(parsed.total) || 0,
      pulls: Number(parsed.pulls) || 0,
    };
  } catch {
    // A corrupt or unreadable save should never stop the app from starting.
    return { ...EMPTY_CAREER };
  }
}

/**
 * Writes career stats. Best-effort: a failure here must never interrupt play.
 *
 * @param {Partial<Career>} career
 * @returns {Promise<boolean>} whether the write succeeded
 */
export async function saveCareer(career) {
  const raw = JSON.stringify({
    best: career.best ?? 0,
    total: career.total ?? 0,
    pulls: career.pulls ?? 0,
  });
  try {
    switch (storageBackend()) {
      case 'artifact': await window.storage.set(KEY, raw); return true;
      case 'local': localStorage.setItem(KEY, raw); return true;
      default: memory.set(KEY, raw); return true;
    }
  } catch {
    return false;
  }
}

/**
 * Clears saved career stats. Exposed for tests and for a future "reset career" button.
 * @returns {Promise<void>}
 */
export async function clearCareer() {
  try {
    switch (storageBackend()) {
      case 'artifact': await window.storage.set(KEY, ''); break;
      case 'local': localStorage.removeItem(KEY); break;
      default: memory.delete(KEY);
    }
  } catch { /* best-effort */ }
}
