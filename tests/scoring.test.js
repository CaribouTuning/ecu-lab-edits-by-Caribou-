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
