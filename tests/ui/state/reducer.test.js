/**
 * Reducer tests — pure, no DOM.
 *
 * The reducer exists so that operations spanning several slices happen in ONE pass.
 * EcuLab's applyEnginePreset makes 21 sequential setState calls and its own comment
 * warns the order matters; resetToStock documents that "the last call pins tablesDirty
 * back to false". Those hazards are what this file exists to make impossible.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_AFR, DEFAULT_MODS, DEFAULT_TIMING } from '../../../src/sim/index.js';
import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../../../src/ui/state/reducer.js';

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
