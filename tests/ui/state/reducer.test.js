/**
 * Reducer tests — pure, no DOM.
 *
 * The reducer exists so that operations spanning several slices happen in ONE pass.
 * EcuLab's applyEnginePreset makes 21 sequential setState calls and its own comment
 * warns the order matters; resetToStock documents that "the last call pins tablesDirty
 * back to false". Those hazards are what this file exists to make impossible.
 */

import { describe, expect, it } from 'vitest';

import {
  clone2D, COMPRESSOR_OPTS, computeHardwareVE, DEFAULT_AFR, DEFAULT_BOOST,
  DEFAULT_ENGINE_CONFIG, DEFAULT_MODS, DEFAULT_TIMING, deriveEngine, INJECTOR_OPTS,
  OCTANE_OPTS,
} from '../../../src/sim/index.js';
import { applyPreset, ENGINE_PRESETS } from '../../../src/sim/presets.js';
import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../../../src/ui/state/reducer.js';

/**
 * A state where EVERY field of EVERY slice holds a value no real APPLY_PRESET write
 * could ever produce: a string built from the field's own `slice.field` name. The
 * field list comes from `makeInitialState()`'s own output keys, not a hand-maintained
 * list, so a field added to a slice in a later PR is swept automatically.
 *
 * Because each sentinel is a fresh string unique to its own field, no real preset
 * value — a number, an array, a plain object, `null`, a boolean, ANY type the 21 real
 * writes use — can ever equal it. That makes a single strict `!==` check exact for
 * "did the reducer touch this field", for every field type in play, with no deep-
 * equality helper needed: the starting value is never deep-equal to a real written
 * value by construction, and a field the reducer does not touch keeps the identical
 * string reference through the object spread, so `!==` cannot false-positive either.
 * @returns {any} an object shaped like StoreState, but not typed as one — every field
 *   deliberately holds a sentinel string instead of a value of its real type.
 */
function makeSentinelState() {
  const init = makeInitialState();
  const state = /** @type {any} */ ({});
  for (const slice of Object.keys(init)) {
    // `history` is structural, not scalar: the reducer spreads `past`, and
    // `[...'SENTINEL::history.past']` would silently become 24 single characters.
    // A real empty stack still starts unequal to anything a write produces, which is
    // all `changedFieldKeys` needs.
    if (slice === 'history') {
      state[slice] = { past: [], future: [] };
      continue;
    }
    const sliceState = /** @type {any} */ ({});
    for (const field of Object.keys(/** @type {any} */ (init)[slice])) {
      sliceState[field] = `SENTINEL::${slice}.${field}`;
    }
    state[slice] = sliceState;
  }
  return state;
}

/**
 * The `slice.field` keys whose value differs between two sentinel-seeded state trees,
 * via strict `!==`. See {@link makeSentinelState} for why reference/value inequality
 * alone is exact here for every field type.
 * @param {any} before
 * @param {any} after
 * @returns {Set<string>}
 */
function changedFieldKeys(before, after) {
  const changed = new Set();
  for (const slice of Object.keys(before)) {
    for (const field of Object.keys(before[slice])) {
      if (before[slice][field] !== after[slice][field]) {
        changed.add(`${slice}.${field}`);
      }
    }
  }
  return changed;
}

/**
 * A complete, real engineConfig (BMW N54 figures — src/sim/presets.js) so this file's
 * APPLY_PRESET fixtures typecheck as a genuine EngineConfig, not just a configuration
 * stub. Declared with an explicit type annotation below (not an "as" cast) so
 * `configuration` narrows to the engine-layout literal union instead of widening to
 * plain string.
 * @type {import('../../../src/sim/index.js').EngineConfig}
 */
const N54_ENGINE_CONFIG = {
  configuration: 'I6', bore: 84.0, stroke: 89.6, compression: 10.2,
  blockMaterial: 'Aluminum', headMaterial: 'Aluminum',
};

