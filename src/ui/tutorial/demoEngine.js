/**
 * The engine the tutorial talks about — the same one a player gets on SANDBOX.
 *
 * The tutorial shows real game screens, and a real screen needs real data: a pull, the
 * advisor's verdicts, the VE log. This works them out the way the game does, from a
 * store-shaped state (`makeInitialState()`, optionally changed by a scenario), through
 * the same simulator calls EcuLab.jsx makes. So every number a lesson quotes — "the
 * stock V6 makes 258 whp", "this cell reads 95%" — is the number the player will see
 * when they do it themselves, and it moves with the physics instead of going stale.
 *
 * Pure apart from its cache: state in, derived data out. `tests/ui/tutorial.test.jsx`
 * holds it to the app: the demo's stock pull must equal the app's first pull.
 */

import {
  COMPRESSOR_OPTS, EXHAUST_DIA_OPTS, INJECTOR_OPTS, TURBINE_OPTS,
  blowerOf, calibrationAdvice, computeHardwareVE, deriveEngine, dynoConditions,
  ecuHardwareOf, interp2, isLocatable, simulateSweep, tankFuel, turbineWithCount,
  veCorrections, veSamplesFromPull, veTruthByPhaseFor,
} from '../../sim/index.js';
import { eventBands } from '../components/eventBands.js';
import { makeInitialState } from '../state/initialState.js';

/** @typedef {import('../state/initialState.js').StoreState} StoreState */

/**
 * Everything a pull is solved from, derived from the store exactly as EcuLab.jsx does
 * (`fuel`, `hwForVe`, `veTruth`, `ecuHw`, `ecuBundle`, `sweepArgs`).
 *
 * @param {StoreState} state
 */
export function pullInputs(state) {
  const { build, tune, session } = state;
  const {
    engineConfig, mods, turboOn, boostCurve, injIdx, mafScalar, turbineIdx, turbineCount,
    compressorIdx, exhaustDiaIdx, ecuInjectorCc, blowerRatio, nitrous,
  } = build;
  const fuel = tankFuel(build);
  const derived = deriveEngine(engineConfig);
  const turbine = turbineWithCount(TURBINE_OPTS[turbineIdx], turbineCount);
  const blower = blowerOf(build);
  const hwForVe = {
    turboOn, turbine: turboOn ? turbine : null, exhaustDia: EXHAUST_DIA_OPTS[exhaustDiaIdx].dia, fuel,
    peakBoostPsi: turboOn ? Math.max(...boostCurve) : 0, supercharged: !!blower,
  };
  const veTruth = computeHardwareVE(engineConfig, mods, hwForVe);
  const ecuHw = { ...ecuHardwareOf(build), veTruthByPhase: veTruthByPhaseFor(engineConfig, mods, hwForVe) };
  const armed = session.liveAux?.nitrous !== false;
  const ecu = {
    cal: tune.ecu, hw: nitrous ? { ...ecuHw, nitrous } : ecuHw,
    cond: dynoConditions(session.env, session.faults, nitrous ? { armed, heater: !!nitrous.heater } : null),
  };
  const args = {
    loadKpa: session.loadKpa, ve: tune.ve, veTruth, timing: tune.timing, afr: tune.afr, turboOn, boostCurve,
    octaneBonus: fuel.bonus, octaneLabel: fuel.label, fuel, injectorCc: INJECTOR_OPTS[injIdx].cc, ecuInjectorCc,
    injectorLabel: INJECTOR_OPTS[injIdx].label, mods, mafScalar, derived, turbine,
    compressor: COMPRESSOR_OPTS[compressorIdx], ecu,
    ...(blower ? { blower, blowerRatio } : {}), ...(nitrous ? { nitrous } : {}),
  };
  let mafErrorBase = 1;
  if (mods.intake) mafErrorBase *= 0.90;
  if (turboOn) mafErrorBase *= 0.92;
  return { args, derived, veTruth, fuel, mafErrorBase };
}

