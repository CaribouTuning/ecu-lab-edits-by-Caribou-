/** SANDBOX's three ways to start tuning a freshly built engine (components/TuneStart.jsx): */

import { useSyncExternalStore } from 'react';

import { BARO_KPA, IDLE_COLUMN_MAX_RPM, INJECTOR_OPTS, OPEN_LOOP_KPA, getCal, layoutById, loadFor, readTable } from '../../sim/index.js';

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

/**
 * @typedef {object} GuideNow the guide's step now, as TUNE's guide shows it: the Next bar names it
 * @property {string} sig the build it is for
 * @property {number} n the step's number, from 1
 * @property {number} of how many steps
 * @property {string} title
 * @property {string} go its TUNE page, or `dyno`
 * @property {boolean} checkable the game checks it (false: a pull, worked from its log)
 */
/** @type {Set<() => void>} */
const guideListeners = new Set();
/** @type {GuideNow|null} */
let guideNow = null;
/** The guide shows a step: tell the Next bar. @param {GuideNow|null} v */
export function publishGuideStep(v) {
  if (JSON.stringify(v) === JSON.stringify(guideNow)) return;
  guideNow = v;
  for (const l of guideListeners) l();
}
const subscribeGuide = (/** @type {() => void} */ l) => { guideListeners.add(l); return () => { guideListeners.delete(l); }; };
const readGuide = () => guideNow;
/**
 * The guide's step now, for this build.
 * @param {string} sig
 * @returns {GuideNow|null}
 */
export function useGuideStep(sig) {
  const v = useSyncExternalStore(subscribeGuide, readGuide, readGuide);
  return v?.sig === sig ? v : null;
}
/**
 * The step the guide is on: the first not done, in order (a step skipped ahead to is not where
 * the player is); then the pulls; the last once all are done.
 * @param {GuideStep[]} steps
 * @returns {GuideStep}
 */
export function guideStepNow(steps) {
  return steps.find((s) => s.done === false) ?? steps.find((s) => s.done === null) ?? steps[steps.length - 1];
}

/** How close a cell must come to the target to count, by table. */
export const GUIDE_TOLERANCE = Object.freeze({ spark: 1, afr: 0.3, vePct: 6, maf: 0.02 });
/** A full-load target at or richer than this is worth naming; leaner is the closed-loop side. */
const RICH_ENOUGH_AFR = 14.0;

/**
 * @typedef {object} GuideStep
 * @property {string} id
 * @property {string} title
 * @property {string} [short] a few words for the guide's one line
 * @property {string} text what to do, with the targets the game worked out
 * @property {string} go the TUNE page (or `dyno`) it is done on
 * @property {boolean|null} done null where the game cannot check it (the pull itself)
 */

/**
 * The guided base map's steps for the tables as they stand, against the safe base map's.
 * @param {{build: any, tune: any, target: {ve: number[][], timing: number[][], afr: number[][], layout?: any, mafScalar?: number}, samples: {rpm: number, map: number, airCharge: number}[], advice?: {overAdvanced?: any[], wrongMix?: any[]}|null}} s
 * @returns {GuideStep[]}
 */
