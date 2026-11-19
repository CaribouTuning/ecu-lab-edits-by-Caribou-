/** SANDBOX's three ways to start tuning a freshly built engine (components/TuneStart.jsx): */

import { useSyncExternalStore } from 'react';

import { BARO_KPA, BLOWER_OPTS, IDLE_COLUMN_MAX_RPM, INJECTOR_OPTS, KNOCK_SAFETY_DEG, OPEN_LOOP_KPA, getCal, layoutById, loadFor, mafErrorFactor, readTable, tankFuel } from '../../sim/index.js';

import { changedParts, isOwnEngine, offersBaseMap, originPreset } from './baseMap.js';
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

/** The guide's last word: where it stops, and where the player takes over. */
const DONE = ' Once that pull is clean, the base map is done: the engine runs safe on these parts. The power left is yours to find: tap a SPARK cell to see the room the last pull measured there, add a degree or two at a time and pull again. The pull log speaks up only when something is wrong.';

/** How close a cell must come to the target to count, by table. */
export const GUIDE_TOLERANCE = Object.freeze({ spark: 1, afr: 0.3, vePct: 6, maf: 0.02 });

/**
 * @typedef {object} GuideStep
 * @property {string} id
 * @property {string} title
 * @property {string} [short] a few words for the guide's one line
 * @property {string} text what to do, with the targets the game worked out
 * @property {string} go the TUNE page (or `dyno`) it is done on
 * @property {boolean|null} done null where the game cannot check it (the pull itself)
 */

/** The fuel as a player names it: "91 octane", "E85". @param {{label: string}} f */
const fuelName = (f) => (/^\d+$/.test(f.label) ? `${f.label} octane` : f.label);

/**
 * What this build is against the engine it started as, in a few words a player reads: the parts
 * that make a base map different from the factory's.
 * @param {any} build
 * @returns {string[]}
 */
export function buildChanges(build) {
  const preset = originPreset(build);
  if (!preset) return ['your own engine, with a calibration generated for it'];
  const changed = changedParts(build, preset);
  const out = [];
  const peak = Math.max(0, ...(build.boostCurve ?? [0]));
  if (build.turboOn && !preset.induction?.turboOn) out.push(`${(build.turbineCount ?? 1) > 1 ? 'twin turbos' : 'a turbo'} at ${peak} psi${build.mods?.intercooler ? ' with an intercooler' : ', no intercooler'}`);
  else if (build.turboOn && changed.has('induction')) out.push(`the turbo changed (${peak} psi${build.mods?.intercooler ? ', intercooled' : ''})`);
  if (build.blowerId) out.push(`a ${BLOWER_OPTS.find((b) => b.id === build.blowerId)?.label ?? 'supercharger'}${build.mods?.intercooler ? ' with an intercooler' : ''}`);
  if (build.nitrous) out.push(`a ${build.nitrous.shotHp} hp ${build.nitrous.kit} nitrous shot`);
  const fitted = INJECTOR_OPTS[build.injIdx]?.cc;
  const factory = INJECTOR_OPTS[build.factoryInjIdx ?? preset.parts?.injectorIdx]?.cc;
  if (fitted && factory && fitted !== factory) out.push(`${fitted} cc injectors (factory ${factory})`);
  if (build.octaneIdx !== preset.parts?.octaneIdx) out.push(fuelName(tankFuel(build)));
  if (changed.has('block')) out.push((build.engineConfig?.compression ?? 0) > (preset.engine?.compression ?? 0) ? 'higher compression' : 'block changes');
  if (changed.has('head')) out.push('a different head or cam');
  if (changed.has('boltons')) out.push(['intake', 'exhaust', 'headers'].filter((k) => build.mods?.[k] && !preset.mods?.[k]).join(', ') || 'exhaust changes');
  return out;
}

