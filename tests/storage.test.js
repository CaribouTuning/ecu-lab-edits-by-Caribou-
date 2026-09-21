/**
 * Storage adapter tests.
 *
 * The original build called `window.storage`, which exists only inside the Claude
 * Artifact sandbox — everywhere else the call threw and was swallowed, so career stats
 * silently never persisted. These tests pin down that the adapter works on every
 * backend, including the no-DOM case this test file itself runs in.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearCareer, loadCareer, saveCareer, storageBackend } from '../src/storage.js';

afterEach(async () => {
  await clearCareer();
  vi.unstubAllGlobals();
});

describe('storage adapter', () => {
  it('falls back to memory when no browser storage exists', () => {
    // vitest runs this suite in the Node environment, so there is no window at all.
    expect(storageBackend()).toBe('memory');
  });

  it('returns zeroed stats when nothing has been saved', async () => {
    expect(await loadCareer()).toEqual({ best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });

  it('round-trips career stats', async () => {
    expect(await saveCareer({ best: 812, total: 4310, pulls: 27 })).toBe(true);
    expect(await loadCareer()).toEqual({ best: 812, total: 4310, pulls: 27, runs: [], pinnedRunId: null });
  });

  it('coerces missing fields rather than persisting undefined', async () => {
    await saveCareer({ best: 100 });
    expect(await loadCareer()).toEqual({ best: 100, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });

  it('survives a corrupt save instead of crashing the app', async () => {
    await saveCareer({ best: 5, total: 5, pulls: 1 });
    // Simulate a truncated or hand-edited value.
    const localish = { getItem: () => '{not json', setItem: () => {}, removeItem: () => {} };
    vi.stubGlobal('localStorage', localish);
    expect(await loadCareer()).toEqual({ best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });

  it('uses localStorage when it is available and writable', async () => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    });
    expect(storageBackend()).toBe('local');
    await saveCareer({ best: 42, total: 42, pulls: 1 });
    expect(JSON.parse(store.get('career'))).toEqual({ best: 42, total: 42, pulls: 1, runs: [], pinnedRunId: null });
  });

  it('degrades to memory when localStorage throws on write (Safari private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    });
    expect(storageBackend()).toBe('memory');
  });

  it('prefers the artifact host when it is present', async () => {
    const bag = new Map();
    vi.stubGlobal('window', {
      storage: {
        get: async (k) => ({ value: bag.get(k) ?? null }),
        set: async (k, v) => { bag.set(k, v); },
      },
    });
    expect(storageBackend()).toBe('artifact');
    await saveCareer({ best: 7, total: 9, pulls: 2 });
    expect(await loadCareer()).toEqual({ best: 7, total: 9, pulls: 2, runs: [], pinnedRunId: null });
  });

  it('reports failure rather than throwing when a backend rejects', async () => {
    vi.stubGlobal('window', {
      storage: {
        get: async () => { throw new Error('nope'); },
        set: async () => { throw new Error('nope'); },
      },
    });
    expect(await saveCareer({ best: 1, total: 1, pulls: 1 })).toBe(false);
    expect(await loadCareer()).toEqual({ best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });
});

describe('run log persistence', () => {
  it('returns an empty log when nothing has been saved', async () => {
    expect(await loadCareer()).toEqual({ best: 0, total: 0, pulls: 0, runs: [], pinnedRunId: null });
  });

  it('round-trips runs and the pin', async () => {
    const runs = [{ id: '2', n: 2, at: 2, label: 'VQ', peakHp: 300, peakTq: 280, knocks: 0, scores: { tuning: 1, engineer: 2, pull: 3 }, points: [], inputs: { build: {}, tune: {}, loadKpa: 100 } }];
    await saveCareer({ best: 1, total: 2, pulls: 3, runs, pinnedRunId: '2' });
    const loaded = await loadCareer();
    expect(loaded.runs).toEqual(runs);
    expect(loaded.pinnedRunId).toBe('2');
  });

  it('loads a save written before run history existed', async () => {
    // The blob every existing player has. It must open, not throw and not yield
    // `undefined` for a field the UI will immediately call .find() on.
    await saveCareer({ best: 812, total: 4310, pulls: 27 });
    const loaded = await loadCareer();
    expect(loaded.best).toBe(812);
    expect(loaded.runs).toEqual([]);
    expect(loaded.pinnedRunId).toBe(null);
  });

  it('rejects a non-array runs value rather than trusting it', async () => {
    await saveCareer({ best: 1, total: 1, pulls: 1, runs: /** @type {any} */ ('not an array') });
    expect((await loadCareer()).runs).toEqual([]);
  });

  it('rejects a non-string pin rather than trusting it', async () => {
    await saveCareer({ best: 1, total: 1, pulls: 1, pinnedRunId: /** @type {any} */ (17) });
    expect((await loadCareer()).pinnedRunId).toBe(null);
  });
});
