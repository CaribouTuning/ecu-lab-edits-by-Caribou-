/**
 * Reducer tests — pure, no DOM.
 *
 * The reducer exists so that operations spanning several slices happen in ONE pass.
 * EcuLab's applyEnginePreset makes 23 sequential setState calls and its own comment
 * warns the order matters; resetToStock documents that "the last call pins tablesDirty
 * back to false". Those hazards are what this file exists to make impossible.
 */

import { describe, expect, it } from 'vitest';

import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../../../src/ui/state/reducer.js';

describe('makeInitialState', () => {
  it('returns the three slices', () => {
    const s = makeInitialState();
    expect(Object.keys(s).sort()).toEqual(['build', 'session', 'tune']);
  });

  it('starts with no preset loaded and clean tables', () => {
    const s = makeInitialState();
    expect(s.build.presetId).toBeNull();
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('returns a fresh object each call, not a shared reference', () => {
    // A shared initial state would let one test's mutation leak into the next, and
    // one player's reset leak into their next build.
    const a = makeInitialState();
    const b = makeInitialState();
    expect(a).not.toBe(b);
    expect(a.tune.ve).not.toBe(b.tune.ve);
  });
});

describe('SET_BUILD_FIELD', () => {
  it('sets the field', () => {
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.build.turboOn).toBe(true);
  });

  it('clears the preset label, because a hand edit is no longer that preset', () => {
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.build.presetId).toBeNull();
  });

  it('does not flag the calibration tables as dirty', () => {
    // Hardware edits invalidate the preset LABEL only. tablesDirty means unsaved
    // player work on the calibration, and is what the overwrite prompt keys off.
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('leaves the other slices untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(after.session).toBe(before.session);
  });
});

describe('SET_TURBINE', () => {
  it('fits one of the chosen housing, because a twin-turbo count belongs to a preset', () => {
    const twin = { ...makeInitialState() };
    twin.build = { ...twin.build, turbineIdx: 2, turbineCount: 2 };
    const s = reducer(twin, { type: ACTIONS.SET_TURBINE, value: 1 });
    expect(s.build.turbineIdx).toBe(1);
    expect(s.build.turbineCount).toBe(1);
  });
});

describe('SET_TABLE', () => {
  it('sets the table', () => {
    const next = [[1, 2], [3, 4]];
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_TABLE, table: 'timing', value: next,
    });
    expect(s.tune.timing).toBe(next);
  });

  it('clears the preset AND flags the tables dirty, in one pass', () => {
    // This is the cross-slice write that three independent contexts could not express
    // atomically: a table edit invalidates a BUILD field and a TUNE field together.
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, {
      type: ACTIONS.SET_TABLE, table: 'timing', value: [[1]],
    });
    expect(s.build.presetId).toBeNull();
    expect(s.tune.tablesDirty).toBe(true);
  });
});

describe('unknown actions', () => {
  it('returns the same state object, so React skips the re-render', () => {
    const before = makeInitialState();
    expect(reducer(before, { type: 'NOT_A_REAL_ACTION' })).toBe(before);
  });
});

// The two cases below are not in the plan's verbatim test listing, but SET_SESSION_FIELD
// and SET_TUNE_FIELD are both part of the "implement at minimum" set for this task and
// need their own coverage — a test suite that only exercises three of five action types
// would not catch a broken fourth.
describe('SET_SESSION_FIELD', () => {
  it('sets the field', () => {
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_SESSION_FIELD, field: 'running', value: true,
    });
    expect(s.session.running).toBe(true);
  });

  it('leaves build and tune untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.SET_SESSION_FIELD, field: 'running', value: true,
    });
    expect(after.build).toBe(before.build);
    expect(after.tune).toBe(before.tune);
  });
});

describe('SET_TUNE_FIELD', () => {
  it('sets the field', () => {
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: { type: 'cell', row: 1, col: 2 },
    });
    expect(s.tune.selection).toEqual({ type: 'cell', row: 1, col: 2 });
  });

  it('does NOT clear the preset or flag the tables dirty', () => {
    // Unlike SET_TABLE, a plain tune-slice write (e.g. changing which cell is
    // selected) is not a calibration edit and must not invalidate anything.
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, {
      type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: { type: 'row', row: 0 },
    });
    expect(s.build.presetId).toBe('n54');
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('leaves the other slices untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: null,
    });
    expect(after.build).toBe(before.build);
    expect(after.session).toBe(before.session);
  });
});
