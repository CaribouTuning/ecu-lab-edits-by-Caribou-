/**
 * A stock engine on its stock calibration does not pop on the overrun, cold or warm. Its
 * overrun fuel cut works cold, at speeds the coolant table raises (Toyota US 4,506,638,
 * Honda US 4,434,769), its idle air catches the engine where the fuel comes back, and its
 * wall-film account takes out what the film gives back. Take those away and a cold overrun
 * runs rich, misfires and pops, as an untuned engine does.
 */

/* global structuredClone */
import { describe, expect, it } from 'vitest';

import { upgradeEcuCalibration } from '../src/sim/index.js';

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

  it('a calibration saved before the fix is brought up to it on load, and stops popping', () => {
    // What a SANDBOX save or a career car from before November 2026 holds: no overrun cut
    // below 45 °C, decel enleanment 0.6, no cold-speed table, no idle spark table.
    const eng = makeEngine({ preset: 'vq35de-revup' });
    const old = structuredClone(eng.cal);
    old.fuel.dfcoMinEctC = 45; old.fuel.decelEnlean = 0.6; delete old.fuel.dfcoColdRpm; delete old.idle.sparkBase;
    const revs = (t) => (t > 3 && (t % 4) < 1.2 ? 100 : 0);
    const run = (cal) => { for (const k of Object.keys(cal)) eng.cal[k] = cal[k]; return runLive(eng, { seconds: 16, pedal: revs, coolantC: 20 }).rows; };
    expect(pops(run(old))).toBeGreaterThan(20);
    expect(pops(run(upgradeEcuCalibration(old)))).toBe(0);
  });

  it('the upgrade keeps what the player set', () => {
    const cal = structuredClone(makeEngine({ preset: 'vq35de-revup' }).cal);
    cal.fuel.dfcoMinEctC = 30; cal.fuel.decelEnlean = 0.4; delete cal.idle.sparkBase;
    const up = upgradeEcuCalibration(cal);
    expect(up.fuel.dfcoMinEctC).toBe(30);
    expect(up.fuel.decelEnlean).toBe(0.4);
    expect(up.idle.sparkBase.z.length).toBeGreaterThan(0);
    // a curve is one value, never merged cell by cell
    expect(up.fuel.dfcoColdRpm).toEqual(cal.fuel.dfcoColdRpm);
  });
});