/** Shared APPLY_PRESET fixture: every field the action's `preset` payload carries. */
const N54_PRESET = {
  presetId: 'n54', engineConfig: N54_ENGINE_CONFIG,
  mods: { intake: false, exhaust: false, headers: false, intercooler: true },
  turboOn: true, boostCurve: [8, 8, 8, 8, 8, 8, 8, 8], turbineIdx: 1,
  turbineCount: 2, compressorIdx: 1, injIdx: 2, ecuInjectorCc: 440,
  octaneIdx: 1, exhaustDiaIdx: 2, ve: [[80]], timing: [[20]], afr: [[12]],
};

describe('makeInitialState', () => {
  it('returns the four slices', () => {
    const s = makeInitialState();
    expect(Object.keys(s).sort()).toEqual(['build', 'history', 'session', 'tune']);
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

describe('CLEAR_PRESET_ID', () => {
  it('clears the preset label', () => {
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.CLEAR_PRESET_ID });
    expect(s.build.presetId).toBeNull();
  });

  it('does not flag the calibration tables as dirty', () => {
    // Unlike SET_TABLE, choosing "Custom build" is not itself a calibration edit.
    const s = reducer(makeInitialState(), { type: ACTIONS.CLEAR_PRESET_ID });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('touches ONLY presetId — a value the action cannot even carry proves the point', () => {
    // The bug this action exists to fix: the old call site dispatched
    // `{type: SET_BUILD_FIELD, field: 'presetId', value: null}`, which only worked
    // because the reducer's OWN trailing `presetId: null` clobbered whatever value the
    // action carried — so a hypothetical caller passing a non-null value would have
    // silently gotten null back anyway. CLEAR_PRESET_ID has no `value` field in its
    // shape at all, so there is no payload for a future caller to get wrong here; this
    // test instead pins that every OTHER build field survives the dispatch untouched,
    // which is the property SET_BUILD_FIELD could never have offered (it invalidates
    // every write, by design).
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54', turboOn: true, mafScalar: 0.9 };
    const s = reducer(loaded, { type: ACTIONS.CLEAR_PRESET_ID });
    expect(s.build.presetId).toBeNull();
    expect(s.build.turboOn).toBe(true);
    expect(s.build.mafScalar).toBe(0.9);
  });

  it('leaves the other slices untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.CLEAR_PRESET_ID });
    expect(after.tune).toBe(before.tune);
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
    // Deliberately outside the known-action union (see the StoreAction JSDoc in
    // reducer.js) — this test exercises the default branch's fallback for an action
    // shape the reducer does not recognize, so the cast is intentional, not a leak of
    // the removed catch-all.
    const bogus = /** @type {any} */ ({ type: 'NOT_A_REAL_ACTION' });
    expect(reducer(before, bogus)).toBe(before);
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

describe('every write produces a fresh slice reference', () => {
  it('SET_SESSION_FIELD replaces the changed slice rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.SET_SESSION_FIELD, field: 'pullCount', value: 3 });
    expect(after.session).not.toBe(before.session);
    expect(before.session.pullCount).toBe(0); // the input state is untouched
  });

  it('SET_BUILD_FIELD replaces the changed slice rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true });
    expect(after.build).not.toBe(before.build);
    expect(before.build.turboOn).toBe(false); // the input state is untouched
  });

  it('SET_TUNE_FIELD replaces the changed slice rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: { type: 'cell', row: 0, col: 0 },
    });
    expect(after.tune).not.toBe(before.tune);
    expect(before.tune.selection).toBeNull(); // the input state is untouched
  });

  // Finding 7: the tests above only ever assert `toBe` on slices an action LEAVES
  // ALONE — the inverse property. None of the cross-cutting actions asserted a fresh
  // reference for the slice(s) they actually WRITE, so an action that mutated a slice
  // in place instead of replacing it would pass every existing test here.
  it('APPLY_PRESET replaces build, tune AND session rather than mutating them', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(after.build).not.toBe(before.build);
    expect(after.tune).not.toBe(before.tune);
    expect(after.session).not.toBe(before.session);
  });

  it('RESET_TO_STOCK replaces build and tune rather than mutating them', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(after.build).not.toBe(before.build);
    expect(after.tune).not.toBe(before.tune);
  });

  it('REPAIR_ENGINE replaces session rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.REPAIR_ENGINE });
    expect(after.session).not.toBe(before.session);
  });

  it('BANK_PULL replaces session rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.BANK_PULL,
      result: { peakHp: 410, wear: { piston: 3, bearing: 2, valve: 1 } },
      pullScore: 50,
    });
    expect(after.session).not.toBe(before.session);
  });
});

