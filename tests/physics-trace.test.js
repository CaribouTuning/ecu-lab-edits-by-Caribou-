/**
 * The LIVE screen's physics view reads the simulator's own working: the pressure trace
 * `runCycle` integrates, recorded only when asked for. These tests pin both halves of
 * that promise — the trace is the cycle the simulator actually ran, and asking for it
 * changes nothing the simulator reports.
 */
import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

import { makeEngine } from './ecuHarness.js';

const STOCK = S.DEFAULT_ENGINE_CONFIG;

function liveCfg(extra = {}) {
  return {
    ve: S.DEFAULT_VE, veTruth: S.DEFAULT_VE, timing: S.DEFAULT_TIMING, afr: S.DEFAULT_AFR,
    derived: S.deriveEngine(STOCK), fuel: S.OCTANE_OPTS[0],
    injectorCc: 315, ecuInjectorCc: 315,
    mods: { ...S.DEFAULT_MODS, turboFitted: false },
    mafScalar: 1, mafErrorBase: 1, turboOn: false, boostCurve: S.DEFAULT_BOOST,
    octaneBonus: S.OCTANE_OPTS[0].bonus,
    turbine: S.TURBINE_OPTS[1], compressor: S.COMPRESSOR_OPTS[1],
    ...extra,
  };
}

/** Runs the engine at 20 Hz, as the app does, with Math.random pinned for determinism. */
function runEngine(cfg, seconds, throttle) {
  const random = Math.random;
  Math.random = () => 0.5;
  try {
    let s = { ...S.makeLiveState(), cranking: true };
    for (let i = 0; i < Math.round(seconds / 0.05); i++) s = S.liveStep(s, 0.05, { throttle, load: 0 }, cfg);
    return s;
  } finally {
    Math.random = random;
  }
}

describe('the physics view trace', () => {
  it('changes nothing the live engine computes', () => {
    const plain = runEngine(liveCfg(), 4, 60);
    const traced = runEngine(liveCfg({ traceCycle: true }), 4, 60);
    expect(traced.rpm).toBe(plain.rpm);
    expect(traced.live).toEqual(plain.live);
    expect(plain.physics).toBeUndefined();
    expect(traced.physics.trace.length).toBeGreaterThan(100);
  });

  it('is the cycle the simulator reported: same peak pressure, same CA50, same knock integral', () => {
    const s = runEngine(liveCfg({ traceCycle: true }), 4, 60);
    const { trace, inputs } = s.physics;
    const peak = trace.reduce((a, t) => (t.bar > a.bar ? t : a), trace[0]);
    expect(peak.bar).toBeCloseTo(s.live.peakPressure, 1);
    expect(peak.deg).toBeCloseTo(s.live.peakPressureDeg, 1);
    const ca50 = trace.find((t) => t.xb >= 0.5);
    expect(ca50.deg).toBeCloseTo(s.live.mfb50, 1);
    expect(trace[trace.length - 1].ki).toBeCloseTo(s.live.knockIntegral, 3);
    // Monotone where it must be: burned fraction never falls, the knock integral never falls.
    for (let i = 1; i < trace.length; i++) {
      expect(trace[i].xb).toBeGreaterThanOrEqual(trace[i - 1].xb);
      expect(trace[i].ki).toBeGreaterThanOrEqual(trace[i - 1].ki);
    }
    expect(inputs.sparkBtdc).toBeCloseTo(s.live.timing, 1);
    expect(inputs.trappedBar).toBeGreaterThan(0);
  });

  it('is dropped again when the view closes', () => {
    let s = runEngine(liveCfg({ traceCycle: true }), 3, 40);
    expect(s.physics).toBeDefined();
    s = S.liveStep(s, 0.05, { throttle: 40, load: 0 }, liveCfg());
    expect(s.physics).toBeUndefined();
  });

  it('runCycle records without changing its result', () => {
    const pt = runEngine(liveCfg({ traceCycle: true }), 3, 80).physics.inputs;
    expect(pt.heatJ).toBeGreaterThan(0);
  });

  it('works the same on the engine-management path the app runs', () => {
    const eng = makeEngine({});
    const random = Math.random;
    Math.random = () => 0.5;
    try {
      const go = (trace) => {
        const cfg = { ...eng.liveCfg({}), ...(trace ? { traceCycle: true } : {}) };
        let s = { ...S.makeLiveState(), cranking: true, coolantC: 85, oilC: 85 };
        for (let i = 0; i < 80; i++) s = S.liveStep(s, 0.05, { throttle: i > 40 ? 70 : 0, load: 0 }, cfg);
        return s;
      };
      const plain = go(false);
      const traced = go(true);
      expect(traced.rpm).toBe(plain.rpm);
      expect(traced.live).toEqual(plain.live);
      const peak = traced.physics.trace.reduce((a, t) => (t.bar > a.bar ? t : a));
      expect(peak.bar).toBeCloseTo(traced.live.peakPressure, 1);
    } finally {
      Math.random = random;
    }
  });
});

describe('the dyno pull\'s physics view', () => {
  /** A pull's points without the recorded trace, to compare with a pull made without one. */
  const plainPoints = (r) => r.points.map(({ physics: _trace, ...p }) => p);

  for (const [label, opts] of [['the ideal ECU', { legacy: true }], ['the ECU in the loop', {}]]) {
    for (const preset of ['vq35hr', 'b58-m1']) {
      it(`records one point and changes nothing: ${preset}, ${label}`, () => {
        const eng = makeEngine({ preset });
        const plain = eng.pull(100, opts);
        const rpm = plain.points[Math.floor(plain.points.length / 2)].rpm;
        const traced = eng.pull(100, { ...opts, traceRpm: rpm });
        expect(plainPoints(traced)).toEqual(plain.points);
        expect(traced.peakHp).toBe(plain.peakHp);
        const withTrace = traced.points.filter((p) => p.physics);
        expect(withTrace.map((p) => p.rpm)).toEqual([rpm]);
        const pt = withTrace[0];
        const { trace, inputs } = pt.physics;
        const peak = trace.reduce((a, t) => (t.bar > a.bar ? t : a), trace[0]);
        expect(peak.bar).toBeCloseTo(pt.peakPressure, 1);
        expect(peak.deg).toBeCloseTo(pt.peakPressureDeg, 1);
        expect(trace.find((t) => t.xb >= 0.5).deg).toBeCloseTo(pt.mfb50, 1);
        expect(trace[trace.length - 1].ki).toBeCloseTo(pt.knockIntegral, 3);
        expect(inputs.sparkBtdc).toBeCloseTo(pt.timing, 1);
      });
    }
  }
});
