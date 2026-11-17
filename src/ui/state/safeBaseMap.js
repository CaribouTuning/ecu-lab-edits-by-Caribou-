/**
 * SANDBOX's "Load a safe base map": what a tuner loads on a freshly built engine and proves on
 * the dyno before the first power pull, in the order a tuner works (HP Academy, Practical
 * Standalone Tuning step 7 and webinar 129, "Steady state vs ramp run"):
 */

import {
  BARO_KPA, INJECTOR_OPTS, PSI_TO_KPA, ecuHardwareOf, getCal, setCal, SPARK_MIN_DEG, applyVeCorrections, calibrationAdvice, intakeCamAt, layoutById, loadFor, simulateSweep, veCorrections, veSamplesFromPull,
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
const MAX_PULLS = 4;

const fullThrottle = (st) => ({ ...st, session: { ...st.session, loadKpa: 100 } });
const atThrottle = (st, pct) => ({ ...st, session: { ...st.session, loadKpa: pct } });
const pullOf = (st, pct = 100) => simulateSweep(pullInputs(atThrottle(st, pct)).args);
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
    if (!(realKnock(q) > KNOCK_SEEN_DEG || hidden)) continue;
    const take = Math.ceil(realKnock(q)) + SAFE_KNOCK_MARGIN_DEG;
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
    const stuck = realKnock(q) > KNOCK_SEEN_DEG
      && cellsAround(sparkAxes, q.rpm, loadFor(sparkAxes, { mapKpa: q.map, airmassG: q.airCharge ?? 0 })).every(([ri, ci]) => timing[ri][ci] <= SPARK_MIN_DEG + 0.05);
    if (!hot && !stuck) continue;
    const floor = SAFE_RICHEST_LAMBDA * (q.ecuStoich ?? 14.7);
    for (const [ri, ci] of cellsAround(afrAxes, q.rpm, loadFor(afrAxes, { mapKpa: q.map, airmassG: q.airCharge ?? 0 }))) {
      const v = Number(Math.max(floor, richer[ri][ci] - SAFE_RICHEN_STEP_AFR).toFixed(1));
      if (v < richer[ri][ci]) { richer[ri][ci] = v; moved = true; }
    }
  }

  // Fuel: the VE cells this pull ran, corrected from its own log toward the targets, rich or
  // lean, as Correct VE from logs does (points whose fuel the ECU itself changed are left out).
  let ve = st.tune.ve;
  const next = veFromLogs(st, [p]);
  if (next) { ve = next; moved = true; }
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
/**
 * The retard a point's knock control took for knock the engine had: what it pulled less what
 * it pulled for valvetrain noise the sensor mistook for knock (`knockFalse`).
 */
const realKnock = (q) => Math.max(0, (q.knockPull ?? 0) - (q.knockFalse ?? 0));
/** Knock retard a point must show before the check treats it as knock, degrees. */
const KNOCK_SEEN_DEG = 0.2;

/** Whether a pull is safe to make again: no knock, and no lean the map could have fixed. */
const isClean = (p) => !p.points.some((q) => realKnock(q) > KNOCK_SEEN_DEG)
  && !p.events.some((e) => UNSAFE.has(e.type) && !(e.type !== 'knock' && p.points.some((q) => q.fuelLimited)));

/** How far off target the VE must read before a correction is made, as a share. */
const VE_SETTLED = 0.02;
/**
 * The VE table corrected from these pulls' logs, or null where every cell they ran is already
 * within VE_SETTLED of its target.
 * @param {any} st @param {any[]} pulls
 */
function veFromLogs(st, pulls) {
  const axes = layoutById(st.tune.layout).ve;
  const { ratio } = veCorrections(pulls.flatMap((r) => veSamplesFromPull(r.points)), axes);
  if (!ratio.some((row) => row.some((r) => r != null && Math.abs(r - 1) > VE_SETTLED))) return null;
  return applyVeCorrections(st.tune.ve, ratio, 1);
}

/** The part-throttle runs fuel is corrected at first, low load up, % throttle. */
const FUEL_FIRST_LOADS = [40, 70];
/** VE passes at each part-throttle load before moving up. */
const FUEL_PASSES = 2;
/** Above this much boost past the spring, a step is put between them, psi. */
const BOOST_STEP_PSI = 4;

