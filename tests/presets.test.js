/**
 * Preset validation.
 *
 * The point of these tests is that "factory calibration" is a falsifiable claim.
 * Each preset must produce a dyno pull close to the engine's real published rating,
 * with no knock — using only the shared physics, never a per-engine multiplier.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

/** Crank rating converted to the wheel figure the sim reports. */
const toWheel = (crankHp) => crankHp * S.DRIVETRAIN_EFF;

/** Runs a preset exactly as the app would, with its own factory calibration. */
function pullFor(preset) {
  const patch = S.applyPreset(preset);
  const derived = S.deriveEngine(patch.engineConfig);
  return S.simulateSweep({
    loadKpa: 100,
    ve: patch.ve, veTruth: patch.ve, layout: patch.layout,
    timing: patch.timing, afr: patch.afr,
    turboOn: patch.turboOn, boostCurve: patch.boostCurve,
    octaneBonus: S.OCTANE_OPTS[patch.octaneIdx].bonus,
    octaneLabel: S.OCTANE_OPTS[patch.octaneIdx].label,
    fuel: S.OCTANE_OPTS[patch.octaneIdx],
    injectorCc: S.INJECTOR_OPTS[patch.injIdx].cc,
    ecuInjectorCc: patch.ecuInjectorCc,
    injectorLabel: S.INJECTOR_OPTS[patch.injIdx].label,
    mods: patch.mods, mafScalar: patch.mafScalar, derived,
    turbine: S.presetTurbine(preset),
    compressor: S.presetCompressor(preset),
  });
}

