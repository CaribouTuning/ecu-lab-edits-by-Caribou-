/**
 * Asks the simulator worker (simWorker.js) to do a slow first step off the drawing thread,
 * and takes back what it solved, so the screen that needs it then reads it at once. The
 * numbers are the same either way: the worker runs this same code.
 *
 * Where a worker cannot be made (a test runner, a host that forbids it), `warm` resolves at
 * once and the screen works it out itself, as it always did.
 */

import { seedBreathing } from '../../sim/index.js';
// Built into this bundle as a blob, so the single-file build carries it like everything else.
import SimWorker from './simWorker.js?worker&inline';

/** @type {Worker|null|false} null: not made yet; false: cannot be made */
let worker = null;
let next = 1;
/** In flight, by what was asked, so asking twice waits on the one answer. */
const pending = new Map();
/** Each request's resolver, by id. */
const waiting = new Map();

function workerOf() {
  if (worker !== null) return worker;
  try {
    if (typeof window === 'undefined' || typeof window.Worker === 'undefined') throw new Error('no Worker');
    const w = new SimWorker();
    w.onmessage = (e) => {
      const { id, ok, snap, error } = e.data;
      if (ok) seedBreathing(snap);
      // The screen still works it out itself; say why the worker could not, for whoever looks.
      else console.warn(`Simulator worker: ${error}`);
      waiting.get(id)?.();
      waiting.delete(id);
    };
    w.onerror = () => { for (const done of waiting.values()) done(); waiting.clear(); worker = false; };
    worker = w;
  } catch {
    worker = false;
  }
  return worker;
}

/**
 * Solve a task's breathing off the drawing thread. Resolves when it has been handed back; null
 * where there is no worker, for the caller to go straight on as it always did (and stay
 * synchronous where it was).
 * @param {'preset'|'advice'|'demo'} task
 * @param {object} payload
 * @returns {Promise<void>|null}
 */
export function warm(task, payload) {
  const key = `${task}:${JSON.stringify(payload)}`;
  if (pending.has(key)) return /** @type {Promise<void>} */ (pending.get(key));
  const w = workerOf();
  if (!w) return null;
  const id = next++;
  const p = new Promise((resolve) => { waiting.set(id, resolve); });
  pending.set(key, p);
  p.then(() => { if (pending.size > 64) pending.delete(pending.keys().next().value); });
  w.postMessage({ id, task, payload });
  return /** @type {Promise<void>} */ (p);
}
