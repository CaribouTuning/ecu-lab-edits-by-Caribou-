import { describe, expect, it } from 'vitest';

import { initialScrubRpm, pointAt, pointGauges } from '../../src/ui/components/scrubPoint.js';

/** Three points, 100 RPM apart, with peak power NOT at the last one. */
const POINTS = [
  { rpm: 1500, hp: 100, torque: 200 },
  { rpm: 1600, hp: 180, torque: 260 },
  { rpm: 1700, hp: 150, torque: 210 },
];

describe('pointAt', () => {
  it('returns the exact point when the RPM is one', () => {
    expect(pointAt(POINTS, 1600)).toBe(POINTS[1]);
  });

  it('falls back to the nearest point BELOW, not above', () => {
    // Which end matters. Returning POINTS[2] for 1650 would still "return a
    // neighbour" and would still be one array slot away from the answer.
    expect(pointAt(POINTS, 1650)).toBe(POINTS[1]);
  });

  it('returns null before the first point, rather than clamping up to it', () => {
    expect(pointAt(POINTS, 1400)).toBe(null);
  });

  it('returns the last point above the end, rather than null', () => {
    // The other direction of the case above, and the opposite answer. An
    // implementation that returned null outside the range in BOTH directions
    // would pass the previous test alone.
    expect(pointAt(POINTS, 9000)).toBe(POINTS[2]);
  });
});

describe('initialScrubRpm', () => {
  it('opens at the focus RPM when there is one', () => {
    expect(initialScrubRpm(POINTS, 1700)).toBe(1700);
  });

  it('opens at peak POWER\'s RPM when there is no focus', () => {
    // 1600 is peak hp. It is deliberately neither the first point, the last
    // point, nor equal to any hp VALUE — so returning `peakHp` itself (180),
    // the first point (1500) or the last (1700) each produce a different,
    // visibly wrong answer.
    expect(initialScrubRpm(POINTS, null)).toBe(1600);
  });

  it('does not confuse peak power with peak torque', () => {
    // Peak torque is at 1600 here too, so a torque-reading implementation
    // would pass the test above. This moves torque's peak to the last point
    // and holds power's where it was.
    const tq = [
      { rpm: 1500, hp: 100, torque: 200 },
      { rpm: 1600, hp: 180, torque: 260 },
      { rpm: 1700, hp: 150, torque: 900 },
    ];
    expect(initialScrubRpm(tq, null)).toBe(1600);
  });

  it('clamps a focus RPM from outside the pull into it, at the correct end', () => {
    expect(initialScrubRpm(POINTS, 9000)).toBe(1700);
    expect(initialScrubRpm(POINTS, 200)).toBe(1500);
  });
});

/** Every field the gauges read, with every risk flag clear. */
const CLEAN = {
  rpm: 5200, maf: 214, map: 99, iat: 41, lambda: 0.88,
  duty: 78, pw: 9.1, egt: 835, peakPressure: 62,
  leanRisk: false, richRisk: false, egtRisk: false,
  pressureRisk: false, fuelLimited: false,
};

describe('pointGauges', () => {
  /** @returns {object} the gauge with that key */
  const byKey = (point, key) => pointGauges(point).find((g) => g.key === key);

  it('returns the eight standalone readings, and nothing that belongs in a row', () => {
    // Both halves. The three pairs (VE, timing, mixture) are rows, so a gauge
    // for any of them is the duplication this design exists to avoid.
    expect(pointGauges(CLEAN).map((g) => g.key)).toEqual(
      ['maf', 'map', 'iat', 'lambda', 'duty', 'pw', 'egt', 'peakPressure'],
    );
  });

  it('carries the point\'s own values, not recomputed ones', () => {
    expect(byKey(CLEAN, 'maf').value).toBe(214);
    expect(byKey(CLEAN, 'peakPressure').value).toBe(62);
  });

  it('is neutral everywhere when no risk flag is set', () => {
    expect(pointGauges(CLEAN).every((g) => g.tone === 'neutral' || g.key === 'duty')).toBe(true);
  });

  it('tones lambda from the mixture flags, both of them', () => {
    expect(byKey({ ...CLEAN, leanRisk: true }, 'lambda').tone).toBe('danger');
    expect(byKey({ ...CLEAN, richRisk: true }, 'lambda').tone).toBe('danger');
  });

  it('tones heat and pressure from their own flags, and only their own', () => {
    // Pinning the exclusivity, not just each case: an implementation that
    // toned every gauge danger whenever ANY flag was set would pass a test
    // that only checked the flagged one.
    const hot = { ...CLEAN, egtRisk: true };
    expect(byKey(hot, 'egt').tone).toBe('danger');
    expect(byKey(hot, 'peakPressure').tone).toBe('neutral');

    const stressed = { ...CLEAN, pressureRisk: true };
    expect(byKey(stressed, 'peakPressure').tone).toBe('danger');
    expect(byKey(stressed, 'egt').tone).toBe('neutral');
  });

  it('tones duty through utilisationTone rather than its own copy of the numbers', () => {
    expect(byKey({ ...CLEAN, duty: 70 }, 'duty').tone).toBe('ok');
    expect(byKey({ ...CLEAN, duty: 80 }, 'duty').tone).toBe('warn');
    expect(byKey({ ...CLEAN, duty: 95 }, 'duty').tone).toBe('danger');
  });

  it('tones pulse width danger when the injectors ran out of time', () => {
    expect(byKey({ ...CLEAN, fuelLimited: true }, 'pw').tone).toBe('danger');
    expect(byKey(CLEAN, 'pw').tone).toBe('neutral');
  });
});
