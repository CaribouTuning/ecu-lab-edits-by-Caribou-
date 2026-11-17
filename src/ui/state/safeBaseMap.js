/**
 * SANDBOX's "Load a safe base map": what a tuner loads on a freshly built engine before the
 * first power pull. It starts from the base start-up map (baseMap.js, generated from the
 * physics, its full-load spark START_UP_RETARD_DEG short), then is checked on the dyno the
 * way a tuner checks one: a pull, and wherever it knocks or runs lean, less spark and more
 * fuel in those cells, a margin past what the advisor asks for, until a pull is clean.
 * Rich is left alone (rich is safe), and nothing here touches the parts: where a part is the
 * limit (injectors out of duty, valves floating, a turbo too small), the map makes it as safe
 * as a map can and says which part it is.
 *
 * The power it leaves is where the physics puts it: torque changes little within a few
 * degrees of best timing, so a naturally aspirated engine is a few percent short, a boosted
 * one more. It is a start, not a tune: the log and TUNE lead from here.
 */

import {
  BARO_KPA, PSI_TO_KPA, getCal, setCal, SPARK_MIN_DEG, applyVeCorrections, calibrationAdvice, intakeCamAt, layoutById, loadFor, simulateSweep, veCorrections, veSamplesFromPull,
} from '../../sim/index.js';

import { baseMapAction } from './baseMap.js';
import { pullInputs } from './pullInputs.js';

/** Log entries a base map must not leave: the engine is hurt, or about to be. */
const UNSAFE = new Set(['knock', 'unheardknock', 'knockprot', 'lean', 'leanprot', 'missedmix', 'egtprot']);
/** Entries a map cannot fix: a part is the limit. The base map names them instead. */
const PARTS = new Set(['fuel', 'dutyprot', 'rail', 'valve', 'float', 'backpressure', 'underboost', 'boostctl', 'pressure', 'bearing', 'cam', 'iatprot']);
/** Spark taken past what the advisor asks for in a cell that knocked: a tuner's margin. */
export const SAFE_KNOCK_MARGIN_DEG = 2;
/** Mixture a lean cell is set richer than the advisor's target by, AFR. */
export const SAFE_RICH_MARGIN_AFR = 0.2;
/** Pulls the check may take before it gives up and reports what is left. */
const MAX_PULLS = 6;

const fullThrottle = (st) => ({ ...st, session: { ...st.session, loadKpa: 100 } });
const pullOf = (st) => simulateSweep(pullInputs(fullThrottle(st)).args);
function adviceOf(st, p) {
  const { args, veTruth, mafErrorBase } = pullInputs(fullThrottle(st));
  return calibrationAdvice({
    ve: st.tune.ve, veTruth, timing: st.tune.timing, afr: st.tune.afr, layout: st.tune.layout, derived: args.derived,
    fuel: args.fuel, mods: args.mods, turboOn: args.turboOn, boostCurve: args.boostCurve, compressor: args.compressor, turbine: args.turbine,
    camAt: intakeCamAt(st.build.engineConfig, st.tune.ecu?.vvt), exhaustDia: args.exhaustDia, injectorCc: args.injectorCc,
    ecuInjectorCc: args.ecuInjectorCc, mafScalar: args.mafScalar, mafErrorBase, pull: p,
  });
}

/** The cells an ECU blends at a point: the two columns and the two rows either side. */
function cellsAround(axes, rpm, load) {
  const side = (xs, x) => {
    const order = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const below = [...order].reverse().find(([v]) => v <= x) ?? order[0];
    const above = order.find(([v]) => v >= x) ?? order[order.length - 1];
    return [...new Set([below[1], above[1]])];
  };
  const out = [];
  for (const ri of side(axes.load, load)) for (const ci of side(axes.rpm, rpm)) out.push([ri, ci]);
  return out;
}

/** The highest boost the build asks for, as manifold pressure, kPa. */
const askedKpa = (build) => BARO_KPA + (build.turboOn ? Math.max(0, ...build.boostCurve) : 0) * PSI_TO_KPA;

/**
 * One round of a tuner's check: where the pull knocked, the spark the knock control took plus
 * a margin out of the cells it ran (and, where a protection cut the boost to stop it, the rows
 * up to the boost it asked for); where it ran leaner than asked with fuel to spare, the VE
 * cells from the pull's own log and the mixture target to the advisor's.
 * @returns {import('./initialState.js').StoreState['tune']|null} the changed tables, or null for none
 */
