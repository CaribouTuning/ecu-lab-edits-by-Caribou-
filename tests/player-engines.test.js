/**
 * Engines of the player's own, built the way a player builds them on BUILD (the spec form,
 * the safe base map it generates), and played the way a player plays them: pulled at full,
 * part and light throttle, started and idled on the stand, turbocharged and tuned from the
 * advice, given a burble. Deliberately far from the reference V6: a high-revving small four,
 * a big-bore V8, an undersquare six, a high-compression oversquare V6 and a low-compression
 * four built for boost.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

import { runLive } from './ecuHarness.js';
import { LOADS, adviceAt, peakHp, playerEngine, tuneFromTheAdvice } from './playerEngine.js';

const ENGINES = {
  'a high-revving 1.6 L four': { configuration: 'I4', bore: 81, stroke: 77.4, compression: 11.5, redline: 8500 },
  'a big-bore 6.25 L V8': { configuration: 'V8', bore: 104, stroke: 92, compression: 10.5, redline: 6200 },
  'a long-stroke 3.0 L six': { configuration: 'I6', bore: 84, stroke: 90, compression: 10.0, redline: 6800 },
  'a 12:1 oversquare V6': { configuration: 'V6', bore: 96, stroke: 78, compression: 12.0, redline: 7800 },
  'a 9:1 two-litre four built for boost': { configuration: 'I4', bore: 86, stroke: 86, compression: 9.0, redline: 7000 },
};
const TURBO = { turboOn: true, boostCurve: [0, 0, 3.6, 6, 6, 6, 6, 6], injIdx: 3, ecuInjectorCc: 650, mods: { intercooler: true } };

describe.each(Object.entries(ENGINES))('%s, built on BUILD', (_name, spec) => {
  it('pulls without knock at every throttle on its safe base map, with realistic output', () => {
    const eng = playerEngine(spec);
    for (const load of LOADS) {
      const { pull } = adviceAt(eng, load);
      expect(pull.events.filter((e) => e.type === 'knock'), `knock at ${load}%`).toEqual([]);
    }
    const r = eng.pull(100);
    const tk = r.points.reduce((x, q) => (q.torque > x.torque ? q : x));
    // Brake mean effective pressure of a naturally aspirated gasoline engine: about 10 to
    // 14 bar at its torque peak (Heywood 1988, ch. 2).
    const bmepBar = ((tk.torque / S.DRIVETRAIN_EFF / 0.7376) * 4 * Math.PI) / (eng.derived.displacementL / 1000) / 1e5;
    expect(bmepBar).toBeGreaterThan(10);
    expect(bmepBar).toBeLessThan(14.5);
  });

  it('starts, idles near its target and comes back from a rev', () => {
    const eng = playerEngine(spec);
    const live = runLive(eng, { seconds: 15, coolantC: 85 });
    const idle = live.rows.slice(-20);
    const rpm = idle.reduce((x, q) => x + q.rpm, 0) / idle.length;
    expect(live.state.running).toBe(true);
    expect(rpm).toBeGreaterThan(700);
    expect(rpm).toBeLessThan(900);
    const rev = runLive(eng, { seconds: 5, from: live.state, pedal: (t) => (t < 2 ? 40 : 0) });
    expect(rev.state.running).toBe(true);
    expect(Math.max(...rev.rows.map((q) => q.rpm))).toBeGreaterThan(spec.redline * 0.8);
  });

  it('takes a turbo and tunes from the advice to no knock at any throttle', () => {
    const t = playerEngine(spec, TURBO);
    expect(tuneFromTheAdvice(t)).toBeLessThanOrEqual(6);
    // TUNE's own verdict (judged on a full-throttle pull, as the app judges it) is clean.
    expect(adviceAt(t, 100).a.overAdvanced, 'past the knock limit on TUNE').toEqual([]);
    // And the engine knocks at no throttle. Advice computed from a part-throttle pull can
    // still flag a cell between two rows the pull never ran through (75 kPa at 6500 RPM,
    // a 27 degree estimate) where every opening from 30% to 40% runs it 1.8-5.4 degrees
    // clear: the between-row estimate is the pessimistic one, and no screen shows it.
    for (const load of LOADS) {
      expect(adviceAt(t, load).pull.events.filter((e) => e.type === 'knock'), `knock at ${load}%`).toEqual([]);
    }
  });

  it('pops on the overrun with a burble, hotter than a fuel cut', () => {
    const b = playerEngine(spec, {}, { 'ignition.burbleEnabled': true });
    const warm = runLive(b, { seconds: 4, coolantC: 85 });
    const lift = runLive(b, { seconds: 4, from: warm.state, pedal: (tt) => (tt < 1.5 ? 60 : 0) }).rows.filter((q) => q.burble);
    expect(lift.length).toBeGreaterThan(5);
    expect(lift.reduce((x, q) => x + q.afterfire, 0) / lift.length).toBeGreaterThan(0.1);
  });
});

describe('a turbo on a player engine', () => {
  it('makes more than the engine did without it, where the turbine is big enough for the engine', () => {
    for (const name of ['a long-stroke 3.0 L six', 'a 9:1 two-litre four built for boost', 'a 12:1 oversquare V6']) {
      const na = peakHp(playerEngine(ENGINES[name]).pull(100));
      const t = playerEngine(ENGINES[name], TURBO);
      tuneFromTheAdvice(t);
      expect(peakHp(t.pull(100)), name).toBeGreaterThan(na * 1.12);
    }
  });

  it('says so when one turbine is too small for the engine, rather than quietly making less', () => {
    const t = playerEngine(ENGINES['a big-bore 6.25 L V8'], TURBO);
    tuneFromTheAdvice(t);
    expect(t.pull(100).events.map((e) => e.type)).toContain('backpressure');
  });
});
