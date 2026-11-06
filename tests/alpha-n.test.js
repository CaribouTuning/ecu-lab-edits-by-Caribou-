/**
 * Alpha-N: the ECU reads its tables by throttle opening and works the air out from the
 * barometric pressure, the way Speeduino and MegaSquirt do with the barometric correction
 * on. It is how a carburetted engine is first put on injection.
 *
 * What makes it alpha-N, and not speed-density with a different label:
 *   - the table row is chosen by the THROTTLE, whatever the manifold pressure is;
 *   - the air sum runs on the outside air's pressure, so the right VE cell holds the
 *     cylinder's fill against the outside air (true VE × MAP ÷ baro), and a table written
 *     for speed-density runs rich wherever the throttle loses pressure;
 *   - the same wideband log tunes it, cell by cell, on the throttle rows.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeEngine } from './ecuHarness.js';
import { seedRandomPerTest } from './seededRandom.js';

seedRandomPerTest();

const ALPHA_N = { 'config.airModel': 'alphan' };
const WOT = S.LOAD.indexOf(100);
const lambdaRatio = (p) => p.sensedLambda / (p.afrCommanded / 14.7);
const wotError = (pull) => Math.max(...pull.points.filter((p) => p.openLoop).map((p) => Math.abs(lambdaRatio(p) - 1)));

describe('alpha-N', () => {
  it('reads the row of the throttle, not of the manifold pressure', () => {
    for (const loadKpa of [100, 30]) {
      const pull = makeEngine({ cal: ALPHA_N }).pull(loadKpa);
      for (const p of pull.points) expect(p.ecuLoad).toBeCloseTo(loadKpa, 1);
    }
    // At a third of a throttle the manifold pressure falls as the engine speeds up and
    // draws harder through the blade; the row the ECU reads never moves.
    const part = makeEngine({ cal: ALPHA_N }).pull(30).points;
    expect(part[0].sensedMap - part.at(-1).sensedMap).toBeGreaterThan(25);
    // Speed-density reports no separate load: it reads by its MAP sensor.
    expect(makeEngine().pull(100).points[0].ecuLoad).toBeUndefined();
  });

  it('on a speed-density table it runs rich by the pressure the intake loses', () => {
    const sd = makeEngine().pull(100);
    const an = makeEngine({ cal: ALPHA_N }).pull(100);
    for (const [i, p] of an.points.entries()) {
      const q = sd.points[i];
      if (!p.openLoop || !q.openLoop || p.rpm < 2500) continue;
      // Same VE row (the throttle row is 100 kPa; the MAP sensor reads near it), so the
      // only difference is the air sum's pressure: 101.3 kPa against the manifold's.
      expect(lambdaRatio(p)).toBeLessThan(lambdaRatio(q));
      expect(lambdaRatio(p) / lambdaRatio(q)).toBeCloseTo(q.sensedMap / 101.3, 1);
    }
  });

  it('is tuned from the wideband like any other table, and its cells learn the fill against the outside air', () => {
    const eng = makeEngine({ cal: ALPHA_N });
    eng.tables.ve = eng.tables.ve.map((row) => row.map((v) => v * 0.88));
    const errors = [];
    let pull;
    for (let i = 0; i < 4; i += 1) {
      pull = eng.pull(100);
      errors.push(wotError(pull));
      eng.tables.ve = S.applyVeCorrections(eng.tables.ve, S.veCorrections(S.veSamplesFromPull(pull.points)).ratio, 0.5);
    }
    for (let i = 1; i < errors.length; i += 1) expect(errors[i]).toBeLessThan(errors[i - 1]);
    expect(errors.at(-1)).toBeLessThan(0.04);
    // Fully applied, the cell holds true VE × MAP ÷ baro at the throttle's row.
    for (let i = 0; i < 4; i += 1) {
      eng.tables.ve = S.applyVeCorrections(eng.tables.ve, S.veCorrections(S.veSamplesFromPull(eng.pull(100).points)).ratio, 1);
    }
    pull = eng.pull(100);
    expect(wotError(pull)).toBeLessThan(0.02);
    for (const ci of [3, 4, 5]) {
      const p = pull.points.find((q) => q.rpm === S.RPM[ci]);
      const fill = eng.veTruth(p.rpm, p.map) * p.map / 101.3;
      expect(eng.tables.ve[WOT][ci] / fill).toBeGreaterThan(0.95);
      expect(eng.tables.ve[WOT][ci] / fill).toBeLessThan(1.05);
      // The advisor's alpha-N target, from the throttle body's own pressure drop, agrees.
      const target = S.alphaNFillAt(eng.veTruth, eng.derived, eng.build.mods)(p.rpm, 100);
      expect(target / eng.tables.ve[WOT][ci]).toBeGreaterThan(0.96);
      expect(target / eng.tables.ve[WOT][ci]).toBeLessThan(1.04);
    }
  });

  it('a LIVE log is sorted into the throttle rows it was read by', () => {
    const rows = [0, 1, 2].map((i) => ({
      t: i, rpm: 3000, running: true, ect: 90, sMap: 70 + i * 0.5, ecuLoad: 50, veTable: 60,
      sLambda: 1.05, lambdaTarget: 1, stft: 0, ltft: 0,
    }));
    const samples = S.veSamplesFromLive(rows, S.LOAD.map(() => S.RPM.map(() => 60)));
    expect(samples.length).toBe(2);
    for (const s of samples) expect(s.mapKpa).toBe(50);
  });
});
