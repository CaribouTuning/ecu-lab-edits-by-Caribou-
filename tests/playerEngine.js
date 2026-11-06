/**
 * An engine of the player's own, built the way BUILD builds one: the spec form's figures
 * through `validateCustomEngine` and `customEnginePatch`, on the safe base map that
 * generates, then whatever the player bolts on. For tests that play the game.
 */

import * as S from '../src/sim/index.js';

import { engineOutgrowsTables, extendAxes } from '../src/ui/state/layoutSwitch.js';

import { makeEngine } from './ecuHarness.js';

/**
 * @param {{configuration: string, bore: number, stroke: number, compression: number, redline: number}} spec
 *   the four required figures and the layout, as typed on the form
 * @param {object} [build] build fields to change after it is created (a turbo, injectors...)
 * @param {object} [cal] calibration paths to override (a burble...)
 */
export function playerEngine(spec, build = {}, cal = {}) {
  const chk = /** @type {any} */ (S.validateCustomEngine({
    configuration: spec.configuration, bore: String(spec.bore), stroke: String(spec.stroke),
    compression: String(spec.compression), redline: String(spec.redline),
  }));
  if (!chk.ok) throw new Error(`not a valid engine: ${JSON.stringify(chk.errors)}`);
  const cp = S.customEnginePatch(chk.engine, chk.assumed);
  const eng = makeEngine({
    build: {
      engineConfig: cp.engineConfig, mods: cp.mods, turbineIdx: cp.turbineIdx, compressorIdx: cp.compressorIdx,
      injIdx: cp.injIdx, ecuInjectorCc: cp.ecuInjectorCc, octaneIdx: cp.octaneIdx, exhaustDiaIdx: cp.exhaustDiaIdx,
      mafScalar: cp.mafScalar, factoryInduction: cp.factoryInduction, boostCurve: cp.boostCurve,
      ...build,
      ...(build.mods ? { mods: { ...cp.mods, ...build.mods } } : {}),
    },
    cal,
  });
  Object.assign(eng.tables, { ve: S.clone2D(cp.ve), timing: S.clone2D(cp.timing), afr: S.clone2D(cp.afr), layout: cp.layout });
  // As SANDBOX does in the same write as the part (reducer.js `withRowsForTheBuild`): a build
  // that reaches past its tables gets rows and columns appended, filled from the edge.
  const state = { build: eng.build, tune: { layout: cp.layout, ve: eng.tables.ve, timing: eng.tables.timing, afr: eng.tables.afr, baseline: null, untuned: null } };
  if (engineOutgrowsTables(/** @type {any} */ (state))) {
    const x = extendAxes(/** @type {any} */ (state));
    Object.assign(eng.tables, { ve: x.ve, timing: x.timing, afr: x.afr, layout: x.layout });
  }
  return eng;
}

/** TUNE's advice for the engine as it stands, from a pull at this throttle. */
export function adviceAt(eng, load) {
  const pull = eng.pull(load);
  const cc = S.INJECTOR_OPTS[eng.build.injIdx].cc;
  const a = S.calibrationAdvice({
    ve: eng.tables.ve, veTruth: eng.veTruth, timing: eng.tables.timing, afr: eng.tables.afr, layout: eng.tables.layout, camAt: eng.camAt,
    derived: eng.derived, fuel: eng.fuel, mods: eng.build.mods, turboOn: eng.build.turboOn, boostCurve: eng.build.boostCurve,
    compressor: eng.compressor, turbine: eng.turbine, injectorCc: cc, ecuInjectorCc: eng.build.ecuInjectorCc,
    mafScalar: eng.build.mafScalar ?? 1, mafErrorBase: S.mafErrorFactor(eng.build.mods, eng.build.turboOn), pull,
    exhaustDia: S.EXHAUST_DIA_OPTS[eng.build.exhaustDiaIdx].dia,
  });
  return { pull, a };
}

/** The throttles a player pulls at. */
export const LOADS = [100, 70, 40];

/**
 * Rounds of pull-and-correct until TUNE names nothing; how many it took. TUNE's advice is
 * judged on a full-throttle pull whatever load the player pulled at (EcuLab.jsx
 * `advisorPull`), so it is taken from one here too. Taking it from part-throttle pulls as
 * well flipped a cell the full-throttle pull meets with the turbine's back-pressure behind
 * it (80 kPa at 7600 RPM: a 25 degree limit) against the same pressure throttled (34): advice
 * no player is shown. The tests still require no knock at any throttle afterwards.
 */
export function tuneFromTheAdvice(eng, rounds = 6) {
  for (let round = 1; round <= rounds; round++) {
    let changed = 0;
    for (const load of [100]) {
      const { a } = adviceAt(eng, load);
      for (const c of [...a.overAdvanced, ...a.pastMbt, ...a.underAdvanced]) { eng.tables.timing[c.ri][c.ci] = c.suggested; changed++; }
      for (const c of a.wrongMix) if (c.suggested != null) { eng.tables.afr[c.ri][c.ci] = c.suggested; changed++; }
    }
    if (!changed) return round;
  }
  return Infinity;
}

/** Peak wheel horsepower of a pull. */
export const peakHp = (r) => Math.max(...r.points.map((p) => p.hp));