describe('non-invalidating build writes', () => {
  it('moving the boost-curve cursor does not disown the preset', () => {
    const loaded = makeInitialState();
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.SET_BOOST_SEL, value: 6 });
    expect(s.build.boostSel).toBe(6);
    expect(s.build.presetId).toBe('n54');
  });

  it('opening the overwrite prompt does not disown the preset', () => {
    const loaded = makeInitialState();
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.SET_PRESET_PROMPT, value: { presetId: 'k20' } });
    expect(s.build.presetPrompt).toEqual({ presetId: 'k20' });
    expect(s.build.presetId).toBe('n54');
  });
});

describe('SET_ENGINE_CONFIG_PATCH', () => {
  it('patching the engine config merges and invalidates', () => {
    const loaded = makeInitialState();
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { compression: 11.5 } });
    expect(s.build.engineConfig.compression).toBe(11.5);
    expect(s.build.presetId).toBeNull();
  });

  it('preserves the config fields the patch does not mention', () => {
    // A patch that REPLACES rather than merges would silently drop bore, stroke and
    // every other untouched field — the app would still render, just wrongly.
    const loaded = makeInitialState();
    const before = loaded.build.engineConfig;
    const s = reducer(loaded, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { compression: 11.5 } });
    const after = s.build.engineConfig;
    expect(after.bore).toBe(before.bore);
    expect(after.stroke).toBe(before.stroke);
    expect(after.configuration).toBe(before.configuration);
    expect(after.redline).toBe(before.redline);
  });
});

describe('APPLY_PRESET', () => {
  const preset = N54_PRESET;

  // Finding 1: every field the preset carries must land in the RIGHT slice. Deleting
  // any one of these from the reducer's APPLY_PRESET case must fail this test by
  // naming the missing field — that is the point of iterating rather than spot-
  // checking a handful of fields. The key-set assertion at the end means a 22nd field
  // added to the fixture without a matching map entry fails LOUDLY too, so this table
  // cannot silently drift out of date the way the hand-picked assertions above did.
  const presetFieldSlice = {
    presetId: 'build',
    engineConfig: 'build',
    mods: 'build',
    turboOn: 'build',
    boostCurve: 'build',
    turbineIdx: 'build',
    turbineCount: 'build',
    compressorIdx: 'build',
    injIdx: 'build',
    ecuInjectorCc: 'build',
    octaneIdx: 'build',
    exhaustDiaIdx: 'build',
    ve: 'tune',
    timing: 'tune',
    afr: 'tune',
  };

  it('maps every fixture field to a slice — the map cannot drift out of date', () => {
    expect(Object.keys(presetFieldSlice).sort()).toEqual(Object.keys(preset).sort());
  });

  it.each(Object.entries(presetFieldSlice))(
    'lands preset field %s in the %s slice',
    (field, slice) => {
      const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
      expect(s[slice][field]).toEqual(preset[field]);
    },
  );

  it('ends with the preset LOADED, not invalidated', () => {
    // The ordering hazard this whole design removes: applying a preset writes the same
    // fields a hand edit would, and a hand edit clears presetId. Done as 21 separate
    // setState calls that is order-dependent; done as one action it cannot race.
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.presetId).toBe('n54');
  });

  it('loads the preset\'s own calibration, not a recomputed one', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.tune.timing).toEqual([[20]]);
  });

  it('leaves the tables clean — a freshly loaded preset is not unsaved work', () => {
    const dirty = { ...makeInitialState() };
    dirty.tune = { ...dirty.tune, tablesDirty: true };
    const s = reducer(dirty, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('clears the previous run, which measured a different engine', () => {
    const ran = { ...makeInitialState() };
    ran.session = { ...ran.session, result: { peakHp: 400 }, prevResult: { peakHp: 380 } };
    const s = reducer(ran, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.session.result).toBeNull();
    expect(s.session.prevResult).toBeNull();
  });

  it('carries the twin-turbo count a preset owns', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.turbineCount).toBe(2);
  });

  it('clears any pending overwrite prompt and cell selection', () => {
    // Finding 2: makeInitialState() already starts with both fields null, so
    // dispatching against a bare initial state proves nothing — the reducer could
    // drop these two writes entirely and this would still pass. Seed non-null
    // starting values so the assertions below have something to actually clear.
    const seeded = { ...makeInitialState() };
    seeded.build = { ...seeded.build, presetPrompt: { id: 'k20' } };
    seeded.tune = { ...seeded.tune, selection: { type: 'cell', row: 0, col: 0 } };
    const s = reducer(seeded, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.presetPrompt).toBeNull();
    expect(s.tune.selection).toBeNull();
  });

  it('pins the MAF scalar back to neutral, because the preset\'s AFR already bakes in its own correction', () => {
    const dragged = { ...makeInitialState() };
    dragged.build = { ...dragged.build, mafScalar: 0.8 };
    const s = reducer(dragged, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.mafScalar).toBe(1.0);
  });
});

