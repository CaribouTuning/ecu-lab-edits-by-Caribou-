/**
 * A stock engine on its stock calibration does not pop on the overrun, cold or warm. Its
 * overrun fuel cut works cold, at speeds the coolant table raises (Toyota US 4,506,638,
 * Honda US 4,434,769), its idle air catches the engine where the fuel comes back, and its
 * wall-film account takes out what the film gives back. Take those away and a cold overrun
 * runs rich, misfires and pops, as an untuned engine does.
 */

import { describe, expect, it } from 'vitest';

import { makeEngine, runLive } from './ecuHarness.js';
import { seedRandomPerTest } from './seededRandom.js';

seedRandomPerTest();

// Blip the throttle: 0.6 s at 60%, then 2.4 s closed, again and again.
const blips = (t) => (t > 3 && (t % 3) < 0.6 ? 60 : 0);
/** Steps after the start where a share of the charge burns in the exhaust loud enough to pop. */
const pops = (rows) => rows.filter((r) => r.t > 2 && r.afterfire > 0.02).length;

describe('the overrun on a stock calibration', () => {
  it('a cold stock VQ35DE does not pop when the throttle is blipped and closed', () => {
    const { rows } = runLive(makeEngine({ preset: 'vq35de-revup' }), { seconds: 15, pedal: blips, coolantC: 20 });
    expect(pops(rows)).toBe(0);
    // and it still cuts the fuel on the overrun while cold
    expect(rows.some((r) => r.cut === 100 && r.pedal < 3 && r.ect < 40)).toBe(true);
  });

  it('nor a cold stock LS1, whose fuel comes back into a wall film the overrun dried', () => {
    const { rows } = runLive(makeEngine({ preset: 'ls1' }), { seconds: 12, pedal: blips, coolantC: 20 });
    expect(pops(rows)).toBe(0);
    // the mixture as the fuel returns stays inside what a cold engine burns
    const back = rows.filter((r) => r.t > 3 && r.pedal < 3 && r.cut === 0 && r.rpm > 1000);
    expect(Math.min(...back.map((r) => r.lambda))).toBeGreaterThan(0.6);
  });

  it('nor warm', () => {
    const { rows } = runLive(makeEngine({ preset: 'vq35de-revup' }), { seconds: 12, pedal: blips, coolantC: 90 });
    expect(pops(rows)).toBe(0);
  });

  it('a calibration that keeps the fuel on a cold overrun, with no film compensation, pops', () => {
    const eng = makeEngine({ preset: 'vq35de-revup', cal: { 'fuel.dfcoMinEctC': 60, 'fuel.decelEnlean': 0 } });
    const { rows } = runLive(eng, { seconds: 15, pedal: blips, coolantC: 20 });
    expect(pops(rows)).toBeGreaterThan(20);
  });
});
