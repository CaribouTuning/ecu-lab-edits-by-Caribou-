/**
 * The simulator off the drawing thread. Runs the same code the screens run, on the same inputs,
 * and hands back the breathing it solved (`breathingSnapshot`), so the thread that draws the
 * screen only reads it back (`seedBreathing`) and never freezes on the gas exchange.
 *
 * Tasks, each the slow first step of something a player does:
 *   preset  a factory engine put on the bench: its factory calibration (`applyPreset`)
 *   advice  TUNE's advice for the store as it stands: the full-throttle pull and the advisor
 *   demo    one of the Learn guide's worked examples (tutorial/scenarios.js), by name
 */

import {
  applyPreset, breathingSnapshot, calibrationAdvice, intakeCamAt, presetById, simulateSweep,
} from '../../sim/index.js';
import { pullInputs } from '../state/pullInputs.js';
import * as SCENARIOS from '../tutorial/scenarios.js';

/** The grids this task added to: only those go back. */
function changedSince(before) {
  const snap = breathingSnapshot();
  return { grids: snap.grids.filter(([k, nodes]) => (before.get(k) ?? 0) < nodes.length), runners: snap.runners };
}

/** @param {{task: string, payload: any}} msg */
function run({ task, payload }) {
  if (task === 'preset') applyPreset(presetById(payload.id), payload.layout ?? null);
  else if (task === 'advice') {
    const st = payload.state;
    const { args, veTruth, mafErrorBase } = pullInputs({ ...st, session: { ...st.session, loadKpa: 100 } });
    const pull = simulateSweep(args);
    calibrationAdvice({
      ve: st.tune.ve, veTruth, timing: st.tune.timing, afr: st.tune.afr, layout: st.tune.layout, derived: args.derived,
      octaneBonus: args.octaneBonus, fuel: args.fuel, mods: args.mods, turboOn: args.turboOn, boostCurve: args.boostCurve,
      compressor: args.compressor, turbine: args.turbine, camAt: intakeCamAt(st.build.engineConfig, st.tune.ecu?.vvt),
      exhaustDia: args.exhaustDia, injectorCc: args.injectorCc, ecuInjectorCc: args.ecuInjectorCc, mafScalar: args.mafScalar,
      mafErrorBase, pull,
    });
  } else if (task === 'demo') {
    // `veHalfPasses` takes its pass count: the four the guide shows.
    for (const name of payload.names) { const f = /** @type {any} */ (SCENARIOS)[name]; if (typeof f === 'function') f(name === 'veHalfPasses' ? 4 : undefined); }
  }
}

/** The worker's own global: `self` in a worker, written so the linter's browser globals accept it. */
const scope = /** @type {any} */ (globalThis);

scope.onmessage = (e) => {
  const { id } = e.data;
  try {
    const before = new Map(breathingSnapshot().grids.map(([k, n]) => [k, n.length]));
    run(e.data);
    scope.postMessage({ id, ok: true, snap: changedSince(before) });
  } catch (err) {
    scope.postMessage({ id, ok: false, error: String(/** @type {any} */ (err)?.message ?? err) });
  }
};
