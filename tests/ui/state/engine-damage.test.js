/**
 * Engine damage through the store: the live engine's wear comes off the health in the
 * same step that caused it, a part at zero is a failed engine the reducer will not run,
 * and a rebuild brings it back.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../../../src/sim/index.js';
import { ACTIONS, reducer } from '../../../src/ui/state/reducer.js';
import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { makeEngine } from '../../ecuHarness.js';

const eng = makeEngine();

/**
 * Steps the store's live engine the way the app's 20 Hz loop does.
 * @param {any} state @param {number} n steps
 * @param {{throttle?: number, oilHealth?: number}} [opts]
 */
function step(state, n, { throttle = 0, oilHealth } = {}) {
  const cfg = eng.liveCfg();
  if (oilHealth != null) cfg.ecu = { ...cfg.ecu, cond: { ...cfg.ecu.cond, oilHealth } };
  let s = state;
  for (let i = 0; i < n; i++) s = reducer(s, { type: ACTIONS.LIVE_STEP, dt: 0.05, input: { throttle, load: 0 }, cfg });
  return s;
}

const withLive = (state, live) => ({ ...state, session: { ...state.session, live } });
const cranking = () => ({ ...S.makeLiveState(), cranking: true, coolantC: 85, oilC: 85 });

describe('engine damage in the store', () => {
  it('takes what the live engine wore off the health, as it runs', () => {
    let s = step(withLive(makeInitialState(), cranking()), 80);
    expect(s.session.live.running).toBe(true);
    const before = s.session.health.bearing;
    // A dead oil pump: the bearings run dry.
    s = step(s, 20, { throttle: 20, oilHealth: 0 });
    expect(s.session.health.bearing).toBeLessThan(before);
  });

  it('a failed engine does not start, and a rebuild lets it', () => {
    const blown = { ...makeInitialState(), session: { ...makeInitialState().session, health: { piston: 100, bearing: 0, valve: 100 } } };
    let s = step(withLive(blown, cranking()), 20);
    expect(s.session.live.running).toBe(false);
    expect(s.session.live.failure?.part).toBe('bearing');
    s = reducer(s, { type: ACTIONS.REPAIR_ENGINE });
    s = step(withLive(s, { ...s.session.live, cranking: true }), 80);
    expect(s.session.live.running).toBe(true);
    expect(s.session.live.failure).toBeNull();
  });

  it('a pull that fails the engine leaves the failed part at zero', () => {
    const state = makeInitialState();
    const result = { wear: { piston: 0, bearing: 3, valve: 0 }, failure: { part: 'bearing' }, points: [] };
    const low = { ...state, session: { ...state.session, health: { piston: 90, bearing: 2, valve: 95 } } };
    const s = reducer(low, { type: ACTIONS.BANK_PULL, result, pullScore: 0, run: null, scores: { tuning: {}, engineer: {}, signature: '' } });
    expect(s.session.health.bearing).toBe(0);
    expect(S.failedPart(s.session.health)).toBe('bearing');
  });
});
