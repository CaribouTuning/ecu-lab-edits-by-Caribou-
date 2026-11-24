/**
 * Asks the simulator worker (simWorker.js) to do a slow first step off the drawing thread, and
 * takes back what it solved, so the screen that needs it then reads it at once.
 *
 * Two workers: one for what the player is waiting on, one for work done ahead of them (every
 * factory engine's breathing while they look at the list). What either solves is handed to the
 * page and to the other, and kept on this device (`breathingStore`) for the next session.
 */

import { breathingSnapshot, seedBreathing } from '../../sim/index.js';
import { loadBreathing, saveBreathing } from './breathingStore.js';
// Built into this bundle as a blob, so the single-file build carries it like everything else.
import SimWorker from './simWorker.js?worker&inline';

/** @typedef {{w: Worker|null|false, ready: Promise<void>, next: number, pending: Map<string, Promise<any>>, waiting: Map<number, (r: any) => void>}} Lane */

/** @type {Lane} what the player waits on */
const front = { w: null, ready: Promise.resolve(), next: 1, pending: new Map(), waiting: new Map() };
/** @type {Lane} work done ahead */
const back = { w: null, ready: Promise.resolve(), next: 1, pending: new Map(), waiting: new Map() };

/**
 * How long a worker's first task waits for the breathing kept on this device, ms. Reading it is
 * quick, but some browsers never answer an IndexedDB request at all, and a bench that waited on
 * that would never load: past this the worker solves without it.
 */
const SAVED_WAIT_MS = 1500;

/** Breathing this device solved in earlier sessions, checked before use (airflow.js). */
let saved = /** @type {Promise<any>|null} */ (null);
function savedBreathing() {
  if (!saved) {
    const load = loadBreathing().then((snap) => {
      if (snap?.grids?.length) seedBreathing(snap, { verify: true });
      return snap;
    }).catch(() => null);
    saved = Promise.race([load, new Promise((resolve) => { setTimeout(() => resolve(null), SAVED_WAIT_MS); })]);
  }
  return saved;
}

/** @param {Lane} lane */
function workerOf(lane) {
  if (lane.w !== null) return lane.w;
  try {
    if (typeof window === 'undefined' || typeof window.Worker === 'undefined') throw new Error('no Worker');
    const w = new SimWorker();
    w.onmessage = (e) => {
      const { id, ok, snap, error, result } = e.data;
      if (ok && snap?.grids?.length) {
        seedBreathing(snap);
        // The other worker would otherwise solve the same engine again.
        const other = lane === front ? back : front;
        if (other.w) other.w.postMessage({ id: 0, task: 'seed', payload: { snap } });
        saveBreathing(snap);
      }
      // The screen still works it out itself; say why the worker could not, for whoever looks.
      if (!ok) console.warn(`Simulator worker: ${error}`);
      lane.waiting.get(id)?.(ok ? result : undefined);
      lane.waiting.delete(id);
    };
    w.onerror = () => { for (const done of lane.waiting.values()) done(undefined); lane.waiting.clear(); lane.w = false; };
    lane.w = w;
    // What the page already holds, solved by the other worker before this one existed (its
    // answers are only passed on to a worker that is running), so it is not solved twice.
    const held = breathingSnapshot();
    if (held.grids.length) w.postMessage({ id: 0, task: 'seed', payload: { snap: held } });
    // What this device solved before, so the worker does not solve it again either: handed
    // over before its first task, which would otherwise solve the very grids on their way.
    lane.ready = savedBreathing().then((snap) => { if (snap?.grids?.length) w.postMessage({ id: 0, task: 'seed', payload: { snap, verify: true } }); });
  } catch {
    lane.w = false;
  }
  return lane.w;
}

/**
 * @param {Lane} lane
 * @param {string} task
 * @param {object} payload
 * @returns {Promise<any>|null}
 */
function ask(lane, task, payload) {
  const key = `${task}:${JSON.stringify(payload)}`;
  if (lane.pending.has(key)) return /** @type {Promise<any>} */ (lane.pending.get(key));
  const w = workerOf(lane);
  if (!w) return null;
  const id = lane.next++;
  const p = new Promise((resolve) => { lane.waiting.set(id, resolve); });
  lane.pending.set(key, p);
  p.then(() => { if (lane.pending.size > 64) lane.pending.delete(lane.pending.keys().next().value); });
  lane.ready.then(() => w.postMessage({ id, task, payload }));
  return p;
}

/**
 * Solve a task's breathing off the drawing thread. Resolves, when it has been handed back, with
 * what the task returns (a preset's patch; nothing for the others); null where there is no
 * worker, for the caller to go straight on as it always did (and stay synchronous where it was).
 * @param {'preset'|'advice'|'demo'} task
 * @param {object} payload
 * @returns {Promise<any>|null}
 */
export function warm(task, payload) {
  return ask(front, task, payload);
}

/**
 * The same, on the worker for work done ahead of the player, one task after another, so it never
 * holds up what they are waiting on.
 * @param {'preset'} task
 * @param {object} payload
 * @returns {Promise<any>|null}
 */
export function warmAhead(task, payload) {
  // Already asked for by the player: not solved twice.
  const asked = front.pending.get(`${task}:${JSON.stringify(payload)}`);
  return asked ?? ask(back, task, payload);
}

/** Keep what this page solved itself too, when it is put away. */
if (typeof document !== 'undefined') {
  savedBreathing();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveBreathing(breathingSnapshot());
  });
}
