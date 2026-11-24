/**
 * A stock engine at altitude: the ECU reads its fuel table as a share of the air outside
 * (strategy.js `ambientNormalized`), so wide open is wide open on any day.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { ambientNormalized } from '../src/sim/ecu/strategy.js';
import { makeEngine } from './ecuHarness.js';

const pull = (altitudeM, preset = 'vq35de-revup') => makeEngine({ preset, env: { altitudeM } }).pull(100);
const at = (r, rpm) => r.points.find((p) => p.rpm === rpm);

describe('ambientNormalized', () => {
  it('is the identity at sea level, so a default day reads exactly as it always did', () => {
    for (const kpa of [20, 55, 100, 150, 210]) expect(ambientNormalized(kpa, S.BARO_KPA)).toEqual({ mapKpa: kpa, scale: 1 });
  });

  it('reads wide open as wide open: ambient is the same row at any altitude', () => {
    for (const baro of [95, 89, 79.5, 70]) expect(ambientNormalized(baro, baro).mapKpa).toBeCloseTo(S.BARO_KPA, 9);
  });

  it('scales part throttle with the air, and reads boost as it is from ambient up', () => {
    const baro = 80;
    expect(ambientNormalized(40, baro).mapKpa).toBeCloseTo(40 * S.BARO_KPA / baro, 9);
    expect(ambientNormalized(baro + 30, baro)).toEqual({ mapKpa: S.BARO_KPA + 30, scale: 1 });
    // Continuous where the two meet.
    expect(ambientNormalized(baro + 1e-9, baro).mapKpa).toBeCloseTo(ambientNormalized(baro, baro).mapKpa, 6);
  });
});

describe('a stock engine at altitude', () => {
  it('keeps its wide-open enrichment: the same lambda at 2000 m as at sea level', () => {
    // Read unnormalized, 78 kPa was a cruise cell: lambda 0.84 at sea level, 1.00 at 2000 m.
    const sea = pull(0); const high = pull(2000);
    for (const rpm of [3000, 4500, 6000]) expect(at(high, rpm).lambda).toBeCloseTo(at(sea, rpm).lambda, 1);
  });

  it('makes less power the higher it goes, by about what the air takes and the friction does not give back', () => {
    const peaks = [0, 1000, 2000, 3000].map((a) => pull(a).peakHp);
    for (let i = 1; i < peaks.length; i += 1) expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    // Pressure alone: 0.887 at 1000 m, 0.785 at 2000 m. Friction is not thinner air, so
    // brake power falls a little faster than the pressure does.
    expect(peaks[1] / peaks[0]).toBeGreaterThan(0.82);
    expect(peaks[1] / peaks[0]).toBeLessThan(0.89);
    expect(peaks[2] / peaks[0]).toBeGreaterThan(0.70);
    expect(peaks[2] / peaks[0]).toBeLessThan(0.79);
  });
});
