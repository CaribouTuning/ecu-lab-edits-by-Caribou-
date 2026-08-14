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
    ve: patch.ve, veTruth: patch.ve,
    timing: patch.timing, afr: patch.afr,
    turboOn: patch.turboOn, boostCurve: patch.boostCurve,
    octaneBonus: S.OCTANE_OPTS[patch.octaneIdx].bonus,
    octaneLabel: S.OCTANE_OPTS[patch.octaneIdx].label,
    fuel: S.OCTANE_OPTS[patch.octaneIdx],
    injectorCc: S.INJECTOR_OPTS[patch.injIdx].cc,
    ecuInjectorCc: patch.ecuInjectorCc,
    injectorLabel: S.INJECTOR_OPTS[patch.injIdx].label,
    mods: patch.mods, mafScalar: 1, derived,
    turbine: S.TURBINE_OPTS[patch.turbineIdx],
    compressor: S.COMPRESSOR_OPTS[patch.compressorIdx],
  });
}

describe('preset data integrity', () => {
  it('ships the seven engines', () => {
    expect(S.ENGINE_PRESETS).toHaveLength(7);
    expect(S.ENGINE_PRESETS.map((p) => p.id)).toEqual([
      'vq35de-revup', 'vq35hr', 'n54', 'b58-m0', 'b58-m1', 'ea888-gti', 'ea888-r',
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
    expect(S.PRESET_GROUPS.map((g) => g.manufacturer)).toEqual(['Nissan', 'BMW', 'Volkswagen']);
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

/**
 * Presets whose peak-power RPM this model cannot place, and why.
 *
 * This is not a tolerance to widen when a fit gets awkward. Each entry states a known
 * limit of the shared physics, and the assertion below certifies what the model can
 * actually show — a monotonic climb into the limiter — instead of asserting a peak
 * location that does not exist. If one of these engines ever does start peaking before
 * its redline, this test fails: that means the model gained the term it was missing,
 * and the entry should be deleted rather than updated.
 */
const NO_PEAK_BEFORE_LIMITER = {
  'vq35de-revup': 'Naturally aspirated, and nothing in the shared physics makes its '
    + 'power fall before the redline: the real engine\'s rolloff around 6400 comes from '
    + 'cam profile and intake tuning, neither of which the model has a term for. The '
    + 'simulated curve therefore climbs to the factory 7000 RPM limiter.',
  vq35hr: 'Naturally aspirated, and nothing in the shared physics makes its power fall '
    + 'before the redline: the real engine\'s rolloff past 6800 comes from cam profile, '
    + 'VVEL and intake tuning, none of which the model has a term for, so at every cam '
    + 'duration that reaches this engine\'s published power VE is still climbing at '
    + '7500. Simulated peak power therefore lands at the 7500 limiter, 700 RPM above '
    + 'the published 6800. The boosted presets roll over only because their factory '
    + 'boost curves taper.',
};

describe('factory calibration validates against real published figures', () => {
  S.ENGINE_PRESETS.forEach((preset) => {
    describe(preset.name, () => {
      const r = pullFor(preset);

      it(`makes about ${preset.factory.crankHp} crank hp`, () => {
        const target = toWheel(preset.factory.crankHp);
        expect(r.peakHp).toBeGreaterThan(target * 0.95);
        expect(r.peakHp).toBeLessThan(target * 1.05);
      });

      it(`makes about ${preset.factory.crankTq} lb-ft`, () => {
        const target = toWheel(preset.factory.crankTq);
        expect(r.peakTq).toBeGreaterThan(target * 0.90);
        expect(r.peakTq).toBeLessThan(target * 1.10);
      });

      const limitation = NO_PEAK_BEFORE_LIMITER[preset.id];

      it(limitation
        ? 'climbs to the limiter — the model cannot place this engine\'s power peak'
        : 'peaks where the manufacturer says it does', () => {
        const [lo, hi] = flatTopRpm(r.points);
        const rated = preset.factory.crankHpRpm;
        if (limitation) {
          // Nothing about the published peak RPM is asserted, because the model cannot
          // reproduce it. What IS asserted is the shape it does produce, so the day
          // that changes this test says so.
          expect(hi, limitation).toBe(preset.engine.redline);
          expect(r.points.every((p, i) => i === 0 || p.hp >= r.points[i - 1].hp), limitation)
            .toBe(true);
        } else if (Array.isArray(rated)) {
          // Plateau-rated: the manufacturer publishes a band, and so does the sim (the
          // flat top). Correct means those two bands overlap.
          expect(lo).toBeLessThanOrEqual(rated[1]);
          expect(hi).toBeGreaterThanOrEqual(rated[0]);
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
