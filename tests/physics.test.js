/**
 * Physics intent tests.
 *
 * The fingerprint test catches *that* something changed. These catch *what* — they
 * state, in readable form, the physical relationships the model is supposed to
 * honour. If one of these fails, a real modelling assumption has broken.
 *
 * Rule of thumb for adding to this file: assert on DIRECTION and RELATIONSHIP
 * ("more compression makes more torque"), not on exact magnitudes ("makes 237 hp").
 * Magnitudes belong to the fingerprint.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const STOCK = S.DEFAULT_ENGINE_CONFIG;
const NO_MODS = { ...S.DEFAULT_MODS, turboFitted: false };

/** Evaluates one point on a stock V6 with sensible defaults, overridable per test. */
function point(overrides = {}) {
  const {
    cfg = STOCK, fuel = S.OCTANE_OPTS[0], mods = NO_MODS,
    injectorCc = 315, ecuInjectorCc = 315,
    rpm = 5500, mapKpa = S.BARO_KPA, veVal = 95, timingVal = 32, afrCommanded = 12.6,
    mafScalar = 1.0, mafErrorBase = 1.0, compressor = S.COMPRESSOR_OPTS[1],
  } = overrides;
  return S.evaluatePoint({
    rpm, mapKpa,
    boostPsi: Math.max(0, (mapKpa - S.BARO_KPA) / S.PSI_TO_KPA),
    veVal, timingVal, afrCommanded,
    octaneBonus: fuel.bonus, fuel, mods,
    mafScalar, mafErrorBase, injectorCc, ecuInjectorCc,
    derived: S.deriveEngine(cfg), compressor,
  });
}

describe('engine architecture', () => {
  it('computes displacement from bore, stroke and cylinder count', () => {
    // π/4 × 9.55² × 8.14 × 6 ≈ 3498 cc
    expect(S.deriveEngine(STOCK).displacementL).toBeCloseTo(3.5, 1);
  });

  it('makes a bigger bore displace more', () => {
    const small = S.deriveEngine({ ...STOCK, bore: 85 }).displacementL;
    const big = S.deriveEngine({ ...STOCK, bore: 100 }).displacementL;
    expect(big).toBeGreaterThan(small);
  });

  it('raises thermal efficiency with compression ratio', () => {
    const low = S.deriveEngine({ ...STOCK, compression: 8.5 }).thermalEff;
    const high = S.deriveEngine({ ...STOCK, compression: 13.0 }).thermalEff;
    expect(high).toBeGreaterThan(low);
  });

  it('classifies bore/stroke character', () => {
    expect(S.deriveEngine({ ...STOCK, bore: 100, stroke: 80 }).character).toMatch(/Oversquare/);
    expect(S.deriveEngine({ ...STOCK, bore: 80, stroke: 100 }).character).toMatch(/Undersquare/);
  });

  it('costs knock margin for a cast iron head', () => {
    const alu = S.deriveEngine({ ...STOCK, headMaterial: 'Aluminum' }).materialKnockBonus;
    const iron = S.deriveEngine({ ...STOCK, headMaterial: 'Cast Iron' }).materialKnockBonus;
    expect(iron).toBeLessThan(alu);
  });

  it('lowers valve float speed with a bigger cam, and raises it with stiffer springs', () => {
    const base = S.valveFloatRpm(50, 210);
    expect(S.valveFloatRpm(50, 280)).toBeLessThan(base);
    expect(S.valveFloatRpm(90, 210)).toBeGreaterThan(base);
  });

  it('gives a stock cam zero overlap and a big cam a lot', () => {
    expect(S.camOverlapDeg(210)).toBe(0);
    expect(S.camOverlapDeg(280)).toBeGreaterThan(30);
  });
});

