/**
 * The breathing this device has solved, kept across sessions in IndexedDB, so an engine already
 * put on the bench once goes on again without seconds of the gas exchange.
 *
 * Only the solved grid nodes are kept: the same numbers the simulator computes, from the same
 * code. They are never trusted on their own. Each record carries the physics fingerprint of the
 * build that solved it (tests/fixtures/fingerprint.sha256, which moves whenever the breathing
 * does, or CI fails), and a record from another is ignored; and before a kept grid is used,
 * nodes spread across it are solved again and must come out exactly the same (airflow.js
 * `seedBreathing` with `verify`). Each save replaces a grid's record with what the saving thread
 * holds, every node of it solved or checked by this build, so nothing older survives in it.
 * Nothing here is required: where IndexedDB is missing, blocked or full, every call quietly does
 * nothing and the simulator solves what it needs, as it always has.
 */

import FINGERPRINT from '../../../tests/fixtures/fingerprint.sha256?raw';

/** Which physics solved a record: the build's fingerprint. */
const STAMP = FINGERPRINT.trim();

const DB = 'ecu-lab-breathing';
const STORE = 'grids';
/** Grids kept, the most recently saved: an engine's phases and bolt-on variants several times over. */
const KEPT = 64;

/** @returns {Promise<IDBDatabase|null>} */
function open() {
  return new Promise((resolve) => {
    try {
      const idb = /** @type {any} */ (globalThis).indexedDB;
      if (!idb) { resolve(null); return; }
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

let db = /** @type {Promise<IDBDatabase|null>|null} */ (null);
const handle = () => (db ??= open());

/**
 * Every kept grid, as `seedBreathing` takes them.
 * @returns {Promise<{grids: [string, [number, number][]][], runners: [string, number][]}|null>}
 */
export async function loadBreathing() {
  const d = await handle();
  if (!d) return null;
  return new Promise((resolve) => {
    try {
      const out = [];
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { resolve({ grids: out, runners: [] }); return; }
        if (Array.isArray(c.value?.nodes) && c.value.stamp === STAMP) out.push([String(c.key), c.value.nodes]);
        c.continue();
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Keep these grids' nodes, each grid's in place of what was kept for it, and drop the oldest past
 * `KEPT`. Never merged: a record that kept an earlier build's nodes beside this one's would pass
 * the check on the nodes it re-solves and serve the rest.
 * @param {{grids?: [string, [number, number][]][]}} snap
 * @returns {Promise<void>}
 */
export async function saveBreathing(snap) {
  const grids = snap?.grids ?? [];
  if (!grids.length) return;
  const d = await handle();
  if (!d) return;
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [key, nodes] of grids) store.put({ nodes, stamp: STAMP, at: Date.now() }, key);
    tx.oncomplete = () => prune(d);
  } catch {
    // A full or blocked store only means the next session solves it again.
  }
}

/** @param {IDBDatabase} d */
function prune(d) {
  try {
    const tx = d.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const all = [];
    const req = store.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (c) { all.push([c.key, c.value?.at ?? 0]); c.continue(); return; }
      all.sort((a, b) => a[1] - b[1]);
      for (const [key] of all.slice(0, Math.max(0, all.length - KEPT))) store.delete(key);
    };
  } catch {
    // Nothing to do: the next save tries again.
  }
}