/**
 * The boosts a tuner proves a turbo at, low to high: the wastegate spring's pressure (the
 * least it can make), then steps of about BOOST_STEP_PSI to the build's target. An electronic
 * gate has no spring: it starts at half the target.
 * @param {any} build
 * @returns {number[]} psi
 */
export function boostSteps(build) {
  if (!build.turboOn) return [];
  const target = Math.max(0, ...build.boostCurve);
  // A turbo asked for no boost has no steps to take: "hold it at 0 psi" says nothing.
  if (target <= 0) return [];
  const gate = ecuHardwareOf(build).gate;
  const low = gate?.type === 'pneumatic' ? Math.min(target, gate.springPsi) : target / 2;
  const n = Math.max(1, Math.ceil((target - low) / BOOST_STEP_PSI));
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(Number((low + ((target - low) * i) / n).toFixed(1)));
  return [...new Set(out)];
}
/** The build with its boost held to at most this, for a step (the build itself is not changed). */
const capBoost = (st, psi) => ({ ...st, build: { ...st.build, boostCurve: st.build.boostCurve.map((b) => Math.min(b, psi)) } });
/** The build with its nitrous armed or not, for a step. */
const sprayArmed = (st, on) => ({ ...st, session: { ...st.session, liveAux: { ...(st.session.liveAux ?? {}), nitrous: on } } });