describe('airflow', () => {
  it('moves the VE peak up the RPM range with a longer cam', () => {
    const hw = { turboOn: false, turbine: null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0] };
    const mild = S.computeHardwareVE({ ...STOCK, camDuration: 200 }, S.DEFAULT_MODS, hw);
    const wild = S.computeHardwareVE({ ...STOCK, camDuration: 280, springRate: 95 }, S.DEFAULT_MODS, hw);
    const wotRow = 2;
    const lowCol = S.RPM.indexOf(2500);
    const highCol = S.RPM.indexOf(7500);
    // Bottom end given away, top end gained — the defining cam trade-off.
    expect(wild[wotRow][lowCol]).toBeLessThan(mild[wotRow][lowCol]);
    expect(wild[wotRow][highCol]).toBeGreaterThan(mild[wotRow][highCol]);
  });

  it('collapses cylinder filling above valve float', () => {
    const hw = { turboOn: false, turbine: null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0] };
    const floaty = { ...STOCK, camDuration: 290, springRate: 20 };
    const ve = S.computeHardwareVE(floaty, S.DEFAULT_MODS, hw);
    const floatRpm = S.deriveEngine(floaty).floatRpm;
    expect(floatRpm).toBeLessThan(7500);
    const wotRow = 2;
    const belowCol = S.RPM.findIndex((r) => r > floatRpm) - 1;
    const topCol = S.RPM.length - 1;
    expect(ve[wotRow][topCol]).toBeLessThan(ve[wotRow][belowCol]);
  });

  it('adds airflow when bolt-ons are fitted', () => {
    const hw = { turboOn: false, turbine: null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0] };
    const stock = S.computeHardwareVE(STOCK, S.DEFAULT_MODS, hw);
    const built = S.computeHardwareVE(STOCK, { intake: true, exhaust: true, headers: true, intercooler: false }, hw);
    const wotRow = 2, highCol = S.RPM.indexOf(6500);
    expect(built[wotRow][highCol]).toBeGreaterThan(stock[wotRow][highCol]);
  });

  it('keeps every VE cell inside physically sane bounds', () => {
    for (const cfg of [STOCK, { ...STOCK, compression: 13, camDuration: 300, springRate: 20 }]) {
      const ve = S.computeHardwareVE(cfg, { intake: true, exhaust: true, headers: true, intercooler: true }, {
        turboOn: true, turbine: S.TURBINE_OPTS[2], exhaustDia: 4.0, fuel: S.OCTANE_OPTS[3],
      });
      for (const row of ve) {
        for (const v of row) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(10);
          expect(v).toBeLessThanOrEqual(130);
        }
      }
    }
  });
});

describe('air charge and fuelling', () => {
  it('follows the ideal gas law — more manifold pressure means more air', () => {
    const low = point({ mapKpa: 50 }).airCharge;
    const high = point({ mapKpa: 100 }).airCharge;
    expect(high / low).toBeCloseTo(2, 1);
  });

  it('traps less air when the charge is hot', () => {
    const cool = point({ mapKpa: 200, mods: { ...NO_MODS, intercooler: true } });
    const hot = point({ mapKpa: 200, mods: { ...NO_MODS, intercooler: false } });
    expect(hot.iat).toBeGreaterThan(cool.iat);
    expect(hot.airCharge).toBeLessThan(cool.airCharge);
  });

  it('needs roughly 1.5x the fuel volume on E85 at the same lambda', () => {
    const gas = point({ fuel: S.OCTANE_OPTS[0] });
    const e85 = point({ fuel: S.OCTANE_OPTS[3] });
    // Same commanded AFR is the same relative richness only after dividing by stoich,
    // so compare pulse widths — the fuel system demand a tuner actually feels.
    const ratio = e85.pw / gas.pw;
    expect(ratio).toBeGreaterThan(1.3);
    expect(ratio).toBeLessThan(1.7);
  });

  it('runs rich when bigger injectors are fitted without rescaling the ECU', () => {
    const matched = point({ injectorCc: 315, ecuInjectorCc: 315 });
    const mismatched = point({ injectorCc: 850, ecuInjectorCc: 315 });
    expect(mismatched.lambda).toBeLessThan(matched.lambda);
    expect(mismatched.injMismatch).toBe(true);
    expect(matched.injMismatch).toBe(false);
  });

  it('leans out on its own once the injectors run out of time', () => {
    // Small injectors, huge airflow, high RPM: physically cannot deliver the fuel.
    const p = point({ rpm: 7500, mapKpa: 200, veVal: 120, injectorCc: 315, ecuInjectorCc: 315 });
    expect(p.fuelLimited).toBe(true);
    expect(p.afr).toBeGreaterThan(p.afrCommanded);
  });

  it('reports duty cycle as pulse width against the time available per cycle', () => {
    const p = point({ rpm: 6000 });
    const cycleMs = 120000 / 6000;
    expect(p.duty).toBeCloseTo((p.pw / cycleMs) * 100, 0);
  });

  it('runs open loop near wide-open throttle and closed loop at cruise', () => {
    expect(point({ mapKpa: 100 }).openLoop).toBe(true);
    expect(point({ mapKpa: 40 }).openLoop).toBe(false);
  });
});

