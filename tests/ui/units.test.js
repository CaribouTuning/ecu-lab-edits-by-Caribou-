/**
 * The metric switch converts with the exact factors, and holds one converter object per
 * system (safe in a hook's dependency list).
 */

import { describe, expect, it } from 'vitest';

import { unitsFor } from '../../src/ui/units.js';

describe('units', () => {
  const M = unitsFor('metric');
  const I = unitsFor('imperial');

  it('converts power, torque, boost, length and flow exactly', () => {
    expect(M.power(100)).toBeCloseTo(74.57, 2);
    expect(M.torque(100)).toBeCloseTo(135.58, 2);
    expect(M.boost(14.503774)).toBeCloseTo(1, 5);
    expect(M.length(3)).toBeCloseTo(76.2, 5);
    expect(M.massFlow(10)).toBeCloseTo(4.536, 3);
    expect(M.fmtBoost(14.5)).toBe('1.00 bar');
    expect(M.fmtLength(2.5)).toBe('64 mm');
    expect(M.fmtTorque(300)).toBe('407 N·m');
  });

  it('leaves the US shop units alone', () => {
    expect(I.fmtWheel(412.4)).toBe('412 whp');
    expect(I.fmtTorque(300)).toBe('300 lb-ft');
    expect(I.fmtBoost(7)).toBe('7.0 psi');
    expect(I.power(250)).toBe(250);
  });

  it('is the same object every time', () => {
    expect(unitsFor('metric')).toBe(M);
    expect(unitsFor('imperial')).toBe(I);
  });
});
