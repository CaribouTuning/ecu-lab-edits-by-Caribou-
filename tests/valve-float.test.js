/**
 * Valve float in the pull log: a hardware limit with a number to set, and the mixture misses
 * it causes put down to it rather than to the VE table, which cannot follow the cliff in the
 * filling there however it is corrected. A custom V6 floating at 6,690 RPM below a 7,000 RPM
 * redline ran Correct VE from logs round after round and was still told to raise its VE cells.
 */

import { describe, it, expect } from 'vitest';
import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { reducer, ACTIONS } from '../src/ui/state/reducer.js';
import { advice, pull } from './guidedPlayer.js';

/** GM's LS6 on the softest springs the build offers: its valves float well under its redline. */
function soft() {
  const st = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('ls6')) });
  return reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { springRate: 20 } });
}

describe('valve float', { timeout: 120000 }, () => {
  it('gives the spring rate to set, and that rate keeps the valves on the cam past the redline', () => {
    const st = soft();
    const float = pull(st).events.find((e) => e.type === 'float');
    expect(float).toBeTruthy();
    const m = /raise the valve spring rate to (\d+)/.exec(float.fix);
    expect(m).toBeTruthy();
    const rate = Number(m[1]);
    expect(rate).toBeLessThanOrEqual(S.SPRING_RATE_MAX);
    const fixed = reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { springRate: rate } });
    expect(S.deriveEngine(fixed.build.engineConfig).floatRpm).toBeGreaterThan(fixed.build.engineConfig.redline);
    expect(pull(fixed).events.some((e) => e.type === 'float')).toBe(false);
  });

  it('puts the mixture missed where the valves float down to the float, in the log and on FUEL alike', () => {
    const st = soft();
    const p = pull(st);
    const floatRpm = S.deriveEngine(st.build.engineConfig).floatRpm;
    const mixture = p.events.filter((e) => ['missedmix', 'rich', 'lean'].includes(e.type) && e.rpmStart >= floatRpm - 1000);
    expect(mixture.length).toBeGreaterThan(0);
    for (const e of mixture) {
      expect(e.fix).toMatch(/This follows the valve float above \d+ RPM/);
      expect(e.fix).toMatch(/raise the valve spring rate to \d+/);
      expect(e.fix).not.toMatch(/raise the VE cells|lower the VE cells/);
      expect(e.gridBound).toBeFalsy();
    }
    // FUEL reads the same pull the same way: never "settled", never the air estimate.
    const missed = advice(st, p).missedMix.filter((m) => m.rpm >= floatRpm);
    expect(missed.length).toBeGreaterThan(0);
    for (const m of missed) {
      expect(m.cause).toBe('float');
      expect(m.settled).toBeFalsy();
    }
  });

  it('leaves a miss with a cause of its own to that cause, in the log and on FUEL alike', () => {
    // The same floating engine with its injectors changed and the ECU not told: the injector
    // scaling is what to fix first, whatever the springs do.
    const st = reducer(soft(), { type: ACTIONS.SET_BUILD_FIELD, field: 'injIdx', value: S.INJECTOR_OPTS.findIndex((o) => o.cc >= 1000) });
    const p = pull(st);
    expect(p.events.some((e) => e.type === 'injscale')).toBe(true);
    for (const e of p.events.filter((x) => ['missedmix', 'rich', 'lean'].includes(x.type))) {
      expect(e.fix).not.toMatch(/This follows the valve float/);
    }
    for (const m of advice(st, p).missedMix) expect(m.cause).not.toBe('float');
  });

  it('says when no spring the build offers is stiff enough', () => {
    const st = reducer(soft(), { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { camDuration: 300, exhaustCamDuration: 300, redline: 9800 } });
    const float = pull(st).events.find((e) => e.type === 'float');
    expect(float.fix).toMatch(new RegExp(`${S.SPRING_RATE_MAX} is the stiffest`));
    expect(float.fix).not.toMatch(/raise the valve spring rate to/);
  });
});