describe('knock', () => {
  it('retards timing once commanded advance passes the threshold', () => {
    const safe = point({ timingVal: 10 });
    const wild = point({ timingVal: 50 });
    expect(safe.knock).toBe(false);
    expect(safe.timing).toBe(safe.commandedTiming);
    expect(wild.knock).toBe(true);
    expect(wild.timing).toBeLessThan(wild.commandedTiming);
  });

  it('tolerates far more advance at cruise than at wide-open throttle', () => {
    expect(point({ mapKpa: 20 }).threshold).toBeGreaterThan(point({ mapKpa: 101.325 }).threshold);
  });

  it('buys margin with higher octane', () => {
    const low = point({ fuel: S.OCTANE_OPTS[0] }).threshold;
    const high = point({ fuel: S.OCTANE_OPTS[3] }).threshold;
    expect(high).toBeGreaterThan(low);
  });

  it('loses margin as compression rises', () => {
    const lowCr = point({ cfg: { ...STOCK, compression: 9.0 } }).threshold;
    const highCr = point({ cfg: { ...STOCK, compression: 12.5 } }).threshold;
    expect(highCr).toBeLessThan(lowCr);
  });

  it('loses margin when the mixture is lean under load, but not at cruise', () => {
    const richWot = point({ mapKpa: 101.325, afrCommanded: 12.0 }).threshold;
    const leanWot = point({ mapKpa: 101.325, afrCommanded: 15.5 }).threshold;
    expect(leanWot).toBeLessThan(richWot);

    // At deep vacuum a lean mixture is normal and must not be punished — this is why
    // factory cruise maps carry 40+ degrees of advance at 14.7:1.
    const richCruise = point({ mapKpa: 20, afrCommanded: 12.0 }).threshold;
    const leanCruise = point({ mapKpa: 20, afrCommanded: 15.5 }).threshold;
    expect(richCruise - leanCruise).toBeLessThan(1.0);
  });

  it('never retards more than a real ECU would accumulate', () => {
    const p = point({ timingVal: 50, mapKpa: 200, cfg: { ...STOCK, compression: 13 } });
    expect(p.knockPull).toBeLessThanOrEqual(S.COEFF.MAX_KNOCK_RETARD);
  });
});

describe('torque production', () => {
  it('makes peak torque at MBT and less either side', () => {
    const atMbt = point({ timingVal: point().mbtIdeal });
    const retarded = point({ timingVal: point().mbtIdeal - 12 });
    expect(retarded.torque).toBeLessThan(atMbt.torque);
  });

  it('makes more torque with more air', () => {
    expect(point({ veVal: 110 }).torque).toBeGreaterThan(point({ veVal: 70 }).torque);
  });

  it('subtracts friction and pumping from indicated work', () => {
    const p = point();
    expect(p.bmep).toBeLessThan(p.imep);
    expect(p.fmep).toBeGreaterThan(0);
  });

  it('pays a large pumping penalty at closed throttle', () => {
    expect(point({ mapKpa: 20 }).fmep).toBeGreaterThan(point({ mapKpa: 101.325 }).fmep);
  });

  it('produces negative brake torque when motored at closed throttle', () => {
    // Engine braking: the engine cannot make positive torque pumping against vacuum.
    expect(point({ mapKpa: 20, veVal: 30, rpm: 6000 }).torque).toBeLessThan(0);
  });

  it('makes more power from more displacement, all else equal', () => {
    const small = point({ cfg: { ...STOCK, bore: 85 } }).hp;
    const big = point({ cfg: { ...STOCK, bore: 100 } }).hp;
    expect(big).toBeGreaterThan(small);
  });
});