describe('APPLY_PRESET — exact write surface (catches drift in both directions)', () => {
  // Round 1 found 14/21 fields deletable with the suite green; round 2's hardcoded
  // `boostSel: 3` sailed through the table-driven fix at 65/65. Both survived because
  // the old test only compared a hand-built map against the local fixture's own key
  // set — never against what the reducer actually writes. This test instead seeds
  // EVERY field of EVERY slice with a sentinel a real write can never produce, dispatches
  // for real, and asserts the walked set of changed fields against the 21-field
  // contract this action documents: a stray write grows the changed set past 21, a
  // dropped write shrinks it below 21, and the failure message names the field either
  // way.
  it('changes exactly the 21 documented fields, plus the two history fields', () => {
    const before = makeSentinelState();
    const after = reducer(before, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    const changed = changedFieldKeys(before, after);

    const expected = [
      'build.engineConfig', 'build.mods', 'build.turboOn', 'build.boostCurve',
      'build.turbineIdx', 'build.turbineCount', 'build.compressorIdx', 'build.injIdx',
      'build.ecuInjectorCc', 'build.octaneIdx', 'build.exhaustDiaIdx', 'build.mafScalar',
      'build.presetId', 'build.presetPrompt',
      'tune.ve', 'tune.timing', 'tune.afr', 'tune.tablesDirty', 'tune.selection',
      'session.result', 'session.prevResult',
      // APPLY_PRESET is undoable, so it records a snapshot in the same pass. These two
      // belong in the exact-write-surface contract like any other field it touches.
      'history.past', 'history.future',
    ];

    expect([...changed].sort()).toEqual([...expected].sort());
  });
});

describe('APPLY_PRESET — payload contract stays in sync with sim/presets.js', () => {
  // The 15 payload-carried fields must be read from applyPreset()'s REAL return value,
  // not the local fixture: if presets.js grows a 16th field tomorrow and the reducer
  // is not updated to copy it into the store, nothing before this test would notice —
  // the fixture and the map would happily agree with each other while both silently
  // ignore the new field.
  it('copies every key the real applyPreset() returns into the store', () => {
    const rawPreset = ENGINE_PRESETS[0];
    const payload = applyPreset(rawPreset);
    const payloadKeys = Object.keys(payload);
    // Sanity: fail loudly (not with a vacuous pass) if applyPreset()'s shape ever
    // collapses to nothing.
    expect(payloadKeys.length).toBeGreaterThan(0);

    const before = makeSentinelState();
    const after = reducer(before, {
      type: ACTIONS.APPLY_PRESET, preset: /** @type {any} */ (payload),
    });

    // A key is "copied" if it landed, BY THE SAME NAME, in whichever slice actually
    // received it — we don't hardcode which slice each key belongs to, we just look
    // for the exact value applyPreset() produced. Starting from an all-sentinel state
    // means there is no way for this to pass by coincidence: a field the reducer
    // doesn't copy is still sitting at its sentinel, which can never equal a real
    // payload value.
    const missing = payloadKeys.filter((key) => (
      after.build[key] !== /** @type {any} */ (payload)[key]
      && after.tune[key] !== /** @type {any} */ (payload)[key]
    ));

    expect(missing).toEqual([]);
  });
});

describe('RESET_TO_STOCK', () => {
  it('clears the preset label, because a reset is not that preset\'s calibration', () => {
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.build.presetId).toBeNull();
  });

  it('ends with the tables CLEAN — a reset baseline is not unsaved player work', () => {
    // The old code achieved this by ordering setTablesDirty(false) last, after three
    // invalidating setters that each set it true. As one action there is no order to get
    // wrong.
    const dirty = { ...makeInitialState() };
    dirty.tune = { ...dirty.tune, tablesDirty: true };
    const s = reducer(dirty, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('uses the caller-supplied VE rather than recomputing one', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.tune.ve).toEqual([[70]]);
  });

  it('strips mods and MAF trim back to stock', () => {
    const modded = { ...makeInitialState() };
    modded.build = { ...modded.build, mods: { intake: true, exhaust: true, headers: false, intercooler: false }, mafScalar: 0.85 };
    const s = reducer(modded, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.build.mods).toEqual({ intake: false, exhaust: false, headers: false, intercooler: false });
    expect(s.build.mafScalar).toBe(1.0);
  });

  it('leaves session untouched by reference — a reset is not a dyno result', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(after.session).toBe(before.session);
  });

  // Finding 3: DEFAULT_TIMING/DEFAULT_AFR are NOT Object.freeze'd (unlike DEFAULT_MODS
  // and DEFAULT_ENGINE_CONFIG — see src/sim/tables.js). clone2D is load-bearing here:
  // handing back the module-level constant directly would let any future in-place
  // table edit corrupt the shared default for the rest of the session, and every later
  // reset would then return the already-corrupted table. toEqual alone cannot catch
  // that regression because a bare DEFAULT_TIMING is also toEqual DEFAULT_TIMING.
  it('clones timing and afr rather than returning the shared module-level defaults', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.tune.timing).toEqual(DEFAULT_TIMING);
    expect(s.tune.timing).not.toBe(DEFAULT_TIMING);
    expect(s.tune.afr).toEqual(DEFAULT_AFR);
    expect(s.tune.afr).not.toBe(DEFAULT_AFR);
  });

  // Finding 1's table-driven approach applied here too: the reviewer found that
  // deleting `timing`/`afr` from this case entirely still left the suite green,
  // because no test started from a value that differed from the reset target. Every
  // field below is seeded to a WRONG value first, same fix as Finding 2's
  // presetPrompt/selection seeding — RESET_TO_STOCK does not touch presetPrompt or
  // selection at all (only EcuLab's hand-edit setters do), so there is nothing
  // "equivalent" to clear there; this is the field-coverage analogue instead. One
  // seeded starting state, one assertion per field RESET_TO_STOCK owns — deleting any
  // one of these from the reducer case leaves that field at its seeded WRONG value and
  // fails this test by naming it.
  it('resets every field it owns, starting from values that all differ from the target', () => {
    const dirty = { ...makeInitialState() };
    dirty.build = {
      ...dirty.build,
      mods: { intake: true, exhaust: true, headers: true, intercooler: true },
      mafScalar: 0.7,
      presetId: 'n54',
    };
    dirty.tune = {
      ...dirty.tune,
      ve: [[999]],
      timing: [[999]],
      afr: [[999]],
      tablesDirty: true,
    };
    const s = reducer(dirty, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.build.mods).toEqual(DEFAULT_MODS);
    expect(s.build.mafScalar).toBe(1.0);
    expect(s.build.presetId).toBeNull();
    expect(s.tune.ve).toEqual([[70]]);
    expect(s.tune.timing).toEqual(DEFAULT_TIMING);
    expect(s.tune.afr).toEqual(DEFAULT_AFR);
    expect(s.tune.tablesDirty).toBe(false);
  });
});

