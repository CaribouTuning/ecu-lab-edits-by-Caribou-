/**
 * The base start-up map: offered once a factory engine has parts changed, loaded only when
 * the player asks, and written for the parts on the bench.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { baseMapAction, changedParts, offersBaseMap, originPreset } from '../src/ui/state/baseMap.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';

const vq = () => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('vq35de-revup')) });
const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });

describe('where an engine came from', () => {
  it('stays a modified factory engine after its parts change, not the player\'s own', () => {
    let s = vq();
    expect(changedParts(s.build, originPreset(s.build)).size).toBe(0);
    s = set(set(s, 'turboOn', true), 'boostCurve', s.build.boostCurve.map(() => 8));
    expect(s.build.presetId).toBeNull();
    expect(originPreset(s.build)?.id).toBe('vq35de-revup');
    expect([...changedParts(s.build, originPreset(s.build))]).toEqual(['induction']);
  });

  it('counts boost raised on a factory turbo as a change', () => {
    let s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('n54')) });
    expect(offersBaseMap(s.build)).toBe(false);
    s = set(s, 'boostCurve', s.build.boostCurve.map((b) => b + 3));
    expect(offersBaseMap(s.build)).toBe(true);
  });
});

describe('the base start-up map', () => {
  it('is offered for a modified factory engine only, and a build change never loads it', () => {
    const stock = vq();
    expect(offersBaseMap(stock.build)).toBe(false);
    const turbo = set(set(stock, 'turboOn', true), 'boostCurve', stock.build.boostCurve.map(() => 8));
    expect(offersBaseMap(turbo.build)).toBe(true);
    // The build change filled nothing in. In SANDBOX the axes extend for the boost, but the
    // engine reads the same timing everywhere it ran before, and the new boost rows only
    // carry the edge, marked not tuned.
    const was = S.layoutById(stock.tune.layout).timing;
    const now = S.layoutById(turbo.tune.layout).timing;
    for (const rpm of [1000, 3000, 5000, 6500]) {
      for (const kpa of [40, 70, 100, 140]) {
        expect(S.readTable(turbo.tune.timing, now, rpm, kpa)).toBeCloseTo(S.readTable(stock.tune.timing, was, rpm, kpa), 0);
      }
    }
    expect(turbo.tune.untuned.timing.length).toBeGreaterThan(0);
  });

  it('is written for the parts fitted, boost cells and all, and undoes back to the player\'s tables', () => {
    const before = set(set(vq(), 'turboOn', true), 'boostCurve', vq().build.boostCurve.map(() => 8));
    const s = reducer(before, baseMapAction(before.build));
    const L = S.layoutById(s.tune.layout).timing;
    expect(L.load[0]).toBeGreaterThan(150);
    // Under boost the base map runs less timing than at full throttle without it.
    const ci = L.rpm.findIndex((r) => r >= 4000);
    expect(s.tune.timing[0][ci]).toBeLessThan(s.tune.timing[L.load.findIndex((l) => l <= 100)][ci]);
    // The parts stay; only the calibration is the base map's.
    expect(s.build.turboOn).toBe(true);
    expect(s.tune.untuned).toBeNull();
    const undone = reducer(s, { type: ACTIONS.UNDO });
    expect(undone.tune.timing).toBe(before.tune.timing);
  });
});