/**
 * @typedef {object} Demo
 * @property {StoreState} state the store the snippets are seeded from
 * @property {object} result the dyno pull, as `simulateSweep` returns it
 * @property {object} calAdvice what TUNE's SPARK and FUEL advisors say about this tune
 * @property {object[]} chartData DYNO's curves, shaped as the shell shapes them
 * @property {object[]} bands the pull's event bands on the chart
 * @property {number} wholePullCount events that belong to the whole pull, not an RPM
 * @property {{pull: object[], live: object[], airModel: 'blend'|'sd'|'maf', pullInfo: {state: 'none'|'stale'|'part-load'|'unused'|'ok'}, onApply: (share: number) => void}} veLog
 *   TUNE › AIRFLOW's log correction, fed from this pull
 * @property {ReturnType<typeof deriveEngine>} derived
 * @property {number[][]} veTruth the engine's real breathing (for the tutorial's own maths, never shown as a tuning aid)
 * @property {object} fuel
 */

/** Scenario runs are pure and a few tens of milliseconds each: worked out once. */
const cache = new Map();

/**
 * Runs a scenario the way the game would: build the store, pull, and derive what the
 * screens are handed.
 *
 * @param {string} key a cache key, one per scenario
 * @param {(state: StoreState) => StoreState} [scenario] changes to the SANDBOX start
 * @returns {Demo}
 */
export function runDemo(key, scenario = (s) => s) {
  if (cache.has(key)) return cache.get(key);
  const base = scenario(makeInitialState());
  const { args, derived, veTruth, fuel, mafErrorBase } = pullInputs(base);
  const result = simulateSweep(args);
  // The advisor's pull is the same full-throttle pull, as in EcuLab.jsx.
  const advisorPull = base.session.loadKpa === 100 ? result : simulateSweep({ ...args, loadKpa: 100 });
  const calAdvice = calibrationAdvice({
    ve: base.tune.ve, veTruth, timing: base.tune.timing, afr: base.tune.afr, derived,
    octaneBonus: fuel.bonus, fuel, mods: base.build.mods, turboOn: base.build.turboOn,
    boostCurve: base.build.boostCurve, compressor: COMPRESSOR_OPTS[base.build.compressorIdx],
    turbine: args.turbine, injectorCc: args.injectorCc, ecuInjectorCc: base.build.ecuInjectorCc,
    mafScalar: base.build.mafScalar, mafErrorBase, pull: advisorPull,
  });
  const chartData = result.points.map((p) => ({
    rpm: p.rpm, hp: p.hp, torque: p.torque, afr: p.afr, afrCommanded: p.afrCommanded,
    timing: p.timing, commandedTiming: p.commandedTiming, duty: p.duty, trimPct: p.trimPct,
  }));
  const pull = veSamplesFromPull(result.points);
  const state = { ...base, session: { ...base.session, result, pullCount: 1 } };
  const demo = {
    state, result, calAdvice, chartData, derived, veTruth, fuel,
    bands: eventBands(result.events),
    wholePullCount: result.events.filter((e) => !isLocatable(e)).length,
    veLog: {
      pull, live: [], airModel: /** @type {'blend'|'sd'|'maf'} */ (base.tune.ecu?.config?.airModel ?? 'blend'),
      pullInfo: { state: /** @type {'ok'|'unused'} */ (pull.length ? 'ok' : 'unused') },
      // The sandbox's own table is what a snippet's APPLY changes; this is only its label.
      onApply: () => {},
    },
  };
  cache.set(key, demo);
  return demo;
}

/**
 * The air one cylinder takes in at a cell, the way the ECU works it out — for a
 * lesson's worked example. Same ideal-gas step as article 7 on Learn.
 *
 * @param {Demo} demo
 * @param {number} rpm
 * @param {number} mapKpa
 */
export function airPerCylinder(demo, rpm, mapKpa) {
  const p = demo.result.points.reduce((best, q) => (Math.abs(q.rpm - rpm) < Math.abs(best.rpm - rpm) ? q : best));
  const ve = interp2(demo.state.tune.ve, rpm, mapKpa);
  const vCylL = demo.derived.displacementL / demo.derived.cyl;
  const tK = p.iat + 273.15;
  const rho = (mapKpa * 1000) / (287 * tK);
  const mg = (ve / 100) * (vCylL / 1000) * rho * 1e6;
  return { ve, vCylL, tK, iatC: p.iat, rho, mg, point: p };
}

/** The log's correction for one cell, split into the parts TUNE › AIRFLOW shows. */
export function veCellMaths(demo, row, col) {
  const { cell } = veCorrections(demo.veLog.pull);
  return cell[row]?.[col] ?? null;
}
