/**
 * The overrun burble ("pops and bangs"): fuel kept on and the spark fired far after TDC on a
 * closed throttle, so the flame is still burning when the exhaust valve opens and finishes in
 * the manifold. Off on every factory calibration; a tuner's choice, with its cost in heat.
 */

import { describe, expect, it } from 'vitest';

import { lateSparkQuench } from '../src/sim/cycle.js';

import { makeEngine, runLive } from './ecuHarness.js';

/** Rev a warm B58 on the stand, lift, and return the rows from the lift on. */
function liftOff(cal) {
  const eng = makeEngine({ preset: 'b58-m1', cal });
  const warm = runLive(eng, { seconds: 3 });
  const { rows } = runLive(eng, { seconds: 5, from: warm.state, pedal: (t) => (t < 1.5 ? 60 : 0) });
  return rows.slice(Math.round(1.5 / 0.05) + 4);
}
const inWindow = (rows) => rows.filter((r) => r.rpm > 2200 && r.rpm < 5000);
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('the overrun burble', () => {
  it('is off on a factory calibration: the overrun cuts fuel, nothing lights in the exhaust', () => {
    const rows = inWindow(liftOff({}));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.cut && !r.burble && r.afterfire === 0)).toBe(true);
  });

  it('keeps fuelling with the spark after TDC, and charge burns in the manifold, hotter than a fuel cut', () => {
    const cut = inWindow(liftOff({}));
    const pops = inWindow(liftOff({ 'ignition.burbleEnabled': true }));
    expect(pops.every((r) => r.burble === 1 && !r.cut && r.timing < 0)).toBe(true);
    expect(mean(pops.map((r) => r.afterfire))).toBeGreaterThan(0.05);
    expect(mean(pops.map((r) => r.egt))).toBeGreaterThan(mean(cut.map((r) => r.egt)) + 150);
  });

  it('pops harder, and runs the exhaust hotter, the later the spark', () => {
    const soft = inWindow(liftOff({ 'ignition.burbleEnabled': true, 'ignition.burbleSparkDeg': -10 }));
    const hard = inWindow(liftOff({ 'ignition.burbleEnabled': true, 'ignition.burbleSparkDeg': -28 }));
    expect(mean(hard.map((r) => r.afterfire))).toBeGreaterThan(mean(soft.map((r) => r.afterfire)) * 2);
    expect(mean(hard.map((r) => r.egt))).toBeGreaterThan(mean(soft.map((r) => r.egt)));
  });

  it('hands back to the normal overrun fuel cut once its time is up', () => {
    const rows = liftOff({ 'ignition.burbleEnabled': true, 'ignition.burbleSeconds': 0.5, 'ignition.burbleMinRpm': 1000 });
    const late = rows.filter((r) => r.t > rows[0].t + 1 && r.rpm > 2000);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((r) => !r.burble && r.cut)).toBe(true);
  });

  it('leaves a spark at or before 5° after TDC alone: no tune near MBT loses a thing to it', () => {
    for (const deg of [40, 20, 0, -5]) expect(lateSparkQuench(deg)).toBe(0);
    expect(lateSparkQuench(-20)).toBeGreaterThan(0.1);
    expect(lateSparkQuench(-60)).toBeLessThanOrEqual(0.55);
  });
});