describe('preset data integrity', () => {
  it('ships the thirteen engines', () => {
    expect(S.ENGINE_PRESETS).toHaveLength(13);
    expect(S.ENGINE_PRESETS.map((p) => p.id)).toEqual([
      'vq35de-revup', 'vq35hr', 'n54', 'b58-m0', 'b58-m1', 'ea888-gti', 'ea888-r',
      'ls1', 'ls6', 'lq4', 'lm7', 'lr4', 'hemi-392',
    ]);
  });

  it('states the VQ35DE Rev-Up\'s published specifications', () => {
    // Only the figures Nissan actually publishes are asserted, and they are written out
    // literally rather than spread from DEFAULT_ENGINE_CONFIG. The default is a generic
    // custom-build starting point that happens to share this engine's geometry; retuning
    // it is a decision about custom builds, and must not be able to silently redefine
    // what this preset claims Nissan published. `camDuration` and `springRate` are
    // deliberately absent — they are unpublished fitted inputs, and the power and torque
    // assertions further down are what hold them honest.
    expect(S.presetById('vq35de-revup').engine).toMatchObject({
      configuration: 'V6',
      bore: 95.5,
      stroke: 81.4,
      compression: 10.3,
      blockMaterial: 'Aluminum',
      headMaterial: 'Aluminum',
      redline: 7000,
    });
  });

  it('gives every preset a unique id', () => {
    const ids = S.ENGINE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  S.ENGINE_PRESETS.forEach((preset) => {
    describe(preset.name, () => {
      it('has a boost curve matching the RPM axis', () => {
        expect(preset.induction.boost).toHaveLength(S.RPM.length);
        expect(preset.induction.boost.every(Number.isFinite)).toBe(true);
      });

      it('stays inside the ranges the BUILD sliders allow', () => {
        const e = preset.engine;
        expect(e.bore).toBeGreaterThanOrEqual(75);
        expect(e.bore).toBeLessThanOrEqual(105);
        expect(e.stroke).toBeGreaterThanOrEqual(65);
        expect(e.stroke).toBeLessThanOrEqual(100);
        expect(e.compression).toBeGreaterThanOrEqual(8.5);
        expect(e.compression).toBeLessThanOrEqual(13.0);
        expect(e.camDuration).toBeGreaterThanOrEqual(180);
        expect(e.camDuration).toBeLessThanOrEqual(300);
        expect(e.camDuration % 2).toBe(0);
        expect(e.springRate).toBeGreaterThanOrEqual(20);
        expect(e.springRate).toBeLessThanOrEqual(100);
      });

      it('indexes real parts', () => {
        expect(S.INJECTOR_OPTS[preset.parts.injectorIdx]).toBeDefined();
        expect(S.EXHAUST_DIA_OPTS[preset.parts.exhaustDiaIdx]).toBeDefined();
        expect(S.OCTANE_OPTS[preset.parts.octaneIdx]).toBeDefined();
        expect(S.TURBINE_OPTS[preset.induction.turbineIdx]).toBeDefined();
        expect(S.COMPRESSOR_OPTS[preset.induction.compressorIdx]).toBeDefined();
      });

      it('redlines at or below the RPM axis maximum', () => {
        expect(preset.engine.redline).toBeLessThanOrEqual(S.RPM[S.RPM.length - 1]);
      });

      it('states its real displacement', () => {
        expect(S.deriveEngine(preset.engine).displacementL)
          .toBeCloseTo(preset.factory.displacementL, 2);
      });
    });
  });
});

describe('presets grouped by manufacturer', () => {
  it('accounts for every preset exactly once', () => {
    const grouped = S.PRESET_GROUPS.flatMap((g) => g.presets);
    expect(grouped).toHaveLength(S.ENGINE_PRESETS.length);
    expect(new Set(grouped.map((p) => p.id)).size).toBe(S.ENGINE_PRESETS.length);
    for (const preset of S.ENGINE_PRESETS) {
      expect(grouped, `${preset.id} is in no group`).toContain(preset);
    }
  });

  it('gives each manufacturer exactly one group', () => {
    const names = S.PRESET_GROUPS.map((g) => g.manufacturer);
    expect(new Set(names).size).toBe(names.length);
    for (const g of S.PRESET_GROUPS) {
      for (const p of g.presets) expect(p.manufacturer).toBe(g.manufacturer);
    }
  });

  // Ordering is DERIVED from ENGINE_PRESETS rather than declared separately, so that
  // reordering the preset array cannot leave the picker silently disagreeing with it.
  // Asserting the derivation is what keeps that true when a seventh engine arrives.
  //
  // The literal order is asserted BESIDE the derivation, deliberately. The derived
  // check recomputes its expectation with the same rule the implementation follows,
  // so the two could hold a misconception together and still agree; the literal list
  // is an expectation written independently of the code and cannot. Keep both — the
  // literal catches what the derivation cannot, the derivation catches the drift a
  // frozen list would miss.
  it('orders groups and their contents by first appearance in ENGINE_PRESETS', () => {
    expect(S.PRESET_GROUPS.map((g) => g.manufacturer)).toEqual(['Nissan', 'BMW', 'Volkswagen', 'GM', 'Chrysler']);
    const firstSeen = [];
    for (const p of S.ENGINE_PRESETS) {
      if (!firstSeen.includes(p.manufacturer)) firstSeen.push(p.manufacturer);
    }
    expect(S.PRESET_GROUPS.map((g) => g.manufacturer)).toEqual(firstSeen);
    for (const g of S.PRESET_GROUPS) {
      const expected = S.ENGINE_PRESETS.filter((p) => p.manufacturer === g.manufacturer);
      expect(g.presets).toEqual(expected);
    }
  });
});

/**
 * The band of RPM sharing the highest reported power — the curve's flat top.
 *
 * The sim reports WHOLE horsepower (`Math.round` in `point.js`), so the top of a flat
 * curve is a genuine tie across several points rather than a single peak. Reducing to
 * the first maximum silently certifies the LOWEST RPM of that tie, which is how the
 * VQ35HR was once certified as peaking at 7200 while its true, unrounded peak sat at
 * the 7500 sweep end. Everything below works on the whole tied band, so no assertion
 * here can pass or fail on which member of a tie a reduce happens to reach first.
 *
 * @param {{rpm: number, hp: number}[]} points
 * @returns {[number, number]} lowest and highest RPM at peak reported power
 */
function flatTopRpm(points) {
  const peak = Math.max(...points.map((p) => p.hp));
  const tied = points.filter((p) => p.hp === peak).map((p) => p.rpm);
  return [Math.min(...tied), Math.max(...tied)];
}

/*
 * There was a NO_PEAK_BEFORE_LIMITER map here, listing the two naturally aspirated
 * presets whose power peak the model could not place: nothing in the shared physics made
 * VE fall at speed, so both climbed monotonically into the limiter and the assertion
 * below could only certify that shape rather than a peak location.
 *
 * Its own docstring said that if either engine ever started peaking before its redline
 * the entry should be DELETED rather than updated, because that would mean the model had
 * gained the term it was missing. The inlet Mach index (issue #15) is that term, both
 * engines now peak where they are rated to, and so the map is gone and every preset goes
 * through the ordinary rated-RPM assertions.
 */

/*
 * Where a preset is known to sit outside the ordinary band, and why, with the measurement
 * that says so. A change that brings it inside the ordinary band should DELETE the entry.
 *
 * The rating misses recorded here before October 2026 (VQ35DE -9%, VQ35HR, B58 M1, LS6 and
 * the GTI's torque) closed when the cycle started counting molar expansion (thermo.js,
 * molarExpansion) and the factory fuel tables took the engines' real full-load mixtures
 * (factoryFuel.js): best power moved from lambda 0.94 to 0.90, as real engines have it.
 */
const KNOWN_GAPS = {
  // The N54 is underrated: measured stock, it makes more torque than BMW publishes.
  // Automobile magazine's stock 335i laid down 300 lb-ft at the wheels on a DynoJet
  // (bimmerfile.com, 2010-09-14, "Automobile pits the N54 against N55"), and an owner's
  // stock baseline read 298 (f30.bimmerpost.com). The model's wheel torque sits under those
  // measurements, so its ceiling is the measured figure, not the rating.
  n54: { tqHighWheel: 300 },
};

describe('factory calibration validates against real published figures', () => {
  S.ENGINE_PRESETS.forEach((preset) => {
    describe(preset.name, () => {
      const r = pullFor(preset);

      const gap = KNOWN_GAPS[preset.id] ?? {};

      it(`makes about ${preset.factory.crankHp} crank hp`, () => {
        const target = toWheel(preset.factory.crankHp);
        const lo = gap.hp === undefined ? 0.95 : 1 + gap.hp - 0.015;
        expect(r.peakHp).toBeGreaterThan(target * lo);
        expect(r.peakHp).toBeLessThan(target * 1.05);
      });

      it(`makes about ${preset.factory.crankTq} lb-ft`, () => {
        const target = toWheel(preset.factory.crankTq);
        const lo = gap.tq === undefined ? 0.90 : 1 + gap.tq - 0.015;
        expect(r.peakTq).toBeGreaterThan(target * lo);
        expect(r.peakTq).toBeLessThan(gap.tqHighWheel ?? target * 1.10);
      });

      it('peaks where the manufacturer says it does', () => {
        const [lo, hi] = flatTopRpm(r.points);
        const rated = preset.factory.crankHpRpm;
        if (Array.isArray(rated)) {
          // Plateau-rated: the manufacturer publishes a band, and so does the sim (the
          // flat top). Correct means those two bands overlap, within the same 500 RPM
          // grace the point-rated branch below already allows. That grace is the only
          // relaxation in this file: a plateau rating is a marketing-rounded band rather
          // than a measurement, and holding it to a TIGHTER standard than a point rating
          // was an inconsistency in this test, not a stricter check. As it stands the
          // GTI peaks 100 RPM above its band and the Golf R 300 — both from the top-end
          // taper in their factory boost curves, neither large enough to mean the model
          // has the shape wrong.
          expect(lo).toBeLessThanOrEqual(rated[1] + 500);
          expect(hi).toBeGreaterThanOrEqual(rated[0] - 500);
        } else {
          // Point-rated: the published RPM must fall inside the flat top, or within
          // 500 RPM of one of its ends.
          expect(rated).toBeGreaterThanOrEqual(lo - 500);
          expect(rated).toBeLessThanOrEqual(hi + 500);
        }
      });

      it('does not knock — a factory calibration is knock-free', () => {
        expect(r.events.filter((e) => e.type === 'knock')).toHaveLength(0);
      });

      it('keeps injectors under the duty wall', () => {
        expect(Math.max(...r.points.map((p) => p.duty))).toBeLessThan(90);
      });

      it('stays inside its own bottom end — a production engine is not overloaded', () => {
        // The peak-pressure limit is calibrated against these engines, so this is the
        // test that keeps that calibration honest: if a coefficient change ever puts a
        // factory calibration over the limit, the limit is wrong, not the engine.
        expect(r.events.filter((e) => e.type === 'pressure')).toHaveLength(0);
        expect(Math.max(...r.points.map((p) => p.peakPressure)))
          .toBeLessThan(S.COEFF.PEAK_PRESSURE_LIMIT_BAR);
      });
    });
  });
});

describe('an engine of the player\'s own', () => {
  const spec = { configuration: 'V6', bore: 95.5, stroke: 81.4, compression: 10.3, redline: 6600 };
  /** The validation result, either branch, for reading in a test. */
  const check = (patch = {}) => /** @type {any} */ (S.validateCustomEngine({ ...spec, ...patch }));

  it('names every figure it filled in, fuel injection and the pistons and rods included', () => {
    const v = check();
    expect(v.ok).toBe(true);
    expect(v.assumed).toEqual(['camDuration', 'valvetrain', 'valvesPerCyl', 'blockMaterial', 'headMaterial', 'injection', 'bottomEnd']);
    expect(v.estimated.at(-2)).toBe('fuel injection (port assumed)');
    expect(v.estimated.at(-1)).toBe('pistons and rods (production assumed)');
    expect(check({ injection: 'direct' }).assumed).not.toContain('injection');
    expect(check({ bottomEnd: 'forged' }).engine.bottomEnd).toBe('forged');
  });

  it('takes a redline to 11,000 RPM, with valve springs sized for it, and says when the pistons and rods are past their band', () => {
    const v = check({ configuration: 'I4', bore: 87, stroke: 84, redline: 9000 });
    expect(v.ok).toBe(true);
    // Springs that hold the valves on the cam past the limiter: no float in the pull.
    expect(S.valveFloatRpm(v.engine.springRate, v.engine.camDuration)).toBeGreaterThan(9000);
    const p = S.customEnginePatch(v.engine);
    const derived = S.deriveEngine(p.engineConfig);
    // 84 mm at 9000 RPM is 25.2 m/s: past production parts (21 m/s), which reach it at 7500.
    expect(derived.bottomEnd.id).toBe('production');
    expect(derived.bottomEnd.ratedRpm).toBe(7500);
    const r = S.simulateSweep({
      loadKpa: 100, ve: p.ve, veTruth: S.hardwareVeAt(p.engineConfig, p.mods, {}), layout: p.layout, timing: p.timing, afr: p.afr,
      turboOn: false, boostCurve: p.boostCurve, fuel: S.OCTANE_OPTS[p.octaneIdx], octaneLabel: 'x',
      injectorCc: S.INJECTOR_OPTS[p.injIdx].cc, ecuInjectorCc: p.ecuInjectorCc, injectorLabel: 'x', mods: p.mods,
      mafScalar: p.mafScalar, derived, turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    });
    expect(r.points.at(-1).rpm).toBe(9000);
    expect(r.events.some((e) => e.type === 'float')).toBe(false);
    expect(r.events.find((e) => e.type === 'bottomEnd')?.rpmStart).toBe(7500);
    // Forged parts are good to 25 m/s, 8928 RPM on this stroke: 9000 is the top of what
    // any street engine runs (the S2000 does it at 25.2). Race parts carry it.
    expect(S.deriveEngine({ ...p.engineConfig, bottomEnd: 'forged' }).bottomEnd.ratedRpm).toBe(8928);
    expect(S.deriveEngine({ ...p.engineConfig, bottomEnd: 'race' }).bottomEnd.ratedRpm).toBeGreaterThan(9000);
  });

  it('refuses a redline past 11,000 RPM, and a bore outside the checked range, saying why', () => {
    const v = check({ redline: 11500, bore: 110 });
    expect(v.ok).toBe(false);
    expect(v.errors.redline).toMatch(/Between 4000 and 11000 rpm/);
    expect(v.errors.bore).toMatch(/has not been checked/);
  });

  it('gets the smallest stock injector that covers a typical power for its size', () => {
    const small = S.customEnginePatch(check({ configuration: 'I4', bore: 81, stroke: 77 }).engine);
    const big = S.customEnginePatch(check({ configuration: 'I4', bore: 105, stroke: 102 }).engine);
    expect(S.INJECTOR_OPTS[small.injIdx].cc).toBe(315);
    // 3.5 L in four cylinders: about 30 lb/hr each, more than the 315 cc stock size.
    expect(S.INJECTOR_OPTS[big.injIdx].cc).toBeGreaterThan(315);
    expect(big.ecuInjectorCc).toBe(S.INJECTOR_OPTS[big.injIdx].cc);
  });
});