export function guidedSteps({ build, tune, target, samples, advice = null }) {
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
  // Spark cells past the knock limit, as TUNE's advisor judges them on the tables as they
  // stand (the limit moves with the mixture and the air, so a table comparison alone once
  // ticked a cell the advisor called past it).
  /** @type {{load: number, rpm: number, want: number}[]} */
  const hotCells = [];
  const sparkAx = layoutById(tune.layout).timing;
  if (advice?.overAdvanced) {
    for (const c of advice.overAdvanced) hotCells.push({ load: sparkAx.load[c.ri], rpm: c.rpm, want: c.suggested });
  } else {
    const tAx = layoutById(target.layout ?? tune.layout).timing;
    if (JSON.stringify(sparkAx) === JSON.stringify(tAx) && sparkAx.loadUnit === 'kPa') {
      const reach = Math.max(BARO_KPA, ...pts.map((q) => q.map));
      sparkAx.load.forEach((load, ri) => {
        if (load >= OPEN_LOOP_KPA || load > reach + 1) return;
        sparkAx.rpm.forEach((rpm, ci) => {
          if (rpm > IDLE_COLUMN_MAX_RPM && tune.timing[ri][ci] > target.timing[ri][ci] + 0.05) hotCells.push({ load, rpm, want: target.timing[ri][ci] });
        });
      });
    }
  }
  // Mixture cells the advisor calls lean.
  const leanCells = (advice?.wrongMix ?? []).filter((c) => c.suggested < c.current);
  // The MAF scaling the base map carries for the intake fitted: where the ECU reads the meter.
  const mafTarget = target.mafScalar ?? build.mafScalar ?? 1;
  const mafStep = ['blend', 'maf'].includes(getCal(tune.ecu, 'config.airModel') ?? 'blend') && Math.abs(mafTarget - 1) > GUIDE_TOLERANCE.maf;
  const boostTarget = build.turboOn ? Math.max(0, ...build.boostCurve) : 0;
  const airDone = pts.length > 0 && pts.every((q) => Math.abs(mine('ve', q) / theirs('ve', q) - 1) * 100 <= GUIDE_TOLERANCE.vePct);
  // The order a tuner works (HP Academy, Practical Standalone Tuning; webinar 129): what the
  // ECU is told about the parts, the targets the fuel is tuned to, safe spark, then fuel from
  // low load up, and only then full throttle, a turbo at its least boost first.
  return [
    {
      id: 'injectors', title: 'Tell the computer which injectors are fitted', short: 'Injector size', go: 'injectors',
      text: `Open INJECTORS and set ECU Injector Scaling to ${fittedCc}. Injectors are the nozzles that spray the fuel, and this engine has ${fittedCc} cc/min ones. The engine's computer (the ECU) works out how long to hold them open from their size: if it thinks they are smaller than they are, every spray is too big and the engine runs rich (too much fuel). That wastes power, and it can hide knock.`,
      done: fittedCc != null && build.ecuInjectorCc === fittedCc,
    },
    ...(mafStep ? [{
      id: 'maf', title: 'Tell the computer how to read the air meter', short: 'Air meter (MAF)', go: 'sensors',
      text: `Open SENSORS and set the MAF scalar to ${mafTarget.toFixed(2)}. The MAF is the air meter in the intake: the computer measures the air with it and adds fuel to match. The ${build.mods?.intake && build.turboOn ? 'new intake and the turbo pipework change' : build.turboOn ? 'turbo pipework changes' : 'new intake changes'} how the air flows past it, so it now reads about ${Math.round((1 - 1 / mafTarget) * 100)}% less air than really goes in, and the engine would run lean (too little fuel, the dangerous way). The scalar corrects the reading. ${mafTarget.toFixed(2)} is the figure the game checked on the dyno; on a real car it comes from the intake maker, or from a wideband oxygen sensor and the fuel trims, and your first pull's fuel trims check it the same way.`,
      done: Math.abs((build.mafScalar ?? 1) - mafTarget) <= GUIDE_TOLERANCE.maf,
    }] : []),
    {
      id: 'mixture', title: 'Choose the fuel mixture', short: 'Fuel mixture', go: 'fuel',
      text: `Open FUEL. This table is the mixture the computer aims for, as an air-fuel ratio (AFR): about 14.7 parts air to 1 of fuel burns completely, and a lower number is richer (more fuel). Leave the cruise cells at 14.7${[naAfr && naAfr < RICH_ENOUGH_AFR ? `, make full throttle about ${naAfr.toFixed(1)}` : null, boosted && boostAfr ? `${naAfr && naAfr < RICH_ENOUGH_AFR ? ' and' : ', make'} full boost about ${boostAfr.toFixed(1)}` : null].filter(Boolean).join('') || ', and keep the full-throttle cells no higher than they are'}. Under load the extra fuel cools the cylinder and protects the engine, so richer is the safe side for a first run and leaner is how engines get hurt. This comes before the airflow, because the airflow is tuned to hit these numbers.${leanCells.length ? ` The advisor has marked ${leanCells.length === 1 ? 'a cell' : `${leanCells.length} cells`} on the table that are leaner than safe, with the number to type under each: ${leanCells.slice(0, 3).map((c) => `${sparkAx.load[c.ri] ?? c.map} kPa at ${c.rpm} RPM to ${c.suggested}`).join(', ')}.` : ''}`,
      done: full.length > 0 && full.every((q) => mine('afr', q) <= theirs('afr', q) + GUIDE_TOLERANCE.afr) && !leanCells.length,
    },
    {
      id: 'spark', title: 'Start with safe spark timing', short: 'Safe timing', go: 'spark',
      text: anchors.length
        ? `Open SPARK. Each cell is how many degrees before the piston reaches the top the spark fires. More timing makes more power, up to a point; too much causes knock, where the fuel explodes instead of burning smoothly, and knock breaks pistons. At full throttle keep the timing no higher than about ${anchors.map((q) => `${Math.round(theirs('timing', q))}° at ${Math.round(q.rpm / 100) * 100} RPM`).join(', ')}, and blend the cells between so each column rises smoothly.${hotCells.length ? ` The advisor has marked ${hotCells.length === 1 ? 'a cell' : `${hotCells.length} cells`} on the table that are past the knock limit, with the number to type under each: ${hotCells.slice(0, 3).map((c) => `${c.load} kPa at ${c.rpm} RPM to ${Number(c.want.toFixed(1))}°`).join(', ')}${hotCells.length > 3 ? `, and ${hotCells.length - 3} more` : ''}.` : ''} This starts a few degrees under what the engine can take; the rest is found later on the dyno, a degree or two at a time, watching for knock.`
        : 'Open SPARK and start the full-throttle timing a few degrees under what you expect the engine to take: too much timing causes knock, which breaks pistons.',
      done: full.length > 0 && full.every((q) => mine('timing', q) <= theirs('timing', q) + GUIDE_TOLERANCE.spark) && !hotCells.length,
    },
    {
      id: 'air', title: 'Get the fuel right at part throttle', short: 'Part-throttle fuel', go: 'airflow',
      text: `Now check the fuel against what really happens. On the dyno, run a pull at 40% throttle, then on AIRFLOW press Correct VE from logs. VE (volumetric efficiency) is how full of air each cylinder gets; the computer works out the fuel from it, and the pull's oxygen-sensor log shows where it is off. Repeat until the correction stays small, then do the same at 70% throttle.${steps.length ? ` Keep the boost at ${steps[0]} psi for now: TUNE → BOOST, Boost limit by gear, 4th (the gear the dyno uses).` : ''} Tuners get the fuel right at light load before going to full throttle, because a lean full-throttle run is what damages an engine.`,
      done: airDone,
    },
    {
      id: 'pull', title: steps.length ? `First full-throttle pull at ${steps[0]} psi` : 'First full-throttle pull', short: 'First full pull', go: 'dyno',
      text: `Run one full-throttle pull${steps.length ? ` with the boost held at ${steps[0]} psi` : ''}. Then read the pull log from the top and do what it says, in its order: problems with the parts and the fuel first (a lean spot, or Correct VE from logs), then knock. Where it reports knock, take that much timing out of the cells it names, plus a couple of degrees to be safe. If it says false knock, the knock sensor is too sensitive; the timing is fine. Pull again until the log shows no lean and no knock.`,
      done: null,
    },
    ...(steps.length > 1 ? [{
      id: 'boost', title: 'Raise the boost a little at a time', short: 'Boost in steps', go: 'boost',
      text: `On TUNE → BOOST, raise Boost limit by gear for 4th in steps: ${steps.join(' → ')} psi. At each step run a pull and fix what the log says before going higher. If a step will not run clean, stop there: the answer is better fuel or less boost, not ever less timing. When you are done, set the limit back above your ${boostTarget} psi target.`,
      done: null,
    }] : []),
  ];
}