describe('dyno sweep', () => {
  /** Runs a stock naturally-aspirated pull. */
  function stockPull(overrides = {}) {
    const cfg = overrides.cfg ?? STOCK;
    const derived = S.deriveEngine(cfg);
    const mods = overrides.mods ?? S.DEFAULT_MODS;
    const turboOn = overrides.turboOn ?? false;
    return S.simulateSweep({
      loadKpa: 100,
      ve: S.computeHardwareVE(cfg, mods, {
        turboOn, turbine: turboOn ? S.TURBINE_OPTS[1] : null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0],
      }),
      timing: S.clone2D(S.DEFAULT_TIMING),
      afr: S.clone2D(S.DEFAULT_AFR),
      turboOn,
      boostCurve: overrides.boostCurve ?? [...S.DEFAULT_BOOST],
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: overrides.injectorCc ?? 315,
      ecuInjectorCc: overrides.ecuInjectorCc ?? 315,
      injectorLabel: '315cc', mods, mafScalar: 1.0, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
      ...overrides.sweep,
    });
  }

  it('produces a believable stock baseline with a clean log', () => {
    const r = stockPull();
    expect(r.peakHp).toBeGreaterThan(180);
    expect(r.peakHp).toBeLessThan(300);
    expect(r.peakTq).toBeGreaterThan(150);
    expect(r.events).toHaveLength(0);
  });

  it('sweeps the full RPM range at the declared resolution', () => {
    const r = stockPull();
    expect(r.points[0].rpm).toBe(S.SWEEP_START_RPM);
    expect(r.points[r.points.length - 1].rpm).toBe(S.SWEEP_END_RPM);
    expect(r.points).toHaveLength((S.SWEEP_END_RPM - S.SWEEP_START_RPM) / S.SWEEP_STEP_RPM + 1);
  });

  it('knocks when boost is added to a stock naturally-aspirated calibration', () => {
    const r = stockPull({ turboOn: true, boostCurve: [0, 2, 8, 12, 14, 14, 14, 14] });
    expect(r.events.some((e) => e.type === 'knock')).toBe(true);
  });

  it('flags an injector scaling mismatch', () => {
    const r = stockPull({ injectorCc: 850, ecuInjectorCc: 315 });
    expect(r.events.some((e) => e.type === 'injscale')).toBe(true);
  });

  it('flags valve float as a hardware limit', () => {
    const r = stockPull({ cfg: { ...STOCK, camDuration: 290, springRate: 20 } });
    expect(r.events.some((e) => e.type === 'float')).toBe(true);
  });

  it('gives every event a cause and a fix, not just a complaint', () => {
    const r = stockPull({
      cfg: { ...STOCK, camDuration: 290, springRate: 20, compression: 12.5 },
      turboOn: true, boostCurve: [0, 4, 12, 20, 24, 25, 25, 25],
      injectorCc: 850, ecuInjectorCc: 315,
    });
    expect(r.events.length).toBeGreaterThan(0);
    for (const e of r.events) {
      expect(e.msg, `event ${e.type} has no msg`).toBeTruthy();
      expect(e.cause, `event ${e.type} has no cause`).toBeTruthy();
      expect(e.fix, `event ${e.type} has no fix`).toBeTruthy();
      expect(typeof e.impact).toBe('number');
    }
  });

  it('accumulates wear only when something damaging happened', () => {
    expect(stockPull().wear.piston).toBe(0);
    const nasty = stockPull({ turboOn: true, boostCurve: [0, 4, 12, 20, 24, 25, 25, 25] });
    expect(nasty.wear.piston).toBeGreaterThan(0);
  });
});

describe('scoring', () => {
  it('gives a clean pull full marks', () => {
    expect(S.computeTuningScore({ events: [] }).score).toBe(100);
  });

  it('deducts each event impact and never goes below zero', () => {
    expect(S.computeTuningScore({ events: [{ impact: 30, msg: 'a' }, { impact: 10, msg: 'b' }] }).score).toBe(60);
    expect(S.computeTuningScore({ events: Array(20).fill({ impact: 30, msg: 'x' }) }).score).toBe(0);
  });

  it('rewards output but scales it by cleanliness', () => {
    const clean = S.computePullScore({ peakHp: 300, peakTq: 300, tuningScore: 100, engineerScore: 100 });
    const dirty = S.computePullScore({ peakHp: 300, peakTq: 300, tuningScore: 20, engineerScore: 100 });
    expect(clean).toBeGreaterThan(dirty);
  });

  it('lets a big dirty pull out-score a small spotless one', () => {
    const big = S.computePullScore({ peakHp: 600, peakTq: 550, tuningScore: 60, engineerScore: 80 });
    const small = S.computePullScore({ peakHp: 180, peakTq: 170, tuningScore: 100, engineerScore: 100 });
    expect(big).toBeGreaterThan(small);
  });
});

