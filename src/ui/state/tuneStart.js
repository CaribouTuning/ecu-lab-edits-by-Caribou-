/**
 * SANDBOX's three ways to start tuning a freshly built engine (components/TuneStart.jsx):
 *
 *   1. a safe base map, generated and checked on the dyno for the player (safeBaseMap.js);
 *   2. the same base map built by the player, step by step, with the targets the game
 *      worked out and a check against each, but every cell typed by the player;
 *   3. the tables as they stand, and the log and TUNE's advice as always.
 *
 * Nothing here writes a table. Which way the player chose, and for which build, is kept in
 * the browser (as the first-run walkthrough is), so a new build asks again.
 */

import { useSyncExternalStore } from 'react';

import { INJECTOR_OPTS, layoutById, loadFor, readTable } from '../../sim/index.js';

import { isOwnEngine, offersBaseMap } from './baseMap.js';
import { boostSteps } from './safeBaseMap.js';

/** Where the choice is kept: `{ sig, choice }`. */
export const TUNE_START_KEY = 'ecu-lab-tune-start-1';

/**
 * What the build is, as far as a base map cares: the engine, its induction, fuel and bolt-ons.
 * A new signature is a new build, and the start is offered again.
 * @param {import('./initialState.js').StoreState['build']} build
 * @returns {string}
 */
export function buildSignature(build) {
  const { engineConfig, mods, turboOn, boostCurve, turbineIdx, turbineCount, compressorIdx, blowerId, blowerRatio, nitrous, injIdx, octaneIdx, ethanolPct, exhaustDiaIdx } = build;
  return JSON.stringify([engineConfig, mods, turboOn, turboOn ? boostCurve : null, turbineIdx, turbineCount, compressorIdx, blowerId, blowerRatio, nitrous, injIdx, octaneIdx, ethanolPct, exhaustDiaIdx]);
}

/**
 * Whether the start is offered: SANDBOX, an engine on the bench that is the player's own or a
 * factory one with parts changed (a stock engine has its factory calibration).
 * @param {{mode: string, build: import('./initialState.js').StoreState['build']}} s
 * @returns {boolean}
 */
export function offersTuneStart({ mode, build }) {
  return mode !== 'career' && build.engineReady !== false && (isOwnEngine(build) || offersBaseMap(build));
}

/** @type {Set<() => void>} */
const listeners = new Set();
/** @type {{sig: string, choice: string}|null|undefined} undefined: not read yet */
let cached;

/** Read the kept choice; null when none, or the browser keeps nothing. */
export function readTuneStart() {
  if (cached !== undefined) return cached;
  try { const v = JSON.parse(globalThis.localStorage?.getItem(TUNE_START_KEY) ?? 'null'); cached = v && typeof v.sig === 'string' ? v : null; } catch { cached = null; }
  return cached;
}
/** Keep the choice for this build, and tell every screen showing it. @param {string} sig @param {'base'|'guided'|'advice'} choice */
export function writeTuneStart(sig, choice) {
  cached = { sig, choice };
  try { globalThis.localStorage?.setItem(TUNE_START_KEY, JSON.stringify(cached)); } catch { /* private mode: asked again next time */ }
  for (const l of listeners) l();
}
/** Forget the kept choice (tests). */
export function clearTuneStart() {
  cached = null;
  try { globalThis.localStorage?.removeItem(TUNE_START_KEY); } catch { /* none */ }
  for (const l of listeners) l();
}
const subscribe = (/** @type {() => void} */ l) => { listeners.add(l); return () => { listeners.delete(l); }; };

/**
 * The way chosen to start this build's tune, or null while it is still to choose. TUNE's card
 * and the Next bar read the same, so they never disagree.
 * @param {string} sig the build's signature
 * @returns {'base'|'guided'|'advice'|null}
 */
export function useTuneStartChoice(sig) {
  const kept = useSyncExternalStore(subscribe, readTuneStart, readTuneStart);
  return kept?.sig === sig ? /** @type {any} */ (kept.choice) : null;
}

/** How close a cell must come to the target to count, by table. */
export const GUIDE_TOLERANCE = Object.freeze({ spark: 1, afr: 0.3, vePct: 6 });

/**
 * @typedef {object} GuideStep
 * @property {string} id
 * @property {string} title
 * @property {string} text what to do, with the targets the game worked out
 * @property {string} go the TUNE page (or `dyno`) it is done on
 * @property {boolean|null} done null where the game cannot check it (the pull itself)
 */

/**
 * The guided base map's steps for the tables as they stand, against the safe base map's.
 * Graded only where the checking pull ran (`samples`): the cells the engine uses, read as the
 * ECU reads them, between cells as well as on them. The targets are given for a few speeds,
 * not cell by cell: filling the rest is the player's.
 * @param {{build: any, tune: any, target: {ve: number[][], timing: number[][], afr: number[][], layout?: any}, samples: {rpm: number, map: number, airCharge: number}[]}} s
 * @returns {GuideStep[]}
 */