function saferTables(st, p) {
  const sparkAxes = layoutById(st.tune.layout).timing;
  const timing = st.tune.timing.map((r) => [...r]);
  let moved = false;
  const top = askedKpa(st.build);
  for (const q of p.points) {
    const hidden = (q.protect ?? []).includes?.('knock');
    if (!((q.knockPull ?? 0) > KNOCK_SEEN_DEG || hidden)) continue;
    const take = Math.ceil(q.knockPull ?? 0) + SAFE_KNOCK_MARGIN_DEG;
    const want = (q.commandedTiming ?? q.timing) - take;
    const loads = [loadFor(sparkAxes, { mapKpa: q.map, airmassG: q.airCharge ?? 0 })];
    if (hidden && sparkAxes.loadUnit === 'kPa') loads.push(...sparkAxes.load.filter((l) => l > q.map && l <= top + 1));
    for (const load of loads) {
      for (const [ri, ci] of cellsAround(sparkAxes, q.rpm, load)) {
        const v = Math.max(SPARK_MIN_DEG, Math.round(Math.min(timing[ri][ci], want) * 10) / 10);
        if (v < timing[ri][ci]) { timing[ri][ci] = v; moved = true; }
      }
    }
  }
  // Where spark cannot come out any further (knock with the cells at the minimum) or the
  // exhaust ran hot enough for the ECU to add fuel itself: a richer target there, as a tuner
  // runs a direct-injection engine under load. Fuel cools the charge and the exhaust.
  const afrAxes = layoutById(st.tune.layout).afr;
  const richer = st.tune.afr.map((r) => [...r]);
  // While nitrous sprays the mixture is TUNE → NITROUS's, never the base tables': a hot spray
  // is answered with more fuel correction while spraying.
  let ecu = st.tune.ecu;
  const spraying = (q) => (q.nitrousLbMin ?? 0) > 0;
  const hotSpray = p.points.filter((q) => spraying(q) && (q.protect ?? []).includes?.('egt'));
  if (hotSpray.length && ecu?.nitrous) {
    const trim = getCal(ecu, 'nitrous.fuelTrimPct') ?? 0;
    // The mixture the log asks the spray for, against what it ran: the correction that gets
    // there in one step, a point past it. Already that rich, more fuel cools nothing: the heat
    // is the retard the spray needs, and the shot or the boost is what to change.
    const wantAfr = Number(/reads about ([0-9.]+):1/.exec(p.events.map((e) => String(e.fix ?? '')).join(' '))?.[1]);
    const ranAfr = Math.max(...hotSpray.map((q) => (q.lambda ?? 1) * (q.ecuStoich ?? 14.7)));
    if (wantAfr > 0 && ranAfr > wantAfr) {
      const v = Math.min(SAFE_SPRAY_TRIM_MAX_PCT, Math.ceil(((1 + trim / 100) * (ranAfr / wantAfr) - 1) * 100) + 1);
      if (v > trim) { ecu = setCal(ecu, 'nitrous.fuelTrimPct', v); moved = true; }
    }
  }
  for (const q of p.points) {
    if (spraying(q)) continue;
    const hot = (q.protect ?? []).includes?.('egt');
    const stuck = (q.knockPull ?? 0) > KNOCK_SEEN_DEG
      && cellsAround(sparkAxes, q.rpm, loadFor(sparkAxes, { mapKpa: q.map, airmassG: q.airCharge ?? 0 })).every(([ri, ci]) => timing[ri][ci] <= SPARK_MIN_DEG + 0.05);
    if (!hot && !stuck) continue;
    const floor = SAFE_RICHEST_LAMBDA * (q.ecuStoich ?? 14.7);
    for (const [ri, ci] of cellsAround(afrAxes, q.rpm, loadFor(afrAxes, { mapKpa: q.map, airmassG: q.airCharge ?? 0 }))) {
      const v = Number(Math.max(floor, richer[ri][ci] - SAFE_RICHEN_STEP_AFR).toFixed(1));
      if (v < richer[ri][ci]) { richer[ri][ci] = v; moved = true; }
    }
  }

  // Leaner than asked where the injectors still had fuel to give: the tables', not a part's.
  const leanByMap = p.points.some((q) => !q.fuelLimited && (q.lambda ?? 0) - (q.afrCommanded ?? 0) / (q.ecuStoich ?? 14.7) > LEAN_SEEN_LAMBDA)
    || p.events.some((e) => e.type === 'missedmix' || e.type === 'leanprot');
  let ve = st.tune.ve;
  if (leanByMap) {
    const { ratio } = veCorrections(veSamplesFromPull(p.points), layoutById(st.tune.layout).ve);
    const next = applyVeCorrections(st.tune.ve, ratio, 1);
    if (JSON.stringify(next) !== JSON.stringify(ve)) { ve = next; moved = true; }
  }
  const afr = richer;
  for (const c of adviceOf(st, p).wrongMix) {
    if (!(c.suggested < c.current)) continue;
    const v = Number((c.suggested - SAFE_RICH_MARGIN_AFR).toFixed(1));
    if (v < afr[c.ri][c.ci]) { afr[c.ri][c.ci] = v; moved = true; }
  }
  return moved ? { ...st.tune, timing, afr, ve, ecu } : null;
}