/**
 * The guided base map's steps for the tables as they stand, against the safe base map's.
 * @param {{build: any, tune: any, target: {ve: number[][], timing: number[][], afr: number[][], layout?: any, mafScalar?: number, ecu?: any}, samples: {rpm: number, map: number, airCharge: number}[], advice?: {overAdvanced?: any[], wrongMix?: any[]}|null}} s
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
  /** @type {{load: number, rpm: number, want: number, cannot?: boolean}[]} */
  const hotCells = [];
  const sparkAx = layoutById(tune.layout).timing;
  if (advice?.overAdvanced) {
    for (const c of advice.overAdvanced) hotCells.push({ load: sparkAx.load[c.ri], rpm: c.rpm, want: c.suggested, cannot: !!c.sparkCannotFix });
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
  // The MAF scaling the base map carries for the intake fitted: where the ECU reads the meter. A
  // step only where this build moved it from the factory's, or the player has since.
  const preset = originPreset(build);
  const mafTarget = target.mafScalar ?? build.mafScalar ?? 1;
  const factoryMaf = preset ? 1 / mafErrorFactor(preset.mods ?? {}, !!preset.induction?.turboOn) : 1;
  const mafStep = ['blend', 'maf'].includes(getCal(tune.ecu, 'config.airModel') ?? 'blend')
    && (Math.abs(mafTarget - factoryMaf) > GUIDE_TOLERANCE.maf || Math.abs((build.mafScalar ?? 1) - mafTarget) > GUIDE_TOLERANCE.maf);
  // The injectors: a step where they were changed, or the ECU is not told the ones fitted.
  const factoryCc = INJECTOR_OPTS[build.factoryInjIdx ?? preset?.parts?.injectorIdx ?? build.injIdx]?.cc;
  const injStep = fittedCc != null && (fittedCc !== factoryCc || build.ecuInjectorCc !== fittedCc);
  const fuel = tankFuel(build);
  // The FUEL table is written on petrol's scale whatever is in the tank, as many tuning
  // suites show it: 14.7 is lambda 1.00, and the computer converts it with the fuel's own
  // stoichiometric ratio when it works out the fuel (sim/point.js lambdaCommanded).
  const stoich = 14.7;
  const fuelStoich = fuel.stoich ?? 14.7;
  const noCooler = boosted && !build.mods?.intercooler;
  // Nitrous: the spray's own retard and fuel, as the base map was checked with them.
  const wantRetard = build.nitrous ? getCal(target.ecu, 'nitrous.retardDeg') : null;
  const wantTrim = build.nitrous ? getCal(target.ecu, 'nitrous.fuelTrimPct') : null;
  const boostTarget = build.turboOn ? Math.max(0, ...build.boostCurve) : 0;
  const airDone = pts.length > 0 && pts.every((q) => Math.abs(mine('ve', q) / theirs('ve', q) - 1) * 100 <= GUIDE_TOLERANCE.vePct);
  // The order a tuner works (HP Academy, Practical Standalone Tuning; webinar 129): what the
  // ECU is told about the parts, the targets the fuel is tuned to, safe spark, then fuel from
  // low load up, and only then full throttle, a turbo at its least boost first.
  return [
    ...(build.turboOn && boostTarget <= 0 ? [{
      id: 'boost-target', title: 'Give the turbo a boost target', short: 'Boost target', go: 'build:induction',
      text: 'The turbo is set to make 0 psi of boost, so it only gets in the way of the exhaust: the engine makes less power than it did without it. On TUNE → BOOST, set the Boost target curve; 6–8 psi is a common first step on pump fuel. A new boost is a new build, so the way into the tune is offered again for it.',
      done: false,
    }] : []),
    ...(injStep ? [{
      id: 'injectors', title: 'Tell the computer which injectors are fitted', short: 'Injector size', go: 'injectors',
      text: `Open INJECTORS and set ECU Injector Scaling to ${fittedCc}. ${factoryCc && factoryCc !== fittedCc ? `You fitted ${fittedCc} cc/min injectors where the factory ones flowed ${factoryCc}: they are the nozzles that spray the fuel, and each now sprays ${Math.round((fittedCc / factoryCc - 1) * 100)}% more in the same time.` : `The engine has ${fittedCc} cc/min injectors (the nozzles that spray the fuel), but the computer is set for ${build.ecuInjectorCc}.`} The engine's computer (the ECU) works out how long to hold them open from their size: told the wrong size, every spray is wrong and the engine runs ${build.ecuInjectorCc != null && build.ecuInjectorCc < fittedCc ? 'rich (too much fuel), which wastes power and can hide knock' : build.ecuInjectorCc != null && build.ecuInjectorCc > fittedCc ? 'lean (too little fuel), the dangerous way' : 'rich or lean whatever the tables say'}.`,
      done: build.ecuInjectorCc === fittedCc,
    }] : []),
    ...(mafStep ? [{
      id: 'maf', title: 'Tell the computer how to read the air meter', short: 'Air meter (MAF)', go: 'sensors',
      text: `Open SENSORS and set the MAF scalar to ${mafTarget.toFixed(2)}. The MAF is the air meter in the intake: the computer measures the air with it and adds fuel to match. The ${build.mods?.intake && build.turboOn ? 'new intake and the turbo pipework change' : build.turboOn ? 'turbo pipework changes' : 'new intake changes'} how the air flows past it, so it now reads about ${Math.round((1 - 1 / mafTarget) * 100)}% less air than really goes in, and the engine would run lean (too little fuel, the dangerous way). The scalar corrects the reading. ${mafTarget.toFixed(2)} is the figure the game checked on the dyno; on a real car it comes from the intake maker, or from a wideband oxygen sensor and the fuel trims, and your first pull's fuel trims check it the same way.`,
      done: Math.abs((build.mafScalar ?? 1) - mafTarget) <= GUIDE_TOLERANCE.maf,
    }] : []),
    {
      id: 'mixture', title: 'Choose the fuel mixture', short: 'Fuel mixture', go: 'fuel',
      text: (() => {
        const what = `Open FUEL. This table is the mixture the computer aims for, as an air-fuel ratio (AFR) on petrol's scale: 14.7 is the mixture that burns completely (lambda 1.00), and a lower number is richer (more fuel).${Math.abs(fuelStoich - 14.7) > 0.5 ? ` That holds on ${fuelName(fuel)} too: it burns completely at about ${fuelStoich.toFixed(1)} parts air to 1 of fuel, and the computer converts the table to that itself, so 14.7 still means lambda 1.00 and 12.5 still means lambda 0.85.` : ''}`;
        // The numbers the step is checked against, across the speeds it is checked at: one middle
        // figure, typed everywhere, failed the check where the target richens toward the top (a turbo
        // V6's boost rows run 12.6 at 1500 RPM to 11.6 at 7500, and "about 12.0" left 12.0 typed in
        // cells that had to be 11.9 or richer).
        const span = (list, mid, label) => {
          if (!list.length || mid == null) return null;
          const byRpm = [...list].sort((a, b) => a.rpm - b.rpm);
          const lo = byRpm[0]; const hi = byRpm[byRpm.length - 1];
          const a = theirs('afr', lo); const z = theirs('afr', hi);
          return Math.abs(a - z) >= GUIDE_TOLERANCE.afr
            ? `${label} about ${a.toFixed(1)} at ${lo.rpm.toLocaleString('en-US')} RPM down to ${z.toFixed(1)} at ${hi.rpm.toLocaleString('en-US')} (or richer)`
            : `${label} about ${mid.toFixed(1)}`;
        };
        // On a pressure axis the boost rows' own numbers, column by column, as the safe base map
        // holds them: what the step is checked against, and what a tuner copies.
        const afrAx = layoutById(target.layout).afr;
        const boostRows = afrAx.loadUnit === 'kPa' ? afrAx.load.map((l, ri) => [l, ri]).filter(([l]) => l > 101) : [];
        const sameRows = boostRows.length > 0 && boostRows.every(([, ri]) => target.afr[ri].every((v, ci) => Math.abs(v - target.afr[boostRows[0][1]][ci]) < 0.05));
        const boostCols = sameRows ? afrAx.rpm.map((rpm, ci) => [rpm, target.afr[boostRows[0][1]][ci]]).filter(([rpm]) => rpm > IDLE_COLUMN_MAX_RPM && rpm <= (build.engineConfig?.redline ?? Infinity) + 500) : [];
        const boostText = boostCols.length && boostCols.some(([, v]) => Math.abs(v - boostCols[0][1]) >= GUIDE_TOLERANCE.afr)
          ? `the ${boostRows.map(([l]) => Math.round(l)).join(' and ')} kPa rows (full boost) ${boostCols.map(([rpm, v]) => `${v.toFixed(1)} at ${rpm.toLocaleString('en-US')}`).join(', ')} RPM, or richer`
          : null;
        const wants = [naAfr && naAfr < stoich * 0.95 ? span(full.filter((q) => q.map <= 105), naAfr, 'full throttle') : null, boosted && boostAfr ? (boostText ?? span(boostPts, boostAfr, 'full boost')) : null].filter(Boolean).join(' and ');
        const why = boosted ? `Boost packs more air into each cylinder, so it gets hotter: the extra fuel cools it and holds knock off, so${noCooler ? ' with no intercooler (hotter air still)' : ''} the boost rows run richer than full throttle without boost.` : 'Under load the extra fuel cools the cylinder and protects the engine.';
        const done = full.length > 0 && full.every((q) => mine('afr', q) <= theirs('afr', q) + GUIDE_TOLERANCE.afr) && !leanCells.length;
        if (done) return `${what} ${wants ? `This build wants ${wants}` : 'This build wants the full-throttle cells richer than cruise'}, and your table is already there: nothing to change. ${why}`;
        return `${what} Leave the cruise cells at ${stoich.toFixed(1)}${wants ? ` and make ${wants}` : ', and keep the full-throttle cells no higher than they are'}. ${why} Richer is the safe side for a first run; leaner is how engines get hurt. This comes before the airflow, because the airflow is tuned to hit these numbers.${leanCells.length ? ` The advisor has marked ${leanCells.length === 1 ? 'a cell' : `${leanCells.length} cells`} on the table that are leaner than safe, with the number to type under each: ${leanCells.slice(0, 3).map((c) => `${sparkAx.load[c.ri] ?? c.map} kPa at ${c.rpm} RPM to ${c.suggested}`).join(', ')}.` : ''}`;
      })(),
      done: full.length > 0 && full.every((q) => mine('afr', q) <= theirs('afr', q) + GUIDE_TOLERANCE.afr) && !leanCells.length,
    },
    {
      id: 'spark', title: 'Start with safe spark timing', short: 'Safe timing', go: 'spark',
      text: (() => {
        const intro = `Open SPARK. Each cell is how many degrees before the piston reaches the top the spark fires. More timing makes more power, up to a point; too much causes knock, where the fuel explodes instead of burning smoothly, and knock breaks pistons.${boosted ? ` Boost raises the pressure and heat in the cylinder, so this engine knocks at less timing than it did${noCooler ? ', and with no intercooler the air going in is hotter still' : ''}: the boost rows need less timing than the rows below them.` : ''}${fuel.label === 'E85' ? ' E85 resists knock far better than pump fuel, so it takes more timing than the same engine on gasoline.' : ''}`;
        // With TUNE's advisor on the table, the step is the advisor's: the marked cells and the
        // numbers under them are what the player types, so the guide asks for nothing else. (It
        // once also quoted the safe base map's figures, 6 degrees under the limit, while the
        // marks sat 1.5 under it: followed exactly, the marks never ticked the step.)
        if (advice) {
          const cannot = hotCells.filter((c) => c.cannot);
          const typeable = hotCells.filter((c) => !c.cannot);
          // Knock no spark the table holds can fix: the boost there is the problem, as the pull
          // log says, and timing typed lower would not save the engine.
          const unfixable = cannot.length ? ` At ${cannot.length === 1 ? 'one cell' : `${cannot.length} cells`} (${cannot.slice(0, 2).map((c) => `${c.load} kPa at ${c.rpm} RPM`).join(', ')}${cannot.length > 2 ? ', …' : ''}) no timing the table can hold is safe at this boost: the knock limit sits under the most retard it allows. Lower the boost there first (TUNE → BOOST), or run a richer mixture, a cooler charge or better fuel, as the pull log says, then come back to this step.` : '';
          if (!typeable.length && cannot.length) return `${intro}${unfixable}`;
          return typeable.length
            ? `${intro} The advisor works out where this engine knocks at every cell it runs and has marked ${typeable.length === 1 ? 'the cell' : `the ${typeable.length} cells`} past that limit, with the number to type under each: ${typeable.slice(0, 3).map((c) => `${c.load} kPa at ${c.rpm} RPM to ${Number(c.want.toFixed(1))}°`).join(', ')}${typeable.length > 3 ? `, and ${typeable.length - 3} more` : ''}. Each number sits ${KNOCK_SAFETY_DEG}° under the knock limit, the margin a tuner leaves, and it does not change when you type it: set them all, then pull.${unfixable} The rest is found later on the dyno, a degree or two at a time, watching for knock.`
            : `${intro} Every full-throttle cell is under the knock limit with the ${KNOCK_SAFETY_DEG}° margin a tuner leaves: nothing to change here. The rest is found later on the dyno, a degree or two at a time, watching for knock.`;
        }
        return anchors.length
          ? `${intro} At full throttle keep the timing no higher than about ${anchors.map((q) => `${Math.round(theirs('timing', q))}° at ${Math.round(q.rpm / 100) * 100} RPM`).join(', ')}, and blend the cells between so each column rises smoothly. This starts a few degrees under what the engine can take; the rest is found later on the dyno, a degree or two at a time, watching for knock.`
          : 'Open SPARK and start the full-throttle timing a few degrees under what you expect the engine to take: too much timing causes knock, which breaks pistons.';
      })(),
      done: advice ? full.length > 0 && !hotCells.length : full.length > 0 && full.every((q) => mine('timing', q) <= theirs('timing', q) + GUIDE_TOLERANCE.spark) && !hotCells.length,
    },
    {
      id: 'air', title: 'Get the fuel right at part throttle', short: 'Part-throttle fuel', go: 'airflow',
      text: `Now check the fuel against what really happens. On the dyno, run a pull at 40% throttle, then on AIRFLOW press Correct VE from logs. VE (volumetric efficiency) is how full of air each cylinder gets; the computer works out the fuel from it, and the pull's oxygen-sensor log shows where it is off. Repeat until the correction stays small, then do the same at 70% throttle.${steps.length ? ` Keep the boost at ${steps[0]} psi for now: on TUNE → BOOST, under Boost limit by gear, set 4th (the gear the dyno pulls in) to ${steps[0]}. The Boost target curve above it stays as it is: the limit holds the boost under it until you raise it.` : ''} Tuners get the fuel right at light load before going to full throttle, because a lean full-throttle run is what damages an engine.`,
      done: airDone,
    },
    {
      id: 'pull', title: steps.length ? `First full-throttle pull at ${steps[0]} psi` : 'First full-throttle pull', short: 'First full pull', go: 'dyno',
      text: `Run one full-throttle pull${steps.length ? ` with the boost held at ${steps[0]} psi (TUNE → BOOST, Boost limit by gear, 4th)` : ''}.${build.blowerId ? ' A supercharger\'s boost comes from its pulley, not from the computer, so this first pull already runs the full boost: the steps before it matter all the more.' : ''}${build.nitrous ? ' Leave the nitrous off (not armed) for now: it comes last, once the engine runs clean without it.' : ''} Then read the pull log from the top and do what it says, in its order: problems with the parts and the fuel first (a lean spot, or Correct VE from logs), then knock. Where it reports knock, set the cells it names to the numbers it gives: TUNE → SPARK marks the same cells with the same numbers. If it says false knock, the knock sensor is too sensitive; the timing is fine. Pull again until the log shows no lean and no knock.${steps.length > 1 || build.nitrous ? '' : DONE}`,
      done: null,
    },
    ...(steps.length > 1 ? [{
      id: 'boost', title: 'Raise the boost a little at a time', short: 'Boost in steps', go: 'boost',
      text: `On TUNE → BOOST, raise Boost limit by gear for 4th in steps: ${steps.join(' → ')} psi. At each step run a pull and fix what the log says before going higher. If a step will not run clean once the marked cells are set, stop there: the log names what limits it (better fuel, an intercooler, bigger injectors, or less boost). When you are done, set the limit back above your ${boostTarget} psi target.${build.nitrous ? '' : DONE}`,
      done: null,
    }] : []),
    ...(build.nitrous ? [{
      id: 'nitrous', title: 'Add the nitrous last', short: 'Nitrous', go: 'nitrous',
      text: `Only once the engine runs clean without it. Nitrous adds oxygen, so the ${build.nitrous.shotHp} hp shot burns more fuel, faster and hotter: while it sprays the engine needs less timing and ${build.nitrous.kit === 'dry' ? 'the computer must add the fuel for it' : 'its own fuel'}. On TUNE → NITROUS set Retard while spraying to at least ${wantRetard ?? 2}°${wantTrim ? ` and Fuel correction while spraying to ${wantTrim}%` : ''} (what the base map was checked with). Then arm it, make a pull, and work its log the same way.${DONE}`,
      done: wantRetard != null ? (getCal(tune.ecu, 'nitrous.retardDeg') ?? 0) >= wantRetard - 0.25 && (getCal(tune.ecu, 'nitrous.fuelTrimPct') ?? 0) >= (wantTrim ?? 0) - 0.5 : null,
    }] : []),
  ];
}
