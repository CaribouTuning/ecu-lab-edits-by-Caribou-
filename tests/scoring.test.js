/**
 * Scoring intent tests.
 *
 * The Tuning Score grades the CALIBRATION. Hardware trade-offs belong to the
 * Engineer Score and to the advisory list — never to this number, because the
 * player cannot edit a camshaft from the TUNE tab.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const ev = (type, impact, msg = `${type} event`) => ({ type, impact, severity: 2, msg });

describe('computeTuningScore', () => {
  it('scores a clean pull at 100', () => {
    expect(S.computeTuningScore({ events: [] }).score).toBe(100);
  });

  it('deducts for calibration faults', () => {
    const r = S.computeTuningScore({ events: [ev('knock', 20)] });
    expect(r.score).toBe(80);
    expect(r.deductions).toHaveLength(1);
  });

  it('does NOT deduct for hardware trade-offs the player cannot tune away', () => {
    // A big cam, valve float and bottom-end stress are all hardware consequences.
    // The cam event's own `fix` text says "you cannot calibrate it away".
    const events = [ev('cam', 14), ev('float', 34), ev('bearing', 9)];
    const r = S.computeTuningScore({ events });
    expect(r.score).toBe(100);
    expect(r.deductions).toHaveLength(0);
  });

  it('still surfaces hardware trade-offs as advisories rather than hiding them', () => {
    const r = S.computeTuningScore({ events: [ev('cam', 14, 'Large camshaft')] });
    expect(r.advisories).toEqual(['Large camshaft']);
  });

  it('separates the two classes within one pull', () => {
    const r = S.computeTuningScore({ events: [ev('knock', 20), ev('float', 34)] });
    expect(r.score).toBe(80);
    expect(r.deductions).toHaveLength(1);
    expect(r.advisories).toHaveLength(1);
  });

  it('treats an unknown event type as a calibration fault, so new faults are never silently free', () => {
    expect(S.computeTuningScore({ events: [ev('brand_new_fault', 10)] }).score).toBe(90);
  });
});

describe('computeEngineerScore turbo sizing', () => {
  const [SMALL_TURBINE, , LARGE_TURBINE] = S.TURBINE_OPTS;
  const [SMALL_COMPRESSOR, , LARGE_COMPRESSOR] = S.COMPRESSOR_OPTS;

  /** A deliberately coherent boosted build, so any deduction seen is the one under test. */
  const build = (over = {}) => S.computeEngineerScore({
    engineConfig: { ...S.DEFAULT_ENGINE_CONFIG, compression: 9.5, headMaterial: 'Aluminum' },
    turboOn: true,
    turbine: S.TURBINE_OPTS[1],
    compressor: S.COMPRESSOR_OPTS[1],
    exhaustDiaError: 0,
    dutyPreview: 50,
    displacementL: 3.5,
    ...over,
  });

  it('leaves a coherently matched build unpenalised', () => {
    expect(build().score).toBe(100);
    expect(build().deductions).toHaveLength(0);
  });

  it('penalises a turbo sized large for a small displacement', () => {
    expect(build({ displacementL: 2.0, turbine: LARGE_TURBINE }).score).toBe(92);
    expect(build({ displacementL: 2.0, compressor: LARGE_COMPRESSOR }).score).toBe(92);
  });

  it('penalises a turbo sized small for a big displacement', () => {
    expect(build({ displacementL: 5.0, turbine: SMALL_TURBINE }).score).toBe(92);
    expect(build({ displacementL: 5.0, compressor: SMALL_COMPRESSOR }).score).toBe(92);
  });

  it('says nothing about turbo sizing on a naturally aspirated build', () => {
    const na = build({ turboOn: false, displacementL: 2.0, turbine: LARGE_TURBINE });
    expect(na.deductions.join(' ')).not.toMatch(/Turbo sized/);
  });

  // The regression this exists to prevent: labels are display copy. Before the options
  // carried a `size`, renaming the compressor 'Large' to 'Large — high flow' silently
  // switched the mismatch deduction off and no test noticed.
  it('keeps sizing deductions when the display labels are reworded', () => {
    const bigOnSmall = build({
      displacementL: 2.0,
      turbine: { ...LARGE_TURBINE, label: 'XL — screamer' },
      compressor: { ...LARGE_COMPRESSOR, label: 'Large — high flow' },
    });
    expect(bigOnSmall.score).toBe(92);

    const smallOnBig = build({
      displacementL: 5.0,
      turbine: { ...SMALL_TURBINE, label: 'Tiny — instant' },
      compressor: { ...SMALL_COMPRESSOR, label: 'Compact — fast spool' },
    });
    expect(smallOnBig.score).toBe(92);
  });
});