describe('advisors never mutate the tables they inspect', () => {
  it('leaves VE, timing and AFR untouched', () => {
    const ve = S.computeHardwareVE(STOCK, S.DEFAULT_MODS, {
      turboOn: false, turbine: null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0],
    });
    const timing = S.clone2D(S.DEFAULT_TIMING);
    const afr = S.clone2D(S.DEFAULT_AFR);
    const before = JSON.stringify({ ve, timing, afr });

    S.veRecommendations(ve, STOCK, S.DEFAULT_MODS, {
      turboOn: false, turbine: null, exhaustDia: 3.0, fuel: S.OCTANE_OPTS[0],
    });
    S.calibrationAdvice({
      ve, timing, afr, derived: S.deriveEngine(STOCK), octaneBonus: 0,
      fuel: S.OCTANE_OPTS[0], mods: S.DEFAULT_MODS, turboOn: false,
      boostCurve: [...S.DEFAULT_BOOST], compressor: S.COMPRESSOR_OPTS[1],
      turbine: S.TURBINE_OPTS[1], injectorCc: 315, ecuInjectorCc: 315,
      mafScalar: 1.0, mafErrorBase: 1.0,
    });

    expect(JSON.stringify({ ve, timing, afr })).toBe(before);
  });
});

describe('table axes stay consistent', () => {
  it('gives every calibration table the same shape as its axes', () => {
    for (const table of [S.DEFAULT_VE, S.DEFAULT_TIMING, S.DEFAULT_AFR]) {
      expect(table).toHaveLength(S.LOAD.length);
      for (const row of table) expect(row).toHaveLength(S.RPM.length);
    }
  });

  it('gives the boost curve one entry per RPM breakpoint', () => {
    // Guards the class of bug where a hand-written array literal drifts out of sync
    // with the RPM axis and puts `undefined` into the physics.
    expect(S.DEFAULT_BOOST).toHaveLength(S.RPM.length);
    expect(S.DEFAULT_BOOST.every((v) => typeof v === 'number')).toBe(true);
  });

  it('keeps the RPM and LOAD axes monotonic', () => {
    for (let i = 1; i < S.RPM.length; i++) expect(S.RPM[i]).toBeGreaterThan(S.RPM[i - 1]);
    for (let i = 1; i < S.LOAD.length; i++) expect(S.LOAD[i]).toBeLessThan(S.LOAD[i - 1]);
  });
});

describe('knock threshold, as a shared function', () => {
  const base = {
    rpm: 5500, mapKpa: S.BARO_KPA, veActual: 95, chargeC: 25,
    actualAfr: 12.85, bestAfr: 12.85, boostPsi: 0, octaneBonus: 0,
    mods: NO_MODS, derived: S.deriveEngine(STOCK), compressor: S.COMPRESSOR_OPTS[1],
  };

  it('agrees exactly with the threshold evaluatePoint reports', () => {
    const p = point({ rpm: 5500, veVal: 95, afrCommanded: 12.85, timingVal: 20 });
    expect(S.knockThreshold({ ...base, actualAfr: p.afr, bestAfr: p.bestAfr, veActual: p.ve }))
      .toBeCloseTo(p.threshold, 1);
  });

  it('gives more margin at lower charge', () => {
    const light = S.knockThreshold({ ...base, mapKpa: 40, veActual: 55 });
    const heavy = S.knockThreshold({ ...base, mapKpa: 150, veActual: 105, boostPsi: 7 });
    expect(light).toBeGreaterThan(heavy);
  });

  it('gives more margin on higher octane', () => {
    expect(S.knockThreshold({ ...base, octaneBonus: 14 }))
      .toBeGreaterThan(S.knockThreshold({ ...base, octaneBonus: 0 }));
  });

  it('penalises a lean mixture only when there is cylinder pressure behind it', () => {
    const leanAtLoad = S.knockThreshold({ ...base, actualAfr: 15.5 });
    const richAtLoad = S.knockThreshold({ ...base, actualAfr: 12.0 });
    expect(leanAtLoad).toBeLessThan(richAtLoad);
    // At deep vacuum the same leanness barely matters.
    const leanCruise = S.knockThreshold({ ...base, mapKpa: 30, veActual: 45, actualAfr: 15.5 });
    const richCruise = S.knockThreshold({ ...base, mapKpa: 30, veActual: 45, actualAfr: 12.0 });
    expect(Math.abs(leanCruise - richCruise)).toBeLessThan(Math.abs(leanAtLoad - richAtLoad));
  });
});

