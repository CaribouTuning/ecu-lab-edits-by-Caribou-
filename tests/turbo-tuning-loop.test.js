/**
 * The loop a player runs after bolting a turbo on: pull, read the log and TUNE's advice,
 * do what they name (the log's MAF and VE entries, TUNE's cells), pull again. It has to end somewhere true: clean at every
 * throttle (no "safe at full throttle, knocks at half"), a Tuning Score of 100, and more
 * power than the engine made before the turbo. Each of those once failed: the advice never
 * converged, part-throttle rows stayed past the knock limit, and an over-retarded tune
 * scored 100 while making naturally aspirated power.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

import { makeEngine } from './ecuHarness.js';

const LOADS = [100, 70, 40];
const peak = (r) => Math.max(...r.points.map((p) => p.hp));

/** TUNE's advice for the engine as it stands, judged from a pull at this throttle. */
function adviceAt(eng, load) {
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

/** Rounds of pull-and-correct until TUNE names nothing at any throttle; how many it took. */
function tuneFromTheAdvice(eng) {
  for (let round = 1; round <= 9; round++) {
    let changed = 0;
    // The log's setup entries first, as a player works it: the MAF scalar its MAF entry
    // names, then the VE table corrected from the log where the engine missed its table.
    const log = eng.pull(100);
    const maf = log.events.find((e) => e.type === 'maf');
    const named = maf && /to about ([0-9.]+), which cancels/.exec(maf.fix);
    if (named) { eng.build.mafScalar = Number(named[1]); changed++; continue; }
    // Every throttle's log where the engine missed its table: the VE tool learns from any pull.
    const missed = LOADS.map((l) => (l === 100 ? log : eng.pull(l))).filter((r) => r.events.some((e) => e.type === 'missedmix'));
    if (missed.length) {
      const axes = S.layoutById(eng.tables.layout).ve;
      const { ratio } = S.veCorrections(missed.flatMap((r) => S.veSamplesFromPull(r.points)), axes);
      // The column past the redline the log cannot reach: its trend carried on by hand, as
      // the missed-mixture entry asks.
      const carried = ratio.map((row) => { let last = null; return row.map((r) => (r == null ? last : (last = r))); });
      const next = S.applyVeCorrections(eng.tables.ve, carried, 1);
      for (let r = 0; r < next.length; r++) eng.tables.ve[r] = next[r];
      changed++;
    }
    for (const load of LOADS) {
      const { a } = adviceAt(eng, load);
      for (const c of [...a.overAdvanced, ...a.pastMbt, ...a.underAdvanced]) { eng.tables.timing[c.ri][c.ci] = c.suggested; changed++; }
      for (const c of a.wrongMix) if (c.suggested != null) { eng.tables.afr[c.ri][c.ci] = c.suggested; changed++; }
    }
    if (!changed) return round;
  }
  return Infinity;
}

function expectTunedTurbo(eng, naHp) {
  // The log's setup (the MAF scalar, then VE) takes a round or two before TUNE's cells.
  expect(tuneFromTheAdvice(eng)).toBeLessThanOrEqual(7);
  for (const load of LOADS) {
    const { pull, a } = adviceAt(eng, load);
    expect(a.overAdvanced, `past the knock limit at ${load}% throttle`).toEqual([]);
    expect(pull.events.filter((e) => e.type === 'knock'), `knock at ${load}% throttle`).toEqual([]);
    expect(S.computeTuningScore(pull, a.overAdvanced).score, `score at ${load}% throttle`).toBe(100);
  }
  // A turbo tuned to the knock limit makes more than the engine did without it.
  expect(peak(eng.pull(100))).toBeGreaterThan(naHp * 1.15);
}

describe('tuning a turbo on from the pull log and TUNE', () => {
  it('a Nissan VQ35DE, 6 psi on 91 octane', () => {
    const preset = 'vq35de-revup';
    const p = S.applyPreset(S.presetById(preset));
    const naHp = peak(makeEngine({ preset }).pull(100));
    const eng = makeEngine({ preset, build: { turboOn: true, boostCurve: [0, 0, 3.6, 6, 6, 6, 6, 6], injIdx: 3, ecuInjectorCc: 650, octaneIdx: 0, mods: { ...p.mods, intercooler: true } } });
    expectTunedTurbo(eng, naHp);
  });

  it("a V6 of the player's own on its safe base map, 6 psi on 91 octane", () => {
    const chk = /** @type {any} */ (S.validateCustomEngine({ configuration: 'V6', bore: '95.5', stroke: '81.4', compression: '9.5', redline: '7000' }));
    const cp = S.customEnginePatch(chk.engine, chk.assumed);
    const fields = {
      engineConfig: cp.engineConfig, mods: cp.mods, turbineIdx: cp.turbineIdx, compressorIdx: cp.compressorIdx, injIdx: cp.injIdx,
      ecuInjectorCc: cp.ecuInjectorCc, octaneIdx: cp.octaneIdx, exhaustDiaIdx: cp.exhaustDiaIdx, mafScalar: cp.mafScalar, factoryInduction: cp.factoryInduction,
    };
    const tables = () => ({ ve: S.clone2D(cp.ve), timing: S.clone2D(cp.timing), afr: S.clone2D(cp.afr), layout: cp.layout });
    const na = makeEngine({ build: { ...fields, boostCurve: cp.boostCurve } });
    Object.assign(na.tables, tables());
    const eng = makeEngine({ build: { ...fields, turboOn: true, boostCurve: [0, 0, 3.6, 6, 6, 6, 6, 6], injIdx: 3, ecuInjectorCc: 650, mods: { ...cp.mods, intercooler: true } } });
    Object.assign(eng.tables, tables());
    expectTunedTurbo(eng, peak(na.pull(100)));
  });
});
