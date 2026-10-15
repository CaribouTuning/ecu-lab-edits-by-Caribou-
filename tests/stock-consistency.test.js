/**
 * What a player sees first must agree with itself: a stock calibration must not be flagged
 * by TUNE's advisor as past the knock limit anywhere on the table, whatever load the dyno
 * happens to pull at.
 */
import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeEngine } from './ecuHarness.js';

const advise = (eng, octaneIdx) => {
  const build = { ...eng.build, octaneIdx };
  const cc = S.INJECTOR_OPTS[build.injIdx].cc;
  return S.calibrationAdvice({
    ve: eng.tables.ve, veTruth: eng.veTruth, timing: eng.tables.timing, afr: eng.tables.afr,
    derived: eng.derived, fuel: S.OCTANE_OPTS[octaneIdx], mods: build.mods, turboOn: build.turboOn,
    boostCurve: build.boostCurve, compressor: eng.compressor, turbine: eng.turbine,
    injectorCc: cc, ecuInjectorCc: cc, mafScalar: build.mafScalar ?? 1,
    mafErrorBase: S.mafErrorFactor(build.mods, build.turboOn),
  });
};

describe('stock calibrations against TUNE\'s advisor', () => {
  it('the default engine is clean on every table cell at every pump octane it can be given', () => {
    const eng = makeEngine({});
    for (let oi = 0; oi < S.OCTANE_OPTS.length; oi += 1) {
      const over = advise(eng, oi).overAdvanced.map((c) => `${S.LOAD[c.ri]} kPa / ${S.RPM[c.ci]} rpm`);
      expect(over, `octane option ${oi}`).toEqual([]);
    }
  });

  it.each(S.ENGINE_PRESETS.map((p) => p.id))('%s is clean at the pump fuel its preset names', (id) => {
    const eng = makeEngine({ preset: id });
    const over = advise(eng, eng.build.octaneIdx).overAdvanced.map((c) => `${S.LOAD[c.ri]} kPa / ${S.RPM[c.ci]} rpm`);
    expect(over).toEqual([]);
  });
});

describe('RESET ALL TO STOCK', () => {
  it.each(S.ENGINE_PRESETS.map((p) => p.id))('writes a calibration that is clean on %s, not the Nissan V6 tables', (id) => {
    const eng = makeEngine({ preset: id });
    const stock = S.stockCalibrationFor(eng.build);
    eng.tables.timing = stock.timing;
    eng.tables.afr = stock.afr;
    const hw = {
      turboOn: eng.build.turboOn, turbine: eng.build.turboOn ? eng.turbine : null,
      exhaustDia: S.EXHAUST_DIA_OPTS[eng.build.exhaustDiaIdx].dia, fuel: eng.fuel,
      peakBoostPsi: eng.build.turboOn ? Math.max(...eng.build.boostCurve) : 0,
    };
    eng.tables.ve = S.computeHardwareVE(eng.build.engineConfig, S.DEFAULT_MODS, hw);
    const cc = S.INJECTOR_OPTS[eng.build.injIdx].cc;
    const advice = S.calibrationAdvice({
      ve: eng.tables.ve, veTruth: eng.veTruth, timing: stock.timing, afr: stock.afr,
      derived: eng.derived, fuel: eng.fuel, mods: eng.build.mods, turboOn: eng.build.turboOn,
      boostCurve: eng.build.boostCurve, compressor: eng.compressor, turbine: eng.turbine,
      injectorCc: cc, ecuInjectorCc: eng.build.ecuInjectorCc, mafScalar: stock.mafScalar,
      mafErrorBase: S.mafErrorFactor(eng.build.mods, eng.build.turboOn),
    });
    expect(advice.overAdvanced).toEqual([]);
    expect(eng.pull(100).events.filter((e) => e.type === 'knock' || e.type === 'knockprot')).toEqual([]);
  });
});