describe('REPAIR_ENGINE', () => {
  it('restores every component to full health', () => {
    const worn = { ...makeInitialState() };
    worn.session = { ...worn.session, health: { piston: 40, bearing: 55, valve: 70 } };
    const s = reducer(worn, { type: ACTIONS.REPAIR_ENGINE });
    expect(s.session.health).toEqual({ piston: 100, bearing: 100, valve: 100 });
  });

  it('leaves build and tune untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.REPAIR_ENGINE });
    expect(after.build).toBe(before.build);
    expect(after.tune).toBe(before.tune);
  });
});

describe('LIVE_STEP and LIVE_PATCH', () => {
  // These were the only two actions with no reducer-level tests. `session-store.test.jsx`
  // covers them through the running engine, which is the coverage that matters most, but
  // it cannot express the reference-identity contract precisely — and that contract is
  // the whole reason LIVE_STEP has an early return.

  /** @returns {*} a state whose engine is running, so LIVE_STEP has something to do */
  function running() {
    const s = makeInitialState();
    s.session = { ...s.session, live: { ...s.session.live, running: true, rpm: 900 } };
    return s;
  }

  /**
   * The live config the app feeds the loop, built from the same sim exports EcuLab
   * uses. Assembled from real values rather than stubbed: `liveStep` destructures
   * fourteen fields off it and asserts the boost curve's shape, so a hand-made stub
   * would be testing a shape the app never passes.
   * @returns {*}
   */
  function liveCfg() {
    const cfg = DEFAULT_ENGINE_CONFIG;
    const derived = deriveEngine(cfg);
    const ve = computeHardwareVE(cfg, DEFAULT_MODS);
    return {
      ve, veTruth: ve, timing: clone2D(DEFAULT_TIMING), afr: clone2D(DEFAULT_AFR),
      derived, fuel: OCTANE_OPTS[0], injectorCc: INJECTOR_OPTS[0].cc,
      ecuInjectorCc: INJECTOR_OPTS[0].cc, mods: DEFAULT_MODS, mafScalar: 1.0,
      mafErrorBase: 1.0, turboOn: false, boostCurve: [...DEFAULT_BOOST],
      octaneBonus: 0, turbine: null, compressor: COMPRESSOR_OPTS[0],
      exhaustDiaError: 0,
    };
  }

  const step = {
    type: ACTIONS.LIVE_STEP, dt: 0.05,
    input: { throttle: 0, load: 0 }, cfg: liveCfg(),
  };

  it('returns the IDENTICAL state object when the engine is stopped', () => {
    // Not "an equal object" — the same one. This action arrives 20 times a second for
    // as long as the app is open, engine running or not. Object.is equality is what
    // makes React bail out of the whole StoreProvider subtree; return a fresh object
    // and every one of those ticks re-renders the entire app for nothing.
    const before = makeInitialState();
    expect(reducer(before, step)).toBe(before);
  });

  it('integrates the engine when it is running', () => {
    const before = running();
    const after = reducer(before, step);
    expect(after.session.live).not.toBe(before.session.live);
    expect(after.session.live.elapsed).toBeGreaterThan(before.session.live.elapsed);
  });

  it('leaves build and tune untouched while integrating', () => {
    // The live engine reads the calibration but must never write it.
    const before = running();
    const after = reducer(before, step);
    expect(after.build).toBe(before.build);
    expect(after.tune).toBe(before.tune);
  });

  it('LIVE_PATCH merges rather than replacing', () => {
    // START/STOP were `setLive((p) => ({ ...p, running: X }))`. Carrying a whole new
    // live object instead would rewind every field the patch omits — coolant, trims,
    // knock count — back to whatever the caller happened to capture.
    const before = running();
    const after = reducer(before, { type: ACTIONS.LIVE_PATCH, patch: { running: false } });
    expect(after.session.live.running).toBe(false);
    expect(after.session.live.rpm).toBe(before.session.live.rpm);
    expect(after.session.live.coolantC).toBe(before.session.live.coolantC);
  });

  it('neither action disowns a loaded preset', () => {
    // Running the engine is not a build edit.
    const before = running();
    before.build = { ...before.build, presetId: 'n54' };
    expect(reducer(before, step).build.presetId).toBe('n54');
    expect(reducer(before, { type: ACTIONS.LIVE_PATCH, patch: { running: false } })
      .build.presetId).toBe('n54');
  });
});