describe('MBT timing', () => {
  it('needs more advance at higher RPM', () => {
    expect(S.mbtTiming(7000, S.BARO_KPA)).toBeGreaterThan(S.mbtTiming(2000, S.BARO_KPA));
  });

  it('needs less advance at higher load, because a denser charge burns faster', () => {
    expect(S.mbtTiming(5000, 200)).toBeLessThan(S.mbtTiming(5000, 40));
  });

  // The defect this model was written to fix: the old linear term spanned only 6
  // degrees across the whole load range, so it put cruise MBT around 25 deg. Real
  // factory cruise maps carry 40-50, because a thin charge burns slowly and must be
  // lit much earlier. See knock.js's own comment on the light-load knock margin.
  it('puts cruise MBT in the 40-50 deg band real calibrations use', () => {
    const cruise = S.mbtTiming(2500, 20);
    expect(cruise).toBeGreaterThan(40);
    expect(cruise).toBeLessThan(50);
  });

  it('spans far more than the old six degrees between cruise and wide-open throttle', () => {
    const span = S.mbtTiming(2500, 20) - S.mbtTiming(2500, S.BARO_KPA);
    expect(span).toBeGreaterThan(15);
  });

  it('leaves wide-open-throttle MBT where it was, so NA dyno power does not move', () => {
    // The burn model is calibrated to reproduce the old curve exactly at atmospheric
    // pressure. This is what keeps the change off the headline number.
    expect(S.mbtTiming(5500, S.BARO_KPA)).toBeCloseTo(26.0, 1);
    expect(S.mbtTiming(1500, S.BARO_KPA)).toBeCloseTo(18.0, 1);
  });

  it('never leaves the range a production calibration could use', () => {
    for (const rpm of [500, 800, 2500, 5500, 9000]) {
      for (const map of [5, 20, 40, 101.325, 150, 300]) {
        const mbt = S.mbtTiming(rpm, map);
        expect(mbt).toBeGreaterThanOrEqual(S.COEFF.MBT_MIN_DEG);
        expect(mbt).toBeLessThanOrEqual(S.COEFF.MBT_MAX_DEG);
      }
    }
  });

  it('stays finite at zero manifold pressure', () => {
    expect(Number.isFinite(S.mbtTiming(2500, 0))).toBe(true);
  });
});

describe('engine configuration and friction', () => {
  const at = (configuration, over = {}) => S.deriveEngine({ ...STOCK, configuration, ...over });

  it('knows an inline six has six cylinders', () => {
    expect(S.CYL_COUNT.I6).toBe(6);
    expect(S.CONFIG_OPTS).toContain('I6');
  });

  it('charges an inline six for its seven main bearings against a V6 four', () => {
    // Architectural fact, not a preference: I6 = 7 mains, V6 = 4.
    expect(S.MAIN_BEARINGS.I6).toBe(7);
    expect(S.MAIN_BEARINGS.V6).toBe(4);
    expect(at('I6').bearingFmepPa).toBeGreaterThan(at('V6').bearingFmepPa);
  });

  it('leaves the V6 baseline at zero so existing builds do not move', () => {
    expect(at('V6').bearingFmepPa).toBe(0);
    expect(at('V6').balanceShaftFrac).toBe(0);
  });

  it('charges a large four for its balance shafts, and a six for none', () => {
    // A 2.0 L I4 carries balance shafts; the EA888.3 has two. An I6 is inherently
    // balanced and needs none.
    expect(S.hasBalanceShafts('I4', 2.0)).toBe(true);
    expect(S.hasBalanceShafts('I6', 3.0)).toBe(false);
    expect(S.hasBalanceShafts('V6', 3.5)).toBe(false);
    // A small four does not need them either.
    expect(S.hasBalanceShafts('I4', 1.2)).toBe(false);
  });

  it('makes an inline six cost slightly more friction than a V6 of equal size', () => {
    const i6 = at('I6');
    const v6 = at('V6');
    const arch = (d) => ({ bearingFmepPa: d.bearingFmepPa, balanceShaftFrac: d.balanceShaftFrac });
    expect(S.rubbingFmepPa(6000, 0, arch(i6))).toBeGreaterThan(S.rubbingFmepPa(6000, 0, arch(v6)));
  });

  it('keeps the friction penalty small enough to be a trade-off, not a verdict', () => {
    const i6 = at('I6');
    const arch = { bearingFmepPa: i6.bearingFmepPa, balanceShaftFrac: i6.balanceShaftFrac };
    const penalty = S.rubbingFmepPa(6000, 0, arch) / S.rubbingFmepPa(6000, 0) - 1;
    expect(penalty).toBeGreaterThan(0.02);
    expect(penalty).toBeLessThan(0.20);
  });

  it('defaults to no architecture penalty when none is supplied', () => {
    expect(S.rubbingFmepPa(6000, 0)).toBe(S.rubbingFmepPa(6000, 0, { bearingFmepPa: 0, balanceShaftFrac: 0 }));
  });
});

