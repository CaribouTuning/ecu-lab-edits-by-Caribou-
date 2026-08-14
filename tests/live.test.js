/**
 * Live-engine tests.
 *
 * `liveStep` integrates crank dynamics in time rather than solving a steady-state
 * point, so it can fail in ways the dyno sweep never will — most obviously by stalling.
 * These tests exist because the light-load MBT model moved idle timing efficiency, and
 * the idle controller has to be able to catch that.
 *
 * `liveStep` calls `sensorRead`, which uses `Math.random()`. Everything asserted here is
 * about the mechanical state (rpm, running), not the sensed values, so the noise does
 * not need stubbing — but do not add assertions on `sensed*` fields without stubbing it.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const STOCK = S.DEFAULT_ENGINE_CONFIG;

/** The config the live loop is driven with, matching EcuLab's `liveCfgRef`. */
function liveCfg() {
  return {
    ve: S.DEFAULT_VE, veTruth: S.DEFAULT_VE, timing: S.DEFAULT_TIMING, afr: S.DEFAULT_AFR,
    derived: S.deriveEngine(STOCK), fuel: S.OCTANE_OPTS[0],
    injectorCc: 315, ecuInjectorCc: 315,
    mods: { ...S.DEFAULT_MODS, turboFitted: false },
    mafScalar: 1, mafErrorBase: 1, turboOn: false, boostCurve: S.DEFAULT_BOOST,
    octaneBonus: S.OCTANE_OPTS[0].bonus,
    turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
  };
}

/** Runs the engine forward with the throttle closed. 20 Hz, as the app does. */
function run(state, seconds, throttle = 0) {
  const cfg = liveCfg();
  let s = state;
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    s = S.liveStep(s, 0.05, { throttle, load: 0 }, cfg);
  }
  return s;
}

describe('the live engine', () => {
  it('starts from the starter and catches', () => {
    const started = run({ ...S.makeLiveState(), cranking: true }, 3);
    expect(started.running).toBe(true);
    expect(started.rpm).toBeGreaterThan(S.STALL_RPM);
  });

  // The point of this test: idle sits at light load, which is exactly where the burn
  // model changed MBT. If idle timing efficiency drops far enough, the engine cannot
  // hold itself against its own friction and dies.
  it('holds idle for a full minute without stalling', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    expect(s.running).toBe(true);
    s = run(s, 60);
    expect(s.running).toBe(true);
    expect(s.rpm).toBeGreaterThan(S.STALL_RPM);
  });

  it('settles near the idle target rather than drifting away from it', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    s = run(s, 30);
    // Wide band deliberately: this asserts the controller converges, not what it
    // converges to. The exact idle speed is a magnitude and belongs to the fingerprint.
    expect(s.rpm).toBeGreaterThan(S.IDLE_TARGET_RPM - 250);
    expect(s.rpm).toBeLessThan(S.IDLE_TARGET_RPM + 400);
  });

  it('returns to idle after the throttle is blipped and released', () => {
    let s = run({ ...S.makeLiveState(), cranking: true }, 3);
    s = run(s, 2, 60);
    expect(s.rpm).toBeGreaterThan(2000);
    s = run(s, 20, 0);
    expect(s.running).toBe(true);
    expect(s.rpm).toBeLessThan(2000);
  });
});