describe('BANK_PULL', () => {
  // Mirrors the tail of doRun (EcuLab.jsx:868-896): a completed dyno pull's result
  // rotates into prevResult, the engine wears by the pull's own wear figures, and the
  // career score/pull count advance — all in one pass instead of six ordered setState
  // calls where getting `setPrevResult(result)` before `setResult(r)` backwards would
  // silently corrupt prevResult.
  const result = { peakHp: 410, wear: { piston: 3, bearing: 2, valve: 1 } };

  it('rotates the previous result into prevResult and installs the new one', () => {
    const ran = { ...makeInitialState() };
    ran.session = { ...ran.session, result: { peakHp: 380 } };
    const s = reducer(ran, { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(s.session.prevResult).toEqual({ peakHp: 380 });
    expect(s.session.result).toBe(result);
  });

  it('wears the engine by the pull\'s own wear figures', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(s.session.health).toEqual({ piston: 97, bearing: 98, valve: 99 });
  });

  it('does not wear health below zero', () => {
    const worn = { ...makeInitialState() };
    worn.session = { ...worn.session, health: { piston: 2, bearing: 100, valve: 100 } };
    const s = reducer(worn, { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(s.session.health.piston).toBe(0);
  });

  it('raises bestScore only when the new pull beats it', () => {
    const withBest = { ...makeInitialState() };
    withBest.session = { ...withBest.session, bestScore: 80 };
    const lower = reducer(withBest, { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(lower.session.bestScore).toBe(80);
    const higher = reducer(withBest, { type: ACTIONS.BANK_PULL, result, pullScore: 95 });
    expect(higher.session.bestScore).toBe(95);
  });

  it('accumulates totalScore and increments pullCount', () => {
    const withHistory = { ...makeInitialState() };
    withHistory.session = { ...withHistory.session, totalScore: 100, pullCount: 2 };
    const s = reducer(withHistory, { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(s.session.totalScore).toBe(150);
    expect(s.session.pullCount).toBe(3);
  });

  it('leaves build and tune untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.BANK_PULL, result, pullScore: 50 });
    expect(after.build).toBe(before.build);
    expect(after.tune).toBe(before.tune);
  });
});

describe('UNDO / REDO', () => {
  /** A state with one hand VE edit already applied. */
  const edited = () => reducer(
    makeInitialState(),
    { type: ACTIONS.SET_TABLE, table: 've', value: [[42]] },
  );

  it('records the state BEFORE an edit, not after', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.SET_TABLE, table: 've', value: [[42]] });
    expect(after.history.past).toHaveLength(1);
    expect(after.history.past[0].before.tune.ve).toBe(before.tune.ve);
    expect(after.history.past[0].label).toBe('VE edit');
  });

  it('puts the table back', () => {
    const start = makeInitialState();
    const s = reducer(edited(), { type: ACTIONS.UNDO });
    // Deep equality, not `toBe`: `start` and `edited()` each call `makeInitialState()`
    // independently, and its own file header documents that every call returns "a
    // fresh object graph" — `computeHardwareVE` recomputes `ve` from scratch each time,
    // so two independently-built initial states are never the SAME array, only an
    // equal one. Reference equality is guaranteed only against the exact snapshot
    // `edited()` itself recorded, which `start` is not.
    expect(s.tune.ve).toEqual(start.tune.ve);
    expect(s.history.past).toHaveLength(0);
    expect(s.history.future).toHaveLength(1);
  });

  it('restores tablesDirty, not just the numbers', () => {
    // A history that carried only the table would leave the player's unsaved-work flag
    // stuck true after undoing their only edit.
    expect(edited().tune.tablesDirty).toBe(true);
    expect(reducer(edited(), { type: ACTIONS.UNDO }).tune.tablesDirty).toBe(false);
  });

  it('restores presetId, because SET_TABLE cleared it', () => {
    // The reason the snapshot is a projection of BOTH slices. SET_TABLE clears
    // presetId in the same pass it writes the table; undo has to put the label back or
    // the header goes on disowning a preset the player never actually left.
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const dirty = reducer(loaded, { type: ACTIONS.SET_TABLE, table: 'timing', value: [[9]] });
    expect(dirty.build.presetId).toBeNull();
    expect(reducer(dirty, { type: ACTIONS.UNDO }).build.presetId).toBe('n54');
  });

  it('restores the build fields APPLY_PRESET overwrote', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(after.build.turboOn).toBe(true);
    const undone = reducer(after, { type: ACTIONS.UNDO });
    expect(undone.build.turboOn).toBe(false);
    expect(undone.build.engineConfig).toBe(before.build.engineConfig);
    expect(undone.build.presetId).toBeNull();
  });

  it('labels a preset load with the preset name', () => {
    const after = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(after.history.past[0].label).toBe('Preset · BMW N54');
  });

  it('labels a reset', () => {
    const after = reducer(makeInitialState(), { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(after.history.past[0].label).toBe('Reset to stock');
  });

  it('redo puts the edit back', () => {
    const undone = reducer(edited(), { type: ACTIONS.UNDO });
    const redone = reducer(undone, { type: ACTIONS.REDO });
    expect(redone.tune.ve).toEqual([[42]]);
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    // Otherwise redo would jump the player onto a branch they had already left.
    const undone = reducer(edited(), { type: ACTIONS.UNDO });
    expect(undone.history.future).toHaveLength(1);
    const branched = reducer(undone, { type: ACTIONS.SET_TABLE, table: 've', value: [[7]] });
    expect(branched.history.future).toHaveLength(0);
  });

  it('caps the stack at 50 and drops the OLDEST entry', () => {
    let s = makeInitialState();
    for (let i = 0; i < 60; i += 1) {
      s = reducer(s, { type: ACTIONS.SET_TABLE, table: 've', value: [[i]] });
    }
    expect(s.history.past).toHaveLength(50);
    // Entry 0 must be the snapshot taken before edit #10 — i.e. holding edit #9's
    // value. Asserting the LENGTH alone would pass just as well for a cap that
    // discarded the newest entries, which is the opposite of what undo needs.
    expect(s.history.past[0].before.tune.ve).toEqual([[9]]);
  });

  it('undo and redo on an empty stack return the SAME object', () => {
    // Reference equality, not deep equality: React's useReducer bails out of the
    // re-render only when the reducer returns the identical object.
    const s = makeInitialState();
    expect(reducer(s, { type: ACTIONS.UNDO })).toBe(s);
    expect(reducer(s, { type: ACTIONS.REDO })).toBe(s);
  });

  it('does not record actions that are not undoable', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true });
    expect(s.history.past).toHaveLength(0);
  });

  it('does not restore dyno results', () => {
    // A deliberate asymmetry, spec'd: undo brings back hardware and calibration, but
    // re-showing a banked score beside a build that was just reverted would state
    // something false.
    const withResult = { ...makeInitialState() };
    withResult.session = { ...withResult.session, result: { peakHp: 400 } };
    const loaded = reducer(withResult, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(loaded.session.result).toBeNull();
    expect(reducer(loaded, { type: ACTIONS.UNDO }).session.result).toBeNull();
  });
});