describe('per-engine redline', () => {
  const sweepTo = (redline) => {
    const cfg = { ...STOCK, redline };
    const derived = S.deriveEngine(cfg);
    return S.simulateSweep({
      loadKpa: 100,
      ve: S.computeHardwareVE(cfg, S.DEFAULT_MODS, {}),
      timing: S.clone2D(S.DEFAULT_TIMING), afr: S.clone2D(S.DEFAULT_AFR),
      turboOn: false, boostCurve: S.RPM.map(() => 0),
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: 550, ecuInjectorCc: 550, injectorLabel: '550cc',
      mods: S.DEFAULT_MODS, mafScalar: 1, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
  };

  it('defaults to 7500 so existing builds are unaffected', () => {
    expect(S.deriveEngine(STOCK).redline).toBe(7500);
    expect(sweepTo(undefined).points.at(-1).rpm).toBe(7500);
  });

  it('ends the pull at the engine redline', () => {
    const r = sweepTo(6500);
    expect(r.points.at(-1).rpm).toBe(6500);
    expect(r.points.every((p) => p.rpm <= 6500)).toBe(true);
  });

  it("reports valve float against the engine's own redline, not a fixed 7500", () => {
    // springRate: 53 (not 25 — a 25 rate here drops floatRpm to ~5380, well below 6500,
    // which would defeat the point of this test) puts float just above 7000.
    const cfg = { ...STOCK, redline: 6500, camDuration: 290, springRate: 53 };
    const derived = S.deriveEngine(cfg);
    // Float sits near 7000 here — above a 6500 redline, so it must NOT be reported.
    expect(derived.floatRpm).toBeGreaterThan(6500);
    const r = S.simulateSweep({
      loadKpa: 100, ve: S.computeHardwareVE(cfg, S.DEFAULT_MODS, {}),
      timing: S.clone2D(S.DEFAULT_TIMING), afr: S.clone2D(S.DEFAULT_AFR),
      turboOn: false, boostCurve: S.RPM.map(() => 0),
      octaneBonus: 0, octaneLabel: '91', fuel: S.OCTANE_OPTS[0],
      injectorCc: 550, ecuInjectorCc: 550, injectorLabel: '550cc',
      mods: S.DEFAULT_MODS, mafScalar: 1, derived,
      turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
    expect(r.events.some((e) => e.type === 'float')).toBe(false);
  });
});

describe('hardware option catalogues', () => {
  const SIZES = ['small', 'medium', 'large'];

  // The Engineer Score branches on `size`, never on `label` — labels are display copy
  // and must stay free to reword. A newly added option that forgot `size` would drop
  // silently out of the sizing checks, so assert the field is always there.
  it.each([['TURBINE_OPTS'], ['COMPRESSOR_OPTS']])('gives every %s entry a valid size', (name) => {
    for (const opt of S[name]) {
      expect(SIZES, `${name} entry "${opt.label}" has size ${String(opt.size)}`).toContain(opt.size);
    }
  });
});