/**
 * @typedef {object} SafeBaseMap
 * @property {import('./reducer.js').LoadBaseMapAction} action the LOAD_BASE_MAP that loads it (Undo brings the old tables back)
 * @property {number} peakHp the checking pull's peak, wheel hp
 * @property {number} pulls how many pulls the check took, part throttle included
 * @property {string[]} steps what the tuner did, in order: the workflow, for the player to read
 * @property {number|null} cleanAt a turbo's highest boost step that ran clean, psi (null: naturally aspirated, or none)
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
  // Step zero, before the engine is started: the ECU is told what is fitted, the injectors'
  // flow and the MAF scaling for the intake (a tuner enters injector data first; the check
  // pulls once ran a 550 cc engine on a 315 cc scaling, rich enough to hide its knock).
  const fittedCc = INJECTOR_OPTS[state.build.injIdx]?.cc ?? state.build.ecuInjectorCc;
  let st = {
    ...state,
    build: { ...state.build, mafScalar: base.mafScalar ?? state.build.mafScalar, ecuInjectorCc: fittedCc },
    tune: { ...state.tune, ve: base.ve, timing: base.timing, afr: base.afr, ...(base.ecu ? { ecu: base.ecu } : {}), layout: base.layout ?? null },
  };
  /** @type {string[]} what the tuner did, in order, for the player to read */
  const steps = [];
  let pulls = 0;
  const steps0 = boostSteps(st.build);
  const spray = !!st.build.nitrous;
  /** The conditions of a run: boost held to a step, nitrous off until the engine is proven dry. */
  const run = (s, { psi = null, nitrous = false } = {}) => {
    let r = psi != null ? capBoost(s, psi) : s;
    if (spray) r = sprayArmed(r, nitrous);
    return r;
  };
  const restore = (s) => ({ ...s, build: { ...s.build, boostCurve: state.build.boostCurve }, session: state.session ? { ...s.session, liveAux: state.session.liveAux } : s.session });

  // 1. Fuel first, from low load up, at the least boost the turbo makes.
  const low = steps0[0] ?? null;
  for (const load of FUEL_FIRST_LOADS) {
    let corrected = 0;
    for (let i = 0; i < FUEL_PASSES; i += 1) {
      const r = run(st, { psi: low });
      const p = pullOf(r, load); pulls += 1;
      const ve = veFromLogs(r, [p]);
      if (!ve) break;
      st = { ...st, tune: { ...st.tune, ve } }; corrected += 1;
    }
    steps.push(`Fuel at ${load}% throttle${low != null ? ` (${low} psi)` : ''}: ${corrected ? `VE corrected from the log${corrected > 1 ? ` (${corrected} passes)` : ''}` : 'already on target'}.`);
  }

  // 2 and 3. Full throttle: at each boost step (or once, naturally aspirated), fuel and knock.
  const stages = steps0.length ? steps0 : [null];
  let p = null;
  /** The highest boost step that ran clean, psi (null: none yet, or naturally aspirated). */
  let cleanAt = null;
  for (const psi of stages) {
    let took = 0; let fuelled = 0;
    for (let i = 0; i < MAX_PULLS; i += 1) {
      const r = run(st, { psi });
      p = pullOf(r); pulls += 1;
      const before = r.tune.timing;
      const tune = isClean(p) && !veFromLogs(r, [p]) ? null : saferTables(r, p);
      if (!tune) break;
      if (tune.ve !== r.tune.ve) fuelled += 1;
      took = Math.max(took, ...before.flatMap((row, ri) => row.map((v, ci) => v - tune.timing[ri][ci])));
      st = restore({ ...r, tune });
    }
    const what = [fuelled ? 'VE corrected from the log' : null, took > 0.05 ? `up to ${took.toFixed(1)}° out where it knocked` : null].filter(Boolean).join(', ');
    const where = `Full throttle${psi != null ? ` at ${psi} psi${psi === stages[0] && ecuHardwareOf(st.build).gate?.type === 'pneumatic' ? ' (the wastegate spring)' : ''}` : ''}`;
    if (isClean(p)) {
      cleanAt = psi;
      steps.push(`${where}: ${what ? `${what}; then clean` : 'clean, nothing to change'}.`);
      continue;
    }
    // Still knocking (or lean) with nothing left a map can take out: a tuner stops raising the
    // boost here and says why; better fuel or less boost is the build's, not the map's.
    steps.push(`${where}: ${what ? `${what}, and ` : ''}it still ${p.points.some((q) => realKnock(q) > KNOCK_SEEN_DEG) ? 'knocks with the spark as low as the map can take it' : 'runs lean where the map has nothing left to add'}. ${psi != null ? (cleanAt != null ? `Boost raised no further: the highest step it ran clean was ${cleanAt} psi.` : 'Boost raised no further.') : ''}`.trim());
    break;
  }

  // 4. Nitrous, once the engine is proven dry.
  if (spray) {
    let took = 0;
    for (let i = 0; i < MAX_PULLS; i += 1) {
      const r = run(st, { nitrous: true });
      p = pullOf(r); pulls += 1;
      if (isClean(p)) break;
      const before = r.tune.timing;
      const tune = saferTables(r, p);
      if (!tune) break;
      took = Math.max(took, ...before.flatMap((row, ri) => row.map((v, ci) => v - tune.timing[ri][ci])));
      st = restore({ ...r, tune });
    }
    steps.push(`Nitrous armed: ${took > 0.05 ? `up to ${took.toFixed(1)}° out where it knocked` : 'checked'}${(getCal(st.tune.ecu, 'nitrous.fuelTrimPct') ?? 0) ? `, spray fuel correction ${getCal(st.tune.ecu, 'nitrous.fuelTrimPct')}%` : ''}.`);
  }

  // The proof: the build as asked for, boost at its target and the nitrous armed as the player has it.
  st = restore(st);
  p = pullOf(st); pulls += 1;
  // Clean means the log shows no knock and no lean at all. A lean the injectors or the pump
  // cannot answer is not the map's to fix (the check stops there), but the card must not
  // call it safe: it says so and names the part.
  const clean = isClean(p) && !p.events.some((e) => UNSAFE.has(e.type));
  const entry = (e) => ({ type: e.type, msg: String(e.msg), fix: String(e.fix ?? '') });
  return {
    action: { ...base, ecuInjectorCc: fittedCc, ve: st.tune.ve, timing: st.tune.timing, afr: st.tune.afr, ecu: st.tune.ecu },
    peakHp: p.peakHp,
    pulls,
    steps,
    cleanAt,
    clean,
    left: p.events.filter((e) => UNSAFE.has(e.type)).map(entry),
    parts: p.events.filter((e) => PARTS.has(e.type)).map(entry),
    samples: p.points.map((q) => ({ rpm: q.rpm, map: q.map, airCharge: q.airCharge ?? 0 })),
  };
}