export function guidedSteps({ build, tune, target, samples }) {
  const at = (table, layout, name, q) => {
    const axes = layoutById(layout)[name];
    return readTable(table, axes, q.rpm, loadFor(axes, { mapKpa: q.map, airmassG: q.airCharge }));
  };
  const mine = (name, q) => at(tune[name === 'timing' ? 'timing' : name], tune.layout, name, q);
  const theirs = (name, q) => at(target[name], target.layout, name, q);
  const pts = samples.length ? samples : [];
  const pick = (f) => pts[Math.min(pts.length - 1, Math.max(0, Math.round((pts.length - 1) * f)))];
  const anchors = pts.length ? [pick(0.2), pick(0.55), pick(0.9)] : [];
  const fittedCc = INJECTOR_OPTS[build.injIdx]?.cc;
  const boosted = !!build.turboOn || !!build.blowerId;
  const full = pts.filter((q) => q.map >= 85);
  const boostPts = pts.filter((q) => q.map > 110);
  const afrAt = (list) => (list.length ? theirs('afr', list[Math.floor(list.length / 2)]) : null);
  const naAfr = afrAt(full.filter((q) => q.map <= 105));
  const boostAfr = afrAt(boostPts);
  const steps = boostSteps(build);
  const boostTarget = build.turboOn ? Math.max(0, ...build.boostCurve) : 0;
  const airDone = pts.length > 0 && pts.every((q) => Math.abs(mine('ve', q) / theirs('ve', q) - 1) * 100 <= GUIDE_TOLERANCE.vePct);
  // The order a tuner works (HP Academy, Practical Standalone Tuning; webinar 129): what the
  // ECU is told about the parts, the targets the fuel is tuned to, safe spark, then fuel from
  // low load up, and only then full throttle, a turbo at its least boost first.
  return [
    {
      id: 'injectors', title: 'Tell the ECU what injectors are fitted', go: 'injectors',
      text: `On INJECTORS, set the injector scaling to the ${fittedCc} cc/min injectors on the engine. Every fuel sum the ECU makes starts from it.`,
      done: fittedCc != null && build.ecuInjectorCc === fittedCc,
    },
    {
      id: 'mixture', title: 'Set the mixture targets first', go: 'fuel',
      text: `On FUEL, keep cruise at 14.7 and set the full-load rows${naAfr ? ` to about ${naAfr.toFixed(1)} AFR` : ''}${boosted && boostAfr ? `, and the boost rows to about ${boostAfr.toFixed(1)} at full boost` : ''}. The VE is tuned to hit these, so they come before it. Richer is safe for a first pull; leaner is not.`,
      done: full.length > 0 && full.every((q) => mine('afr', q) <= theirs('afr', q) + GUIDE_TOLERANCE.afr),
    },
    {
      id: 'spark', title: 'Start the spark safe', go: 'spark',
      text: anchors.length
        ? `On SPARK, at full load keep the timing no higher than about ${anchors.map((q) => `${Math.round(theirs('timing', q))}° at ${Math.round(q.rpm / 100) * 100} RPM`).join(', ')}, and fill the cells between so the column runs smoothly. That is a few degrees under what the engine can take; it is found later, on the dyno, a degree or two at a time.`
        : 'On SPARK, start the full-load timing a few degrees under what you expect the engine to take.',
      done: full.length > 0 && full.every((q) => mine('timing', q) <= theirs('timing', q) + GUIDE_TOLERANCE.spark),
    },
    {
      id: 'air', title: 'Fuel it from low load up', go: 'airflow',
      text: `On the dyno, pull at 40% throttle, then on AIRFLOW press Correct VE from logs; pull again until it holds. Then the same at 70%.${steps.length ? ` Keep the boost at ${steps[0]} psi meanwhile (TUNE → BOOST, Boost limit by gear: 4th is the dyno's gear).` : ''} The mixture matters more than the timing, and a lean cell at full load is what hurts an engine, so the fuel is right before the throttle goes all the way.`,
      done: airDone,
    },
    {
      id: 'pull', title: steps.length ? `First full-throttle pull at ${steps[0]} psi` : 'Make the first full-throttle pull', go: 'dyno',
      text: `One full-throttle pull${steps.length ? `, the boost held at ${steps[0]} psi` : ''}. Correct VE from that log too; where the log shows knock, take that timing and a couple of degrees more out of those cells before the next pull.`,
      done: null,
    },
    ...(steps.length > 1 ? [{
      id: 'boost', title: 'Raise the boost a step at a time', go: 'boost',
      text: `Raise Boost limit by gear for 4th in steps, ${steps.join(' → ')} psi, with a pull at each and its knock and lean fixed before the next. Where it will not run clean, stop: better fuel or less boost goes further, not more timing out. Then set the limit back above your ${boostTarget} psi target.`,
      done: null,
    }] : []),
  ];
}