/** The most fuel correction while spraying the check sets, %. */
const SAFE_SPRAY_TRIM_MAX_PCT = 40;
/** How far a round richens a cell that knocks at minimum spark or runs hot, AFR. */
const SAFE_RICHEN_STEP_AFR = 0.6;
/** The richest a safe base map goes: λ 0.76, past where more fuel still cools (HP Academy's 0.78-0.80 under high boost, with margin). */
const SAFE_RICHEST_LAMBDA = 0.76;
/** Knock retard a point must show before the check treats it as knock, degrees. */
const KNOCK_SEEN_DEG = 0.2;
/** How much leaner than commanded a point must run before the check treats it as lean. */
const LEAN_SEEN_LAMBDA = 0.03;

/** Whether a pull is safe to make again: no knock, and no lean the map could have fixed. */
const isClean = (p) => !p.points.some((q) => (q.knockPull ?? 0) > KNOCK_SEEN_DEG)
  && !p.events.some((e) => UNSAFE.has(e.type) && !(e.type !== 'knock' && p.points.some((q) => q.fuelLimited)));

/**
 * @typedef {object} SafeBaseMap
 * @property {import('./reducer.js').LoadBaseMapAction} action the LOAD_BASE_MAP that loads it (Undo brings the old tables back)
 * @property {number} peakHp the checking pull's peak, wheel hp
 * @property {number} pulls how many pulls the check took
 * @property {boolean} clean whether the last pull ran with no knock and no lean the map could fix
 * @property {{type: string, msg: string, fix: string}[]} parts the parts that limit the build, as the log names them
 * @property {{type: string, msg: string, fix: string}[]} left what the last pull still logged that a map could not take out (knock with the spark at its minimum: the boost or the fuel)
 * @property {{rpm: number, map: number, airCharge: number}[]} samples where the checking pull ran: what a guided player is graded at
 */

/**
 * The safe base map for the engine on the bench.
 * @param {{build: any, tune: any, session: any}} state the build, and what a pull is solved from (tables, layout, ecu; env, faults)
 * @returns {SafeBaseMap}
 */
export function safeBaseMap(state) {
  const base = baseMapAction(state.build);
  // The base map on the bench, as LOAD_BASE_MAP puts it there (without the undo history:
  // nothing here is the player's yet).
  /** @type {any} */
  let st = {
    ...state,
    build: { ...state.build, mafScalar: base.mafScalar ?? state.build.mafScalar },
    tune: { ...state.tune, ve: base.ve, timing: base.timing, afr: base.afr, ...(base.ecu ? { ecu: base.ecu } : {}), layout: base.layout ?? null },
  };
  let p = pullOf(st);
  let pulls = 1;
  while (pulls < MAX_PULLS && !isClean(p)) {
    const tune = saferTables(st, p);
    if (!tune) break;
    st = { ...st, tune };
    p = pullOf(st);
    pulls += 1;
  }
  const clean = isClean(p);
  const entry = (e) => ({ type: e.type, msg: String(e.msg), fix: String(e.fix ?? '') });
  return {
    action: { ...base, ve: st.tune.ve, timing: st.tune.timing, afr: st.tune.afr, ecu: st.tune.ecu },
    peakHp: p.peakHp,
    pulls,
    clean,
    left: clean ? [] : p.events.filter((e) => UNSAFE.has(e.type)).map(entry),
    parts: p.events.filter((e) => PARTS.has(e.type)).map(entry),
    samples: p.points.map((q) => ({ rpm: q.rpm, map: q.map, airCharge: q.airCharge ?? 0 })),
  };
}
